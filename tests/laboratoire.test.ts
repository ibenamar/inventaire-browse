import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { bonsLivraison, categories, coutsProduit, produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { CATEGORIE_INGREDIENTS, initialiser } from "@/server/seed";
import { creerProduit } from "@/server/services/catalogue";
import { annulerBon, creerBon, expedierBon, listerBons, rapportLabo, receptionnerBon } from "@/server/services/livraisons";
import { affecter } from "@/server/services/planning";
import { ajouterEntrees, ajouterPerte, cloturerShift, detailShift, ouvrirShift, saisirQuantite, supprimerMouvement } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";

let db: Db;
let dir: Acteur;
let labo: string;
let mars: string;
let shiftLabo: string;
let shiftMars: string;
let farine: string;
let matilda: string;
let mango: string;

async function planifier(siteId: string, journee: string, debut: string, fin: string) {
  await enregistrerCreneaux(db, siteId, [{ nom: "Journée", heureDebut: debut, heureFin: fin, jours: [1, 2, 3, 4, 5, 6, 7] }], dir);
  const [cr] = await listerCreneaux(db, siteId);
  return affecter(db, { siteId, journee, creneauId: cr.id, responsableId: dir.id, equipierIds: [] }, dir);
}

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  dir = { id: d.id, nom: d.nom, role: "direction" };
  const s = await db.select().from(sites);
  labo = s.find((x) => x.type === "laboratoire")!.id;
  mars = s.find((x) => x.nom === "Browse 2 Mars")!.id;
  const [cat] = await db.select().from(categories).where(eq(categories.nom, CATEGORIE_INGREDIENTS));
  farine = await creerProduit(
    db,
    { nom: "Farine T55", categorieId: cat.id, nouvelleCategorie: null, unite: "kg", partsParGateau: null, format: "sac de 25 kg", suiviStock: true, nature: "ingredient" },
    dir,
  );
  await db.insert(coutsProduit).values({ produitId: farine, coutUnitaire: 8, dateEffet: "2026-01-01" });
  const p = await db.select().from(produits);
  matilda = p.find((x) => x.ref === "P009")!.id;
  mango = p.find((x) => x.ref === "P001")!.id;
  // Le labo : 7h–15h ; le point de vente : 15h–23h le même jour.
  shiftLabo = await planifier(labo, "2026-11-16", "07:00", "15:00");
  shiftMars = await planifier(mars, "2026-11-16", "15:00", "23:00");
});

describe("shift du laboratoire", () => {
  it("compte ses ingrédients et ses fabrications, pas les boissons ; le point de vente ne voit pas les ingrédients", async () => {
    await ouvrirShift(db, shiftLabo, dir, new Date("2026-11-16T06:00:00Z"));
    const d = await detailShift(db, shiftLabo);
    expect(d.shift.typeSite).toBe("laboratoire");
    const refs = d.lignes.map((l) => l.nom);
    expect(refs).toContain("Farine T55");
    expect(refs).toContain("Matilda Cake");
    expect(refs.some((n) => n.startsWith("MAYA"))).toBe(false);
    expect(refs.some((n) => n.startsWith("Crêpe"))).toBe(false);
  });

  it("accepte les décimales pour les ingrédients au poids, pas pour les parts", async () => {
    await saisirQuantite(db, shiftLabo, farine, "ouvertureComptee", 10.5, dir, new Date());
    await expect(saisirQuantite(db, shiftLabo, matilda, "ouvertureComptee", 1.5, dir, new Date())).rejects.toThrow(/entier/);
    await expect(saisirQuantite(db, shiftLabo, farine, "ouvertureComptee", 1.2345, dir, new Date())).rejects.toThrow(/décimales/);
  });

  it("production en gâteaux entiers, réception fournisseur et perte d'ingrédient", async () => {
    const d = await detailShift(db, shiftLabo);
    for (const l of d.lignes.filter((x) => x.suiviStock && x.produitId !== farine)) {
      await saisirQuantite(db, shiftLabo, l.produitId, "ouvertureComptee", 0, dir, new Date());
    }
    await ajouterEntrees(db, shiftLabo, [{ produitId: matilda, quantite: 3, saisie: "gateaux" }], "production", null, dir);
    await ajouterEntrees(db, shiftLabo, [{ produitId: farine, quantite: 25, saisie: "parts" }], "fournisseur", "BL Moulins", dir);
    await ajouterPerte(db, shiftLabo, { produitId: farine, quantite: 0.5, saisie: "parts", motif: "endommage", commentaire: null }, dir);
    const l = (await detailShift(db, shiftLabo)).lignes.find((x) => x.produitId === matilda)!;
    expect(l.entrees).toBe(24);
    expect(l.production).toBe(24);
  });
});

describe("bon de livraison", () => {
  let bonId: string;

  it("préparé puis expédié : sort du stock du labo", async () => {
    bonId = await creerBon(
      db,
      { shiftId: shiftLabo, siteDestinationId: mars, lignes: [{ produitId: matilda, quantite: 2, saisie: "gateaux" }], commentaire: "Tournée du matin", expedier: false },
      dir,
      new Date("2026-11-16T09:00:00Z"),
    );
    expect((await listerBons(db, { siteOrigineId: labo }))[0]).toMatchObject({ statut: "prepare", destination: "Browse 2 Mars" });
    await expedierBon(db, bonId, shiftLabo, dir, new Date("2026-11-16T09:30:00Z"));
    await expect(expedierBon(db, bonId, shiftLabo, dir, new Date())).rejects.toThrow(/déjà été expédié/);
    const l = (await detailShift(db, shiftLabo)).lignes.find((x) => x.produitId === matilda)!;
    expect(l.sorties).toBe(16);
    expect(l.calcul.theoriqueFin).toBe(8);
    const sortie = (await detailShift(db, shiftLabo)).mouvements.find((m) => m.bonId === bonId)!;
    await expect(supprimerMouvement(db, sortie.id, dir)).rejects.toThrow(/bon de livraison/);
  });

  it("clôture du labo : la différence sur un ingrédient est une consommation, pas un écart", async () => {
    const d = await detailShift(db, shiftLabo);
    for (const l of d.lignes.filter((x) => x.suiviStock)) {
      const v = l.produitId === farine ? 30.25 : l.produitId === matilda ? 8 : 0;
      await saisirQuantite(db, shiftLabo, l.produitId, "stockReelFin", v, dir, new Date());
    }
    const f = (await detailShift(db, shiftLabo)).lignes.find((x) => x.produitId === farine)!;
    expect(f.calcul.theoriqueFin).toBe(35); // 10,5 + 25 − 0,5
    expect(f.calcul.ecart).toBeNull();
    expect(f.calcul.consommation).toBe(4.75);
    expect(f.calcul.valeurConsommation).toBe(38);
    const d2 = await detailShift(db, shiftLabo);
    expect(d2.synthese.produitsAvecEcart).toBe(0);
    expect(d2.synthese.valeurConsommation).toBe(38);
    await cloturerShift(db, shiftLabo, dir, new Date("2026-11-16T14:00:00Z"), null);
  });

  it("réception au point de vente par l'équipe : entrées du shift, écart de livraison, une seule fois", async () => {
    await ouvrirShift(db, shiftMars, dir, new Date("2026-11-16T15:00:00Z"));
    const attendus = await listerBons(db, { siteDestinationId: mars, statuts: ["expedie"] });
    expect(attendus.map((b) => b.id)).toEqual([bonId]);
    const r = await receptionnerBon(db, { bonId, shiftId: shiftMars, recus: { [matilda]: 15 }, commentaire: "1 part abîmée" }, dir, new Date("2026-11-16T15:10:00Z"));
    expect(r.ecarts).toBe(1);
    await expect(receptionnerBon(db, { bonId, shiftId: shiftMars, recus: {}, commentaire: null }, dir, new Date())).rejects.toThrow(/déjà été réceptionné/);
    const d = await detailShift(db, shiftMars);
    expect(d.lignes.find((x) => x.produitId === matilda)!.entrees).toBe(15);
    expect(d.lignes.some((x) => x.produitId === farine)).toBe(false);
    expect(d.mouvements.find((m) => m.bonId === bonId)).toMatchObject({ origine: "labo", type: "entree" });
    await expect(annulerBon(db, bonId, dir)).rejects.toThrow(/réceptionné/);
  });

  it("un bon expédié non reçu ne s'annule que par un manager, et sa sortie est retirée", async () => {
    const shiftLabo2 = await planifier(labo, "2026-11-17", "07:00", "15:00");
    await ouvrirShift(db, shiftLabo2, dir, new Date("2026-11-17T06:00:00Z"));
    const b = await creerBon(
      db,
      { shiftId: shiftLabo2, siteDestinationId: mars, lignes: [{ produitId: matilda, quantite: 1, saisie: "gateaux" }], commentaire: null, expedier: true },
      dir,
      new Date("2026-11-17T08:00:00Z"),
    );
    await expect(
      creerBon(db, { shiftId: shiftLabo2, siteDestinationId: mars, lignes: [{ produitId: matilda, quantite: 5, saisie: "gateaux" }], commentaire: null, expedier: true }, dir, new Date()),
    ).rejects.toThrow(/Stock insuffisant — Matilda Cake : 5 gâteaux \(40 parts\) à expédier/);
    expect((await listerBons(db, { siteOrigineId: labo, statuts: ["prepare"] })).length).toBe(0);
    await expect(annulerBon(db, b, { ...dir, role: "employe" })).rejects.toThrow(/manager/);
    await annulerBon(db, b, dir);
    expect((await detailShift(db, shiftLabo2)).lignes.find((x) => x.produitId === matilda)!.sorties).toBe(0);
    expect((await db.select().from(bonsLivraison).where(eq(bonsLivraison.id, b)))[0].statut).toBe("annule");
    await expect(
      creerBon(db, { shiftId: shiftLabo2, siteDestinationId: labo, lignes: [{ produitId: matilda, quantite: 1, saisie: "parts" }], commentaire: null, expedier: false }, dir, new Date()),
    ).rejects.toThrow(/différent/);
    await expect(
      creerBon(db, { shiftId: shiftLabo2, siteDestinationId: mars, lignes: [{ produitId: mango, quantite: 0, saisie: "parts" }], commentaire: null, expedier: false }, dir, new Date()),
    ).rejects.toThrow(/Aucune quantité/);
  });
});

describe("rapport du laboratoire", () => {
  it("production, livraisons, écarts de livraison et consommation d'ingrédients", async () => {
    const r = await rapportLabo(db, labo, "2026-11-16", "2026-11-22");
    expect(r.production).toEqual([expect.objectContaining({ produit: "Matilda Cake", total: 24, parJour: { "2026-11-16": 24 } })]);
    expect(r.livraisons).toEqual([{ destination: "Browse 2 Mars", bons: 1, recus: 1, enAttente: 0, avecEcart: 1 }]);
    expect(r.ecartsLivraison).toEqual([expect.objectContaining({ produit: "Matilda Cake", expedie: 16, recu: 15 })]);
    expect(r.consommation).toEqual([expect.objectContaining({ produit: "Farine T55", quantite: 4.75, valeur: 38 })]);
    expect(r.pertes).toEqual([expect.objectContaining({ produit: "Farine T55", quantite: 0.5 })]);
    expect(r.shiftsClos).toBe(1);
  });
});

describe("ajustement d'un bon préparé", () => {
  it("modifie les quantités, retire une ligne à 0, refuse un bon vide ou déjà expédié", async () => {
    const { modifierBon } = await import("@/server/services/livraisons");
    // Shift du labo encore ouvert (celui du 17).
    const { shifts } = await import("@/db/schema");
    const { and } = await import("drizzle-orm");
    const [{ id: shiftLabo3 }] = await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.siteId, labo), eq(shifts.statut, "ouvert")));
    const id = await creerBon(
      db,
      { shiftId: shiftLabo3, siteDestinationId: mars, lignes: [{ produitId: matilda, quantite: 1, saisie: "gateaux" }, { produitId: mango, quantite: 4, saisie: "parts" }], commentaire: null, expedier: false },
      dir,
      new Date(),
    );
    await modifierBon(db, id, { [matilda]: 16, [mango]: 0 }, dir);
    const [b] = await listerBons(db, { siteOrigineId: labo, statuts: ["prepare"] });
    expect(b.lignes.map((l) => [l.nom, l.quantiteExpediee])).toEqual([["Matilda Cake", 16]]);
    await expect(modifierBon(db, id, { [matilda]: 0 }, dir)).rejects.toThrow(/vide/);
    await expect(modifierBon(db, id, { [matilda]: 1.5 }, dir)).rejects.toThrow(/invalide/);
  });
});
