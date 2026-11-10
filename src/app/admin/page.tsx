import Link from "next/link";
import { ColonnesEmpilees, CourbesStock } from "@/components/Graphiques";
import { Carte, classesBouton, cx, formatMad, formatSigne, Kpi, Message, Titre } from "@/components/ui";
import { heureLocale, libelleJournee } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { listerProduits } from "@/server/services/catalogue";
import { suiviRemontees } from "@/server/services/remontees";
import { evolutionStock, tableauDeBord } from "@/server/services/tableau-de-bord";
import { ListeAlertes } from "@/components/ListeAlertes";
import { alertesExploitation } from "@/server/services/alertes";
import { exigerEncadrant, sitesPilotables } from "./acces";
import { Filtres } from "./Filtres";
import { periode, type Vue } from "./periode";
import { SelecteurProduit } from "./SelecteurProduit";

const jj = (j: string) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;

export default async function TableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; vue?: string; date?: string; produit?: string }>;
}) {
  const { acteur } = await exigerEncadrant();
  const db = await getDb();
  const sp = await searchParams;
  const sites = (await sitesPilotables(db, acteur)).filter((s) => s.statut === "actif");
  const tous = acteur.role === "direction";
  const site = sites.find((s) => s.id === sp.site);
  const siteIds = site ? [site.id] : tous ? sites.map((s) => s.id) : sites.slice(0, 1).map((s) => s.id);
  const vue: Vue = sp.vue === "mois" ? "mois" : "semaine";
  const p = periode(vue, sp.date);
  const t = await tableauDeBord(db, { siteIds, du: p.du, au: p.au });
  const remontees = await suiviRemontees(db, { siteId: siteIds.length === 1 ? siteIds[0] : undefined, du: p.du, au: p.au }, new Date());
  // Alertes d'exploitation : sites choisis, plus le laboratoire pour la direction ou ses managers.
  const pilotes = (await sitesPilotables(db, acteur, { avecLabo: true })).filter((s) => s.statut === "actif");
  const siteIdsAlertes = site ? [site.id] : pilotes.map((s) => s.id);
  const alertes = await alertesExploitation(db, siteIdsAlertes, new Date());
  const echus = remontees.parResponsable.reduce((a, b) => a + b.planifies, 0);
  const aLHeure = remontees.parResponsable.reduce((a, b) => a + b.aLHeure, 0);

  const produits = (await listerProduits(db, { actifsSeulement: true })).filter((x) => x.suiviStock);
  const produitId = produits.find((x) => x.id === sp.produit)?.id ?? t.ecarts[0]?.produitId ?? produits[0]?.id;
  const produit = produits.find((x) => x.id === produitId);
  const evo = produitId ? await evolutionStock(db, produitId, siteIds, p.du, p.au) : [];
  const parSite = new Map<string, typeof evo>();
  for (const e of evo) parSite.set(e.site, [...(parSite.get(e.site) ?? []), e]);
  const minimums = [...new Set(evo.map((e) => e.minimum).filter((x): x is number => x !== null))];

  return (
    <>
      <Titre
        sousTitre="Ventes, pertes, écarts et réapprovisionnement sur les shifts clôturés de la période."
        actions={
          <>
            <a className={classesBouton("secondaire")} href={`/api/export/detail?${new URLSearchParams({ ...(site ? { site: site.id } : {}), vue, date: p.du })}`}>
              Export détaillé (Excel)
            </a>
            <a className={classesBouton("secondaire")} href={`/api/export/produits?${new URLSearchParams({ ...(site ? { site: site.id } : {}), vue, date: p.du })}`}>
              Synthèse par produit (Excel)
            </a>
          </>
        }
      >
        Tableau de bord
      </Titre>
      <Filtres sites={sites} siteId={site?.id ?? (tous ? null : (siteIds[0] ?? null))} tousLesSites={tous} vue={vue} {...p} />
      {alertes.length > 0 && (
        <div className="mt-4">
          <ListeAlertes alertes={alertes} afficherSite={siteIdsAlertes.length > 1} />
        </div>
      )}
      {t.kpi.shiftsClos === 0 && <Message>Aucun shift clôturé sur la période.</Message>}

      <div className="my-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="CA (produits suivis)" valeur={formatMad(t.kpi.ca)} />
        {t.kpi.caParCanal.map((c) => (
          <Kpi key={c.canalId} label={`dont ${c.canal} (${c.quantite} vendus)`} valeur={formatMad(c.montant)} />
        ))}
        <Kpi label={`Pertes (${t.kpi.pertes})`} valeur={formatMad(t.kpi.valeurPertes)} />
        <Kpi label="Écarts non expliqués" valeur={formatMad(t.kpi.valeurEcarts)} ton={t.kpi.valeurEcarts < 0 ? "rouge" : undefined} />
        <Kpi
          label="Remontées à l'heure"
          valeur={echus ? `${Math.round((aLHeure / echus) * 100)} % (${aLHeure}/${echus})` : "—"}
          ton={echus && aLHeure < echus ? "rouge" : echus ? "vert" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Carte>
          <h2 className="font-semibold">Ventes par jour et par canal</h2>
          <p className="mb-2 text-sm text-stone-500">Montants encaissés (Loyverse) des produits suivis, en MAD.</p>
          {t.caParJour.length ? (
            <>
              <ColonnesEmpilees
                series={t.canaux}
                jours={t.caParJour.map((j) => ({ cle: j.journee, libelle: jj(j.journee), valeurs: j.parCanal }))}
              />
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-stone-600">Voir les données</summary>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-xs text-stone-500">
                    <tr>
                      <th className="text-left">Jour</th>
                      {t.canaux.map((c) => (
                        <th key={c.id} className="text-right">
                          {c.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.caParJour.map((j) => (
                      <tr key={j.journee} className="border-t border-stone-100">
                        <td>{libelleJournee(j.journee)}</td>
                        {t.canaux.map((c) => (
                          <td key={c.id} className="text-right tabular-nums">
                            {formatMad(j.parCanal[c.id] ?? 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-stone-500">Pas de ventes sur la période.</p>
          )}
        </Carte>

        <Carte>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Évolution du stock</h2>
            {produit && <SelecteurProduit produits={produits} valeur={produit.id} />}
          </div>
          <p className="mb-2 text-sm text-stone-500">Stock compté à chaque clôture{produit ? ` (${produit.unite === "part" ? "parts" : "unités"})` : ""}.</p>
          <CourbesStock
            unite={produit?.unite === "part" ? "parts" : "u."}
            minimum={minimums.length === 1 ? minimums[0] : null}
            series={[...parSite.entries()].map(([nom, pts]) => ({
              nom,
              points: pts.map((x) => ({ t: x.debut.getTime(), libelle: `${jj(x.journee)} ${x.creneau} ${heureLocale(x.debut)}`, valeur: x.stock })),
            }))}
          />
        </Carte>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Carte>
          <h2 className="mb-2 font-semibold">Alertes de réapprovisionnement</h2>
          <p className="mb-2 text-sm text-stone-500">Produits sous le stock minimum au dernier comptage de clôture de chaque site.</p>
          {t.alertes.length ? (
            <ul className="divide-y divide-stone-100 text-sm">
              {t.alertes.map((a) => (
                <li key={`${a.shiftId}-${a.produit}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-semibold">{a.produit}</span>
                    {siteIds.length > 1 && <span className="text-stone-500"> · {a.site}</span>}
                  </span>
                  <span className="tabular-nums">
                    <span className="font-bold text-red-700">{a.stock}</span> / minimum {a.minimum}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">
              Aucune alerte. Les minimums se règlent sur chaque{" "}
              <Link href="/admin/catalogue" className="underline">
                fiche produit
              </Link>
              .
            </p>
          )}
        </Carte>

        <Carte>
          <h2 className="mb-2 font-semibold">Pertes par produit</h2>
          {t.pertes.length ? (
            <table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Produit</th>
                  <th className="px-1 text-right">Périmé</th>
                  <th className="px-1 text-right">Abîmé</th>
                  <th className="text-right">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {t.pertes.slice(0, 12).map((x) => (
                  <tr key={x.produitId} className="border-t border-stone-100">
                    <td className="py-1.5">{x.produit}</td>
                    <td className="text-right tabular-nums">{x.peremption || ""}</td>
                    <td className="text-right tabular-nums">{x.endommage || ""}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{x.prixConnu ? formatMad(x.valeur) : <span className="text-stone-400">prix inconnu</span>}</td>
                  </tr>
                ))}
                <tr className="border-t border-stone-200 font-semibold">
                  <td className="py-1.5">Total</td>
                  <td className="text-right tabular-nums">{t.kpi.pertesPeremption}</td>
                  <td className="text-right tabular-nums">{t.kpi.pertesEndommage}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatMad(t.kpi.valeurPertes)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-stone-500">Aucune perte déclarée sur la période.</p>
          )}
        </Carte>
      </div>

      <Carte className="mt-4">
        <h2 className="mb-1 font-semibold">Écarts non expliqués par produit</h2>
        <p className="mb-2 text-sm text-stone-500">
          Stock compté − stock théorique, cumulé sur la période. Négatif = produit manquant (vente non saisie, perte non déclarée, erreur de
          comptage).
          {t.kpi.ecartsPassation > 0 && ` ${t.kpi.ecartsPassation} écart(s) de passation entre équipes.`}
        </p>
        {t.ecarts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Produit</th>
                  <th className="text-right">Écart cumulé</th>
                  <th className="text-right">Valeur</th>
                  <th className="text-right">Shifts concernés</th>
                </tr>
              </thead>
              <tbody>
                {t.ecarts.slice(0, 15).map((e) => (
                  <tr key={e.produitId} className="border-t border-stone-100">
                    <td className="py-1.5">
                      <Link href={`?${new URLSearchParams({ ...sp, produit: e.produitId } as Record<string, string>)}`} scroll={false} className="hover:underline">
                        {e.produit}
                      </Link>
                    </td>
                    <td className={cx("text-right font-semibold tabular-nums", e.quantite < 0 && "text-red-700", e.quantite > 0 && "text-amber-700")}>
                      {formatSigne(e.quantite)}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{e.prixConnu ? formatMad(e.valeur) : <span className="text-stone-400">prix inconnu</span>}</td>
                    <td className="text-right tabular-nums">{e.shifts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Aucun écart sur la période.</p>
        )}
      </Carte>
    </>
  );
}
