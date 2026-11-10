import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { tentativesConnexion } from "@/db/schema";

/**
 * Limite des échecs de connexion par adresse IP, en plus du blocage par compte : au-delà de
 * MAX_ECHECS_IP échecs dans l'heure, toute tentative depuis cette adresse est refusée.
 */
export const MAX_ECHECS_IP = 30;
const FENETRE_MS = 3600_000;

export async function ipBloquee(db: Db, ip: string, maintenant: Date): Promise<boolean> {
  const [t] = await db.select().from(tentativesConnexion).where(eq(tentativesConnexion.cle, ip));
  return Boolean(t && maintenant.getTime() - t.debut.getTime() < FENETRE_MS && t.echecs >= MAX_ECHECS_IP);
}

/** Compte un échec (mise à jour atomique ; la fenêtre repart de zéro au bout d'une heure). */
export async function compterEchecIp(db: Db, ip: string, maintenant: Date) {
  const limite = new Date(maintenant.getTime() - FENETRE_MS);
  await db
    .insert(tentativesConnexion)
    .values({ cle: ip, debut: maintenant, echecs: 1 })
    .onConflictDoUpdate({
      target: tentativesConnexion.cle,
      set: {
        echecs: sql`case when ${tentativesConnexion.debut} < ${limite.toISOString()}::timestamptz then 1 else ${tentativesConnexion.echecs} + 1 end`,
        debut: sql`case when ${tentativesConnexion.debut} < ${limite.toISOString()}::timestamptz then ${maintenant.toISOString()}::timestamptz else ${tentativesConnexion.debut} end`,
      },
    });
}
