"use client";

import { useTransition } from "react";
import { actionRetablirArticle } from "../actions";

/** Articles ignorés : rétablir celui qui l'a été par erreur (ses ventes seront de nouveau importables). */
export function ArticlesIgnores({ articles }: { articles: { id: string; nom: string; categorie: string | null; sku: string | null }[] }) {
  const [enCours, demarrer] = useTransition();
  if (!articles.length) return <p className="text-sm text-muted-foreground">Aucun article ignoré.</p>;
  return (
    <ul className="max-h-80 divide-y divide-border overflow-y-auto text-sm">
      {articles.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
          <span className="min-w-0">
            <span className="font-medium">{a.nom}</span>
            <span className="text-muted-foreground">{[a.categorie, a.sku].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
          </span>
          <button
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const r = await actionRetablirArticle(a.id);
                if (!r.ok) window.alert(r.erreur);
              })
            }
            className="shrink-0 rounded-lg px-2 py-1 font-semibold text-primary hover:bg-primary-soft"
          >
            Rétablir
          </button>
        </li>
      ))}
    </ul>
  );
}
