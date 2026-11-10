import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { categories, produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { initialiser } from "@/server/seed";
import { creerProduit, definirStocksMinimum, stocksMinimum } from "@/server/services/catalogue";
import { affecter } from "@/server/services/planning";
import { detailShift, ouvrirShift, saisirQuantite } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

let db: Db;
let direction: Acteur;

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
});

describe("création de produits", () => {
  it("attribue la référence suivante et crée la catégorie si besoin", async () => {
    const [canCakes] = await db.select().from(categories).where(eq(categories.nom, "Desserts en pot (Can)"));
    const id = await creerProduit(db, { nom: "Caramel Can", categorieId: canCakes.id, nouvelleCategorie: null, unite: "piece", partsParGateau: null, format: null, suiviStock: true }, direction);
    const [p] = await db.select().from(produits).where(eq(produits.id, id));
    expect(p.ref).toBe("P074");
    const id2 = await creerProduit(db, { nom: "Croissant", categorieId: null, nouvelleCategorie: "Viennoiseries", unite: "piece", partsParGateau: null, format: null, suiviStock: true }, direction);
    const [p2] = await db.select().from(produits).where(eq(produits.id, id2));
    expect(p2.ref).toBe("P075");
    expect((await db.select().from(categories).where(eq(categories.id, p2.categorieId)))[0].nom).toBe("Viennoiseries");
  });

  it("refuse un doublon de nom et un gâteau sans nombre de parts", async () => {
    await expect(
      creerProduit(db, { nom: "caramel can", categorieId: null, nouvelleCategorie: "X", unite: "piece", partsParGateau: null, format: null, suiviStock: true }, direction),
    ).rejects.toThrow(/existe déjà/);
    await expect(
      creerProduit(db, { nom: "Banana Bread", categorieId: null, nouvelleCategorie: "Cakes", unite: "part", partsParGateau: null, format: null, suiviStock: true }, direction),
    ).rejects.toThrow(/parts/);
  });
});

describe("stock minimum par site et alerte de réapprovisionnement", () => {
  it("déclenche l'alerte au comptage de clôture sous le minimum du site", async () => {
    const [mango] = await db.select().from(produits).where(eq(produits.ref, "P001"));
    const [coffee] = await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars"));
    const [sweet] = await db.select().from(sites).where(eq(sites.nom, "Browse Sweets 2 Mars"));
    await definirStocksMinimum(db, mango.id, [{ siteId: coffee.id, stockMinimum: 6 }, { siteId: sweet.id, stockMinimum: null }], direction);
    const m = await stocksMinimum(db, mango.id);
    expect(m.find((x) => x.siteId === coffee.id)!.stockMinimum).toBe(6);
    expect(m.find((x) => x.siteId === sweet.id)!.stockMinimum).toBeNull();
    await expect(definirStocksMinimum(db, mango.id, [{ siteId: coffee.id, stockMinimum: -1 }], direction)).rejects.toThrow(/invalide/);

    await enregistrerCreneaux(db, coffee.id, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
    const [cr] = await listerCreneaux(db, coffee.id);
    const shiftId = await affecter(db, { siteId: coffee.id, journee: "2026-11-16", creneauId: cr.id, responsableId: direction.id, equipierIds: [] }, direction);
    await ouvrirShift(db, shiftId, direction, new Date("2026-11-16T08:00:00Z"));
    await saisirQuantite(db, shiftId, mango.id, "ouvertureComptee", 10, direction, new Date());
    await saisirQuantite(db, shiftId, mango.id, "stockReelFin", 4, direction, new Date());
    const d = await detailShift(db, shiftId);
    expect(d.lignes.find((l) => l.produitId === mango.id)!.calcul.aReapprovisionner).toBe(true);
    expect(d.synthese.produitsAReapprovisionner).toBe(1);
    // Le nouveau produit fait partie du shift ouvert après sa création.
    expect(d.lignes.some((l) => l.nom === "Caramel Can")).toBe(true);
  });
});
