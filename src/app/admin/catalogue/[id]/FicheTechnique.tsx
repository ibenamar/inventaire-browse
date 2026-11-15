"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Bouton, classesChamp, formatMad, Message } from "@/components/ui";
import type { Unite } from "@/db/schema";
import { formatQuantite, lireQuantite, UNITE_PLURIEL } from "@/domain/unites";
import { actionAppliquerCoutRecette, actionEnregistrerRecette } from "../../actions";

interface Ingredient {
  id: string;
  nom: string;
  unite: Unite;
  /** Préparation intermédiaire (sinon matière première). */
  intermediaire: boolean;
}

const texteDe = (n: number) => formatQuantite(n).replace(/\s/g, "");

/**
 * Fiche technique, saisie comme la recette est écrite : ce qu'elle donne (une fournée de 2,5 kg,
 * 6 gâteaux…) puis les matières premières et préparations utilisées, avec leurs quantités.
 */
export function FicheTechnique({
  produitId,
  ingredients,
  lignes: initiales,
  rendement: rendementInitial,
  uniteRecette,
  cout,
}: {
  produitId: string;
  ingredients: Ingredient[];
  lignes: { ingredientId: string; quantite: number }[];
  /** Ce que donne la recette enregistrée. */
  rendement: number;
  /** Unité de ce que donne la recette, au pluriel : « gâteaux entiers », « kg », « pièces ». */
  uniteRecette: string;
  cout: { recette: number; parUnite: number; complet: boolean; libelleUnite: string } | null;
}) {
  const [lignes, setLignes] = useState(initiales.map((l) => ({ ingredientId: l.ingredientId, texte: texteDe(l.quantite) })));
  const [rendement, setRendement] = useState(texteDe(rendementInitial));
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  // Le coût affiché et « Appliquer » portent sur la fiche enregistrée : on le signale si l'écran a changé.
  // Comparaison indépendante de l'ordre (la fiche enregistrée revient triée par nom).
  const cle = (x: [string, number | null][]) => JSON.stringify([...x].sort((a, b) => a[0].localeCompare(b[0])));
  const modifiee =
    lireQuantite(rendement) !== rendementInitial ||
    cle(lignes.map((l) => [l.ingredientId, lireQuantite(l.texte)])) !== cle(initiales.map((l) => [l.ingredientId, l.quantite]));
  const dispo = (courant: string) => ingredients.filter((i) => i.id === courant || !lignes.some((l) => l.ingredientId === i.id));
  const agir = (f: () => Promise<{ ok: boolean; erreur?: string; message?: string }>) =>
    demarrer(async () => {
      setRetour(null);
      const r = await f();
      setRetour(r.ok ? { ok: true, texte: r.message ?? "Enregistré" } : { ok: false, texte: r.erreur ?? "Erreur" });
    });
  const nombre = (t: string) => t.replace(/[^\d.,]/g, "");

  if (!ingredients.length)
    return <p className="text-sm text-muted-foreground">Créez d&apos;abord les matières premières (Catalogue › Nouveau produit › Matière première).</p>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3">
        <label htmlFor={`rendement-${produitId}`} className="font-semibold">
          Cette recette donne
        </label>
        <input
          id={`rendement-${produitId}`}
          inputMode="decimal"
          value={rendement}
          onChange={(e) => setRendement(nombre(e.target.value))}
          onFocus={(e) => e.target.select()}
          className={`${classesChamp} w-24! text-center text-lg font-semibold`}
        />
        <span className="font-semibold">{uniteRecette}</span>
        <p className="w-full text-sm text-muted-foreground">
          Recopiez la recette telle qu&apos;elle est écrite (ex. une fournée de 2,5 kg) : l&apos;application fait la règle de trois.
        </p>
      </div>

      {lignes.length > 0 && <p className="text-sm font-semibold">Ingrédients et préparations utilisés pour cette recette :</p>}
      {lignes.map((l, i) => {
        const ing = ingredients.find((x) => x.id === l.ingredientId);
        return (
          <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl p-2 ring-1 ring-border sm:grid-cols-[1fr_auto_auto]">
            <select
              aria-label={`Ingrédient ${i + 1}`}
              value={l.ingredientId}
              onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, ingredientId: e.target.value } : y)))}
              className={`${classesChamp} col-span-2 min-w-0 sm:col-span-1`}
            >
              {(
                [
                  ["Préparations intermédiaires", true],
                  ["Matières premières", false],
                ] as const
              ).map(([groupe, inter]) =>
                dispo(l.ingredientId).some((x) => x.intermediaire === inter) ? (
                  <optgroup key={groupe} label={groupe}>
                    {dispo(l.ingredientId)
                      .filter((x) => x.intermediaire === inter)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nom}
                        </option>
                      ))}
                  </optgroup>
                ) : null,
              )}
            </select>
            <span className="flex items-center gap-2">
              <input
                aria-label={`Quantité ${ing?.nom ?? ""}`}
                inputMode="decimal"
                placeholder="0"
                value={l.texte}
                onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, texte: nombre(e.target.value) } : y)))}
                className={`${classesChamp} w-24! text-center`}
              />
              <span className="w-14 text-sm text-muted-foreground">{ing ? UNITE_PLURIEL[ing.unite] : ""}</span>
            </span>
            <button
              type="button"
              onClick={() => setLignes((x) => x.filter((_, j) => j !== i))}
              aria-label={`Retirer ${ing?.nom ?? "cette ligne"}`}
              className="inline-flex size-11 items-center justify-center justify-self-end rounded-lg text-destructive hover:bg-destructive-soft"
            >
              <Trash2 aria-hidden className="size-5" />
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Bouton
          type="button"
          variante="secondaire"
          disabled={!dispo("").length}
          onClick={() => setLignes((x) => [...x, { ingredientId: dispo("")[0].id, texte: "" }])}
        >
          <Plus aria-hidden className="size-4" /> Ajouter un ingrédient
        </Bouton>
        <Bouton
          type="button"
          disabled={enCours}
          onClick={() => {
            const r = lireQuantite(rendement);
            if (r === null || r <= 0) return setRetour({ ok: false, texte: "Indiquez ce que donne la recette (par exemple 1 ou 2,5)." });
            const valeurs = lignes.map((l) => ({ ingredientId: l.ingredientId, quantite: lireQuantite(l.texte) }));
            const manquant = valeurs.findIndex((v) => v.quantite === null || v.quantite <= 0);
            if (manquant >= 0)
              return setRetour({ ok: false, texte: `Indiquez la quantité de « ${ingredients.find((x) => x.id === valeurs[manquant].ingredientId)?.nom} ».` });
            agir(() => actionEnregistrerRecette(produitId, valeurs as { ingredientId: string; quantite: number }[], r));
          }}
        >
          Enregistrer la fiche
        </Bouton>
      </div>
      {modifiee && <p className="text-sm font-semibold text-warning">Pas encore enregistrée : cliquez sur « Enregistrer la fiche ».</p>}
      {cout && (
        <p className={modifiee ? "text-sm text-muted-foreground" : "text-sm"}>
          Coût de la recette : <strong>{formatMad(cout.recette)}</strong>
          {cout.parUnite !== cout.recette && (
            <>
              {" "}
              soit <strong>{formatMad(cout.parUnite)}</strong> par {cout.libelleUnite}
            </>
          )}
          {!cout.complet && <span className="text-warning"> — le prix d&apos;un ingrédient manque : saisissez-le sur sa fiche (ou complétez la fiche de la préparation)</span>}
        </p>
      )}
      {cout?.complet && !modifiee && (
        <div>
          <Bouton type="button" variante="secondaire" disabled={enCours} onClick={() => agir(() => actionAppliquerCoutRecette(produitId))}>
            Utiliser ce coût comme coût de revient
          </Bouton>
        </div>
      )}
      {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
    </div>
  );
}
