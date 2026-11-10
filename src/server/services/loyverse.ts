import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { produits } from "@/db/schema";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier } from "../erreurs";

/**
 * Intégration Loyverse (API publique v1.0, jeton d'accès créé dans le Back Office).
 * Phase 1 : import des articles, SKU et prix de vente. Phase 2 : import des ventes (reçus).
 */
export const URL_API_LOYVERSE = "https://api.loyverse.com/v1.0";

interface VarianteLoyverse {
  variant_id: string;
  sku?: string | null;
  default_price?: number | null;
  option1_value?: string | null;
  option2_value?: string | null;
  option3_value?: string | null;
}

interface ArticleLoyverse {
  id: string;
  item_name: string;
  deleted_at?: string | null;
  variants?: VarianteLoyverse[];
}

export interface VarianteAplatie {
  itemId: string;
  variantId: string;
  nom: string;
  sku: string | null;
  prix: number | null;
}

type Fetch = typeof fetch;

async function appeler<T>(chemin: string, jeton: string, f: Fetch): Promise<T> {
  const r = await f(`${URL_API_LOYVERSE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  if (r.status === 401) throw new ErreurMetier("Jeton Loyverse refusé : vérifier le jeton d'accès.");
  if (!r.ok) throw new ErreurMetier(`Loyverse a répondu ${r.status} sur ${chemin}`);
  return (await r.json()) as T;
}

export async function lireArticlesLoyverse(jeton: string, f: Fetch = fetch): Promise<VarianteAplatie[]> {
  const res: VarianteAplatie[] = [];
  let curseur: string | undefined;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ limit: "250" });
    if (curseur) q.set("cursor", curseur);
    const d = await appeler<{ items: ArticleLoyverse[]; cursor?: string | null }>(`/items?${q}`, jeton, f);
    for (const it of d.items ?? []) {
      if (it.deleted_at) continue;
      const variantes = it.variants ?? [];
      for (const v of variantes) {
        const options = [v.option1_value, v.option2_value, v.option3_value].filter(Boolean).join(" ");
        res.push({
          itemId: it.id,
          variantId: v.variant_id,
          nom: variantes.length > 1 && options ? `${it.item_name} ${options}` : it.item_name,
          sku: v.sku?.trim() || null,
          prix: typeof v.default_price === "number" ? v.default_price : null,
        });
      }
    }
    curseur = d.cursor ?? undefined;
    if (!curseur) break;
  }
  return res;
}

export async function lireMagasinsLoyverse(jeton: string, f: Fetch = fetch) {
  const d = await appeler<{ stores: { id: string; name: string }[] }>("/stores", jeton, f);
  return d.stores ?? [];
}

export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface RapportImport {
  associes: { produit: string; sku: string | null; prix: number | null; par: "sku" | "nom" }[];
  produitsSansCorrespondance: string[];
  articlesLoyverseNonUtilises: string[];
}

/**
 * Associe les produits du catalogue aux articles Loyverse (par SKU, sinon par nom)
 * et reprend le prix de vente de Loyverse, qui reste la référence des prix.
 */
export async function importerArticles(db: Db, articles: VarianteAplatie[], acteur: Acteur): Promise<RapportImport> {
  const prods = await db.select().from(produits);
  const parSku = new Map(articles.filter((a) => a.sku).map((a) => [a.sku!.toLowerCase(), a]));
  const parNom = new Map<string, VarianteAplatie[]>();
  for (const a of articles) {
    const k = normaliser(a.nom);
    parNom.set(k, [...(parNom.get(k) ?? []), a]);
  }
  const utilises = new Set<string>();
  const rapport: RapportImport = { associes: [], produitsSansCorrespondance: [], articlesLoyverseNonUtilises: [] };
  for (const p of prods) {
    let a: VarianteAplatie | undefined;
    let par: "sku" | "nom" = "sku";
    if (p.sku) a = parSku.get(p.sku.toLowerCase());
    if (!a) {
      const candidats = (parNom.get(normaliser(p.nom)) ?? []).filter((c) => !utilises.has(c.variantId));
      if (candidats.length === 1) {
        a = candidats[0];
        par = "nom";
      }
    }
    if (!a) {
      if (p.actif) rapport.produitsSansCorrespondance.push(p.nom);
      continue;
    }
    utilises.add(a.variantId);
    await db
      .update(produits)
      .set({
        sku: a.sku ?? p.sku,
        loyverseItemId: a.itemId,
        loyverseVariantId: a.variantId,
        prixVente: a.prix ?? p.prixVente,
      })
      .where(eq(produits.id, p.id));
    rapport.associes.push({ produit: p.nom, sku: a.sku, prix: a.prix, par });
  }
  rapport.articlesLoyverseNonUtilises = articles.filter((a) => !utilises.has(a.variantId)).map((a) => a.nom);
  await tracer(db, acteur.id, "import_loyverse", "catalogue", null, {
    associes: rapport.associes.length,
    sansCorrespondance: rapport.produitsSansCorrespondance.length,
  });
  return rapport;
}
