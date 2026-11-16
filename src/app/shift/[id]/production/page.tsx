import { pourSaisie, quantiteMouvement } from "../vues";
import { redirect } from "next/navigation";
import { formatLocal } from "@/domain/temps";
import { estEncadrant } from "@/server/acteur";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { FormulaireEntrees } from "../entrees/FormulaireEntrees";
import { ListeMouvements } from "../ListeMouvements";

/**
 * Production du laboratoire : produits finis et préparations intermédiaires fabriqués pendant le shift
 * entrent dans son stock ; leurs fiches techniques donnent la consommation attendue de leurs composants.
 */
export default async function Production({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  if (d.shift.typeSite !== "laboratoire") redirect(`/shift/${id}`);
  const peutSupprimer = (auteur: string) =>
    auteur === session.acteur.id || estEncadrant(session.acteur) || d.shift.responsableId === session.acteur.id;
  return (
    <>
      <EnteteEtape
        id={id}
        titre="Production"
        aide="Saisissez ce qui sort du four et les préparations intermédiaires faites (pâtes, crèmes… en kg ou en litres). Les cakes se saisissent en gâteaux entiers."
      />
      <FormulaireEntrees
        shiftId={id}
        produits={d.lignes.filter((l) => l.suiviStock && l.nature !== "ingredient").map(pourSaisie)}
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
