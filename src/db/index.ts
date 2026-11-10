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

type Requete = PromiseLike<unknown> & { values(): PromiseLike<unknown> };
type ClientPg = { unsafe(...a: unknown[]): Requete; begin(...a: unknown[]): PromiseLike<unknown> };

/**
 * Fait passer les requêtes d'une connexion une à une : chacune n'est envoyée qu'une fois la précédente
 * terminée (réussie ou non). En production (Cloudflare Workers → pooler Supabase), plusieurs requêtes
 * simultanées sur une même connexion restaient sans réponse, alors qu'en série elles répondent en
 * quelques dizaines de millisecondes (diagnostic /api/sante du 10/11/2026). Une transaction occupe la
 * file jusqu'à sa fin ; ses requêtes passent par sa propre connexion réservée.
 */
export function serialiser<C extends object>(client: C): C {
  let file: Promise<unknown> = Promise.resolve();
  const enFile = <T>(f: () => PromiseLike<T>): Promise<T> => {
    const r = file.then(f, f) as Promise<T>;
    file = r.catch(() => undefined);
    return r;
  };
  return new Proxy(client, {
    get(cible, prop, recepteur) {
      const c = cible as unknown as ClientPg;
      if (prop === "unsafe") {
        return (...args: unknown[]) => {
          // Les requêtes postgres.js ne partent qu'au premier « then » : on les crée au moment de leur tour.
          const lancer = () => c.unsafe(...args);
          return {
            values: () => enFile(() => lancer().values()),
            then: <A, B>(ok?: (v: unknown) => A | PromiseLike<A>, ko?: (e: unknown) => B | PromiseLike<B>) =>
              enFile(() => lancer()).then(ok, ko),
          };
        };
      }
      if (prop === "begin") return (...args: unknown[]) => enFile(() => c.begin(...args));
      const v = Reflect.get(cible, prop, recepteur);
      return typeof v === "function" ? v.bind(cible) : v;
    },
  });
}

export async function creerConnexionPostgres(url: string): Promise<{ db: Db; fermer: () => void }> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  // prepare: false — requis par le pooler de connexions de Supabase (mode transaction).
  // max_pipeline: 1 — une requête à la fois sur la connexion : le pooler gère mal plusieurs requêtes
  // envoyées d'affilée sans attendre les réponses (une page restait bloquée sans erreur).
  // connect_timeout : ne pas attendre indéfiniment une connexion qui ne s'établit pas.
  // (max_pipeline est une option prise en charge par postgres.js mais absente de ses types.)
  const client = postgres(url, { prepare: false, max: 1, max_pipeline: 1, connect_timeout: 10 } as Parameters<typeof postgres>[1]);
  return {
    db: drizzle(serialiser(client), { schema }) as unknown as Db,
    // Fermeture immédiate, sans attendre l'accusé de fermeture du serveur : sur Cloudflare Workers,
    // une tâche encore en attente après la réponse est interrompue (avertissement « waitUntil »).
    fermer: () => {
      void client.end({ timeout: 0 }).catch(() => undefined);
    },
  };
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
