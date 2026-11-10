"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bouton, classesChamp, Message } from "@/components/ui";
import { actionAffecter, actionDupliquerSemaine, actionRetirer } from "../actions";

interface ShiftCase {
  id: string;
  statut: "planifie" | "ouvert" | "cloture" | "valide";
  responsableId: string | null;
  responsable: string | null;
  equipierId: string | null;
  equipier: string | null;
}

export function CasePlanning({
  siteId,
  journee,
  creneauId,
  nom,
  horaire,
  equipiers,
  shift,
  remontee,
}: {
  siteId: string;
  journee: string;
  creneauId: string | null;
  nom: string;
  horaire: string;
  equipiers: { id: string; nom: string }[];
  shift: ShiftCase | null;
  remontee: React.ReactNode;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [resp, setResp] = useState(shift?.responsableId ?? "");
  const [equip, setEquip] = useState(shift?.equipierId ?? "");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const modifiable = creneauId && (!shift || shift.statut === "planifie" || shift.statut === "ouvert");

  const lancer = (f: () => Promise<{ ok: boolean; erreur?: string }>) =>
    demarrer(async () => {
      setErreur(null);
      const r = await f();
      if (!r.ok) setErreur(r.erreur ?? "Erreur");
      else {
        setEdition(false);
        router.refresh();
      }
    });

  return (
    <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{nom}</div>
          <div className="text-xs text-stone-500">{horaire}</div>
        </div>
        {remontee}
      </div>
      {!edition ? (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0 text-sm">
            {shift ? (
              <>
                <div>
                  <span className="text-stone-500">Responsable :</span> <span className="font-semibold">{shift.responsable ?? "—"}</span>
                </div>
                {shift.equipier && (
                  <div>
                    <span className="text-stone-500">Coéquipier :</span> {shift.equipier}
                  </div>
                )}
              </>
            ) : (
              <span className="text-stone-400">Non planifié</span>
            )}
          </div>
          {modifiable && (
            <button onClick={() => setEdition(true)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-marque-700 hover:bg-marque-50">
              {shift ? "Modifier" : "Planifier"}
            </button>
          )}
          {/* Shift resté sur un créneau supprimé : on peut encore le retirer du planning. */}
          {!creneauId && shift?.statut === "planifie" && (
            <button
              onClick={() => lancer(() => actionRetirer(siteId, shift.id))}
              disabled={enCours}
              className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Retirer
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 grid gap-2">
          <select aria-label="Responsable d'inventaire" value={resp} onChange={(e) => setResp(e.target.value)} className={classesChamp}>
            <option value="">Responsable d&apos;inventaire…</option>
            {equipiers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom}
              </option>
            ))}
          </select>
          <select aria-label="Coéquipier" value={equip} onChange={(e) => setEquip(e.target.value)} className={classesChamp}>
            <option value="">Sans coéquipier</option>
            {equipiers
              .filter((u) => u.id !== resp)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom}
                </option>
              ))}
          </select>
          {erreur && <Message ton="erreur">{erreur}</Message>}
          <div className="flex flex-wrap gap-2">
            <Bouton
              disabled={!resp || enCours}
              onClick={() =>
                lancer(() => actionAffecter({ siteId, journee, creneauId: creneauId!, responsableId: resp, equipierId: equip || null }))
              }
            >
              Enregistrer
            </Bouton>
            <Bouton variante="secondaire" onClick={() => setEdition(false)}>
              Annuler
            </Bouton>
            {shift?.statut === "planifie" && (
              <Bouton variante="discret" onClick={() => lancer(() => actionRetirer(siteId, shift.id))} disabled={enCours}>
                Retirer
              </Bouton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DupliquerSemaine({ siteId, lundi }: { siteId: string; lundi: string }) {
  const router = useRouter();
  const [semaines, setSemaines] = useState(1);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <select aria-label="Nombre de semaines" value={semaines} onChange={(e) => setSemaines(Number(e.target.value))} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-300">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              sur {n} semaine{n > 1 ? "s" : ""} suivante{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <Bouton
          variante="secondaire"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await actionDupliquerSemaine(siteId, lundi, semaines);
              setRetour(r.ok ? { ok: true, texte: String(r.valeur) } : { ok: false, texte: r.erreur });
              if (r.ok) router.refresh();
            })
          }
        >
          Copier cette semaine
        </Bouton>
      </div>
      {retour && <Message ton={retour.ok ? "succes" : "erreur"}>{retour.texte}</Message>}
    </div>
  );
}
