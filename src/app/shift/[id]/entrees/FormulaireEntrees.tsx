"use client";

import { useMemo, useState, useTransition } from "react";
import { actionAjouterEntrees, actionCreerBon } from "@/app/actions-shift";
import { PhotoProduit } from "@/components/PhotoProduit";
import { Bouton, classesChamp, cx, Message } from "@/components/ui";
import type { OrigineEntree, Unite } from "@/db/schema";
import { formatQuantite, lireQuantite, UNITE_PLURIEL } from "@/domain/unites";

interface P {
  produitId: string;
  nom: string;
  categorie: string;
  unite: Unite;
  partsParGateau: number | null;
  photoId: string | null;
}

export type OptionOrigine = { v: OrigineEntree; l: string };

const DECIMALES: Unite[] = ["kg", "litre"];

/**
 * Saisie groupée de quantités reçues ou produites. `gateauxParDefaut` : les cakes sont saisis en
 * gâteaux entiers (production du laboratoire), convertis en parts à l'enregistrement.
 */
export function FormulaireEntrees({
  shiftId,
  produits,
  origines,
  gateauxParDefaut = false,
  libelleAction = "Enregistrer la réception",
  placeholderCommentaire = "Commentaire (n° de bon, remarque…)",
  destinations,
}: {
  shiftId: string;
  produits: P[];
  origines: OptionOrigine[];
  /** Mode « bon de livraison » : sites destinataires possibles (la saisie crée un bon au lieu d'entrées). */
  destinations?: { id: string; nom: string }[];
  gateauxParDefaut?: boolean;
  libelleAction?: string;
  placeholderCommentaire?: string;
}) {
  const [origine, setOrigine] = useState<OrigineEntree>(origines[0]?.v ?? "autre");
  const [destination, setDestination] = useState<string>(destinations?.[0]?.id ?? "");
  const [qtes, setQtes] = useState<Record<string, number>>({});
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [enGateaux, setEnGateaux] = useState<Record<string, boolean>>(() =>
    gateauxParDefaut ? Object.fromEntries(produits.filter((p) => p.unite === "part" && p.partsParGateau).map((p) => [p.produitId, true])) : {},
  );
  const [commentaire, setCommentaire] = useState("");
  const [categorie, setCategorie] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const categories = useMemo(() => [...new Set(produits.map((p) => p.categorie))], [produits]);
  const visibles = produits.filter((p) => !categorie || p.categorie === categorie);
  const lignes = Object.entries(qtes).filter(([, q]) => q > 0);
  const total = (p: P) => (qtes[p.produitId] ?? 0) * (enGateaux[p.produitId] && p.partsParGateau ? p.partsParGateau : 1);

  const valider = (expedier = false) =>
    demarrer(async () => {
      setRetour(null);
      const saisies = lignes.map(([produitId, quantite]) => ({ produitId, quantite, saisie: enGateaux[produitId] ? ("gateaux" as const) : ("parts" as const) }));
      const r = destinations
        ? await actionCreerBon(shiftId, { siteDestinationId: destination, lignes: saisies, commentaire: commentaire || null, expedier })
        : await actionAjouterEntrees(shiftId, saisies, origine, commentaire || null);
      if (r.ok) {
        setQtes({});
        setTextes({});
        setCommentaire("");
        setRetour({ ok: true, texte: r.message ?? "Enregistré" });
      } else setRetour({ ok: false, texte: r.erreur });
    });

  return (
    <div>
      <div className={cx("mb-3 grid gap-2", (origines.length > 1 || destinations) && "sm:grid-cols-2")}>
        {destinations && (
          <select value={destination} onChange={(e) => setDestination(e.target.value)} className={classesChamp} aria-label="Site destinataire">
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                Livrer à : {d.nom}
              </option>
            ))}
          </select>
        )}
        {!destinations && origines.length > 1 && (
          <select value={origine} onChange={(e) => setOrigine(e.target.value as OrigineEntree)} className={classesChamp} aria-label="Origine">
            {origines.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        )}
        <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder={placeholderCommentaire} className={classesChamp} />
      </div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
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
      <div className="grid grid-cols-2 gap-3 pb-28 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visibles.map((p) => {
          const q = qtes[p.produitId] ?? 0;
          const gat = enGateaux[p.produitId] ?? false;
          const decimales = DECIMALES.includes(p.unite);
          const changer = (x: number) => {
            setTextes((t) => ({ ...t, [p.produitId]: "" }));
            setQtes((v) => ({ ...v, [p.produitId]: Math.max(0, Math.round(x * 1000) / 1000) }));
          };
          return (
            <div key={p.produitId} className={cx("overflow-hidden rounded-2xl bg-white ring-1", q ? "ring-2 ring-marque-500" : "ring-stone-200")}>
              <PhotoProduit photoId={p.photoId} nom={p.nom} categorie={p.categorie} className="max-h-32" />
              <div className="p-2">
                <div className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold">{p.nom}</div>
                {!(p.unite === "part" && p.partsParGateau) && <div className="text-xs text-stone-500">en {UNITE_PLURIEL[p.unite]}</div>}
                {p.unite === "part" && p.partsParGateau && (
                  <div className="my-1 grid grid-cols-2 rounded-lg bg-stone-100 p-0.5 text-xs font-semibold">
                    {[false, true].map((g) => (
                      <button
                        key={String(g)}
                        onClick={() => setEnGateaux((x) => ({ ...x, [p.produitId]: g }))}
                        className={cx("rounded-md py-1", gat === g ? "bg-white shadow-sm" : "text-stone-500")}
                      >
                        {g ? "Gâteaux" : "Parts"}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <button
                    aria-label={`Moins ${p.nom}`}
                    onClick={() => changer(q - 1)}
                    className="size-11 shrink-0 rounded-xl bg-stone-100 text-2xl font-bold"
                  >
                    −
                  </button>
                  <input
                    inputMode={decimales ? "decimal" : "numeric"}
                    aria-label={`Quantité ${p.nom}`}
                    value={textes[p.produitId] || (q ? formatQuantite(q) : "")}
                    placeholder="0"
                    onChange={(e) => {
                      if (!decimales) return setQtes((x) => ({ ...x, [p.produitId]: Math.min(9999, Number(e.target.value.replace(/\D/g, "") || 0)) }));
                      const t = e.target.value.replace(/[^\d.,]/g, "");
                      setTextes((x) => ({ ...x, [p.produitId]: t }));
                      const n = lireQuantite(t);
                      setQtes((x) => ({ ...x, [p.produitId]: n === null ? 0 : Math.min(99999, Math.round(n * 1000) / 1000) }));
                    }}
                    onBlur={() => setTextes((x) => ({ ...x, [p.produitId]: "" }))}
                    onFocus={(e) => e.target.select()}
                    className="h-11 w-full min-w-0 rounded-xl text-center text-xl font-bold ring-1 ring-stone-300"
                  />
                  <button
                    aria-label={`Plus ${p.nom}`}
                    onClick={() => changer(q + 1)}
                    className="size-11 shrink-0 rounded-xl bg-stone-100 text-2xl font-bold"
                  >
                    +
                  </button>
                </div>
                {gat && q > 0 && <div className="mt-1 text-center text-xs text-stone-600">= {total(p)} parts</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-2">
          {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
          {destinations ? (
            <div className="grid grid-cols-2 gap-2">
              <Bouton variante="secondaire" grand disabled={!lignes.length || !destination || enCours} onClick={() => valider(false)}>
                Préparer le bon
              </Bouton>
              <Bouton grand disabled={!lignes.length || !destination || enCours} onClick={() => valider(true)}>
                {enCours ? "…" : `Expédier${lignes.length ? ` (${lignes.length})` : ""}`}
              </Bouton>
            </div>
          ) : (
            <Bouton grand disabled={!lignes.length || enCours} onClick={() => valider()}>
              {enCours ? "Enregistrement…" : lignes.length ? `${libelleAction} (${lignes.length} produit${lignes.length > 1 ? "s" : ""})` : "Saisir les quantités"}
            </Bouton>
          )}
        </div>
      </div>
    </div>
  );
}
