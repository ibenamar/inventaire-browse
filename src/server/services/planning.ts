import { and, asc, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { creneaux, equipesShift, shifts, sites, utilisateurs } from "@/db/schema";
import { creneauxDuJour, intervalleCreneau } from "@/domain/creneaux";
import { ajouterJours, enMinutes, estJournee, heureLocale, jourIso, type Journee } from "@/domain/temps";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";
import { listerCreneaux, type Creneau } from "./sites";
import { aAccesAuSite } from "./utilisateurs";

export const TAILLE_MAX_EQUIPE = 2;

export interface ShiftPlanifie {
  id: string;
  siteId: string;
  creneauId: string | null;
  nomCreneau: string;
  journee: Journee;
  debutPrevu: Date;
  finPrevue: Date;
  statut: (typeof shifts.$inferSelect)["statut"];
  clotureLe: Date | null;
  responsableId: string | null;
  responsable: string | null;
  equipe: { id: string; nom: string }[];
}

/** Shifts d'une période (journées incluses), avec responsable et équipe. */
export async function shiftsDePeriode(
  db: Db,
  filtre: { siteId?: string; du: Journee; au: Journee },
): Promise<ShiftPlanifie[]> {
  const lignes = await db
    .select({
      id: shifts.id,
      siteId: shifts.siteId,
      creneauId: shifts.creneauId,
      nomCreneau: shifts.nomCreneau,
      journee: shifts.journee,
      debutPrevu: shifts.debutPrevu,
      finPrevue: shifts.finPrevue,
      statut: shifts.statut,
      clotureLe: shifts.clotureLe,
      responsableId: shifts.responsableId,
      responsable: utilisateurs.nom,
    })
    .from(shifts)
    .leftJoin(utilisateurs, eq(utilisateurs.id, shifts.responsableId))
    .where(
      and(
        filtre.siteId ? eq(shifts.siteId, filtre.siteId) : undefined,
        gte(shifts.journee, filtre.du),
        lte(shifts.journee, filtre.au),
      ),
    )
    .orderBy(asc(shifts.debutPrevu));
  const ids = lignes.map((l) => l.id);
  const equipes = ids.length
    ? await db
        .select({ shiftId: equipesShift.shiftId, id: utilisateurs.id, nom: utilisateurs.nom })
        .from(equipesShift)
        .innerJoin(utilisateurs, eq(utilisateurs.id, equipesShift.utilisateurId))
        .where(inArray(equipesShift.shiftId, ids))
    : [];
  return lignes.map((l) => ({
    ...l,
    equipe: equipes.filter((e) => e.shiftId === l.id).map(({ id, nom }) => ({ id, nom })),
  }));
}

export interface JourPlanning {
  journee: Journee;
  cases: { creneau: Creneau | null; nomCreneau: string; shift: ShiftPlanifie | null }[];
}

/** Grille de planning : pour chaque journée, les créneaux applicables et le shift planifié éventuel. */
export async function grillePlanning(db: Db, siteId: string, du: Journee, au: Journee): Promise<JourPlanning[]> {
  const cr = await listerCreneaux(db, siteId);
  const sh = await shiftsDePeriode(db, { siteId, du, au });
  const jours: JourPlanning[] = [];
  for (let j = du; j <= au; j = ajouterJours(j, 1)) {
    const duJour = sh.filter((s) => s.journee === j);
    const cases: JourPlanning["cases"] = creneauxDuJour(cr, j).map((c) => ({
      creneau: c,
      nomCreneau: c.nom,
      shift: duJour.find((s) => s.creneauId === c.id) ?? null,
    }));
    // Shifts dont le créneau a depuis été modifié ou retiré : on les affiche quand même.
    for (const s of duJour) {
      if (!cases.some((c) => c.shift?.id === s.id)) cases.push({ creneau: null, nomCreneau: s.nomCreneau, shift: s });
    }
    const cle = (c: JourPlanning["cases"][number]) =>
      enMinutes(c.creneau ? c.creneau.heureDebut : heureLocale(c.shift!.debutPrevu));
    cases.sort((a, b) => cle(a) - cle(b));
    jours.push({ journee: j, cases: cr.length || duJour.length ? cases : [] });
  }
  return jours;
}

export interface Affectation {
  siteId: string;
  journee: Journee;
  creneauId: string;
  responsableId: string;
  equipierIds: string[];
}

async function verifierDisponibilite(db: Db, utilisateurId: string, debut: Date, fin: Date, saufShiftId: string | null) {
  const commun = and(lt(shifts.debutPrevu, fin), gt(shifts.finPrevue, debut), saufShiftId ? ne(shifts.id, saufShiftId) : undefined);
  const commeResp = await db
    .select({ id: shifts.id, site: sites.nom, creneau: shifts.nomCreneau, journee: shifts.journee })
    .from(shifts)
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .where(and(commun, eq(shifts.responsableId, utilisateurId)));
  const commeEquipier = await db
    .select({ id: shifts.id, site: sites.nom, creneau: shifts.nomCreneau, journee: shifts.journee })
    .from(shifts)
    .innerJoin(sites, eq(sites.id, shifts.siteId))
    .innerJoin(equipesShift, eq(equipesShift.shiftId, shifts.id))
    .where(and(commun, eq(equipesShift.utilisateurId, utilisateurId)));
  const conflit = [...commeResp, ...commeEquipier][0];
  if (conflit) {
    const [u] = await db.select({ nom: utilisateurs.nom }).from(utilisateurs).where(eq(utilisateurs.id, utilisateurId));
    throw new ErreurMetier(
      `${u?.nom ?? "Cet employé"} est déjà planifié sur « ${conflit.creneau} » du ${conflit.journee} (${conflit.site}).`,
    );
  }
}

/**
 * Crée ou met à jour le shift planifié d'une case du planning.
 * Le responsable d'inventaire fait partie de l'équipe (1 à 2 personnes au total).
 */
export async function affecter(db: Db, a: Affectation, acteur: Acteur): Promise<string> {
  exiger(estJournee(a.journee), "Date invalide");
  const [c] = await db.select().from(creneaux).where(eq(creneaux.id, a.creneauId));
  exiger(c && c.siteId === a.siteId && c.actif, "Créneau introuvable pour ce site");
  exiger(c.jours.includes(jourIso(a.journee)), "Ce créneau ne s'applique pas à ce jour");
  const equipiers = [...new Set(a.equipierIds.filter((id) => id && id !== a.responsableId))];
  exiger(a.responsableId, "Désigner un responsable d'inventaire");
  exiger(equipiers.length + 1 <= TAILLE_MAX_EQUIPE, `Une équipe compte ${TAILLE_MAX_EQUIPE} personnes au maximum`);
  for (const id of [a.responsableId, ...equipiers]) {
    exiger(await aAccesAuSite(db, id, a.siteId), "Un membre de l'équipe n'est pas rattaché à ce site");
  }

  const [existant] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.siteId, a.siteId), eq(shifts.journee, a.journee), eq(shifts.creneauId, a.creneauId)));
  if (existant) exiger(existant.statut === "planifie" || existant.statut === "ouvert", "Ce shift est déjà clôturé");

  const { debut, fin } = existant
    ? { debut: existant.debutPrevu, fin: existant.finPrevue }
    : intervalleCreneau(a.journee, c);
  for (const id of [a.responsableId, ...equipiers]) {
    await verifierDisponibilite(db, id, debut, fin, existant?.id ?? null);
  }

  let shiftId: string;
  if (existant) {
    shiftId = existant.id;
    await db.update(shifts).set({ responsableId: a.responsableId }).where(eq(shifts.id, shiftId));
    if (existant.responsableId && existant.responsableId !== a.responsableId) {
      await tracer(db, acteur.id, "reaffecter_responsable", "shift", shiftId, {
        avant: existant.responsableId,
        apres: a.responsableId,
      });
    }
  } else {
    const [s] = await db
      .insert(shifts)
      .values({
        siteId: a.siteId,
        creneauId: c.id,
        nomCreneau: c.nom,
        journee: a.journee,
        debutPrevu: debut,
        finPrevue: fin,
        responsableId: a.responsableId,
      })
      .returning({ id: shifts.id });
    shiftId = s.id;
    await tracer(db, acteur.id, "planifier", "shift", shiftId, { ...a });
  }
  await db.delete(equipesShift).where(eq(equipesShift.shiftId, shiftId));
  await db.insert(equipesShift).values([a.responsableId, ...equipiers].map((utilisateurId) => ({ shiftId, utilisateurId })));
  return shiftId;
}

export async function retirerAffectation(db: Db, shiftId: string, acteur: Acteur) {
  const [s] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  exiger(s, "Shift introuvable");
  exiger(s.statut === "planifie", "Un shift déjà ouvert ne peut pas être retiré du planning");
  await db.delete(shifts).where(eq(shifts.id, shiftId));
  await tracer(db, acteur.id, "retirer", "shift", shiftId, { journee: s.journee, creneau: s.nomCreneau });
}

/** Recopie les affectations d'une période sur une autre (ex. semaine type). */
export async function dupliquerPeriode(
  db: Db,
  siteId: string,
  source: { du: Journee; au: Journee },
  cibleDu: Journee,
  acteur: Acteur,
): Promise<{ copies: number; ignores: number }> {
  const decalage = Math.round((Date.parse(cibleDu) - Date.parse(source.du)) / 86_400_000);
  exiger(decalage % 7 === 0 && decalage !== 0, "La copie doit se faire d'une semaine sur une autre");
  const sh = await shiftsDePeriode(db, { siteId, ...source });
  let copies = 0;
  let ignores = 0;
  for (const s of sh) {
    const journeeCible = ajouterJours(s.journee, decalage);
    const [dejaPlanifie] = s.creneauId
      ? await db
          .select({ id: shifts.id })
          .from(shifts)
          .where(and(eq(shifts.siteId, siteId), eq(shifts.journee, journeeCible), eq(shifts.creneauId, s.creneauId)))
      : [];
    if (!s.creneauId || !s.responsableId || dejaPlanifie) {
      ignores++;
      continue;
    }
    try {
      await affecter(
        db,
        {
          siteId,
          journee: journeeCible,
          creneauId: s.creneauId,
          responsableId: s.responsableId,
          equipierIds: s.equipe.map((e) => e.id),
        },
        acteur,
      );
      copies++;
    } catch (e) {
      if (!(e instanceof ErreurMetier)) throw e;
      ignores++;
    }
  }
  return { copies, ignores };
}

/** Utilisateurs proposables dans le planning d'un site. */
export async function equipiersPossibles(db: Db, siteId: string) {
  const { utilisateursDuSite } = await import("./utilisateurs");
  const [site] = await db.select({ type: sites.type }).from(sites).where(eq(sites.id, siteId));
  // Le rôle « labo » ne travaille qu'au laboratoire.
  return (await utilisateursDuSite(db, siteId)).filter((u) => u.role !== "labo" || site?.type === "laboratoire");
}

