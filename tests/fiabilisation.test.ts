import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { initialiser } from "@/server/seed";
import { alertesExploitation } from "@/server/services/alertes";
import { definirStocksMinimum } from "@/server/services/catalogue";
import { listerBons } from "@/server/services/livraisons";
import { affecter } from "@/server/services/planning";
import { besoinsReappro, preparerBonReappro } from "@/server/services/reappro";
import { cloturerShift, detailShift, ouvrirShift, saisirQuantite } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

let db: Db;
let dir: Acteur;
let mars: string;
let shift: string;
const ref = async (r: string) => (await db.select().from(produits).where(eq(produits.ref, r)))[0].id;

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  dir = { id: d.id, nom: d.nom, role: "direction" };
  mars = (await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars")))[0].id;
  await enregistrerCreneaux(
    db,
    mars,
    [
      { nom: "Matin", heureDebut: "08:00", heureFin: "15:00", jours: [1, 2, 3, 4, 5, 6, 7] },
      { nom: "Soir", heureDebut: "15:00", heureFin: "22:00", jours: [1, 2, 3, 4, 5, 6, 7] },
    ],
    dir,
  );
  await definirStocksMinimum(db, await ref("P001"), [{ siteId: mars, stockMinimum: 10 }], dir); // Mango Can
  await definirStocksMinimum(db, await ref("P009"), [{ siteId: mars, stockMinimum: 16 }], dir); // Matilda (parts)
  await definirStocksMinimum(db, await ref("P064"), [{ siteId: mars, stockMinimum: 12 }], dir); // boisson
  const [matin] = await listerCreneaux(db, mars);
  shift = await affecter(db, { siteId: mars, journee: "2026-11-16", creneauId: matin.id, responsableId: dir.id, equipierIds: [] }, dir);
  await ouvrirShift(db, shift, dir, new Date("2026-11-16T07:00:00Z"));
  const stocks: Record<string, number> = { P001: 3, P009: 4, P064: 0, P002: 0 };
  for (const l of (await detailShift(db, shift)).lignes.filter((x) => x.suiviStock)) {
    await saisirQuantite(db, shift, l.produitId, "ouvertureComptee", stocks[l.ref] ?? 5, dir, new Date());
    await saisirQuantite(db, shift, l.produitId, "stockReelFin", stocks[l.ref] ?? 5, dir, new Date());
  }
});

describe("contrôles de vraisemblance à la clôture", () => {
  it("un écart important doit être expliqué", async () => {
    const mango = await ref("P001");
    await saisirQuantite(db, shift, mango, "stockReelFin", 0, dir, new Date()); // −3
    await expect(cloturerShift(db, shift, dir, new Date("2026-11-16T14:00:00Z"), null)).rejects.toThrow(/Écart important \(Mango Can \(-3\)/);
    await saisirQuantite(db, shift, mango, "stockReelFin", 3, dir, new Date());
    await cloturerShift(db, shift, dir, new Date("2026-11-16T14:00:00Z"), null);
  });
});

describe("réapprovisionnement", () => {
  it("quantités à fournir : minimum − stock, cakes arrondis au gâteau entier, source labo ou fournisseur", async () => {
    const [b] = await besoinsReappro(db, [mars]);
    const parNom = Object.fromEntries(b.besoins.map((x) => [x.produit, x]));
    expect(parNom["Mango Can"]).toMatchObject({ stock: 3, minimum: 10, aFournir: 7, source: "labo" });
    expect(parNom["Matilda Cake"]).toMatchObject({ stock: 4, minimum: 16, aFournir: 16, source: "labo" });
    expect(parNom["MAYA Passion Ananas Mangue"]).toMatchObject({ aFournir: 12, source: "fournisseur" });
  });

  it("prépare le bon du labo, puis ne compte plus ce qui est en route", async () => {
    const r = await preparerBonReappro(db, mars, dir, new Date("2026-11-16T14:30:00Z"));
    expect(r.lignes).toBe(2);
    const [bon] = await listerBons(db, { siteDestinationId: mars, statuts: ["prepare"] });
    expect(bon.origine).toBe("Laboratoire");
    const [b] = await besoinsReappro(db, [mars]);
    expect(b.besoins.map((x) => x.produit)).toEqual(["MAYA Passion Ananas Mangue"]);
    await expect(preparerBonReappro(db, mars, dir, new Date())).rejects.toThrow(/Aucun produit du laboratoire/);
    await expect(preparerBonReappro(db, mars, { ...dir, role: "employe" }, new Date())).rejects.toThrow(/manager/);
  });
});

describe("alertes d'exploitation", () => {
  it("créneau sans responsable, rupture au dernier comptage", async () => {
    const a = await alertesExploitation(db, [mars], new Date("2026-11-16T14:40:00Z"));
    const types = a.map((x) => x.type);
    expect(types).toContain("non_planifie"); // le Soir du 16 n'est pas planifié
    expect(a.find((x) => x.type === "rupture")?.message).toMatch(/MAYA Passion Ananas Mangue/);
  });

  it("shift ouvert au-delà de sa fin", async () => {
    const [, soir] = await listerCreneaux(db, mars);
    const id = await affecter(db, { siteId: mars, journee: "2026-11-16", creneauId: soir.id, responsableId: dir.id, equipierIds: [] }, dir);
    await ouvrirShift(db, id, dir, new Date("2026-11-16T14:50:00Z"));
    // Fin prévue 22:00 : signalé une fois la tolérance de 30 minutes passée.
    expect((await alertesExploitation(db, [mars], new Date("2026-11-16T22:20:00Z"))).some((x) => x.type === "non_cloture")).toBe(false);
    const a = await alertesExploitation(db, [mars], new Date("2026-11-16T23:00:00Z"));
    expect(a[0]).toMatchObject({ type: "non_cloture", gravite: "haute" });
  });
});
