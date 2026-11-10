import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { bonsLivraison, creneaux, shifts, sites } from "@/db/schema";
import { creneauxDuJour, intervalleCreneau } from "@/domain/creneaux";
import { TOLERANCE_CLOTURE_MIN } from "@/domain/remontees";
import { ajouterJours, formatLocal, heureLocale, journeeLocale, libelleJournee } from "@/domain/temps";
import { ecartsImportants } from "@/domain/vraisemblance";
import { libelleQuantite } from "@/domain/unites";
import { stockPerime } from "./prevision";
import { lignesCalculeesPlusieurs } from "./shifts";


/**
 * Alertes d'exploitation pour les encadrants : ce qui demande une action maintenant.
 * Calculées à la demande (pas d'envoi) et affichées sur le tableau de bord et l'accueil.
 */
export type TypeAlerte = "non_cloture" | "manquant" | "non_planifie" | "ecart" | "rupture" | "livraison_en_attente" | "peremption";

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
        : { type: "manquant", gravite: "haute", site: nomsSites.get(s.siteId)!, message: `${quand} : jamais ouvert (remontée manquante)`, lien: `/admin/remontees?site=${s.siteId}&date=${s.journee}` },
    );
  }

  // Créneaux d'aujourd'hui et de demain sans shift planifié (pas de responsable désigné).
  // Deux requêtes pour tous les sites : créneaux actifs, shifts d'aujourd'hui et de demain.
  const demain = ajouterJours(aujourdhui, 1);
  const tousCreneaux = await db
    .select()
    .from(creneaux)
    .where(and(inArray(creneaux.siteId, siteIds), eq(creneaux.actif, true)))
    .orderBy(asc(creneaux.ordre));
  const planifies = new Set(
    (
      await db
        .select({ siteId: shifts.siteId, journee: shifts.journee, c: shifts.creneauId })
        .from(shifts)
        .where(and(inArray(shifts.siteId, siteIds), inArray(shifts.journee, [aujourdhui, demain])))
    ).map((x) => `${x.siteId}|${x.journee}|${x.c}`),
  );
  for (const siteId of siteIds) {
    const cr = tousCreneaux.filter((c) => c.siteId === siteId);
    for (const journee of [aujourdhui, demain]) {
      const existants = { has: (id: string) => planifies.has(`${siteId}|${journee}|${id}`) };
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

  // Dernier shift clôturé de chaque site (sur 48 h) : écarts importants et ruptures, calculés ensemble.
  const recents = await db
    .select()
    .from(shifts)
    .where(and(inArray(shifts.siteId, siteIds), inArray(shifts.statut, ["cloture", "valide"]), gte(shifts.finPrevue, new Date(maintenant.getTime() - 72 * 3600_000))))
    .orderBy(desc(shifts.debutPrevu));
  const derniers = siteIds
    .map((id) => recents.find((x) => x.siteId === id))
    .filter((d): d is (typeof recents)[number] => Boolean(d && maintenant.getTime() - (d.clotureLe ?? d.finPrevue).getTime() <= 48 * 3600_000));
  const lignesDerniers = await lignesCalculeesPlusieurs(db, derniers.map((d) => d.id));
  for (const dernier of derniers) {
    const siteId = dernier.siteId;
    const lignes = lignesDerniers.get(dernier.id) ?? [];
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

  // Stock probablement au-delà de sa durée de conservation (à vérifier, puis à déclarer en perte).
  for (const siteId of siteIds) {
    const perimes = await stockPerime(db, siteId, maintenant);
    const [ouvert] = perimes.length
      ? await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.siteId, siteId), eq(shifts.statut, "ouvert")))
      : [];
    if (perimes.length)
      res.push({
        type: "peremption",
        gravite: "haute",
        site: nomsSites.get(siteId)!,
        message: `Date limite probablement dépassée : ${perimes.map((p) => `${p.produit} (${libelleQuantite(p.quantite, p)}, conservation ${p.duree} j)`).join(", ")}. Vérifier et déclarer en perte.`,
        lien: ouvert ? `/shift/${ouvert.id}/pertes` : null,
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
      lien: "/admin/laboratoire",
    });

  return res.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "haute" ? -1 : 1));
}
