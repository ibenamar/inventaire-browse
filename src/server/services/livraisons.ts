import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import {
  bonsLivraison,
  categories,
  lignesBon,
  lignesShift,
  mouvements,
  produits,
  shifts,
  sites,
  utilisateurs,
  type StatutBon,
  type Unite,
} from "@/db/schema";
import { arrondiQ, enParts, estQuantiteValide } from "@/domain/calculs";
import { libelleQuantite } from "@/domain/unites";
import { estEncadrant, type Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { accepteDecimales, lignesCalculees, lignesCalculeesPlusieurs } from "./shifts";
import { aAccesAuSite } from "./utilisateurs";

/**
 * Bons de livraison : le laboratoire (ou un point de vente, pour un transfert) prépare un bon,
 * l'expédie — sortie de son stock sur le shift en cours — puis l'équipe du site destinataire le
 * réceptionne : les quantités reçues deviennent des entrées de son shift. Les quantités sont dans
 * l'unité de stock du produit (les cakes en parts : un gâteau saisi au labo = 8 parts).
 */

export interface SaisieBon {
  produitId: string;
  quantite: number;
  saisie: "parts" | "gateaux";
}

async function shiftDeSaisie(db: Db, shiftId: string, acteur: Acteur) {
  const [s] = await db
    .select({ s: shifts, typeSite: sites.type, nomSite: sites.nom })
    .from(shifts)
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .where(eq(shifts.id, shiftId));
  exiger(s, "Shift introuvable");
  exiger(await aAccesAuSite(db, acteur.id, s.s.siteId), "Vous n'êtes pas rattaché à ce site");
  exiger(s.s.statut !== "planifie", "Le shift n'est pas encore ouvert");
  exiger(s.s.statut !== "valide", "Ce shift est validé : il ne peut plus être modifié");
  exiger(s.s.statut === "ouvert" || estEncadrant(acteur), "Le shift est clôturé : seul un manager peut le corriger");
  return s;
}

async function lireBon(db: Db, bonId: string, verrou = false) {
  const q = db.select().from(bonsLivraison).where(eq(bonsLivraison.id, bonId));
  const [b] = verrou ? await q.for("update") : await q;
  exiger(b, "Bon de livraison introuvable");
  return b;
}

/** Produits du bon présents dans le shift (suivis en stock), avec leur unité. */
async function produitsDuShift(db: Db, shiftId: string, produitIds: string[]) {
  if (!produitIds.length) return new Map<string, { nom: string; unite: Unite; partsParGateau: number | null }>();
  const rows = await db
    .select({ id: produits.id, nom: produits.nom, unite: produits.unite, partsParGateau: produits.partsParGateau, suivi: lignesShift.suiviStock })
    .from(lignesShift)
    .innerJoin(produits, eq(produits.id, lignesShift.produitId))
    .where(and(eq(lignesShift.shiftId, shiftId), inArray(lignesShift.produitId, produitIds)));
  return new Map(rows.filter((r) => r.suivi).map((r) => [r.id, r]));
}

/**
 * On n'expédie pas ce qui n'est pas en stock : sinon le théorique devient négatif et la clôture
 * affiche un faux écart positif. Cause habituelle : production pas encore saisie. Un produit dont
 * le stock d'ouverture n'est pas encore connu n'est pas contrôlé.
 */
async function verifierStock(db: Db, shiftId: string, lignes: { produitId: string; quantiteExpediee: number }[]) {
  const stock = new Map((await lignesCalculees(db, shiftId)).map((x) => [x.produitId, x]));
  const manquants = lignes
    .map((l) => ({ l, x: stock.get(l.produitId) }))
    .filter(({ l, x }) => x && x.calcul.theoriqueFin !== null && l.quantiteExpediee > x.calcul.theoriqueFin)
    .map(({ l, x }) => `${x!.nom} : ${libelleQuantite(l.quantiteExpediee, x!)} à expédier, ${libelleQuantite(Math.max(0, x!.calcul.theoriqueFin!), x!)} en stock`);
  if (manquants.length)
    throw new ErreurMetier(
      `Stock insuffisant — ${manquants.join(" ; ")}. Saisissez d'abord la production (ou la réception), ou corrigez les quantités.`,
    );
}

export async function creerBon(
  db: Db,
  v: { shiftId: string; siteDestinationId: string; lignes: SaisieBon[]; commentaire: string | null; expedier: boolean },
  acteur: Acteur,
  maintenant: Date,
): Promise<string> {
  const { s } = await shiftDeSaisie(db, v.shiftId, acteur);
  exiger(v.siteDestinationId !== s.siteId, "Choisir un site destinataire différent");
  const [dest] = await db.select().from(sites).where(eq(sites.id, v.siteDestinationId));
  exiger(dest, "Site destinataire introuvable");
  // Seul un site ouvert peut réceptionner ; le labo livre les points de vente, un point de vente transfère vers un autre.
  exiger(dest.statut === "actif", `« ${dest.nom} » n'est pas encore ouvert : personne ne pourrait réceptionner ce bon`);
  exiger(dest.type === "point_de_vente", "Les bons vont vers un point de vente");
  const utiles = v.lignes.filter((l) => l.quantite > 0);
  exiger(utiles.length, "Aucune quantité saisie");
  exiger(new Set(utiles.map((l) => l.produitId)).size === utiles.length, "Un produit apparaît deux fois sur le bon");
  const prods = await produitsDuShift(db, v.shiftId, utiles.map((l) => l.produitId));
  const valeurs = utiles.map((l) => {
    const p = prods.get(l.produitId);
    exiger(p, "Produit absent du stock de ce site");
    exiger(
      estQuantiteValide(l.quantite, accepteDecimales(p.unite) || l.saisie === "gateaux") && l.quantite > 0,
      `${p.nom} : quantité invalide`,
    );
    const q = l.saisie === "gateaux" ? Math.round(enParts(l.quantite, "gateaux", p.partsParGateau)) : l.quantite;
    return { produitId: l.produitId, quantiteExpediee: q };
  });
  // Expédition immédiate : contrôler le stock avant de créer le bon, pour ne pas laisser un bon orphelin.
  if (v.expedier) await verifierStock(db, v.shiftId, valeurs);
  const id = await db.transaction(async (tx) => {
    const [b] = await tx
      .insert(bonsLivraison)
      .values({
        siteOrigineId: s.siteId,
        siteDestinationId: v.siteDestinationId,
        commentaire: v.commentaire?.trim().slice(0, 500) || null,
        creePar: acteur.id,
        creeLe: maintenant,
      })
      .returning({ id: bonsLivraison.id, numero: bonsLivraison.numero });
    await tx.insert(lignesBon).values(valeurs.map((x) => ({ ...x, bonId: b.id })));
    return b.id;
  });
  await tracer(db, acteur.id, "creer_bon", "bon_livraison", id, { destination: dest.nom, lignes: valeurs.length });
  if (v.expedier) await expedierBon(db, id, v.shiftId, acteur, maintenant);
  return id;
}

/** Expédition : le bon sort du stock du site d'origine, sur le shift en cours. */
export async function expedierBon(db: Db, bonId: string, shiftId: string, acteur: Acteur, maintenant: Date) {
  const { s } = await shiftDeSaisie(db, shiftId, acteur);
  await db.transaction(async (tx) => {
    // Verrou sur le shift d'expédition : deux expéditions simultanées ne puisent pas deux fois dans le même stock.
    await tx.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, shiftId)).for("update");
    const b = await lireBon(tx as unknown as Db, bonId, true);
    exiger(b.statut === "prepare", b.statut === "annule" ? "Ce bon est annulé" : "Ce bon a déjà été expédié");
    exiger(b.siteOrigineId === s.siteId, "Ce bon ne part pas de ce site");
    const lignes = await tx.select().from(lignesBon).where(eq(lignesBon.bonId, bonId));
    const prods = await produitsDuShift(tx as unknown as Db, shiftId, lignes.map((l) => l.produitId));
    const absents = lignes.filter((l) => !prods.has(l.produitId)).map((l) => l.produitId);
    if (absents.length) {
      const noms = (await tx.select({ nom: produits.nom }).from(produits).where(inArray(produits.id, absents))).map((x) => x.nom);
      throw new ErreurMetier(`${noms.join(", ")} : absent du stock de ce shift (produit ajouté après son ouverture). Retirez la ligne du bon ou expédiez-le au prochain shift.`);
    }
    await verifierStock(tx as unknown as Db, shiftId, lignes);
    await tx.insert(mouvements).values(
      lignes.map((l) => ({
        shiftId,
        produitId: l.produitId,
        type: "sortie" as const,
        quantite: l.quantiteExpediee,
        commentaire: `Bon n° ${b.numero}`,
        bonId,
        utilisateurId: acteur.id,
        horodatage: maintenant,
      })),
    );
    await tx
      .update(bonsLivraison)
      .set({ statut: "expedie", shiftExpeditionId: shiftId, expediePar: acteur.id, expedieLe: maintenant })
      .where(eq(bonsLivraison.id, bonId));
  });
  await tracer(db, acteur.id, "expedier_bon", "bon_livraison", bonId, { shiftId });
}

/**
 * Réception par n'importe quel membre de l'équipe du site destinataire : quantités reçues
 * (pré-remplies avec l'expédié), qui deviennent des entrées du shift.
 */
export async function receptionnerBon(
  db: Db,
  v: { bonId: string; shiftId: string; recus: Record<string, number>; commentaire: string | null },
  acteur: Acteur,
  maintenant: Date,
) {
  const { s } = await shiftDeSaisie(db, v.shiftId, acteur);
  const resultat = await db.transaction(async (tx) => {
    // Verrou : deux équipiers qui valident la même réception ne la comptent qu'une fois.
    const b = await lireBon(tx as unknown as Db, v.bonId, true);
    exiger(b.statut === "expedie", b.statut === "recu" ? "Ce bon a déjà été réceptionné" : "Ce bon n'a pas été expédié");
    exiger(b.siteDestinationId === s.siteId, "Ce bon n'est pas destiné à ce site");
    const [origine] = await tx.select({ type: sites.type }).from(sites).where(eq(sites.id, b.siteOrigineId));
    const lignes = await tx.select().from(lignesBon).where(eq(lignesBon.bonId, v.bonId));
    const prods = await produitsDuShift(tx as unknown as Db, v.shiftId, lignes.map((l) => l.produitId));
    const entrees = [];
    let ecarts = 0;
    for (const l of lignes) {
      const p = prods.get(l.produitId);
      if (!p) {
        const [x] = await tx.select({ nom: produits.nom }).from(produits).where(eq(produits.id, l.produitId));
        throw new ErreurMetier(`${x?.nom ?? "Un produit"} n'est pas suivi dans ce shift (ajouté après son ouverture ou désactivé ici) : réceptionnez le bon au prochain shift et prévenez le manager.`);
      }
      const q = v.recus[l.produitId] ?? l.quantiteExpediee;
      exiger(estQuantiteValide(q, accepteDecimales(p.unite)), `${p.nom} : quantité reçue invalide`);
      if (q !== l.quantiteExpediee) ecarts++;
      exiger(q === l.quantiteExpediee || (v.commentaire?.trim().length ?? 0) >= 3, `${p.nom} : quantité différente de l'expédié — expliquez l'écart dans le commentaire`);
      await tx
        .update(lignesBon)
        .set({ quantiteRecue: q })
        .where(and(eq(lignesBon.bonId, v.bonId), eq(lignesBon.produitId, l.produitId)));
      if (q > 0)
        entrees.push({
          shiftId: v.shiftId,
          produitId: l.produitId,
          type: "entree" as const,
          quantite: q,
          origine: origine?.type === "laboratoire" ? ("labo" as const) : ("autre_site" as const),
          commentaire: `Bon n° ${b.numero}`,
          bonId: v.bonId,
          utilisateurId: acteur.id,
          horodatage: maintenant,
        });
    }
    if (entrees.length) await tx.insert(mouvements).values(entrees);
    await tx
      .update(bonsLivraison)
      .set({ statut: "recu", shiftReceptionId: v.shiftId, recuPar: acteur.id, recuLe: maintenant, commentaireReception: v.commentaire?.trim().slice(0, 500) || null })
      .where(eq(bonsLivraison.id, v.bonId));
    return { numero: b.numero, ecarts };
  });
  await tracer(db, acteur.id, "receptionner_bon", "bon_livraison", v.bonId, { shiftId: v.shiftId, ecarts: resultat.ecarts });
  return resultat;
}

/**
 * Ajuste un bon préparé avant l'expédition (bon de réapprovisionnement, stock insuffisant…) :
 * nouvelles quantités en unité de stock ; 0 retire la ligne. Équipe du site d'origine.
 */
export async function modifierBon(db: Db, bonId: string, quantites: Record<string, number>, acteur: Acteur) {
  const b = await lireBon(db, bonId);
  exiger(await aAccesAuSite(db, acteur.id, b.siteOrigineId), "Vous n'êtes pas rattaché au site d'origine du bon");
  exiger(b.statut === "prepare", "Seul un bon préparé (pas encore expédié) peut être modifié");
  const lignes = await db
    .select({ produitId: lignesBon.produitId, unite: produits.unite, nom: produits.nom })
    .from(lignesBon)
    .innerJoin(produits, eq(produits.id, lignesBon.produitId))
    .where(eq(lignesBon.bonId, bonId));
  for (const [produitId, q] of Object.entries(quantites)) {
    const l = lignes.find((x) => x.produitId === produitId);
    exiger(l, "Produit absent de ce bon");
    exiger(estQuantiteValide(q, accepteDecimales(l.unite)), `${l.nom} : quantité invalide`);
  }
  const restantes = lignes.filter((l) => (quantites[l.produitId] ?? 1) > 0);
  exiger(restantes.length, "Le bon serait vide : annulez-le plutôt");
  await db.transaction(async (tx) => {
    const x = await lireBon(tx as unknown as Db, bonId, true);
    exiger(x.statut === "prepare", "Le bon vient d'être expédié ou annulé : rechargez la page");
    for (const [produitId, q] of Object.entries(quantites)) {
      const cle = and(eq(lignesBon.bonId, bonId), eq(lignesBon.produitId, produitId));
      if (q === 0) await tx.delete(lignesBon).where(cle);
      else await tx.update(lignesBon).set({ quantiteExpediee: q }).where(cle);
    }
  });
  await tracer(db, acteur.id, "modifier_bon", "bon_livraison", bonId, { quantites });
}

/**
 * Annulation : un bon préparé, par l'équipe du site d'origine ; un bon expédié non reçu, par un
 * manager seulement (la sortie de stock est retirée). Un bon reçu ne s'annule pas.
 */
export async function annulerBon(db: Db, bonId: string, acteur: Acteur) {
  const b = await lireBon(db, bonId);
  exiger(await aAccesAuSite(db, acteur.id, b.siteOrigineId), "Vous n'êtes pas rattaché au site d'origine du bon");
  exiger(b.statut !== "recu", "Ce bon a déjà été réceptionné : il ne peut plus être annulé");
  exiger(b.statut !== "annule", "Ce bon est déjà annulé");
  if (b.statut === "expedie") {
    exiger(estEncadrant(acteur), "Ce bon est expédié : seul un manager peut l'annuler");
    if (b.shiftExpeditionId) {
      const [se] = await db.select({ statut: shifts.statut }).from(shifts).where(eq(shifts.id, b.shiftExpeditionId));
      exiger(se?.statut !== "valide", "Le shift d'expédition est validé : l'expédition ne peut plus être annulée");
    }
  }
  await db.transaction(async (tx) => {
    // Relu sous verrou : une réception simultanée ne peut pas être effacée par l'annulation.
    const x = await lireBon(tx as unknown as Db, bonId, true);
    exiger(x.statut === b.statut, "Le bon vient de changer d'état : rechargez la page");
    await tx.delete(mouvements).where(eq(mouvements.bonId, bonId));
    await tx.update(bonsLivraison).set({ statut: "annule" }).where(eq(bonsLivraison.id, bonId));
  });
  await tracer(db, acteur.id, "annuler_bon", "bon_livraison", bonId, { statutAvant: b.statut });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface LigneBonVue {
  produitId: string;
  nom: string;
  categorie: string;
  unite: Unite;
  partsParGateau: number | null;
  photoId: string | null;
  quantiteExpediee: number;
  quantiteRecue: number | null;
}

export interface BonVue {
  id: string;
  numero: number;
  statut: StatutBon;
  siteOrigineId: string;
  origine: string;
  siteDestinationId: string;
  destination: string;
  commentaire: string | null;
  commentaireReception: string | null;
  creeLe: Date;
  creePar: string | null;
  expedieLe: Date | null;
  expediePar: string | null;
  recuLe: Date | null;
  recuPar: string | null;
  lignes: LigneBonVue[];
  /** Nombre de produits dont le reçu diffère de l'expédié. */
  ecarts: number;
}

export async function listerBons(
  db: Db,
  f: {
    siteOrigineId?: string;
    siteDestinationId?: string;
    statuts?: StatutBon[];
    shiftExpeditionIds?: string[];
    depuis?: Date;
    limite?: number;
  },
): Promise<BonVue[]> {
  const so = alias(sites, "so");
  const sd = alias(sites, "sd");
  const uc = alias(utilisateurs, "uc");
  const ue = alias(utilisateurs, "ue");
  const ur = alias(utilisateurs, "ur");
  const rows = await db
    .select({ b: bonsLivraison, origine: so.nom, destination: sd.nom, creePar: uc.nom, expediePar: ue.nom, recuPar: ur.nom })
    .from(bonsLivraison)
    .innerJoin(so, eq(so.id, bonsLivraison.siteOrigineId))
    .innerJoin(sd, eq(sd.id, bonsLivraison.siteDestinationId))
    .leftJoin(uc, eq(uc.id, bonsLivraison.creePar))
    .leftJoin(ue, eq(ue.id, bonsLivraison.expediePar))
    .leftJoin(ur, eq(ur.id, bonsLivraison.recuPar))
    .where(
      and(
        f.siteOrigineId ? eq(bonsLivraison.siteOrigineId, f.siteOrigineId) : undefined,
        f.siteDestinationId ? eq(bonsLivraison.siteDestinationId, f.siteDestinationId) : undefined,
        f.statuts?.length ? inArray(bonsLivraison.statut, f.statuts) : undefined,
        f.shiftExpeditionIds ? inArray(bonsLivraison.shiftExpeditionId, f.shiftExpeditionIds) : undefined,
        f.depuis ? gte(sql`coalesce(${bonsLivraison.expedieLe}, ${bonsLivraison.creeLe})`, f.depuis) : undefined,
      ),
    )
    .orderBy(desc(bonsLivraison.numero))
    .limit(f.limite ?? 100);
  if (!rows.length) return [];
  const lignes = await db
    .select({
      bonId: lignesBon.bonId,
      produitId: lignesBon.produitId,
      nom: produits.nom,
      categorie: categories.nom,
      unite: produits.unite,
      partsParGateau: produits.partsParGateau,
      photoId: produits.photoId,
      quantiteExpediee: lignesBon.quantiteExpediee,
      quantiteRecue: lignesBon.quantiteRecue,
    })
    .from(lignesBon)
    .innerJoin(produits, eq(produits.id, lignesBon.produitId))
    .innerJoin(categories, eq(categories.id, produits.categorieId))
    .where(inArray(lignesBon.bonId, rows.map((r) => r.b.id)))
    .orderBy(asc(categories.ordre), asc(produits.ordre));
  return rows.map((r) => {
    const ls = lignes.filter((l) => l.bonId === r.b.id).map(({ bonId: _, ...l }) => l);
    return {
      id: r.b.id,
      numero: r.b.numero,
      statut: r.b.statut,
      siteOrigineId: r.b.siteOrigineId,
      origine: r.origine,
      siteDestinationId: r.b.siteDestinationId,
      destination: r.destination,
      commentaire: r.b.commentaire,
      commentaireReception: r.b.commentaireReception,
      creeLe: r.b.creeLe,
      creePar: r.creePar,
      expedieLe: r.b.expedieLe,
      expediePar: r.expediePar,
      recuLe: r.b.recuLe,
      recuPar: r.recuPar,
      lignes: ls,
      ecarts: r.b.statut === "recu" ? ls.filter((l) => l.quantiteRecue !== l.quantiteExpediee).length : 0,
    };
  });
}

/** Sites vers lesquels un site peut livrer : les autres points de vente ouverts. */
export async function destinationsPossibles(db: Db, siteId: string) {
  return db
    .select({ id: sites.id, nom: sites.nom, type: sites.type })
    .from(sites)
    .where(and(ne(sites.id, siteId), eq(sites.statut, "actif"), eq(sites.type, "point_de_vente")))
    .orderBy(asc(sites.ordre), asc(sites.nom));
}

// ---------------------------------------------------------------------------
// Rapport du laboratoire
// ---------------------------------------------------------------------------

export interface RapportLabo {
  production: { produitId: string; produit: string; unite: Unite; partsParGateau: number | null; total: number; parJour: Record<string, number> }[];
  jours: string[];
  livraisons: { destination: string; bons: number; recus: number; enAttente: number; avecEcart: number }[];
  ecartsLivraison: { bonId: string; numero: number; destination: string; recuLe: Date | null; produit: string; unite: Unite; partsParGateau: number | null; expedie: number; recu: number }[];
  enAttente: BonVue[];
  consommation: {
    produitId: string;
    produit: string;
    unite: Unite;
    quantite: number;
    /** Consommation attendue d'après les fiches techniques (null sans fiche). */
    theorique: number | null;
    valeur: number | null;
    coutConnu: boolean;
  }[];
  valeurConsommation: number;
  pertes: { produitId: string; produit: string; unite: Unite; partsParGateau: number | null; quantite: number }[];
  shiftsClos: number;
}

/** Production, livraisons, écarts de livraison et consommation d'ingrédients d'un laboratoire sur une période. */
export async function rapportLabo(db: Db, siteId: string, du: string, au: string): Promise<RapportLabo> {
  const shiftsLabo = await db
    .select({ id: shifts.id, journee: shifts.journee, statut: shifts.statut })
    .from(shifts)
    .where(and(eq(shifts.siteId, siteId), gte(shifts.journee, du), lte(shifts.journee, au), ne(shifts.statut, "planifie")))
    .orderBy(asc(shifts.journee));
  const ids = shiftsLabo.map((s) => s.id);
  const journeeDe = new Map(shiftsLabo.map((s) => [s.id, s.journee]));

  // Production : entrées « production » des shifts du labo.
  const prod = ids.length
    ? await db
        .select({
          shiftId: mouvements.shiftId,
          produitId: mouvements.produitId,
          produit: produits.nom,
          unite: produits.unite,
          partsParGateau: produits.partsParGateau,
          total: sql<number>`cast(sum(${mouvements.quantite}) as float8)`,
        })
        .from(mouvements)
        .innerJoin(produits, eq(produits.id, mouvements.produitId))
        .where(and(inArray(mouvements.shiftId, ids), eq(mouvements.type, "entree"), eq(mouvements.origine, "production")))
        .groupBy(mouvements.shiftId, mouvements.produitId, produits.nom, produits.unite, produits.partsParGateau, produits.ordre)
        .orderBy(asc(produits.ordre))
    : [];
  const production = new Map<string, RapportLabo["production"][number]>();
  for (const r of prod) {
    const x = production.get(r.produitId) ?? { produitId: r.produitId, produit: r.produit, unite: r.unite, partsParGateau: r.partsParGateau, total: 0, parJour: {} };
    const j = journeeDe.get(r.shiftId)!;
    x.parJour[j] = arrondiQ((x.parJour[j] ?? 0) + Number(r.total));
    x.total = arrondiQ(x.total + Number(r.total));
    production.set(r.produitId, x);
  }

  // Livraisons : bons expédiés depuis un shift du labo de la période.
  const bonsPeriode = ids.length
    ? await listerBons(db, { siteOrigineId: siteId, statuts: ["expedie", "recu"], shiftExpeditionIds: ids, limite: 1000 })
    : [];
  const parDest = new Map<string, RapportLabo["livraisons"][number]>();
  for (const b of bonsPeriode) {
    const x = parDest.get(b.destination) ?? { destination: b.destination, bons: 0, recus: 0, enAttente: 0, avecEcart: 0 };
    x.bons++;
    if (b.statut === "recu") x.recus++;
    else x.enAttente++;
    if (b.ecarts) x.avecEcart++;
    parDest.set(b.destination, x);
  }
  const ecartsLivraison = bonsPeriode.flatMap((b) =>
    b.lignes
      .filter((l) => b.statut === "recu" && l.quantiteRecue !== l.quantiteExpediee)
      .map((l) => ({
        bonId: b.id,
        numero: b.numero,
        destination: b.destination,
        recuLe: b.recuLe,
        produit: l.nom,
        unite: l.unite,
        partsParGateau: l.partsParGateau,
        expedie: l.quantiteExpediee,
        recu: l.quantiteRecue ?? 0,
      })),
  );

  // Consommation d'ingrédients et pertes : shifts clôturés du labo.
  const clos = shiftsLabo.filter((s) => s.statut === "cloture" || s.statut === "valide");
  const conso = new Map<string, RapportLabo["consommation"][number]>();
  const pertes = new Map<string, RapportLabo["pertes"][number]>();
  const toutes = await lignesCalculeesPlusieurs(db, clos.map((s) => s.id));
  for (const s of clos) {
    for (const l of toutes.get(s.id) ?? []) {
      if (l.calcul.consommation !== null && l.calcul.consommation !== 0) {
        const x = conso.get(l.produitId) ?? { produitId: l.produitId, produit: l.nom, unite: l.unite, quantite: 0, theorique: null, valeur: 0, coutConnu: true };
        x.quantite = arrondiQ(x.quantite + l.calcul.consommation);
        if (l.consommationTheorique !== null && l.consommationTheorique !== undefined) x.theorique = arrondiQ((x.theorique ?? 0) + l.consommationTheorique);
        if (l.calcul.valeurConsommation === null) x.coutConnu = false;
        else x.valeur = Math.round(((x.valeur ?? 0) + l.calcul.valeurConsommation) * 100) / 100;
        conso.set(l.produitId, x);
      }
      if (l.pertes) {
        const x = pertes.get(l.produitId) ?? { produitId: l.produitId, produit: l.nom, unite: l.unite, partsParGateau: l.partsParGateau, quantite: 0 };
        x.quantite = arrondiQ(x.quantite + l.pertes);
        pertes.set(l.produitId, x);
      }
    }
  }
  const consommation = [...conso.values()].sort((a, b) => (b.valeur ?? 0) - (a.valeur ?? 0) || b.quantite - a.quantite);
  return {
    production: [...production.values()],
    jours: [...new Set(shiftsLabo.map((s) => s.journee))],
    livraisons: [...parDest.values()],
    ecartsLivraison,
    enAttente: (await listerBons(db, { siteOrigineId: siteId, statuts: ["expedie"], limite: 50 })),
    consommation,
    valeurConsommation: Math.round(consommation.reduce((t, c) => t + (c.valeur ?? 0), 0) * 100) / 100,
    pertes: [...pertes.values()],
    shiftsClos: clos.length,
  };
}
