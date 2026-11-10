import Link from "next/link";
import { redirect } from "next/navigation";
import { cx, LienBouton, Message } from "@/components/ui";
import { chargerShift } from "./donnees";

function Etape({
  href,
  numero,
  titre,
  detail,
  fait,
}: {
  href: string;
  numero: number;
  titre: string;
  detail: string;
  fait?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 hover:bg-marque-50",
        fait ? "ring-emerald-300" : "ring-stone-200",
      )}
    >
      <span
        className={cx(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-lg font-bold",
          fait ? "bg-emerald-600 text-white" : "bg-marque-100 text-marque-900",
        )}
      >
        {fait ? "✓" : numero}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold">{titre}</span>
        <span className="block text-sm text-stone-600">{detail}</span>
      </span>
      <span className="ml-auto text-2xl text-stone-400">›</span>
    </Link>
  );
}

export default async function HubShift({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, estResponsable } = await chargerShift(id);
  if (d.shift.statut === "planifie") redirect("/");
  if (d.shift.statut !== "ouvert") redirect(`/shift/${id}/cloture`);
  const a = d.avancement;
  const nbEntrees = d.mouvements.filter((m) => m.type === "entree").length;
  const nbPertes = d.mouvements.filter((m) => m.type === "perte").length;
  const ventes = d.lignes.reduce((t, l) => t + l.ventes, 0);
  let n = 0;
  return (
    <div className="mx-auto grid max-w-2xl gap-3">
      {a.aCompterOuverture > 0 && (
        <Etape
          href={`/shift/${id}/ouverture`}
          numero={++n}
          titre="Comptage d'ouverture"
          detail={
            d.shift.modeOuverture === "recomptage"
              ? `Recompter le stock reçu de l'équipe précédente · ${a.compteesOuverture}/${a.aCompterOuverture}`
              : `${a.aCompterOuverture} produit(s) sans stock connu · ${a.compteesOuverture}/${a.aCompterOuverture}`
          }
          fait={a.compteesOuverture === a.aCompterOuverture}
        />
      )}
      {a.aCompterOuverture === 0 && (
        <Message ton="info">Stock d&apos;ouverture repris automatiquement de la clôture du shift précédent.</Message>
      )}
      <Etape href={`/shift/${id}/entrees`} numero={++n} titre="Réceptions" detail={`Livraisons du labo, boissons du fournisseur · ${nbEntrees} saisie(s)`} />
      <Etape href={`/shift/${id}/pertes`} numero={++n} titre="Pertes" detail={`Péremption ou endommagé · ${nbPertes} saisie(s)`} />
      <Etape
        href={`/shift/${id}/ventes`}
        numero={++n}
        titre="Ventes"
        detail={
          d.shift.ventesSource === "loyverse"
            ? `Importées de Loyverse · ${ventes} article(s) vendu(s)`
            : `Rapport de caisse Loyverse · ${ventes} article(s) saisi(s)`
        }
      />
      <Etape
        href={`/shift/${id}/comptage`}
        numero={++n}
        titre="Comptage de fin de shift"
        detail={`${a.compteesFin}/${a.aCompterFin} produits comptés`}
        fait={a.compteesFin === a.aCompterFin}
      />
      <LienBouton href={`/shift/${id}/cloture`} grand variante={estResponsable ? "primaire" : "secondaire"} className="mt-2">
        {estResponsable ? "Vérifier et clôturer le shift" : "Voir le récapitulatif"}
      </LienBouton>
    </div>
  );
}
