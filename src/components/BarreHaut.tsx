import { CircleHelp, LayoutDashboard, LogOut, MoreHorizontal, Repeat } from "lucide-react";
import Link from "next/link";
import { changerSite, deconnexion } from "@/app/login/actions";
import type { Session } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";

const classesEntree =
  "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-xs font-semibold sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm";

/** En-tête commun : site et personne, puis entrées icône + libellé (empilés sur téléphone). */
export function BarreHaut({ session, nomSite }: { session: Session; nomSite: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="mx-auto flex max-w-[90rem] items-center gap-2 px-4 py-1.5 lg:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-lg py-1" aria-label={`Accueil — ${nomSite}, ${session.acteur.nom}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="min-w-0">
            {/* Retour à la ligne plutôt que troncature : le nom du site reste lisible en entier. */}
            <span className="line-clamp-2 block text-sm leading-tight font-bold break-words" title={nomSite}>
              {nomSite}
            </span>
            <span className="block truncate text-xs text-muted-foreground" title={session.acteur.nom}>
              {session.acteur.nom}
            </span>
          </span>
        </Link>
        <nav aria-label="Menu principal" className="ml-auto flex items-center gap-0.5">
          {estEncadrant(session.acteur) && (
            <Link href="/admin" className={`${classesEntree} text-primary hover:bg-primary-soft`}>
              <LayoutDashboard aria-hidden className="size-5" />
              <span>
                Admin<span className="hidden sm:inline">istration</span>
              </span>
            </Link>
          )}
          <Link href="/aide" className={`${classesEntree} text-muted-foreground hover:bg-muted hover:text-foreground`}>
            <CircleHelp aria-hidden className="size-5" />
            Aide
          </Link>
          {/* Visible en permanence : sur une tablette partagée, chacun se déconnecte avant de passer la main. */}
          <form action={deconnexion}>
            <button className={`${classesEntree} text-muted-foreground hover:bg-muted hover:text-foreground`}>
              <LogOut aria-hidden className="size-5" />
              Quitter
            </button>
          </form>
          <details className="relative">
            <summary className={`${classesEntree} list-none text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden`}>
              <MoreHorizontal aria-hidden className="size-5" />
              Plus
            </summary>
            <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl bg-card p-1 shadow-lg ring-1 ring-border">
              <form action={changerSite}>
                <button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted">
                  <Repeat aria-hidden className="size-4" /> Changer de site
                </button>
              </form>
            </div>
          </details>
        </nav>
      </div>
      {session.pinFaible && (
        <p className="border-t border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-sm text-warning">
          Votre code PIN a moins de 6 chiffres : demandez-en un nouveau à la direction (Administration › Utilisateurs).
        </p>
      )}
    </header>
  );
}
