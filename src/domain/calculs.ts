/**
 * Règles de calcul d'une ligne de shift (un produit dans un shift).
 * Reprend les formules du fichier Excel et ajoute la logique inter-shifts.
 * Les pertes et les écarts sont valorisés au prix de référence (sur place) et au coût ;
 * le CA utilise le prix réel de chaque canal de vente quand il est fourni.
 *   ouverture        = ouverture recomptée, sinon clôture du shift précédent
 *   écart passation  = ouverture recomptée − clôture du shift précédent
 *   théorique fin    = ouverture + entrées − ventes − pertes − sorties (livraisons expédiées)
 *   écart            = stock réel fin − théorique fin
 * Ingrédients (laboratoire) : leur utilisation en production n'est pas saisie, donc la différence
 * entre le théorique et le compté n'est pas un écart mais la consommation du shift.
 */
export interface LigneEntree {
  ouvertureTheorique: number | null;
  ouvertureComptee: number | null;
  entrees: number;
  ventes: number;
  pertes: number;
  /** Quantités expédiées sur des bons de livraison. */
  sorties?: number;
  /** Ingrédient : la différence théorique − compté est une consommation, pas un écart. */
  ingredient?: boolean;
  /** Ingrédients : consommation attendue d'après les fiches techniques (production ou ventes × recette). */
  consommationTheorique?: number | null;
  stockReelFin: number | null;
  prixVente: number | null;
  cout: number | null;
  stockMinimum?: number | null;
  /** Chiffre d'affaires réel quand les ventes sont valorisées au prix de chaque canal (sur place, Glovo…). */
  montantVentes?: number | null;
}

export interface LigneCalculee {
  ouverture: number | null;
  ecartPassation: number | null;
  theoriqueFin: number | null;
  ecart: number | null;
  /** Ingrédients : quantité consommée (théorique − compté) et sa valeur au coût. */
  consommation: number | null;
  valeurConsommation: number | null;
  /** Consommation réelle − théorique (positif = surconsommation : gaspillage, perte non déclarée…). */
  ecartConsommation: number | null;
  valeurEcartVente: number | null;
  valeurEcartCout: number | null;
  valeurPertesVente: number | null;
  valeurPertesCout: number | null;
  ca: number | null;
  aReapprovisionner: boolean;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
/** Quantités : 3 décimales au plus (kg, litres), sans résidu de calcul flottant. */
export const arrondiQ = (n: number) => Math.round(n * 1000) / 1000;
const fois = (q: number | null, p: number | null) => (q === null || p === null ? null : arrondi(q * p));

export function calculerLigne(l: LigneEntree): LigneCalculee {
  const ouverture = l.ouvertureComptee ?? l.ouvertureTheorique;
  const ecartPassation =
    l.ouvertureComptee !== null && l.ouvertureTheorique !== null
      ? arrondiQ(l.ouvertureComptee - l.ouvertureTheorique)
      : null;
  const theoriqueFin = ouverture === null ? null : arrondiQ(ouverture + l.entrees - l.ventes - l.pertes - (l.sorties ?? 0));
  const difference = theoriqueFin === null || l.stockReelFin === null ? null : arrondiQ(l.stockReelFin - theoriqueFin);
  const ecart = l.ingredient ? null : difference;
  const consommation = l.ingredient && difference !== null ? arrondiQ(-difference) : null;
  return {
    ouverture,
    ecartPassation,
    theoriqueFin,
    ecart,
    consommation,
    valeurConsommation: fois(consommation, l.cout),
    ecartConsommation:
      consommation !== null && l.consommationTheorique !== null && l.consommationTheorique !== undefined
        ? arrondiQ(consommation - l.consommationTheorique)
        : null,
    valeurEcartVente: fois(ecart, l.prixVente),
    valeurEcartCout: fois(ecart, l.cout),
    valeurPertesVente: fois(l.pertes, l.prixVente),
    valeurPertesCout: fois(l.pertes, l.cout),
    ca: l.montantVentes ?? fois(l.ventes, l.prixVente),
    aReapprovisionner:
      l.stockReelFin !== null &&
      l.stockMinimum !== null &&
      l.stockMinimum !== undefined &&
      l.stockReelFin < l.stockMinimum,
  };
}

export interface Synthese {
  articlesVendus: number;
  ca: number;
  pertes: number;
  valeurPertesVente: number;
  valeurEcartsVente: number;
  valeurEcartsCout: number;
  produitsAvecEcart: number;
  produitsAvecEcartPassation: number;
  produitsAReapprovisionner: number;
  /** Laboratoire : valeur au coût des ingrédients consommés, et quantités expédiées. */
  valeurConsommation: number;
  sorties: number;
}

export function synthetiser(lignes: Array<LigneEntree & { calcul: LigneCalculee }>): Synthese {
  const s: Synthese = {
    articlesVendus: 0,
    ca: 0,
    pertes: 0,
    valeurPertesVente: 0,
    valeurEcartsVente: 0,
    valeurEcartsCout: 0,
    produitsAvecEcart: 0,
    produitsAvecEcartPassation: 0,
    produitsAReapprovisionner: 0,
    valeurConsommation: 0,
    sorties: 0,
  };
  for (const l of lignes) {
    s.articlesVendus += l.ventes;
    s.ca += l.calcul.ca ?? 0;
    s.pertes += l.pertes;
    s.valeurPertesVente += l.calcul.valeurPertesVente ?? 0;
    s.valeurEcartsVente += l.calcul.valeurEcartVente ?? 0;
    s.valeurEcartsCout += l.calcul.valeurEcartCout ?? 0;
    if (l.calcul.ecart !== null && l.calcul.ecart !== 0) s.produitsAvecEcart++;
    if (l.calcul.ecartPassation !== null && l.calcul.ecartPassation !== 0) s.produitsAvecEcartPassation++;
    if (l.calcul.aReapprovisionner) s.produitsAReapprovisionner++;
    s.valeurConsommation += l.calcul.valeurConsommation ?? 0;
    s.sorties += l.sorties ?? 0;
  }
  s.pertes = arrondiQ(s.pertes);
  s.sorties = arrondiQ(s.sorties);
  for (const k of ["ca", "valeurPertesVente", "valeurEcartsVente", "valeurEcartsCout", "valeurConsommation"] as const) {
    s[k] = arrondi(s[k]);
  }
  return s;
}

/** Conversion d'une saisie en gâteaux entiers vers des parts (unité de comptage des cakes). */
export function enParts(quantite: number, saisie: "parts" | "gateaux", partsParGateau: number | null): number {
  if (saisie === "parts") return quantite;
  if (!partsParGateau || partsParGateau <= 0) throw new Error("Nombre de parts par gâteau non défini");
  return quantite * partsParGateau;
}

/** Quantité positive ; entière sauf pour les unités au poids ou au volume (3 décimales au plus). */
export function estQuantiteValide(n: unknown, decimales = false): n is number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100000) return false;
  return decimales ? Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6 : Number.isInteger(n);
}
