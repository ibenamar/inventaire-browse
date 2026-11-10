import { cache } from "react";
import { getDb } from "@/lib/db";
import { exigerSession } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";
import { ErreurMetier } from "@/server/erreurs";
import { detailShift } from "@/server/services/shifts";
import { aAccesAuSite } from "@/server/services/utilisateurs";
import { notFound, redirect } from "next/navigation";

/** Détail d'un shift pour la requête en cours, avec contrôle d'accès. */
export const chargerShift = cache(async (id: string) => {
  const session = await exigerSession();
  const db = await getDb();
  let d;
  try {
    d = await detailShift(db, id);
  } catch (e) {
    if (e instanceof ErreurMetier) notFound();
    throw e;
  }
  if (!(await aAccesAuSite(db, session.acteur.id, d.shift.siteId))) redirect("/");
  const estResponsable = d.shift.responsableId === session.acteur.id || estEncadrant(session.acteur);
  return { session, d, estResponsable };
});
