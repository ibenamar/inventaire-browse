import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { categories, creneaux, produits, sites, utilisateurs } from "@/db/schema";
import { creerUtilisateur } from "./services/utilisateurs";

/** Sites au lancement (décisions du 10/11/2026). */
export const SITES_INITIAUX = [
  { nom: "Browse 2 Mars", type: "point_de_vente", statut: "actif", ordre: 1 },
  { nom: "Browse Sweets 2 Mars", type: "point_de_vente", statut: "actif", ordre: 2 },
  { nom: "Anfa", type: "point_de_vente", statut: "en_ouverture", ordre: 3 },
  { nom: "Hay Hassani", type: "point_de_vente", statut: "en_ouverture", ordre: 4 },
  { nom: "Palmier", type: "point_de_vente", statut: "en_ouverture", ordre: 5 },
  { nom: "Laboratoire", type: "laboratoire", statut: "en_ouverture", ordre: 9 },
] as const;

/** Grille d'exemple, à ajuster dans l'écran Sites & créneaux. */
export const CRENEAUX_EXEMPLE = [
  { nom: "Matin", heureDebut: "07:00", heureFin: "15:00" },
  { nom: "Après-midi", heureDebut: "15:00", heureFin: "20:00" },
  { nom: "Nuit", heureDebut: "20:00", heureFin: "04:00" },
];

export function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x !== "")) lignes.push(ligne);
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete.map((k, i) => [k.trim(), (l[i] ?? "").trim()])));
}

const UNITES_CSV: Record<string, "piece" | "part" | "bouteille"> = { pièce: "piece", piece: "piece", part: "part", bouteille: "bouteille" };

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
        sku: r.sku_loyverse || null,
        prixVente: r.prix_vente_mad ? Number(r.prix_vente_mad) : null,
        ordre: i + 1,
      })
      .onConflictDoNothing({ target: produits.ref });
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
