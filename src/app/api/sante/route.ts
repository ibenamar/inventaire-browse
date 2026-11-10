import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { lireSession } from "@/lib/session";
import { categoriesARattacher, compterArticlesRattaches, listerCanaux, magasinsConnus } from "@/server/services/caisse";
import { listerProduits } from "@/server/services/catalogue";
import { listerSites } from "@/server/services/sites";
import { lireMagasinsLoyverse, URL_API_LOYVERSE } from "@/server/services/loyverse";

export const dynamic = "force-dynamic";

const DELAI_MS = 8000;

/**
 * Diagnostic réservé à la direction : chronomètre les requêtes de l'écran Loyverse, une par une
 * puis en parallèle, chacune limitée à 8 s. Permet de repérer une requête qui reste sans réponse.
 */
export async function GET() {
  const session = await lireSession();
  if (!session || session.acteur.role !== "direction") return new Response("Réservé à la direction", { status: 403 });
  const db = await getDb();
  const mesurer = async (nom: string, f: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const r = await Promise.race([
        f().then((v) => ({ ok: true as const, v })),
        new Promise<{ ok: false; erreur: string }>((ok) => setTimeout(() => ok({ ok: false, erreur: `sans réponse après ${DELAI_MS} ms` }), DELAI_MS)),
      ]);
      const lignes = r.ok && Array.isArray(r.v) ? r.v.length : r.ok && r.v instanceof Map ? r.v.size : undefined;
      return { nom, ms: Date.now() - t, ...(r.ok ? { ok: true, lignes } : r) };
    } catch (e) {
      return { nom, ms: Date.now() - t, ok: false, erreur: e instanceof Error ? e.message : String(e) };
    }
  };
  const requetes: [string, () => Promise<unknown>][] = [
    ["categoriesARattacher", () => categoriesARattacher(db)],
    ["listerCanaux", () => listerCanaux(db)],
    ["listerProduits", () => listerProduits(db, { actifsSeulement: true })],
    ["compterArticlesRattaches", () => compterArticlesRattaches(db)],
    ["magasinsConnus", () => magasinsConnus(db)],
    ["listerSites", () => listerSites(db)],
  ];
  const debut = Date.now();
  const connexion = await mesurer("connexion (select 1)", () => db.execute(sql`select 1`));
  const uneParUne = [];
  for (const [nom, f] of requetes) uneParUne.push(await mesurer(nom, f));
  const enParallele = await mesurer("les 6 en parallèle", () => Promise.all(requetes.map(([, f]) => f())));
  // Loyverse : présence du jeton (jamais sa valeur) et appel de l'API depuis la production.
  const jeton = process.env.LOYVERSE_TOKEN ?? "";
  const loyverse = {
    jetonConfigure: jeton.trim().length > 0,
    longueurJeton: jeton.length,
    espacesAutour: jeton !== jeton.trim(),
    magasins: jeton.trim() ? await mesurer("GET /stores", () => lireMagasinsLoyverse(jeton)) : null,
    articles: jeton.trim()
      ? await mesurer("GET /items?limit=1", async () => {
          const r = await fetch(`${URL_API_LOYVERSE}/items?limit=1`, { headers: { Authorization: `Bearer ${jeton.trim()}` } });
          return [r.status];
        })
      : null,
  };
  const corps = {
    version: process.env.NEXT_PUBLIC_VERSION ?? null,
    horodatage: new Date().toISOString(),
    totalMs: Date.now() - debut,
    connexion,
    uneParUne,
    enParallele,
    loyverse,
  };
  return new Response(JSON.stringify(corps, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
