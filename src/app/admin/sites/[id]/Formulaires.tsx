"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Bouton, Carte, Champ, classesChamp, cx, Message, soumettre } from "@/components/ui";
import { finLendemain, validerCreneaux } from "@/domain/creneaux";
import { estHeure, NOMS_JOURS_COURTS } from "@/domain/temps";
import { actionEnregistrerCreneaux, actionModifierSite } from "../../actions";

export function FormulaireSite({ site }: { site: { id: string; statut: string; modeOuverture: string } }) {
  const [etat, action, enCours] = useActionState(actionModifierSite.bind(null, site.id), null);
  return (
    <Carte>
      <h2 className="mb-3 text-lg font-semibold">Paramètres</h2>
      <form onSubmit={soumettre(action)} className="grid gap-3 sm:grid-cols-2">
        <Champ label="Statut">
          <select name="statut" defaultValue={site.statut} className={classesChamp}>
            <option value="actif">Actif</option>
            <option value="en_ouverture">En ouverture</option>
          </select>
        </Champ>
        <Champ label="Stock d'ouverture" aide="Le recomptage fait apparaître les écarts de passation entre équipes.">
          <select name="modeOuverture" defaultValue={site.modeOuverture} className={classesChamp}>
            <option value="reprise">Reprise de la clôture précédente</option>
            <option value="recomptage">Recomptage par l&apos;équipe entrante</option>
          </select>
        </Champ>
        <div className="sm:col-span-2 grid gap-2">
          {etat && <Message ton={etat.ok ? "succes" : "erreur"}>{etat.ok ? etat.message : etat.erreur}</Message>}
          <Bouton type="submit" disabled={enCours} className="justify-self-start">
            Enregistrer
          </Bouton>
        </div>
      </form>
    </Carte>
  );
}

interface Ligne {
  id?: string;
  cle: string;
  nom: string;
  heureDebut: string;
  heureFin: string;
  jours: number[];
}

const TOUS = [1, 2, 3, 4, 5, 6, 7];

export function EditeurCreneaux({ siteId, initial }: { siteId: string; initial: Omit<Ligne, "cle">[] }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>(() => initial.map((c, i) => ({ ...c, cle: c.id ?? String(i) })));
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  // Contrôle immédiat des chevauchements (mêmes règles que le serveur).
  const erreurs = useMemo(
    () =>
      lignes.every((l) => estHeure(l.heureDebut) && estHeure(l.heureFin))
        ? validerCreneaux(lignes.map((l) => ({ ...l, id: l.cle })))
        : ["Heures au format HH:MM attendues."],
    [lignes],
  );

  const maj = (cle: string, v: Partial<Ligne>) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...v } : l)));

  return (
    <Carte>
      <h2 className="text-lg font-semibold">Créneaux</h2>
      <p className="mb-3 text-sm text-stone-600">
        Une heure de fin inférieure à l&apos;heure de début signifie « le lendemain ». Le jour coché est celui où le shift <strong>commence</strong>
        : la nuit du vendredi suit les horaires du vendredi.
      </p>
      <div className="grid gap-3">
        {lignes.map((l) => (
          <div key={l.cle} className="grid gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 sm:grid-cols-[1fr_9.5rem_9.5rem_auto]">
              <input aria-label="Nom du créneau" value={l.nom} onChange={(e) => maj(l.cle, { nom: e.target.value })} placeholder="Nom (ex. Matin)" className={cx(classesChamp, "col-span-3 sm:col-span-1")} />
              <label className="text-xs font-semibold text-stone-600">
                Début
                <input type="time" value={l.heureDebut} onChange={(e) => maj(l.cle, { heureDebut: e.target.value })} className={classesChamp} />
              </label>
              <label className="text-xs font-semibold text-stone-600">
                Fin {estHeure(l.heureDebut) && estHeure(l.heureFin) && finLendemain(l) && <span className="text-marque-700">(lendemain)</span>}
                <input type="time" value={l.heureFin} onChange={(e) => maj(l.cle, { heureFin: e.target.value })} className={classesChamp} />
              </label>
              <button onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))} className="h-11 rounded-lg px-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                Retirer
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {TOUS.map((j) => {
                const actif = l.jours.includes(j);
                return (
                  <button
                    key={j}
                    aria-pressed={actif}
                    onClick={() => maj(l.cle, { jours: actif ? l.jours.filter((x) => x !== j) : [...l.jours, j].sort() })}
                    className={cx("min-w-12 rounded-lg px-2 py-1.5 text-sm font-semibold ring-1", actif ? "bg-marque-700 text-white ring-marque-700" : "bg-white ring-stone-300")}
                  >
                    {NOMS_JOURS_COURTS[j]}
                  </button>
                );
              })}
              <button onClick={() => maj(l.cle, { jours: [1, 2, 3, 4, 5] })} className="rounded-lg px-2 text-xs text-marque-700 underline">
                Semaine
              </button>
              <button onClick={() => maj(l.cle, { jours: [6, 7] })} className="rounded-lg px-2 text-xs text-marque-700 underline">
                Week-end
              </button>
              <button onClick={() => maj(l.cle, { jours: TOUS })} className="rounded-lg px-2 text-xs text-marque-700 underline">
                Tous
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        <Bouton
          variante="secondaire"
          className="justify-self-start"
          onClick={() => setLignes((ls) => [...ls, { cle: crypto.randomUUID(), nom: "", heureDebut: "07:00", heureFin: "15:00", jours: TOUS }])}
        >
          + Ajouter un créneau
        </Bouton>
        {erreurs.length > 0 && <Message ton="alerte">{erreurs.join("\n")}</Message>}
        {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
        <Bouton
          className="justify-self-start"
          disabled={erreurs.length > 0 || enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await actionEnregistrerCreneaux(
                siteId,
                lignes.map(({ id, nom, heureDebut, heureFin, jours }) => ({ id, nom, heureDebut, heureFin, jours })),
              );
              setRetour(r.ok ? { ok: true, texte: r.message ?? "Enregistré" } : { ok: false, texte: r.erreur });
              if (r.ok) {
                // Les nouveaux créneaux ont maintenant un identifiant : un second enregistrement les met à jour au lieu de les dupliquer.
                const enregistres = (r.valeur ?? []) as Omit<Ligne, "cle">[];
                setLignes(enregistres.map((c) => ({ id: c.id, nom: c.nom, heureDebut: c.heureDebut, heureFin: c.heureFin, jours: c.jours, cle: c.id! })));
                router.refresh();
              }
            })
          }
        >
          Enregistrer les créneaux
        </Bouton>
        <p className="text-xs text-stone-500">Les shifts déjà planifiés gardent leurs horaires ; les modifications s&apos;appliquent aux nouvelles planifications.</p>
      </div>
    </Carte>
  );
}
