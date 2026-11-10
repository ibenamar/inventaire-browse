"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { actionImporterVentes } from "@/app/actions-shift";
import { Bouton, formatMad, Message } from "./ui";

export interface DerniereSynchro {
  horodatage: string;
  /** Heure locale (Casablanca) déjà mise en forme côté serveur : évite un écart d'affichage à l'hydratation. */
  heure: string;
  statut: "ok" | "erreur";
  nbRecus: number;
  montant: number | null;
  erreur: string | null;
  nonReconnus: { sku: string | null; nom: string; quantite: number }[];
}

const DELAI_AUTO_MS = 2 * 60_000;

/**
 * État et déclenchement de l'import des ventes Loyverse d'un shift.
 * `auto` : import lancé à l'affichage si le dernier date de plus de 2 minutes (shift ouvert).
 */
export function VentesLoyverse({
  shiftId,
  ouvert,
  peutReimporter,
  derniere,
  auto,
  lienAdmin,
}: {
  shiftId: string;
  ouvert: boolean;
  peutReimporter: boolean;
  derniere: DerniereSynchro | null;
  auto: boolean;
  lienAdmin: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const lance = useRef(false);

  const importer = () =>
    demarrer(async () => {
      setErreur(null);
      const r = await actionImporterVentes(shiftId).catch(() => ({ ok: false as const, erreur: "Connexion perdue" }));
      if (!r.ok) setErreur(r.erreur);
      router.refresh();
    });

  useEffect(() => {
    if (!auto || !ouvert || lance.current) return;
    if (derniere && Date.now() - Date.parse(derniere.horodatage) < DELAI_AUTO_MS) return;
    lance.current = true;
    importer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, ouvert]);

  const peutImporter = ouvert || peutReimporter;
  return (
    <div className="grid gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">Ventes Loyverse</div>
          {enCours ? (
            <div className="text-stone-600">Import des tickets de caisse en cours…</div>
          ) : derniere?.statut === "ok" ? (
            <div className="text-stone-600">
              Importées à {derniere.heure} : {derniere.nbRecus} ticket(s), {formatMad(derniere.montant)} encaissés.
            </div>
          ) : derniere?.statut === "erreur" ? (
            <div className="text-red-700">Dernier import en échec à {derniere.heure} : {derniere.erreur}</div>
          ) : (
            <div className="text-stone-600">Pas encore importées.</div>
          )}
        </div>
        {peutImporter && (
          <Bouton variante="secondaire" disabled={enCours} onClick={importer}>
            {ouvert ? "Importer maintenant" : "Réimporter"}
          </Bouton>
        )}
      </div>
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {derniere?.statut === "ok" && derniere.nonReconnus.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-800">
            {derniere.nonReconnus.length} article(s) vendu(s) non rattaché(s) à un produit : leurs ventes ne sont pas comptées
          </summary>
          <p className="mt-1 text-stone-600">
            {derniere.nonReconnus.map((x) => `${x.nom} ×${x.quantite}`).join(" · ")}
          </p>
          {lienAdmin && (
            <Link href="/admin/loyverse" className="mt-1 inline-block font-semibold text-marque-700 underline">
              Rattacher ou ignorer ces articles
            </Link>
          )}
        </details>
      )}
    </div>
  );
}
