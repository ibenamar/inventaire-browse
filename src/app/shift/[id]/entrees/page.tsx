import { pourSaisie, quantiteMouvement } from "../vues";
import { redirect } from "next/navigation";
import { formatLocal, journeeLocale, libelleJournee } from "@/domain/temps";
import { LIBELLE_ORIGINE } from "@/domain/unites";
import { getDb } from "@/lib/db";
import { estEncadrant } from "@/server/acteur";
import { listerBons } from "@/server/services/livraisons";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { ListeMouvements } from "../ListeMouvements";
import { FormulaireEntrees, type OptionOrigine } from "./FormulaireEntrees";
import { ReceptionBons } from "./ReceptionBons";

const ORIGINES_POINT_DE_VENTE: OptionOrigine[] = [
  { v: "labo", l: "Livraison du laboratoire (sans bon)" },
  { v: "fournisseur", l: "Fournisseur (boissons)" },
  { v: "autre_site", l: "Autre point de vente" },
  { v: "autre", l: "Autre" },
];
const ORIGINES_LABO: OptionOrigine[] = [
  { v: "fournisseur", l: "Fournisseur" },
  { v: "autre_site", l: "Retour d'un point de vente" },
  { v: "autre", l: "Autre" },
];

export default async function Entrees({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const labo = d.shift.typeSite === "laboratoire";
  const peutSupprimer = (auteur: string) =>
    auteur === session.acteur.id || estEncadrant(session.acteur) || d.shift.responsableId === session.acteur.id;
  const attendus = await listerBons(await getDb(), { siteDestinationId: d.shift.siteId, statuts: ["expedie"] });
  const aujourdhui = journeeLocale(new Date());
  return (
    <>
      <EnteteEtape
        id={id}
        titre="Réceptions"
        aide={
          labo
            ? "Ingrédients et fournitures reçus des fournisseurs. Les quantités au poids ou au volume acceptent les décimales (ex. 2,5 kg)."
            : "Réceptionnez les livraisons du laboratoire ci-dessous ; saisissez les autres arrivages (boissons…) dans la grille."
        }
      />
      <ReceptionBons
        shiftId={id}
        bons={attendus.map((b) => {
          const j = b.expedieLe ? journeeLocale(b.expedieLe) : null;
          return {
            id: b.id,
            numero: b.numero,
            origine: b.origine,
            expedie: b.expedieLe ? `${j === aujourdhui ? "aujourd'hui" : `le ${libelleJournee(j!)}`} à ${formatLocal(b.expedieLe, "HH:mm")}` : "",
            expediePar: b.expediePar,
            commentaire: b.commentaire,
            lignes: b.lignes,
          };
        })}
      />
      {attendus.length > 0 && <h2 className="mb-2 text-lg font-semibold">Autres réceptions</h2>}
      <FormulaireEntrees
        shiftId={id}
        // Les préparations intermédiaires sont faites au labo : elles se saisissent en Production.
        produits={d.lignes.filter((l) => l.suiviStock && l.nature !== "intermediaire").map(pourSaisie)}
        origines={labo ? ORIGINES_LABO : ORIGINES_POINT_DE_VENTE}
      />
      <ListeMouvements
        shiftId={id}
        titre="Réceptions enregistrées"
        mouvements={d.mouvements
          .filter((m) => m.type === "entree" && m.origine !== "production")
          .map((m) => ({
            id: m.id,
            produit: m.produit,
            quantite: quantiteMouvement(d.lignes, m),
            detail: [m.origine ? LIBELLE_ORIGINE[m.origine] : null, m.commentaire].filter(Boolean).join(" · "),
            utilisateur: m.utilisateur,
            heure: formatLocal(m.horodatage, "HH:mm"),
            supprimable: !m.bonId && peutSupprimer(m.utilisateurId),
          }))}
      />
      <div className="h-24" />
    </>
  );
}
