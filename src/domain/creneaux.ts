import {
  ajouterJours,
  enMinutes,
  estHeure,
  instantLocal,
  jourIso,
  NOMS_JOURS,
  type Journee,
} from "./temps";

/**
 * Créneau horaire d'un site. Les heures sont locales (Casablanca).
 * Une heure de fin inférieure ou égale à l'heure de début signifie « le lendemain ».
 * `jours` : jours ISO (1 = lundi … 7 = dimanche) où le créneau s'applique,
 * le jour considéré étant toujours celui du DÉBUT du shift.
 */
export interface CreneauDef {
  id: string;
  nom: string;
  heureDebut: string;
  heureFin: string;
  jours: number[];
  ordre?: number;
}

const MINUTES_JOUR = 24 * 60;
const MINUTES_SEMAINE = 7 * MINUTES_JOUR;

export function finLendemain(c: Pick<CreneauDef, "heureDebut" | "heureFin">): boolean {
  return enMinutes(c.heureFin) <= enMinutes(c.heureDebut);
}

export function dureeMinutes(c: Pick<CreneauDef, "heureDebut" | "heureFin">): number {
  const d = enMinutes(c.heureDebut);
  const f = enMinutes(c.heureFin);
  return f > d ? f - d : f + MINUTES_JOUR - d;
}

export function libelleHoraire(c: Pick<CreneauDef, "heureDebut" | "heureFin">): string {
  return finLendemain(c)
    ? `${c.heureDebut} → ${c.heureFin} (lendemain)`
    : `${c.heureDebut} → ${c.heureFin}`;
}

/**
 * Bornes réelles (instants) d'un créneau pour une journée d'exploitation.
 * Le shift de nuit du vendredi 20:00 → 04:00 commence le vendredi et finit le samedi.
 */
export function intervalleCreneau(
  journee: Journee,
  c: Pick<CreneauDef, "heureDebut" | "heureFin">,
): { debut: Date; fin: Date } {
  const debut = instantLocal(journee, c.heureDebut);
  const fin = instantLocal(finLendemain(c) ? ajouterJours(journee, 1) : journee, c.heureFin);
  return { debut, fin };
}

/** Créneaux applicables à une journée (selon le jour de DÉBUT), triés par heure de début. */
export function creneauxDuJour<T extends CreneauDef>(creneaux: T[], journee: Journee): T[] {
  const j = jourIso(journee);
  return creneaux
    .filter((c) => c.jours.includes(j))
    .sort((a, b) => enMinutes(a.heureDebut) - enMinutes(b.heureDebut));
}

/**
 * Créneau en cours à un instant donné. À 02:00 le samedi, le créneau en cours est
 * la nuit du VENDREDI : on regarde donc aussi les créneaux de la veille.
 */
export function creneauEnCours<T extends CreneauDef>(
  creneaux: T[],
  instant: Date,
  journeeDuJour: Journee,
): { creneau: T; journee: Journee; debut: Date; fin: Date } | null {
  for (const journee of [ajouterJours(journeeDuJour, -1), journeeDuJour]) {
    for (const creneau of creneauxDuJour(creneaux, journee)) {
      const { debut, fin } = intervalleCreneau(journee, creneau);
      if (debut.getTime() <= instant.getTime() && instant.getTime() < fin.getTime()) {
        return { creneau, journee, debut, fin };
      }
    }
  }
  return null;
}

export interface Chevauchement {
  a: { creneau: string; jour: number };
  b: { creneau: string; jour: number };
  message: string;
}

/**
 * Détecte les recouvrements entre créneaux d'un même site sur une semaine type,
 * y compris d'un jour sur l'autre (ex. nuit du vendredi jusqu'à 04:00 et matin du samedi à 03:00)
 * et entre la nuit du dimanche et le lundi matin.
 */
export function detecterChevauchements(creneaux: CreneauDef[]): Chevauchement[] {
  type Iv = { c: CreneauDef; jour: number; debut: number; fin: number };
  const ivs: Iv[] = [];
  for (const c of creneaux) {
    const duree = dureeMinutes(c);
    for (const jour of new Set(c.jours)) {
      const debut = (jour - 1) * MINUTES_JOUR + enMinutes(c.heureDebut);
      ivs.push({ c, jour, debut, fin: debut + duree });
    }
  }
  const res: Chevauchement[] = [];
  const vus = new Set<string>();
  for (let i = 0; i < ivs.length; i++) {
    for (let k = i + 1; k < ivs.length; k++) {
      const x = ivs[i];
      const y = ivs[k];
      // On compare aussi avec la semaine décalée pour gérer dimanche nuit → lundi.
      const recouvre = [-MINUTES_SEMAINE, 0, MINUTES_SEMAINE].some(
        (dec) => x.debut < y.fin + dec && y.debut + dec < x.fin,
      );
      if (!recouvre) continue;
      const cle = [`${x.c.id}:${x.jour}`, `${y.c.id}:${y.jour}`].sort().join("|");
      if (vus.has(cle)) continue;
      vus.add(cle);
      res.push({
        a: { creneau: x.c.nom, jour: x.jour },
        b: { creneau: y.c.nom, jour: y.jour },
        message: `« ${x.c.nom} » du ${NOMS_JOURS[x.jour].toLowerCase()} (${libelleHoraire(x.c)}) chevauche « ${y.c.nom} » du ${NOMS_JOURS[y.jour].toLowerCase()} (${libelleHoraire(y.c)})`,
      });
    }
  }
  return res;
}

/** Erreurs de saisie d'une grille de créneaux (format, durée, jours, chevauchements). */
export function validerCreneaux(creneaux: CreneauDef[]): string[] {
  const erreurs: string[] = [];
  for (const c of creneaux) {
    const nom = c.nom.trim() || "(sans nom)";
    if (!c.nom.trim()) erreurs.push("Chaque créneau doit avoir un nom.");
    if (!estHeure(c.heureDebut) || !estHeure(c.heureFin)) {
      erreurs.push(`« ${nom} » : heures au format HH:MM attendues.`);
      continue;
    }
    if (c.heureDebut === c.heureFin) erreurs.push(`« ${nom} » : l'heure de fin doit différer de l'heure de début.`);
    if (c.jours.length === 0) erreurs.push(`« ${nom} » : choisir au moins un jour.`);
    if (c.jours.some((j) => !Number.isInteger(j) || j < 1 || j > 7)) erreurs.push(`« ${nom} » : jour invalide.`);
  }
  if (erreurs.length) return erreurs;
  return detecterChevauchements(creneaux).map((c) => c.message);
}
