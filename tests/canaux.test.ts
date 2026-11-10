import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { lignesShift, produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { CORRESPONDANCES_LOYVERSE } from "@/server/correspondances-loyverse";
import { initialiser } from "@/server/seed";
import {
  ajouterArticle,
  articlesARattacher,
  associerArticle,
  categoriesARattacher,
  detecterCanal,
  estDisponible,
  ignorerArticle,
  ignorerCategorie,
  listerArticles,
  listerCanaux,
  type Canal,
} from "@/server/services/caisse";
import { importerArticles, lireExportCsv } from "@/server/services/loyverse";
import { affecter } from "@/server/services/planning";
import { detailShift, ouvrirShift, saisirVentes } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

/**
 * Cas réels de l'export Loyverse de Browse (extrait dans tests/donnees) :
 *  - même article en double, le canal Glovo étant donné par la catégorie « Glovo » (noms identiques) ;
 *  - prix différents selon le magasin (Carrot Cake 45 au Coffee Shop, 40 chez Browse Sweet) ;
 *  - articles vendus par lot (Matilda Cake Entier = 8 parts) ;
 *  - articles retirés de la vente, prix « variable ».
 */
const exportCsv = readFileSync("tests/donnees/export_loyverse_extrait.csv", "utf8");
let db: Db;
let direction: Acteur;
let surPlace: Canal;
let glovo: Canal;
const produit = async (ref: string) => (await db.select().from(produits).where(eq(produits.ref, ref)))[0];
const site = async (nom: string) => (await db.select().from(sites).where(eq(sites.nom, nom)))[0];

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
  const canaux = await listerCanaux(db);
  surPlace = canaux.find((c) => c.code === "sur_place")!;
  glovo = canaux.find((c) => c.code === "glovo")!;
});

describe("lecture de l'export CSV Loyverse", () => {
  it("lit SKU, catégorie, prix et disponibilité par magasin", () => {
    const a = lireExportCsv(exportCsv);
    expect(a).toHaveLength(15);
    const carrot = a.find((x) => x.sku === "10059")!;
    expect(carrot).toMatchObject({ nom: "CARROT CAKE", categorie: "CAKES", prix: 40 });
    expect(carrot.prixMagasins).toEqual([
      { magasin: "BROWSE COFFEE SHOP", prix: 45, disponible: true },
      { magasin: "Browse Sweet", prix: 40, disponible: true },
    ]);
    expect(a.find((x) => x.sku === "10418")!.prixMagasins[0].prix).toBeNull(); // prix « variable »
    expect(a.find((x) => x.sku === "10414")!.prixMagasins.map((p) => p.disponible)).toEqual([false, true]);
  });

  it("refuse un fichier qui n'est pas un export d'articles", () => {
    expect(() => lireExportCsv("nom,prix\nA,1\n")).toThrow(/export d'articles/);
  });

  it("reconnaît Glovo par la catégorie, même quand le nom est identique", async () => {
    const canaux = await listerCanaux(db);
    expect(detecterCanal({ nom: "Mango Can", categorie: "Glovo" }, canaux)?.code).toBe("glovo");
    expect(detecterCanal({ nom: "Mango Can", categorie: "Can Cakes" }, canaux)?.code).toBe("sur_place");
    expect(detecterCanal({ nom: "Mango Can Glovo", categorie: null }, canaux)?.code).toBe("glovo");
  });
});

describe("import des articles", () => {
  it("rattache les doublons au même produit, chacun sur son canal, avec les lots", async () => {
    const r = await importerArticles(db, lireExportCsv(exportCsv), direction, CORRESPONDANCES_LOYVERSE);
    expect(r.articlesImportes).toBe(15);

    const mango = await listerArticles(db, { produitId: (await produit("P001")).id });
    expect(mango.map((a) => [a.canalCode, a.sku, a.facteur])).toEqual([
      ["sur_place", "10342", 1],
      ["glovo", "10379", 1],
    ]);
    const matilda = await listerArticles(db, { produitId: (await produit("P009")).id });
    expect(matilda.map((a) => [a.canalCode, a.nomCaisse, a.facteur])).toEqual([
      ["sur_place", "Matilda Cake", 1],
      ["sur_place", "Matilda Cake Entier", 8],
      ["glovo", "Matilda Cake", 1],
    ]);
    expect(r.nouveauxAssocies.find((x) => x.sku === "10319")).toMatchObject({ par: "correspondance", facteur: 8 });

    // Restent à rattacher : les articles encore en vente sans correspondance validée.
    // AFFOGATO (boisson), Mango cake et Strawberry Can (« à confirmer ») ; Banofie, retiré de la vente, n'est pas proposé.
    expect(r.nonAssocies.sort()).toEqual(["AFFOGATO", "Mango cake", "Strawberry Can"]);
    const enAttente = (await listerArticles(db, { nonAssocies: true })).filter(estDisponible).map((a) => a.nomCaisse);
    expect(enAttente.sort()).toEqual(["AFFOGATO", "Mango cake", "Strawberry Can"]);

    // Même résultat par les requêtes légères de l'écran Loyverse (décompte par catégorie, chargement à la demande).
    expect(await categoriesARattacher(db)).toEqual([
      { categorie: "CAKES", n: 1 },
      { categorie: "Can Cakes", n: 1 },
      { categorie: "COFFEES", n: 1 },
    ]);
    const cakes = await articlesARattacher(db, { categorie: "CAKES" });
    expect(cakes.map((x) => [x.nom, x.prix.map((p) => p.prix)])).toEqual([["Mango cake", [null, null]]]);
    expect((await articlesARattacher(db, { recherche: "straw" })).map((x) => x.sku)).toEqual(["10372"]);
    expect(await articlesARattacher(db, { recherche: "Banofie" })).toEqual([]); // retiré de la vente
  });

  it("garde les rattachements manuels et les articles ignorés lors d'un nouvel import", async () => {
    const enAttente = await listerArticles(db, { nonAssocies: true });
    const strawberry = enAttente.find((a) => a.sku === "10372")!;
    const affogato = enAttente.find((a) => a.sku === "10006")!;
    await associerArticle(db, strawberry.id, { produitId: (await produit("P004")).id, canalId: surPlace.id, facteur: 1 }, direction);
    await ignorerArticle(db, affogato.id, direction);

    const modifie = exportCsv.replace("carrot-cake-1,10302,Carrot Cake,Glovo,,,,,,,52.00,0.00,N,Y,52.00,Y,52.00", "carrot-cake-1,10302,Carrot Cake,Glovo,,,,,,,55.00,0.00,N,Y,55.00,Y,55.00");
    const r = await importerArticles(db, lireExportCsv(modifie), direction, CORRESPONDANCES_LOYVERSE);
    expect(r.nouveauxAssocies).toHaveLength(0);
    expect(r.nonAssocies).toEqual(["Mango cake"]);
    const carrotGlovo = (await listerArticles(db, { produitId: (await produit("P015")).id })).find((a) => a.canalCode === "glovo")!;
    expect(carrotGlovo.prixMagasins.map((p) => p.prix)).toEqual([55, 55]);
    expect((await listerArticles(db, { produitId: (await produit("P004")).id })).map((a) => a.sku)).toEqual(["10372"]);
  });

  it("ignore d'un coup une catégorie hors inventaire, sans toucher aux articles rattachés", async () => {
    const n = await ignorerCategorie(db, "CAKES", direction);
    expect(n).toBe(2); // Mango cake et Banofie ; Carrot Cake et Matilda (rattachés) restent
    expect((await listerArticles(db, { nonAssocies: true })).filter((a) => a.categorieCaisse === "CAKES")).toHaveLength(0);
    expect((await listerArticles(db, { produitId: (await produit("P009")).id })).length).toBe(3);
  });

  it("refuse un SKU déjà utilisé lors d'un ajout manuel", async () => {
    await expect(
      ajouterArticle(db, { produitId: (await produit("P001")).id, canalId: glovo.id, nomCaisse: "Doublon", sku: "10379", prixVente: 49, facteur: 1 }, direction),
    ).rejects.toThrow(/déjà utilisé/);
  });
});

describe("prix par magasin et ventes par canal", () => {
  async function ouvrir(nomSite: string, journee: string) {
    const s = await site(nomSite);
    if (!(await listerCreneaux(db, s.id)).length) {
      await enregistrerCreneaux(db, s.id, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
    }
    const [cr] = await listerCreneaux(db, s.id);
    const id = await affecter(db, { siteId: s.id, journee, creneauId: cr.id, responsableId: direction.id, equipierIds: [] }, direction);
    await ouvrirShift(db, id, direction, new Date(`${journee}T08:00:00Z`));
    return id;
  }

  it("applique le prix de référence du magasin du site", async () => {
    const carrot = await produit("P015");
    const coffee = await ouvrir("Browse 2 Mars", "2026-11-16");
    const sweet = await ouvrir("Browse Sweets 2 Mars", "2026-11-17");
    const prix = async (shiftId: string) =>
      (await db.select().from(lignesShift).where(eq(lignesShift.shiftId, shiftId))).find((l) => l.produitId === carrot.id)!.prixVente;
    expect(await prix(coffee)).toBe(45);
    expect(await prix(sweet)).toBe(40);
  });

  it("additionne les canaux pour le stock et valorise chaque vente à son prix", async () => {
    const shiftId = (await db.select().from(lignesShift)).map((l) => l.shiftId)[0];
    const d0 = await detailShift(db, shiftId);
    const lotus = await produit("P007");
    const t = new Date("2026-11-16T12:00:00Z");
    await saisirVentes(db, shiftId, lotus.id, surPlace.id, 4, direction, t);
    await saisirVentes(db, shiftId, lotus.id, glovo.id, 2, direction, t);
    const d = await detailShift(db, shiftId);
    const l = d.lignes.find((x) => x.produitId === lotus.id)!;
    expect(l.ventes).toBe(6);
    // Lotus Can sur place : 30 MAD au Coffee Shop, 38 chez Browse Sweet ; Glovo : 49 partout.
    const prixSurPlace = d0.shift.site === "Browse 2 Mars" ? 30 : 38;
    expect(l.calcul.ca).toBe(4 * prixSurPlace + 2 * 49);
    expect(d.ventesParCanal.map((c) => [c.canal, c.quantite])).toEqual([
      ["Sur place", 4],
      ["Glovo", 2],
    ]);
    await saisirVentes(db, shiftId, lotus.id, glovo.id, 0, direction, t);
    expect((await detailShift(db, shiftId)).lignes.find((x) => x.produitId === lotus.id)!.ventes).toBe(4);
  });
});
