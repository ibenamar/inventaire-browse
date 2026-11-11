"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "./ui";

export interface ColonneTri {
  libelle: string;
  /** Alignement à droite et chiffres tabulaires pour les nombres. */
  numerique?: boolean;
}

/**
 * Tableau triable : chaque en-tête est un bouton (clavier compris) ; l'ordre courant est annoncé
 * par aria-sort. Chaque ligne porte ses valeurs de tri et ses cellules déjà mises en forme.
 */
export function TableauTriable({
  colonnes,
  lignes,
  libelle,
  triInitial,
}: {
  colonnes: ColonneTri[];
  lignes: { cle: string; tri: (string | number | null)[]; cellules: ReactNode[] }[];
  libelle: string;
  triInitial?: { colonne: number; sens: "asc" | "desc" };
}) {
  const [tri, setTri] = useState(triInitial ?? null);
  const triees = tri
    ? [...lignes].sort((a, b) => {
        const x = a.tri[tri.colonne];
        const y = b.tri[tri.colonne];
        if (x === y) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr");
        return tri.sens === "asc" ? r : -r;
      })
    : lignes;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={libelle}>
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">{libelle} (cliquez un en-tête pour trier)</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            {colonnes.map((c, i) => {
              const actif = tri?.colonne === i;
              const Icone = !actif ? ArrowUpDown : tri!.sens === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.libelle}
                  scope="col"
                  aria-sort={actif ? (tri!.sens === "asc" ? "ascending" : "descending") : "none"}
                  className={cx("py-1 font-medium", c.numerique ? "text-right" : "text-left")}
                >
                  <button
                    type="button"
                    onClick={() => setTri({ colonne: i, sens: actif && tri!.sens === "desc" ? "asc" : "desc" })}
                    className={cx("inline-flex min-h-8 items-center gap-1 rounded px-1 hover:text-foreground", actif && "text-foreground")}
                  >
                    {c.libelle}
                    <Icone aria-hidden className="size-3.5" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {triees.map((l) => (
            <tr key={l.cle} className="border-t border-border">
              {l.cellules.map((cel, i) => (
                <td key={i} className={cx("py-1.5", colonnes[i].numerique && "text-right whitespace-nowrap tabular-nums")}>
                  {cel}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
