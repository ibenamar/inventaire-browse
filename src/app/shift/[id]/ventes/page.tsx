import Link from "next/link";
import { redirect } from "next/navigation";
import { GrilleQuantites } from "@/components/GrilleQuantites";
import { cx, Message } from "@/components/ui";
import { VentesLoyverse } from "@/components/VentesLoyverse";
import { estEncadrant } from "@/server/acteur";
import { getDb } from "@/lib/db";
import { listerCanaux } from "@/server/services/caisse";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";

export default async function Ventes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ canal?: string }>;
}) {
  const { id } = await params;
  const { d, session, synchro, loyverseConfigure } = await chargerShift(id);
  if (d.shift.statut !== "ouvert") redirect(`/shift/${id}/cloture`);
  const canaux = await listerCanaux(await getDb());
  const { canal: code } = await searchParams;
  const canal = canaux.find((c) => c.code === code) ?? canaux[0];
  const autres = (l: (typeof d.lignes)[number]) =>
    canaux
      .filter((c) => c.id !== canal.id && l.ventesParCanal[c.id])
      .map((c) => `${c.nom} : ${l.ventesParCanal[c.id]}`)
      .join(" · ");
  return (
    <>
      <EnteteEtape
        id={id}
        titre="Ventes du shift"
        aide="Reportez les quantités vendues du rapport Loyverse, canal par canal : chaque canal a son propre prix."
      />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Canal de vente">
        {canaux.map((c) => {
          const total = d.ventesParCanal.find((v) => v.canalId === c.id)?.quantite ?? 0;
          return (
            <Link
              key={c.id}
              role="tab"
              aria-selected={c.id === canal.id}
              href={`/shift/${id}/ventes?canal=${c.code}`}
              className={cx(
                "rounded-xl px-4 py-2.5 font-semibold ring-1",
                c.id === canal.id ? "bg-marque-700 text-white ring-marque-700" : "bg-white text-stone-700 ring-stone-300",
              )}
            >
              {c.nom}
              {total > 0 && <span className="ml-2 text-sm opacity-80">{total}</span>}
            </Link>
          );
        })}
      </div>
      <div className="mb-3 grid gap-2">
        {loyverseConfigure ? (
          <>
            <VentesLoyverse
              shiftId={id}
              ouvert
              peutReimporter={estEncadrant(session.acteur)}
              derniere={synchro}
              auto
              lienAdmin={session.acteur.role === "direction"}
            />
            <Message>
              Les ventes viennent des tickets Loyverse du shift (tous canaux, même stock). Une correction manuelle ci-dessous sera remplacée au
              prochain import.
            </Message>
          </>
        ) : (
          <Message>Les ventes de tous les canaux font sortir le même stock. Jeton Loyverse non configuré : saisie manuelle.</Message>
        )}
      </div>
      <GrilleQuantites
        key={`${canal.id}-${synchro?.horodatage ?? ""}`}
        shiftId={id}
        champ="ventes"
        canalId={canal.id}
        nullable={false}
        produits={d.lignes.map((l) => ({
          ...l,
          valeur: l.ventesParCanal[canal.id] ?? 0,
          aide: [l.suiviStock ? null : "vente seule", autres(l)].filter(Boolean).join(" · ") || null,
        }))}
      />
    </>
  );
}
