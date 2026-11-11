import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { startTransition, type ComponentProps, type FormEvent, type ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Variantes de bouton : un seul CTA principal par écran (« primaire »), les autres actions sont
 * subordonnées (« secondaire », « discret »). États survol, appui et désactivé distincts ; le
 * changement d'état est immédiat (aucune animation de couleur).
 */
const variantes = {
  primaire: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover disabled:bg-muted-strong disabled:text-muted-foreground disabled:shadow-none",
  secondaire: "bg-secondary text-secondary-foreground ring-1 ring-input hover:bg-primary-soft disabled:bg-muted disabled:text-muted-foreground",
  danger: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 disabled:bg-muted-strong disabled:text-muted-foreground",
  discret: "text-primary hover:bg-primary-soft disabled:text-muted-foreground",
};

export function classesBouton(variante: keyof typeof variantes = "primaire", grand = false) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none active:translate-y-px disabled:active:translate-y-0",
    grand ? "min-h-14 px-6 text-lg" : "min-h-11 px-4 text-base",
    variantes[variante],
  );
}

/** Bouton ; `enCours` : désactivé avec un indicateur pendant une action asynchrone. */
export function Bouton({
  variante = "primaire",
  grand,
  className,
  enCours,
  disabled,
  children,
  ...p
}: ComponentProps<"button"> & { variante?: keyof typeof variantes; grand?: boolean; enCours?: boolean }) {
  return (
    <button className={cx(classesBouton(variante, grand), className)} disabled={disabled || enCours} aria-busy={enCours || undefined} {...p}>
      {enCours && <Loader2 aria-hidden className="size-5 animate-spin" />}
      {children}
    </button>
  );
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
  return <div className={cx("rounded-2xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border", className)} {...p} />;
}

const tons = {
  neutre: "bg-muted text-foreground",
  vert: "bg-success-soft text-success",
  orange: "bg-warning-soft text-warning",
  rouge: "bg-destructive-soft text-destructive",
  bleu: "bg-info-soft text-info",
  marque: "bg-primary-soft text-primary-soft-foreground",
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
        <h1 className="text-2xl font-bold text-foreground">{children}</h1>
        {sousTitre && <p className="mt-0.5 text-muted-foreground">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tonsMessage = {
  info: { c: "bg-info-soft text-info ring-info/30", Icone: Info, libelle: "Information" },
  erreur: { c: "bg-destructive-soft text-destructive ring-destructive/30", Icone: XCircle, libelle: "Erreur" },
  succes: { c: "bg-success-soft text-success ring-success/40", Icone: CheckCircle2, libelle: "Réussi" },
  alerte: { c: "bg-warning-soft text-warning ring-warning/40", Icone: AlertTriangle, libelle: "Attention" },
};

/**
 * Message : l'icône double la couleur (jamais la couleur seule). Une erreur est annoncée et reçoit
 * le focus (le lecteur d'écran et le clavier y arrivent directement) ; un succès est annoncé poliment.
 */
export function Message({
  ton = "info",
  children,
  focaliser = ton === "erreur",
}: {
  ton?: "info" | "erreur" | "succes" | "alerte";
  children: ReactNode;
  focaliser?: boolean;
}) {
  const { c, Icone, libelle } = tonsMessage[ton];
  return (
    <div
      className={cx("apparition flex items-start gap-2 rounded-xl px-4 py-3 text-sm whitespace-pre-line ring-1", c)}
      role={ton === "erreur" ? "alert" : ton === "succes" ? "status" : undefined}
      aria-live={ton === "succes" ? "polite" : undefined}
      tabIndex={focaliser ? -1 : undefined}
      autoFocus={focaliser}
    >
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      <span className="sr-only">{libelle} : </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Champ de formulaire : libellé toujours visible, champ obligatoire marqué, aide et erreur sous le
 * champ. Avec `id`, l'erreur est reliée au champ (aria-describedby) par le composant appelant.
 */
export function Champ({
  label,
  aide,
  children,
  obligatoire,
  erreur,
  id,
}: {
  label: string;
  aide?: ReactNode;
  children: ReactNode;
  obligatoire?: boolean;
  erreur?: string | null;
  id?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">
        {label}
        {obligatoire && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
        {obligatoire && <span className="sr-only"> (obligatoire)</span>}
      </span>
      {children}
      {aide && <span className="mt-1 block text-xs text-muted-foreground">{aide}</span>}
      {erreur && (
        <span id={id ? `${id}-erreur` : undefined} className="mt-1 flex items-center gap-1 text-sm font-medium text-destructive">
          <XCircle aria-hidden className="size-4 shrink-0" /> {erreur}
        </span>
      )}
    </label>
  );
}

export const classesChamp =
  "block w-full rounded-xl border-0 bg-card px-3 py-2.5 text-base text-foreground ring-1 ring-input placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:outline-none aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive disabled:bg-muted disabled:text-muted-foreground";

export function Kpi({ label, valeur, ton }: { label: string; valeur: ReactNode; ton?: "rouge" | "vert" }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cx("mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums", ton === "rouge" && "text-destructive", ton === "vert" && "text-success")}>
        {ton === "rouge" && <AlertTriangle aria-label="À surveiller" className="size-4 shrink-0" />}
        {ton === "vert" && <CheckCircle2 aria-label="Conforme" className="size-4 shrink-0" />}
        {valeur}
      </div>
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
