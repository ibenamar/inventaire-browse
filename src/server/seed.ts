import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { articlesCaisse, canauxVente, categories, creneaux, produits, sites, utilisateurs, type Unite } from "@/db/schema";
import { lireCsv } from "@/lib/csv";
import { creerUtilisateur } from "./services/utilisateurs";

export { lireCsv };

/** Sites au lancement (décisions du 10/11/2026). */
export const SITES_INITIAUX = [
  { nom: "Browse 2 Mars", type: "point_de_vente", statut: "actif", ordre: 1, loyverseMagasin: "BROWSE COFFEE SHOP" },
  { nom: "Browse Sweets 2 Mars", type: "point_de_vente", statut: "actif", ordre: 2, loyverseMagasin: "Browse Sweet" },
  { nom: "Anfa", type: "point_de_vente", statut: "en_ouverture", ordre: 3 },
  { nom: "Hay Hassani", type: "point_de_vente", statut: "en_ouverture", ordre: 4 },
  { nom: "Palmier", type: "point_de_vente", statut: "en_ouverture", ordre: 5 },
  { nom: "Laboratoire", type: "laboratoire", statut: "en_ouverture", ordre: 9 },
] as const;

/** Catégorie des matières premières comptées au laboratoire (créée aussi par la migration 0005). */
export const CATEGORIE_INGREDIENTS = "Ingrédients";
/** Catégorie des préparations intermédiaires du laboratoire (créée aussi par la migration 0009). */
export const CATEGORIE_INTERMEDIAIRES = "Préparations intermédiaires";

/** Grille d'exemple, à ajuster dans l'écran Sites & créneaux. */
export const CRENEAUX_EXEMPLE = [
  { nom: "Matin", heureDebut: "07:00", heureFin: "15:00" },
  { nom: "Après-midi", heureDebut: "15:00", heureFin: "20:00" },
  { nom: "Nuit", heureDebut: "20:00", heureFin: "04:00" },
];

const UNITES_CSV: Record<string, Unite> = { pièce: "piece", piece: "piece", part: "part", bouteille: "bouteille", kg: "kg", litre: "litre" };

/**
 * Données initiales (idempotent) : sites, catalogue issu du fichier Excel,
 * compte Direction et, en option, une grille de créneaux d'exemple.
 */
export async function initialiser(
  db: Db,
  opts: { catalogueCsv: string; pinDirection: string; creneauxExemple?: boolean },
): Promise<{ sites: number; produits: number; directionCree: boolean }> {
  for (const s of SITES_INITIAUX) {
    await db.insert(sites).values(s).onConflictDoNothing({ target: sites.nom });
  }
  const tousSites = await db.select().from(sites);

  const rows = lireCsv(opts.catalogueCsv);
  const nomsCategories = [...new Set(rows.map((r) => r.categorie))];
  for (const [i, nom] of nomsCategories.entries()) {
    await db.insert(categories).values({ nom, ordre: i + 1 }).onConflictDoNothing({ target: categories.nom });
  }
  await db.insert(categories).values({ nom: CATEGORIE_INGREDIENTS, ordre: 100 }).onConflictDoNothing({ target: categories.nom });
  await db.insert(categories).values({ nom: CATEGORIE_INTERMEDIAIRES, ordre: 99 }).onConflictDoNothing({ target: categories.nom });
  const cats = new Map((await db.select().from(categories)).map((c) => [c.nom, c.id]));
  for (const [i, r] of rows.entries()) {
    await db
      .insert(produits)
      .values({
        ref: r.ref,
        nom: r.produit,
        categorieId: cats.get(r.categorie)!,
        unite: UNITES_CSV[r.unite] ?? "piece",
        format: r.format || null,
        partsParGateau: r.parts_par_gateau ? Number(r.parts_par_gateau) : null,
        suiviStock: r.suivi_stock !== "non",
        fabriqueLabo: r.suivi_stock !== "non" && !/^boissons/i.test(r.categorie),
        prixVente: r.prix_vente_mad ? Number(r.prix_vente_mad) : null,
        ordre: i + 1,
      })
      .onConflictDoNothing({ target: produits.ref });
  }

  // Canaux de vente (créés aussi par la migration 0002) et SKU éventuellement fournis dans le CSV.
  await db
    .insert(canauxVente)
    .values([
      { code: "sur_place", nom: "Sur place", motsCles: [], ordre: 1 },
      { code: "glovo", nom: "Glovo", motsCles: ["glovo"], ordre: 2 },
    ])
    .onConflictDoNothing({ target: canauxVente.code });
  const [surPlace] = await db.select().from(canauxVente).where(eq(canauxVente.code, "sur_place"));
  const dejaLies = new Set((await db.select().from(articlesCaisse)).map((a) => a.sku));
  const parRef = new Map((await db.select().from(produits)).map((p) => [p.ref, p]));
  for (const r of rows.filter((x) => x.sku_loyverse && !dejaLies.has(x.sku_loyverse))) {
    const p = parRef.get(r.ref);
    if (p) await db.insert(articlesCaisse).values({ produitId: p.id, canalId: surPlace.id, nomCaisse: p.nom, sku: r.sku_loyverse, prixVente: p.prixVente });
  }

  const direction = await db.select().from(utilisateurs).where(eq(utilisateurs.role, "direction"));
  let directionCree = false;
  if (!direction.length) {
    await creerUtilisateur(db, { nom: "Direction", role: "direction", actif: true, siteIds: [], pin: opts.pinDirection }, null);
    directionCree = true;
  }

  if (opts.creneauxExemple) {
    for (const s of tousSites.filter((x) => x.statut === "actif" && x.type === "point_de_vente")) {
      const existants = await db.select().from(creneaux).where(eq(creneaux.siteId, s.id));
      if (existants.length) continue;
      await db.insert(creneaux).values(
        CRENEAUX_EXEMPLE.map((c, i) => ({ ...c, siteId: s.id, jours: [1, 2, 3, 4, 5, 6, 7], ordre: i })),
      );
    }
  }
  return { sites: tousSites.length, produits: rows.length, directionCree };
}
