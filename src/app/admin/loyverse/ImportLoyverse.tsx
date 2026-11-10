"use client";

import { useState, useTransition } from "react";
import { Bouton, Message } from "@/components/ui";
import type { RapportImport } from "@/server/services/loyverse";
import { actionImporterLoyverse } from "../actions";

export function ImportLoyverse({ actif }: { actif: boolean }) {
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="grid gap-3">
      <Bouton
        className="justify-self-start"
        disabled={!actif || enCours}
        onClick={() =>
          demarrer(async () => {
            setErreur(null);
            const r = await actionImporterLoyverse();
            if (r.ok) setRapport(r.valeur ?? null);
            else setErreur(r.erreur);
          })
        }
      >
        {enCours ? "Import en cours…" : "Importer les articles et les prix"}
      </Bouton>
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {rapport && (
        <div className="grid gap-2 text-sm">
          <Message ton="succes">{rapport.associes.length} produit(s) associé(s) à Loyverse.</Message>
          {rapport.produitsSansCorrespondance.length > 0 && (
            <Message ton="alerte">
              Sans correspondance (renseigner le SKU dans la fiche produit) : {rapport.produitsSansCorrespondance.join(", ")}
            </Message>
          )}
          {rapport.articlesLoyverseNonUtilises.length > 0 && (
            <details>
              <summary className="cursor-pointer text-stone-600">
                {rapport.articlesLoyverseNonUtilises.length} article(s) Loyverse non utilisé(s)
              </summary>
              <p className="mt-1 text-stone-600">{rapport.articlesLoyverseNonUtilises.join(", ")}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
