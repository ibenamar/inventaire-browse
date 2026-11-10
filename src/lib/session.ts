import { eq, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { utilisateurs, type Role } from "@/db/schema";
import type { Acteur } from "@/server/acteur";
import { aAccesAuSite } from "@/server/services/utilisateurs";
import { getDb } from "./db";

const COOKIE_SESSION = "inv_session";
const COOKIE_SITE = "inv_site";
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

export async function ouvrirSession(acteur: Acteur, siteId: string) {
  const db = await getDb();
  const [u] = await db.select({ v: utilisateurs.versionSession }).from(utilisateurs).where(eq(utilisateurs.id, acteur.id));
  const jeton = await new SignJWT({ site: siteId, v: u?.v ?? 0 })
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
}

/** Session courante, relue en base (un compte désactivé perd l'accès immédiatement). */
export async function lireSession(): Promise<Session | null> {
  const jeton = (await cookies()).get(COOKIE_SESSION)?.value;
  if (!jeton) return null;
  try {
    const { payload } = await jwtVerify(jeton, cle());
    if (!payload.sub || typeof payload.site !== "string") return null;
    const db = await getDb();
    const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, payload.sub));
    if (!u || !u.actif) return null;
    // Jeton révoqué (déconnexion, changement de PIN, de rôle ou de sites).
    if ((payload.v ?? 0) !== u.versionSession) return null;
    // Rattachement au site toujours valable.
    if (!(await aAccesAuSite(db, u.id, payload.site))) return null;
    return { acteur: { id: u.id, nom: u.nom, role: u.role }, siteId: payload.site };
  } catch {
    return null;
  }
}

export async function exigerSession(roles?: Role[]): Promise<Session> {
  const s = await lireSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.acteur.role)) redirect("/");
  return s;
}

export const ROLES_ADMIN: Role[] = ["manager", "direction"];
