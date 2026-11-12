import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { cx, formatMad, formatSigne, Kpi, LienBouton, Message } from "@/components/ui";
import { BoutonAction } from "@/components/BoutonAction";
import { actionValider } from "@/app/actions-shift";
import { getDb } from "@/lib/db";
import { shifts, utilisateurs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { formatLocal } from "@/domain/temps";
import { formatQuantite } from "@/domain/unites";
import { ecartsImportants } from "@/domain/vraisemblance";
import { estEncadrant } from "@/server/acteur";
import { ouvertureACompter, type LigneDetail } from "@/server/services/shifts";
import { chargerShift } from "../donnees";
import { FormulaireCloture, FormulaireForcer } from "./Formulaires";
import { VentesLoyverse } from "@/components/VentesLoyverse";

function CelluleEcart({ v }: { v: number | null }) {
  return (
    <td className={cx("px-2 py-1.5 text-right font-bold tabular-nums", v !== null && v < 0 && "text-destructive", v !== null && v > 0 && "text-warning")}>
      {v === null ? "—" : v > 0 ? `+${formatQuantite(v)}` : formatQuantite(v)}
    </td>
  );
}

export default async function Cloture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { d, session, estResponsable, synchro, loyverseConfigure } = await chargerShift(id);
  const validePar = d.shift.validePar
    ? ((await (await getDb()).select({ nom: utilisateurs.nom }).from(utilisateurs).where(eq(utilisateurs.id, d.shift.validePar)))[0]?.nom ?? null)
    : null;
  const s = d.shift;
  const ouvert = s.statut === "ouvert";
  const suivis = d.lignes.filter((l) => l.suiviStock);
  const sansOuverture = suivis.filter((l) => l.calcul.ouverture === null || (ouvertureACompter(s.modeOuverture, l) && l.ouvertureComptee === null));
  const nonComptes = suivis.filter((l) => l.stockReelFin === null);
  const venteSeule = d.lignes.filter((l) => !l.suiviStock && l.ventes > 0);
  const syn = d.synthese;
  const labo = s.typeSite === "laboratoire";
  const q = formatQuantite;
  const recompte = s.modeOuverture === "recomptage" || suivis.some((l) => l.ouvertureComptee !== null && l.ouvertureTheorique !== null);
  // Comptage à l'aveugle : pendant le shift, le théorique et les écarts ne s'affichent qu'au responsable
  // (ou à un manager), et seulement une fois tout compté.
  // Shift clôturé consulté par un employé pendant un shift en cours du site : son compté de clôture
  // permettrait de deviner le théorique du shift en cours. Détail réservé aux encadrants dans ce cas.
  const shiftEnCoursSurSite =
    !ouvert && !estEncadrant(session.acteur)
      ? (await (await getDb()).select({ id: shifts.id }).from(shifts).where(and(eq(shifts.siteId, s.siteId), eq(shifts.statut, "ouvert")))).length > 0
      : false;
  const montrer = (!ouvert && !shiftEnCoursSurSite) || (ouvert && estResponsable && !sansOuverture.length && !nonComptes.length);
  const masquerDetail = shiftEnCoursSurSite;
  const nbColonnes = (montrer ? (recompte ? 4 : 3) : 0) + 5;
  // Au labo, les cakes se lisent en gâteaux entiers.
  const enGateaux = (l: LigneDetail) => labo && l.unite === "part" && l.partsParGateau ? l.partsParGateau : null;
  const aff = (v: number | null, l: LigneDetail) => (v === null ? "—" : enGateaux(l) ? q(Math.round((v / enGateaux(l)!) * 100) / 100) : q(v));
  const nbPertes = d.mouvements.filter((m) => m.type === "perte").length;
  // Matières premières et préparations intermédiaires : la différence théorique − compté est une consommation.
  const avecIngredients = suivis.some((l) => l.nature !== "produit");
  const parCategorie = new Map<string, LigneDetail[]>();
  for (const l of suivis) parCategorie.set(l.categorie, [...(parCategorie.get(l.categorie) ?? []), l]);

  return (
    <div className="grid gap-4">
      {ouvert && (
        <Link href={`/shift/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <ArrowLeft aria-hidden className="size-4" /> Retour au shift
        </Link>
      )}
      <h1 className="text-2xl font-bold">{ouvert ? "Récapitulatif avant clôture" : "Récapitulatif du shift"}</h1>
      {!ouvert && s.clotureLe && (
        <Message ton={s.clotureForcee ? "alerte" : "succes"}>
          {s.clotureForcee ? "Clôture forcée" : "Clôturé"} le {formatLocal(s.clotureLe)}
          {s.commentaire ? `\n« ${s.commentaire} »` : ""}
        </Message>
      )}
      {s.statut === "valide" && (
        <Message ton="succes">
          Validé{s.valideLe ? ` le ${formatLocal(s.valideLe)}` : ""}
          {validePar ? ` par ${validePar}` : ""} : ce shift est verrouillé.
        </Message>
      )}
      {s.statut === "cloture" && estEncadrant(session.acteur) && (
        <div className="flex flex-wrap items-start gap-2">
          <LienBouton href={`/shift/${id}`} variante="secondaire">
            Corriger ce shift
          </LienBouton>
          <BoutonAction
            action={actionValider.bind(null, id)}
            confirmation="Valider ce shift ? Il ne pourra plus être modifié."
          >
            Valider le shift
          </BoutonAction>
        </div>
      )}

      {loyverseConfigure && !labo && (
        <VentesLoyverse
          shiftId={id}
          ouvert={ouvert}
          peutReimporter={estEncadrant(session.acteur)}
          derniere={synchro}
          auto={ouvert}
          lienAdmin={session.acteur.role === "direction"}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {labo ? (
          <>
            <Kpi label="Produits fabriqués" valeur={d.lignes.filter((l) => l.production > 0).length} />
            <Kpi label="Lignes livrées" valeur={d.mouvements.filter((m) => m.type === "sortie").length} />
            <Kpi label="Matières premières consommées (coût)" valeur={formatMad(syn.valeurConsommation)} />
          </>
        ) : (
          <>
            <Kpi label="Articles vendus" valeur={syn.articlesVendus} />
            <Kpi label="CA" valeur={formatMad(syn.ca)} />
          </>
        )}
        <Kpi label="Pertes déclarées" valeur={`${nbPertes} · ${formatMad(syn.valeurPertesVente)}`} />
        {montrer && (
          <>
            <Kpi label="Produits avec écart" valeur={syn.produitsAvecEcart} ton={syn.produitsAvecEcart ? "rouge" : "vert"} />
            <Kpi label="Valeur des écarts" valeur={formatMad(syn.valeurEcartsVente)} ton={syn.valeurEcartsVente < 0 ? "rouge" : undefined} />
            <Kpi label="Écarts de passation" valeur={syn.produitsAvecEcartPassation} ton={syn.produitsAvecEcartPassation ? "rouge" : undefined} />
          </>
        )}
      </div>

      {d.ventesParCanal.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {d.ventesParCanal.map((c) => (
            <span key={c.canalId} className="rounded-xl bg-card px-3 py-2 ring-1 ring-border">
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

      {ouvert && !montrer && (
        <Message>
          Comptage à l&apos;aveugle : le stock théorique et les écarts s&apos;affichent
          {estResponsable ? " une fois tous les produits comptés." : ` au responsable (${s.responsable ?? "—"}) une fois tous les produits comptés.`}
        </Message>
      )}

      {montrer && suivis.some((l) => l.calcul.ecart) && (
        <div className="rounded-2xl bg-destructive-soft p-4 ring-1 ring-destructive/30">
          <h2 className="mb-1 font-semibold text-destructive">Produits avec écart</h2>
          <ul className="text-sm text-destructive">
            {suivis
              .filter((l) => l.calcul.ecart)
              .map((l) => (
                <li key={l.produitId}>
                  <strong>{l.calcul.ecart! > 0 ? "+" : ""}{q(l.calcul.ecart)}</strong> {l.nom} (théorique {q(l.calcul.theoriqueFin)}, compté {q(l.stockReelFin)}
                  {l.unite === "part" ? " parts" : ""})
                </li>
              ))}
          </ul>
        </div>
      )}

      {masquerDetail && <Message>Détail des quantités masqué pendant le shift en cours (comptage à l&apos;aveugle).</Message>}
      {!masquerDetail && (
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border" tabIndex={0} role="region" aria-label="Tableau (défilement horizontal possible)">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-muted px-2 py-2 text-left">Produit</th>
              {montrer && <th className="px-2 py-2 text-right">{avecIngredients ? "Écart / conso." : "Écart"}</th>}
              <th className="px-2 py-2 text-right">Compté</th>
              {montrer && <th className="px-2 py-2 text-right">Théorique</th>}
              {montrer && <th className="px-2 py-2 text-right">Ouverture</th>}
              {montrer && recompte && <th className="px-2 py-2 text-right">Passation</th>}
              <th className="px-2 py-2 text-right">{labo ? "Réceptions / prod." : "Réceptions"}</th>
              <th className="px-2 py-2 text-right">{labo ? "Livré" : "Ventes"}</th>
              <th className="px-2 py-2 text-right">Pertes</th>
            </tr>
          </thead>
          <tbody>
            {[...parCategorie.entries()].map(([cat, lignes]) => (
              <Fragment key={cat}>
                <tr className="bg-primary-soft">
                  <td colSpan={nbColonnes} className="sticky left-0 px-2 py-1 text-xs font-bold text-primary-soft-foreground uppercase">
                    {cat}
                  </td>
                </tr>
                {lignes.map((l) => (
                  <tr key={l.produitId} className="border-t border-border">
                    <td className="sticky left-0 max-w-40 bg-card px-2 py-1.5 font-medium">
                      {l.nom}
                      {l.unite === "part" && <span className="text-xs text-muted-foreground">{enGateaux(l) ? " (gâteaux)" : " (parts)"}</span>}
                      {(l.unite === "kg" || l.unite === "litre") && <span className="text-xs text-muted-foreground"> ({l.unite})</span>}
                    </td>
                    {!montrer ? null : l.nature !== "produit" ? (
                      <td className="px-2 py-1.5 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {l.calcul.consommation !== null ? `conso ${q(l.calcul.consommation)}` : "—"}
                        {l.calcul.ecartConsommation !== null && l.calcul.ecartConsommation !== 0 && (
                          <span className={cx("block font-semibold", l.calcul.ecartConsommation > 0 ? "text-destructive" : "text-warning")}>
                            {l.calcul.ecartConsommation > 0 ? "+" : ""}
                            {q(l.calcul.ecartConsommation)} vs fiche
                          </span>
                        )}
                      </td>
                    ) : (
                      <CelluleEcart v={l.calcul.ecart} />
                    )}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{aff(l.stockReelFin, l)}</td>
                    {montrer && <td className="px-2 py-1.5 text-right tabular-nums">{aff(l.calcul.theoriqueFin, l)}</td>}
                    {montrer && <td className="px-2 py-1.5 text-right tabular-nums">{aff(l.calcul.ouverture, l)}</td>}
                    {montrer && recompte && <CelluleEcart v={l.calcul.ecartPassation} />}
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.entrees ? aff(l.entrees, l) : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{labo ? (l.sorties ? aff(l.sorties, l) : "") : l.ventes || ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.pertes ? aff(l.pertes, l) : ""}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {venteSeule.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ventes hors inventaire : {venteSeule.map((l) => `${l.nom} (${l.ventes})`).join(", ")}
        </p>
      )}

      {ouvert && estResponsable && (
        <div className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="text-sm text-muted-foreground">
            En clôturant, vous ({session.acteur.nom}) validez ce comptage en tant que responsable d&apos;inventaire. Le stock compté deviendra
            l&apos;ouverture du shift suivant.
          </p>
          <FormulaireCloture
            shiftId={id}
            pret={!sansOuverture.length && !nonComptes.length}
            // Rien sur les écarts tant que tout n'est pas compté (comptage à l'aveugle).
            confirmation={
              montrer
                ? `Clôturer et signer le shift ?${syn.produitsAvecEcart ? ` ${syn.produitsAvecEcart} produit(s) en écart (${formatMad(syn.valeurEcartsVente)}).` : " Aucun écart."} L'équipe ne pourra plus rien saisir.`
                : undefined
            }
            ecartsAExpliquer={
              montrer
                ? ecartsImportants(
                    d.lignes.map((l) => ({ nom: l.nom, ecart: l.calcul.ecart })),
                    syn.valeurEcartsVente,
                  )
                : []
            }
          />
        </div>
      )}
      {ouvert && !estResponsable && <Message>Seul le responsable d&apos;inventaire ({s.responsable}) ou un manager peut clôturer ce shift.</Message>}
      {ouvert && estEncadrant(session.acteur) && <FormulaireForcer shiftId={id} />}
      {!ouvert && (
        <Link href="/" className="text-center font-semibold text-primary underline">
          Retour à l&apos;accueil
        </Link>
      )}
    </div>
  );
}
