import { inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { lignesShift, sites } from "@/db/schema";
import { calculerLigne } from "@/domain/calculs";
import { statutRemontee, type StatutRemontee } from "@/domain/remontees";
import type { Journee } from "@/domain/temps";
import { agregatsMouvements } from "./shifts";
import { shiftsDePeriode, type ShiftPlanifie } from "./planning";

export interface LigneRemontee extends ShiftPlanifie {
  site: string;
  statutRemontee: StatutRemontee;
  produitsAvecEcart: number | null;
  valeurEcartsVente: number | null;
  valeurPertesVente: number | null;
}

export interface BilanResponsable {
  responsableId: string | null;
  responsable: string;
  planifies: number;
  aLHeure: number;
  enRetard: number;
  manquants: number;
  tauxALHeure: number | null;
  valeurEcartsVente: number;
  valeurPertesVente: number;
}

/** Suivi des remontées d'inventaire sur une période, et bilan par responsable. */
export async function suiviRemontees(
  db: Db,
  filtre: { siteId?: string; du: Journee; au: Journee },
  maintenant: Date,
): Promise<{ shifts: LigneRemontee[]; parResponsable: BilanResponsable[] }> {
  const sh = await shiftsDePeriode(db, filtre);
  const nomsSites = new Map((await db.select().from(sites)).map((s) => [s.id, s.nom]));
  const clos = sh.filter((s) => s.statut === "cloture" || s.statut === "valide").map((s) => s.id);
  const lignes = clos.length ? await db.select().from(lignesShift).where(inArray(lignesShift.shiftId, clos)) : [];
  const ag = await agregatsMouvements(db, clos);

  const parShift = new Map<string, { ecarts: number; valeur: number; pertes: number }>();
  for (const l of lignes) {
    const a = ag.get(`${l.shiftId}:${l.produitId}`);
    const c = calculerLigne({ ...l, entrees: a?.entrees ?? 0, pertes: a?.pertes ?? 0 });
    const t = parShift.get(l.shiftId) ?? { ecarts: 0, valeur: 0, pertes: 0 };
    if (c.ecart) t.ecarts++;
    t.valeur += c.valeurEcartVente ?? 0;
    t.pertes += c.valeurPertesVente ?? 0;
    parShift.set(l.shiftId, t);
  }

  const res: LigneRemontee[] = sh.map((s) => {
    const t = parShift.get(s.id);
    return {
      ...s,
      site: nomsSites.get(s.siteId) ?? "",
      statutRemontee: statutRemontee(s, maintenant),
      produitsAvecEcart: t ? t.ecarts : null,
      valeurEcartsVente: t ? Math.round(t.valeur * 100) / 100 : null,
      valeurPertesVente: t ? Math.round(t.pertes * 100) / 100 : null,
    };
  });

  const bilans = new Map<string, BilanResponsable>();
  for (const r of res) {
    if (r.statutRemontee === "a_venir" || r.statutRemontee === "en_cours") continue;
    const cle = r.responsableId ?? "-";
    const b = bilans.get(cle) ?? {
      responsableId: r.responsableId,
      responsable: r.responsable ?? "Non désigné",
      planifies: 0,
      aLHeure: 0,
      enRetard: 0,
      manquants: 0,
      tauxALHeure: null,
      valeurEcartsVente: 0,
      valeurPertesVente: 0,
    };
    b.planifies++;
    if (r.statutRemontee === "a_l_heure") b.aLHeure++;
    if (r.statutRemontee === "en_retard") b.enRetard++;
    if (r.statutRemontee === "manquant") b.manquants++;
    b.valeurEcartsVente += r.valeurEcartsVente ?? 0;
    b.valeurPertesVente += r.valeurPertesVente ?? 0;
    bilans.set(cle, b);
  }
  const parResponsable = [...bilans.values()]
    .map((b) => ({
      ...b,
      tauxALHeure: b.planifies ? Math.round((b.aLHeure / b.planifies) * 100) : null,
      valeurEcartsVente: Math.round(b.valeurEcartsVente * 100) / 100,
      valeurPertesVente: Math.round(b.valeurPertesVente * 100) / 100,
    }))
    .sort((a, b) => a.responsable.localeCompare(b.responsable, "fr"));
  return { shifts: res, parResponsable };
}

