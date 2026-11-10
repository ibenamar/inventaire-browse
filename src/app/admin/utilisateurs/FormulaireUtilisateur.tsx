"use client";

import { useActionState, useEffect, useRef } from "react";
import { Bouton, Champ, classesChamp, Message, soumettre } from "@/components/ui";
import type { Resultat } from "@/lib/resultat";

const ROLES = [
  { v: "employe", l: "Employé" },
  { v: "labo", l: "Équipe laboratoire" },
  { v: "manager", l: "Manager de site" },
  { v: "direction", l: "Direction" },
];

export function FormulaireUtilisateur({
  action,
  sites,
  initial,
  creation,
}: {
  action: (e: unknown, f: FormData) => Promise<Resultat>;
  sites: { id: string; nom: string }[];
  initial?: { nom: string; role: string; actif: boolean; siteIds: string[] };
  creation?: boolean;
}) {
  const [etat, act, enCours] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (creation && etat?.ok) ref.current?.reset();
  }, [etat, creation]);
  return (
    <form ref={ref} onSubmit={soumettre(act)} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Champ label="Nom">
          <input name="nom" required defaultValue={initial?.nom} className={classesChamp} />
        </Champ>
        <Champ label="Rôle">
          <select name="role" defaultValue={initial?.role ?? "employe"} className={classesChamp}>
            {ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.l}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label={creation ? "Code PIN (4 à 6 chiffres, 6 pour un manager)" : "Nouveau code PIN"} aide={creation ? undefined : "Laisser vide pour ne pas changer"}>
          <input name="pin" inputMode="numeric" pattern="\d{4,6}" required={creation} autoComplete="off" className={classesChamp} />
        </Champ>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-stone-700">Sites (la direction a accès à tous)</legend>
        <div className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
              <input type="checkbox" name="siteIds" value={s.id} defaultChecked={initial?.siteIds.includes(s.id)} className="size-5" />
              {s.nom}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="actif" defaultChecked={initial?.actif ?? true} className="size-5" />
        Compte actif
      </label>
      {etat && <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>}
      <Bouton type="submit" disabled={enCours} className="justify-self-start">
        {creation ? "Créer l'utilisateur" : "Enregistrer"}
      </Bouton>
    </form>
  );
}
