import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Fil d'Ariane des écrans de troisième niveau (fiche produit, site, utilisateur). */
export function FilAriane({ etapes }: { etapes: { libelle: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-2 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        {etapes.map((e, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="size-4" />}
            {e.href ? (
              <Link href={e.href} className="rounded font-medium text-primary hover:underline">
                {e.libelle}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {e.libelle}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
