/**
 * Règles de calcul d'une ligne de shift (un produit dans un shift).
 * Reprend les formules du fichier Excel et ajoute la logique inter-shifts :
 *   ouverture        = ouverture recomptée, sinon clôture du shift précédent
 *   écart passation  = ouverture recomptée − clôture du shift précédent
 *   théorique fin    = ouverture + entrées − ventes − pertes
 *   écart            = stock réel fin − théorique fin
 */
export interface LigneEntree {
  ouvertureTheorique: number | null;
  ouvertureComptee: number | null;
  entrees: number;
  ventes: number;
  pertes: number;
  stockReelFin: number | null;
  prixVente: number | null;
  cout: number | null;
  stockMinimum?: number | null;
}

export interface LigneCalculee {
  ouverture: number | null;
  ecartPassation: number | null;
  theoriqueFin: number | null;
  ecart: number | null;
  valeurEcartVente: number | null;
  valeurEcartCout: number | null;
  valeurPertesVente: number | null;
  valeurPertesCout: number | null;
  ca: number | null;
  aReapprovisionner: boolean;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const fois = (q: number | null, p: number | null) => (q === null || p === null ? null : arrondi(q * p));

export function calculerLigne(l: LigneEntree): LigneCalculee {
  const ouverture = l.ouvertureComptee ?? l.ouvertureTheorique;
  const ecartPassation =
    l.ouvertureComptee !== null && l.ouvertureTheorique !== null
      ? l.ouvertureComptee - l.ouvertureTheorique
      : null;
  const theoriqueFin = ouverture === null ? null : ouverture + l.entrees - l.ventes - l.pertes;
  const ecart = theoriqueFin === null || l.stockReelFin === null ? null : l.stockReelFin - theoriqueFin;
  return {
    ouverture,
    ecartPassation,
    theoriqueFin,
    ecart,
    valeurEcartVente: fois(ecart, l.prixVente),
    valeurEcartCout: fois(ecart, l.cout),
    valeurPertesVente: fois(l.pertes, l.prixVente),
    valeurPertesCout: fois(l.pertes, l.cout),
    ca: fois(l.ventes, l.prixVente),
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
  }
  for (const k of ["ca", "valeurPertesVente", "valeurEcartsVente", "valeurEcartsCout"] as const) {
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

export function estQuantiteValide(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100000;
}
