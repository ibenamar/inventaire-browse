import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { articlesCaisse, canauxVente, prixArticlesMagasins, produits, sites } from "@/db/schema";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { exiger } from "../erreurs";

/**
 * Articles de caisse : un produit physique (ex. Mango Can) est vendu sous plusieurs articles
 * Loyverse — un par canal (sur place, Glovo…), parfois par lot (« Matilda Cake Entier » = 8 parts,
 * « Brownie box of 4 » = 4) — chacun avec son SKU et son prix, qui peut varier selon le magasin.
 * Toutes ces ventes font sortir le stock du même produit ; le CA utilise le prix réel.
 */
export const CODE_SUR_PLACE = "sur_place";

export type Canal = typeof canauxVente.$inferSelect;
export type ArticleCaisse = typeof articlesCaisse.$inferSelect;

export async function listerCanaux(db: Db): Promise<Canal[]> {
  return db.select().from(canauxVente).where(eq(canauxVente.actif, true)).orderBy(asc(canauxVente.ordre));
}

export async function canalSurPlace(db: Db): Promise<Canal> {
  const [c] = await db.select().from(canauxVente).where(eq(canauxVente.code, CODE_SUR_PLACE));
  exiger(c, "Canal « sur place » manquant");
  return c;
}

export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const contientMot = (texte: string, mot: string) => ` ${normaliser(texte)} `.includes(` ${normaliser(mot)} `);

/**
 * Canal d'un article Loyverse : d'abord d'après sa catégorie (chez Browse, la catégorie « Glovo »),
 * sinon d'après son nom ; à défaut, sur place.
 */
export function detecterCanal<T extends Pick<Canal, "code" | "motsCles">>(
  article: { nom: string; categorie?: string | null },
  canaux: T[],
): T | undefined {
  const parMot = (texte: string) => canaux.find((c) => c.motsCles.some((m) => contientMot(texte, m)));
  return (
    (article.categorie ? parMot(article.categorie) : undefined) ??
    parMot(article.nom) ??
    canaux.find((c) => c.code === CODE_SUR_PLACE)
  );
}

/** Nom de l'article sans les mots qui désignent le canal : « Mango Can (Glovo) » → « mango can ». */
export function nomSansCanal(nom: string, canaux: Pick<Canal, "motsCles">[]): string {
  let n = ` ${normaliser(nom)} `;
  for (const m of canaux.flatMap((c) => c.motsCles)) n = n.replaceAll(` ${normaliser(m)} `, " ");
  return n.replace(/\s+/g, " ").trim();
}

export interface ArticleVue extends ArticleCaisse {
  canal: string;
  canalCode: string;
  produit: string | null;
  prixMagasins: { magasin: string; prix: number | null; disponible: boolean }[];
}

export async function listerArticles(
  db: Db,
  opts: { produitId?: string; nonAssocies?: boolean } = {},
): Promise<ArticleVue[]> {
  const rows = await db
    .select({ a: articlesCaisse, canal: canauxVente.nom, canalCode: canauxVente.code, produit: produits.nom })
    .from(articlesCaisse)
    .innerJoin(canauxVente, eq(canauxVente.id, articlesCaisse.canalId))
    .leftJoin(produits, eq(produits.id, articlesCaisse.produitId))
    .where(
      and(
        eq(articlesCaisse.actif, true),
        opts.produitId ? eq(articlesCaisse.produitId, opts.produitId) : undefined,
        opts.nonAssocies ? isNull(articlesCaisse.produitId) : undefined,
      ),
    )
    .orderBy(asc(canauxVente.ordre), asc(articlesCaisse.facteur), asc(articlesCaisse.nomCaisse));
  const ids = rows.map((r) => r.a.id);
  const prix = ids.length ? await db.select().from(prixArticlesMagasins).where(inArray(prixArticlesMagasins.articleId, ids)) : [];
  return rows.map((r) => ({
    ...r.a,
    canal: r.canal,
    canalCode: r.canalCode,
    produit: r.produit,
    prixMagasins: prix
      .filter((p) => p.articleId === r.a.id)
      .map(({ magasin, prix: px, disponible }) => ({ magasin, prix: px, disponible }))
      .sort((x, y) => x.magasin.localeCompare(y.magasin)),
  }));
}

/** Article encore vendu quelque part (sans information de magasin, on le considère disponible). */
export const estDisponible = (a: Pick<ArticleVue, "prixMagasins">) =>
  a.prixMagasins.length === 0 || a.prixMagasins.some((p) => p.disponible);

/** Le prix de référence du produit suit son article « sur place » unitaire (prix par défaut). */
export async function synchroniserPrixReference(db: Db, produitId: string) {
  const [a] = await db
    .select({ prix: articlesCaisse.prixVente })
    .from(articlesCaisse)
    .innerJoin(canauxVente, eq(canauxVente.id, articlesCaisse.canalId))
    .where(
      and(
        eq(articlesCaisse.produitId, produitId),
        eq(articlesCaisse.actif, true),
        eq(articlesCaisse.facteur, 1),
        eq(canauxVente.code, CODE_SUR_PLACE),
      ),
    )
    .limit(1);
  if (a && a.prix !== null) await db.update(produits).set({ prixVente: a.prix }).where(eq(produits.id, produitId));
}

async function magasinDuSite(db: Db, siteId: string | null): Promise<string | null> {
  if (!siteId) return null;
  const [s] = await db.select({ m: sites.loyverseMagasin }).from(sites).where(eq(sites.id, siteId));
  return s?.m ?? null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * Prix d'une unité de stock vendue sur un canal, dans le magasin du site : article du canal au plus
 * petit facteur (prix du magasin, sinon prix par défaut, divisé par le facteur), à défaut le prix de référence.
 */
export async function prixSurCanal(db: Db, produitId: string, canalId: string, siteId: string | null = null): Promise<number | null> {
  const magasin = await magasinDuSite(db, siteId);
  const [a] = await db
    .select()
    .from(articlesCaisse)
    .where(and(eq(articlesCaisse.produitId, produitId), eq(articlesCaisse.canalId, canalId), eq(articlesCaisse.actif, true)))
    .orderBy(asc(articlesCaisse.facteur))
    .limit(1);
  if (a) {
    if (magasin) {
      const [pm] = await db
        .select()
        .from(prixArticlesMagasins)
        .where(and(eq(prixArticlesMagasins.articleId, a.id), eq(prixArticlesMagasins.magasin, magasin)));
      if (pm && pm.prix !== null) return arrondi(pm.prix / a.facteur);
    }
    if (a.prixVente !== null) return arrondi(a.prixVente / a.facteur);
  }
  return (await prixReferences(db, siteId)).get(produitId) ?? null;
}

/** Prix de référence (sur place, magasin du site) de tous les produits : sert à valoriser pertes et écarts. */
export async function prixReferences(db: Db, siteId: string | null): Promise<Map<string, number | null>> {
  const magasin = await magasinDuSite(db, siteId);
  const res = new Map<string, number | null>(
    (await db.select({ id: produits.id, prix: produits.prixVente }).from(produits)).map((p) => [p.id, p.prix]),
  );
  if (!magasin) return res;
  const rows = await db
    .select({ produitId: articlesCaisse.produitId, prix: prixArticlesMagasins.prix })
    .from(articlesCaisse)
    .innerJoin(canauxVente, eq(canauxVente.id, articlesCaisse.canalId))
    .innerJoin(prixArticlesMagasins, eq(prixArticlesMagasins.articleId, articlesCaisse.id))
    .where(
      and(
        eq(articlesCaisse.actif, true),
        eq(articlesCaisse.facteur, 1),
        eq(canauxVente.code, CODE_SUR_PLACE),
        eq(prixArticlesMagasins.magasin, magasin),
      ),
    );
  for (const r of rows) if (r.produitId && r.prix !== null) res.set(r.produitId, r.prix);
  return res;
}

const exigerFacteur = (f: number) =>
  exiger(Number.isInteger(f) && f >= 1 && f <= 100, "Le facteur doit être un entier entre 1 et 100");

export interface SaisieArticle {
  produitId: string;
  canalId: string;
  nomCaisse: string;
  sku: string | null;
  prixVente: number | null;
  facteur: number;
}

/** Ajout manuel d'un article de caisse (avant l'import Loyverse, ou pour un article non reconnu). */
export async function ajouterArticle(db: Db, v: SaisieArticle, acteur: Acteur) {
  exiger(v.nomCaisse.trim(), "Indiquer le nom de l'article en caisse");
  exiger(v.prixVente === null || (Number.isFinite(v.prixVente) && v.prixVente >= 0), "Prix invalide");
  exigerFacteur(v.facteur);
  const sku = v.sku?.trim() || null;
  if (sku) {
    const [doublon] = await db.select({ id: articlesCaisse.id }).from(articlesCaisse).where(eq(articlesCaisse.sku, sku));
    exiger(!doublon, `Le SKU ${sku} est déjà utilisé par un autre article`);
  }
  const [a] = await db
    .insert(articlesCaisse)
    .values({ produitId: v.produitId, canalId: v.canalId, nomCaisse: v.nomCaisse.trim(), sku, prixVente: v.prixVente, facteur: v.facteur })
    .returning({ id: articlesCaisse.id });
  await synchroniserPrixReference(db, v.produitId);
  await tracer(db, acteur.id, "ajouter_article_caisse", "produit", v.produitId, { ...v });
  return a.id;
}

/** Rattache un article de caisse à un produit, un canal et un facteur (ou le détache : produitId null). */
export async function associerArticle(
  db: Db,
  articleId: string,
  v: { produitId: string | null; canalId: string; facteur: number },
  acteur: Acteur,
) {
  exigerFacteur(v.facteur);
  const [a] = await db.select().from(articlesCaisse).where(eq(articlesCaisse.id, articleId));
  exiger(a, "Article introuvable");
  await db
    .update(articlesCaisse)
    .set({ produitId: v.produitId, canalId: v.canalId, facteur: v.facteur, actif: true, majLe: new Date() })
    .where(eq(articlesCaisse.id, articleId));
  for (const id of new Set([a.produitId, v.produitId])) if (id) await synchroniserPrixReference(db, id);
  await tracer(db, acteur.id, "associer_article_caisse", "article_caisse", articleId, { ...v, avant: a.produitId });
}

/** Retire un article d'un produit : un article Loyverse revient « à rattacher », un article manuel est désactivé. */
export async function retirerArticle(db: Db, articleId: string, acteur: Acteur) {
  const [a] = await db.select().from(articlesCaisse).where(eq(articlesCaisse.id, articleId));
  exiger(a, "Article introuvable");
  if (a.source === "loyverse") await db.update(articlesCaisse).set({ produitId: null }).where(eq(articlesCaisse.id, articleId));
  else await db.update(articlesCaisse).set({ actif: false }).where(eq(articlesCaisse.id, articleId));
  await tracer(db, acteur.id, "retirer_article_caisse", "article_caisse", articleId, { produitId: a.produitId });
}

/** Article Loyverse hors inventaire (ex. boisson chaude) : il n'apparaît plus dans les articles à rattacher. */
export async function ignorerArticle(db: Db, articleId: string, acteur: Acteur) {
  await db.update(articlesCaisse).set({ actif: false, produitId: null }).where(eq(articlesCaisse.id, articleId));
  await tracer(db, acteur.id, "ignorer_article_caisse", "article_caisse", articleId);
}

/** Ignore d'un coup les articles non rattachés d'une catégorie Loyverse (ex. COFFEES, Lunch). */
export async function ignorerCategorie(db: Db, categorie: string | null, acteur: Acteur): Promise<number> {
  const cond = and(
    isNull(articlesCaisse.produitId),
    eq(articlesCaisse.actif, true),
    categorie === null ? isNull(articlesCaisse.categorieCaisse) : eq(articlesCaisse.categorieCaisse, categorie),
  );
  const res = await db.update(articlesCaisse).set({ actif: false }).where(cond).returning({ id: articlesCaisse.id });
  await tracer(db, acteur.id, "ignorer_categorie_caisse", "catalogue", null, { categorie, articles: res.length });
  return res.length;
}

/** Magasins Loyverse connus (d'après les prix importés). */
export async function magasinsConnus(db: Db): Promise<string[]> {
  const rows = await db.selectDistinct({ m: prixArticlesMagasins.magasin }).from(prixArticlesMagasins);
  return rows.map((r) => r.m).sort();
}
