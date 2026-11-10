import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { categories, coutsProduit, photos, produits, UNITES } from "@/db/schema";
import type { Journee } from "@/domain/temps";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { exiger } from "../erreurs";

export interface ProduitVue {
  id: string;
  ref: string;
  nom: string;
  categorieId: string;
  categorie: string;
  ordreCategorie: number;
  unite: (typeof UNITES)[number];
  format: string | null;
  partsParGateau: number | null;
  prixVente: number | null;
  suiviStock: boolean;
  photoId: string | null;
  actif: boolean;
  ordre: number;
}

export async function listerProduits(db: Db, opts: { actifsSeulement?: boolean } = {}): Promise<ProduitVue[]> {
  const res = await db
    .select({
      id: produits.id,
      ref: produits.ref,
      nom: produits.nom,
      categorieId: produits.categorieId,
      categorie: categories.nom,
      ordreCategorie: categories.ordre,
      unite: produits.unite,
      format: produits.format,
      partsParGateau: produits.partsParGateau,
      prixVente: produits.prixVente,
      suiviStock: produits.suiviStock,
      photoId: produits.photoId,
      actif: produits.actif,
      ordre: produits.ordre,
    })
    .from(produits)
    .innerJoin(categories, eq(categories.id, produits.categorieId))
    .where(opts.actifsSeulement ? eq(produits.actif, true) : undefined)
    .orderBy(asc(categories.ordre), asc(produits.ordre), asc(produits.ref));
  return res;
}

export async function lireProduit(db: Db, id: string): Promise<ProduitVue> {
  const tous = await listerProduits(db);
  const p = tous.find((x) => x.id === id);
  exiger(p, "Produit introuvable");
  return p;
}

export interface SaisieProduit {
  nom: string;
  unite: (typeof UNITES)[number];
  format: string | null;
  partsParGateau: number | null;
  prixVente: number | null;
  suiviStock: boolean;
  actif: boolean;
}

export async function modifierProduit(db: Db, id: string, v: SaisieProduit, acteur: Acteur) {
  exiger(v.nom.trim(), "Le nom est obligatoire");
  exiger(UNITES.includes(v.unite), "Unité invalide");
  exiger(v.prixVente === null || (Number.isFinite(v.prixVente) && v.prixVente >= 0), "Prix invalide");
  exiger(
    v.partsParGateau === null || (Number.isInteger(v.partsParGateau) && v.partsParGateau > 0),
    "Nombre de parts invalide",
  );
  exiger(v.unite !== "part" || v.partsParGateau, "Indiquer le nombre de parts par gâteau");
  await db
    .update(produits)
    .set({ ...v, nom: v.nom.trim(), format: v.format?.trim() || null })
    .where(eq(produits.id, id));
  await tracer(db, acteur.id, "modifier", "produit", id, { ...v });
}

/** Coût de revient en vigueur à une date (dernier coût dont la date d'effet est passée). */
export async function coutEnVigueur(db: Db, produitId: string, journee: Journee): Promise<number | null> {
  const [c] = await db
    .select({ cout: coutsProduit.coutUnitaire })
    .from(coutsProduit)
    .where(and(eq(coutsProduit.produitId, produitId), lte(coutsProduit.dateEffet, journee)))
    .orderBy(desc(coutsProduit.dateEffet), desc(coutsProduit.saisiLe))
    .limit(1);
  return c?.cout ?? null;
}

export async function historiqueCouts(db: Db, produitId: string) {
  return db
    .select()
    .from(coutsProduit)
    .where(eq(coutsProduit.produitId, produitId))
    .orderBy(desc(coutsProduit.dateEffet), desc(coutsProduit.saisiLe));
}

export async function ajouterCout(db: Db, produitId: string, cout: number, dateEffet: Journee, acteur: Acteur) {
  exiger(Number.isFinite(cout) && cout >= 0, "Coût invalide");
  await db.insert(coutsProduit).values({ produitId, coutUnitaire: cout, dateEffet, saisiPar: acteur.id });
  await tracer(db, acteur.id, "ajouter_cout", "produit", produitId, { cout, dateEffet });
}

export const TAILLE_MAX_PHOTO = 1_500_000;

export async function enregistrerPhoto(db: Db, produitId: string, donnees: Uint8Array, contentType: string, acteur: Acteur) {
  exiger(/^image\/(jpeg|png|webp)$/.test(contentType), "Format d'image non pris en charge (JPEG, PNG ou WebP)");
  exiger(donnees.byteLength > 0 && donnees.byteLength <= TAILLE_MAX_PHOTO, "Image trop lourde (1,5 Mo maximum)");
  const [p] = await db.select({ photoId: produits.photoId }).from(produits).where(eq(produits.id, produitId));
  exiger(p, "Produit introuvable");
  const [ph] = await db.insert(photos).values({ contentType, donnees }).returning({ id: photos.id });
  await db.update(produits).set({ photoId: ph.id }).where(eq(produits.id, produitId));
  if (p.photoId) await db.delete(photos).where(eq(photos.id, p.photoId));
  await tracer(db, acteur.id, "photo", "produit", produitId);
  return ph.id;
}

export async function lirePhoto(db: Db, id: string) {
  const [p] = await db.select().from(photos).where(eq(photos.id, id));
  return p ?? null;
}
