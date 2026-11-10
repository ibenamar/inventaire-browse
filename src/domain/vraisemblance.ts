import type { Unite } from "@/db/schema";

/**
 * Contrôles de vraisemblance : repérer les saisies probablement fausses (un zéro de trop) et les
 * écarts qui doivent être expliqués avant de clôturer.
 */

/** Au-delà, une quantité est inhabituelle et l'interface demande de la vérifier (sans bloquer). */
export const SEUIL_QUANTITE_INHABITUELLE: Record<Unite, number> = {
  piece: 300,
  part: 400,
  bouteille: 300,
  kg: 200,
  litre: 200,
  sachet: 300,
  boite: 300,
};

export const estQuantiteInhabituelle = (q: number | null, unite: Unite) => q !== null && q > SEUIL_QUANTITE_INHABITUELLE[unite];

/** Écart à expliquer à la clôture : au moins 3 unités sur un produit, ou 100 MAD au total. */
export const SEUIL_ECART_UNITES = 3;
export const SEUIL_ECART_VALEUR_MAD = 100;

export interface LigneEcart {
  nom: string;
  ecart: number | null;
}

/** Écarts importants d'un shift : produits concernés et motif. Vide si rien à expliquer. */
export function ecartsImportants(lignes: LigneEcart[], valeurEcarts: number): string[] {
  const res = lignes
    .filter((l) => l.ecart !== null && Math.abs(l.ecart) >= SEUIL_ECART_UNITES)
    .map((l) => `${l.nom} (${l.ecart! > 0 ? "+" : ""}${l.ecart})`);
  if (Math.abs(valeurEcarts) >= SEUIL_ECART_VALEUR_MAD) res.push(`valeur totale des écarts ${Math.round(valeurEcarts)} MAD`);
  return res;
}
