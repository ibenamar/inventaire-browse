import type { Db } from "@/db";
import { journalAudit } from "@/db/schema";

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
