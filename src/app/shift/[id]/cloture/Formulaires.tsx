"use client";

import { useActionState, useState } from "react";
import { actionCloturer, actionForcerCloture } from "@/app/actions-shift";
import { Bouton, classesChamp, Message, soumettre } from "@/components/ui";

export function FormulaireCloture({
  shiftId,
  pret,
  ecartsAExpliquer = [],
  confirmation,
}: {
  shiftId: string;
  pret: boolean;
  ecartsAExpliquer?: string[];
  confirmation?: string;
}) {
  const [etat, action, enCours] = useActionState(actionCloturer.bind(null, shiftId), null);
  // Champ contrôlé : le commentaire n'est pas effacé si la clôture est refusée.
  const [commentaire, setCommentaire] = useState("");
  const obligatoire = ecartsAExpliquer.length > 0;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmation && !window.confirm(confirmation)) e.preventDefault();
      }}
      className="grid gap-3"
    >
      {obligatoire && (
        <Message ton="alerte">
          Écart important : {ecartsAExpliquer.join(", ")}. Recomptez ces produits ; si l&apos;écart se confirme, expliquez-le ci-dessous (commentaire
          obligatoire).
        </Message>
      )}
      <label htmlFor="commentaire-cloture" className="text-sm font-medium">
        {obligatoire ? "Explication de l'écart (obligatoire)" : "Commentaire de passation (facultatif)"}
      </label>
      <textarea
        id="commentaire-cloture"
        name="commentaire"
        rows={2}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        required={obligatoire}
        minLength={obligatoire ? 5 : undefined}
        placeholder={obligatoire ? "Ce qui explique l'écart après recomptage" : "Pour l'équipe suivante"}
        className={classesChamp}
      />
      {etat && !etat.ok && <Message ton="erreur">{etat.erreur}</Message>}
      <Bouton grand disabled={!pret || enCours} type="submit">
        {enCours ? "Clôture…" : "Clôturer et signer le shift"}
      </Bouton>
    </form>
  );
}

export function FormulaireForcer({ shiftId }: { shiftId: string }) {
  const [etat, action, enCours] = useActionState(actionForcerCloture.bind(null, shiftId), null);
  return (
    <details className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <summary className="cursor-pointer font-semibold text-destructive">Forcer la clôture (manager)</summary>
      <p className="my-2 text-sm text-muted-foreground">
        Pour un shift abandonné : les produits non comptés prennent leur stock théorique. La clôture est marquée comme forcée.
      </p>
      <form onSubmit={soumettre(action)} className="grid gap-2">
        <label htmlFor="motif-forcer" className="text-sm font-medium">
          Motif (obligatoire)
        </label>
        <input id="motif-forcer" name="motif" required minLength={5} placeholder="Ex. équipe partie sans clôturer" className={classesChamp} />
        {etat && !etat.ok && <Message ton="erreur">{etat.erreur}</Message>}
        <Bouton variante="danger" disabled={enCours} type="submit">
          Forcer la clôture
        </Bouton>
      </form>
    </details>
  );
}
