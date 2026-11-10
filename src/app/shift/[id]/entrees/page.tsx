import { redirect } from "next/navigation";
import { formatLocal } from "@/domain/temps";
import { estEncadrant } from "@/server/acteur";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { ListeMouvements } from "../ListeMouvements";
import { FormulaireEntrees } from "./FormulaireEntrees";

const ORIGINES = { labo: "Laboratoire", fournisseur: "Fournisseur", autre_site: "Autre point de vente", autre: "Autre" };

export default async function Entrees({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const peutSupprimer = (auteur: string) =>
    auteur === session.acteur.id || estEncadrant(session.acteur) || d.shift.responsableId === session.acteur.id;
  return (
    <>
      <EnteteEtape id={id} titre="Réceptions" aide="Saisissez ce que vous recevez. Les cakes peuvent être saisis en gâteaux entiers (convertis en parts)." />
      <FormulaireEntrees shiftId={id} produits={d.lignes.filter((l) => l.suiviStock)} />
      <ListeMouvements
        shiftId={id}
        titre="Réceptions enregistrées"
        mouvements={d.mouvements
          .filter((m) => m.type === "entree")
          .map((m) => ({
            id: m.id,
            produit: m.produit,
            quantite: m.quantite,
            detail: [m.origine ? ORIGINES[m.origine] : null, m.commentaire].filter(Boolean).join(" · "),
            utilisateur: m.utilisateur,
            heure: formatLocal(m.horodatage, "HH:mm"),
            supprimable: peutSupprimer(m.utilisateurId),
          }))}
      />
      <div className="h-24" />
    </>
  );
}
