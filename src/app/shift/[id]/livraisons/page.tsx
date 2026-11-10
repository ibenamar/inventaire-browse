import { redirect } from "next/navigation";
import { formatLocal } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { estEncadrant } from "@/server/acteur";
import { destinationsPossibles, listerBons, type BonVue } from "@/server/services/livraisons";
import { chargerShift } from "../donnees";
import { EnteteEtape } from "../EnteteEtape";
import { FormulaireEntrees } from "../entrees/FormulaireEntrees";
import { ListeBons, type BonListe } from "./ListeBons";

/** Bons de livraison au départ du site : du labo vers les points de vente, ou transfert entre points de vente. */
export default async function Livraisons({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, peutSaisir } = await chargerShift(id);
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const labo = d.shift.typeSite === "laboratoire";
  const db = await getDb();
  const destinations = (await destinationsPossibles(db, d.shift.siteId)).filter((s) => (labo ? s.type === "point_de_vente" : true));
  const depuis = new Date(Date.now() - 3 * 24 * 3600_000);
  const bons = await listerBons(db, { siteOrigineId: d.shift.siteId, depuis, limite: 40 });
  const encadrant = estEncadrant(session.acteur);
  const vue = (b: BonVue): BonListe => ({
    id: b.id,
    numero: b.numero,
    statut: b.statut,
    destination: b.destination,
    quand: formatLocal(b.recuLe ?? b.expedieLe ?? b.creeLe, "dd/MM HH:mm"),
    commentaire: b.commentaire,
    commentaireReception: b.commentaireReception,
    lignes: b.lignes,
    ecarts: b.ecarts,
    annulable: b.statut === "prepare" || (b.statut === "expedie" && encadrant),
  });
  return (
    <>
      <EnteteEtape
        id={id}
        titre={labo ? "Livraisons" : "Transfert vers un autre site"}
        aide={
          labo
            ? "Choisissez le point de vente, saisissez les quantités (cakes en gâteaux entiers), puis préparez le bon ou expédiez-le au départ du livreur. L'expédition sort les produits du stock du labo ; le point de vente les réceptionne à l'arrivée."
            : "Pour dépanner un autre point de vente : les produits sortent de votre stock à l'expédition et entrent dans le sien à la réception."
        }
      />
      <ListeBons shiftId={id} titre="Bons préparés, à expédier" bons={bons.filter((b) => b.statut === "prepare").map(vue)} />
      <h2 className="mt-6 mb-2 text-lg font-semibold">Nouveau bon</h2>
      <FormulaireEntrees
        shiftId={id}
        produits={d.lignes.filter((l) => l.suiviStock && l.nature === "produit")}
        origines={[]}
        destinations={destinations}
        gateauxParDefaut={labo}
        placeholderCommentaire="Commentaire (livreur, tournée…)"
      />
      <ListeBons shiftId={id} titre="Bons expédiés (3 derniers jours)" bons={bons.filter((b) => b.statut === "expedie" || b.statut === "recu").map(vue)} />
      <div className="h-24" />
    </>
  );
}
