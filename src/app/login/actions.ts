"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { fermerSession, ouvrirSession, oublierSiteAppareil } from "@/lib/session";
import { lireSite } from "@/server/services/sites";
import { rendreTentativeIp, tentativeIp } from "@/server/services/limiteur";
import { aAccesAuSite, authentifier, estCompteDirection, idDirectionParNom, leurrePin } from "@/server/services/utilisateurs";

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
  // La limite porte sur l'adresse du réseau (toutes les tablettes d'une boutique la partagent).
  if (!(await tentativeIp(db, ip, maintenant)).autorisee) return { erreur: "Trop d'essais depuis ce réseau. Réessayez dans une heure ou prévenez un manager." };
  const site = await lireSite(db, siteId).catch(() => null);
  if (!site || site.statut !== "actif") return { erreur: "Site inconnu ou pas encore ouvert" };

  const utilisateurId = String(form.get("utilisateurId") ?? "");
  if (nomDirection) {
    // Direction : elle n'est pas listée, elle saisit son nom. Toute erreur donne le même message, et un nom
    // inconnu coûte le même calcul qu'un code faux (ni le message ni le temps de réponse ne trahissent un nom).
    const id = await idDirectionParNom(db, nomDirection);
    const r = id ? await authentifier(db, id, pin, maintenant) : await leurrePin(pin);
    if (!r.ok) return { erreur: "Nom ou code incorrect (ou compte momentanément bloqué)" };
    await rendreTentativeIp(db, ip);
    await ouvrirSession(r.acteur, siteId, { pinFaible: r.pinFaible });
    redirect("/");
  }

  if (form.get("modeDirection") === "1") return { erreur: "Indiquez votre nom" };
  if (!/^[0-9a-f-]{36}$/i.test(utilisateurId)) return { erreur: "Choisissez votre nom dans la liste" };
  // Liste du site : un compte direction ne passe pas par ici (il doit donner son nom).
  if (!(await aAccesAuSite(db, utilisateurId, siteId)) || (await estCompteDirection(db, utilisateurId)))
    return { erreur: "Vous n'êtes pas rattaché à ce site" };
  const r = await authentifier(db, utilisateurId, pin, maintenant);
  if (!r.ok) return { erreur: r.message };
  await rendreTentativeIp(db, ip);
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
