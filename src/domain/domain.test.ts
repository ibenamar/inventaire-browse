import { describe, expect, it } from "vitest";
import { calculerLigne, enParts, synthetiser, type LigneEntree } from "./calculs";
import {
  creneauEnCours,
  creneauxDuJour,
  detecterChevauchements,
  intervalleCreneau,
  libelleHoraire,
  validerCreneaux,
  type CreneauDef,
} from "./creneaux";
import { statutRemontee } from "./remontees";
import { ajouterJours, heureLocale, jourIso, journeeLocale, lundiDe } from "./temps";

const base: LigneEntree = {
  ouvertureTheorique: null,
  ouvertureComptee: null,
  entrees: 0,
  ventes: 0,
  pertes: 0,
  stockReelFin: null,
  prixVente: null,
  cout: null,
};

describe("calculs d'une ligne de shift", () => {
  it("reproduit l'exemple du fichier Excel (Mango Can)", () => {
    const c = calculerLigne({ ...base, ouvertureComptee: 12, entrees: 6, ventes: 9, pertes: 1, stockReelFin: 7, prixVente: 35 });
    expect(c.theoriqueFin).toBe(8);
    expect(c.ecart).toBe(-1);
    expect(c.valeurEcartVente).toBe(-35);
    expect(c.ca).toBe(315);
  });

  it("reprend la clôture du shift précédent quand l'ouverture n'est pas recomptée", () => {
    const c = calculerLigne({ ...base, ouvertureTheorique: 10, ventes: 4, stockReelFin: 6 });
    expect(c.ouverture).toBe(10);
    expect(c.ecartPassation).toBeNull();
    expect(c.ecart).toBe(0);
  });

  it("calcule l'écart de passation quand l'équipe entrante recompte", () => {
    const c = calculerLigne({ ...base, ouvertureTheorique: 10, ouvertureComptee: 8, ventes: 3, stockReelFin: 5 });
    expect(c.ecartPassation).toBe(-2);
    expect(c.ouverture).toBe(8);
    expect(c.ecart).toBe(0);
  });

  it("laisse l'écart vide tant que le comptage final n'est pas saisi", () => {
    expect(calculerLigne({ ...base, ouvertureComptee: 5 }).ecart).toBeNull();
    expect(calculerLigne({ ...base, stockReelFin: 5 }).theoriqueFin).toBeNull();
  });

  it("valorise au coût quand il est connu et signale le réapprovisionnement", () => {
    const c = calculerLigne({ ...base, ouvertureComptee: 5, pertes: 2, stockReelFin: 2, cout: 12.5, prixVente: 40, stockMinimum: 4 });
    expect(c.ecart).toBe(-1);
    expect(c.valeurEcartCout).toBe(-12.5);
    expect(c.valeurPertesCout).toBe(25);
    expect(c.aReapprovisionner).toBe(true);
  });

  it("synthétise un shift", () => {
    const lignes = [
      { ...base, ouvertureComptee: 12, entrees: 6, ventes: 9, pertes: 1, stockReelFin: 7, prixVente: 35 },
      { ...base, ouvertureTheorique: 4, ouvertureComptee: 3, ventes: 1, stockReelFin: 2, prixVente: 20 },
    ].map((l) => ({ ...l, calcul: calculerLigne(l) }));
    const s = synthetiser(lignes);
    expect(s.articlesVendus).toBe(10);
    expect(s.ca).toBe(335);
    expect(s.produitsAvecEcart).toBe(1);
    expect(s.produitsAvecEcartPassation).toBe(1);
    expect(s.valeurPertesVente).toBe(35);
  });

  it("calcule le CA au prix de chaque canal quand il est fourni", () => {
    // 9 Mango Can : 6 sur place à 35, 3 via Glovo à 42.
    const c = calculerLigne({ ...base, ouvertureComptee: 12, ventes: 9, stockReelFin: 3, prixVente: 35, montantVentes: 6 * 35 + 3 * 42 });
    expect(c.ca).toBe(336);
    expect(c.ecart).toBe(0);
  });

  it("convertit les gâteaux entiers en parts", () => {
    expect(enParts(2, "gateaux", 8)).toBe(16);
    expect(enParts(5, "parts", 8)).toBe(5);
    expect(() => enParts(1, "gateaux", null)).toThrow();
  });
});

describe("journées et fuseau horaire", () => {
  it("calcule les jours ISO et les lundis", () => {
    expect(jourIso("2026-11-09")).toBe(1); // lundi
    expect(jourIso("2026-11-15")).toBe(7); // dimanche
    expect(lundiDe("2026-11-15")).toBe("2026-11-09");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("place le shift de nuit sur deux dates, rattaché au jour de début", () => {
    const { debut, fin } = intervalleCreneau("2026-11-13", { heureDebut: "20:00", heureFin: "04:00" });
    // L'heure légale du Maroc vient de la base tz (GMT+0 depuis le 20/09/2026 selon tzdata 2026e) :
    // on vérifie donc la structure plutôt qu'un décalage figé.
    expect(fin.getTime() - debut.getTime()).toBe(8 * 3600_000);
    expect(heureLocale(debut)).toBe("20:00");
    expect(heureLocale(fin)).toBe("04:00");
    expect(journeeLocale(debut)).toBe("2026-11-13");
    expect(journeeLocale(fin)).toBe("2026-11-14");
  });

  it("tient compte du passage à GMT pendant le ramadan", () => {
    // Ramadan 2025 : le Maroc était à UTC+0 du 23/02 au 06/04/2025.
    expect(intervalleCreneau("2025-03-10", { heureDebut: "07:00", heureFin: "15:00" }).debut.toISOString()).toBe(
      "2025-03-10T07:00:00.000Z",
    );
    expect(intervalleCreneau("2025-05-10", { heureDebut: "07:00", heureFin: "15:00" }).debut.toISOString()).toBe(
      "2025-05-10T06:00:00.000Z",
    );
  });

  it("libelle les créneaux de nuit", () => {
    expect(libelleHoraire({ heureDebut: "20:00", heureFin: "03:00" })).toBe("20:00 → 03:00 (lendemain)");
    expect(libelleHoraire({ heureDebut: "07:00", heureFin: "15:00" })).toBe("07:00 → 15:00");
  });
});

const SEMAINE = [1, 2, 3, 4, 5];
const WE = [6, 7];
const grille: CreneauDef[] = [
  { id: "m", nom: "Matin", heureDebut: "07:00", heureFin: "15:00", jours: SEMAINE },
  { id: "a", nom: "Après-midi", heureDebut: "15:00", heureFin: "20:00", jours: SEMAINE },
  { id: "n", nom: "Nuit", heureDebut: "20:00", heureFin: "04:00", jours: SEMAINE },
  { id: "mw", nom: "Matin WE", heureDebut: "09:00", heureFin: "16:00", jours: WE },
  { id: "aw", nom: "Après-midi WE", heureDebut: "16:00", heureFin: "21:00", jours: WE },
  { id: "nw", nom: "Nuit WE", heureDebut: "21:00", heureFin: "03:00", jours: WE },
];

describe("grille de créneaux", () => {
  it("accepte une grille semaine / week-end sans recouvrement", () => {
    expect(validerCreneaux(grille)).toEqual([]);
  });

  it("applique la grille du jour de début (nuit du vendredi = grille semaine)", () => {
    expect(creneauxDuJour(grille, "2026-11-13").map((c) => c.id)).toEqual(["m", "a", "n"]); // vendredi
    expect(creneauxDuJour(grille, "2026-11-14").map((c) => c.id)).toEqual(["mw", "aw", "nw"]); // samedi
  });

  it("à 02:00 le samedi, le créneau en cours est la nuit du vendredi", () => {
    const instant = intervalleCreneau("2026-11-13", { heureDebut: "20:00", heureFin: "04:00" }).debut;
    const deuxHeures = new Date(instant.getTime() + 6 * 3600_000);
    const r = creneauEnCours(grille, deuxHeures, "2026-11-14");
    expect(r?.creneau.id).toBe("n");
    expect(r?.journee).toBe("2026-11-13");
    const midi = new Date(instant.getTime() + 16 * 3600_000); // samedi 12:00
    expect(creneauEnCours(grille, midi, "2026-11-14")?.creneau.id).toBe("mw");
  });

  it("détecte un chevauchement d'un jour sur l'autre", () => {
    const g: CreneauDef[] = [
      { id: "n", nom: "Nuit", heureDebut: "20:00", heureFin: "04:00", jours: [5] }, // vendredi → samedi 04:00
      { id: "m", nom: "Matin samedi", heureDebut: "03:00", heureFin: "12:00", jours: [6] },
    ];
    const c = detecterChevauchements(g);
    expect(c).toHaveLength(1);
    expect(c[0].message).toContain("vendredi");
    expect(c[0].message).toContain("samedi");
  });

  it("détecte le chevauchement entre la nuit du dimanche et le lundi matin", () => {
    const g: CreneauDef[] = [
      { id: "n", nom: "Nuit", heureDebut: "22:00", heureFin: "08:00", jours: [7] },
      { id: "m", nom: "Matin", heureDebut: "07:00", heureFin: "15:00", jours: [1] },
    ];
    expect(detecterChevauchements(g)).toHaveLength(1);
  });

  it("accepte des créneaux bout à bout et des trous", () => {
    const g: CreneauDef[] = [
      { id: "n", nom: "Nuit", heureDebut: "20:00", heureFin: "04:00", jours: [1, 2, 3, 4, 5, 6, 7] },
      { id: "m", nom: "Matin", heureDebut: "07:00", heureFin: "15:00", jours: [1, 2, 3, 4, 5, 6, 7] },
      { id: "a", nom: "Après-midi", heureDebut: "15:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] },
    ];
    expect(validerCreneaux(g)).toEqual([]);
  });

  it("refuse les saisies invalides", () => {
    expect(validerCreneaux([{ id: "x", nom: "X", heureDebut: "25:00", heureFin: "04:00", jours: [1] }])).toHaveLength(1);
    expect(validerCreneaux([{ id: "x", nom: "X", heureDebut: "08:00", heureFin: "08:00", jours: [1] }])).toHaveLength(1);
    expect(validerCreneaux([{ id: "x", nom: "X", heureDebut: "08:00", heureFin: "09:00", jours: [] }])).toHaveLength(1);
  });
});

describe("statut de remontée", () => {
  const s = {
    debutPrevu: new Date("2026-11-13T19:00:00Z"),
    finPrevue: new Date("2026-11-14T03:00:00Z"),
  };
  it("classe les shifts", () => {
    expect(statutRemontee({ ...s, statut: "planifie", clotureLe: null }, new Date("2026-11-13T10:00:00Z"))).toBe("a_venir");
    expect(statutRemontee({ ...s, statut: "ouvert", clotureLe: null }, new Date("2026-11-14T01:00:00Z"))).toBe("en_cours");
    expect(
      statutRemontee({ ...s, statut: "cloture", clotureLe: new Date("2026-11-14T03:20:00Z") }, new Date("2026-11-14T05:00:00Z")),
    ).toBe("a_l_heure");
    expect(
      statutRemontee({ ...s, statut: "cloture", clotureLe: new Date("2026-11-14T04:00:00Z") }, new Date("2026-11-14T05:00:00Z")),
    ).toBe("en_retard");
    expect(statutRemontee({ ...s, statut: "ouvert", clotureLe: null }, new Date("2026-11-14T05:00:00Z"))).toBe("en_retard");
    expect(statutRemontee({ ...s, statut: "planifie", clotureLe: null }, new Date("2026-11-14T05:00:00Z"))).toBe("manquant");
  });
});
