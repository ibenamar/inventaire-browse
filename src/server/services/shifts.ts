import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  categories,
  coutsProduit,
  equipesShift,
  lignesShift,
  mouvements,
  ORIGINES_ENTREE,
  MOTIFS_PERTE,
  produits,
  produitsSites,
  shifts,
  sites,
  utilisateurs,
  type MotifPerte,
  type OrigineEntree,
} from "@/db/schema";
import {
  calculerLigne,
  enParts,
  estQuantiteValide,
  synthetiser,
  type LigneCalculee,
  type Synthese,
} from "@/domain/calculs";
import { creneauEnCours } from "@/domain/creneaux";
import { journeeLocale, type Journee } from "@/domain/temps";
import { estEncadrant, type Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { listerCreneaux, type Creneau } from "./sites";
import { aAccesAuSite } from "./utilisateurs";

export type Shift = typeof shifts.$inferSelect;

async function lireShift(db: Db, shiftId: string): Promise<Shift> {
  const [s] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  exiger(s, "Shift introuvable");
  return s;
}

async function exigerAcces(db: Db, s: Shift, acteur: Acteur) {
  exiger(await aAccesAuSite(db, acteur.id, s.siteId), "Vous n'êtes pas rattaché à ce site");
}

function exigerResponsable(s: Shift, acteur: Acteur, action: string) {
  exiger(
    s.responsableId === acteur.id || estEncadrant(acteur),
    `Seul le responsable d'inventaire du shift (ou un manager) peut ${action}`,
  );
}

function exigerOuvert(s: Shift) {
  exiger(s.statut === "ouvert", s.statut === "planifie" ? "Le shift n'est pas encore ouvert" : "Le shift est clôturé");
}

// ---------------------------------------------------------------------------
// Accueil : quel shift ouvrir / continuer ?
// ---------------------------------------------------------------------------

export interface ResumeShift {
  id: string;
  nomCreneau: string;
  journee: Journee;
  debutPrevu: Date;
  finPrevue: Date;
  statut: Shift["statut"];
  responsableId: string | null;
  responsable: string | null;
}

const colonnesResume = {
  id: shifts.id,
  nomCreneau: shifts.nomCreneau,
  journee: shifts.journee,
  debutPrevu: shifts.debutPrevu,
  finPrevue: shifts.finPrevue,
  statut: shifts.statut,
  responsableId: shifts.responsableId,
  responsable: utilisateurs.nom,
};

export const AVANCE_OUVERTURE_MIN = 60;

export async function etatAccueil(db: Db, siteId: string, maintenant: Date) {
  const base = () =>
    db.select(colonnesResume).from(shifts).leftJoin(utilisateurs, eq(utilisateurs.id, shifts.responsableId));
  const [ouvert] = await base().where(and(eq(shifts.siteId, siteId), eq(shifts.statut, "ouvert")));
  const aOuvrir = await base()
    .where(
      and(
        eq(shifts.siteId, siteId),
        eq(shifts.statut, "planifie"),
        lte(shifts.debutPrevu, new Date(maintenant.getTime() + AVANCE_OUVERTURE_MIN * 60_000)),
        gt(shifts.finPrevue, maintenant),
      ),
    )
    .orderBy(asc(shifts.debutPrevu))
    .limit(1);
  const prochains = await base()
    .where(and(eq(shifts.siteId, siteId), eq(shifts.statut, "planifie"), gt(shifts.debutPrevu, maintenant)))
    .orderBy(asc(shifts.debutPrevu))
    .limit(3);
  const [dernierClos] = await base()
    .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
    .orderBy(desc(shifts.debutPrevu))
    .limit(1);
  const cr = await listerCreneaux(db, siteId);
  const enCours = creneauEnCours(cr, maintenant, journeeLocale(maintenant));
  let creneauSansShift: { creneau: Creneau; journee: Journee } | null = null;
  if (enCours) {
    const [existe] = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.siteId, siteId), eq(shifts.journee, enCours.journee), eq(shifts.creneauId, enCours.creneau.id)));
    if (!existe) creneauSansShift = { creneau: enCours.creneau, journee: enCours.journee };
  }
  return {
    ouvert: (ouvert as ResumeShift | undefined) ?? null,
    aOuvrir: (aOuvrir[0] as ResumeShift | undefined) ?? null,
    prochains: prochains.filter((p) => p.id !== aOuvrir[0]?.id) as ResumeShift[],
    dernierClos: (dernierClos as ResumeShift | undefined) ?? null,
    creneauSansShift,
  };
}

// ---------------------------------------------------------------------------
// Ouverture : reprise de la clôture du shift précédent
// ---------------------------------------------------------------------------

export async function ouvrirShift(db: Db, shiftId: string, acteur: Acteur, maintenant: Date) {
  const s = await lireShift(db, shiftId);
  exiger(s.statut === "planifie", "Ce shift a déjà été ouvert");
  await exigerAcces(db, s, acteur);
  exigerResponsable(s, acteur, "ouvrir le shift");

  const [dejaOuvert] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.siteId, s.siteId), eq(shifts.statut, "ouvert")));
  if (dejaOuvert) {
    throw new ErreurMetier(
      `Le shift « ${dejaOuvert.nomCreneau} » du ${dejaOuvert.journee} est encore ouvert : il doit être clôturé avant.`,
    );
  }

  // Shift précédent = dernier shift clôturé du site, dans l'ordre du temps (la nuit du vendredi
  // précède le matin du samedi).
  const [precedent] = await db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.siteId, s.siteId),
        inArray(shifts.statut, ["cloture", "valide"]),
        lte(shifts.debutPrevu, s.debutPrevu),
      ),
    )
    .orderBy(desc(shifts.debutPrevu))
    .limit(1);
  const lignesPrec = precedent
    ? await db.select().from(lignesShift).where(eq(lignesShift.shiftId, precedent.id))
    : [];
  const clotures = new Map(lignesPrec.map((l) => [l.produitId, l.stockReelFin]));

  const prods = await db.select().from(produits).where(eq(produits.actif, true));
  const minimums = new Map(
    (await db.select().from(produitsSites).where(eq(produitsSites.siteId, s.siteId))).map((m) => [m.produitId, m]),
  );
  const couts = await db
    .select()
    .from(coutsProduit)
    .where(lte(coutsProduit.dateEffet, s.journee))
    .orderBy(asc(coutsProduit.dateEffet), asc(coutsProduit.saisiLe));
  const coutParProduit = new Map<string, number>();
  for (const c of couts) coutParProduit.set(c.produitId, c.coutUnitaire);

  await db.transaction(async (tx) => {
    const valeurs = prods
      .filter((p) => minimums.get(p.id)?.actif !== false)
      .map((p) => ({
        shiftId: s.id,
        produitId: p.id,
        suiviStock: p.suiviStock,
        ouvertureTheorique: p.suiviStock ? (clotures.get(p.id) ?? null) : null,
        prixVente: p.prixVente,
        cout: coutParProduit.get(p.id) ?? null,
        stockMinimum: minimums.get(p.id)?.stockMinimum ?? null,
      }));
    if (valeurs.length) await tx.insert(lignesShift).values(valeurs);
    await tx
      .update(shifts)
      .set({ statut: "ouvert", ouvertPar: acteur.id, ouvertLe: maintenant, shiftPrecedentId: precedent?.id ?? null })
      .where(eq(shifts.id, s.id));
  });
  await tracer(db, acteur.id, "ouvrir", "shift", s.id, { precedent: precedent?.id ?? null });
}

/** Crée et rattache au planning le shift du créneau en cours (cas d'un shift non planifié). */
export async function creerShiftCreneauEnCours(db: Db, siteId: string, acteur: Acteur, maintenant: Date) {
  exiger(estEncadrant(acteur), "Seul un manager peut créer un shift hors planning");
  const etat = await etatAccueil(db, siteId, maintenant);
  exiger(etat.creneauSansShift, "Aucun créneau en cours sans shift planifié");
  const { affecter } = await import("./planning");
  return affecter(
    db,
    {
      siteId,
      journee: etat.creneauSansShift.journee,
      creneauId: etat.creneauSansShift.creneau.id,
      responsableId: acteur.id,
      equipierIds: [],
    },
    acteur,
  );
}

// ---------------------------------------------------------------------------
// Détail et calculs
// ---------------------------------------------------------------------------

export interface LigneDetail {
  produitId: string;
  ref: string;
  nom: string;
  categorie: string;
  unite: (typeof produits.$inferSelect)["unite"];
  format: string | null;
  partsParGateau: number | null;
  photoId: string | null;
  suiviStock: boolean;
  ouvertureTheorique: number | null;
  ouvertureComptee: number | null;
  entrees: number;
  ventes: number;
  pertes: number;
  pertesPeremption: number;
  pertesEndommage: number;
  stockReelFin: number | null;
  prixVente: number | null;
  cout: number | null;
  stockMinimum: number | null;
  calcul: LigneCalculee;
}

type Agregats = { entrees: number; pertes: number; peremption: number; endommage: number };

export async function agregatsMouvements(db: Db, shiftIds: string[]): Promise<Map<string, Agregats>> {
  const res = new Map<string, Agregats>();
  if (!shiftIds.length) return res;
  const rows = await db
    .select({
      shiftId: mouvements.shiftId,
      produitId: mouvements.produitId,
      type: mouvements.type,
      motif: mouvements.motif,
      total: sql<number>`cast(sum(${mouvements.quantite}) as int)`,
    })
    .from(mouvements)
    .where(inArray(mouvements.shiftId, shiftIds))
    .groupBy(mouvements.shiftId, mouvements.produitId, mouvements.type, mouvements.motif);
  for (const r of rows) {
    const cle = `${r.shiftId}:${r.produitId}`;
    const a = res.get(cle) ?? { entrees: 0, pertes: 0, peremption: 0, endommage: 0 };
    const n = Number(r.total);
    if (r.type === "entree") a.entrees += n;
    if (r.type === "perte") {
      a.pertes += n;
      if (r.motif === "peremption") a.peremption += n;
      if (r.motif === "endommage") a.endommage += n;
    }
    res.set(cle, a);
  }
  return res;
}

export async function lignesCalculees(db: Db, shiftId: string): Promise<LigneDetail[]> {
  const rows = await db
    .select({
      l: lignesShift,
      ref: produits.ref,
      nom: produits.nom,
      categorie: categories.nom,
      unite: produits.unite,
      format: produits.format,
      partsParGateau: produits.partsParGateau,
      photoId: produits.photoId,
    })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .innerJoin(categories, eq(categories.id, produits.categorieId))
    .where(eq(lignesShift.shiftId, shiftId))
    .orderBy(asc(categories.ordre), asc(produits.ordre), asc(produits.ref));
  const ag = await agregatsMouvements(db, [shiftId]);
  return rows.map(({ l, ...p }) => {
    const a = ag.get(`${shiftId}:${l.produitId}`) ?? { entrees: 0, pertes: 0, peremption: 0, endommage: 0 };
    const entree = {
      ouvertureTheorique: l.ouvertureTheorique,
      ouvertureComptee: l.ouvertureComptee,
      entrees: a.entrees,
      ventes: l.ventes,
      pertes: a.pertes,
      stockReelFin: l.stockReelFin,
      prixVente: l.prixVente,
      cout: l.cout,
      stockMinimum: l.stockMinimum,
    };
    return {
      produitId: l.produitId,
      ...p,
      suiviStock: l.suiviStock,
      ...entree,
      pertesPeremption: a.peremption,
      pertesEndommage: a.endommage,
      calcul: calculerLigne(entree),
    };
  });
}

export interface DetailShift {
  shift: Shift & { site: string; modeOuverture: "reprise" | "recomptage"; responsable: string | null };
  equipe: { id: string; nom: string }[];
  lignes: LigneDetail[];
  mouvements: {
    id: string;
    produitId: string;
    produit: string;
    type: "entree" | "perte" | "ajustement";
    quantite: number;
    motif: MotifPerte | null;
    origine: OrigineEntree | null;
    commentaire: string | null;
    utilisateurId: string;
    utilisateur: string;
    horodatage: Date;
  }[];
  synthese: Synthese;
  avancement: {
    aCompterOuverture: number;
    compteesOuverture: number;
    aCompterFin: number;
    compteesFin: number;
  };
}

/** En mode recomptage, toute l'ouverture est recomptée ; sinon seuls les produits sans clôture précédente. */
export function ouvertureACompter(mode: "reprise" | "recomptage", l: Pick<LigneDetail, "suiviStock" | "ouvertureTheorique">) {
  return l.suiviStock && (mode === "recomptage" || l.ouvertureTheorique === null);
}

export async function detailShift(db: Db, shiftId: string): Promise<DetailShift> {
  const [row] = await db
    .select({ s: shifts, site: sites.nom, modeOuverture: sites.modeOuverture, responsable: utilisateurs.nom })
    .from(shifts)
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .leftJoin(utilisateurs, eq(utilisateurs.id, shifts.responsableId))
    .where(eq(shifts.id, shiftId));
  exiger(row, "Shift introuvable");
  const equipe = await db
    .select({ id: utilisateurs.id, nom: utilisateurs.nom })
    .from(equipesShift)
    .innerJoin(utilisateurs, eq(utilisateurs.id, equipesShift.utilisateurId))
    .where(eq(equipesShift.shiftId, shiftId));
  const lignes = await lignesCalculees(db, shiftId);
  const mvts = await db
    .select({
      id: mouvements.id,
      produitId: mouvements.produitId,
      produit: produits.nom,
      type: mouvements.type,
      quantite: mouvements.quantite,
      motif: mouvements.motif,
      origine: mouvements.origine,
      commentaire: mouvements.commentaire,
      utilisateurId: mouvements.utilisateurId,
      utilisateur: utilisateurs.nom,
      horodatage: mouvements.horodatage,
    })
    .from(mouvements)
    .innerJoin(produits, eq(produits.id, mouvements.produitId))
    .innerJoin(utilisateurs, eq(utilisateurs.id, mouvements.utilisateurId))
    .where(eq(mouvements.shiftId, shiftId))
    .orderBy(desc(mouvements.horodatage));
  const mode = row.modeOuverture;
  const aCompterOuv = lignes.filter((l) => ouvertureACompter(mode, l));
  const suivis = lignes.filter((l) => l.suiviStock);
  return {
    shift: { ...row.s, site: row.site, modeOuverture: mode, responsable: row.responsable },
    equipe,
    lignes,
    mouvements: mvts,
    synthese: synthetiser(lignes),
    avancement: {
      aCompterOuverture: aCompterOuv.length,
      compteesOuverture: aCompterOuv.filter((l) => l.ouvertureComptee !== null).length,
      aCompterFin: suivis.length,
      compteesFin: suivis.filter((l) => l.stockReelFin !== null).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Saisies pendant le shift
// ---------------------------------------------------------------------------

export type ChampQuantite = "ouvertureComptee" | "stockReelFin" | "ventes";

export async function saisirQuantite(
  db: Db,
  shiftId: string,
  produitId: string,
  champ: ChampQuantite,
  valeur: number | null,
  acteur: Acteur,
  maintenant: Date,
) {
  exiger(["ouvertureComptee", "stockReelFin", "ventes"].includes(champ), "Champ invalide");
  exiger(valeur === null || estQuantiteValide(valeur), "Quantité invalide (nombre entier positif)");
  const s = await lireShift(db, shiftId);
  exigerOuvert(s);
  await exigerAcces(db, s, acteur);
  const [l] = await db
    .select()
    .from(lignesShift)
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  exiger(l, "Produit absent de ce shift");
  if (champ !== "ventes") exiger(l.suiviStock, "Ce produit n'est pas suivi en stock (vente seule)");
  await db
    .update(lignesShift)
    .set({ [champ]: champ === "ventes" ? (valeur ?? 0) : valeur, modifieLe: maintenant, modifiePar: acteur.id })
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
}

export interface SaisieEntree {
  produitId: string;
  quantite: number;
  saisie: "parts" | "gateaux";
}

async function produitDuShift(db: Db, shiftId: string, produitId: string) {
  const [r] = await db
    .select({ l: lignesShift, p: produits })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  exiger(r, "Produit absent de ce shift");
  exiger(r.l.suiviStock, `« ${r.p.nom} » n'est pas suivi en stock`);
  return r.p;
}

/** Réception de marchandise (labo, fournisseur…) : les quantités sont enregistrées en unité de comptage. */
export async function ajouterEntrees(
  db: Db,
  shiftId: string,
  saisies: SaisieEntree[],
  origine: OrigineEntree,
  commentaire: string | null,
  acteur: Acteur,
) {
  exiger(ORIGINES_ENTREE.includes(origine), "Origine invalide");
  const utiles = saisies.filter((e) => e.quantite !== 0);
  exiger(utiles.length, "Aucune quantité saisie");
  const s = await lireShift(db, shiftId);
  exigerOuvert(s);
  await exigerAcces(db, s, acteur);
  const valeurs = [];
  for (const e of utiles) {
    exiger(estQuantiteValide(e.quantite), "Quantité invalide");
    const p = await produitDuShift(db, shiftId, e.produitId);
    valeurs.push({
      shiftId,
      produitId: e.produitId,
      type: "entree" as const,
      quantite: e.saisie === "gateaux" ? enParts(e.quantite, "gateaux", p.partsParGateau) : e.quantite,
      origine,
      commentaire: commentaire?.trim() || null,
      utilisateurId: acteur.id,
    });
  }
  await db.insert(mouvements).values(valeurs);
}

export async function ajouterPerte(
  db: Db,
  shiftId: string,
  v: { produitId: string; quantite: number; saisie: "parts" | "gateaux"; motif: MotifPerte; commentaire: string | null },
  acteur: Acteur,
) {
  exiger(MOTIFS_PERTE.includes(v.motif), "Choisir le motif : péremption ou endommagé");
  exiger(estQuantiteValide(v.quantite) && v.quantite > 0, "Quantité invalide");
  const s = await lireShift(db, shiftId);
  exigerOuvert(s);
  await exigerAcces(db, s, acteur);
  const p = await produitDuShift(db, shiftId, v.produitId);
  await db.insert(mouvements).values({
    shiftId,
    produitId: v.produitId,
    type: "perte",
    quantite: v.saisie === "gateaux" ? enParts(v.quantite, "gateaux", p.partsParGateau) : v.quantite,
    motif: v.motif,
    commentaire: v.commentaire?.trim() || null,
    utilisateurId: acteur.id,
  });
}

export async function supprimerMouvement(db: Db, mouvementId: string, acteur: Acteur) {
  const [m] = await db.select().from(mouvements).where(eq(mouvements.id, mouvementId));
  exiger(m, "Saisie introuvable");
  const s = await lireShift(db, m.shiftId);
  exigerOuvert(s);
  await exigerAcces(db, s, acteur);
  exiger(m.utilisateurId === acteur.id || estEncadrant(acteur) || s.responsableId === acteur.id, "Vous ne pouvez supprimer que vos propres saisies");
  await db.delete(mouvements).where(eq(mouvements.id, mouvementId));
  await tracer(db, acteur.id, "supprimer_mouvement", "shift", s.id, { ...m, horodatage: m.horodatage.toISOString() });
}

// ---------------------------------------------------------------------------
// Clôture
// ---------------------------------------------------------------------------

export async function cloturerShift(db: Db, shiftId: string, acteur: Acteur, maintenant: Date, commentaire: string | null) {
  const d = await detailShift(db, shiftId);
  const s = d.shift;
  exigerOuvert(s);
  await exigerAcces(db, s, acteur);
  exigerResponsable(s, acteur, "clôturer le shift");
  const sansOuverture = d.lignes.filter(
    (l) => l.suiviStock && (l.calcul.ouverture === null || (ouvertureACompter(s.modeOuverture, l) && l.ouvertureComptee === null)),
  );
  exiger(!sansOuverture.length, `${sansOuverture.length} produit(s) sans stock d'ouverture : compléter le comptage d'ouverture.`);
  const nonComptes = d.lignes.filter((l) => l.suiviStock && l.stockReelFin === null);
  exiger(!nonComptes.length, `${nonComptes.length} produit(s) non comptés en fin de shift.`);
  await db
    .update(shifts)
    .set({ statut: "cloture", cloturePar: acteur.id, clotureLe: maintenant, commentaire: commentaire?.trim() || null })
    .where(eq(shifts.id, shiftId));
  await tracer(db, acteur.id, "cloturer", "shift", shiftId, { synthese: d.synthese });
}

/**
 * Clôture forcée par un manager (shift abandonné) : les produits non comptés prennent
 * leur stock théorique, la clôture est marquée comme forcée et motivée.
 */
export async function forcerCloture(db: Db, shiftId: string, acteur: Acteur, maintenant: Date, motif: string) {
  exiger(estEncadrant(acteur), "Seul un manager peut forcer la clôture");
  exiger(motif.trim().length >= 5, "Indiquer le motif de la clôture forcée");
  const d = await detailShift(db, shiftId);
  exigerOuvert(d.shift);
  await db.transaction(async (tx) => {
    for (const l of d.lignes) {
      if (l.suiviStock && l.stockReelFin === null && l.calcul.theoriqueFin !== null) {
        await tx
          .update(lignesShift)
          .set({ stockReelFin: Math.max(0, l.calcul.theoriqueFin), modifieLe: maintenant, modifiePar: acteur.id })
          .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, l.produitId)));
      }
    }
    await tx
      .update(shifts)
      .set({ statut: "cloture", clotureForcee: true, cloturePar: acteur.id, clotureLe: maintenant, commentaire: motif.trim() })
      .where(eq(shifts.id, shiftId));
  });
  await tracer(db, acteur.id, "forcer_cloture", "shift", shiftId, { motif });
}

