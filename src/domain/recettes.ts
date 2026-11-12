/**
 * Fiches techniques à plusieurs niveaux : un produit fini utilise des matières premières et des
 * préparations intermédiaires (pâte, crème, ganache…), elles-mêmes faites de matières premières
 * (ou d'autres intermédiaires). Règles pures, sans accès à la base.
 */
import { arrondiQ } from "./calculs";

export interface LigneFiche {
  /** Produit fini ou préparation intermédiaire décrit par la fiche. */
  produitId: string;
  /** Composant : matière première ou préparation intermédiaire. */
  ingredientId: string;
  /** Quantité du composant pour une unité de recette (un gâteau entier, 1 kg, une pièce…). */
  quantite: number;
}

/** Index des fiches : produit → composants. */
export function indexerFiches(lignes: readonly LigneFiche[]): Map<string, { ingredientId: string; quantite: number }[]> {
  const res = new Map<string, { ingredientId: string; quantite: number }[]>();
  for (const l of lignes) res.set(l.produitId, [...(res.get(l.produitId) ?? []), { ingredientId: l.ingredientId, quantite: l.quantite }]);
  return res;
}

/**
 * Vrai si donner `composants` à la fiche de `produitId` créerait une boucle (la crème utilise la
 * pâte qui utilise la crème…) : un composant ne peut pas, directement ou non, utiliser le produit.
 */
export function creeUneBoucle(produitId: string, composants: readonly string[], fiches: readonly LigneFiche[]): boolean {
  const index = indexerFiches(fiches.filter((f) => f.produitId !== produitId));
  const vus = new Set<string>();
  const pile = [...composants];
  while (pile.length) {
    const id = pile.pop()!;
    if (id === produitId) return true;
    if (vus.has(id)) continue;
    vus.add(id);
    for (const c of index.get(id) ?? []) pile.push(c.ingredientId);
  }
  return false;
}

/**
 * Consommation directe d'une fabrication : quantités faites (en unités de recette) × fiche, sans
 * descendre dans les intermédiaires — leur propre fabrication a déjà consommé leurs matières.
 */
export function consommationDirecte(
  faits: ReadonlyMap<string, number>,
  fiches: ReadonlyMap<string, readonly { ingredientId: string; quantite: number }[]>,
): Map<string, number> {
  const res = new Map<string, number>();
  for (const [produitId, q] of faits) {
    if (!q) continue;
    for (const c of fiches.get(produitId) ?? []) res.set(c.ingredientId, arrondiQ((res.get(c.ingredientId) ?? 0) + q * c.quantite));
  }
  return res;
}

export interface BesoinComposant {
  /** Quantité nécessaire pour la production prévue (tous niveaux confondus). */
  besoin: number;
  /** Stock du laboratoire au dernier comptage. */
  stock: number;
  /** Intermédiaires : quantité à préparer (besoin − stock, au moins 0). Matières : quantité manquante. */
  manque: number;
}

/**
 * Besoins en préparations intermédiaires et en matières premières pour produire `aProduire`
 * (produits finis, en unités de recette). Le stock d'un intermédiaire est utilisé d'abord : seul
 * le reste est à préparer, et seul ce reste consomme des matières premières.
 * Suppose des fiches sans boucle (refusées à l'enregistrement).
 */
export function besoinsProduction(
  aProduire: ReadonlyMap<string, number>,
  fiches: ReadonlyMap<string, readonly { ingredientId: string; quantite: number }[]>,
  estIntermediaire: (id: string) => boolean,
  stock: (id: string) => number,
): Map<string, BesoinComposant> {
  const besoins = new Map<string, number>();
  const ajouter = (faits: ReadonlyMap<string, number>) => {
    for (const [id, q] of consommationDirecte(faits, fiches)) besoins.set(id, arrondiQ((besoins.get(id) ?? 0) + q));
  };
  ajouter(aProduire);
  // Ordre topologique : un intermédiaire est développé après tous ceux qui l'utilisent, même
  // indirectement (ordre postfixe inversé d'un parcours en profondeur), donc avec son besoin complet.
  const ordre: string[] = [];
  const vus = new Set<string>();
  const visiter = (id: string) => {
    if (vus.has(id)) return;
    vus.add(id);
    for (const c of fiches.get(id) ?? []) visiter(c.ingredientId);
    ordre.push(id);
  };
  for (const id of aProduire.keys()) visiter(id);
  ordre.reverse();
  const res = new Map<string, BesoinComposant>();
  for (const id of ordre) {
    if (!estIntermediaire(id) || !besoins.has(id)) continue;
    const b = besoins.get(id)!;
    const s = Math.max(0, stock(id));
    const aPreparer = arrondiQ(Math.max(0, b - s));
    res.set(id, { besoin: b, stock: s, manque: aPreparer });
    if (aPreparer) ajouter(new Map([[id, aPreparer]]));
  }
  for (const [id, b] of besoins) {
    if (res.has(id)) continue;
    const s = Math.max(0, stock(id));
    res.set(id, { besoin: b, stock: s, manque: arrondiQ(Math.max(0, b - s)) });
  }
  return res;
}
