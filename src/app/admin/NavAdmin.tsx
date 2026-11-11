"use client";

import {
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  PackagePlus,
  RefreshCw,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export const ICONES_ADMIN = {
  tableau: LayoutDashboard,
  remontees: ClipboardCheck,
  planning: CalendarDays,
  reappro: PackagePlus,
  labo: ChefHat,
  catalogue: BookOpen,
  utilisateurs: Users,
  sites: MapPin,
  loyverse: RefreshCw,
  journal: ScrollText,
} satisfies Record<string, LucideIcon>;

export type LienAdmin = { href: string; libelle: string; icone: keyof typeof ICONES_ADMIN; direction?: boolean };

/**
 * Navigation de l'administration : barre latérale à partir de 1024 px, onglets défilants en dessous.
 * Icône et libellé toujours ensemble ; l'emplacement actif est souligné et annoncé (aria-current).
 */
export function NavAdmin({ liens }: { liens: LienAdmin[] }) {
  const chemin = usePathname();
  const actif = (href: string) => (href === "/admin" ? chemin === "/admin" : chemin.startsWith(href));
  const groupes = [liens.filter((l) => !l.direction), liens.filter((l) => l.direction)].filter((g) => g.length);
  return (
    <nav aria-label="Administration">
      {/* Écrans étroits : onglets horizontaux */}
      <ul className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 lg:hidden">
        {liens.map((l) => {
          const Icone = ICONES_ADMIN[l.icone];
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={actif(l.href) ? "page" : undefined}
                className={cx(
                  "flex min-h-12 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold",
                  actif(l.href) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icone aria-hidden className="size-4" strokeWidth={2} />
                {l.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Large écran : barre latérale */}
      <div className="sticky top-[57px] hidden max-h-[calc(100dvh-57px)] w-60 overflow-y-auto py-4 pr-2 lg:block">
        {groupes.map((g, i) => (
          <div key={i} className={cx(i > 0 && "mt-4 border-t border-border pt-4")}>
            {i > 0 && <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Direction</p>}
            <ul className="grid gap-0.5">
              {g.map((l) => {
                const Icone = ICONES_ADMIN[l.icone];
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={actif(l.href) ? "page" : undefined}
                      className={cx(
                        "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium",
                        actif(l.href) ? "bg-primary-soft font-semibold text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icone aria-hidden className="size-5 shrink-0" strokeWidth={2} />
                      {l.libelle}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
