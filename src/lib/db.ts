import { after } from "next/server";
import { cache } from "react";
import { creerConnexionPostgres, getDbProcessus, type Db } from "@/db";

const surWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Base de données pour la requête en cours.
 * Sur Cloudflare Workers, une connexion ne peut pas servir à deux requêtes : on en ouvre une
 * par requête (mémorisée le temps de la requête par `cache`) et on la referme une fois la
 * réponse envoyée, sans quoi les connexions s'accumulent jusqu'à saturer la base.
 */
export const getDb = cache(async (): Promise<Db> => {
  const url = process.env.DATABASE_URL;
  if (url && surWorkers()) {
    const { db, fermer } = await creerConnexionPostgres(url);
    after(fermer);
    return db;
  }
  return getDbProcessus();
});

/**
 * Connexion neuve, dédiée à une opération longue (import), fermée à la fin. Évite d'écrire sur une
 * connexion restée inactive pendant un appel externe (le pooler peut l'avoir fermée entre-temps).
 */
export async function nouvelleConnexion(): Promise<{ db: Db; fermer: () => void }> {
  const url = process.env.DATABASE_URL;
  if (url) return creerConnexionPostgres(url);
  return { db: await getDbProcessus(), fermer: () => undefined };
}

/** Coupure de connexion (et non erreur SQL) : l'opération peut être retentée sur une connexion neuve. */
export function estCoupureConnexion(e: unknown): boolean {
  const m = e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e);
  return /CONNECTION_(CLOSED|ENDED|DESTROYED)|CONNECT_TIMEOUT|ECONNRESET|EPIPE|socket hang up/i.test(m);
}
