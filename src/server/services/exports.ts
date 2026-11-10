import { UNITE_SINGULIER } from "@/domain/unites";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { produits, shifts, sites, utilisateurs, ventesShift } from "@/db/schema";
import { versCsv, type Cellule } from "@/lib/export-csv";
import { heureLocale, type Journee } from "@/domain/temps";
import { listerCanaux } from "./caisse";
import { lignesCalculees } from "./shifts";
import { tableauDeBord } from "./tableau-de-bord";

const STATUTS = { planifie: "Planifié", ouvert: "Ouvert", cloture: "Clôturé", valide: "Validé" };
const UNITES = UNITE_SINGULIER;

/** Une ligne par shift et par produit, sur la période : l'équivalent de l'ancien fichier Excel, consolidé. */
export async function exportDetailShifts(db: Db, filtre: { siteIds: string[]; du: Journee; au: Journee }): Promise<string> {
  const canaux = await listerCanaux(db);
  const entetes = [
    "Date",
    "Site",
    "Créneau",
    "Début",
    "Responsable",
    "Statut",
    "Réf",
    "Catégorie",
    "Produit",
    "Unité",
    "Suivi en stock",
    "Ouverture",
    "Écart de passation",
    "Entrées",
    "Ventes",
    ...canaux.map((c) => `Ventes ${c.nom}`),
    "Pertes péremption",
    "Pertes endommagé",
    "Stock théorique fin",
    "Stock compté fin",
    "Écart",
    "Prix de référence (MAD)",
    "Coût (MAD)",
    "Valeur écart (MAD)",
    "Valeur pertes (MAD)",
    "CA (MAD)",
  ];
  if (!filtre.siteIds.length) return versCsv(entetes, []);
  const sh = await db
    .select({ s: shifts, site: sites.nom, responsable: utilisateurs.nom })
    .from(shifts)
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .leftJoin(utilisateurs, eq(utilisateurs.id, shifts.responsableId))
    .where(
      and(
        inArray(shifts.siteId, filtre.siteIds),
        inArray(shifts.statut, ["ouvert", "cloture", "valide"]),
        gte(shifts.journee, filtre.du),
        lte(shifts.journee, filtre.au),
      ),
    )
    .orderBy(shifts.debutPrevu);
  const lignes: Cellule[][] = [];
  for (const { s, site, responsable } of sh) {
    const ls = await lignesCalculees(db, s.id);
    for (const l of ls) {
      if (!l.suiviStock && !l.ventes) continue;
      lignes.push([
        s.journee.split("-").reverse().join("/"),
        site,
        s.nomCreneau,
        heureLocale(s.debutPrevu),
        responsable,
        STATUTS[s.statut],
        l.ref,
        l.categorie,
        l.nom,
        UNITES[l.unite],
        l.suiviStock ? "oui" : "non",
        l.calcul.ouverture,
        l.calcul.ecartPassation,
        l.entrees,
        l.ventes,
        ...canaux.map((c) => l.ventesParCanal[c.id] ?? 0),
        l.pertesPeremption,
        l.pertesEndommage,
        l.calcul.theoriqueFin,
        l.stockReelFin,
        l.calcul.ecart,
        l.prixVente,
        l.cout,
        l.calcul.valeurEcartVente,
        l.calcul.valeurPertesVente,
        l.calcul.ca,
      ]);
    }
  }
  return versCsv(entetes, lignes);
}

/** Synthèse par produit sur la période : ventes par canal, pertes, écarts. */
export async function exportSyntheseProduits(db: Db, filtre: { siteIds: string[]; du: Journee; au: Journee }): Promise<string> {
  const t = await tableauDeBord(db, filtre);
  const canaux = t.canaux;
  const entetes = ["Produit", ...canaux.map((c) => `Ventes ${c.nom}`), "CA (MAD)", "Pertes péremption", "Pertes endommagé", "Valeur pertes (MAD)", "Écart cumulé", "Valeur écarts (MAD)", "Shifts avec écart"];
  if (!filtre.siteIds.length) return versCsv(entetes, []);
  const ids = (
    await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(inArray(shifts.siteId, filtre.siteIds), inArray(shifts.statut, ["cloture", "valide"]), gte(shifts.journee, filtre.du), lte(shifts.journee, filtre.au)))
  ).map((x) => x.id);
  const ventes = ids.length ? await db.select().from(ventesShift).where(inArray(ventesShift.shiftId, ids)) : [];
  const parProduit = new Map<string, { nom: string; q: Record<string, number>; ca: number }>();
  const noms = new Map((await db.select({ id: produits.id, nom: produits.nom }).from(produits)).map((p) => [p.id, p.nom]));
  for (const v of ventes) {
    const x = parProduit.get(v.produitId) ?? { nom: noms.get(v.produitId) ?? "?", q: {}, ca: 0 };
    x.q[v.canalId] = (x.q[v.canalId] ?? 0) + v.quantite;
    x.ca += v.montant ?? (v.prixUnitaire !== null ? v.quantite * v.prixUnitaire : 0);
    parProduit.set(v.produitId, x);
  }
  const tous = new Set([...parProduit.keys(), ...t.pertes.map((p) => p.produitId), ...t.ecarts.map((e) => e.produitId)]);
  const lignes: Cellule[][] = [...tous]
    .map((id) => {
      const v = parProduit.get(id);
      const p = t.pertes.find((x) => x.produitId === id);
      const e = t.ecarts.find((x) => x.produitId === id);
      return [
        v?.nom ?? p?.produit ?? e?.produit ?? noms.get(id) ?? "?",
        ...canaux.map((c) => v?.q[c.id] ?? 0),
        v ? Math.round(v.ca * 100) / 100 : 0,
        p?.peremption ?? 0,
        p?.endommage ?? 0,
        p?.valeur ?? 0,
        e?.quantite ?? 0,
        e?.valeur ?? 0,
        e?.shifts ?? 0,
      ] as Cellule[];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "fr"));
  return versCsv(entetes, lignes);
}
