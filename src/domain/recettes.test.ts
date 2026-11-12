import { describe, expect, it } from "vitest";
import { synthetiser, calculerLigne, type LigneEntree } from "./calculs";
import { besoinsProduction, consommationDirecte, creeUneBoucle, indexerFiches, type LigneFiche } from "./recettes";

// Tarte : pâte sucrée + crème pâtissière + beurre ; Entremets : mousseline (faite de crème) + crème.
const FICHES: LigneFiche[] = [
  { produitId: "pate", ingredientId: "farine", quantite: 0.5 },
  { produitId: "pate", ingredientId: "beurre", quantite: 0.25 },
  { produitId: "creme", ingredientId: "lait", quantite: 1 },
  { produitId: "creme", ingredientId: "sucre", quantite: 0.2 },
  { produitId: "mousseline", ingredientId: "creme", quantite: 0.8 },
  { produitId: "mousseline", ingredientId: "beurre", quantite: 0.3 },
  { produitId: "tarte", ingredientId: "pate", quantite: 0.4 },
  { produitId: "tarte", ingredientId: "creme", quantite: 0.5 },
  { produitId: "tarte", ingredientId: "beurre", quantite: 0.1 },
  { produitId: "entremets", ingredientId: "mousseline", quantite: 0.5 },
  { produitId: "entremets", ingredientId: "creme", quantite: 0.2 },
];
const INTERMEDIAIRES = new Set(["pate", "creme", "mousseline"]);
const fiches = indexerFiches(FICHES);

describe("fiches techniques à plusieurs niveaux", () => {
  it("refuse une boucle, directe ou indirecte", () => {
    expect(creeUneBoucle("creme", ["mousseline"], FICHES)).toBe(true); // mousseline ← crème
    expect(creeUneBoucle("creme", ["creme"], FICHES)).toBe(true);
    expect(creeUneBoucle("pate", ["creme", "farine"], FICHES)).toBe(false);
    // La fiche remplacée ne compte pas : la mousseline peut abandonner la crème.
    expect(creeUneBoucle("mousseline", ["lait"], FICHES)).toBe(false);
  });

  it("consommation directe : un niveau à la fois (les intermédiaires ont leur propre production)", () => {
    const c = consommationDirecte(new Map([["tarte", 4], ["creme", 3]]), fiches);
    expect(Object.fromEntries(c)).toEqual({ pate: 1.6, creme: 2, beurre: 0.4, lait: 3, sucre: 0.6 });
  });

  it("besoins : le stock d'un intermédiaire est utilisé d'abord, le reste est à préparer", () => {
    const stock: Record<string, number> = { mousseline: 1, creme: 2, lait: 1 };
    const b = besoinsProduction(new Map([["entremets", 10]]), fiches, (id) => INTERMEDIAIRES.has(id), (id) => stock[id] ?? 0);
    // Mousseline : 10 × 0,5 = 5, stock 1 → 4 à préparer → crème 3,2 + beurre 1,2.
    expect(b.get("mousseline")).toEqual({ besoin: 5, stock: 1, manque: 4 });
    // Crème : 10 × 0,2 + 3,2 = 5,2, stock 2 → 3,2 à préparer → lait 3,2, sucre 0,64.
    expect(b.get("creme")).toEqual({ besoin: 5.2, stock: 2, manque: 3.2 });
    expect(b.get("lait")).toEqual({ besoin: 3.2, stock: 1, manque: 2.2 });
    expect(b.get("sucre")).toEqual({ besoin: 0.64, stock: 0, manque: 0.64 });
    expect(b.get("beurre")).toEqual({ besoin: 1.2, stock: 0, manque: 1.2 });
    expect(b.has("farine")).toBe(false);
  });

  it("besoins : un intermédiaire en stock suffisant ne consomme aucune matière", () => {
    const b = besoinsProduction(new Map([["tarte", 2]]), fiches, (id) => INTERMEDIAIRES.has(id), (id) => (id === "pate" ? 5 : 0));
    expect(b.get("pate")).toEqual({ besoin: 0.8, stock: 5, manque: 0 });
    expect(b.has("farine")).toBe(false);
    expect(b.get("beurre")!.besoin).toBe(0.2); // seulement le beurre direct de la tarte
  });
});

describe("consommation d'une préparation intermédiaire", () => {
  const base: LigneEntree = { ouvertureTheorique: null, ouvertureComptee: 1, entrees: 2, ventes: 0, pertes: 0, stockReelFin: 1.4, prixVente: null, cout: 30 };
  it("la différence est une consommation, hors valeur consommée du shift", () => {
    const inter = { ...base, ingredient: true, intermediaire: true, consommationTheorique: 1.6 };
    const matiere = { ...base, ingredient: true, cout: 10 };
    const li = { ...inter, calcul: calculerLigne(inter) };
    expect(li.calcul).toMatchObject({ ecart: null, consommation: 1.6, ecartConsommation: 0, valeurConsommation: 48 });
    const s = synthetiser([li, { ...matiere, calcul: calculerLigne(matiere) }]);
    expect(s.valeurConsommation).toBe(16); // la matière seule
  });
});
