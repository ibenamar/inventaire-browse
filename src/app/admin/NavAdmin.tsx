"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function NavAdmin({ liens }: { liens: { href: string; libelle: string }[] }) {
  const chemin = usePathname();
  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
        {liens.map((l) => {
          const actif = l.href === "/admin" ? chemin === "/admin" : chemin.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "shrink-0 border-b-2 px-3 py-3 text-sm font-semibold",
                actif ? "border-marque-700 text-marque-900" : "border-transparent text-stone-600 hover:text-stone-900",
              )}
            >
              {l.libelle}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
