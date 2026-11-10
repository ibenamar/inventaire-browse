import { redirect } from "next/navigation";
import type { Db } from "@/db";
import type { Session } from "@/lib/session";
import { exigerSession, ROLES_ADMIN } from "@/lib/session";
import type { Acteur } from "@/server/acteur";
import { listerSites, type Site } from "@/server/services/sites";
import { aAccesAuSite } from "@/server/services/utilisateurs";

/** Points de vente qu'un encadrant peut piloter : tous pour la direction, les siens pour un manager. */
export async function sitesPilotables(db: Db, acteur: Acteur): Promise<Site[]> {
  const tous = (await listerSites(db)).filter((s) => s.type === "point_de_vente");
  if (acteur.role === "direction") return tous;
  const res: Site[] = [];
  for (const s of tous) if (await aAccesAuSite(db, acteur.id, s.id)) res.push(s);
  return res;
}

export async function exigerEncadrant(): Promise<Session> {
  return exigerSession(ROLES_ADMIN);
}

export async function exigerDirection(): Promise<Session> {
  const s = await exigerSession(ROLES_ADMIN);
  if (s.acteur.role !== "direction") redirect("/admin");
  return s;
}
