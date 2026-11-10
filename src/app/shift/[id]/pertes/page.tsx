import { pourSaisie, quantiteMouvement } from "../vues";
import { redirect } from "next/navigation";
import { formatLocal } from "@/domain/temps";
import { estEncadrant } from "@/server/acteur";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { ListeMouvements } from "../ListeMouvements";
import { FormulairePerte } from "./FormulairePerte";

export default async function Pertes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const peutSupprimer = (auteur: string) =>
    auteur === session.acteur.id || estEncadrant(session.acteur) || d.shift.responsableId === session.acteur.id;
  return (
    <>
      <EnteteEtape id={id} titre="Pertes" aide="Touchez le produit concerné, puis indiquez le motif et la quantité." />
      <FormulairePerte shiftId={id} produits={d.lignes.filter((l) => l.suiviStock).map(pourSaisie)} gateauxParDefaut={d.shift.typeSite === "laboratoire"} />
      <ListeMouvements
        shiftId={id}
        titre="Pertes déclarées"
        mouvements={d.mouvements
          .filter((m) => m.type === "perte")
          .map((m) => ({
            id: m.id,
            produit: m.produit,
            quantite: quantiteMouvement(d.lignes, m),
            detail: [m.motif === "peremption" ? "Péremption" : "Endommagé", m.commentaire].filter(Boolean).join(" · "),
            utilisateur: m.utilisateur,
            heure: formatLocal(m.horodatage, "HH:mm"),
            supprimable: peutSupprimer(m.utilisateurId),
          }))}
      />
    </>
  );
}
