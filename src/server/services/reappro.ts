import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { bonsLivraison, lignesBon, lignesShift, produits, shifts, sites, type Unite } from "@/db/schema";
import { arrondiQ } from "@/domain/calculs";
import { estEncadrant, type Acteur } from "../acteur";
import { tracer } from "../audit";
import { exiger } from "../erreurs";
import { aAccesAuSite } from "./utilisateurs";

/**
 * Réapprovisionnement : pour chaque site, les produits sous leur stock minimum au dernier comptage
 * de clôture, avec la quantité à fournir pour revenir au minimum — déduction faite de ce qui est
 * déjà en route (bons préparés ou expédiés non reçus). Les produits du labo deviennent un bon de
 * livraison préparé ; les autres (boissons, ingrédients du labo) sont à commander au fournisseur.
 */

export interface BesoinReappro {
  produitId: string;
  produit: string;
  unite: Unite;
  partsParGateau: number | null;
  stock: number;
  minimum: number;
  enRoute: number;
  /** Quantité suggérée, en unité de stock (les cakes arrondis au gâteau entier). */
  aFournir: number;
  source: "labo" | "fournisseur";
}

export interface ReapproSite {
  siteId: string;
  site: string;
  typeSite: "point_de_vente" | "laboratoire";
  journee: string | null;
  besoins: BesoinReappro[];
}

export async function besoinsReappro(db: Db, siteIds: string[]): Promise<ReapproSite[]> {
  const res: ReapproSite[] = [];
  for (const siteId of siteIds) {
    const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
    if (!site) continue;
    const [dernier] = await db
      .select({ id: shifts.id, journee: shifts.journee })
      .from(shifts)
      .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
      .orderBy(desc(shifts.debutPrevu))
      .limit(1);
    const r: ReapproSite = { siteId, site: site.nom, typeSite: site.type, journee: dernier?.journee ?? null, besoins: [] };
    res.push(r);
    if (!dernier) continue;
    const lignes = await db
      .select({
        produitId: produits.id,
        produit: produits.nom,
        unite: produits.unite,
        partsParGateau: produits.partsParGateau,
        fabriqueLabo: produits.fabriqueLabo,
        stock: lignesShift.stockReelFin,
        minimum: lignesShift.stockMinimum,
      })
      .from(lignesShift)
      .innerJoin(produits, eq(produits.id, lignesShift.produitId))
      .where(eq(lignesShift.shiftId, dernier.id))
      .orderBy(asc(produits.ordre));
    // Déjà en route vers ce site.
    const enRoute = new Map<string, number>();
    const rows = await db
      .select({ produitId: lignesBon.produitId, q: lignesBon.quantiteExpediee })
      .from(lignesBon)
      .innerJoin(bonsLivraison, eq(bonsLivraison.id, lignesBon.bonId))
      .where(and(eq(bonsLivraison.siteDestinationId, siteId), inArray(bonsLivraison.statut, ["prepare", "expedie"])));
    for (const x of rows) enRoute.set(x.produitId, arrondiQ((enRoute.get(x.produitId) ?? 0) + x.q));
    for (const l of lignes) {
      if (l.stock === null || l.minimum === null || l.stock >= l.minimum) continue;
      const route = enRoute.get(l.produitId) ?? 0;
      let q = arrondiQ(l.minimum - l.stock - route);
      if (q <= 0) continue;
      if (l.unite === "part" && l.partsParGateau) q = Math.ceil(q / l.partsParGateau) * l.partsParGateau;
      else if (l.unite !== "kg" && l.unite !== "litre") q = Math.ceil(q);
      r.besoins.push({
        produitId: l.produitId,
        produit: l.produit,
        unite: l.unite,
        partsParGateau: l.partsParGateau,
        stock: l.stock,
        minimum: l.minimum,
        enRoute: route,
        aFournir: q,
        source: site.type === "point_de_vente" && l.fabriqueLabo ? "labo" : "fournisseur",
      });
    }
  }
  return res;
}

/**
 * Prépare, depuis le laboratoire, le bon de réapprovisionnement d'un point de vente (produits du labo
 * sous le minimum). L'équipe du labo le retrouve dans ses livraisons, ajuste et l'expédie.
 */
export async function preparerBonReappro(db: Db, siteDestinationId: string, acteur: Acteur, maintenant: Date): Promise<{ bonId: string; numero: number; lignes: number }> {
  exiger(estEncadrant(acteur), "Seul un manager peut préparer un bon de réapprovisionnement");
  exiger(await aAccesAuSite(db, acteur.id, siteDestinationId), "Vous n'êtes pas rattaché à ce point de vente");
  const [labo] = await db.select().from(sites).where(eq(sites.type, "laboratoire")).orderBy(asc(sites.ordre)).limit(1);
  exiger(labo, "Aucun laboratoire déclaré");
  const [b] = await besoinsReappro(db, [siteDestinationId]);
  const duLabo = (b?.besoins ?? []).filter((x) => x.source === "labo");
  exiger(duLabo.length, "Aucun produit du laboratoire sous le stock minimum (ou déjà en route)");
  const bon = await db.transaction(async (tx) => {
    const [x] = await tx
      .insert(bonsLivraison)
      .values({ siteOrigineId: labo.id, siteDestinationId, commentaire: "Réapprovisionnement (stock minimum)", creePar: acteur.id, creeLe: maintenant })
      .returning({ id: bonsLivraison.id, numero: bonsLivraison.numero });
    await tx.insert(lignesBon).values(duLabo.map((l) => ({ bonId: x.id, produitId: l.produitId, quantiteExpediee: l.aFournir })));
    return x;
  });
  await tracer(db, acteur.id, "preparer_reappro", "bon_livraison", bon.id, { destination: siteDestinationId, lignes: duLabo.length });
  return { bonId: bon.id, numero: bon.numero, lignes: duLabo.length };
}
