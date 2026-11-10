import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sites, utilisateurs, utilisateursSites, type Role } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { getDb } from "./db";

// En production, préfixe __Host- : cookie lié au domaine exact, impossible à poser depuis un sous-domaine de browse.ma.
const PREFIXE = process.env.NODE_ENV === "production" ? "__Host-" : "";
const COOKIE_SESSION = `${PREFIXE}inv_session`;
const COOKIE_SITE = `${PREFIXE}inv_site`;
const DUREE_SESSION_H = 12;

function cle(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET manquant (32 caractères minimum)");
    return new TextEncoder().encode("developpement-uniquement-ne-pas-utiliser-en-production");
  }
  return new TextEncoder().encode(s);
}

const optionsCookie = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export async function ouvrirSession(acteur: Acteur, siteId: string, opts: { pinFaible?: boolean } = {}) {
  const db = await getDb();
  const [u] = await db.select({ v: utilisateurs.versionSession }).from(utilisateurs).where(eq(utilisateurs.id, acteur.id));
  const jeton = await new SignJWT({ site: siteId, v: u?.v ?? 0, pf: Boolean(opts.pinFaible) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(acteur.id)
    .setIssuedAt()
    .setExpirationTime(`${DUREE_SESSION_H}h`)
    .sign(cle());
  const c = await cookies();
  c.set(COOKIE_SESSION, jeton, optionsCookie(DUREE_SESSION_H * 3600));
  // L'appareil reste attaché au site choisi.
  c.set(COOKIE_SITE, siteId, optionsCookie(365 * 24 * 3600));
}

/** Déconnexion : le jeton est aussi révoqué côté serveur (une copie du cookie ne sert plus à rien). */
export async function fermerSession() {
  const s = await lireSession();
  if (s) {
    const db = await getDb();
    await db
      .update(utilisateurs)
      .set({ versionSession: sql`${utilisateurs.versionSession} + 1` })
      .where(eq(utilisateurs.id, s.acteur.id));
  }
  (await cookies()).delete(COOKIE_SESSION);
}

export async function oublierSiteAppareil() {
  (await cookies()).delete(COOKIE_SITE);
}

export async function siteAppareil(): Promise<string | null> {
  return (await cookies()).get(COOKIE_SITE)?.value ?? null;
}

export interface Session {
  acteur: Acteur;
  siteId: string;
  /** Encadrant dont le PIN a moins de 6 chiffres (à changer). */
  pinFaible?: boolean;
}

/**
 * Session courante, relue en base (un compte désactivé perd l'accès immédiatement).
 * Une seule requête (personne, rattachement au site, état du site), mémorisée le temps de la requête :
 * la mise en page et la page la demandent toutes deux.
 */
export const lireSession = cache(async (): Promise<Session | null> => {
  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle());
    if (!payload.sub || typeof payload.site !== "string") return null;
    const db = await getDb();
    const [r] = await db
      .select({ u: utilisateurs, statutSite: sites.statut, rattache: utilisateursSites.siteId })
      .from(utilisateurs)
      .leftJoin(sites, eq(sites.id, payload.site))
      .leftJoin(utilisateursSites, and(eq(utilisateursSites.utilisateurId, utilisateurs.id), eq(utilisateursSites.siteId, payload.site)))
      .where(eq(utilisateurs.id, payload.sub));
    if (!r || !r.u.actif) return null;
    // Jeton révoqué (déconnexion, changement de PIN, de rôle ou de sites).
    if ((payload.v ?? 0) !== r.u.versionSession) return null;
    // Rattachement au site toujours valable (la direction a accès à tous), site toujours ouvert.
    if (r.u.role !== "direction" && !r.rattache) return null;
    if (r.statutSite !== "actif") return null;
    return { acteur: { id: r.u.id, nom: r.u.nom, role: r.u.role }, siteId: payload.site, pinFaible: payload.pf === true };
  } catch {
    return null;
  }
});

export async function exigerSession(roles?: Role[]): Promise<Session> {
  const s = await lireSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.acteur.role)) redirect("/");
  return s;
}

export const ROLES_ADMIN: Role[] = ["manager", "direction"];
