import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { articlesCaisse, prixArticlesMagasins, produits } from "@/db/schema";
import { lireCsv } from "@/lib/csv";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { detecterCanal, listerCanaux, nomSansCanal, normaliser, synchroniserPrixReference } from "./caisse";

/**
 * Intégration Loyverse : articles, SKU, catégories et prix par magasin, depuis l'API publique v1.0
 * (jeton d'accès) ou depuis l'export CSV du Back Office (Articles › Exporter).
 * Phase 2 : import des ventes (reçus).
 */
export const URL_API_LOYVERSE = "https://api.loyverse.com/v1.0";

export interface PrixMagasin {
  magasin: string;
  prix: number | null;
  disponible: boolean;
}

export interface VarianteAplatie {
  itemId: string | null;
  variantId: string | null;
  nom: string;
  sku: string | null;
  categorie: string | null;
  prix: number | null;
  prixMagasins: PrixMagasin[];
}

// --- API ---------------------------------------------------------------------

interface VarianteApi {
  variant_id: string;
  sku?: string | null;
  default_price?: number | null;
  option1_value?: string | null;
  option2_value?: string | null;
  option3_value?: string | null;
  stores?: { store_id: string; price?: number | null; pricing_type?: string; available_for_sale?: boolean }[];
}

interface ArticleApi {
  id: string;
  item_name: string;
  category_id?: string | null;
  deleted_at?: string | null;
  variants?: VarianteApi[];
}

type Fetch = typeof fetch;

async function appeler<T>(chemin: string, jeton: string, f: Fetch): Promise<T> {
  const r = await f(`${URL_API_LOYVERSE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (r.status === 401) throw new ErreurMetier("Jeton Loyverse refusé : vérifier le jeton d'accès.");
  if (!r.ok) throw new ErreurMetier(`Loyverse a répondu ${r.status} sur ${chemin}`);
  return (await r.json()) as T;
}

async function toutesLesPages<T>(chemin: string, cle: string, jeton: string, f: Fetch): Promise<T[]> {
  const res: T[] = [];
  let curseur: string | undefined;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ limit: "250" });
    if (curseur) q.set("cursor", curseur);
    const d = await appeler<Record<string, unknown> & { cursor?: string | null }>(`${chemin}?${q}`, jeton, f);
    res.push(...((d[cle] as T[] | undefined) ?? []));
    curseur = d.cursor ?? undefined;
    if (!curseur) break;
  }
  return res;
}

export async function lireMagasinsLoyverse(jeton: string, f: Fetch = fetch) {
  const d = await appeler<{ stores: { id: string; name: string }[] }>("/stores", jeton, f);
  return d.stores ?? [];
}

const nomVariante = (nom: string, options: (string | null | undefined)[], plusieurs: boolean) => {
  const o = options.filter(Boolean).join(" ");
  return plusieurs && o ? `${nom} ${o}` : nom;
};

export async function lireArticlesLoyverse(jeton: string, f: Fetch = fetch): Promise<VarianteAplatie[]> {
  const [items, categories, magasins] = await Promise.all([
    toutesLesPages<ArticleApi>("/items", "items", jeton, f),
    toutesLesPages<{ id: string; name: string }>("/categories", "categories", jeton, f),
    lireMagasinsLoyverse(jeton, f),
  ]);
  const nomsCategories = new Map(categories.map((c) => [c.id, c.name]));
  const nomsMagasins = new Map(magasins.map((m) => [m.id, m.name]));
  const res: VarianteAplatie[] = [];
  for (const it of items) {
    if (it.deleted_at) continue;
    const variantes = it.variants ?? [];
    for (const v of variantes) {
      res.push({
        itemId: it.id,
        variantId: v.variant_id,
        nom: nomVariante(it.item_name, [v.option1_value, v.option2_value, v.option3_value], variantes.length > 1),
        sku: v.sku?.trim() || null,
        categorie: (it.category_id && nomsCategories.get(it.category_id)) || null,
        prix: typeof v.default_price === "number" ? v.default_price : null,
        prixMagasins: (v.stores ?? []).map((s) => ({
          magasin: nomsMagasins.get(s.store_id) ?? s.store_id,
          prix: s.pricing_type === "VARIABLE" || typeof s.price !== "number" ? null : s.price,
          disponible: s.available_for_sale !== false,
        })),
      });
    }
  }
  return res;
}

// --- Export CSV du Back Office ------------------------------------------------

const prixCsv = (v: string | undefined) => {
  const t = (v ?? "").trim().replace(",", ".");
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
};

/** Lit l'export « Articles » du Back Office Loyverse (colonnes Price [magasin], Available for sale [magasin]). */
export function lireExportCsv(texte: string): VarianteAplatie[] {
  const lignes = lireCsv(texte);
  exiger(lignes.length && "SKU" in lignes[0] && "Name" in lignes[0], "Ce fichier n'est pas un export d'articles Loyverse (colonnes SKU et Name attendues)");
  const magasins = Object.keys(lignes[0])
    .map((k) => /^Price \[(.+)\]$/.exec(k)?.[1])
    .filter((m): m is string => Boolean(m));
  const parHandle = new Map<string, number>();
  for (const l of lignes) parHandle.set(l.Handle, (parHandle.get(l.Handle) ?? 0) + 1);
  return lignes
    .filter((l) => l.SKU || l.Name)
    .map((l) => ({
      itemId: null,
      variantId: null,
      nom: nomVariante(l.Name || `(sans nom) ${l.SKU}`, [l["Option 1 value"], l["Option 2 value"], l["Option 3 value"]], (parHandle.get(l.Handle) ?? 1) > 1),
      sku: l.SKU?.trim() || null,
      categorie: l.Category?.trim() || null,
      prix: prixCsv(l["Default price"]),
      prixMagasins: magasins.map((m) => ({
        magasin: m,
        prix: prixCsv(l[`Price [${m}]`]),
        disponible: (l[`Available for sale [${m}]`] ?? "Y").trim().toUpperCase() !== "N",
      })),
    }));
}

// --- Import ------------------------------------------------------------------

/** Correspondance validée SKU Loyverse → produit du catalogue (voir data/correspondances_loyverse.csv). */
export interface Correspondance {
  sku: string;
  refProduit: string;
  facteur: number;
}

export interface RapportImport {
  articlesImportes: number;
  nouveauxAssocies: { article: string; produit: string; canal: string; sku: string | null; facteur: number; par: "correspondance" | "nom" }[];
  nonAssocies: string[];
  produitsSansArticleSurPlace: string[];
}

/**
 * Importe tous les articles Loyverse comme articles de caisse :
 *  - un article déjà connu (même variante ou même SKU) garde son rattachement ; nom, catégorie et prix sont mis à jour ;
 *  - sinon il est rattaché d'après la table de correspondances validée (SKU → produit, facteur),
 *    puis d'après son nom quand il correspond à un seul produit ;
 *  - le canal vient de la catégorie (« Glovo »), sinon du nom ;
 *  - les autres restent « à rattacher » (seulement s'ils sont encore en vente dans un magasin).
 */
export async function importerArticles(
  db: Db,
  articles: VarianteAplatie[],
  acteur: Acteur,
  correspondances: Correspondance[] = [],
): Promise<RapportImport> {
  const canaux = await listerCanaux(db);
  const nomsCanaux = new Map(canaux.map((c) => [c.id, c.nom]));
  const prods = (await db.select().from(produits)).filter((p) => p.actif);
  const parRef = new Map(prods.map((p) => [p.ref, p]));
  const parNom = new Map<string, typeof prods>();
  for (const p of prods) {
    const k = normaliser(p.nom);
    parNom.set(k, [...(parNom.get(k) ?? []), p]);
  }
  const corr = new Map(correspondances.map((c) => [c.sku, c]));
  const existants = await db.select().from(articlesCaisse);
  const parVariante = new Map(existants.filter((e) => e.loyverseVariantId).map((e) => [e.loyverseVariantId!, e]));
  const parSku = new Map(existants.filter((e) => e.sku).map((e) => [e.sku!.toLowerCase(), e]));

  const rapport: RapportImport = { articlesImportes: 0, nouveauxAssocies: [], nonAssocies: [], produitsSansArticleSurPlace: [] };
  const produitsTouches = new Set<string>();

  for (const a of articles) {
    rapport.articlesImportes++;
    const ex = (a.variantId ? parVariante.get(a.variantId) : undefined) ?? (a.sku ? parSku.get(a.sku.toLowerCase()) : undefined);
    const maj = {
      nomCaisse: a.nom,
      categorieCaisse: a.categorie,
      sku: a.sku,
      prixVente: a.prix,
      source: "loyverse" as const,
      majLe: new Date(),
      ...(a.variantId ? { loyverseItemId: a.itemId, loyverseVariantId: a.variantId } : {}),
    };

    // Rattachement proposé pour un article nouveau ou encore non rattaché (et non ignoré).
    let proposition: { produitId: string; produit: string; facteur: number; par: "correspondance" | "nom" } | null = null;
    if (!ex || (!ex.produitId && ex.actif)) {
      const c = a.sku ? corr.get(a.sku) : undefined;
      const p = c ? parRef.get(c.refProduit) : undefined;
      if (c && p) proposition = { produitId: p.id, produit: p.nom, facteur: c.facteur, par: "correspondance" };
      else {
        const candidats = parNom.get(nomSansCanal(a.nom, canaux)) ?? [];
        if (candidats.length === 1) proposition = { produitId: candidats[0].id, produit: candidats[0].nom, facteur: 1, par: "nom" };
      }
    }
    const canal = detecterCanal(a, canaux)!;

    let id: string;
    let produitId: string | null;
    if (ex) {
      id = ex.id;
      produitId = ex.produitId ?? proposition?.produitId ?? null;
      await db
        .update(articlesCaisse)
        .set({ ...maj, ...(proposition && !ex.produitId ? { produitId, facteur: proposition.facteur, canalId: canal.id } : {}) })
        .where(eq(articlesCaisse.id, ex.id));
    } else {
      produitId = proposition?.produitId ?? null;
      const [ins] = await db
        .insert(articlesCaisse)
        .values({ ...maj, canalId: canal.id, produitId, facteur: proposition?.facteur ?? 1 })
        .returning({ id: articlesCaisse.id });
      id = ins.id;
    }
    if (proposition && (!ex || !ex.produitId)) {
      rapport.nouveauxAssocies.push({
        article: a.nom,
        produit: proposition.produit,
        canal: nomsCanaux.get(canal.id) ?? "",
        sku: a.sku,
        facteur: proposition.facteur,
        par: proposition.par,
      });
    }

    for (const pm of a.prixMagasins) {
      await db
        .insert(prixArticlesMagasins)
        .values({ articleId: id, ...pm })
        .onConflictDoUpdate({
          target: [prixArticlesMagasins.articleId, prixArticlesMagasins.magasin],
          set: { prix: pm.prix, disponible: pm.disponible },
        });
    }
    const ignore = ex && !ex.actif;
    const enVente = a.prixMagasins.length === 0 || a.prixMagasins.some((p) => p.disponible);
    if (produitId) produitsTouches.add(produitId);
    else if (!ignore && enVente) rapport.nonAssocies.push(a.nom);
  }

  for (const id of produitsTouches) await synchroniserPrixReference(db, id);
  const surPlace = canaux.find((c) => c.code === "sur_place");
  const avecSurPlace = new Set(
    (await db.select().from(articlesCaisse))
      .filter((x) => x.actif && x.produitId && x.canalId === surPlace?.id)
      .map((x) => x.produitId),
  );
  rapport.produitsSansArticleSurPlace = prods.filter((p) => !avecSurPlace.has(p.id)).map((p) => p.nom);
  await tracer(db, acteur.id, "import_loyverse", "catalogue", null, {
    importes: rapport.articlesImportes,
    nouveauxAssocies: rapport.nouveauxAssocies.length,
    nonAssocies: rapport.nonAssocies.length,
  });
  return rapport;
}
