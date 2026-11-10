import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { sites, utilisateurs } from "@/db/schema";
import { versCsv } from "@/lib/export-csv";
import type { Acteur } from "@/server/acteur";
import { initialiser } from "@/server/seed";
import { enregistrerPhoto } from "@/server/services/catalogue";
import { affecter, retirerAffectation } from "@/server/services/planning";
import { forcerCloture, ouvrirShift } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";
import { creerUtilisateur } from "@/server/services/utilisateurs";
import { importerVentesShift } from "@/server/services/ventes-loyverse";

/** Cloisonnement entre sites : un manager ou un employé d'un site n'agit pas sur un autre. */
let db: Db;
let dir: Acteur;
let managerA: Acteur;
let employeA: Acteur;
let siteB: string;
let shiftB: string;
let planifieB: string;

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  dir = { id: d.id, nom: d.nom, role: "direction" };
  const s = await db.select().from(sites);
  const siteA = s.find((x) => x.nom === "Browse 2 Mars")!.id;
  siteB = s.find((x) => x.nom === "Browse Sweets 2 Mars")!.id;
  managerA = { id: await creerUtilisateur(db, { nom: "Karim", role: "manager", actif: true, pin: "456789", siteIds: [siteA] }, dir), nom: "Karim", role: "manager" };
  employeA = { id: await creerUtilisateur(db, { nom: "Sara", role: "employe", actif: true, pin: "1234", siteIds: [siteA] }, dir), nom: "Sara", role: "employe" };
  await enregistrerCreneaux(db, siteB, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
  const [cr] = await listerCreneaux(db, siteB);
  shiftB = await affecter(db, { siteId: siteB, journee: "2026-11-16", creneauId: cr.id, responsableId: dir.id, equipierIds: [] }, dir);
  await ouvrirShift(db, shiftB, dir, new Date("2026-11-16T08:00:00Z"));
  planifieB = await affecter(db, { siteId: siteB, journee: "2026-11-17", creneauId: cr.id, responsableId: dir.id, equipierIds: [] }, dir);
});

describe("cloisonnement entre sites", () => {
  it("l'import des ventes d'un autre site est refusé", async () => {
    const f = (async () => Response.json({ receipts: [] })) as unknown as typeof fetch;
    await expect(importerVentesShift(db, shiftB, employeA, new Date(), { jeton: "x", fetch: f })).rejects.toThrow(/rattaché/);
  });

  it("un manager ne force pas la clôture d'un shift d'un autre site", async () => {
    await expect(forcerCloture(db, shiftB, managerA, new Date(), "Shift abandonné")).rejects.toThrow(/rattaché/);
  });

  it("un manager ne retire pas du planning le shift d'un autre site", async () => {
    await expect(retirerAffectation(db, planifieB, managerA)).rejects.toThrow(/rattaché/);
  });
});

describe("comptes et fichiers", () => {
  it("un manager ou la direction doit avoir un PIN de 6 chiffres", async () => {
    await expect(creerUtilisateur(db, { nom: "Nadia", role: "manager", actif: true, pin: "1234", siteIds: [siteB] }, dir)).rejects.toThrow(/6 chiffres/);
  });

  it("l'export neutralise les textes qui seraient exécutés comme formules par Excel", () => {
    const csv = versCsv(["Produit"], [['=HYPERLINK("http://x","clic")'], ["+33 600"], ["Mango Can"]]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(csv).toContain("'+33 600");
    expect(csv).toContain("\r\nMango Can\r\n");
  });

  it("une photo doit être réellement une image du type annoncé", async () => {
    const produit = (await db.query.produits.findFirst())!.id;
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    await expect(enregistrerPhoto(db, produit, html, "image/png", dir)).rejects.toThrow(/pas une image/);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    await enregistrerPhoto(db, produit, png, "image/png", dir);
  });
});

describe("connexion (passe 2)", () => {
  it("limite les échecs par adresse IP sur une heure", async () => {
    const { compterEchecIp, ipBloquee, MAX_ECHECS_IP } = await import("@/server/services/limiteur");
    const t = new Date("2026-11-16T10:00:00Z");
    for (let i = 0; i < MAX_ECHECS_IP; i++) await compterEchecIp(db, "203.0.113.7", t);
    expect(await ipBloquee(db, "203.0.113.7", t)).toBe(true);
    expect(await ipBloquee(db, "198.51.100.1", t)).toBe(false);
    expect(await ipBloquee(db, "203.0.113.7", new Date("2026-11-16T11:01:00Z"))).toBe(false);
    await compterEchecIp(db, "203.0.113.7", new Date("2026-11-16T11:01:00Z")); // nouvelle fenêtre
    expect(await ipBloquee(db, "203.0.113.7", new Date("2026-11-16T11:02:00Z"))).toBe(false);
  });

  it("la direction se connecte par son nom, absente des listes du site", async () => {
    const { idDirectionParNom, utilisateursDuSite, authentifier } = await import("@/server/services/utilisateurs");
    expect(await idDirectionParNom(db, "  direction ")).toBe(dir.id);
    expect(await idDirectionParNom(db, "Karim")).toBeNull(); // un manager n'utilise pas ce chemin
    expect((await utilisateursDuSite(db, siteB, { avecDirection: false })).some((u) => u.role === "direction")).toBe(false);
    const r = await authentifier(db, managerA.id, "456789", new Date());
    expect(r.ok && r.pinFaible).toBe(false);
  });
});

describe("intégrité (passe 2)", () => {
  it("un bon ne part pas vers un site pas encore ouvert", async () => {
    const { creerBon } = await import("@/server/services/livraisons");
    const anfa = (await db.select().from(sites)).find((x) => x.nom === "Anfa")!.id;
    await expect(
      creerBon(db, { shiftId: shiftB, siteDestinationId: anfa, lignes: [{ produitId: (await db.query.produits.findFirst())!.id, quantite: 1, saisie: "parts" }], commentaire: null, expedier: false }, dir, new Date()),
    ).rejects.toThrow(/pas encore ouvert/);
  });

  it("une clôture déjà faite par quelqu'un d'autre est refusée", async () => {
    const { cloturerShift, forcerCloture } = await import("@/server/services/shifts");
    await forcerCloture(db, shiftB, dir, new Date("2026-11-16T20:00:00Z"), "Shift abandonné");
    await expect(cloturerShift(db, shiftB, dir, new Date(), "x")).rejects.toThrow(/clôturé/);
  });
});
