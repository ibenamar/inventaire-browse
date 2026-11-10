import Link from "next/link";
import type { Alerte } from "@/server/services/alertes";
import { cx } from "./ui";

const LIBELLES: Record<Alerte["type"], string> = {
  non_cloture: "Non clôturé",
  manquant: "Remontée manquante",
  non_planifie: "Sans responsable",
  ecart: "Écart important",
  rupture: "Rupture",
  livraison_en_attente: "Livraison en attente",
};

/** Alertes d'exploitation à traiter, les plus urgentes d'abord. */
export function ListeAlertes({ alertes, max, afficherSite = true }: { alertes: Alerte[]; max?: number; afficherSite?: boolean }) {
  if (!alertes.length) return null;
  const visibles = max ? alertes.slice(0, max) : alertes;
  return (
    <section className="rounded-2xl bg-white p-4 ring-2 ring-amber-300" aria-label="Alertes à traiter">
      <h2 className="mb-2 font-semibold">
        À traiter <span className="text-stone-500">({alertes.length})</span>
      </h2>
      <ul className="divide-y divide-stone-100 text-sm">
        {visibles.map((a, i) => {
          const contenu = (
            <>
              <span
                className={cx(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                  a.gravite === "haute" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900",
                )}
              >
                {LIBELLES[a.type]}
              </span>
              <span className="min-w-0">
                {afficherSite && <strong>{a.site} · </strong>}
                {a.message}
              </span>
            </>
          );
          return (
            <li key={i}>
              {a.lien ? (
                <Link href={a.lien} className="flex items-start gap-2 py-2 hover:underline">
                  {contenu}
                </Link>
              ) : (
                <div className="flex items-start gap-2 py-2">{contenu}</div>
              )}
            </li>
          );
        })}
      </ul>
      {max && alertes.length > max && (
        <Link href="/admin" className="mt-1 inline-block text-sm font-semibold text-marque-700">
          Voir les {alertes.length} alertes
        </Link>
      )}
    </section>
  );
}
