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
