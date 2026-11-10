import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { bonsLivraison, shifts, sites } from "@/db/schema";
import { creneauxDuJour, intervalleCreneau } from "@/domain/creneaux";
import { TOLERANCE_CLOTURE_MIN } from "@/domain/remontees";
import { ajouterJours, formatLocal, heureLocale, journeeLocale, libelleJournee } from "@/domain/temps";
import { ecartsImportants } from "@/domain/vraisemblance";
import { lignesCalculees } from "./shifts";
import { listerCreneaux } from "./sites";

/**
 * Alertes d'exploitation pour les encadrants : ce qui demande une action maintenant.
 * Calculées à la demande (pas d'envoi) et affichées sur le tableau de bord et l'accueil.
 */
export type TypeAlerte = "non_cloture" | "manquant" | "non_planifie" | "ecart" | "rupture" | "livraison_en_attente";

export interface Alerte {
  type: TypeAlerte;
  gravite: "haute" | "moyenne";
  site: string;
  message: string;
  lien: string | null;
}

/** Délai au-delà duquel un bon expédié non réceptionné est signalé. */
export const DELAI_LIVRAISON_H = 6;

export async function alertesExploitation(db: Db, siteIds: string[], maintenant: Date): Promise<Alerte[]> {
  if (!siteIds.length) return [];
  const res: Alerte[] = [];
  const nomsSites = new Map((await db.select({ id: sites.id, nom: sites.nom }).from(sites)).map((s) => [s.id, s.nom]));
  const limite = new Date(maintenant.getTime() - TOLERANCE_CLOTURE_MIN * 60_000);
  const aujourdhui = journeeLocale(maintenant);

  // Shifts ouverts au-delà de leur fin (+ tolérance), et shifts planifiés jamais ouverts (dernières 24 h).
  const enRetard = await db
    .select()
    .from(shifts)
    .where(and(inArray(shifts.siteId, siteIds), inArray(shifts.statut, ["ouvert", "planifie"]), lte(shifts.finPrevue, limite), gte(shifts.finPrevue, new Date(maintenant.getTime() - 48 * 3600_000))));
  for (const s of enRetard) {
    const quand = `${s.nomCreneau} du ${libelleJournee(s.journee)}`;
    res.push(
      s.statut === "ouvert"
        ? { type: "non_cloture", gravite: "haute", site: nomsSites.get(s.siteId)!, message: `${quand} : toujours ouvert, fin prévue à ${heureLocale(s.finPrevue)}`, lien: `/shift/${s.id}/cloture` }
        : { type: "manquant", gravite: "haute", site: nomsSites.get(s.siteId)!, message: `${quand} : jamais ouvert (remontée manquante)`, lien: `/admin/remontees` },
    );
  }

  // Créneaux d'aujourd'hui et de demain sans shift planifié (pas de responsable désigné).
  for (const siteId of siteIds) {
    const cr = await listerCreneaux(db, siteId);
    for (const journee of [aujourdhui, ajouterJours(aujourdhui, 1)]) {
      const existants = new Set(
        (await db.select({ c: shifts.creneauId }).from(shifts).where(and(eq(shifts.siteId, siteId), eq(shifts.journee, journee)))).map((x) => x.c),
      );
      for (const c of creneauxDuJour(cr, journee)) {
        const { fin } = intervalleCreneau(journee, c);
        if (fin <= maintenant || existants.has(c.id)) continue;
        res.push({
          type: "non_planifie",
          gravite: journee === aujourdhui ? "haute" : "moyenne",
          site: nomsSites.get(siteId)!,
          message: `${c.nom} du ${libelleJournee(journee)} : aucun responsable d'inventaire désigné`,
          lien: `/admin/planning?site=${siteId}&date=${journee}`,
        });
      }
    }
  }

  // Dernier shift clôturé de chaque site : écarts importants et ruptures.
  for (const siteId of siteIds) {
    const [dernier] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.siteId, siteId), inArray(shifts.statut, ["cloture", "valide"])))
      .orderBy(desc(shifts.debutPrevu))
      .limit(1);
    if (!dernier || maintenant.getTime() - (dernier.clotureLe ?? dernier.finPrevue).getTime() > 48 * 3600_000) continue;
    const lignes = await lignesCalculees(db, dernier.id);
    const valeur = lignes.reduce((t, l) => t + (l.calcul.valeurEcartVente ?? 0), 0);
    const importants = ecartsImportants(lignes.map((l) => ({ nom: l.nom, ecart: l.calcul.ecart })), valeur);
    if (importants.length)
      res.push({
        type: "ecart",
        gravite: "haute",
        site: nomsSites.get(siteId)!,
        message: `${dernier.nomCreneau} du ${libelleJournee(dernier.journee)} : écart important — ${importants.join(", ")}`,
        lien: `/shift/${dernier.id}/cloture`,
      });
    const ruptures = lignes.filter((l) => l.suiviStock && l.nature === "produit" && l.stockReelFin === 0 && l.stockMinimum !== null && l.stockMinimum > 0);
    if (ruptures.length)
      res.push({
        type: "rupture",
        gravite: "moyenne",
        site: nomsSites.get(siteId)!,
        message: `Rupture au dernier comptage : ${ruptures.map((l) => l.nom).join(", ")}`,
        lien: `/admin/reappro`,
      });
  }

  // Bons expédiés vers ces sites, non réceptionnés après plusieurs heures.
  const vieux = await db
    .select()
    .from(bonsLivraison)
    .where(and(inArray(bonsLivraison.siteDestinationId, siteIds), eq(bonsLivraison.statut, "expedie"), lte(bonsLivraison.expedieLe, new Date(maintenant.getTime() - DELAI_LIVRAISON_H * 3600_000))));
  for (const b of vieux)
    res.push({
      type: "livraison_en_attente",
      gravite: "moyenne",
      site: nomsSites.get(b.siteDestinationId)!,
      message: `Bon n° ${b.numero} expédié le ${formatLocal(b.expedieLe!)} et toujours pas réceptionné`,
      lien: null,
    });

  return res.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "haute" ? -1 : 1));
}
