import { ajouterJours, estJournee, journeeLocale, lundiDe, type Journee } from "@/domain/temps";

export type Vue = "semaine" | "mois";

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Bornes d'une semaine (lundi → dimanche) ou d'un mois calendaire contenant `date`. */
export function periode(vue: Vue, dateParam: string | undefined) {
  const date: Journee = dateParam && estJournee(dateParam) ? dateParam : journeeLocale(new Date());
  if (vue === "mois") {
    const [a, m] = date.split("-").map(Number);
    const du = `${a}-${String(m).padStart(2, "0")}-01`;
    const au = ajouterJours(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`, -1);
    const precedent = ajouterJours(du, -1);
    const suivant = ajouterJours(au, 1);
    return { du, au, precedent, suivant, libelle: `${MOIS[m - 1]} ${a}` };
  }
  const du = lundiDe(date);
  const au = ajouterJours(du, 6);
  const f = (j: Journee) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;
  return { du, au, precedent: ajouterJours(du, -7), suivant: ajouterJours(du, 7), libelle: `Semaine du ${f(du)} au ${f(au)}` };
}
