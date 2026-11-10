"use client";

import { useActionState, useState } from "react";
import { actionCloturer, actionForcerCloture } from "@/app/actions-shift";
import { Bouton, classesChamp, Message } from "@/components/ui";

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
      <textarea
        name="commentaire"
        rows={2}
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
        required={obligatoire}
        minLength={obligatoire ? 5 : undefined}
        placeholder={obligatoire ? "Explication de l'écart (obligatoire)" : "Commentaire de passation (facultatif)"}
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
    <details className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <summary className="cursor-pointer font-semibold text-red-800">Forcer la clôture (manager)</summary>
      <p className="my-2 text-sm text-stone-600">
        Pour un shift abandonné : les produits non comptés prennent leur stock théorique. La clôture est marquée comme forcée.
      </p>
      <form action={action} className="grid gap-2">
        <input name="motif" required minLength={5} placeholder="Motif (obligatoire)" className={classesChamp} />
        {etat && !etat.ok && <Message ton="erreur">{etat.erreur}</Message>}
        <Bouton variante="danger" disabled={enCours} type="submit">
          Forcer la clôture
        </Bouton>
      </form>
    </details>
  );
}
