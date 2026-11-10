import type { Db } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { journalAudit, utilisateurs } from "@/db/schema";

export async function tracer(
  db: Db,
  utilisateurId: string | null,
  action: string,
  entite: string,
  entiteId: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(journalAudit).values({ utilisateurId, action, entite, entiteId, details: details ?? null });
}

/** Dernières entrées du journal d'audit, avec le nom de l'auteur. */
export async function listerJournal(db: Db, opts: { limite?: number; entite?: string; entiteId?: string } = {}) {
  return db
    .select({ j: journalAudit, auteur: utilisateurs.nom })
    .from(journalAudit)
    .leftJoin(utilisateurs, eq(utilisateurs.id, journalAudit.utilisateurId))
    .where(
      and(
        opts.entite ? eq(journalAudit.entite, opts.entite) : undefined,
        opts.entiteId ? eq(journalAudit.entiteId, opts.entiteId) : undefined,
      ),
    )
    .orderBy(desc(journalAudit.horodatage))
    .limit(opts.limite ?? 200);
}
