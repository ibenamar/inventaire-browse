import { redirect } from "next/navigation";
import { GrilleQuantites } from "@/components/GrilleQuantites";
import { Message } from "@/components/ui";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";

export default async function Ventes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d } = await chargerShift(id);
  if (d.shift.statut !== "ouvert") redirect(`/shift/${id}/cloture`);
  return (
    <>
      <EnteteEtape id={id} titre="Ventes du shift" aide="Reportez les quantités vendues du rapport Loyverse pour la période du shift." />
      <div className="mb-3">
        <Message>L&apos;import automatique des ventes depuis Loyverse arrive en phase 2 : cette saisie deviendra alors inutile.</Message>
      </div>
      <GrilleQuantites
        shiftId={id}
        champ="ventes"
        nullable={false}
        produits={d.lignes.map((l) => ({ ...l, valeur: l.ventes, aide: l.suiviStock ? null : "vente seule" }))}
      />
    </>
  );
}
