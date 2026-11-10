import { formatQuantite, libelleQuantite } from "@/domain/unites";
import type { LigneDetail } from "@/server/services/shifts";

/**
 * Champs d'un produit envoyés au navigateur pour la saisie. Jamais le théorique, l'ouverture
 * reprise ni les écarts : ils resteraient lisibles dans les données de la page et fausseraient
 * le comptage à l'aveugle.
 */
export const pourSaisie = (l: LigneDetail) => ({
  produitId: l.produitId,
  nom: l.nom,
  categorie: l.categorie,
  unite: l.unite,
  partsParGateau: l.partsParGateau,
  photoId: l.photoId,
});

/** Quantité d'un mouvement avec son unité (« 2 gâteaux (16 parts) », « 2,5 kg »). */
export function quantiteMouvement(lignes: LigneDetail[], m: { produitId: string; quantite: number }): string {
  const l = lignes.find((x) => x.produitId === m.produitId);
  return l ? libelleQuantite(m.quantite, l) : formatQuantite(m.quantite);
}
