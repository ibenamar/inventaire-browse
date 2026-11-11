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
  peremption: "DLC dépassée ?",
};

/** Alertes d'exploitation à traiter, les plus urgentes d'abord. */
export function ListeAlertes({ alertes, max, afficherSite = true }: { alertes: Alerte[]; max?: number; afficherSite?: boolean }) {
  if (!alertes.length) return null;
  const visibles = max ? alertes.slice(0, max) : alertes;
  return (
    <section className="rounded-2xl bg-card p-4 ring-2 ring-warning/40" aria-label="Alertes à traiter">
      <h2 className="mb-2 font-semibold">
        À traiter <span className="text-muted-foreground">({alertes.length})</span>
      </h2>
      <ul className="divide-y divide-border text-sm">
        {visibles.map((a, i) => {
          const contenu = (
            <>
              <span
                className={cx(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                  a.gravite === "haute" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning",
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
        <Link href="/admin" className="mt-1 inline-block text-sm font-semibold text-primary">
          Voir les {alertes.length} alertes
        </Link>
      )}
    </section>
  );
}
