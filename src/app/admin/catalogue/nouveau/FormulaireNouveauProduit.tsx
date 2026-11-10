"use client";

import { useActionState, useState } from "react";
import { Bouton, Champ, classesChamp, Message } from "@/components/ui";
import { actionCreerProduit } from "../../actions";

export function FormulaireNouveauProduit({ categories }: { categories: { id: string; nom: string }[] }) {
  const [etat, action, enCours] = useActionState(actionCreerProduit, null);
  const [unite, setUnite] = useState("piece");
  const [categorie, setCategorie] = useState(categories[0]?.id ?? "");
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Champ label="Nom">
        <input name="nom" required className={classesChamp} placeholder="ex. Caramel Can" />
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
          <option value="piece">Pièce</option>
          <option value="part">Part (gâteau découpé)</option>
          <option value="bouteille">Bouteille</option>
        </select>
      </Champ>
      {unite === "part" ? (
        <Champ label="Parts par gâteau">
          <input name="partsParGateau" inputMode="numeric" defaultValue={8} className={classesChamp} />
        </Champ>
      ) : (
        <Champ label="Format (facultatif)">
          <input name="format" className={classesChamp} placeholder="ex. 330 ml" />
        </Champ>
      )}
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="suiviStock" defaultChecked className="size-5" />
        Suivi en stock (décocher pour un produit préparé à la commande)
      </label>
      <div className="grid gap-2 sm:col-span-2">
        {etat && !etat.ok && <Message ton="erreur">{etat.erreur}</Message>}
        <Bouton type="submit" disabled={enCours} className="justify-self-start">
          Créer le produit
        </Bouton>
      </div>
    </form>
  );
}
