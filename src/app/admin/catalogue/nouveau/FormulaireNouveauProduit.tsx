"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, classesChamp, cx, Message, soumettre } from "@/components/ui";
import { UNITE_SINGULIER, UNITES_INGREDIENT } from "@/domain/unites";
import { actionCreerProduit } from "../../actions";

type Nature = "produit" | "ingredient" | "intermediaire";

export function FormulaireNouveauProduit({
  categories,
  categorieIngredients,
  categorieIntermediaires,
}: {
  categories: { id: string; nom: string }[];
  categorieIngredients: string | null;
  categorieIntermediaires: string | null;
}) {
  const [etat, action, enCours] = useActionState(actionCreerProduit, null);
  const [nature, setNature] = useState<Nature>("produit");
  const [unite, setUnite] = useState("piece");
  const premiereCategorieProduit = categories.find((c) => c.id !== categorieIngredients && c.id !== categorieIntermediaires)?.id ?? "";
  const [categorie, setCategorie] = useState(premiereCategorieProduit);
  // Matière première ou préparation intermédiaire : comptée au labo (kg, litre…), jamais vendue.
  const ingredient = nature !== "produit";
  const choisirNature = (n: Nature) => {
    setNature(n);
    setUnite(n === "produit" ? "piece" : "kg");
    setCategorie(n === "ingredient" ? (categorieIngredients ?? "") : n === "intermediaire" ? (categorieIntermediaires ?? "") : premiereCategorieProduit);
  };
  return (
    <form onSubmit={soumettre(action)} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="nature" value={nature} />
      <div className="grid grid-cols-3 rounded-xl bg-muted p-1 text-sm font-semibold sm:col-span-2">
        {(
          [
            ["produit", "Produit vendu"],
            ["intermediaire", "Préparation intermédiaire"],
            ["ingredient", "Matière première"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => choisirNature(v)} aria-pressed={nature === v} className={cx("rounded-lg px-1 py-2", nature === v ? "bg-card shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      <Champ label="Nom">
        <input name="nom" required className={classesChamp} placeholder={nature === "ingredient" ? "ex. Farine T55" : nature === "intermediaire" ? "ex. Crème pâtissière" : "ex. Caramel Can"} />
      </Champ>
      <Champ label="Catégorie">
        <select name="categorieId" value={categorie} onChange={(e) => setCategorie(e.target.value)} className={classesChamp}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          <option value="">Nouvelle catégorie…</option>
        </select>
      </Champ>
      {categorie === "" && (
        <Champ label="Nom de la nouvelle catégorie">
          <input name="nouvelleCategorie" required className={classesChamp} />
        </Champ>
      )}
      <Champ label="Unité de comptage">
        <select name="unite" value={unite} onChange={(e) => setUnite(e.target.value)} className={classesChamp}>
          {(ingredient ? UNITES_INGREDIENT : (["piece", "part", "bouteille"] as const)).map((u) => (
            <option key={u} value={u}>
              {u === "part" ? "Part (gâteau découpé)" : UNITE_SINGULIER[u][0].toUpperCase() + UNITE_SINGULIER[u].slice(1)}
            </option>
          ))}
        </select>
      </Champ>
      {unite === "part" ? (
        <Champ label="Parts par gâteau">
          <input name="partsParGateau" inputMode="numeric" defaultValue={8} className={classesChamp} />
        </Champ>
      ) : (
        <Champ label="Format (facultatif)">
          <input name="format" className={classesChamp} placeholder={nature === "ingredient" ? "ex. sac de 25 kg" : nature === "intermediaire" ? "ex. bac de 5 kg" : "ex. 330 ml"} />
        </Champ>
      )}
      {nature === "intermediaire" && (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Préparée au laboratoire à partir de matières premières (sa fiche technique se remplit ensuite), saisie en production, comptée au labo et
          utilisée dans les fiches techniques des produits finis.
        </p>
      )}
      {ingredient ? (
        <input type="hidden" name="suiviStock" value="on" />
      ) : (
        <div className="grid gap-2 sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="suiviStock" defaultChecked className="size-5" />
            Suivi en stock (décocher pour un produit préparé à la commande)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="fabriqueLabo" defaultChecked className="size-5" />
            Fabriqué par le laboratoire (compté au labo, livré aux points de vente)
          </label>
        </div>
      )}
      <div className="grid gap-2 sm:col-span-2">
        {etat && !etat.ok && <Message ton="erreur">{etat.erreur}</Message>}
        <Bouton type="submit" disabled={enCours} className="justify-self-start">
          Créer le produit
        </Bouton>
      </div>
    </form>
  );
}
