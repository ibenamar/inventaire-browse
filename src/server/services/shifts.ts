import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  categories,
  coutsProduit,
  canauxVente,
  equipesShift,
  lignesShift,
  ventesShift,
  mouvements,
  ORIGINES_ENTREE,
  MOTIFS_PERTE,
  produits,
  produitsSites,
  recettes,
  shifts,
  sites,
  utilisateurs,
  UNITES_DECIMALES,
  type MotifPerte,
  type OrigineEntree,
  type TypeMouvement,
  type Unite,
} from "@/db/schema";
import {
  arrondiQ,
  calculerLigne,
  enParts,
  estQuantiteValide,
  synthetiser,
  type LigneCalculee,
  type Synthese,
} from "@/domain/calculs";
import { creneauEnCours } from "@/domain/creneaux";
import { ecartsImportants } from "@/domain/vraisemblance";
import { journeeLocale, type Journee } from "@/domain/temps";
import { estEncadrant, type Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { listerCreneaux, type Creneau } from "./sites";
import { aAccesAuSite } from "./utilisateurs";
import { listerCanaux, prixReferences, prixSurCanal } from "./caisse";

export type Shift = typeof shifts.$inferSelect;

/** Montant d'une vente : encaissé réel (import Loyverse), sinon quantité × prix du canal. */
const montantVente = (v: { quantite: number; prixUnitaire: number | null; montant: number | null }) =>
  v.montant ?? (v.prixUnitaire !== null ? v.quantite * v.prixUnitaire : null);

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

/**
 * Saisie possible : pendant le shift ; après clôture, seulement par un manager (correction tracée) ;
 * jamais après validation. Renvoie vrai s'il s'agit d'une correction.
 */
function exigerModifiable(s: Shift, acteur: Acteur): boolean {
  exiger(s.statut !== "planifie", "Le shift n'est pas encore ouvert");
  exiger(s.statut !== "valide", "Ce shift est validé : il ne peut plus être modifié");
  if (s.statut === "ouvert") return false;
  exiger(estEncadrant(acteur), "Le shift est clôturé : seul un manager peut le corriger");
  return true;
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

  const [site] = await db.select({ type: sites.type }).from(sites).where(eq(sites.id, s.siteId));
  // Laboratoire : ses ingrédients et les produits qu'il fabrique ; point de vente : les produits.
  const prods = (await db.select().from(produits).where(eq(produits.actif, true))).filter((p) =>
    site?.type === "laboratoire" ? p.nature === "ingredient" || p.fabriqueLabo : p.nature === "produit" || p.ingredientPointsDeVente,
  );
  const minimums = new Map(
    (await db.select().from(produitsSites).where(eq(produitsSites.siteId, s.siteId))).map((m) => [m.produitId, m]),
  );
  const couts = await db
    .select()
    .from(coutsProduit)
    .where(lte(coutsProduit.dateEffet, s.journee))
    .orderBy(asc(coutsProduit.dateEffet), asc(coutsProduit.saisiLe));
  const refs = await prixReferences(db, s.siteId);
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
        prixVente: refs.get(p.id) ?? p.prixVente,
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
  unite: Unite;
  format: string | null;
  partsParGateau: number | null;
  photoId: string | null;
  nature: "produit" | "ingredient";
  suiviStock: boolean;
  ouvertureTheorique: number | null;
  ouvertureComptee: number | null;
  entrees: number;
  /** Dont production du laboratoire. */
  production: number;
  ventes: number;
  pertes: number;
  /** Expédié sur des bons de livraison. */
  sorties: number;
  /** Ingrédients : consommation attendue d'après les fiches techniques (null sans fiche). */
  consommationTheorique?: number | null;
  pertesPeremption: number;
  pertesEndommage: number;
  stockReelFin: number | null;
  prixVente: number | null;
  cout: number | null;
  stockMinimum: number | null;
  /** CA réel (prix de chaque canal) ; null si aucune vente détaillée par canal. */
  montantVentes: number | null;
  /** Quantités vendues par canal (identifiant du canal → quantité). */
  ventesParCanal: Record<string, number>;
  calcul: LigneCalculee;
}

type Agregats = { entrees: number; production: number; pertes: number; peremption: number; endommage: number; sorties: number };
const agregatsVides = (): Agregats => ({ entrees: 0, production: 0, pertes: 0, peremption: 0, endommage: 0, sorties: 0 });

export async function agregatsMouvements(db: Db, shiftIds: string[]): Promise<Map<string, Agregats>> {
  const res = new Map<string, Agregats>();
  if (!shiftIds.length) return res;
  const rows = await db
    .select({
      shiftId: mouvements.shiftId,
      produitId: mouvements.produitId,
      type: mouvements.type,
      motif: mouvements.motif,
      origine: mouvements.origine,
      total: sql<number>`cast(sum(${mouvements.quantite}) as float8)`,
    })
    .from(mouvements)
    .where(inArray(mouvements.shiftId, shiftIds))
    .groupBy(mouvements.shiftId, mouvements.produitId, mouvements.type, mouvements.motif, mouvements.origine);
  for (const r of rows) {
    const cle = `${r.shiftId}:${r.produitId}`;
    const a = res.get(cle) ?? agregatsVides();
    const n = Number(r.total);
    if (r.type === "entree") a.entrees = arrondiQ(a.entrees + n);
    if (r.type === "entree" && r.origine === "production") a.production = arrondiQ(a.production + n);
    if (r.type === "sortie") a.sorties = arrondiQ(a.sorties + n);
    if (r.type === "perte") {
      a.pertes = arrondiQ(a.pertes + n);
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
      nature: produits.nature,
    })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .innerJoin(categories, eq(categories.id, produits.categorieId))
    .where(eq(lignesShift.shiftId, shiftId))
    .orderBy(asc(categories.ordre), asc(produits.ordre), asc(produits.ref));
  const ag = await agregatsMouvements(db, [shiftId]);
  const ventesCanaux = await db.select().from(ventesShift).where(eq(ventesShift.shiftId, shiftId));
  const parProduit = new Map<string, { montant: number | null; parCanal: Record<string, number> }>();
  for (const v of ventesCanaux) {
    const x = parProduit.get(v.produitId) ?? { montant: null, parCanal: {} };
    x.parCanal[v.canalId] = v.quantite;
    const m = montantVente(v);
    if (m !== null) x.montant = Math.round(((x.montant ?? 0) + m) * 100) / 100;
    parProduit.set(v.produitId, x);
  }
  const theorique = await consommationTheorique(db, shiftId, rows, ag);
  return rows.map(({ l, ...p }) => {
    const vc = parProduit.get(l.produitId);
    const a = ag.get(`${shiftId}:${l.produitId}`) ?? agregatsVides();
    const entree = {
      ouvertureTheorique: l.ouvertureTheorique,
      ouvertureComptee: l.ouvertureComptee,
      entrees: a.entrees,
      ventes: l.ventes,
      pertes: a.pertes,
      sorties: a.sorties,
      ingredient: p.nature === "ingredient",
      consommationTheorique: p.nature === "ingredient" && theorique ? (theorique.get(l.produitId) ?? 0) : null,
      stockReelFin: l.stockReelFin,
      prixVente: l.prixVente,
      cout: l.cout,
      stockMinimum: l.stockMinimum,
      montantVentes: vc?.montant ?? null,
    };
    return {
      produitId: l.produitId,
      ...p,
      suiviStock: l.suiviStock,
      ...entree,
      production: a.production,
      pertesPeremption: a.peremption,
      pertesEndommage: a.endommage,
      ventesParCanal: vc?.parCanal ?? {},
      calcul: calculerLigne(entree),
    };
  });
}

/**
 * Consommation théorique d'ingrédients du shift, d'après les fiches techniques : au laboratoire,
 * la production × recette ; en point de vente, les ventes des préparations à la commande × recette.
 * Null si le shift ne compte aucun ingrédient ou si aucune fiche technique n'existe.
 */
async function consommationTheorique(
  db: Db,
  shiftId: string,
  rows: { l: { produitId: string; ventes: number; suiviStock: boolean }; nature: string; partsParGateau: number | null }[],
  ag: Map<string, Agregats>,
): Promise<Map<string, number> | null> {
  if (!rows.some((r) => r.nature === "ingredient")) return null;
  const rec = await db.select().from(recettes);
  if (!rec.length) return null;
  const [sh] = await db.select({ type: sites.type }).from(shifts).innerJoin(sites, eq(sites.id, shifts.siteId)).where(eq(shifts.id, shiftId));
  const res = new Map<string, number>();
  for (const r of rows) {
    if (r.nature !== "produit") continue;
    // Quantité « faite » pendant le shift, en unités de recette (gâteaux entiers pour les cakes).
    const faite =
      sh?.type === "laboratoire" ? (ag.get(`${shiftId}:${r.l.produitId}`)?.production ?? 0) : r.l.suiviStock ? 0 : r.l.ventes;
    if (!faite) continue;
    const unites = r.partsParGateau ? faite / r.partsParGateau : faite;
    for (const x of rec.filter((y) => y.produitId === r.l.produitId)) {
      res.set(x.ingredientId, arrondiQ((res.get(x.ingredientId) ?? 0) + unites * x.quantite));
    }
  }
  return res;
}

export interface DetailShift {
  shift: Shift & {
    site: string;
    typeSite: "point_de_vente" | "laboratoire";
    modeOuverture: "reprise" | "recomptage";
    responsable: string | null;
  };
  equipe: { id: string; nom: string }[];
  lignes: LigneDetail[];
  mouvements: {
    id: string;
    produitId: string;
    produit: string;
    type: TypeMouvement;
    quantite: number;
    bonId: string | null;
    motif: MotifPerte | null;
    origine: OrigineEntree | null;
    commentaire: string | null;
    utilisateurId: string;
    utilisateur: string;
    horodatage: Date;
  }[];
  synthese: Synthese;
  /** Ventes et CA par canal (sur place, Glovo…). */
  ventesParCanal: { canalId: string; canal: string; quantite: number; montant: number }[];
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
    .select({ s: shifts, site: sites.nom, typeSite: sites.type, modeOuverture: sites.modeOuverture, responsable: utilisateurs.nom })
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
      bonId: mouvements.bonId,
      utilisateurId: mouvements.utilisateurId,
      utilisateur: utilisateurs.nom,
      horodatage: mouvements.horodatage,
    })
    .from(mouvements)
    .innerJoin(produits, eq(produits.id, mouvements.produitId))
    .innerJoin(utilisateurs, eq(utilisateurs.id, mouvements.utilisateurId))
    .where(eq(mouvements.shiftId, shiftId))
    .orderBy(desc(mouvements.horodatage));
  const canaux = await listerCanaux(db);
  const ventes = await db.select().from(ventesShift).where(eq(ventesShift.shiftId, shiftId));
  const ventesParCanal = canaux
    .map((c) => {
      const duCanal = ventes.filter((v) => v.canalId === c.id);
      return {
        canalId: c.id,
        canal: c.nom,
        quantite: duCanal.reduce((t, v) => t + v.quantite, 0),
        montant: Math.round(duCanal.reduce((t, v) => t + (montantVente(v) ?? 0), 0) * 100) / 100,
      };
    })
    .filter((c) => c.quantite > 0);
  const mode = row.modeOuverture;
  const aCompterOuv = lignes.filter((l) => ouvertureACompter(mode, l));
  const suivis = lignes.filter((l) => l.suiviStock);
  return {
    shift: { ...row.s, site: row.site, typeSite: row.typeSite, modeOuverture: mode, responsable: row.responsable },
    equipe,
    lignes,
    mouvements: mvts,
    synthese: synthetiser(lignes),
    ventesParCanal,
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

export type ChampQuantite = "ouvertureComptee" | "stockReelFin";

export async function saisirQuantite(
  db: Db,
  shiftId: string,
  produitId: string,
  champ: ChampQuantite,
  valeur: number | null,
  acteur: Acteur,
  maintenant: Date,
) {
  exiger(["ouvertureComptee", "stockReelFin"].includes(champ), "Champ invalide");
  const s = await lireShift(db, shiftId);
  const correction = exigerModifiable(s, acteur);
  await exigerAcces(db, s, acteur);
  const [r] = await db
    .select({ l: lignesShift, unite: produits.unite })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  exiger(r, "Produit absent de ce shift");
  const l = r.l;
  exiger(valeur === null || estQuantiteValide(valeur, accepteDecimales(r.unite)), messageQuantite(r.unite));
  exiger(l.suiviStock, "Ce produit n'est pas suivi en stock (vente seule)");
  if (correction) exiger(valeur !== null, "Un shift clôturé doit rester entièrement compté");
  await db
    .update(lignesShift)
    .set({ [champ]: valeur, modifieLe: maintenant, modifiePar: acteur.id })
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  if (correction && l[champ] !== valeur) {
    await tracer(db, acteur.id, "corriger", "shift", shiftId, { champ, produitId, avant: l[champ], apres: valeur });
    // Le stock compté à la clôture est l'ouverture du shift suivant : on la met à jour.
    if (champ === "stockReelFin") {
      const suivants = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.shiftPrecedentId, shiftId));
      for (const x of suivants) {
        await db
          .update(lignesShift)
          .set({ ouvertureTheorique: valeur })
          .where(and(eq(lignesShift.shiftId, x.id), eq(lignesShift.produitId, produitId)));
      }
    }
  }
}

/**
 * Ventes d'un produit sur un canal (sur place, Glovo…), valorisées au prix de ce canal.
 * Le total tous canaux est reporté sur la ligne : c'est lui qui fait sortir le stock.
 */
export async function saisirVentes(
  db: Db,
  shiftId: string,
  produitId: string,
  canalId: string,
  quantite: number | null,
  acteur: Acteur,
  maintenant: Date,
) {
  const q = quantite ?? 0;
  exiger(estQuantiteValide(q), "Quantité invalide (nombre entier positif)");
  const s = await lireShift(db, shiftId);
  const correction = exigerModifiable(s, acteur);
  await exigerAcces(db, s, acteur);
  const [l] = await db
    .select()
    .from(lignesShift)
    .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  exiger(l, "Produit absent de ce shift");
  if (correction) await tracer(db, acteur.id, "corriger", "shift", shiftId, { champ: "ventes", produitId, canalId, apres: q });
  const [canal] = await db.select().from(canauxVente).where(eq(canauxVente.id, canalId));
  exiger(canal, "Canal de vente inconnu");
  const prix = await prixSurCanal(db, produitId, canalId, s.siteId);
  await db.transaction(async (tx) => {
    const cle = and(eq(ventesShift.shiftId, shiftId), eq(ventesShift.produitId, produitId), eq(ventesShift.canalId, canalId));
    if (q === 0) await tx.delete(ventesShift).where(cle);
    else
      await tx
        .insert(ventesShift)
        .values({ shiftId, produitId, canalId, quantite: q, prixUnitaire: prix, montant: null, source: "manuel" })
        .onConflictDoUpdate({
          target: [ventesShift.shiftId, ventesShift.produitId, ventesShift.canalId],
          set: { quantite: q, prixUnitaire: prix, montant: null, source: "manuel" },
        });
    const [t] = await tx
      .select({ total: sql<number>`cast(coalesce(sum(${ventesShift.quantite}), 0) as int)` })
      .from(ventesShift)
      .where(and(eq(ventesShift.shiftId, shiftId), eq(ventesShift.produitId, produitId)));
    await tx
      .update(lignesShift)
      .set({ ventes: Number(t.total), modifieLe: maintenant, modifiePar: acteur.id })
      .where(and(eq(lignesShift.shiftId, shiftId), eq(lignesShift.produitId, produitId)));
  });
}

/** Les ingrédients au poids ou au volume se comptent avec décimales ; le reste en nombres entiers. */
export const accepteDecimales = (unite: Unite) => UNITES_DECIMALES.includes(unite);
const messageQuantite = (unite: Unite) =>
  accepteDecimales(unite) ? "Quantité invalide (nombre positif, 3 décimales au plus)" : "Quantité invalide (nombre entier positif)";

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
  const correction = exigerModifiable(s, acteur);
  await exigerAcces(db, s, acteur);
  if (correction) await tracer(db, acteur.id, "corriger", "shift", shiftId, { champ: "entrees", saisies, origine });
  const valeurs = [];
  for (const e of utiles) {
    const p = await produitDuShift(db, shiftId, e.produitId);
    exiger(estQuantiteValide(e.quantite, accepteDecimales(p.unite)), `${p.nom} : ${messageQuantite(p.unite)}`);
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
  const s = await lireShift(db, shiftId);
  const correction = exigerModifiable(s, acteur);
  await exigerAcces(db, s, acteur);
  const p = await produitDuShift(db, shiftId, v.produitId);
  exiger(estQuantiteValide(v.quantite, accepteDecimales(p.unite)) && v.quantite > 0, messageQuantite(p.unite));
  if (correction) await tracer(db, acteur.id, "corriger", "shift", shiftId, { champ: "perte", ...v });
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
  exiger(!m.bonId, "Cette saisie vient d'un bon de livraison : elle se modifie depuis le bon");
  const s = await lireShift(db, m.shiftId);
  exigerModifiable(s, acteur);
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
  // Un écart important doit être expliqué : le commentaire devient obligatoire.
  const importants = ecartsImportants(d.lignes.map((l) => ({ nom: l.nom, ecart: l.calcul.ecart })), d.synthese.valeurEcartsVente);
  exiger(
    !importants.length || (commentaire?.trim().length ?? 0) >= 5,
    `Écart important (${importants.join(", ")}) : recomptez, puis expliquez l'écart dans le commentaire avant de clôturer.`,
  );
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


/** Validation d'un shift clôturé par un manager : il est ensuite verrouillé. */
export async function validerShift(db: Db, shiftId: string, acteur: Acteur, maintenant: Date) {
  exiger(estEncadrant(acteur), "Seul un manager peut valider un shift");
  const s = await lireShift(db, shiftId);
  await exigerAcces(db, s, acteur);
  exiger(s.statut === "cloture", s.statut === "valide" ? "Ce shift est déjà validé" : "Seul un shift clôturé peut être validé");
  await db.update(shifts).set({ statut: "valide", validePar: acteur.id, valideLe: maintenant }).where(eq(shifts.id, shiftId));
  await tracer(db, acteur.id, "valider", "shift", shiftId);
}
