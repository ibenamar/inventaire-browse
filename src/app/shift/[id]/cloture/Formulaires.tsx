"use client";

import { useActionState } from "react";
import { actionCloturer, actionForcerCloture } from "@/app/actions-shift";
import { Bouton, classesChamp, Message } from "@/components/ui";

export function FormulaireCloture({ shiftId, pret }: { shiftId: string; pret: boolean }) {
  const [etat, action, enCours] = useActionState(actionCloturer.bind(null, shiftId), null);
  return (
    <form action={action} className="grid gap-3">
      <textarea name="commentaire" rows={2} placeholder="Commentaire de passation (facultatif)" className={classesChamp} />
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
