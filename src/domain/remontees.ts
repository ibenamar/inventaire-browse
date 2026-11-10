/**
 * Statut de remontée d'un shift planifié : sert au suivi et à la responsabilisation
 * des responsables d'inventaire.
 */
export type StatutRemontee = "a_venir" | "en_cours" | "a_l_heure" | "en_retard" | "manquant";

export const TOLERANCE_CLOTURE_MIN = 30;

export interface ShiftRemontee {
  statut: "planifie" | "ouvert" | "cloture" | "valide";
  debutPrevu: Date;
  finPrevue: Date;
  clotureLe: Date | null;
}

export function statutRemontee(
  s: ShiftRemontee,
  maintenant: Date,
  toleranceMin = TOLERANCE_CLOTURE_MIN,
): StatutRemontee {
  const limite = s.finPrevue.getTime() + toleranceMin * 60_000;
  if (s.statut === "cloture" || s.statut === "valide") {
    return s.clotureLe && s.clotureLe.getTime() <= limite ? "a_l_heure" : "en_retard";
  }
  if (maintenant.getTime() > limite) return s.statut === "ouvert" ? "en_retard" : "manquant";
  if (maintenant.getTime() < s.debutPrevu.getTime()) return "a_venir";
  return "en_cours";
}

export const LIBELLES_REMONTEE: Record<StatutRemontee, string> = {
  a_venir: "À venir",
  en_cours: "En cours",
  a_l_heure: "Remonté à l'heure",
  en_retard: "En retard",
  manquant: "Manquant",
};
