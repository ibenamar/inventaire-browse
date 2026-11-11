"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";

/** Filtres communs : site, vue semaine / mois, navigation dans le temps. */
export function Filtres({
  sites,
  siteId,
  tousLesSites,
  vue,
  libelle,
  precedent,
  suivant,
}: {
  sites: { id: string; nom: string }[];
  siteId: string | null;
  tousLesSites?: boolean;
  vue: "semaine" | "mois";
  libelle: string;
  precedent: string;
  suivant: string;
}) {
  const router = useRouter();
  const chemin = usePathname();
  const sp = useSearchParams();
  const url = (maj: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(maj)) p.set(k, v);
    return `${chemin}?${p}`;
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        aria-label="Site"
        value={siteId ?? ""}
        onChange={(e) => router.push(url({ site: e.target.value }))}
        className="rounded-xl bg-card px-3 py-2.5 text-base ring-1 ring-input focus:ring-2 focus:ring-primary focus:outline-none"
      >
        {tousLesSites && <option value="">Tous les sites</option>}
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </select>
      <div className="flex rounded-xl bg-muted p-1 text-sm font-semibold">
        {(["semaine", "mois"] as const).map((v) => (
          <Link key={v} href={url({ vue: v })} className={cx("rounded-lg px-3 py-1.5", vue === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
            {v === "semaine" ? "Semaine" : "Mois"}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Link href={url({ date: precedent })} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted" aria-label="Période précédente">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span className="min-w-44 text-center font-semibold first-letter:uppercase">{libelle}</span>
        <Link href={url({ date: suivant })} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted" aria-label="Période suivante">
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </div>
    </div>
  );
}
