"use client";

import { useState, useTransition } from "react";
import type { Resultat } from "@/lib/resultat";
import { Bouton, Message } from "./ui";

/** Bouton qui déclenche une action serveur et affiche son éventuelle erreur. */
export function BoutonAction({
  action,
  children,
  confirmation,
  variante,
  grand,
  className,
}: {
  action: () => Promise<Resultat<unknown>>;
  children: React.ReactNode;
  confirmation?: string;
  variante?: "primaire" | "secondaire" | "danger" | "discret";
  grand?: boolean;
  className?: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <Bouton
        variante={variante}
        grand={grand}
        className={className}
        disabled={enCours}
        onClick={() => {
          if (confirmation && !window.confirm(confirmation)) return;
          setErreur(null);
          setSucces(null);
          demarrer(async () => {
            const r = await action();
            if (r && !r.ok) setErreur(r.erreur);
            else if (r?.ok && r.message) setSucces(r.message);
          });
        }}
      >
        {enCours ? "Un instant…" : children}
      </Bouton>
      {erreur && <Message ton="erreur">{erreur}</Message>}
      {succes && <Message ton="succes">{succes}</Message>}
    </div>
  );
}
