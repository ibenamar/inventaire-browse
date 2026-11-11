"use client";

import { Check, Loader2, Minus, Plus, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { actionSaisirQuantite, actionSaisirVentes } from "@/app/actions-shift";
import type { Unite } from "@/db/schema";
import { formatQuantite, lireQuantite, UNITE_PLURIEL } from "@/domain/unites";
import { estQuantiteInhabituelle } from "@/domain/vraisemblance";
import type { ChampQuantite } from "@/server/services/shifts";
import { PhotoProduit } from "./PhotoProduit";
import { cx } from "./ui";

export interface ProduitGrille {
  produitId: string;
  nom: string;
  categorie: string;
  unite: Unite;
  partsParGateau: number | null;
  photoId: string | null;
  valeur: number | null;
  aide?: string | null;
  /** Comptage en gâteaux entiers (laboratoire) : le stock reste enregistré en parts. */
  parGateau?: number | null;
}

const DECIMALES: Unite[] = ["kg", "litre"];
type Etat = "ok" | "en_cours" | "erreur";

/**
 * Grille de saisie tactile : une carte par produit (photo, nom, unité), boutons − / +,
 * enregistrement automatique de chaque valeur. `nullable` : une case vide signifie « pas encore compté ».
 */
export function GrilleQuantites({
  shiftId,
  champ,
  canalId,
  produits,
  nullable = true,
  libelleProgression = "comptés",
  lectureSeule = false,
}: {
  shiftId: string;
  /** « ventes » : ventes du canal `canalId` (sur place, Glovo…). */
  champ: ChampQuantite | "ventes";
  canalId?: string;
  produits: ProduitGrille[];
  nullable?: boolean;
  libelleProgression?: string;
  /** Affichage seul (ex. ventes importées de Loyverse : une saisie serait écrasée au prochain import). */
  lectureSeule?: boolean;
}) {
  const [valeurs, setValeurs] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(produits.map((p) => [p.produitId, p.valeur])),
  );
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [restants, setRestants] = useState(false);
  // Texte en cours de frappe (« 1, » avant « 1,5 ») : la valeur enregistrée est relue à chaque frappe.
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [alertes, setAlertes] = useState<Record<string, string | null>>({});
  const minuteurs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const enAttente = Object.values(etats).filter((e) => e === "en_cours").length;
  const enErreur = Object.values(etats).filter((e) => e === "erreur").length;
  // Fermer ou recharger la page pendant un envoi ferait perdre la saisie : on prévient.
  useEffect(() => {
    if (!enAttente) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [enAttente]);

  const categories = useMemo(() => [...new Set(produits.map((p) => p.categorie))], [produits]);
  const faits = produits.filter((p) => valeurs[p.produitId] !== null).length;

  const enregistrer = (produitId: string, v: number | null) => {
    setValeurs((x) => ({ ...x, [produitId]: v }));
    setEtats((x) => ({ ...x, [produitId]: "en_cours" }));
    clearTimeout(minuteurs.current[produitId]);
    minuteurs.current[produitId] = setTimeout(async () => {
      const envoyer = () =>
        (champ === "ventes"
          ? actionSaisirVentes(shiftId, produitId, canalId!, v)
          : actionSaisirQuantite(shiftId, produitId, champ, v)
        ).catch(() => ({
          ok: false as const,
          erreur: "Connexion perdue : la valeur n'a pas été enregistrée. Ressaisissez-la.",
          reseau: true,
        }));
      let r = await envoyer();
      // Une coupure réseau brève ne doit pas faire perdre une saisie : une nouvelle tentative.
      if (!r.ok && "reseau" in r) {
        await new Promise((ok) => setTimeout(ok, 1500));
        r = await envoyer();
      }
      setEtats((x) => {
        const n = { ...x, [produitId]: r.ok ? ("ok" as const) : ("erreur" as const) };
        // Plus aucune valeur en échec : le message d'erreur disparaît.
        if (!Object.values(n).includes("erreur")) setErreur(null);
        return n;
      });
      if (!r.ok) setErreur(r.erreur);
    }, 500);
  };

  const filtre = recherche.trim().toLowerCase();
  const visibles = produits.filter(
    (p) =>
      (!categorie || p.categorie === categorie) &&
      (!filtre || p.nom.toLowerCase().includes(filtre)) &&
      (!restants || valeurs[p.produitId] === null),
  );

  return (
    <div>
      <div className="sticky top-[57px] z-10 -mx-4 mb-3 border-b border-border bg-background px-4 pt-1 pb-2">
        {nullable && (
          <div className="mb-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>
                {faits} / {produits.length} {libelleProgression}
              </span>
              <span className={cx("inline-flex items-center gap-1", enErreur ? "text-destructive" : enAttente ? "text-muted-foreground" : "text-success")} aria-live="polite">
                {enErreur ? (
                  <XCircle aria-hidden className="size-4" />
                ) : enAttente ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : faits === produits.length || Object.keys(etats).length ? (
                  <Check aria-hidden className="size-4" strokeWidth={2.5} />
                ) : null}
                {enErreur
                  ? `${enErreur} valeur${enErreur > 1 ? "s" : ""} non enregistrée${enErreur > 1 ? "s" : ""}`
                  : enAttente
                    ? "Enregistrement…"
                    : faits === produits.length
                      ? "Terminé"
                      : Object.keys(etats).length
                        ? "Tout est enregistré"
                        : ""}
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-muted-strong"
              role="progressbar"
              aria-label={`Produits ${libelleProgression}`}
              aria-valuemin={0}
              aria-valuemax={produits.length}
              aria-valuenow={faits}
            >
              {/* Animation par transform uniquement (pas de largeur animée). */}
              <div
                className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-out"
                style={{ transform: `scaleX(${faits / Math.max(1, produits.length)})` }}
              />
            </div>
          </div>
        )}
        {!nullable && (
          <div className={cx("mb-1 h-5 text-right text-sm font-semibold", enErreur ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
            {enErreur ? `${enErreur} valeur(s) non enregistrée(s)` : enAttente ? "Enregistrement…" : Object.keys(etats).length ? "Tout est enregistré" : ""}
          </div>
        )}
        <label htmlFor={`recherche-${champ}`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Rechercher un produit
        </label>
        <div className="flex gap-2">
          <input
            id={`recherche-${champ}`}
            type="search"
            autoComplete="off"
            placeholder="Nom du produit"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 ring-1 ring-input"
          />
          {nullable && (
            <button
              onClick={() => setRestants((r) => !r)}
              className={cx("shrink-0 rounded-xl px-3 text-sm font-semibold ring-1", restants ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-input")}
            >
              Restants
            </button>
          )}
        </div>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "toutes"}
              onClick={() => setCategorie(c)}
              className={cx(
                "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1",
                categorie === c ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground ring-input",
              )}
            >
              {c ?? "Tout"}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl bg-destructive-soft px-4 py-3 text-sm text-destructive ring-1 ring-destructive/30" role="alert">
          <span>{erreur}</span>
          <button onClick={() => setErreur(null)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-destructive/10" aria-label="Fermer le message">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visibles.map((p) => {
          const v = valeurs[p.produitId];
          const e = etats[p.produitId];
          const g = p.parGateau ?? null;
          const decimales = DECIMALES.includes(p.unite) || g !== null;
          // Valeur affichée dans l'unité de comptage (gâteaux au labo), enregistrée dans l'unité de stock.
          const affiche = v === null ? null : g ? Math.round((v / g) * 1000) / 1000 : v;
          const versStock = (x: number) => (g ? Math.round(x * g) : x);
          const pas = 1;
          return (
            <div
              key={p.produitId}
              className={cx(
                "overflow-hidden rounded-2xl bg-card shadow-sm ring-1",
                e === "erreur" ? "ring-2 ring-destructive" : v !== null && nullable ? "ring-success/40" : "ring-border",
              )}
            >
              <div className="relative">
                <PhotoProduit photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
                {v !== null && nullable && e !== "erreur" && (
                  <span className="absolute top-2 right-2 rounded-full bg-success px-2 py-0.5 text-xs font-bold text-success-foreground">
                    {e === "en_cours" ? <Loader2 aria-label="Enregistrement" className="size-3.5 animate-spin" /> : <Check aria-label="Enregistré" className="size-3.5" strokeWidth={3} />}
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold">{p.nom}</div>
                <div className="text-xs text-muted-foreground">
                  en {g ? "gâteaux" : UNITE_PLURIEL[p.unite]}
                  {g && v !== null ? ` · ${v} parts` : ""}
                  {p.aide ? ` · ${p.aide}` : ""}
                </div>
                {lectureSeule ? (
                  <div className="mt-2 text-center text-2xl font-bold tabular-nums" aria-label={`Quantité ${p.nom}`}>
                    {affiche ?? 0}
                  </div>
                ) : (
                <div className="mt-2 flex items-center gap-1">
                  <button
                    aria-label={`Moins ${p.nom}`}
                    onClick={() => {
                      setTextes((x) => ({ ...x, [p.produitId]: "" }));
                      enregistrer(p.produitId, versStock(Math.max(0, Math.round(((affiche ?? pas) - pas) * 1000) / 1000)));
                    }}
                    className="size-11 shrink-0 rounded-xl bg-muted text-2xl font-bold active:bg-muted-strong"
                  >
                    <Minus aria-hidden className="mx-auto size-6" strokeWidth={2.25} />
                  </button>
                  <input
                    inputMode={decimales ? "decimal" : "numeric"}
                    aria-label={`Quantité ${p.nom}`}
                    value={textes[p.produitId] || (affiche === null ? "" : decimales ? formatQuantite(affiche) : String(affiche))}
                    placeholder="–"
                    onChange={(ev) => {
                      // Nombre entier attendu : une virgule n'est pas effacée en silence (« 2,5 » deviendrait 25).
                      if (!decimales && /[.,]/.test(ev.target.value)) {
                        setAlertes((x) => ({ ...x, [p.produitId]: "Nombre entier attendu" }));
                        return;
                      }
                      setAlertes((x) => ({ ...x, [p.produitId]: null }));
                      const t = decimales ? ev.target.value.replace(/[^\d.,]/g, "") : ev.target.value.replace(/\D/g, "");
                      setTextes((x) => ({ ...x, [p.produitId]: t }));
                      if (t === "") return enregistrer(p.produitId, nullable ? null : 0);
                      const n = lireQuantite(t);
                      if (n !== null) enregistrer(p.produitId, versStock(Math.min(99999, Math.round(n * 1000) / 1000)));
                    }}
                    onBlur={() => setTextes((x) => ({ ...x, [p.produitId]: "" }))}
                    onFocus={(ev) => ev.target.select()}
                    className="h-11 w-full min-w-0 rounded-xl bg-card text-center text-lg font-bold ring-1 ring-input focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  <button
                    aria-label={`Plus ${p.nom}`}
                    onClick={() => {
                      setTextes((x) => ({ ...x, [p.produitId]: "" }));
                      enregistrer(p.produitId, versStock(Math.round(((affiche ?? 0) + pas) * 1000) / 1000));
                    }}
                    className="size-11 shrink-0 rounded-xl bg-muted text-2xl font-bold active:bg-muted-strong"
                  >
                    <Plus aria-hidden className="mx-auto size-6" strokeWidth={2.25} />
                  </button>
                </div>
                )}
                {alertes[p.produitId] && (
                  <div className="mt-1 text-center text-xs font-semibold text-destructive" role="alert">
                    {alertes[p.produitId]}
                  </div>
                )}
                {e === "erreur" && (
                  <div className="mt-1 text-center text-xs font-semibold text-destructive" role="alert">
                    Non enregistré : ressaisir
                  </div>
                )}
                {estQuantiteInhabituelle(v, p.unite) && (
                  <div className="mt-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-center text-xs font-semibold text-warning" role="status">
                    Quantité inhabituelle : vérifiez
                  </div>
                )}
                {!lectureSeule && p.unite === "part" && p.partsParGateau && !g && (
                  <button
                    onClick={() => enregistrer(p.produitId, (v ?? 0) + p.partsParGateau!)}
                    className="mt-1 w-full rounded-lg py-1 text-xs font-semibold text-primary ring-1 ring-primary/30 active:bg-primary-soft"
                  >
                    + 1 gâteau entier ({p.partsParGateau} parts)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {visibles.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucun produit à afficher.</p>}
    </div>
  );
}
