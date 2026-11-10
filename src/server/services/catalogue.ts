import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { categories, coutsProduit, NATURES_PRODUIT, photos, produits, produitsSites, recettes, sites, UNITES, UNITES_DECIMALES } from "@/db/schema";
import { estQuantiteValide } from "@/domain/calculs";
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
  nature: (typeof NATURES_PRODUIT)[number];
  fabriqueLabo: boolean;
  ingredientPointsDeVente: boolean;
  dureeConservationJours: number | null;
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
      nature: produits.nature,
      fabriqueLabo: produits.fabriqueLabo,
      ingredientPointsDeVente: produits.ingredientPointsDeVente,
      dureeConservationJours: produits.dureeConservationJours,
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
  /** Fabriqué par le laboratoire (compté au labo, livré aux points de vente). */
  fabriqueLabo?: boolean;
  /** Ingrédient : aussi compté dans les points de vente (préparations à la commande). */
  ingredientPointsDeVente?: boolean;
  dureeConservationJours?: number | null;
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
  exiger(
    v.dureeConservationJours === undefined || v.dureeConservationJours === null || (Number.isInteger(v.dureeConservationJours) && v.dureeConservationJours > 0 && v.dureeConservationJours <= 365),
    "Durée de conservation invalide (nombre de jours entre 1 et 365)",
  );
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

export async function listerCategories(db: Db) {
  return db.select().from(categories).orderBy(asc(categories.ordre));
}

export interface SaisieNouveauProduit {
  nom: string;
  categorieId: string | null;
  nouvelleCategorie: string | null;
  unite: (typeof UNITES)[number];
  partsParGateau: number | null;
  format: string | null;
  suiviStock: boolean;
  /** « ingredient » : matière première du laboratoire, toujours suivie en stock, jamais vendue. */
  nature?: (typeof NATURES_PRODUIT)[number];
  fabriqueLabo?: boolean;
}

/** Crée un produit (référence suivante automatique, ex. P074), dans une catégorie existante ou nouvelle. */
export async function creerProduit(db: Db, v: SaisieNouveauProduit, acteur: Acteur): Promise<string> {
  const nom = v.nom.trim();
  exiger(nom, "Le nom est obligatoire");
  exiger(UNITES.includes(v.unite), "Unité invalide");
  exiger(!v.nature || NATURES_PRODUIT.includes(v.nature), "Nature invalide");
  exiger(v.unite !== "part" || (v.partsParGateau && Number.isInteger(v.partsParGateau) && v.partsParGateau > 0), "Indiquer le nombre de parts par gâteau");
  const tous = await db.select({ ref: produits.ref, nom: produits.nom, ordre: produits.ordre }).from(produits);
  exiger(!tous.some((p) => p.nom.trim().toLowerCase() === nom.toLowerCase()), `Un produit « ${nom} » existe déjà`);
  let categorieId = v.categorieId;
  if (!categorieId) {
    const nomCat = v.nouvelleCategorie?.trim();
    exiger(nomCat, "Choisir ou créer une catégorie");
    const cats = await db.select().from(categories);
    const existante = cats.find((c) => c.nom.toLowerCase() === nomCat.toLowerCase());
    categorieId = existante
      ? existante.id
      : (await db.insert(categories).values({ nom: nomCat, ordre: Math.max(0, ...cats.map((c) => c.ordre)) + 1 }).returning({ id: categories.id }))[0].id;
  }
  const numero = Math.max(0, ...tous.map((p) => Number(/^P(\d+)$/.exec(p.ref)?.[1] ?? 0))) + 1;
  const [p] = await db
    .insert(produits)
    .values({
      ref: `P${String(numero).padStart(3, "0")}`,
      nom,
      categorieId,
      unite: v.unite,
      partsParGateau: v.unite === "part" ? v.partsParGateau : null,
      format: v.format?.trim() || null,
      suiviStock: v.nature === "ingredient" ? true : v.suiviStock,
      nature: v.nature ?? "produit",
      fabriqueLabo: v.nature !== "ingredient" && (v.fabriqueLabo ?? false),
      ordre: Math.max(0, ...tous.map((x) => x.ordre)) + 1,
    })
    .returning({ id: produits.id });
  await tracer(db, acteur.id, "creer", "produit", p.id, { ...v });
  return p.id;
}

/**
 * Stock minimum d'un produit sur chaque site qui le stocke (null = pas d'alerte) : les points de vente
 * pour un produit, le laboratoire pour un ingrédient ou un produit qu'il fabrique.
 */
export async function stocksMinimum(db: Db, produitId: string) {
  const [p] = await db.select({ nature: produits.nature, fabriqueLabo: produits.fabriqueLabo }).from(produits).where(eq(produits.id, produitId));
  exiger(p, "Produit introuvable");
  const ss = (await db.select().from(sites).orderBy(asc(sites.ordre))).filter((s) =>
    s.type === "laboratoire" ? p.nature === "ingredient" || p.fabriqueLabo : p.nature === "produit",
  );
  const vals = await db.select().from(produitsSites).where(eq(produitsSites.produitId, produitId));
  return ss.map((s) => ({ siteId: s.id, site: s.nom, statut: s.statut, stockMinimum: vals.find((v) => v.siteId === s.id)?.stockMinimum ?? null }));
}

/** Définit le stock minimum par site ; il déclenche l'alerte de réapprovisionnement à la clôture. */
export async function definirStocksMinimum(db: Db, produitId: string, valeurs: { siteId: string; stockMinimum: number | null }[], acteur: Acteur) {
  const [p] = await db.select({ unite: produits.unite }).from(produits).where(eq(produits.id, produitId));
  exiger(p, "Produit introuvable");
  for (const v of valeurs) {
    exiger(v.stockMinimum === null || estQuantiteValide(v.stockMinimum, UNITES_DECIMALES.includes(p.unite)), "Stock minimum invalide");
    await db
      .insert(produitsSites)
      .values({ produitId, siteId: v.siteId, stockMinimum: v.stockMinimum })
      .onConflictDoUpdate({ target: [produitsSites.produitId, produitsSites.siteId], set: { stockMinimum: v.stockMinimum } });
  }
  await tracer(db, acteur.id, "stocks_minimum", "produit", produitId, { valeurs });
}

// ---------------------------------------------------------------------------
// Fiches techniques et coût de revient calculé
// ---------------------------------------------------------------------------

export interface LigneRecette {
  ingredientId: string;
  ingredient: string;
  unite: (typeof UNITES)[number];
  quantite: number;
  coutUnitaire: number | null;
  cout: number | null;
}

/**
 * Fiche technique d'un produit (pour un gâteau entier si le produit se vend en parts) et son coût :
 * Σ quantité × coût en vigueur de l'ingrédient. `coutParUnite` est ramené à l'unité de stock (la part).
 */
export async function lireRecette(db: Db, produitId: string, journee: Journee) {
  const [p] = await db.select().from(produits).where(eq(produits.id, produitId));
  exiger(p, "Produit introuvable");
  const rows = await db
    .select({ ingredientId: recettes.ingredientId, ingredient: produits.nom, unite: produits.unite, quantite: recettes.quantite })
    .from(recettes)
    .innerJoin(produits, eq(produits.id, recettes.ingredientId))
    .where(eq(recettes.produitId, produitId))
    .orderBy(asc(produits.nom));
  const lignes: LigneRecette[] = [];
  for (const r of rows) {
    const c = await coutEnVigueur(db, r.ingredientId, journee);
    lignes.push({ ...r, coutUnitaire: c, cout: c === null ? null : Math.round(c * r.quantite * 100) / 100 });
  }
  const complet = lignes.length > 0 && lignes.every((l) => l.cout !== null);
  const total = Math.round(lignes.reduce((t, l) => t + (l.cout ?? 0), 0) * 100) / 100;
  const parGateau = p.unite === "part" && p.partsParGateau ? p.partsParGateau : null;
  return {
    lignes,
    complet,
    /** Coût de la recette (un gâteau entier, ou une unité). */
    coutRecette: total,
    parGateau,
    coutParUnite: parGateau ? Math.round((total / parGateau) * 100) / 100 : total,
  };
}

export async function enregistrerRecette(db: Db, produitId: string, lignes: { ingredientId: string; quantite: number }[], acteur: Acteur) {
  const [p] = await db.select().from(produits).where(eq(produits.id, produitId));
  exiger(p, "Produit introuvable");
  exiger(p.nature === "produit", "Un ingrédient n'a pas de fiche technique");
  const utiles = lignes.filter((l) => l.quantite !== 0);
  exiger(new Set(utiles.map((l) => l.ingredientId)).size === utiles.length, "Un ingrédient apparaît deux fois");
  const ingredients = new Set((await db.select({ id: produits.id }).from(produits).where(eq(produits.nature, "ingredient"))).map((x) => x.id));
  for (const l of utiles) {
    exiger(ingredients.has(l.ingredientId), "Ingrédient inconnu");
    exiger(Number.isFinite(l.quantite) && l.quantite > 0 && l.quantite <= 100000, "Quantité invalide dans la fiche technique");
  }
  await db.transaction(async (tx) => {
    await tx.delete(recettes).where(eq(recettes.produitId, produitId));
    if (utiles.length) await tx.insert(recettes).values(utiles.map((l) => ({ produitId, ...l })));
  });
  await tracer(db, acteur.id, "fiche_technique", "produit", produitId, { lignes: utiles });
}

/** Enregistre le coût calculé de la fiche technique comme coût de revient en vigueur. */
export async function appliquerCoutRecette(db: Db, produitId: string, journee: Journee, acteur: Acteur) {
  const r = await lireRecette(db, produitId, journee);
  exiger(r.lignes.length, "La fiche technique est vide");
  exiger(r.complet, "Le coût d'au moins un ingrédient est inconnu : saisissez-le sur sa fiche");
  await ajouterCout(db, produitId, r.coutParUnite, journee, acteur);
  return r.coutParUnite;
}
