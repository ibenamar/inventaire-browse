"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MotifPerte, OrigineEntree } from "@/db/schema";
import { getDb } from "@/lib/db";
import { executer, type Resultat } from "@/lib/resultat";
import { ErreurMetier } from "@/server/erreurs";
import { exigerSession } from "@/lib/session";
import { importerVentesShift, type RapportVentes } from "@/server/services/ventes-loyverse";
import {
  ajouterEntrees,
  ajouterPerte,
  cloturerShift,
  creerShiftCreneauEnCours,
  forcerCloture,
  ouvrirShift,
  saisirQuantite,
  saisirVentes,
  supprimerMouvement,
  validerShift,
  type ChampQuantite,
  type SaisieEntree,
} from "@/server/services/shifts";

export async function actionOuvrirShift(shiftId: string): Promise<Resultat> {
  const { acteur } = await exigerSession();
  const r = await executer(async () => ouvrirShift(await getDb(), shiftId, acteur, new Date()));
  if (r.ok) redirect(`/shift/${shiftId}`);
  return r;
}

export async function actionCreerEtOuvrir(): Promise<Resultat> {
  const { acteur, siteId } = await exigerSession(["manager", "direction"]);
  let id = "";
  const r = await executer(async () => {
    const db = await getDb();
    id = await creerShiftCreneauEnCours(db, siteId, acteur, new Date());
    await ouvrirShift(db, id, acteur, new Date());
  });
  if (r.ok) redirect(`/shift/${id}`);
  return r;
}

export async function actionSaisirQuantite(
  shiftId: string,
  produitId: string,
  champ: ChampQuantite,
  valeur: number | null,
): Promise<Resultat> {
  const { acteur } = await exigerSession();
  return executer(async () => saisirQuantite(await getDb(), shiftId, produitId, champ, valeur, acteur, new Date()));
}

export async function actionSaisirVentes(
  shiftId: string,
  produitId: string,
  canalId: string,
  quantite: number | null,
): Promise<Resultat> {
  const { acteur } = await exigerSession();
  return executer(async () => saisirVentes(await getDb(), shiftId, produitId, canalId, quantite, acteur, new Date()));
}

export async function actionAjouterEntrees(
  shiftId: string,
  saisies: SaisieEntree[],
  origine: OrigineEntree,
  commentaire: string | null,
): Promise<Resultat> {
  const { acteur } = await exigerSession();
  const r = await executer(async () => ajouterEntrees(await getDb(), shiftId, saisies, origine, commentaire, acteur), "Réception enregistrée");
  revalidatePath(`/shift/${shiftId}`, "layout");
  return r;
}

export async function actionAjouterPerte(
  shiftId: string,
  v: { produitId: string; quantite: number; saisie: "parts" | "gateaux"; motif: MotifPerte; commentaire: string | null },
): Promise<Resultat> {
  const { acteur } = await exigerSession();
  const r = await executer(async () => ajouterPerte(await getDb(), shiftId, v, acteur), "Perte enregistrée");
  revalidatePath(`/shift/${shiftId}`, "layout");
  return r;
}

export async function actionSupprimerMouvement(shiftId: string, mouvementId: string): Promise<Resultat> {
  const { acteur } = await exigerSession();
  const r = await executer(async () => supprimerMouvement(await getDb(), mouvementId, acteur));
  revalidatePath(`/shift/${shiftId}`, "layout");
  return r;
}

/** Ventes du shift depuis Loyverse (si le jeton est configuré). */
export async function actionImporterVentes(shiftId: string): Promise<Resultat<RapportVentes>> {
  const { acteur } = await exigerSession();
  const r = await executer(async () => {
    const jeton = process.env.LOYVERSE_TOKEN;
    if (!jeton?.trim()) throw new ErreurMetier("Jeton Loyverse non configuré : saisir les ventes à la main");
    return importerVentesShift(await getDb(), shiftId, acteur, new Date(), { jeton });
  });
  revalidatePath(`/shift/${shiftId}`, "layout");
  return r;
}

export async function actionCloturer(shiftId: string, _etat: unknown, form: FormData): Promise<Resultat> {
  const { acteur } = await exigerSession();
  const maintenant = new Date();
  // Dernier import des ventes juste avant la clôture ; en cas d'échec (Loyverse injoignable), on clôture
  // avec les ventes déjà connues : l'échec reste visible dans le journal et un manager peut réimporter.
  if (process.env.LOYVERSE_TOKEN?.trim()) {
    await importerVentesShift(await getDb(), shiftId, acteur, maintenant, { jeton: process.env.LOYVERSE_TOKEN }).catch(() => undefined);
  }
  const r = await executer(async () =>
    cloturerShift(await getDb(), shiftId, acteur, maintenant, String(form.get("commentaire") ?? "") || null),
  );
  if (r.ok) {
    revalidatePath("/", "layout");
    redirect(`/shift/${shiftId}/cloture`);
  }
  return r;
}

export async function actionForcerCloture(shiftId: string, _etat: unknown, form: FormData): Promise<Resultat> {
  const { acteur } = await exigerSession(["manager", "direction"]);
  const r = await executer(async () => forcerCloture(await getDb(), shiftId, acteur, new Date(), String(form.get("motif") ?? "")));
  if (r.ok) {
    revalidatePath("/", "layout");
    redirect(`/shift/${shiftId}/cloture`);
  }
  return r;
}

export async function actionValider(shiftId: string): Promise<Resultat> {
  const { acteur } = await exigerSession(["manager", "direction"]);
  const r = await executer(async () => validerShift(await getDb(), shiftId, acteur, new Date()));
  revalidatePath(`/shift/${shiftId}`, "layout");
  return r;
}
