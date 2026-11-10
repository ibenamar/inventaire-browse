"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, classesChamp, cx, Message, soumettre } from "@/components/ui";
import { UNITE_SINGULIER, UNITES_INGREDIENT } from "@/domain/unites";
import { actionCreerProduit } from "../../actions";

export function FormulaireNouveauProduit({
  categories,
  categorieIngredients,
}: {
  categories: { id: string; nom: string }[];
  categorieIngredients: string | null;
}) {
  const [etat, action, enCours] = useActionState(actionCreerProduit, null);
  const [nature, setNature] = useState<"produit" | "ingredient">("produit");
  const [unite, setUnite] = useState("piece");
  const [categorie, setCategorie] = useState(categories.find((c) => c.id !== categorieIngredients)?.id ?? "");
  const ingredient = nature === "ingredient";
  const choisirNature = (n: "produit" | "ingredient") => {
    setNature(n);
    setUnite(n === "ingredient" ? "kg" : "piece");
    setCategorie(n === "ingredient" ? (categorieIngredients ?? "") : (categories.find((c) => c.id !== categorieIngredients)?.id ?? ""));
  };
  return (
    <form onSubmit={soumettre(action)} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="nature" value={nature} />
      <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold sm:col-span-2">
        {(
          [
            ["produit", "Produit vendu"],
            ["ingredient", "Ingrédient du laboratoire"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" onClick={() => choisirNature(v)} className={cx("rounded-lg py-2", nature === v ? "bg-white shadow-sm" : "text-stone-500")}>
            {l}
          </button>
        ))}
      </div>
      <Champ label="Nom">
        <input name="nom" required className={classesChamp} placeholder={ingredient ? "ex. Farine T55" : "ex. Caramel Can"} />
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
          <input name="format" className={classesChamp} placeholder={ingredient ? "ex. sac de 25 kg" : "ex. 330 ml"} />
        </Champ>
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
