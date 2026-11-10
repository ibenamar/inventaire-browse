import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Fuseau de référence de toutes les dates métier (y compris le passage à GMT pendant le ramadan). */
export const FUSEAU = "Africa/Casablanca";

/** Date calendaire au format AAAA-MM-JJ. */
export type Journee = string;

const RE_JOURNEE = /^\d{4}-\d{2}-\d{2}$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function estJournee(v: string): v is Journee {
  return RE_JOURNEE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

export function estHeure(v: string): boolean {
  return RE_HEURE.test(v);
}

/** "HH:MM" → minutes depuis minuit. */
export function enMinutes(heure: string): number {
  const m = RE_HEURE.exec(heure);
  if (!m) throw new Error(`Heure invalide : ${heure}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Ajoute n jours à une journée (calcul calendaire, indépendant du fuseau). */
export function ajouterJours(journee: Journee, n: number): Journee {
  const d = new Date(`${journee}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function jourIso(journee: Journee): number {
  const j = new Date(`${journee}T00:00:00Z`).getUTCDay();
  return j === 0 ? 7 : j;
}

/** Lundi de la semaine contenant la journée. */
export function lundiDe(journee: Journee): Journee {
  return ajouterJours(journee, 1 - jourIso(journee));
}

/** Instant correspondant à une heure locale (Casablanca) d'une journée donnée. */
export function instantLocal(journee: Journee, heure: string): Date {
  return fromZonedTime(`${journee}T${heure}:00`, FUSEAU);
}

/** Journée calendaire locale (Casablanca) d'un instant. */
export function journeeLocale(instant: Date): Journee {
  return formatInTimeZone(instant, FUSEAU, "yyyy-MM-dd");
}

export function heureLocale(instant: Date): string {
  return formatInTimeZone(instant, FUSEAU, "HH:mm");
}

export function formatLocal(instant: Date, motif = "dd/MM/yyyy HH:mm"): string {
  return formatInTimeZone(instant, FUSEAU, motif);
}

export const NOMS_JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const NOMS_JOURS_COURTS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function libelleJournee(journee: Journee): string {
  const [a, m, j] = journee.split("-");
  return `${NOMS_JOURS[jourIso(journee)]} ${j}/${m}/${a}`;
}
