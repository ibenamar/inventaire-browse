import { pourSaisie } from "../vues";
import { partsSiEnGateaux } from "@/domain/unites";
import { redirect } from "next/navigation";
import { GrilleQuantites } from "@/components/GrilleQuantites";
import { ouvertureACompter } from "@/server/services/shifts";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";

export default async function Ouverture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const lignes = d.lignes.filter((l) => ouvertureACompter(d.shift.modeOuverture, l));
  return (
    <>
      <EnteteEtape
        id={id}
        titre="Comptage d'ouverture"
        aide={
          d.shift.modeOuverture === "recomptage"
            ? "Comptez le stock présent à votre arrivée. Les différences avec la clôture de l'équipe précédente seront signalées (écart de passation)."
            : "Ces produits n'ont pas de stock connu (premier shift ou nouveau produit) : comptez-les."
        }
      />
      <GrilleQuantites
        shiftId={id}
        champ="ouvertureComptee"
        produits={lignes.map((l) => ({ ...pourSaisie(l), valeur: l.ouvertureComptee, parGateau: partsSiEnGateaux(d.shift.typeSite, l) }))}
      />
    </>
  );
}
