import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ROLES, utilisateurs, utilisateursSites, type Role } from "@/db/schema";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { exiger } from "../erreurs";
import { estPinValide, hacherPin, verifierPin } from "../pin";

export const ECHECS_AVANT_BLOCAGE = 5;
export const DUREE_BLOCAGE_MIN = 5;
export const DUREE_BLOCAGE_MAX_MIN = 60;

export interface UtilisateurVue {
  id: string;
  nom: string;
  role: Role;
  actif: boolean;
  siteIds: string[];
}

export async function listerUtilisateurs(db: Db): Promise<UtilisateurVue[]> {
  const us = await db.select().from(utilisateurs).orderBy(asc(utilisateurs.nom));
  const liens = await db.select().from(utilisateursSites);
  return us.map((u) => ({
    id: u.id,
    nom: u.nom,
    role: u.role,
    actif: u.actif,
    siteIds: liens.filter((l) => l.utilisateurId === u.id).map((l) => l.siteId),
  }));
}

/** Utilisateurs pouvant se connecter sur un site : ceux rattachés au site, plus la direction. */
export async function utilisateursDuSite(db: Db, siteId: string) {
  const liens = await db.select().from(utilisateursSites).where(eq(utilisateursSites.siteId, siteId));
  const ids = liens.map((l) => l.utilisateurId);
  const cond = ids.length
    ? or(inArray(utilisateurs.id, ids), eq(utilisateurs.role, "direction"))
    : eq(utilisateurs.role, "direction");
  return db
    .select({ id: utilisateurs.id, nom: utilisateurs.nom, role: utilisateurs.role })
    .from(utilisateurs)
    .where(and(eq(utilisateurs.actif, true), cond))
    .orderBy(asc(utilisateurs.nom));
}

export async function aAccesAuSite(db: Db, utilisateurId: string, siteId: string): Promise<boolean> {
  const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateurId));
  if (!u || !u.actif) return false;
  if (u.role === "direction") return true;
  const [l] = await db
    .select()
    .from(utilisateursSites)
    .where(and(eq(utilisateursSites.utilisateurId, utilisateurId), eq(utilisateursSites.siteId, siteId)));
  return Boolean(l);
}

export interface SaisieUtilisateur {
  nom: string;
  role: Role;
  actif: boolean;
  siteIds: string[];
  pin?: string;
}

function valider(v: SaisieUtilisateur, pinObligatoire: boolean) {
  exiger(v.nom.trim().length > 0, "Le nom est obligatoire");
  exiger(ROLES.includes(v.role), "Rôle invalide");
  if (pinObligatoire || v.pin) exiger(v.pin && estPinValide(v.pin), "Le code PIN doit comporter 4 à 6 chiffres");
  // Les comptes qui pilotent plusieurs sites ou tout le réseau ont un code plus long.
  if (v.pin && (v.role === "manager" || v.role === "direction")) exiger(/^\d{6}$/.test(v.pin), "Un manager ou la direction doit avoir un PIN de 6 chiffres");
  exiger(v.role === "direction" || v.siteIds.length > 0, "Rattacher l'utilisateur à au moins un site");
}

export async function creerUtilisateur(db: Db, v: SaisieUtilisateur, acteur: Acteur | null): Promise<string> {
  valider(v, true);
  const [u] = await db
    .insert(utilisateurs)
    .values({ nom: v.nom.trim(), role: v.role, actif: v.actif, pinHash: await hacherPin(v.pin!) })
    .returning({ id: utilisateurs.id });
  if (v.siteIds.length) {
    await db.insert(utilisateursSites).values(v.siteIds.map((siteId) => ({ utilisateurId: u.id, siteId })));
  }
  await tracer(db, acteur?.id ?? null, "creer", "utilisateur", u.id, { nom: v.nom, role: v.role, siteIds: v.siteIds });
  return u.id;
}

export async function modifierUtilisateur(db: Db, id: string, v: SaisieUtilisateur, acteur: Acteur) {
  valider(v, false);
  // Toute modification des droits ou du code ferme les sessions ouvertes de la personne.
  const maj: Partial<typeof utilisateurs.$inferInsert> = { nom: v.nom.trim(), role: v.role, actif: v.actif };
  if (v.pin) Object.assign(maj, { pinHash: await hacherPin(v.pin), echecsPin: 0, bloqueJusqua: null });
  await db.transaction(async (tx) => {
    await tx
      .update(utilisateurs)
      .set({ ...maj, versionSession: sql`${utilisateurs.versionSession} + 1` })
      .where(eq(utilisateurs.id, id));
    await tx.delete(utilisateursSites).where(eq(utilisateursSites.utilisateurId, id));
    if (v.siteIds.length) {
      await tx.insert(utilisateursSites).values(v.siteIds.map((siteId) => ({ utilisateurId: id, siteId })));
    }
  });
  await tracer(db, acteur.id, "modifier", "utilisateur", id, { nom: v.nom, role: v.role, actif: v.actif, siteIds: v.siteIds, pinModifie: Boolean(v.pin) });
}

export type ResultatConnexion =
  | { ok: true; acteur: Acteur }
  | { ok: false; message: string };

/**
 * Vérifie le PIN, avec blocage temporaire après plusieurs échecs.
 *
 * L'essai est compté AVANT la vérification, par une mise à jour atomique qui pose aussi le blocage :
 * des requêtes envoyées en parallèle ne peuvent pas dépasser le nombre d'essais permis (la base
 * sérialise les mises à jour de la ligne et revérifie la condition « non bloqué »). Les blocages
 * successifs s'allongent (5, 10, 20, 40 min puis 1 h) tant qu'aucune connexion ne réussit.
 */
export async function authentifier(db: Db, utilisateurId: string, pin: string, maintenant: Date): Promise<ResultatConnexion> {
  const [u] = await db.select().from(utilisateurs).where(eq(utilisateurs.id, utilisateurId));
  if (!u || !u.actif) return { ok: false, message: "Utilisateur inconnu ou désactivé" };
  const blocage = (x: Date) => `Trop d'essais. Réessayez dans ${Math.ceil((x.getTime() - maintenant.getTime()) / 60_000)} min.`;
  const [essai] = await db
    .update(utilisateurs)
    .set({
      echecsPin: sql`${utilisateurs.echecsPin} + 1`,
      bloqueJusqua: sql`case when (${utilisateurs.echecsPin} + 1) % ${ECHECS_AVANT_BLOCAGE} = 0
        then ${maintenant.toISOString()}::timestamptz + make_interval(mins => least(${DUREE_BLOCAGE_MAX_MIN}, ${DUREE_BLOCAGE_MIN} * power(2, (${utilisateurs.echecsPin} + 1) / ${ECHECS_AVANT_BLOCAGE} - 1))::int)
        else ${utilisateurs.bloqueJusqua} end`,
    })
    .where(
      and(
        eq(utilisateurs.id, u.id),
        eq(utilisateurs.actif, true),
        or(isNull(utilisateurs.bloqueJusqua), lte(utilisateurs.bloqueJusqua, maintenant)),
      ),
    )
    .returning({ bloqueJusqua: utilisateurs.bloqueJusqua, pinHash: utilisateurs.pinHash });
  if (!essai) {
    const [x] = await db.select({ b: utilisateurs.bloqueJusqua }).from(utilisateurs).where(eq(utilisateurs.id, u.id));
    return { ok: false, message: x?.b && x.b > maintenant ? blocage(x.b) : "Réessayez." };
  }
  if (await verifierPin(pin, essai.pinHash)) {
    await db.update(utilisateurs).set({ echecsPin: 0, bloqueJusqua: null }).where(eq(utilisateurs.id, u.id));
    return { ok: true, acteur: { id: u.id, nom: u.nom, role: u.role } };
  }
  const bloque = essai.bloqueJusqua && essai.bloqueJusqua > maintenant;
  return { ok: false, message: bloque ? `Code incorrect. ${blocage(essai.bloqueJusqua!)}` : "Code incorrect" };
}
