"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Bouton, Carte, cx, Message } from "@/components/ui";
import { connexion } from "./actions";

interface U {
  id: string;
  nom: string;
}

const TOUCHES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function FormulaireConnexion({ site, utilisateurs }: { site: { id: string; nom: string }; utilisateurs: U[] }) {
  const [choisi, setChoisi] = useState<U | null>(null);
  const [pin, setPin] = useState("");
  const [etat, action, enCours] = useActionState(connexion, null);
  const [direction, setDirection] = useState(false);
  const [nomDirection, setNomDirection] = useState("");
  // Code refusé : on repart d'un code vide plutôt que d'obliger à effacer chiffre par chiffre.
  useEffect(() => {
    if (etat?.erreur) setPin("");
  }, [etat]);

  if (!choisi && !direction) {
    return (
      <Carte>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{site.nom}</h2>
          <Link href="/login?site=" className="text-sm text-marque-700 underline">
            Changer de site
          </Link>
        </div>
        <p className="mb-3 text-stone-600">Qui êtes-vous ?</p>
        <div className="grid grid-cols-2 gap-2">
          {utilisateurs.map((u) => (
            <button
              key={u.id}
              onClick={() => setChoisi(u)}
              className="flex min-h-16 items-center gap-3 rounded-xl bg-stone-50 px-3 text-left ring-1 ring-stone-200 hover:bg-marque-50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marque-200 font-bold text-marque-900">
                {u.nom.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 truncate font-semibold">{u.nom}</span>
            </button>
          ))}
        </div>
        {utilisateurs.length === 0 && <Message ton="alerte">Aucun utilisateur rattaché à ce site.</Message>}
        <button onClick={() => setDirection(true)} className="mt-4 text-sm font-semibold text-marque-700 underline">
          Compte direction
        </button>
      </Carte>
    );
  }

  return (
    <Carte>
      <button
        onClick={() => {
          setChoisi(null);
          setDirection(false);
          setPin("");
        }}
        className="mb-2 text-sm text-marque-700 underline"
      >
        ← Changer d&apos;utilisateur
      </button>
      {direction ? (
        <label className="mb-2 block">
          <span className="text-lg font-semibold">Compte direction</span>
          <input
            aria-label="Nom du compte direction"
            value={nomDirection}
            onChange={(e) => setNomDirection(e.target.value)}
            autoComplete="username"
            placeholder="Votre nom"
            className="mt-1 block w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-300"
          />
        </label>
      ) : (
        <h2 className="text-lg font-semibold">{choisi!.nom}</h2>
      )}
      <p className="mb-4 text-stone-600">Saisissez votre code PIN</p>
      <form action={action}>
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="utilisateurId" value={choisi?.id ?? ""} />
        {direction && <input type="hidden" name="nomDirection" value={nomDirection} />}
        {direction && <input type="hidden" name="modeDirection" value="1" />}
        <input type="hidden" name="pin" value={pin} />
        <div className="mb-4 flex justify-center gap-3" aria-label={`${pin.length} chiffres saisis`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={cx("size-4 rounded-full", i < pin.length ? "bg-marque-700" : "bg-stone-200")} />
          ))}
        </div>
        {etat?.erreur && (
          <div className="mb-3">
            <Message ton="erreur">{etat.erreur}</Message>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {TOUCHES.map((t, i) =>
            t === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                aria-label={t === "⌫" ? "Effacer" : t}
                onClick={() => setPin((p) => (t === "⌫" ? p.slice(0, -1) : p.length < 6 ? p + t : p))}
                className="min-h-16 rounded-xl bg-stone-100 text-2xl font-semibold active:bg-stone-200"
              >
                {t}
              </button>
            ),
          )}
        </div>
        <Bouton type="submit" grand className="mt-4 w-full" disabled={pin.length < 4 || enCours || (direction && !nomDirection.trim())}>
          {enCours ? "Vérification…" : "Valider"}
        </Bouton>
      </form>
    </Carte>
  );
}
