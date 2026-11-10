"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { classesChamp } from "@/components/ui";
import { actionMagasinSite } from "../actions";

export function MagasinsSites({ sites, magasins }: { sites: { id: string; nom: string; magasin: string | null }[]; magasins: string[] }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const options = [...new Set([...magasins, ...sites.map((s) => s.magasin).filter((m): m is string => Boolean(m))])].sort();
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sites.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className="w-44 shrink-0 font-semibold">{s.nom}</span>
          <select
            aria-label={`Magasin Loyverse de ${s.nom}`}
            disabled={enCours}
            defaultValue={s.magasin ?? ""}
            onChange={(e) =>
              demarrer(async () => {
                const r = await actionMagasinSite(s.id, e.target.value);
                if (!r.ok) window.alert(r.erreur);
                router.refresh();
              })
            }
            className={classesChamp}
          >
            <option value="">Aucun (prix par défaut)</option>
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
