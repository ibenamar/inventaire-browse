import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { categories, lignesShift, produits, shifts, sites, ventesShift } from "@/db/schema";
import { calculerLigne } from "@/domain/calculs";
import type { Journee } from "@/domain/temps";
import { listerCanaux } from "./caisse";
import { agregatsMouvements } from "./shifts";

/**
 * Données du tableau de bord sur une période (shifts clôturés ou validés des sites choisis) :
 * chiffres clés, CA par jour et par canal, écarts et pertes par produit, alertes de réapprovisionnement.
 */
export interface TableauDeBord {
  kpi: {
    shiftsClos: number;
    ca: number;
    caParCanal: { canalId: string; canal: string; montant: number; quantite: number }[];
    articlesVendus: number;
    pertes: number;
    pertesPeremption: number;
    pertesEndommage: number;
    valeurPertes: number;
    valeurEcarts: number;
    produitsEnEcart: number;
    ecartsPassation: number;
  };
  caParJour: { journee: Journee; parCanal: Record<string, number> }[];
  canaux: { id: string; nom: string }[];
  ecarts: { produitId: string; produit: string; categorie: string; quantite: number; valeur: number; shifts: number; prixConnu: boolean }[];
  pertes: { produitId: string; produit: string; peremption: number; endommage: number; valeur: number; prixConnu: boolean }[];
  alertes: { siteId: string; site: string; shiftId: string; journee: Journee; produit: string; stock: number; minimum: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function tableauDeBord(db: Db, filtre: { siteIds: string[]; du: Journee; au: Journee }): Promise<TableauDeBord> {
  const canaux = await listerCanaux(db);
  const vide: TableauDeBord = {
    kpi: {
      shiftsClos: 0,
      ca: 0,
      caParCanal: [],
      articlesVendus: 0,
      pertes: 0,
      pertesPeremption: 0,
      pertesEndommage: 0,
      valeurPertes: 0,
      valeurEcarts: 0,
      produitsEnEcart: 0,
      ecartsPassation: 0,
    },
    caParJour: [],
    canaux: canaux.map((c) => ({ id: c.id, nom: c.nom })),
    ecarts: [],
    pertes: [],
    alertes: [],
  };
  if (!filtre.siteIds.length) return vide;

  const sh = await db
    .select({ id: shifts.id, journee: shifts.journee })
    .from(shifts)
    .where(
      and(
        inArray(shifts.siteId, filtre.siteIds),
        inArray(shifts.statut, ["cloture", "valide"]),
        gte(shifts.journee, filtre.du),
        lte(shifts.journee, filtre.au),
      ),
    );
  const ids = sh.map((s) => s.id);
  const journeeDe = new Map(sh.map((s) => [s.id, s.journee]));
  const t: TableauDeBord = { ...vide, kpi: { ...vide.kpi, shiftsClos: ids.length }, alertes: await alertesReappro(db, filtre.siteIds) };
  if (!ids.length) return t;

  const [lignes, ventes, ag] = await Promise.all([
    db
      .select({ l: lignesShift, produit: produits.nom, categorie: categories.nom })
      .from(lignesShift)
      .innerJoin(produits, eq(produits.id, lignesShift.produitId))
      .innerJoin(categories, eq(categories.id, produits.categorieId))
      .where(inArray(lignesShift.shiftId, ids)),
    db.select().from(ventesShift).where(inArray(ventesShift.shiftId, ids)),
    agregatsMouvements(db, ids),
  ]);

  // Ventes : CA par canal et par jour (montant encaissé, sinon quantité × prix du canal).
  const caCanal = new Map<string, { montant: number; quantite: number }>();
  const parJour = new Map<string, Record<string, number>>();
  const montantParLigne = new Map<string, number>();
  for (const v of ventes) {
    const m = v.montant ?? (v.prixUnitaire !== null ? v.quantite * v.prixUnitaire : 0);
    const c = caCanal.get(v.canalId) ?? { montant: 0, quantite: 0 };
    c.montant += m;
    c.quantite += v.quantite;
    caCanal.set(v.canalId, c);
    const j = journeeDe.get(v.shiftId)!;
    const jour = parJour.get(j) ?? {};
    jour[v.canalId] = (jour[v.canalId] ?? 0) + m;
    parJour.set(j, jour);
    const cle = `${v.shiftId}:${v.produitId}`;
    montantParLigne.set(cle, (montantParLigne.get(cle) ?? 0) + m);
  }

  const ecarts = new Map<string, TableauDeBord["ecarts"][number]>();
  const pertes = new Map<string, TableauDeBord["pertes"][number]>();
  const k = t.kpi;
  for (const { l, produit, categorie } of lignes) {
    const a = ag.get(`${l.shiftId}:${l.produitId}`) ?? { entrees: 0, pertes: 0, peremption: 0, endommage: 0 };
    const cle = `${l.shiftId}:${l.produitId}`;
    const c = calculerLigne({
      ...l,
      entrees: a.entrees,
      pertes: a.pertes,
      montantVentes: montantParLigne.has(cle) ? montantParLigne.get(cle)! : null,
    });
    k.ca += c.ca ?? 0;
    k.articlesVendus += l.ventes;
    k.pertes += a.pertes;
    k.pertesPeremption += a.peremption;
    k.pertesEndommage += a.endommage;
    k.valeurPertes += c.valeurPertesVente ?? 0;
    k.valeurEcarts += c.valeurEcartVente ?? 0;
    if (c.ecartPassation) k.ecartsPassation++;
    if (c.ecart) {
      const e = ecarts.get(l.produitId) ?? { produitId: l.produitId, produit, categorie, quantite: 0, valeur: 0, shifts: 0, prixConnu: false };
      e.prixConnu ||= l.prixVente !== null;
      e.quantite += c.ecart;
      e.valeur += c.valeurEcartVente ?? 0;
      e.shifts++;
      ecarts.set(l.produitId, e);
    }
    if (a.pertes) {
      const p = pertes.get(l.produitId) ?? { produitId: l.produitId, produit, peremption: 0, endommage: 0, valeur: 0, prixConnu: false };
      p.prixConnu ||= l.prixVente !== null;
      p.peremption += a.peremption;
      p.endommage += a.endommage;
      p.valeur += c.valeurPertesVente ?? 0;
      pertes.set(l.produitId, p);
    }
  }
  k.ca = r2(k.ca);
  k.valeurPertes = r2(k.valeurPertes);
  k.valeurEcarts = r2(k.valeurEcarts);
  k.produitsEnEcart = ecarts.size;
  k.caParCanal = canaux
    .map((c) => ({ canalId: c.id, canal: c.nom, montant: r2(caCanal.get(c.id)?.montant ?? 0), quantite: caCanal.get(c.id)?.quantite ?? 0 }))
    .filter((c) => c.quantite || c.montant);
  t.caParJour = [...parJour.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([journee, pc]) => ({ journee, parCanal: Object.fromEntries(Object.entries(pc).map(([c, m]) => [c, r2(m)])) }));
  t.ecarts = [...ecarts.values()].map((e) => ({ ...e, valeur: r2(e.valeur) })).sort((a, b) => a.valeur - b.valeur || a.quantite - b.quantite);
  t.pertes = [...pertes.values()].map((p) => ({ ...p, valeur: r2(p.valeur) })).sort((a, b) => b.peremption + b.endommage - (a.peremption + a.endommage));
  return t;
}

/** Produits sous le stock minimum au dernier comptage de clôture de chaque site. */
export async function alertesReappro(db: Db, siteIds: string[]): Promise<TableauDeBord["alertes"]> {
  const res: TableauDeBord["alertes"] = [];
  for (const siteId of siteIds) {
    const [dernier] = await db
      .select({ id: shifts.id, journee: shifts.journee, site: sites.nom })
      .from(shifts)
      .innerJoin(sites, eq(sites.id, shifts.siteId))
      .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
      .orderBy(desc(shifts.debutPrevu))
      .limit(1);
    if (!dernier) continue;
    const lignes = await db
      .select({ produit: produits.nom, stock: lignesShift.stockReelFin, minimum: lignesShift.stockMinimum })
      .from(lignesShift)
      .innerJoin(produits, eq(produits.id, lignesShift.produitId))
      .where(eq(lignesShift.shiftId, dernier.id))
      .orderBy(asc(produits.nom));
    for (const l of lignes) {
      if (l.stock !== null && l.minimum !== null && l.stock < l.minimum) {
        res.push({ siteId, site: dernier.site, shiftId: dernier.id, journee: dernier.journee, produit: l.produit, stock: l.stock, minimum: l.minimum });
      }
    }
  }
  return res;
}

/** Stock compté à chaque clôture, pour un produit, par site, sur la période. */
export async function evolutionStock(db: Db, produitId: string, siteIds: string[], du: Journee, au: Journee) {
  if (!siteIds.length) return [];
  const rows = await db
    .select({
      siteId: shifts.siteId,
      site: sites.nom,
      shiftId: shifts.id,
      journee: shifts.journee,
      creneau: shifts.nomCreneau,
      debut: shifts.debutPrevu,
      stock: lignesShift.stockReelFin,
      minimum: lignesShift.stockMinimum,
    })
    .from(lignesShift)
    .innerJoin(shifts, eq(shifts.id, lignesShift.shiftId))
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .where(
      and(
        eq(lignesShift.produitId, produitId),
        inArray(shifts.siteId, siteIds),
        inArray(shifts.statut, ["cloture", "valide"]),
        gte(shifts.journee, du),
        lte(shifts.journee, au),
      ),
    )
    .orderBy(asc(shifts.debutPrevu));
  return rows.filter((r) => r.stock !== null) as (Omit<(typeof rows)[number], "stock"> & { stock: number })[];
}
