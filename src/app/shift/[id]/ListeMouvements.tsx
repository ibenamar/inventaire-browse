"use client";

import { useTransition } from "react";
import { actionSupprimerMouvement } from "@/app/actions-shift";

export interface MouvementVue {
  id: string;
  produit: string;
  /** Quantité avec son unité, prête à afficher. */
  quantite: string;
  detail: string;
  utilisateur: string;
  heure: string;
  supprimable: boolean;
}

export function ListeMouvements({ shiftId, titre, mouvements }: { shiftId: string; titre: string; mouvements: MouvementVue[] }) {
  const [enCours, demarrer] = useTransition();
  if (!mouvements.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">{titre}</h2>
      <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
        {mouvements.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="max-w-32 shrink-0 text-right font-bold">{m.quantite}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{m.produit}</span>
              <span className="block text-xs text-muted-foreground">
                {m.detail} · {m.utilisateur} · {m.heure}
              </span>
            </span>
            {m.supprimable && (
              <button
                disabled={enCours}
                onClick={() => {
                  if (!window.confirm(`Supprimer « ${m.produit} : ${m.quantite} » ?`)) return;
                  demarrer(async () => {
                    const r = await actionSupprimerMouvement(shiftId, m.id);
                    if (!r.ok) window.alert(r.erreur);
                  });
                }}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-destructive hover:bg-destructive-soft"
              >
                Supprimer
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
