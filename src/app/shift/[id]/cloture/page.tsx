import Link from "next/link";
import { Fragment } from "react";
import { cx, formatMad, formatSigne, Kpi, Message } from "@/components/ui";
import { formatLocal } from "@/domain/temps";
import { estEncadrant } from "@/server/acteur";
import { ouvertureACompter, type LigneDetail } from "@/server/services/shifts";
import { chargerShift } from "../donnees";
import { FormulaireCloture, FormulaireForcer } from "./Formulaires";

function CelluleEcart({ v }: { v: number | null }) {
  return (
    <td className={cx("px-2 py-1.5 text-right font-bold tabular-nums", v !== null && v < 0 && "text-red-700", v !== null && v > 0 && "text-amber-700")}>
      {formatSigne(v)}
    </td>
  );
}

export default async function Cloture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, estResponsable } = await chargerShift(id);
  const s = d.shift;
  const ouvert = s.statut === "ouvert";
  const suivis = d.lignes.filter((l) => l.suiviStock);
  const sansOuverture = suivis.filter((l) => l.calcul.ouverture === null || (ouvertureACompter(s.modeOuverture, l) && l.ouvertureComptee === null));
  const nonComptes = suivis.filter((l) => l.stockReelFin === null);
  const venteSeule = d.lignes.filter((l) => !l.suiviStock && l.ventes > 0);
  const syn = d.synthese;
  const recompte = s.modeOuverture === "recomptage" || suivis.some((l) => l.ouvertureComptee !== null && l.ouvertureTheorique !== null);
  const parCategorie = new Map<string, LigneDetail[]>();
  for (const l of suivis) parCategorie.set(l.categorie, [...(parCategorie.get(l.categorie) ?? []), l]);

  return (
    <div className="grid gap-4">
      {ouvert && (
        <Link href={`/shift/${id}`} className="text-sm font-semibold text-marque-700">
          ← Retour au shift
        </Link>
      )}
      <h1 className="text-2xl font-bold">{ouvert ? "Récapitulatif avant clôture" : "Récapitulatif du shift"}</h1>
      {!ouvert && s.clotureLe && (
        <Message ton={s.clotureForcee ? "alerte" : "succes"}>
          {s.clotureForcee ? "Clôture forcée" : "Clôturé"} le {formatLocal(s.clotureLe)}
          {s.commentaire ? `\n« ${s.commentaire} »` : ""}
        </Message>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Articles vendus" valeur={syn.articlesVendus} />
        <Kpi label="CA" valeur={formatMad(syn.ca)} />
        <Kpi label="Pertes" valeur={`${syn.pertes} · ${formatMad(syn.valeurPertesVente)}`} />
        <Kpi label="Produits avec écart" valeur={syn.produitsAvecEcart} ton={syn.produitsAvecEcart ? "rouge" : "vert"} />
        <Kpi label="Valeur des écarts" valeur={formatMad(syn.valeurEcartsVente)} ton={syn.valeurEcartsVente < 0 ? "rouge" : undefined} />
        <Kpi label="Écarts de passation" valeur={syn.produitsAvecEcartPassation} ton={syn.produitsAvecEcartPassation ? "rouge" : undefined} />
      </div>

      {d.ventesParCanal.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {d.ventesParCanal.map((c) => (
            <span key={c.canalId} className="rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
              <strong>{c.canal}</strong> : {c.quantite} vendu{c.quantite > 1 ? "s" : ""} · {formatMad(c.montant)}
            </span>
          ))}
        </div>
      )}

      {ouvert && (sansOuverture.length > 0 || nonComptes.length > 0) && (
        <Message ton="alerte">
          {sansOuverture.length > 0 && (
            <>
              {sansOuverture.length} produit(s) sans stock d&apos;ouverture —{" "}
              <Link className="font-semibold underline" href={`/shift/${id}/ouverture`}>
                compléter
              </Link>
              {"\n"}
            </>
          )}
          {nonComptes.length > 0 && (
            <>
              {nonComptes.length} produit(s) non comptés en fin de shift —{" "}
              <Link className="font-semibold underline" href={`/shift/${id}/comptage`}>
                compter
              </Link>
            </>
          )}
        </Message>
      )}

      {suivis.some((l) => l.calcul.ecart) && (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <h2 className="mb-1 font-semibold text-red-900">Produits avec écart</h2>
          <ul className="text-sm text-red-900">
            {suivis
              .filter((l) => l.calcul.ecart)
              .map((l) => (
                <li key={l.produitId}>
                  <strong>{formatSigne(l.calcul.ecart)}</strong> {l.nom} (théorique {l.calcul.theoriqueFin}, compté {l.stockReelFin})
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-stone-50 text-xs text-stone-600">
            <tr>
              <th className="sticky left-0 bg-stone-50 px-2 py-2 text-left">Produit</th>
              <th className="px-2 py-2 text-right">Écart</th>
              <th className="px-2 py-2 text-right">Compté</th>
              <th className="px-2 py-2 text-right">Théorique</th>
              <th className="px-2 py-2 text-right">Ouverture</th>
              {recompte && <th className="px-2 py-2 text-right">Passation</th>}
              <th className="px-2 py-2 text-right">Entrées</th>
              <th className="px-2 py-2 text-right">Ventes</th>
              <th className="px-2 py-2 text-right">Pertes</th>
            </tr>
          </thead>
          <tbody>
            {[...parCategorie.entries()].map(([cat, lignes]) => (
              <Fragment key={cat}>
                <tr className="bg-marque-50">
                  <td colSpan={recompte ? 9 : 8} className="sticky left-0 px-2 py-1 text-xs font-bold text-marque-900 uppercase">
                    {cat}
                  </td>
                </tr>
                {lignes.map((l) => (
                  <tr key={l.produitId} className="border-t border-stone-100">
                    <td className="sticky left-0 max-w-40 bg-white px-2 py-1.5 font-medium">
                      {l.nom}
                      {l.unite === "part" && <span className="text-xs text-stone-500"> (parts)</span>}
                    </td>
                    <CelluleEcart v={l.calcul.ecart} />
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{l.stockReelFin ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.calcul.theoriqueFin ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.calcul.ouverture ?? "—"}</td>
                    {recompte && <CelluleEcart v={l.calcul.ecartPassation} />}
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.entrees || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.ventes || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.pertes || ""}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {venteSeule.length > 0 && (
        <p className="text-sm text-stone-600">
          Ventes hors inventaire : {venteSeule.map((l) => `${l.nom} (${l.ventes})`).join(", ")}
        </p>
      )}

      {ouvert && estResponsable && (
        <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <p className="text-sm text-stone-600">
            En clôturant, vous ({session.acteur.nom}) validez ce comptage en tant que responsable d&apos;inventaire. Le stock compté deviendra
            l&apos;ouverture du shift suivant.
          </p>
          <FormulaireCloture shiftId={id} pret={!sansOuverture.length && !nonComptes.length} />
        </div>
      )}
      {ouvert && !estResponsable && <Message>Seul le responsable d&apos;inventaire ({s.responsable}) ou un manager peut clôturer ce shift.</Message>}
      {ouvert && estEncadrant(session.acteur) && <FormulaireForcer shiftId={id} />}
      {!ouvert && (
        <Link href="/" className="text-center font-semibold text-marque-700 underline">
          Retour à l&apos;accueil
        </Link>
      )}
    </div>
  );
}
