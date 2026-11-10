import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { produits, sites, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { ErreurMetier } from "@/server/erreurs";
import { initialiser } from "@/server/seed";
import { importerArticles, lireArticlesLoyverse } from "@/server/services/loyverse";
import { affecter, dupliquerPeriode, grillePlanning } from "@/server/services/planning";
import { suiviRemontees } from "@/server/services/remontees";
import {
  ajouterEntrees,
  ajouterPerte,
  cloturerShift,
  detailShift,
  etatAccueil,
  forcerCloture,
  ouvrirShift,
  saisirQuantite,
} from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux, modifierSite } from "@/server/services/sites";
import { authentifier, creerUtilisateur } from "@/server/services/utilisateurs";
import { heureLocale } from "@/domain/temps";

const csv = readFileSync("data/catalogue.csv", "utf8");

let db: Db;
let direction: Acteur;
let site2Mars: string;
let siteSweets: string;
let amine: Acteur;
let sara: Acteur;
let creneauxIds: { matin: string; apresMidi: string; nuit: string; matinWe: string };

const at = (iso: string) => new Date(iso);

async function produitParRef(ref: string) {
  const [p] = await db.select().from(produits).where(eq(produits.ref, ref));
  return p;
}

/** Compte tous les produits suivis d'un shift avec la même valeur (utile pour clôturer vite). */
async function compterTout(shiftId: string, champ: "ouvertureComptee" | "stockReelFin", valeur: (l: { produitId: string; theo: number | null }) => number, qui: Acteur) {
  const d = await detailShift(db, shiftId);
  for (const l of d.lignes.filter((x) => x.suiviStock)) {
    await saisirQuantite(db, shiftId, l.produitId, champ, valeur({ produitId: l.produitId, theo: l.calcul.theoriqueFin }), qui, at("2026-11-13T10:00:00Z"));
  }
}

beforeAll(async () => {
  db = await creerDbPglite();
  const r = await initialiser(db, { catalogueCsv: csv, pinDirection: "123456" });
  expect(r.directionCree).toBe(true);
  const ss = await db.select().from(sites);
  site2Mars = ss.find((s) => s.nom === "Browse 2 Mars")!.id;
  siteSweets = ss.find((s) => s.nom === "Browse Sweets 2 Mars")!.id;
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
  amine = { id: await creerUtilisateur(db, { nom: "Amine", role: "employe", actif: true, siteIds: [site2Mars], pin: "1111" }, direction), nom: "Amine", role: "employe" };
  sara = { id: await creerUtilisateur(db, { nom: "Sara", role: "employe", actif: true, siteIds: [site2Mars, siteSweets], pin: "2222" }, direction), nom: "Sara", role: "employe" };

  const sem = [1, 2, 3, 4, 5];
  await enregistrerCreneaux(
    db,
    site2Mars,
    [
      { nom: "Matin", heureDebut: "07:00", heureFin: "15:00", jours: sem },
      { nom: "Après-midi", heureDebut: "15:00", heureFin: "20:00", jours: sem },
      { nom: "Nuit", heureDebut: "20:00", heureFin: "04:00", jours: sem },
      { nom: "Matin WE", heureDebut: "09:00", heureFin: "16:00", jours: [6, 7] },
    ],
    direction,
  );
  const cr = await listerCreneaux(db, site2Mars);
  const id = (n: string) => cr.find((c) => c.nom === n)!.id;
  creneauxIds = { matin: id("Matin"), apresMidi: id("Après-midi"), nuit: id("Nuit"), matinWe: id("Matin WE") };
});

describe("données initiales", () => {
  it("charge les sites et le catalogue du fichier Excel", async () => {
    expect((await db.select().from(sites)).length).toBe(6);
    const ps = await db.select().from(produits);
    expect(ps.length).toBe(66);
    expect(ps.filter((p) => p.suiviStock).length).toBe(46);
    const cake = await produitParRef("P009");
    expect(cake.unite).toBe("part");
    expect(cake.partsParGateau).toBe(8);
  });

  it("est idempotent", async () => {
    const r = await initialiser(db, { catalogueCsv: csv, pinDirection: "999999" });
    expect(r.directionCree).toBe(false);
    expect((await db.select().from(produits)).length).toBe(66);
  });
});

describe("connexion par PIN", () => {
  it("bloque après 5 essais erronés", async () => {
    const t = at("2026-11-13T08:00:00Z");
    expect((await authentifier(db, amine.id, "1111", t)).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect((await authentifier(db, amine.id, "0000", t)).ok).toBe(false);
    const r = await authentifier(db, amine.id, "0000", t);
    expect(r.ok === false && r.message).toContain("bloqué");
    expect((await authentifier(db, amine.id, "1111", t)).ok).toBe(false);
    expect((await authentifier(db, amine.id, "1111", at("2026-11-13T08:06:00Z"))).ok).toBe(true);
  });
});

describe("créneaux", () => {
  it("refuse une grille qui se chevauche d'un jour sur l'autre", async () => {
    await expect(
      enregistrerCreneaux(
        db,
        siteSweets,
        [
          { nom: "Nuit", heureDebut: "20:00", heureFin: "04:00", jours: [5] },
          { nom: "Matin samedi", heureDebut: "03:30", heureFin: "12:00", jours: [6] },
        ],
        direction,
      ),
    ).rejects.toThrow(/chevauche/);
  });
});

describe("planning", () => {
  it("planifie un shift de nuit sur deux dates, rattaché au jour de début", async () => {
    const id = await affecter(
      db,
      { siteId: site2Mars, journee: "2026-11-13", creneauId: creneauxIds.nuit, responsableId: sara.id, equipierIds: [] },
      direction,
    );
    const g = await grillePlanning(db, site2Mars, "2026-11-13", "2026-11-14");
    const nuit = g[0].cases.find((c) => c.shift?.id === id)!;
    expect(heureLocale(nuit.shift!.debutPrevu)).toBe("20:00");
    expect(nuit.shift!.finPrevue.getTime() - nuit.shift!.debutPrevu.getTime()).toBe(8 * 3600_000);
    expect(g[0].cases.map((c) => c.nomCreneau)).toEqual(["Matin", "Après-midi", "Nuit"]);
    expect(g[1].cases.map((c) => c.nomCreneau)).toEqual(["Matin WE"]); // samedi : grille week-end
  });

  it("refuse un créneau qui ne s'applique pas au jour", async () => {
    await expect(
      affecter(db, { siteId: site2Mars, journee: "2026-11-14", creneauId: creneauxIds.matin, responsableId: amine.id, equipierIds: [] }, direction),
    ).rejects.toThrow(/ne s'applique pas/);
  });

  it("limite l'équipe à 2 personnes et empêche la double planification", async () => {
    await expect(
      affecter(
        db,
        { siteId: site2Mars, journee: "2026-11-13", creneauId: creneauxIds.matin, responsableId: amine.id, equipierIds: [sara.id, direction.id] },
        direction,
      ),
    ).rejects.toThrow(/2 personnes/);
    await expect(
      affecter(db, { siteId: site2Mars, journee: "2026-11-13", creneauId: creneauxIds.apresMidi, responsableId: amine.id, equipierIds: [sara.id] }, direction),
    ).resolves.toBeTypeOf("string");
    // Sara est déjà sur l'après-midi de 2 Mars : impossible de la planifier en même temps à Sweets.
    await enregistrerCreneaux(db, siteSweets, [{ nom: "Soir", heureDebut: "16:00", heureFin: "22:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
    const [soir] = await listerCreneaux(db, siteSweets);
    await expect(
      affecter(db, { siteId: siteSweets, journee: "2026-11-13", creneauId: soir.id, responsableId: sara.id, equipierIds: [] }, direction),
    ).rejects.toThrow(/déjà planifié/);
  });

  it("duplique une semaine", async () => {
    await affecter(db, { siteId: site2Mars, journee: "2026-11-13", creneauId: creneauxIds.matin, responsableId: amine.id, equipierIds: [] }, direction);
    const r = await dupliquerPeriode(db, site2Mars, { du: "2026-11-09", au: "2026-11-15" }, "2026-11-16", direction);
    expect(r.copies).toBe(3);
    const g = await grillePlanning(db, site2Mars, "2026-11-20", "2026-11-20");
    expect(g[0].cases.filter((c) => c.shift).length).toBe(3);
  });
});

describe("enchaînement des shifts", () => {
  let matin: string;
  let apresMidi: string;
  let nuit: string;

  beforeAll(async () => {
    const g = await grillePlanning(db, site2Mars, "2026-11-13", "2026-11-13");
    const id = (n: string) => g[0].cases.find((c) => c.nomCreneau === n)!.shift!.id;
    matin = id("Matin");
    apresMidi = id("Après-midi");
    nuit = id("Nuit");
  });

  it("propose le shift à ouvrir et réserve l'ouverture au responsable", async () => {
    const etat = await etatAccueil(db, site2Mars, at("2026-11-13T06:45:00Z"));
    expect(etat.aOuvrir?.id).toBe(matin);
    await expect(ouvrirShift(db, matin, sara, at("2026-11-13T07:00:00Z"))).rejects.toThrow(/responsable/);
  });

  it("premier shift : l'ouverture doit être comptée, puis clôture complète", async () => {
    await ouvrirShift(db, matin, amine, at("2026-11-13T07:00:00Z"));
    await expect(ouvrirShift(db, apresMidi, amine, at("2026-11-13T07:05:00Z"))).rejects.toThrow(/encore ouvert/);

    const mango = await produitParRef("P001");
    const cake = await produitParRef("P009");
    const crepe = await produitParRef("P035");
    await expect(cloturerShift(db, matin, amine, at("2026-11-13T15:00:00Z"), null)).rejects.toThrow(/sans stock d'ouverture/);
    await expect(saisirQuantite(db, matin, crepe.id, "stockReelFin", 3, amine, at("2026-11-13T08:00:00Z"))).rejects.toThrow(/vente seule/);

    await compterTout(matin, "ouvertureComptee", () => 10, amine);
    await saisirQuantite(db, matin, mango.id, "ouvertureComptee", 12, amine, at("2026-11-13T07:10:00Z"));
    await ajouterEntrees(db, matin, [{ produitId: mango.id, quantite: 6, saisie: "parts" }, { produitId: cake.id, quantite: 2, saisie: "gateaux" }], "labo", null, sara);
    await ajouterPerte(db, matin, { produitId: mango.id, quantite: 1, saisie: "parts", motif: "endommage", commentaire: "Pot fissuré" }, sara);
    await saisirQuantite(db, matin, mango.id, "ventes", 9, amine, at("2026-11-13T14:00:00Z"));
    await saisirQuantite(db, matin, crepe.id, "ventes", 5, amine, at("2026-11-13T14:00:00Z"));

    await compterTout(matin, "stockReelFin", (l) => l.theo ?? 0, amine);
    await saisirQuantite(db, matin, mango.id, "stockReelFin", 7, amine, at("2026-11-13T14:55:00Z"));
    await expect(cloturerShift(db, matin, sara, at("2026-11-13T15:00:00Z"), null)).rejects.toThrow(/responsable/);
    await cloturerShift(db, matin, amine, at("2026-11-13T15:05:00Z"), "RAS");

    const d = await detailShift(db, matin);
    const lm = d.lignes.find((l) => l.produitId === mango.id)!;
    expect(lm.calcul.theoriqueFin).toBe(8);
    expect(lm.calcul.ecart).toBe(-1);
    expect(lm.pertesEndommage).toBe(1);
    const lc = d.lignes.find((l) => l.produitId === cake.id)!;
    expect(lc.entrees).toBe(16); // 2 gâteaux × 8 parts
    expect(lc.stockReelFin).toBe(26);
    expect(d.synthese.produitsAvecEcart).toBe(1);
    expect(d.synthese.articlesVendus).toBe(14);
    await expect(saisirQuantite(db, matin, mango.id, "ventes", 1, amine, at("2026-11-13T16:00:00Z"))).rejects.toThrow(/clôturé/);
  });

  it("le shift suivant reprend la clôture du précédent (mode reprise)", async () => {
    await ouvrirShift(db, apresMidi, amine, at("2026-11-13T15:10:00Z"));
    const d = await detailShift(db, apresMidi);
    const mango = await produitParRef("P001");
    const lm = d.lignes.find((l) => l.produitId === mango.id)!;
    expect(lm.ouvertureTheorique).toBe(7);
    expect(lm.calcul.ouverture).toBe(7);
    expect(d.avancement.aCompterOuverture).toBe(0);
    await compterTout(apresMidi, "stockReelFin", (l) => l.theo ?? 0, amine);
    await cloturerShift(db, apresMidi, amine, at("2026-11-13T20:00:00Z"), null);
  });

  it("en mode recomptage, l'écart de passation est calculé", async () => {
    await modifierSite(db, site2Mars, { modeOuverture: "recomptage", statut: "actif" }, direction);
    await ouvrirShift(db, nuit, sara, at("2026-11-13T20:00:00Z"));
    const mango = await produitParRef("P001");
    await expect(cloturerShift(db, nuit, sara, at("2026-11-14T04:00:00Z"), null)).rejects.toThrow(/ouverture/);
    await compterTout(nuit, "ouvertureComptee", () => 0, sara);
    const d0 = await detailShift(db, nuit);
    for (const l of d0.lignes.filter((x) => x.suiviStock)) {
      await saisirQuantite(db, nuit, l.produitId, "ouvertureComptee", l.ouvertureTheorique ?? 0, sara, at("2026-11-13T20:05:00Z"));
    }
    await saisirQuantite(db, nuit, mango.id, "ouvertureComptee", 5, sara, at("2026-11-13T20:05:00Z"));
    const d = await detailShift(db, nuit);
    expect(d.lignes.find((l) => l.produitId === mango.id)!.calcul.ecartPassation).toBe(-2);
    expect(d.synthese.produitsAvecEcartPassation).toBe(1);
    await compterTout(nuit, "stockReelFin", (l) => l.theo ?? 0, sara);
    // Clôture à 04:20 le samedi : dans la tolérance de 30 min.
    await cloturerShift(db, nuit, sara, new Date(d.shift.finPrevue.getTime() + 20 * 60_000), null);
    await modifierSite(db, site2Mars, { modeOuverture: "reprise", statut: "actif" }, direction);
  });

  it("la nuit du vendredi alimente le matin du samedi", async () => {
    const samedi = await affecter(
      db,
      { siteId: site2Mars, journee: "2026-11-14", creneauId: creneauxIds.matinWe, responsableId: amine.id, equipierIds: [] },
      direction,
    );
    await ouvrirShift(db, samedi, amine, at("2026-11-14T09:00:00Z"));
    const d = await detailShift(db, samedi);
    expect(d.shift.shiftPrecedentId).toBe(nuit);
    const mango = await produitParRef("P001");
    expect(d.lignes.find((l) => l.produitId === mango.id)!.ouvertureTheorique).toBe(5);
    await expect(forcerCloture(db, samedi, amine, at("2026-11-14T20:00:00Z"), "Oubli de comptage")).rejects.toThrow(/manager/);
    await forcerCloture(db, samedi, direction, at("2026-11-14T20:00:00Z"), "Oubli de comptage");
    const f = await detailShift(db, samedi);
    expect(f.shift.clotureForcee).toBe(true);
    expect(f.lignes.find((l) => l.produitId === mango.id)!.stockReelFin).toBe(5);
  });

  it("calcule le suivi des remontées par responsable", async () => {
    const r = await suiviRemontees(db, { siteId: site2Mars, du: "2026-11-13", au: "2026-11-14" }, at("2026-11-15T12:00:00Z"));
    const amineB = r.parResponsable.find((b) => b.responsable === "Amine")!;
    const saraB = r.parResponsable.find((b) => b.responsable === "Sara")!;
    expect(saraB).toMatchObject({ planifies: 1, aLHeure: 1 });
    // Amine : matin et après-midi à l'heure, samedi clôturé en retard (forcé à 20:00 au lieu de 16:00).
    expect(amineB).toMatchObject({ planifies: 3, aLHeure: 2, enRetard: 1, tauxALHeure: 67 });
    expect(amineB.valeurEcartsVente).toBe(0); // pas de prix saisis : valeur nulle
    const matinR = r.shifts.find((s) => s.nomCreneau === "Matin")!;
    expect(matinR.produitsAvecEcart).toBe(1);
  });
});

describe("Loyverse", () => {
  it("importe SKU et prix par correspondance de nom puis de SKU", async () => {
    const pages = [
      {
        items: [
          { id: "i1", item_name: "Mango Can", variants: [{ variant_id: "v1", sku: "10001", default_price: 35 }] },
          { id: "i2", item_name: "Matilda cake", variants: [{ variant_id: "v2", sku: "10002", default_price: 38 }] },
        ],
        cursor: "p2",
      },
      { items: [{ id: "i3", item_name: "Article inconnu", variants: [{ variant_id: "v3", sku: "99", default_price: 5 }] }], cursor: null },
    ];
    let n = 0;
    const faux = (async (url: string, init: RequestInit) => {
      expect(String(url)).toContain("/items");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jeton");
      return new Response(JSON.stringify(pages[n++]), { status: 200 });
    }) as unknown as typeof fetch;
    const articles = await lireArticlesLoyverse("jeton", faux);
    expect(articles).toHaveLength(3);
    const r = await importerArticles(db, articles, direction);
    expect(r.associes.map((a) => a.produit).sort()).toEqual(["Mango Can", "Matilda Cake"]);
    expect(r.articlesLoyverseNonUtilises).toEqual(["Article inconnu"]);
    const mango = await produitParRef("P001");
    expect(mango.sku).toBe("10001");
    expect(mango.prixVente).toBe(35);
  });

  it("signale un jeton refusé", async () => {
    const faux = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(lireArticlesLoyverse("x", faux)).rejects.toBeInstanceOf(ErreurMetier);
  });
});
