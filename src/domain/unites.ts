import type { OrigineEntree, Unite } from "@/db/schema";

/** Libellés des unités de stock, au singulier et au pluriel. */
export const UNITE_SINGULIER: Record<Unite, string> = {
  piece: "pièce",
  part: "part",
  bouteille: "bouteille",
  kg: "kg",
  litre: "litre",
  sachet: "sachet",
  boite: "boîte",
};

export const UNITE_PLURIEL: Record<Unite, string> = {
  piece: "pièces",
  part: "parts",
  bouteille: "bouteilles",
  kg: "kg",
  litre: "litres",
  sachet: "sachets",
  boite: "boîtes",
};

/** Unités proposées pour un ingrédient (les produits finis sont en pièces, parts ou bouteilles). */
export const UNITES_INGREDIENT: Unite[] = ["kg", "litre", "piece", "sachet", "boite", "bouteille"];

export const LIBELLE_ORIGINE: Record<OrigineEntree, string> = {
  labo: "Laboratoire",
  fournisseur: "Fournisseur",
  autre_site: "Autre point de vente",
  autre: "Autre",
  production: "Production",
};

/** Quantité à la française (virgule décimale, 3 décimales au plus). */
export const formatQuantite = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

/** Lecture d'une saisie (« 1,5 » ou « 1.5 ») ; null si vide ou illisible. */
export function lireQuantite(texte: string): number | null {
  const t = texte.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Au laboratoire, les cakes se comptent en gâteaux entiers (le stock reste en parts) ;
 * renvoie le nombre de parts par gâteau dans ce cas, sinon null.
 */
export const partsSiEnGateaux = (typeSite: "point_de_vente" | "laboratoire", p: { unite: Unite; partsParGateau: number | null }) =>
  typeSite === "laboratoire" && p.unite === "part" && p.partsParGateau ? p.partsParGateau : null;

/** « 2 gâteaux (16 parts) », « 1,5 kg », « 12 pièces » : quantité de stock lisible. */
export function libelleQuantite(q: number, p: { unite: Unite; partsParGateau: number | null }): string {
  if (p.unite === "part" && p.partsParGateau && q >= p.partsParGateau) {
    const g = q / p.partsParGateau;
    const gat = `${formatQuantite(Math.round(g * 100) / 100)} gâteau${g >= 2 ? "x" : ""}`;
    return `${gat} (${formatQuantite(q)} parts)`;
  }
  return `${formatQuantite(q)} ${q > 1 || p.unite === "kg" ? UNITE_PLURIEL[p.unite] : UNITE_SINGULIER[p.unite]}`;
}
