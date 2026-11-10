import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { initialiser } from "@/server/seed";
import { canalSurPlace, listerCanaux } from "@/server/services/caisse";
import { definirStocksMinimum } from "@/server/services/catalogue";
import { affecter } from "@/server/services/planning";
import { ajouterPerte, cloturerShift, detailShift, ouvrirShift, saisirQuantite, saisirVentes } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";
import { evolutionStock, tableauDeBord } from "@/server/services/tableau-de-bord";

let db: Db;
let direction: Acteur;
let siteId: string;

/** Deux journées : Mango Can 10 → vend 3 sur place + 1 Glovo, perd 1 (péremption), compté 4 (écart −1) ; puis 4 → compté 4. */
beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
  const [s] = await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars"));
  siteId = s.id;
  const [mango] = await db.select().from(produits).where(eq(produits.ref, "P001"));
  await db.update(produits).set({ prixVente: 38 }).where(eq(produits.id, mango.id));
  await definirStocksMinimum(db, mango.id, [{ siteId, stockMinimum: 5 }], direction);
  await enregistrerCreneaux(db, siteId, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
  const [cr] = await listerCreneaux(db, siteId);
  const [surPlace, glovo] = await listerCanaux(db);
  for (const [journee, ventesSP, ventesGl, perte, fin] of [
    ["2026-11-16", 3, 1, 1, 4],
    ["2026-11-17", 0, 0, 0, 4],
  ] as const) {
    const id = await affecter(db, { siteId, journee, creneauId: cr.id, responsableId: direction.id, equipierIds: [] }, direction);
    await ouvrirShift(db, id, direction, new Date(`${journee}T08:00:00Z`));
    const det = await detailShift(db, id);
    for (const l of det.lignes.filter((x) => x.suiviStock)) {
      if (l.ouvertureTheorique === null) await saisirQuantite(db, id, l.produitId, "ouvertureComptee", l.produitId === mango.id ? 10 : 0, direction, new Date());
      await saisirQuantite(db, id, l.produitId, "stockReelFin", l.produitId === mango.id ? fin : 0, direction, new Date());
    }
    if (ventesSP) await saisirVentes(db, id, mango.id, surPlace.id, ventesSP, direction, new Date());
    if (ventesGl) await saisirVentes(db, id, mango.id, glovo.id, ventesGl, direction, new Date());
    if (perte) await ajouterPerte(db, id, { produitId: mango.id, quantite: perte, saisie: "parts", motif: "peremption", commentaire: null }, direction);
    await cloturerShift(db, id, direction, new Date(`${journee}T20:00:00Z`), null);
  }
  expect((await canalSurPlace(db)).id).toBe(surPlace.id);
});

describe("tableau de bord", () => {
  it("agrège ventes par canal, pertes, écarts et alertes sur la période", async () => {
    const t = await tableauDeBord(db, { siteIds: [siteId], du: "2026-11-16", au: "2026-11-22" });
    expect(t.kpi.shiftsClos).toBe(2);
    expect(t.kpi.articlesVendus).toBe(4);
    expect(t.kpi.caParCanal.map((c) => [c.canal, c.quantite, c.montant])).toEqual([
      ["Sur place", 3, 114],
      ["Glovo", 1, 38], // pas d'article Glovo : prix de référence
    ]);
    expect(t.kpi.ca).toBe(152);
    expect(t.kpi.pertesPeremption).toBe(1);
    expect(t.ecarts).toEqual([expect.objectContaining({ produit: "Mango Can", quantite: -1, valeur: -38, shifts: 1 })]);
    expect(t.caParJour).toEqual([{ journee: "2026-11-16", parCanal: expect.any(Object) }]);
    expect(t.alertes).toEqual([expect.objectContaining({ produit: "Mango Can", stock: 4, minimum: 5 })]);
  });

  it("donne le stock compté à chaque clôture", async () => {
    const [mango] = await db.select().from(produits).where(eq(produits.ref, "P001"));
    const e = await evolutionStock(db, mango.id, [siteId], "2026-11-16", "2026-11-22");
    expect(e.map((x) => [x.journee, x.stock, x.minimum])).toEqual([
      ["2026-11-16", 4, 5],
      ["2026-11-17", 4, 5],
    ]);
  });

  it("ne renvoie rien hors période ou sans site", async () => {
    expect((await tableauDeBord(db, { siteIds: [siteId], du: "2026-12-01", au: "2026-12-07" })).kpi.shiftsClos).toBe(0);
    expect((await tableauDeBord(db, { siteIds: [], du: "2026-11-16", au: "2026-11-22" })).kpi.shiftsClos).toBe(0);
  });
});
