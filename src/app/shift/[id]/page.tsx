import { ArrowDown, Check, ChevronRight, CircleCheckBig, Lightbulb } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cx, LienBouton, Message } from "@/components/ui";
import { nb } from "@/domain/unites";
import { getDb } from "@/lib/db";
import { listerBons } from "@/server/services/livraisons";
import { chargerShift } from "./donnees";

function Etape({
  href,
  numero,
  titre,
  detail,
  fait,
  alerte,
  maintenant,
}: {
  href: string;
  numero: number;
  titre: string;
  detail: string;
  fait?: boolean;
  alerte?: string | null;
  /** Étape à faire en premier : mise en avant. */
  maintenant?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={maintenant ? "step" : undefined}
      className={cx(
        "flex items-center gap-4 rounded-2xl bg-card p-4 shadow-sm hover:bg-primary-soft",
        maintenant ? "ring-2 ring-primary" : fait ? "ring-1 ring-success/40" : "ring-1 ring-border",
      )}
    >
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold",
          fait ? "bg-success text-success-foreground" : "bg-primary-soft text-primary-soft-foreground",
        )}
      >
        {fait ? <Check aria-label="Fait" className="size-5" strokeWidth={2.5} /> : numero}
      </span>
      <span className="min-w-0">
        {maintenant && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            <ArrowDown aria-hidden className="size-3" strokeWidth={3} /> À faire maintenant
          </span>
        )}
        <span className="block text-lg font-semibold">{titre}</span>
        {fait && <span className="block text-sm font-semibold text-success">Terminé</span>}
        <span className="block text-sm text-muted-foreground">{detail}</span>
        {alerte && <span className="mt-1 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">{alerte}</span>}
      </span>
      <ChevronRight aria-hidden className="ml-auto size-6 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function HubShift({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, estResponsable, modeCorrection, peutSaisir } = await chargerShift(id);
  if (d.shift.statut === "planifie") redirect("/");
  if (!peutSaisir) redirect(`/shift/${id}/cloture`);
  const a = d.avancement;
  const labo = d.shift.typeSite === "laboratoire";
  const nbProduction = d.mouvements.filter((m) => m.type === "entree" && m.origine === "production").length;
  const nbEntrees = d.mouvements.filter((m) => m.type === "entree" && m.origine !== "production").length;
  const nbPertes = d.mouvements.filter((m) => m.type === "perte").length;
  const ventes = d.lignes.reduce((t, l) => t + l.ventes, 0);
  const db = await getDb();
  const aRecevoir = (await listerBons(db, { siteDestinationId: d.shift.siteId, statuts: ["expedie"] })).length;
  const envoyes = await listerBons(db, { siteOrigineId: d.shift.siteId, statuts: ["prepare", "expedie"] });
  const aExpedier = envoyes.filter((b) => b.statut === "prepare").length;
  const expediesDuShift = d.mouvements.filter((m) => m.type === "sortie").length;
  const ouvertureAFaire = a.aCompterOuverture > 0 && a.compteesOuverture < a.aCompterOuverture;
  const resteFin = a.aCompterFin - a.compteesFin;
  // Une seule consigne à la fois, en langage simple : ce qu'il faut faire maintenant.
  const prochaine: "ouverture" | "reception" | "pendant" | "cloture" = ouvertureAFaire
    ? "ouverture"
    : aRecevoir
      ? "reception"
      : resteFin > 0
        ? "pendant"
        : "cloture";
  const consigne = {
    ouverture: {
      titre: "Commencez par compter le stock",
      texte: `Comptez les produits présents à votre arrivée (${nb(a.aCompterOuverture - a.compteesOuverture, "produit restant", "produits restants")}).`,
    },
    reception: {
      titre: aRecevoir > 1 ? `${aRecevoir} livraisons sont arrivées` : "Une livraison est arrivée",
      texte: "Vérifiez les produits reçus et réceptionnez la livraison.",
    },
    pendant: {
      titre: "Pendant le shift",
      texte: labo
        ? "Notez chaque production, chaque réception et chaque perte au moment où elle a lieu. À la fin : comptez tout le stock."
        : "Notez les réceptions et les pertes au moment où elles arrivent. À la fin du shift : comptez tout le stock.",
    },
    cloture: {
      titre: "Tout est compté",
      texte: estResponsable
        ? "Dernière étape : vérifiez le récapitulatif et clôturez le shift."
        : `Le responsable du shift${d.shift.responsable ? ` (${d.shift.responsable})` : ""} vérifie et clôture le shift.`,
    },
  }[prochaine];
  let n = 0;
  return (
    <div className="mx-auto grid max-w-2xl gap-3">
      {!modeCorrection && (
        <div className="flex items-start gap-3 rounded-2xl bg-primary-soft p-4 text-primary-soft-foreground" role="status">
          {prochaine === "cloture" ? (
            <CircleCheckBig aria-hidden className="mt-0.5 size-6 shrink-0" />
          ) : (
            <Lightbulb aria-hidden className="mt-0.5 size-6 shrink-0" />
          )}
          <div>
            <p className="text-lg font-bold">{consigne.titre}</p>
            <p>{consigne.texte}</p>
          </div>
        </div>
      )}
      {a.aCompterOuverture > 0 && (
        <Etape
          href={`/shift/${id}/ouverture`}
          numero={++n}
          titre="Comptage d'ouverture"
          detail={
            d.shift.modeOuverture === "recomptage"
              ? `Recompter le stock laissé par l'équipe précédente · ${a.compteesOuverture} sur ${a.aCompterOuverture}`
              : `${nb(a.aCompterOuverture, "produit")} à compter · ${a.compteesOuverture} sur ${a.aCompterOuverture}`
          }
          fait={!ouvertureAFaire}
          maintenant={prochaine === "ouverture"}
        />
      )}
      {a.aCompterOuverture === 0 && (
        <Message ton="info">Rien à compter à l&apos;ouverture : le stock est repris de la fin du shift précédent.</Message>
      )}
      {labo && (
        <Etape
          href={`/shift/${id}/production`}
          numero={++n}
          titre="Production"
          detail={`Gâteaux, pâtisseries et préparations faits · ${nbProduction ? nb(nbProduction, "saisie") : "rien saisi"}`}
        />
      )}
      <Etape
        href={`/shift/${id}/entrees`}
        numero={++n}
        titre="Réceptions"
        detail={`${labo ? "Matières premières et fournitures reçues" : "Livraisons du labo, boissons du fournisseur"} · ${nbEntrees ? nb(nbEntrees, "saisie") : "rien saisi"}`}
        alerte={aRecevoir ? `${nb(aRecevoir, "livraison")} à réceptionner` : null}
        maintenant={prochaine === "reception"}
      />
      {labo && (
        <Etape
          href={`/shift/${id}/livraisons`}
          numero={++n}
          titre="Livraisons"
          detail={`Envoyer des produits aux points de vente · ${expediesDuShift ? nb(expediesDuShift, "ligne expédiée", "lignes expédiées") : "rien expédié"}`}
          alerte={aExpedier ? `${nb(aExpedier, "bon préparé", "bons préparés")} à expédier` : null}
        />
      )}
      <Etape
        href={`/shift/${id}/pertes`}
        numero={++n}
        titre="Pertes"
        detail={`Produit périmé ou abîmé · ${nbPertes ? nb(nbPertes, "perte déclarée", "pertes déclarées") : "aucune"}`}
      />
      {!labo && (
        <Etape
          href={`/shift/${id}/ventes`}
          numero={++n}
          titre="Ventes"
          detail={
            d.shift.ventesSource === "loyverse"
              ? `Reprises automatiquement de la caisse · ${nb(ventes, "article vendu", "articles vendus")}`
              : `Rapport de caisse Loyverse · ${nb(ventes, "article saisi", "articles saisis")}`
          }
        />
      )}
      <Etape
        href={`/shift/${id}/comptage`}
        numero={++n}
        titre="Comptage de fin de shift"
        detail={resteFin ? `${a.compteesFin} sur ${a.aCompterFin} produits comptés` : `${nb(a.aCompterFin, "produit compté", "produits comptés")}`}
        fait={resteFin === 0}
      />
      {!labo && (
        <Link href={`/shift/${id}/livraisons`} className="py-2 text-center text-sm font-semibold text-primary hover:underline">
          Envoyer des produits à un autre point de vente{aExpedier ? ` · ${nb(aExpedier, "bon")} à expédier` : ""}
        </Link>
      )}
      <LienBouton
        href={`/shift/${id}/cloture`}
        grand
        variante={estResponsable && (prochaine === "cloture" || modeCorrection) ? "primaire" : "secondaire"}
        className="mt-2"
      >
        {modeCorrection ? "Retour au récapitulatif" : estResponsable ? "Vérifier et clôturer le shift" : "Voir le récapitulatif"}
      </LienBouton>
      {estResponsable && !modeCorrection && prochaine !== "cloture" && (
        <p className="text-center text-sm text-muted-foreground">
          La clôture se fait une fois tout compté
          {resteFin ? ` (encore ${nb(resteFin, "produit")} à compter en fin de shift)` : ""}.
        </p>
      )}
    </div>
  );
}
