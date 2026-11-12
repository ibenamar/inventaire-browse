"use client";

import { useState, useTransition } from "react";
import { Bouton, classesChamp, formatMad, Message } from "@/components/ui";
import type { Unite } from "@/db/schema";
import { lireQuantite, UNITE_PLURIEL } from "@/domain/unites";
import { actionAppliquerCoutRecette, actionEnregistrerRecette } from "../../actions";

interface Ingredient {
  id: string;
  nom: string;
  unite: Unite;
  /** Préparation intermédiaire (sinon matière première). */
  intermediaire: boolean;
}

/** Fiche technique : composants (matières premières, préparations) et quantités pour un gâteau entier (ou une unité). */
export function FicheTechnique({
  produitId,
  ingredients,
  lignes: initiales,
  pour,
  cout,
}: {
  produitId: string;
  ingredients: Ingredient[];
  lignes: { ingredientId: string; quantite: number }[];
  pour: string;
  cout: { recette: number; parUnite: number; complet: boolean; libelleUnite: string } | null;
}) {
  const [lignes, setLignes] = useState(initiales.map((l) => ({ ingredientId: l.ingredientId, texte: String(l.quantite).replace(".", ",") })));
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  // Le coût affiché et « Appliquer » portent sur la fiche enregistrée : on le signale si l'écran a changé.
  // Comparaison indépendante de l'ordre (la fiche enregistrée revient triée par nom d'ingrédient).
  const cle = (x: [string, number | null][]) => JSON.stringify([...x].sort((a, b) => a[0].localeCompare(b[0])));
  const modifiee =
    cle(lignes.map((l) => [l.ingredientId, lireQuantite(l.texte)])) !== cle(initiales.map((l) => [l.ingredientId, l.quantite]));
  const dispo = (courant: string) => ingredients.filter((i) => i.id === courant || !lignes.some((l) => l.ingredientId === i.id));
  const agir = (f: () => Promise<{ ok: boolean; erreur?: string; message?: string }>) =>
    demarrer(async () => {
      setRetour(null);
      const r = await f();
      setRetour(r.ok ? { ok: true, texte: r.message ?? "Enregistré" } : { ok: false, texte: r.erreur ?? "Erreur" });
    });

  if (!ingredients.length)
    return <p className="text-sm text-muted-foreground">Créez d&apos;abord les matières premières (Catalogue › Nouveau produit › Matière première).</p>;

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Quantités pour {pour}.</p>
      {lignes.map((l, i) => {
        const ing = ingredients.find((x) => x.id === l.ingredientId);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Composant"
              value={l.ingredientId}
              onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, ingredientId: e.target.value } : y)))}
              className={`${classesChamp} min-w-0 flex-1`}
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
            <input
              aria-label={`Quantité ${ing?.nom ?? ""}`}
              inputMode="decimal"
              value={l.texte}
              onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, texte: e.target.value.replace(/[^\d.,]/g, "") } : y)))}
              className={`${classesChamp} w-24 text-center`}
            />
            <span className="w-14 text-sm text-muted-foreground">{ing ? UNITE_PLURIEL[ing.unite] : ""}</span>
            <button type="button" onClick={() => setLignes((x) => x.filter((_, j) => j !== i))} className="rounded-lg px-2 py-1 text-sm font-semibold text-destructive hover:bg-destructive-soft">
              Retirer
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
          + Composant
        </Bouton>
        <Bouton
          type="button"
          disabled={enCours}
          onClick={() => {
            const valeurs = lignes.map((l) => ({ ingredientId: l.ingredientId, quantite: lireQuantite(l.texte) }));
            if (valeurs.some((v) => v.quantite === null || v.quantite <= 0)) return setRetour({ ok: false, texte: "Indiquer une quantité positive pour chaque composant" });
            agir(() => actionEnregistrerRecette(produitId, valeurs as { ingredientId: string; quantite: number }[]));
          }}
        >
          Enregistrer la fiche
        </Bouton>
      </div>
      {modifiee && <p className="text-sm font-semibold text-warning">Fiche modifiée : enregistrez-la pour mettre à jour le coût.</p>}
      {cout && (
        <p className={modifiee ? "text-sm text-muted-foreground" : "text-sm"}>
          Coût de la recette : <strong>{formatMad(cout.recette)}</strong>
          {cout.parUnite !== cout.recette && (
            <>
              {" "}
              soit <strong>{formatMad(cout.parUnite)}</strong> par {cout.libelleUnite}
            </>
          )}
          {!cout.complet && <span className="text-warning"> — coût d&apos;un composant inconnu : saisissez-le sur sa fiche (ou complétez la fiche de la préparation)</span>}
        </p>
      )}
      {cout?.complet && !modifiee && (
        <div>
          <Bouton type="button" variante="secondaire" disabled={enCours} onClick={() => agir(() => actionAppliquerCoutRecette(produitId))}>
            Appliquer comme coût de revient
          </Bouton>
        </div>
      )}
      {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
    </div>
  );
}
