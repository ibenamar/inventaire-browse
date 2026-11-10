import Link from "next/link";
import { startTransition, type ComponentProps, type FormEvent, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const variantes = {
  primaire: "bg-marque-700 text-white hover:bg-marque-900 disabled:bg-stone-300",
  secondaire: "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 disabled:text-stone-400",
  danger: "bg-red-700 text-white hover:bg-red-800 disabled:bg-stone-300",
  discret: "text-marque-700 hover:bg-marque-50",
};

export function classesBouton(variante: keyof typeof variantes = "primaire", grand = false) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed",
    grand ? "min-h-14 px-6 text-lg" : "min-h-11 px-4 text-base",
    variantes[variante],
  );
}

export function Bouton({
  variante = "primaire",
  grand,
  className,
  ...p
}: ComponentProps<"button"> & { variante?: keyof typeof variantes; grand?: boolean }) {
  return <button className={cx(classesBouton(variante, grand), className)} {...p} />;
}

export function LienBouton({
  variante = "primaire",
  grand,
  className,
  ...p
}: ComponentProps<typeof Link> & { variante?: keyof typeof variantes; grand?: boolean }) {
  return <Link className={cx(classesBouton(variante, grand), className)} {...p} />;
}

export function Carte({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200", className)} {...p} />;
}

const tons = {
  neutre: "bg-stone-100 text-stone-700",
  vert: "bg-emerald-100 text-emerald-800",
  orange: "bg-amber-100 text-amber-800",
  rouge: "bg-red-100 text-red-800",
  bleu: "bg-sky-100 text-sky-800",
  marque: "bg-marque-100 text-marque-900",
};

export function Pastille({ ton = "neutre", children }: { ton?: keyof typeof tons; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tons[ton])}>
      {children}
    </span>
  );
}

export function Titre({ children, sousTitre, actions }: { children: ReactNode; sousTitre?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-stone-900">{children}</h1>
        {sousTitre && <p className="mt-0.5 text-stone-600">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Message({ ton = "info", children }: { ton?: "info" | "erreur" | "succes" | "alerte"; children: ReactNode }) {
  const c = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    erreur: "bg-red-50 text-red-900 ring-red-200",
    succes: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    alerte: "bg-amber-50 text-amber-900 ring-amber-200",
  }[ton];
  return <div className={cx("rounded-xl px-4 py-3 text-sm whitespace-pre-line ring-1", c)} role={ton === "erreur" ? "alert" : undefined}>{children}</div>;
}

export function Champ({ label, aide, children }: { label: string; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-700">{label}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-stone-500">{aide}</span>}
    </label>
  );
}

export const classesChamp =
  "block w-full rounded-xl border-0 bg-white px-3 py-2.5 text-base ring-1 ring-stone-300 focus:ring-2 focus:ring-marque-500 focus:outline-none";

export function Kpi({ label, valeur, ton }: { label: string; valeur: ReactNode; ton?: "rouge" | "vert" }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className={cx("mt-1 text-xl font-bold", ton === "rouge" && "text-red-700", ton === "vert" && "text-emerald-700")}>{valeur}</div>
    </div>
  );
}

export const formatMad = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

export const formatSigne = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n > 0 ? `+${n}` : `${n}`);

/**
 * Soumission d'un formulaire à une action serveur SANS la remise à zéro automatique de React 19
 * (avec `<form action>`, les champs sont vidés même quand l'enregistrement est refusé) :
 * `<form onSubmit={soumettre(action)}>`. La saisie reste en place pour être corrigée.
 */
export function soumettre(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}
