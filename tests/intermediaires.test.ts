import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { categories, coutsProduit, produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { CATEGORIE_INGREDIENTS, CATEGORIE_INTERMEDIAIRES, initialiser } from "@/server/seed";
import { appliquerCoutRecette, creerProduit, enregistrerRecette, lireRecette, lireUtilisations, stocksMinimum } from "@/server/services/catalogue";
import { rapportLabo } from "@/server/services/livraisons";
import { affecter } from "@/server/services/planning";
import { ajouterEntrees, cloturerShift, detailShift, ouvrirShift, saisirQuantite } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

let db: Db;
let dir: Acteur;
let labo: string;
let mars: string;
const id: Record<string, string> = {};

async function shiftDuJour(siteId: string, journee: string) {
  const [cr] = await listerCreneaux(db, siteId);
  const s = await affecter(db, { siteId, journee, creneauId: cr.id, responsableId: dir.id, equipierIds: [] }, dir);
  await ouvrirShift(db, s, dir, new Date(`${journee}T07:30:00Z`));
  return s;
}

async function toutCompter(shiftId: string, champ: "ouvertureComptee" | "stockReelFin", valeurs: Record<string, number>) {
  for (const l of (await detailShift(db, shiftId)).lignes.filter((x) => x.suiviStock))
    await saisirQuantite(db, shiftId, l.produitId, champ, valeurs[l.produitId] ?? 0, dir, new Date());
}

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  dir = { id: d.id, nom: d.nom, role: "direction" };
  const s = await db.select().from(sites);
  labo = s.find((x) => x.type === "laboratoire")!.id;
  mars = s.find((x) => x.nom === "Browse 2 Mars")!.id;
  await enregistrerCreneaux(db, labo, [{ nom: "Journée", heureDebut: "08:00", heureFin: "12:00", jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
  const cats = new Map((await db.select().from(categories)).map((c) => [c.nom, c.id]));
  const creer = (nom: string, unite: "kg" | "litre", nature: "ingredient" | "intermediaire") =>
    creerProduit(
      db,
      {
        nom,
        categorieId: cats.get(nature === "ingredient" ? CATEGORIE_INGREDIENTS : CATEGORIE_INTERMEDIAIRES)!,
        nouvelleCategorie: null,
        unite,
        partsParGateau: null,
        format: null,
        suiviStock: false, // forcé : une préparation est toujours suivie en stock
        nature,
        fabriqueLabo: true, // ignoré : une préparation n'est pas livrée comme produit fini
      },
      dir,
    );
  id.farine = await creer("Farine T55", "kg", "ingredient");
  id.beurre = await creer("Beurre", "kg", "ingredient");
  id.sucre = await creer("Sucre", "kg", "ingredient");
  id.lait = await creer("Lait", "litre", "ingredient");
  id.pate = await creer("Pâte sucrée", "kg", "intermediaire");
  id.creme = await creer("Crème pâtissière", "litre", "intermediaire");
  await db.insert(coutsProduit).values(
    (
      [
        ["farine", 8],
        ["beurre", 90],
        ["sucre", 12],
        ["lait", 10],
      ] as const
    ).map(([k, c]) => ({ produitId: id[k], coutUnitaire: c, dateEffet: "2026-01-01" })),
  );
  id.matilda = (await db.select().from(produits).where(eq(produits.ref, "P009")))[0].id;
});

describe("préparations intermédiaires au catalogue", () => {
  it("toujours suivies en stock, au labo seulement, jamais livrées", async () => {
    const [p] = await db.select().from(produits).where(eq(produits.id, id.pate));
    expect(p).toMatchObject({ nature: "intermediaire", suiviStock: true, fabriqueLabo: false });
    expect((await stocksMinimum(db, id.pate)).map((s) => s.siteId)).toEqual([labo]);
  });

  it("fiche d'une préparation, puis d'un produit fini qui l'utilise ; coût calculé niveau par niveau", async () => {
    await enregistrerRecette(db, id.pate, [{ ingredientId: id.farine, quantite: 0.5 }, { ingredientId: id.beurre, quantite: 0.25 }, { ingredientId: id.sucre, quantite: 0.2 }], dir);
    await enregistrerRecette(db, id.creme, [{ ingredientId: id.lait, quantite: 1 }, { ingredientId: id.sucre, quantite: 0.2 }], dir);
    expect(await lireRecette(db, id.pate, "2026-11-16")).toMatchObject({ coutRecette: 28.9, coutParUnite: 28.9, complet: true });
    await enregistrerRecette(
      db,
      id.matilda,
      [{ ingredientId: id.pate, quantite: 0.4 }, { ingredientId: id.creme, quantite: 0.5 }, { ingredientId: id.beurre, quantite: 0.1 }],
      dir,
    );
    // Sans coût saisi, le coût d'une préparation vient de sa fiche : 0,4 × 28,9 + 0,5 × 12,4 + 0,1 × 90.
    const r = await lireRecette(db, id.matilda, "2026-11-16");
    expect(r.coutRecette).toBe(26.76);
    expect(r.complet).toBe(true);
    expect(r.lignes.find((l) => l.ingredientId === id.pate)).toMatchObject({ nature: "intermediaire", coutUnitaire: 28.9, coutDeSaFiche: true });
    expect((await lireUtilisations(db, id.pate)).map((u) => u.produitId)).toEqual([id.matilda]);
  });

  it("refuse les boucles et la fiche d'une matière première", async () => {
    await enregistrerRecette(db, id.pate, [{ ingredientId: id.creme, quantite: 0.1 }, { ingredientId: id.farine, quantite: 0.5 }], dir);
    await expect(enregistrerRecette(db, id.creme, [{ ingredientId: id.pate, quantite: 1 }], dir)).rejects.toThrow(/boucle/);
    await expect(enregistrerRecette(db, id.farine, [{ ingredientId: id.sucre, quantite: 1 }], dir)).rejects.toThrow(/matière première n'a pas/);
    // Retour à la fiche d'origine.
    await enregistrerRecette(db, id.pate, [{ ingredientId: id.farine, quantite: 0.5 }, { ingredientId: id.beurre, quantite: 0.25 }, { ingredientId: id.sucre, quantite: 0.2 }], dir);
    await appliquerCoutRecette(db, id.pate, "2026-11-16", dir);
  });
});

describe("shift du laboratoire avec préparations", () => {
  it("production des préparations et des produits : consommation attendue niveau par niveau", async () => {
    const s = await shiftDuJour(labo, "2026-11-16");
    const noms = (await detailShift(db, s)).lignes.map((l) => l.produitId);
    expect(noms).toEqual(expect.arrayContaining([id.pate, id.creme, id.farine, id.matilda]));
    await toutCompter(s, "ouvertureComptee", { [id.farine]: 10, [id.beurre]: 5, [id.sucre]: 5, [id.lait]: 10, [id.pate]: 1 });
    await ajouterEntrees(db, s, [{ produitId: id.pate, quantite: 2, saisie: "parts" }, { produitId: id.creme, quantite: 3, saisie: "parts" }], "production", null, dir);
    await ajouterEntrees(db, s, [{ produitId: id.matilda, quantite: 4, saisie: "gateaux" }], "production", null, dir);
    await toutCompter(s, "stockReelFin", { [id.farine]: 9, [id.beurre]: 4.1, [id.sucre]: 4, [id.lait]: 7, [id.pate]: 1.4, [id.creme]: 0.8, [id.matilda]: 32 });
    const d = await detailShift(db, s);
    const l = (k: string) => d.lignes.find((x) => x.produitId === id[k])!;
    // Pâte : 1 + 2 produits − 1,4 comptés = 1,6 consommés ; fiche : 4 gâteaux × 0,4 kg.
    expect(l("pate").calcul).toMatchObject({ ecart: null, consommation: 1.6, ecartConsommation: 0 });
    expect(l("pate").production).toBe(2);
    // Crème : 3 − 0,8 = 2,2 consommés pour 2 attendus : surconsommation de 0,2.
    expect(l("creme").calcul.ecartConsommation).toBe(0.2);
    // Matières : celles des préparations faites + celles du produit fini, sans double comptage.
    expect(l("farine").consommationTheorique).toBe(1); // 2 kg de pâte × 0,5
    expect(l("beurre").consommationTheorique).toBe(0.9); // pâte 0,5 + Matilda 0,4
    expect(l("sucre").consommationTheorique).toBe(1); // pâte 0,4 + crème 0,6
    expect(l("lait").consommationTheorique).toBe(3);
    // Valeur consommée : matières premières seulement (8 + 81 + 12 + 30), pas la pâte (déjà dans ses matières).
    expect(l("pate").calcul.valeurConsommation).toBe(46.24);
    expect(d.synthese.valeurConsommation).toBe(131);
    expect(d.synthese.produitsAvecEcart).toBe(0);
    await cloturerShift(db, s, dir, new Date("2026-11-16T12:00:00Z"), null);
  });

  it("le point de vente ne voit pas les préparations", async () => {
    await enregistrerCreneaux(db, mars, [{ nom: "Après-midi", heureDebut: "13:00", heureFin: "17:00", jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
    const s = await shiftDuJour(mars, "2026-11-16");
    expect((await detailShift(db, s)).lignes.some((l) => l.produitId === id.pate || l.produitId === id.farine)).toBe(false);
  });

  it("rapport du labo : préparations produites et consommées, valeur sur les matières premières", async () => {
    const r = await rapportLabo(db, labo, "2026-11-16", "2026-11-16");
    expect(r.production.map((p) => [p.produit, p.nature])).toEqual([
      ["Matilda Cake", "produit"],
      ["Pâte sucrée", "intermediaire"],
      ["Crème pâtissière", "intermediaire"],
    ]);
    expect(r.consommation.find((c) => c.produitId === id.pate)).toMatchObject({ nature: "intermediaire", quantite: 1.6, theorique: 1.6 });
    expect(r.valeurConsommation).toBe(131);
  });
});
