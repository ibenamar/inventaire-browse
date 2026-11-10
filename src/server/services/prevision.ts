import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { bonsLivraison, lignesBon, lignesShift, mouvements, produits, shifts, sites, type Unite } from "@/db/schema";
import { arrondiQ } from "@/domain/calculs";
import { ajouterJours, type Journee } from "@/domain/temps";
import { lignesCalculees } from "./shifts";

/**
 * Prévision de production du laboratoire pour une journée : pour chaque point de vente, la moyenne
 * des ventes et pertes des mêmes jours de semaine (4 dernières semaines), plus le stock minimum,
 * moins le stock au dernier comptage et ce qui est déjà en route ; puis, au labo, moins son stock.
 * Les cakes sont arrondis au gâteau entier.
 */
export interface LignePrevision {
  produitId: string;
  produit: string;
  unite: Unite;
  partsParGateau: number | null;
  parSite: Record<string, { besoin: number; stock: number; enRoute: number; aLivrer: number }>;
  stockLabo: number;
  aProduire: number;
}

export const SEMAINES_HISTORIQUE = 4;

const arrondiProduit = (q: number, p: { unite: Unite; partsParGateau: number | null }) =>
  q <= 0 ? 0 : p.unite === "part" && p.partsParGateau ? Math.ceil(q / p.partsParGateau) * p.partsParGateau : p.unite === "kg" || p.unite === "litre" ? arrondiQ(q) : Math.ceil(q);

async function dernierClos(db: Db, siteId: string) {
  const [s] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
    .orderBy(desc(shifts.debutPrevu))
    .limit(1);
  return s ?? null;
}

/** `siteIds` : points de vente visibles par la personne (les autres ne sont ni lus ni affichés). */
export async function previsionProduction(db: Db, journee: Journee, siteIds?: string[]) {
  const pdv = (await db.select().from(sites).where(and(eq(sites.type, "point_de_vente"), eq(sites.statut, "actif"))).orderBy(asc(sites.ordre))).filter(
    (s) => !siteIds || siteIds.includes(s.id),
  );
  const [labo] = await db.select().from(sites).where(eq(sites.type, "laboratoire")).orderBy(asc(sites.ordre)).limit(1);
  const prods = await db.select().from(produits).where(and(eq(produits.fabriqueLabo, true), eq(produits.actif, true))).orderBy(asc(produits.ordre));
  const jours = Array.from({ length: SEMAINES_HISTORIQUE }, (_, i) => ajouterJours(journee, -7 * (i + 1)));
  const lignes = new Map<string, LignePrevision>(
    prods.map((p) => [p.id, { produitId: p.id, produit: p.nom, unite: p.unite, partsParGateau: p.partsParGateau, parSite: {}, stockLabo: 0, aProduire: 0 }]),
  );

  for (const s of pdv) {
    // Ventes + pertes des mêmes jours de semaine, en moyenne sur les jours où des shifts ont été clôturés.
    const sh = await db
      .select({ id: shifts.id, journee: shifts.journee })
      .from(shifts)
      .where(and(eq(shifts.siteId, s.id), inArray(shifts.journee, jours), inArray(shifts.statut, ["cloture", "valide"])));
    const joursAvecDonnees = new Set(sh.map((x) => x.journee)).size;
    const sorties = new Map<string, number>();
    for (const x of sh)
      for (const l of await lignesCalculees(db, x.id)) sorties.set(l.produitId, (sorties.get(l.produitId) ?? 0) + l.ventes + l.pertes);
    const dernier = await dernierClos(db, s.id);
    const stock = new Map<string, { q: number | null; min: number | null }>();
    if (dernier)
      for (const l of await db.select().from(lignesShift).where(eq(lignesShift.shiftId, dernier.id)))
        stock.set(l.produitId, { q: l.stockReelFin, min: l.stockMinimum });
    const enRoute = new Map<string, number>();
    for (const r of await db
      .select({ produitId: lignesBon.produitId, q: lignesBon.quantiteExpediee })
      .from(lignesBon)
      .innerJoin(bonsLivraison, eq(bonsLivraison.id, lignesBon.bonId))
      .where(and(eq(bonsLivraison.siteDestinationId, s.id), inArray(bonsLivraison.statut, ["prepare", "expedie"]))))
      enRoute.set(r.produitId, (enRoute.get(r.produitId) ?? 0) + r.q);
    for (const p of prods) {
      const besoin = joursAvecDonnees ? arrondiQ((sorties.get(p.id) ?? 0) / joursAvecDonnees) : 0;
      const st = stock.get(p.id);
      const q = st?.q ?? 0;
      const route = enRoute.get(p.id) ?? 0;
      const aLivrer = arrondiProduit(besoin + (st?.min ?? 0) - q - route, p);
      if (besoin || aLivrer) lignes.get(p.id)!.parSite[s.nom] = { besoin, stock: q, enRoute: route, aLivrer };
    }
  }

  if (labo) {
    const dernier = await dernierClos(db, labo.id);
    if (dernier)
      for (const l of await db.select().from(lignesShift).where(eq(lignesShift.shiftId, dernier.id))) {
        const x = lignes.get(l.produitId);
        if (x) x.stockLabo = l.stockReelFin ?? 0;
      }
  }
  for (const x of lignes.values()) {
    const total = Object.values(x.parSite).reduce((t, v) => t + v.aLivrer, 0);
    x.aProduire = arrondiProduit(total - x.stockLabo, x);
  }
  return {
    journee,
    jours,
    sites: pdv.map((s) => s.nom),
    lignes: [...lignes.values()].filter((x) => x.aProduire > 0 || Object.keys(x.parSite).length),
  };
}

/**
 * Stock probablement au-delà de sa durée de conservation, en supposant que le plus ancien part en
 * premier : stock compté à la dernière clôture − entrées (réceptions, production) des N derniers jours.
 */
export async function stockPerime(db: Db, siteId: string, maintenant: Date) {
  const [dernier] = await db
    .select({ id: shifts.id, clotureLe: shifts.clotureLe, finPrevue: shifts.finPrevue })
    .from(shifts)
    .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
    .orderBy(desc(shifts.debutPrevu))
    .limit(1);
  if (!dernier) return [];
  const [premier] = await db
    .select({ debut: shifts.debutPrevu })
    .from(shifts)
    .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
    .orderBy(asc(shifts.debutPrevu))
    .limit(1);
  const lignes = await db
    .select({ produitId: produits.id, produit: produits.nom, unite: produits.unite, partsParGateau: produits.partsParGateau, duree: produits.dureeConservationJours, stock: lignesShift.stockReelFin })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .where(eq(lignesShift.shiftId, dernier.id));
  const res: { produit: string; unite: Unite; partsParGateau: number | null; quantite: number; duree: number }[] = [];
  for (const l of lignes) {
    if (!l.duree || !l.stock || l.stock <= 0) continue;
    const depuis = new Date(maintenant.getTime() - l.duree * 24 * 3600_000);
    // Sans historique couvrant toute la durée, l'âge du stock est inconnu : pas d'alerte.
    if (!premier || premier.debut > depuis) continue;
    const recents = (
      await db
        .select({ q: mouvements.quantite })
        .from(mouvements)
        .innerJoin(shifts, eq(shifts.id, mouvements.shiftId))
        .where(
          and(
            eq(shifts.siteId, siteId),
            eq(mouvements.produitId, l.produitId),
            eq(mouvements.type, "entree"),
            gte(mouvements.horodatage, depuis),
            lte(mouvements.horodatage, maintenant),
          ),
        )
    ).reduce((t, x) => t + x.q, 0);
    const vieux = arrondiQ(l.stock - recents);
    if (vieux > 0) res.push({ produit: l.produit, unite: l.unite, partsParGateau: l.partsParGateau, quantite: vieux, duree: l.duree });
  }
  return res;
}
