"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { actionSaisirQuantite, actionSaisirVentes } from "@/app/actions-shift";
import type { ChampQuantite } from "@/server/services/shifts";
import { PhotoProduit } from "./PhotoProduit";
import { cx } from "./ui";

export interface ProduitGrille {
  produitId: string;
  nom: string;
  categorie: string;
  unite: "piece" | "part" | "bouteille";
  partsParGateau: number | null;
  photoId: string | null;
  valeur: number | null;
  aide?: string | null;
}

const LIBELLE_UNITE = { piece: "pièces", part: "parts", bouteille: "bouteilles" };
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
}: {
  shiftId: string;
  /** « ventes » : ventes du canal `canalId` (sur place, Glovo…). */
  champ: ChampQuantite | "ventes";
  canalId?: string;
  produits: ProduitGrille[];
  nullable?: boolean;
  libelleProgression?: string;
}) {
  const [valeurs, setValeurs] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(produits.map((p) => [p.produitId, p.valeur])),
  );
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [restants, setRestants] = useState(false);
  const minuteurs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const enAttente = Object.values(etats).filter((e) => e === "en_cours").length;
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
      setEtats((x) => ({ ...x, [produitId]: r.ok ? "ok" : "erreur" }));
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
      <div className="sticky top-[57px] z-10 -mx-4 mb-3 border-b border-stone-200 bg-[#faf8f6]/95 px-4 pt-1 pb-2 backdrop-blur">
        {nullable && (
          <div className="mb-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>
                {faits} / {produits.length} {libelleProgression}
              </span>
              <span className={enAttente ? "text-stone-500" : "text-emerald-700"} aria-live="polite">
                {enAttente ? "Enregistrement…" : faits === produits.length ? "Terminé ✓" : Object.keys(etats).length ? "Tout est enregistré" : ""}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-marque-500 transition-all" style={{ width: `${(faits / Math.max(1, produits.length)) * 100}%` }} />
            </div>
          </div>
        )}
        {!nullable && (
          <div className="mb-1 h-5 text-right text-sm font-semibold text-stone-500" aria-live="polite">
            {enAttente ? "Enregistrement…" : Object.keys(etats).length ? "Tout est enregistré" : ""}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Rechercher un produit"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-300"
          />
          {nullable && (
            <button
              onClick={() => setRestants((r) => !r)}
              className={cx("shrink-0 rounded-xl px-3 text-sm font-semibold ring-1", restants ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300")}
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
                categorie === c ? "bg-marque-700 text-white ring-marque-700" : "bg-white text-stone-700 ring-stone-300",
              )}
            >
              {c ?? "Tout"}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200" role="alert">
          <span>{erreur}</span>
          <button onClick={() => setErreur(null)} className="font-bold" aria-label="Fermer">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visibles.map((p) => {
          const v = valeurs[p.produitId];
          const e = etats[p.produitId];
          return (
            <div
              key={p.produitId}
              className={cx(
                "overflow-hidden rounded-2xl bg-white shadow-sm ring-1",
                e === "erreur" ? "ring-2 ring-red-500" : v !== null && nullable ? "ring-emerald-300" : "ring-stone-200",
              )}
            >
              <div className="relative">
                <PhotoProduit photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
                {v !== null && nullable && e !== "erreur" && (
                  <span className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                    {e === "en_cours" ? "…" : "✓"}
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold">{p.nom}</div>
                <div className="text-xs text-stone-500">
                  en {LIBELLE_UNITE[p.unite]}
                  {p.aide ? ` · ${p.aide}` : ""}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    aria-label={`Moins ${p.nom}`}
                    onClick={() => enregistrer(p.produitId, Math.max(0, (v ?? 1) - 1))}
                    className="size-11 shrink-0 rounded-xl bg-stone-100 text-2xl font-bold active:bg-stone-200"
                  >
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Quantité ${p.nom}`}
                    value={v ?? ""}
                    placeholder="–"
                    onChange={(ev) => {
                      const t = ev.target.value.replace(/\D/g, "");
                      enregistrer(p.produitId, t === "" ? (nullable ? null : 0) : Math.min(99999, Number(t)));
                    }}
                    onFocus={(ev) => ev.target.select()}
                    className="h-11 w-full min-w-0 rounded-xl bg-white text-center text-xl font-bold ring-1 ring-stone-300 focus:ring-2 focus:ring-marque-500 focus:outline-none"
                  />
                  <button
                    aria-label={`Plus ${p.nom}`}
                    onClick={() => enregistrer(p.produitId, (v ?? 0) + 1)}
                    className="size-11 shrink-0 rounded-xl bg-stone-100 text-2xl font-bold active:bg-stone-200"
                  >
                    +
                  </button>
                </div>
                {p.unite === "part" && p.partsParGateau && (
                  <button
                    onClick={() => enregistrer(p.produitId, (v ?? 0) + p.partsParGateau!)}
                    className="mt-1 w-full rounded-lg py-1 text-xs font-semibold text-marque-700 ring-1 ring-marque-200 active:bg-marque-50"
                  >
                    + 1 gâteau entier ({p.partsParGateau} parts)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {visibles.length === 0 && <p className="py-8 text-center text-stone-500">Aucun produit à afficher.</p>}
    </div>
  );
}
