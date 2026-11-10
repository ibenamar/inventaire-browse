"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { fermerSession, ouvrirSession, oublierSiteAppareil } from "@/lib/session";
import { lireSite } from "@/server/services/sites";
import { compterEchecIp, ipBloquee } from "@/server/services/limiteur";
import { aAccesAuSite, authentifier, idDirectionParNom } from "@/server/services/utilisateurs";

/** Adresse IP du client (Cloudflare), pour limiter les essais en série. */
async function adresseIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "inconnue";
}

export async function connexion(_etat: { erreur?: string } | null, form: FormData): Promise<{ erreur?: string }> {
  const siteId = String(form.get("siteId") ?? "");
  const pin = String(form.get("pin") ?? "").slice(0, 12);
  const nomDirection = String(form.get("nomDirection") ?? "").trim().slice(0, 80);
  const db = await getDb();
  const maintenant = new Date();
  const ip = await adresseIp();
  if (await ipBloquee(db, ip, maintenant)) return { erreur: "Trop d'essais depuis cet appareil. Réessayez dans une heure." };
  const site = await lireSite(db, siteId).catch(() => null);
  if (!site || site.statut !== "actif") return { erreur: "Site inconnu ou pas encore ouvert" };
  // La direction n'est pas listée sur les sites : elle saisit son nom (même message d'erreur que pour un code faux).
  let utilisateurId = String(form.get("utilisateurId") ?? "");
  if (nomDirection) {
    utilisateurId = (await idDirectionParNom(db, nomDirection)) ?? "";
    if (!utilisateurId) {
      await compterEchecIp(db, ip, maintenant);
      return { erreur: "Nom ou code incorrect" };
    }
  }
  if (!(await aAccesAuSite(db, utilisateurId, siteId))) return { erreur: "Vous n'êtes pas rattaché à ce site" };
  const r = await authentifier(db, utilisateurId, pin, maintenant);
  if (!r.ok) {
    await compterEchecIp(db, ip, maintenant);
    return { erreur: nomDirection && r.message === "Code incorrect" ? "Nom ou code incorrect" : r.message };
  }
  await ouvrirSession(r.acteur, siteId, { pinFaible: r.pinFaible });
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
