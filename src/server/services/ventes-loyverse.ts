import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { articlesCaisse, lignesShift, shifts, sites, synchrosLoyverse, ventesShift } from "@/db/schema";
import { estEncadrant, type Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { lireMagasinsLoyverse, URL_API_LOYVERSE } from "./loyverse";

/**
 * Import des ventes d'un shift depuis les reçus Loyverse du magasin du site.
 *
 * Fenêtre : de la clôture du shift précédent du site (les ventes passées entre deux shifts
 * reviennent au suivant) jusqu'à la clôture du shift (ou maintenant s'il est encore ouvert),
 * sur l'heure réelle de vente (receipt_date) — un reçu synchronisé en retard est bien compté.
 * Chaque ligne de reçu → article de caisse (variante ou SKU) → produit × facteur, sur le canal de l'article.
 * Les remboursements sont déduits, les reçus annulés ignorés. Le montant conservé est l'encaissé réel.
 */

export interface LigneRecu {
  variant_id?: string | null;
  sku?: string | null;
  item_name?: string | null;
  quantity: number;
  total_money?: number | null;
}

export interface RecuLoyverse {
  receipt_number: string;
  receipt_type: "SALE" | "REFUND" | string;
  receipt_date: string;
  created_at: string;
  cancelled_at?: string | null;
  store_id: string;
  dining_option?: string | null;
  line_items: LigneRecu[];
}

type Fetch = typeof fetch;

/** Délai de synchronisation toléré entre la vente en caisse et son arrivée chez Loyverse (constaté : ~45 min). */
export const RETARD_SYNCHRO_MS = 3 * 3600_000;

export async function lireRecus(
  jeton: string,
  storeId: string,
  debut: Date,
  fin: Date,
  maintenant: Date,
  f: Fetch = fetch,
): Promise<RecuLoyverse[]> {
  const max = new Date(Math.min(fin.getTime() + RETARD_SYNCHRO_MS, maintenant.getTime()));
  const res: RecuLoyverse[] = [];
  let curseur: string | undefined;
  for (let page = 0; page < 200; page++) {
    const q = new URLSearchParams({
      limit: "250",
      store_id: storeId,
      created_at_min: debut.toISOString(),
      created_at_max: max.toISOString(),
    });
    if (curseur) q.set("cursor", curseur);
    let r: Response;
    try {
      r = await f(`${URL_API_LOYVERSE}/receipts?${q}`, {
        headers: { Authorization: `Bearer ${jeton.trim()}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new ErreurMetier(`Loyverse injoignable (reçus) : ${e instanceof Error ? e.message : String(e)}`);
    }
    if (r.status === 401 || r.status === 403) throw new ErreurMetier(`Jeton Loyverse refusé (${r.status})`);
    if (!r.ok) throw new ErreurMetier(`Loyverse a répondu ${r.status} sur les reçus`);
    const d = (await r.json()) as { receipts?: RecuLoyverse[]; cursor?: string | null };
    res.push(...(d.receipts ?? []));
    curseur = d.cursor ?? undefined;
    if (!curseur) break;
  }
  // Heure réelle de vente dans la fenêtre [début, fin[, reçus annulés exclus.
  return res.filter((x) => {
    const t = Date.parse(x.receipt_date || x.created_at);
    return !x.cancelled_at && t >= debut.getTime() && t < fin.getTime();
  });
}

export interface ArticleConnu {
  produitId: string | null;
  canalId: string;
  facteur: number;
  actif: boolean;
}

export interface Agregat {
  /** Clé « produitId|canalId » → quantité en unités de stock et montant encaissé. */
  ventes: Map<string, { produitId: string; canalId: string; quantite: number; montant: number }>;
  nonReconnus: { sku: string | null; nom: string; quantite: number }[];
  nbRecus: number;
  nbLignes: number;
  montant: number;
}

/** Agrège des reçus par produit et canal (fonction pure, testée). */
export function agregerRecus(
  recus: RecuLoyverse[],
  parVariante: Map<string, ArticleConnu>,
  parSku: Map<string, ArticleConnu>,
): Agregat {
  const ventes: Agregat["ventes"] = new Map();
  const inconnus = new Map<string, { sku: string | null; nom: string; quantite: number }>();
  let nbLignes = 0;
  let montant = 0;
  for (const r of recus) {
    const signe = r.receipt_type === "REFUND" ? -1 : 1;
    for (const l of r.line_items ?? []) {
      nbLignes++;
      const a = (l.variant_id ? parVariante.get(l.variant_id) : undefined) ?? (l.sku ? parSku.get(l.sku.toLowerCase()) : undefined);
      const m = signe * (l.total_money ?? 0);
      montant += m;
      if (a && a.produitId) {
        const cle = `${a.produitId}|${a.canalId}`;
        const v = ventes.get(cle) ?? { produitId: a.produitId, canalId: a.canalId, quantite: 0, montant: 0 };
        v.quantite += signe * l.quantity * a.facteur;
        v.montant += m;
        ventes.set(cle, v);
      } else if (!a || a.actif) {
        // Article ignoré volontairement (hors inventaire) : pas signalé.
        const cle = l.sku ?? l.item_name ?? "?";
        const x = inconnus.get(cle) ?? { sku: l.sku ?? null, nom: l.item_name ?? "(sans nom)", quantite: 0 };
        x.quantite += signe * l.quantity;
        inconnus.set(cle, x);
      }
    }
  }
  for (const v of ventes.values()) {
    v.quantite = Math.round(v.quantite * 1000) / 1000;
    v.montant = Math.round(v.montant * 100) / 100;
  }
  return {
    ventes,
    nonReconnus: [...inconnus.values()].filter((x) => x.quantite !== 0).sort((a, b) => b.quantite - a.quantite),
    nbRecus: recus.length,
    nbLignes,
    montant: Math.round(montant * 100) / 100,
  };
}

/** Identifiant Loyverse du magasin d'un site, retrouvé par son nom et mémorisé. */
async function magasinLoyverse(db: Db, siteId: string, jeton: string, f: Fetch): Promise<string> {
  const [s] = await db.select().from(sites).where(eq(sites.id, siteId));
  exiger(s, "Site introuvable");
  if (s.loyverseStoreId) return s.loyverseStoreId;
  exiger(s.loyverseMagasin, `Aucun magasin Loyverse associé à « ${s.nom} » (écran Loyverse › Magasins)`);
  const m = (await lireMagasinsLoyverse(jeton, f)).find((x) => x.name.trim().toLowerCase() === s.loyverseMagasin!.trim().toLowerCase());
  exiger(m, `Magasin Loyverse « ${s.loyverseMagasin} » introuvable`);
  await db.update(sites).set({ loyverseStoreId: m.id }).where(eq(sites.id, siteId));
  return m.id;
}

export interface RapportVentes {
  nbRecus: number;
  nbLignes: number;
  montant: number;
  produits: number;
  nonReconnus: Agregat["nonReconnus"];
  debut: Date;
  fin: Date;
}

/** Bornes de la fenêtre de ventes d'un shift. */
export async function fenetreVentes(db: Db, shiftId: string, maintenant: Date): Promise<{ debut: Date; fin: Date }> {
  const [s] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  exiger(s, "Shift introuvable");
  let debut = s.ouvertLe ?? s.debutPrevu;
  if (s.shiftPrecedentId) {
    const [p] = await db.select({ clotureLe: shifts.clotureLe }).from(shifts).where(eq(shifts.id, s.shiftPrecedentId));
    // Les ventes entre la clôture précédente et l'ouverture reviennent à ce shift (dans la limite de 24 h).
    if (p?.clotureLe && p.clotureLe < debut && debut.getTime() - p.clotureLe.getTime() < 24 * 3600_000) debut = p.clotureLe;
  }
  return { debut, fin: s.clotureLe ?? maintenant };
}

/**
 * Remplace les ventes d'un shift par celles de Loyverse. Possible pendant le shift, et après clôture
 * pour un encadrant (reçus synchronisés en retard) : la modification est tracée.
 */
export async function importerVentesShift(
  db: Db,
  shiftId: string,
  acteur: Acteur,
  maintenant: Date,
  opts: { jeton: string; fetch?: Fetch },
): Promise<RapportVentes> {
  const f = opts.fetch ?? fetch;
  const [s] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  exiger(s, "Shift introuvable");
  exiger(s.statut !== "planifie", "Le shift n'est pas encore ouvert");
  exiger(s.statut === "ouvert" || estEncadrant(acteur), "Seul un manager peut réimporter les ventes d'un shift clôturé");
  exiger(s.statut !== "valide", "Ce shift est validé : ses ventes ne peuvent plus être modifiées");
  const { debut, fin } = await fenetreVentes(db, shiftId, maintenant);
  try {
    const storeId = await magasinLoyverse(db, s.siteId, opts.jeton, f);
    const recus = await lireRecus(opts.jeton, storeId, debut, fin, maintenant, f);
    const arts = await db.select().from(articlesCaisse);
    const connu = (a: (typeof arts)[number]): ArticleConnu => ({ produitId: a.produitId, canalId: a.canalId, facteur: a.facteur, actif: a.actif });
    const parVariante = new Map(arts.filter((a) => a.loyverseVariantId).map((a) => [a.loyverseVariantId!, connu(a)]));
    const parSku = new Map(arts.filter((a) => a.sku).map((a) => [a.sku!.toLowerCase(), connu(a)]));
    const ag = agregerRecus(recus, parVariante, parSku);

    const lignes = await db.select({ produitId: lignesShift.produitId }).from(lignesShift).where(eq(lignesShift.shiftId, shiftId));
    const produitsDuShift = new Set(lignes.map((l) => l.produitId));
    const valeurs = [...ag.ventes.values()]
      .filter((v) => produitsDuShift.has(v.produitId) && v.quantite > 0)
      .map((v) => ({
        shiftId,
        produitId: v.produitId,
        canalId: v.canalId,
        quantite: Math.round(v.quantite),
        prixUnitaire: v.quantite ? Math.round((v.montant / v.quantite) * 100) / 100 : null,
        montant: v.montant,
        source: "loyverse" as const,
      }));
    const totaux = new Map<string, number>();
    for (const v of valeurs) totaux.set(v.produitId, (totaux.get(v.produitId) ?? 0) + v.quantite);

    await db.transaction(async (tx) => {
      await tx.delete(ventesShift).where(eq(ventesShift.shiftId, shiftId));
      if (valeurs.length) await tx.insert(ventesShift).values(valeurs);
      await tx.update(lignesShift).set({ ventes: 0 }).where(eq(lignesShift.shiftId, shiftId));
      for (const [produitId, total] of totaux) {
        await tx
          .update(lignesShift)
          .set({ ventes: total, modifieLe: maintenant, modifiePar: acteur.id })
          .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
      }
      await tx.update(shifts).set({ ventesSource: "loyverse", ventesImporteesLe: maintenant }).where(eq(shifts.id, shiftId));
      await tx.insert(synchrosLoyverse).values({
        shiftId,
        debut,
        fin,
        statut: "ok",
        nbRecus: ag.nbRecus,
        nbLignes: ag.nbLignes,
        montant: ag.montant,
        nonReconnus: ag.nonReconnus,
        utilisateurId: acteur.id,
      });
    });
    if (s.statut !== "ouvert") {
      await tracer(db, acteur.id, "reimporter_ventes", "shift", shiftId, { recus: ag.nbRecus, montant: ag.montant });
    }
    return { nbRecus: ag.nbRecus, nbLignes: ag.nbLignes, montant: ag.montant, produits: totaux.size, nonReconnus: ag.nonReconnus, debut, fin };
  } catch (e) {
    await db
      .insert(synchrosLoyverse)
      .values({ shiftId, debut, fin, statut: "erreur", erreur: e instanceof Error ? e.message.slice(0, 500) : String(e), utilisateurId: acteur.id })
      .catch(() => undefined);
    throw e;
  }
}

export async function derniereSynchro(db: Db, shiftId: string) {
  const [x] = await db
    .select()
    .from(synchrosLoyverse)
    .where(eq(synchrosLoyverse.shiftId, shiftId))
    .orderBy(desc(synchrosLoyverse.horodatage))
    .limit(1);
  return x ?? null;
}

export async function dernieresSynchros(db: Db, limite = 20) {
  const rows = await db
    .select({ x: synchrosLoyverse, site: sites.nom, journee: shifts.journee, creneau: shifts.nomCreneau })
    .from(synchrosLoyverse)
    .innerJoin(shifts, eq(shifts.id, synchrosLoyverse.shiftId))
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .orderBy(desc(synchrosLoyverse.horodatage))
    .limit(limite);
  return rows.map((r) => ({ ...r.x, site: r.site, journee: r.journee, creneau: r.creneau }));
}

