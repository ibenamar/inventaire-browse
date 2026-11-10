import { cache } from "react";
import { heureLocale } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { exigerSession } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";
import { ErreurMetier } from "@/server/erreurs";
import { detailShift } from "@/server/services/shifts";
import { derniereSynchro } from "@/server/services/ventes-loyverse";
import type { DerniereSynchro } from "@/components/VentesLoyverse";
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
  const x = await derniereSynchro(db, id);
  const synchro: DerniereSynchro | null = x
    ? {
        horodatage: x.horodatage.toISOString(),
        heure: heureLocale(x.horodatage),
        statut: x.statut,
        nbRecus: x.nbRecus,
        montant: x.montant,
        // Le détail technique (base de données) est réservé à la direction.
        erreur: x.erreur && x.erreur.startsWith("Erreur technique") && session.acteur.role !== "direction" ? "Erreur technique pendant l'import (détail visible par la direction)." : x.erreur,
        nonReconnus: (x.nonReconnus as DerniereSynchro["nonReconnus"] | null) ?? [],
      }
    : null;
  const loyverseConfigure = Boolean(process.env.LOYVERSE_TOKEN?.trim());
  // Après clôture, un manager peut corriger le shift (chaque modification est tracée) tant qu'il n'est pas validé.
  const modeCorrection = d.shift.statut === "cloture" && estEncadrant(session.acteur);
  const peutSaisir = d.shift.statut === "ouvert" || modeCorrection;
  return { session, d, estResponsable, synchro, loyverseConfigure, modeCorrection, peutSaisir };
});
