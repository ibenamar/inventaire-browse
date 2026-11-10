"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { fermerSession, ouvrirSession, oublierSiteAppareil } from "@/lib/session";
import { lireSite } from "@/server/services/sites";
import { aAccesAuSite, authentifier } from "@/server/services/utilisateurs";

export async function connexion(_etat: { erreur?: string } | null, form: FormData): Promise<{ erreur?: string }> {
  const siteId = String(form.get("siteId") ?? "");
  const utilisateurId = String(form.get("utilisateurId") ?? "");
  const pin = String(form.get("pin") ?? "");
  const db = await getDb();
  const site = await lireSite(db, siteId).catch(() => null);
  if (!site || site.statut !== "actif") return { erreur: "Site inconnu ou pas encore ouvert" };
  if (!(await aAccesAuSite(db, utilisateurId, siteId))) return { erreur: "Vous n'êtes pas rattaché à ce site" };
  const r = await authentifier(db, utilisateurId, pin, new Date());
  if (!r.ok) return { erreur: r.message };
  await ouvrirSession(r.acteur, siteId);
  redirect("/");
}

export async function deconnexion() {
  await fermerSession();
  redirect("/login");
}

export async function changerSite() {
  await fermerSession();
  await oublierSiteAppareil();
  redirect("/login");
}
