import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { categories, coutsProduit, mouvements, produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { CATEGORIE_INGREDIENTS, initialiser } from "@/server/seed";
import { appliquerCoutRecette, coutEnVigueur, creerProduit, enregistrerRecette, lireRecette, modifierProduit } from "@/server/services/catalogue";
import { affecter } from "@/server/services/planning";
import { previsionProduction, stockPerime } from "@/server/services/prevision";
import { ajouterEntrees, cloturerShift, detailShift, ouvrirShift, saisirQuantite, saisirVentes } from "@/server/services/shifts";
import { listerCanaux } from "@/server/services/caisse";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

let db: Db;
let dir: Acteur;
let labo: string;
let mars: string;
let farine: string;
let nutella: string;
let matilda: string;
let crepe: string;
const ref = async (r: string) => (await db.select().from(produits).where(eq(produits.ref, r)))[0];

async function shiftDuJour(siteId: string, journee: string) {
  const [cr] = await listerCreneaux(db, siteId);
  const id = await affecter(db, { siteId, journee, creneauId: cr.id, responsableId: dir.id, equipierIds: [] }, dir);
  await ouvrirShift(db, id, dir, new Date(`${journee}T${siteId === labo ? "07" : "12"}:30:00Z`));
  return id;
}

async function toutCompter(id: string, champ: "ouvertureComptee" | "stockReelFin", valeurs: Record<string, number>, defaut: number) {
  for (const l of (await detailShift(db, id)).lignes.filter((x) => x.suiviStock)) {
    if (champ === "ouvertureComptee" && l.ouvertureTheorique !== null) continue;
    await saisirQuantite(db, id, l.produitId, champ, valeurs[l.produitId] ?? defaut, dir, new Date());
  }
}

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  dir = { id: d.id, nom: d.nom, role: "direction" };
  const s = await db.select().from(sites);
  labo = s.find((x) => x.type === "laboratoire")!.id;
  mars = s.find((x) => x.nom === "Browse 2 Mars")!.id;
  // Labo le matin, point de vente l'après-midi : la même personne peut tenir les deux.
  await enregistrerCreneaux(db, labo, [{ nom: "Journée", heureDebut: "08:00", heureFin: "12:00", jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
  await enregistrerCreneaux(db, mars, [{ nom: "Après-midi", heureDebut: "13:00", heureFin: "17:00", jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
  const [cat] = await db.select().from(categories).where(eq(categories.nom, CATEGORIE_INGREDIENTS));
  const ing = (nom: string, unite: "kg" | "piece") =>
    creerProduit(db, { nom, categorieId: cat.id, nouvelleCategorie: null, unite, partsParGateau: null, format: null, suiviStock: true, nature: "ingredient" }, dir);
  farine = await ing("Farine T55", "kg");
  nutella = await ing("Nutella", "kg");
  await db.insert(coutsProduit).values([
    { produitId: farine, coutUnitaire: 8, dateEffet: "2026-01-01" },
    { produitId: nutella, coutUnitaire: 120, dateEffet: "2026-01-01" },
  ]);
  matilda = (await ref("P009")).id;
  crepe = (await ref("P036")).id; // Crêpe Nutella Banane, préparée à la commande
});

describe("fiche technique et coût de revient", () => {
  it("coût par gâteau et par part, appliqué comme coût de revient", async () => {
    await enregistrerRecette(db, matilda, [{ ingredientId: farine, quantite: 0.5 }, { ingredientId: nutella, quantite: 0.25 }], dir);
    const r = await lireRecette(db, matilda, "2026-11-16");
    expect(r).toMatchObject({ coutRecette: 34, parGateau: 8, coutParUnite: 4.25, complet: true });
    await appliquerCoutRecette(db, matilda, "2026-11-16", dir);
    expect(await coutEnVigueur(db, matilda, "2026-11-16")).toBe(4.25);
    await expect(enregistrerRecette(db, farine, [{ ingredientId: nutella, quantite: 1 }], dir)).rejects.toThrow(/ingrédient n'a pas/);
    await expect(enregistrerRecette(db, matilda, [{ ingredientId: matilda, quantite: 1 }], dir)).rejects.toThrow(/inconnu/);
  });
});

describe("consommation théorique d'ingrédients", () => {
  it("au labo : production × recette, comparée à la consommation réelle", async () => {
    const id = await shiftDuJour(labo, "2026-11-16");
    await toutCompter(id, "ouvertureComptee", { [farine]: 10, [nutella]: 5 }, 0);
    await ajouterEntrees(db, id, [{ produitId: matilda, quantite: 4, saisie: "gateaux" }], "production", null, dir);
    await toutCompter(id, "stockReelFin", { [farine]: 7.5, [nutella]: 4, [matilda]: 32 }, 0);
    const d = await detailShift(db, id);
    const f = d.lignes.find((l) => l.produitId === farine)!;
    expect(f.consommationTheorique).toBe(2); // 4 gâteaux × 0,5 kg
    expect(f.calcul.consommation).toBe(2.5);
    expect(f.calcul.ecartConsommation).toBe(0.5); // surconsommation
    expect(d.lignes.find((l) => l.produitId === nutella)!.calcul.ecartConsommation).toBe(0);
    await cloturerShift(db, id, dir, new Date("2026-11-16T12:00:00Z"), null);
  });

  it("en point de vente : un ingrédient « aussi en point de vente » suit les ventes des préparations", async () => {
    const n = (await db.select().from(produits).where(eq(produits.id, nutella)))[0];
    await modifierProduit(db, nutella, { nom: n.nom, unite: n.unite, format: null, partsParGateau: null, prixVente: null, suiviStock: true, ingredientPointsDeVente: true, actif: true }, dir);
    await enregistrerRecette(db, crepe, [{ ingredientId: nutella, quantite: 0.04 }], dir);
    const id = await shiftDuJour(mars, "2026-11-16");
    const d0 = await detailShift(db, id);
    expect(d0.lignes.some((l) => l.produitId === nutella)).toBe(true);
    expect(d0.lignes.some((l) => l.produitId === farine)).toBe(false);
    await toutCompter(id, "ouvertureComptee", { [nutella]: 2 }, 5);
    const [surPlace] = await listerCanaux(db);
    await saisirVentes(db, id, crepe, surPlace.id, 10, dir, new Date());
    await toutCompter(id, "stockReelFin", { [nutella]: 1.6 }, 5);
    const l = (await detailShift(db, id)).lignes.find((x) => x.produitId === nutella)!;
    expect(l.consommationTheorique).toBe(0.4);
    expect(l.calcul.consommation).toBe(0.4);
    expect(l.calcul.ecartConsommation).toBe(0);
    await cloturerShift(db, id, dir, new Date("2026-11-16T17:00:00Z"), null);
  });
});

describe("durée de conservation", () => {
  it("signale le stock plus ancien que la DLC (premier entré, premier sorti)", async () => {
    const m = (await db.select().from(produits).where(eq(produits.id, matilda)))[0];
    await modifierProduit(db, matilda, { nom: m.nom, unite: m.unite, format: null, partsParGateau: 8, prixVente: m.prixVente, suiviStock: true, fabriqueLabo: true, dureeConservationJours: 3, actif: true }, dir);
    // Au labo : 32 parts comptées le 16, aucune production depuis.
    expect(await stockPerime(db, labo, new Date("2026-11-17T12:00:00Z"))).toEqual([]); // historique trop court
    const id = await shiftDuJour(labo, "2026-11-20");
    await ajouterEntrees(db, id, [{ produitId: matilda, quantite: 1, saisie: "gateaux" }], "production", null, dir);
    // La saisie est horodatée à l'heure réelle : on la replace à la date simulée du test.
    await db.update(mouvements).set({ horodatage: new Date("2026-11-20T09:00:00Z") }).where(eq(mouvements.shiftId, id));
    await toutCompter(id, "stockReelFin", { [farine]: 7.5, [nutella]: 4, [matilda]: 40 }, 0);
    await cloturerShift(db, id, dir, new Date("2026-11-20T12:00:00Z"), "Stock ancien conservé");
    const p = await stockPerime(db, labo, new Date("2026-11-20T13:00:00Z"));
    expect(p).toEqual([expect.objectContaining({ produit: "Matilda Cake", quantite: 32, duree: 3 })]); // 40 − 8 produites récemment
  });
});

describe("prévision de production", () => {
  it("moyenne des ventes des mêmes jours, minimum, stock et stock du labo", async () => {
    // Le lundi 16, Browse 2 Mars a vendu 10 crêpes (non fabriquées par le labo) : la prévision du lundi 23 ne porte que sur les produits du labo.
    const p = await previsionProduction(db, "2026-11-23");
    expect(p.jours).toEqual(["2026-11-16", "2026-11-09", "2026-11-02", "2026-10-26"]);
    expect(p.lignes.every((l) => l.produit !== "Crêpe Nutella Banane")).toBe(true);
    expect(p.sites).toEqual(["Browse 2 Mars", "Browse Sweets 2 Mars"]);
  });
});
