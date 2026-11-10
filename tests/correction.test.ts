import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { listerJournal } from "@/server/audit";
import { initialiser } from "@/server/seed";
import { listerCanaux } from "@/server/services/caisse";
import { affecter } from "@/server/services/planning";
import { ajouterPerte, cloturerShift, detailShift, ouvrirShift, saisirQuantite, saisirVentes, validerShift } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";
import { creerUtilisateur } from "@/server/services/utilisateurs";

let db: Db;
let direction: Acteur;
let employe: Acteur;
let premier: string;
let second: string;
let mangoId: string;

async function shiftComplet(siteId: string, creneauId: string, journee: string, fin: number) {
  const id = await affecter(db, { siteId, journee, creneauId, responsableId: employe.id, equipierIds: [] }, direction);
  await ouvrirShift(db, id, employe, new Date(`${journee}T08:00:00Z`));
  for (const l of (await detailShift(db, id)).lignes.filter((x) => x.suiviStock)) {
    if (l.ouvertureTheorique === null) await saisirQuantite(db, id, l.produitId, "ouvertureComptee", 10, employe, new Date());
    await saisirQuantite(db, id, l.produitId, "stockReelFin", l.produitId === mangoId ? fin : 10, employe, new Date());
  }
  await cloturerShift(db, id, employe, new Date(`${journee}T20:00:00Z`), "Écart constaté au comptage");
  return id;
}

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
  const [s] = await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars"));
  employe = { id: await creerUtilisateur(db, { nom: "Nadia", role: "employe", actif: true, siteIds: [s.id], pin: "4444" }, direction), nom: "Nadia", role: "employe" };
  mangoId = (await db.select().from(produits).where(eq(produits.ref, "P001")))[0].id;
  await enregistrerCreneaux(db, s.id, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
  const [cr] = await listerCreneaux(db, s.id);
  premier = await shiftComplet(s.id, cr.id, "2026-11-16", 7);
  second = await shiftComplet(s.id, cr.id, "2026-11-17", 7);
});

describe("correction et validation d'un shift clôturé", () => {
  it("refuse la correction à un employé, l'accepte d'un manager et la trace", async () => {
    await expect(saisirQuantite(db, premier, mangoId, "stockReelFin", 9, employe, new Date())).rejects.toThrow(/seul un manager/);
    await saisirQuantite(db, premier, mangoId, "stockReelFin", 9, direction, new Date());
    const j = await listerJournal(db, { entite: "shift", entiteId: premier });
    expect(j[0].j).toMatchObject({ action: "corriger", details: { champ: "stockReelFin", avant: 7, apres: 9 } });
    await expect(saisirQuantite(db, premier, mangoId, "stockReelFin", null, direction, new Date())).rejects.toThrow(/entièrement compté/);
  });

  it("répercute la correction du comptage de fin sur l'ouverture du shift suivant", async () => {
    const d = await detailShift(db, second);
    const l = d.lignes.find((x) => x.produitId === mangoId)!;
    expect(l.ouvertureTheorique).toBe(9);
    expect(l.calcul.ecart).toBe(-2); // 9 → compté 7 sans vente : l'écart apparaît désormais sur le second shift
  });

  it("ne corrige pas un comptage dont le shift suivant est validé, et trace la répercussion", async () => {
    const actions = (await listerJournal(db, { entite: "shift", entiteId: second })).map((x) => x.j.action);
    expect(actions).toContain("corriger"); // répercussion sur l'ouverture du second shift
    await validerShift(db, second, direction, new Date("2026-11-18T08:00:00Z"));
    await expect(saisirQuantite(db, premier, mangoId, "stockReelFin", 6, direction, new Date())).rejects.toThrow(/suivant est déjà validé/);
  });

  it("permet de corriger ventes et pertes, puis verrouille le shift validé", async () => {
    const [surPlace] = await listerCanaux(db);
    await saisirVentes(db, premier, mangoId, surPlace.id, 1, direction, new Date());
    await ajouterPerte(db, premier, { produitId: mangoId, quantite: 1, saisie: "parts", motif: "endommage", commentaire: "oubli" }, direction);
    await expect(validerShift(db, premier, employe, new Date())).rejects.toThrow(/manager/);
    await validerShift(db, premier, direction, new Date("2026-11-18T09:00:00Z"));
    const d = await detailShift(db, premier);
    expect(d.shift.statut).toBe("valide");
    expect(d.shift.validePar).toBe(direction.id);
    await expect(saisirQuantite(db, premier, mangoId, "stockReelFin", 8, direction, new Date())).rejects.toThrow(/validé/);
    await expect(validerShift(db, premier, direction, new Date())).rejects.toThrow(/déjà validé/);
    const actions = (await listerJournal(db, { entite: "shift", entiteId: premier })).map((x) => x.j.action);
    expect(actions.slice(0, 4)).toEqual(["valider", "corriger", "corriger", "corriger"]);
  });
});
