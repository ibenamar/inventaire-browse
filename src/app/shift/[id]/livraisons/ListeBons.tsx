"use client";

import { useTransition } from "react";
import { actionAnnulerBon, actionExpedierBon } from "@/app/actions-shift";
import { Bouton, Pastille } from "@/components/ui";
import type { StatutBon, Unite } from "@/db/schema";
import { libelleQuantite } from "@/domain/unites";

export interface BonListe {
  id: string;
  numero: number;
  statut: StatutBon;
  destination: string;
  quand: string;
  commentaire: string | null;
  commentaireReception: string | null;
  lignes: { produitId: string; nom: string; unite: Unite; partsParGateau: number | null; quantiteExpediee: number; quantiteRecue: number | null }[];
  ecarts: number;
  annulable: boolean;
}

const STATUTS: Record<StatutBon, { l: string; ton: "neutre" | "orange" | "bleu" | "vert" | "rouge" }> = {
  prepare: { l: "Préparé", ton: "orange" },
  expedie: { l: "Expédié", ton: "bleu" },
  recu: { l: "Reçu", ton: "vert" },
  annule: { l: "Annulé", ton: "neutre" },
};

export function ListeBons({ shiftId, titre, bons }: { shiftId: string; titre: string; bons: BonListe[] }) {
  const [enCours, demarrer] = useTransition();
  if (!bons.length) return null;
  const agir = (f: () => Promise<{ ok: boolean; erreur?: string }>) =>
    demarrer(async () => {
      const r = await f();
      if (!r.ok) window.alert(r.erreur);
    });
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">{titre}</h2>
      <div className="grid gap-3">
        {bons.map((b) => (
          <div key={b.id} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                Bon n° {b.numero} → {b.destination}
              </span>
              <Pastille ton={STATUTS[b.statut].ton}>{STATUTS[b.statut].l}</Pastille>
              {b.ecarts > 0 && <Pastille ton="rouge">{b.ecarts} écart(s) à la réception</Pastille>}
              <span className="ml-auto text-sm text-stone-500">{b.quand}</span>
            </div>
            <ul className="mt-2 text-sm">
              {b.lignes.map((l) => (
                <li key={l.produitId} className="flex justify-between gap-2 border-t border-stone-100 py-1">
                  <span>{l.nom}</span>
                  <span className="tabular-nums">
                    {libelleQuantite(l.quantiteExpediee, l)}
                    {l.quantiteRecue !== null && l.quantiteRecue !== l.quantiteExpediee && (
                      <span className="font-semibold text-red-700"> · reçu {libelleQuantite(l.quantiteRecue, l)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {(b.commentaire || b.commentaireReception) && (
              <p className="mt-1 text-xs text-stone-500">{[b.commentaire, b.commentaireReception && `Réception : ${b.commentaireReception}`].filter(Boolean).join(" · ")}</p>
            )}
            {(b.statut === "prepare" || b.annulable) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {b.statut === "prepare" && (
                  <Bouton
                    disabled={enCours}
                    onClick={() => {
                      if (window.confirm(`Expédier le bon n° ${b.numero} à ${b.destination} ? Les produits sortent de votre stock maintenant.`))
                        agir(() => actionExpedierBon(shiftId, b.id));
                    }}
                  >
                    Expédier maintenant
                  </Bouton>
                )}
                {b.annulable && (
                  <Bouton
                    variante="secondaire"
                    disabled={enCours}
                    onClick={() => {
                      if (window.confirm(`Annuler le bon n° ${b.numero} ?${b.statut === "expedie" ? " La sortie de stock sera retirée." : ""}`))
                        agir(() => actionAnnulerBon(shiftId, b.id));
                    }}
                  >
                    Annuler le bon
                  </Bouton>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
