import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { creerDbPglite, type Db } from "@/db";
import { produits, shifts, sites, synchrosLoyverse, utilisateurs } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { CORRESPONDANCES_LOYVERSE } from "@/server/correspondances-loyverse";
import { initialiser } from "@/server/seed";
import { ignorerArticle, listerArticles, listerCanaux } from "@/server/services/caisse";
import { importerArticles, lireExportCsv } from "@/server/services/loyverse";
import { affecter } from "@/server/services/planning";
import { cloturerShift, detailShift, ouvrirShift, saisirQuantite } from "@/server/services/shifts";
import { enregistrerCreneaux, listerCreneaux } from "@/server/services/sites";
import { agregerRecus, importerVentesShift, messageErreur, type RecuLoyverse } from "@/server/services/ventes-loyverse";

const COFFEE = "00d876f7-d5e4-4079-8c89-42f435cf5157";
let db: Db;
let direction: Acteur;
let employe: Acteur;
let shiftId: string;
const produit = async (ref: string) => (await db.select().from(produits).where(eq(produits.ref, ref)))[0];

const recu = (n: string, date: string, lignes: [string, number, number][], extra: Partial<RecuLoyverse> = {}): RecuLoyverse => ({
  receipt_number: n,
  receipt_type: "SALE",
  receipt_date: date,
  created_at: date,
  cancelled_at: null,
  store_id: COFFEE,
  line_items: lignes.map(([sku, quantity, total_money]) => ({ sku, quantity, total_money, item_name: `article ${sku}` })),
  ...extra,
});

// Shift du 16/11 ouvert à 08:00 UTC.
const RECUS: RecuLoyverse[] = [
  recu("1-1", "2026-11-16T07:30:00.000Z", [["10342", 5, 190]]), // avant l'ouverture : hors fenêtre
  recu("1-2", "2026-11-16T09:00:00.000Z", [["10342", 2, 76], ["10006", 1, 32]]), // Mango sur place + AFFOGATO (non rattaché)
  recu("1-3", "2026-11-16T10:00:00.000Z", [["10379", 1, 49]], { dining_option: "Glovo" }), // Mango Glovo
  recu("1-4", "2026-11-16T11:00:00.000Z", [["10319", 1, 405]]), // Matilda entier = 8 parts
  recu("1-5", "2026-11-16T11:30:00.000Z", [["10342", 1, 38]], { receipt_type: "REFUND" }), // remboursement d'un Mango
  recu("1-6", "2026-11-16T12:00:00.000Z", [["10342", 3, 114]], { cancelled_at: "2026-11-16T12:01:00.000Z" }), // annulé
  recu("1-7", "2026-11-16T12:30:00.000Z", [["10284", 2, 81]]), // 2 parts de Matilda avec remise (81 au lieu de 90)
  recu("1-8", "2026-11-16T13:00:00.000Z", [["99999", 1, 10]]), // SKU inconnu
];

function fauxLoyverse(recus: RecuLoyverse[]) {
  const appels: string[] = [];
  const f = (async (url: string) => {
    const u = new URL(String(url));
    appels.push(u.pathname + u.search);
    if (u.pathname.endsWith("/stores")) return Response.json({ stores: [{ id: COFFEE, name: "BROWSE COFFEE SHOP" }] });
    if (u.pathname.endsWith("/receipts")) {
      expect(u.searchParams.get("store_id")).toBe(COFFEE);
      const min = Date.parse(u.searchParams.get("created_at_min")!);
      const max = Date.parse(u.searchParams.get("created_at_max")!);
      return Response.json({ receipts: recus.filter((r) => Date.parse(r.created_at) >= min && Date.parse(r.created_at) <= max), cursor: null });
    }
    return new Response("?", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, appels };
}

beforeAll(async () => {
  db = await creerDbPglite();
  await initialiser(db, { catalogueCsv: readFileSync("data/catalogue.csv", "utf8"), pinDirection: "123456" });
  const [d] = await db.select().from(utilisateurs);
  direction = { id: d.id, nom: d.nom, role: "direction" };
  await importerArticles(db, lireExportCsv(readFileSync("tests/donnees/export_loyverse_extrait.csv", "utf8")), direction, CORRESPONDANCES_LOYVERSE);
  const [s] = await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars"));
  await enregistrerCreneaux(db, s.id, [{ nom: "Journée", heureDebut: "08:00", heureFin: "20:00", jours: [1, 2, 3, 4, 5, 6, 7] }], direction);
  const [cr] = await listerCreneaux(db, s.id);
  shiftId = await affecter(db, { siteId: s.id, journee: "2026-11-16", creneauId: cr.id, responsableId: direction.id, equipierIds: [] }, direction);
  await ouvrirShift(db, shiftId, direction, new Date("2026-11-16T08:00:00Z"));
  employe = { id: d.id, nom: "Employé", role: "employe" };
});

describe("agrégation des reçus", () => {
  it("additionne par produit et canal, applique le facteur, déduit les remboursements", async () => {
    const arts = await listerArticles(db);
    const parSku = new Map(arts.filter((a) => a.sku).map((a) => [a.sku!.toLowerCase(), { produitId: a.produitId, canalId: a.canalId, facteur: a.facteur, actif: a.actif }]));
    const ag = agregerRecus(RECUS.slice(1, 5), new Map(), parSku);
    const mango = await produit("P001");
    const matilda = await produit("P009");
    const [surPlace, glovo] = await listerCanaux(db);
    expect(ag.ventes.get(`${mango.id}|${surPlace.id}`)).toMatchObject({ quantite: 1, montant: 38 });
    expect(ag.ventes.get(`${mango.id}|${glovo.id}`)).toMatchObject({ quantite: 1, montant: 49 });
    expect(ag.ventes.get(`${matilda.id}|${surPlace.id}`)).toMatchObject({ quantite: 8, montant: 405 });
    expect(ag.nonReconnus).toEqual([{ sku: "10006", nom: "article 10006", quantite: 1 }]);
  });
});

describe("import des ventes d'un shift", () => {
  it("remplace les ventes du shift par celles de Loyverse, dans la fenêtre du shift", async () => {
    const { f, appels } = fauxLoyverse(RECUS);
    const r = await importerVentesShift(db, shiftId, direction, new Date("2026-11-16T14:00:00Z"), { jeton: "x", fetch: f });
    expect(appels[0]).toBe("/v1.0/stores");
    expect(r.nbRecus).toBe(6); // 1-1 hors fenêtre, 1-6 annulé
    expect(r.nonReconnus.map((x) => x.sku)).toEqual(["10006", "99999"]);
    const d = await detailShift(db, shiftId);
    const mango = d.lignes.find((l) => l.ref === "P001")!;
    const matilda = d.lignes.find((l) => l.ref === "P009")!;
    expect(mango.ventes).toBe(2); // 2 − 1 remboursé sur place + 1 Glovo
    expect(mango.calcul.ca).toBe(76 - 38 + 49);
    expect(matilda.ventes).toBe(10); // 8 parts (entier) + 2 parts
    expect(matilda.calcul.ca).toBe(405 + 81); // encaissé réel, remise comprise
    expect(d.shift.ventesSource).toBe("loyverse");
    // Le magasin Loyverse est mémorisé pour les imports suivants.
    expect((await db.select().from(sites).where(eq(sites.nom, "Browse 2 Mars")))[0].loyverseStoreId).toBe(COFFEE);
  });

  it("un article ignoré n'est plus signalé ; un nouvel import remplace le précédent", async () => {
    const affogato = (await listerArticles(db, { nonAssocies: true })).find((a) => a.sku === "10006")!;
    await ignorerArticle(db, affogato.id, direction);
    const { f, appels } = fauxLoyverse(RECUS);
    const r = await importerVentesShift(db, shiftId, direction, new Date("2026-11-16T15:00:00Z"), { jeton: "x", fetch: f });
    expect(appels.some((a) => a.includes("/stores"))).toBe(false);
    expect(r.nonReconnus.map((x) => x.sku)).toEqual(["99999"]);
    expect((await detailShift(db, shiftId)).lignes.find((l) => l.ref === "P001")!.ventes).toBe(2);
    expect((await db.select().from(synchrosLoyverse)).length).toBe(2);
  });

  it("deux imports simultanés du même shift ne créent pas de doublon", async () => {
    const { f } = fauxLoyverse(RECUS);
    const t = new Date("2026-11-16T15:30:00Z");
    await Promise.all([1, 2, 3].map(() => importerVentesShift(db, shiftId, direction, t, { jeton: "x", fetch: f })));
    expect((await detailShift(db, shiftId)).lignes.find((l) => l.ref === "P001")!.ventes).toBe(2);
  });

  it("après clôture, seul un encadrant peut réimporter ; les erreurs sont journalisées", async () => {
    const d = await detailShift(db, shiftId);
    for (const l of d.lignes.filter((x) => x.suiviStock)) {
      await saisirQuantite(db, shiftId, l.produitId, "ouvertureComptee", 20, direction, new Date());
      await saisirQuantite(db, shiftId, l.produitId, "stockReelFin", 10, direction, new Date());
    }
    await cloturerShift(db, shiftId, direction, new Date("2026-11-16T20:05:00Z"), "Écarts de test : stock fictif");
    const { f } = fauxLoyverse([...RECUS, recu("1-9", "2026-11-16T19:50:00.000Z", [["10342", 1, 38]])]);
    await expect(importerVentesShift(db, shiftId, employe, new Date("2026-11-16T21:00:00Z"), { jeton: "x", fetch: f })).rejects.toThrow(/manager/);
    const r = await importerVentesShift(db, shiftId, direction, new Date("2026-11-16T21:00:00Z"), { jeton: "x", fetch: f });
    expect(r.fin.toISOString()).toBe("2026-11-16T20:05:00.000Z"); // fenêtre bornée à la clôture
    expect((await detailShift(db, shiftId)).lignes.find((l) => l.ref === "P001")!.ventes).toBe(3);

    const refus = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    // Moins d'une minute après un import réussi : pas de nouvel appel à Loyverse (sauf à la clôture).
    const appels: string[] = [];
    const espion = (async (u: string) => (appels.push(u), new Response("", { status: 500 }))) as unknown as typeof fetch;
    await importerVentesShift(db, shiftId, direction, new Date(), { jeton: "x", fetch: espion });
    expect(appels).toEqual([]);
    await expect(importerVentesShift(db, shiftId, direction, new Date(), { jeton: "x", fetch: refus, forcer: true })).rejects.toThrow(/refusé/);
    const journal = await db.select().from(synchrosLoyverse);
    expect(journal.filter((j) => j.statut === "erreur")).toHaveLength(1);
    expect((await db.select().from(shifts).where(eq(shifts.id, shiftId)))[0].statut).toBe("cloture");
  });
});

describe("message d'erreur d'un import", () => {
  it("donne la cause réelle d'une requête refusée, sans les paramètres", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "ventes_shift_pkey"'), { code: "23505" });
    const e = new Error('Failed query: insert into "ventes_shift" ("shift_id") values ($1)\nparams: abc', { cause });
    expect(messageErreur(e)).toBe('Erreur base de données (insert into "ventes_shift") : duplicate key value violates unique constraint "ventes_shift_pkey" [23505]');
    expect(messageErreur(new Error("Loyverse injoignable"))).toBe("Loyverse injoignable");
  });
});
