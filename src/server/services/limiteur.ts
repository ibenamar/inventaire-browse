import { lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { tentativesConnexion } from "@/db/schema";

/**
 * Limite des tentatives de connexion par adresse IP, en plus du blocage par compte.
 * La tentative est comptée AVANT la vérification du code, par une mise à jour atomique : des
 * requêtes envoyées en parallèle ne dépassent pas la limite. Une connexion réussie rend son essai.
 */
export const MAX_ECHECS_IP = 30;
const FENETRE_MS = 3600_000;

/** Clé d'une adresse : IPv4 entière, IPv6 ramenée à son préfixe /64 (un abonné en dispose de milliers). */
export function cleIp(ip: string): string {
  if (!ip.includes(":")) return ip;
  const blocs = ip.split("%")[0].split(":");
  const complet = blocs.includes("")
    ? [...blocs.slice(0, blocs.indexOf("")), ...Array(8 - blocs.filter(Boolean).length).fill("0"), ...blocs.slice(blocs.lastIndexOf("") + 1)]
    : blocs;
  return complet.slice(0, 4).map((b) => b || "0").join(":") + "::/64";
}

/** Compte une tentative et indique si l'adresse a dépassé la limite (la tentative est alors refusée). */
export async function tentativeIp(db: Db, ip: string, maintenant: Date): Promise<{ autorisee: boolean }> {
  const cle = cleIp(ip);
  const limite = new Date(maintenant.getTime() - FENETRE_MS);
  // Ménage des fenêtres terminées depuis longtemps.
  await db.delete(tentativesConnexion).where(lt(tentativesConnexion.debut, new Date(maintenant.getTime() - 2 * FENETRE_MS)));
  const [t] = await db
    .insert(tentativesConnexion)
    .values({ cle, debut: maintenant, echecs: 1 })
    .onConflictDoUpdate({
      target: tentativesConnexion.cle,
      set: {
        echecs: sql`case when ${tentativesConnexion.debut} < ${limite.toISOString()}::timestamptz then 1 else ${tentativesConnexion.echecs} + 1 end`,
        debut: sql`case when ${tentativesConnexion.debut} < ${limite.toISOString()}::timestamptz then ${maintenant.toISOString()}::timestamptz else ${tentativesConnexion.debut} end`,
      },
    })
    .returning({ echecs: tentativesConnexion.echecs });
  return { autorisee: t.echecs <= MAX_ECHECS_IP };
}

/** Connexion réussie : l'essai n'est pas compté comme un échec. */
export async function rendreTentativeIp(db: Db, ip: string) {
  await db
    .update(tentativesConnexion)
    .set({ echecs: sql`greatest(0, ${tentativesConnexion.echecs} - 1)` })
    .where(sql`${tentativesConnexion.cle} = ${cleIp(ip)}`);
}
