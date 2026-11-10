import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Base commune aux deux pilotes :
 *  - PostgreSQL (Supabase) via `postgres` quand DATABASE_URL est défini ;
 *  - PGlite (PostgreSQL embarqué) en développement et dans les tests.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

export const DOSSIER_MIGRATIONS = "drizzle";

/** Base PGlite (fichier local ou mémoire) avec migrations appliquées. */
export async function creerDbPglite(dossier?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = dossier ? new PGlite(dossier) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: DOSSIER_MIGRATIONS });
  return db as unknown as Db;
}

export async function creerConnexionPostgres(url: string): Promise<{ db: Db; fermer: () => Promise<void> }> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // prepare: false — requis par le pooler de connexions de Supabase (mode transaction).
  const client = postgres(url, { prepare: false, max: 1 });
  return { db: drizzle(client, { schema }) as unknown as Db, fermer: () => client.end({ timeout: 5 }) };
}

export async function creerDbPostgres(url: string): Promise<Db> {
  return (await creerConnexionPostgres(url)).db;
}

const g = globalThis as unknown as { __dbInventaire?: Promise<Db> };

/**
 * Accès à la base pour l'application.
 * Sur Cloudflare Workers, une connexion ne peut pas être partagée entre requêtes :
 * on en ouvre une par requête (voir src/lib/db.ts).
 */
export function getDbProcessus(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!g.__dbInventaire) {
    g.__dbInventaire = url
      ? creerDbPostgres(url)
      : creerDbPglite(process.env.PGLITE_DIR ?? ".data/pglite").then(async (db) => {
          // Base de développement : données initiales au premier lancement.
          const { initialiserDev } = await import("./dev-init");
          await initialiserDev(db);
          return db;
        });
  }
  return g.__dbInventaire;
}
