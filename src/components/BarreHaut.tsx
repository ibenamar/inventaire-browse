import Link from "next/link";
import { changerSite, deconnexion } from "@/app/login/actions";
import type { Session } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";

export function BarreHaut({ session, nomSite }: { session: Session; nomSite: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight">{nomSite}</span>
            <span className="block truncate text-xs text-stone-500">{session.acteur.nom}</span>
          </span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {estEncadrant(session.acteur) && (
            <Link href="/admin" className="rounded-lg px-3 py-2 font-semibold text-marque-700 hover:bg-marque-50">
              Administration
            </Link>
          )}
          <Link href="/aide" className="rounded-lg px-3 py-2 font-semibold text-stone-600 hover:bg-stone-100">
            Aide
          </Link>
          {/* Visible en permanence : sur une tablette partagée, chacun se déconnecte avant de passer la main. */}
          <form action={deconnexion}>
            <button className="rounded-lg px-3 py-2 font-semibold text-stone-600 hover:bg-stone-100">Quitter</button>
          </form>
          <details className="relative">
            <summary aria-label="Plus d'options" className="cursor-pointer list-none rounded-lg px-3 py-2 font-semibold text-stone-600 hover:bg-stone-100">
              ⋯
            </summary>
            <div className="absolute right-0 mt-1 w-48 rounded-xl bg-white p-1 shadow-lg ring-1 ring-stone-200">
              <form action={deconnexion}>
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100">Se déconnecter</button>
              </form>
              <form action={changerSite}>
                <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100">Changer de site</button>
              </form>
            </div>
          </details>
        </nav>
      </div>
      {session.pinFaible && (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-900">
          Votre code PIN a moins de 6 chiffres : demandez-en un nouveau à la direction (Administration › Utilisateurs).
        </p>
      )}
    </header>
  );
}
