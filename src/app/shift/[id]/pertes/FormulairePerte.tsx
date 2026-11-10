"use client";

import { useState, useTransition } from "react";
import { actionAjouterPerte } from "@/app/actions-shift";
import { PhotoProduit } from "@/components/PhotoProduit";
import { Bouton, classesChamp, cx, Message } from "@/components/ui";
import type { MotifPerte, Unite } from "@/db/schema";
import { formatQuantite, lireQuantite, UNITE_PLURIEL } from "@/domain/unites";

interface P {
  produitId: string;
  nom: string;
  categorie: string;
  unite: Unite;
  partsParGateau: number | null;
  photoId: string | null;
}

export function FormulairePerte({ shiftId, produits }: { shiftId: string; produits: P[] }) {
  const [choisi, setChoisi] = useState<P | null>(null);
  const [quantite, setQuantite] = useState(1);
  const [texte, setTexte] = useState("");
  const [gateaux, setGateaux] = useState(false);
  const [motif, setMotif] = useState<MotifPerte | null>(null);
  const [commentaire, setCommentaire] = useState("");
  const [recherche, setRecherche] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const fermer = () => {
    setChoisi(null);
    setQuantite(1);
    setTexte("");
    setGateaux(false);
    setMotif(null);
    setCommentaire("");
  };

  const valider = () =>
    demarrer(async () => {
      if (!choisi || !motif) return;
      const r = await actionAjouterPerte(shiftId, {
        produitId: choisi.produitId,
        quantite,
        saisie: gateaux ? "gateaux" : "parts",
        motif,
        commentaire: commentaire || null,
      });
      if (r.ok) {
        setRetour({
          ok: true,
          texte: `${choisi.nom} : ${formatQuantite(quantite)} ${gateaux ? "gâteau(x)" : UNITE_PLURIEL[choisi.unite]} déclaré(s) en perte`,
        });
        fermer();
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const decimales = choisi ? choisi.unite === "kg" || choisi.unite === "litre" : false;
  const f = recherche.trim().toLowerCase();
  const visibles = produits.filter((p) => !f || p.nom.toLowerCase().includes(f) || p.categorie.toLowerCase().includes(f));

  return (
    <div>
      {retour && (
        <div className="mb-3">
          <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>
        </div>
      )}
      <input
        type="search"
        placeholder="Rechercher le produit perdu"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className={cx(classesChamp, "mb-3")}
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {visibles.map((p) => (
          <button
            key={p.produitId}
            onClick={() => {
              setRetour(null);
              setChoisi(p);
            }}
            className="overflow-hidden rounded-xl bg-white text-left ring-1 ring-stone-200 hover:ring-marque-500"
          >
            <PhotoProduit photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
            <span className="line-clamp-2 block p-1.5 text-xs leading-tight font-semibold">{p.nom}</span>
          </button>
        ))}
      </div>

      {choisi && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={fermer}>
          <div
            role="dialog"
            aria-label={`Perte : ${choisi.nom}`}
            className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="w-16 shrink-0 overflow-hidden rounded-xl">
                <PhotoProduit photoId={choisi.photoId} nom={choisi.nom} categorie={choisi.categorie} />
              </div>
              <h2 className="text-lg font-bold">{choisi.nom}</h2>
            </div>
            <div className="mb-3 text-sm font-semibold text-stone-700">Motif</div>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(
                [
                  ["peremption", "Péremption"],
                  ["endommage", "Endommagé"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setMotif(v)}
                  className={cx(
                    "min-h-14 rounded-xl text-lg font-semibold ring-1",
                    motif === v ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {decimales && <div className="mb-1 text-sm text-stone-600">Quantité en {UNITE_PLURIEL[choisi.unite]}</div>}
            {choisi.unite === "part" && choisi.partsParGateau && (
              <div className="mb-3 grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold">
                {[false, true].map((g) => (
                  <button key={String(g)} onClick={() => setGateaux(g)} className={cx("rounded-lg py-2", gateaux === g ? "bg-white shadow-sm" : "text-stone-500")}>
                    {g ? `Gâteaux entiers (×${choisi.partsParGateau})` : "Parts"}
                  </button>
                ))}
              </div>
            )}
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setQuantite((q) => Math.max(decimales ? 0.1 : 1, Math.round((q - 1) * 1000) / 1000))} className="size-14 rounded-xl bg-stone-100 text-3xl font-bold" aria-label="Moins">
                −
              </button>
              <input
                inputMode={decimales ? "decimal" : "numeric"}
                aria-label="Quantité perdue"
                value={texte || formatQuantite(quantite)}
                onChange={(e) => {
                  if (!decimales) return setQuantite(Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)));
                  const t = e.target.value.replace(/[^\d.,]/g, "");
                  setTexte(t);
                  const n = lireQuantite(t);
                  if (n !== null && n > 0) setQuantite(Math.round(n * 1000) / 1000);
                }}
                onBlur={() => setTexte("")}
                className="h-14 w-full rounded-xl text-center text-2xl font-bold ring-1 ring-stone-300"
              />
              <button onClick={() => setQuantite((q) => q + 1)} className="size-14 rounded-xl bg-stone-100 text-3xl font-bold" aria-label="Plus">
                +
              </button>
            </div>
            <input
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Commentaire (facultatif)"
              className={cx(classesChamp, "mb-4")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Bouton variante="secondaire" onClick={fermer}>
                Annuler
              </Bouton>
              <Bouton disabled={!motif || enCours} onClick={valider}>
                {enCours ? "…" : "Déclarer la perte"}
              </Bouton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
