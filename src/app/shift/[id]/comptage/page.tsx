import { redirect } from "next/navigation";
import { GrilleQuantites } from "@/components/GrilleQuantites";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";

export default async function Comptage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d } = await chargerShift(id);
  if (d.shift.statut !== "ouvert") redirect(`/shift/${id}/cloture`);
  return (
    <>
      <EnteteEtape id={id} titre="Comptage de fin de shift" aide="Comptez le stock réellement présent. Saisissez 0 pour un produit épuisé." />
      <GrilleQuantites
        shiftId={id}
        champ="stockReelFin"
        produits={d.lignes.filter((l) => l.suiviStock).map((l) => ({ ...l, valeur: l.stockReelFin }))}
      />
    </>
  );
}
