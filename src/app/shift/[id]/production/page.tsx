import { pourSaisie, quantiteMouvement } from "../vues";
import { redirect } from "next/navigation";
import { formatLocal } from "@/domain/temps";
import { estEncadrant } from "@/server/acteur";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { FormulaireEntrees } from "../entrees/FormulaireEntrees";
import { ListeMouvements } from "../ListeMouvements";

/** Production du laboratoire : les fabrications du shift entrent dans son stock. */
export default async function Production({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  if (d.shift.typeSite !== "laboratoire") redirect(`/shift/${id}`);
  const peutSupprimer = (auteur: string) =>
    auteur === session.acteur.id || estEncadrant(session.acteur) || d.shift.responsableId === session.acteur.id;
  return (
    <>
      <EnteteEtape id={id} titre="Production" aide="Saisissez ce qui sort du four ou de la préparation. Les cakes se saisissent en gâteaux entiers." />
      <FormulaireEntrees
        shiftId={id}
        produits={d.lignes.filter((l) => l.suiviStock && l.nature === "produit").map(pourSaisie)}
        origines={[{ v: "production", l: "Production" }]}
        gateauxParDefaut
        libelleAction="Enregistrer la production"
        placeholderCommentaire="Commentaire (fournée, remarque…)"
      />
      <ListeMouvements
        shiftId={id}
        titre="Productions du shift"
        mouvements={d.mouvements
          .filter((m) => m.type === "entree" && m.origine === "production")
          .map((m) => ({
            id: m.id,
            produit: m.produit,
            quantite: quantiteMouvement(d.lignes, m),
            detail: m.commentaire ?? "Production",
            utilisateur: m.utilisateur,
            heure: formatLocal(m.horodatage, "HH:mm"),
            supprimable: peutSupprimer(m.utilisateurId),
          }))}
      />
      <div className="h-24" />
    </>
  );
}
