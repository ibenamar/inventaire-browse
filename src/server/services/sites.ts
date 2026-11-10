import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { creneaux, MODES_OUVERTURE, shifts, sites, STATUTS_SITE } from "@/db/schema";
import { validerCreneaux, type CreneauDef } from "@/domain/creneaux";
import type { Acteur } from "../acteur";
import { tracer } from "../audit";
import { ErreurMetier, exiger } from "../erreurs";

export type Site = typeof sites.$inferSelect;
export type Creneau = typeof creneaux.$inferSelect;

export async function listerSites(db: Db, opts: { actifsSeulement?: boolean } = {}): Promise<Site[]> {
  const q = db.select().from(sites);
  const res = opts.actifsSeulement ? await q.where(eq(sites.statut, "actif")).orderBy(asc(sites.ordre)) : await q.orderBy(asc(sites.ordre));
  return res;
}

export async function lireSite(db: Db, id: string): Promise<Site> {
  const [s] = await db.select().from(sites).where(eq(sites.id, id));
  exiger(s, "Site introuvable");
  return s;
}

export async function modifierSite(
  db: Db,
  id: string,
  v: { modeOuverture: (typeof MODES_OUVERTURE)[number]; statut: (typeof STATUTS_SITE)[number] },
  acteur: Acteur,
) {
  exiger(MODES_OUVERTURE.includes(v.modeOuverture), "Mode d'ouverture invalide");
  exiger(STATUTS_SITE.includes(v.statut), "Statut invalide");
  await db.update(sites).set(v).where(eq(sites.id, id));
  await tracer(db, acteur.id, "modifier", "site", id, v);
}

/** Magasin Loyverse d'un site : détermine les prix appliqués (ils peuvent différer d'un magasin à l'autre). */
export async function modifierMagasinSite(db: Db, id: string, magasin: string | null, acteur: Acteur) {
  await db.update(sites).set({ loyverseMagasin: magasin }).where(eq(sites.id, id));
  await tracer(db, acteur.id, "magasin_loyverse", "site", id, { magasin });
}

export async function listerCreneaux(db: Db, siteId: string): Promise<Creneau[]> {
  return db
    .select()
    .from(creneaux)
    .where(and(eq(creneaux.siteId, siteId), eq(creneaux.actif, true)))
    .orderBy(asc(creneaux.ordre), asc(creneaux.heureDebut));
}

export interface SaisieCreneau {
  id?: string;
  nom: string;
  heureDebut: string;
  heureFin: string;
  jours: number[];
}

/**
 * Remplace la grille de créneaux d'un site après contrôle des chevauchements
 * (y compris d'un jour sur l'autre). Les créneaux retirés sont désactivés, pas supprimés,
 * car des shifts passés y font référence.
 */
export async function enregistrerCreneaux(db: Db, siteId: string, saisie: SaisieCreneau[], acteur: Acteur) {
  const defs: CreneauDef[] = saisie.map((c, i) => ({
    id: c.id ?? `nouveau-${i}`,
    nom: c.nom.trim(),
    heureDebut: c.heureDebut,
    heureFin: c.heureFin,
    jours: [...new Set(c.jours)].sort(),
  }));
  const erreurs = validerCreneaux(defs);
  if (erreurs.length) throw new ErreurMetier(erreurs.join("\n"));

  const existants = await db.select().from(creneaux).where(eq(creneaux.siteId, siteId));
  const idsExistants = new Set(existants.map((c) => c.id));
  // Un créneau retiré qui porte encore des shifts planifiés à venir les rendrait orphelins (ni modifiables
  // ni retirables) : il faut d'abord les retirer du planning.
  const gardes = new Set(saisie.map((c) => c.id).filter(Boolean));
  for (const c of existants.filter((x) => x.actif && !gardes.has(x.id))) {
    const avenir = await db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.creneauId, c.id), eq(shifts.statut, "planifie"), gt(shifts.finPrevue, new Date())));
    exiger(!avenir.length, `Le créneau « ${c.nom} » a encore ${avenir.length} shift(s) planifié(s) à venir : retirez-les d'abord du planning.`);
  }
  const conserves = new Set<string>();
  await db.transaction(async (tx) => {
    for (const [i, c] of defs.entries()) {
      const valeurs = { nom: c.nom, heureDebut: c.heureDebut, heureFin: c.heureFin, jours: c.jours, ordre: i, actif: true };
      if (saisie[i].id && idsExistants.has(saisie[i].id!)) {
        conserves.add(saisie[i].id!);
        await tx.update(creneaux).set(valeurs).where(eq(creneaux.id, saisie[i].id!));
      } else {
        await tx.insert(creneaux).values({ ...valeurs, siteId });
      }
    }
    for (const c of existants) {
      if (!conserves.has(c.id) && c.actif) await tx.update(creneaux).set({ actif: false }).where(eq(creneaux.id, c.id));
    }
  });
  await tracer(db, acteur.id, "enregistrer_creneaux", "site", siteId, { creneaux: defs });
  return listerCreneaux(db, siteId);
}
