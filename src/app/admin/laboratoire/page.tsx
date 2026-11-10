import { Carte, cx, formatMad, Kpi, Message, Pastille, Titre } from "@/components/ui";
import Link from "next/link";
import { ajouterJours, estJournee, formatLocal, jourIso, journeeLocale, libelleJournee, NOMS_JOURS } from "@/domain/temps";
import { previsionProduction, SEMAINES_HISTORIQUE } from "@/server/services/prevision";
import { formatQuantite, libelleQuantite, UNITE_PLURIEL } from "@/domain/unites";
import { getDb } from "@/lib/db";
import { rapportLabo } from "@/server/services/livraisons";
import { exigerEncadrant, sitesPilotables } from "../acces";
import { Filtres } from "../Filtres";
import { periode, type Vue } from "../periode";

const jj = (j: string) => `${j.slice(8, 10)}/${j.slice(5, 7)}`;
/** Les cakes se lisent en gâteaux au labo. */
const enGateaux = (q: number, p: { unite: string; partsParGateau: number | null }) =>
  p.unite === "part" && p.partsParGateau ? formatQuantite(Math.round((q / p.partsParGateau) * 100) / 100) : formatQuantite(q);

export default async function Laboratoire({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; vue?: string; date?: string; prevision?: string }>;
}) {
  const { acteur } = await exigerEncadrant();
  const db = await getDb();
  const sp = await searchParams;
  const labos = (await sitesPilotables(db, acteur, { avecLabo: true })).filter((s) => s.type === "laboratoire");
  const vue: Vue = sp.vue === "mois" ? "mois" : "semaine";
  const p = periode(vue, sp.date);
  const labo = labos.find((s) => s.id === sp.site) ?? labos[0];
  if (!labo)
    return (
      <>
        <Titre>Laboratoire</Titre>
        <Message>Aucun laboratoire accessible. La direction déclare le laboratoire dans Sites &amp; créneaux.</Message>
      </>
    );
  const r = await rapportLabo(db, labo.id, p.du, p.au);
  const demain = ajouterJours(journeeLocale(new Date()), 1);
  const jourPrevision = sp.prevision && estJournee(sp.prevision) ? sp.prevision : demain;
  const pdvVisibles = (await sitesPilotables(db, acteur)).map((s) => s.id);
  const prev = await previsionProduction(db, jourPrevision, pdvVisibles);
  const lienPrevision = (j: string) => `?${new URLSearchParams({ ...(sp as Record<string, string>), prevision: j })}`;
  const totalBons = r.livraisons.reduce((t, l) => t + l.bons, 0);
  const bonsEcart = r.livraisons.reduce((t, l) => t + l.avecEcart, 0);

  return (
    <>
      <Titre sousTitre="Production, livraisons aux points de vente, écarts de livraison et consommation des ingrédients.">Laboratoire</Titre>
      <Filtres sites={labos} siteId={labo.id} vue={vue} {...p} />
      {labo.statut !== "actif" && (
        <Message ton="alerte">
          Le laboratoire est « en ouverture » : activez-le dans Sites &amp; créneaux, définissez son créneau et planifiez ses shifts pour que l&apos;équipe
          puisse se connecter.
        </Message>
      )}

      <div className="my-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Shifts clôturés" valeur={r.shiftsClos} />
        <Kpi label="Bons expédiés" valeur={totalBons} />
        <Kpi label="Bons avec écart" valeur={bonsEcart} ton={bonsEcart ? "rouge" : totalBons ? "vert" : undefined} />
        <Kpi label="Ingrédients consommés (coût)" valeur={formatMad(r.valeurConsommation)} />
      </div>

      <Carte className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Prévision de production · {libelleJournee(jourPrevision)}</h2>
          <div className="flex gap-1 text-sm">
            <Link href={lienPrevision(ajouterJours(jourPrevision, -1))} scroll={false} className="rounded-lg px-2 py-1 ring-1 ring-stone-300" aria-label="Jour précédent">
              ‹
            </Link>
            <Link href={lienPrevision(ajouterJours(jourPrevision, 1))} scroll={false} className="rounded-lg px-2 py-1 ring-1 ring-stone-300" aria-label="Jour suivant">
              ›
            </Link>
          </div>
        </div>
        <p className="mb-2 text-sm text-stone-500">
          Quantités par point de vente : cakes en gâteaux entiers, autres produits en pièces. Moyenne des ventes et pertes des {SEMAINES_HISTORIQUE} derniers {NOMS_JOURS[jourIso(jourPrevision)].toLowerCase()}s par point de vente, plus le stock
          minimum, moins le stock au dernier comptage et ce qui est en route ; moins le stock du labo. Une aide à la décision, à ajuster.
        </p>
        {prev.lignes.some((x) => x.aProduire > 0) ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Produit</th>
                  {prev.sites.map((n) => (
                    <th key={n} className="px-1 text-right">
                      {n}
                    </th>
                  ))}
                  <th className="px-1 text-right">Stock labo</th>
                  <th className="text-right">À produire</th>
                </tr>
              </thead>
              <tbody>
                {prev.lignes
                  .filter((x) => x.aProduire > 0)
                  .map((x) => (
                    <tr key={x.produitId} className="border-t border-stone-100">
                      <td className="py-1.5">{x.produit}</td>
                      {prev.sites.map((n) => (
                        <td key={n} className="px-1 text-right align-top tabular-nums">
                          {x.parSite[n]?.aLivrer ? enGateaux(x.parSite[n].aLivrer, x) : ""}
                          {x.parSite[n] && (
                            // Détail visible aussi sur téléphone (pas d'infobulle au toucher).
                            <span className="block text-[11px] leading-tight whitespace-nowrap text-stone-500">
                              besoin {enGateaux(x.parSite[n].besoin, x)} · stock {enGateaux(x.parSite[n].stock, x)}
                              {x.parSite[n].enRoute ? ` · en route ${enGateaux(x.parSite[n].enRoute, x)}` : ""}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-1 text-right tabular-nums">{x.stockLabo ? enGateaux(x.stockLabo, x) : ""}</td>
                      <td className="text-right font-bold tabular-nums">{libelleQuantite(x.aProduire, x)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Rien à produire d&apos;après l&apos;historique (ou pas encore assez de shifts clôturés).</p>
        )}
      </Carte>

      <Carte>
        <h2 className="font-semibold">Production par jour</h2>
        <p className="mb-2 text-sm text-stone-500">Cakes en gâteaux entiers, autres produits en pièces.</p>
        {r.production.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Produit</th>
                  {r.jours.map((j) => (
                    <th key={j} className="px-1 text-right">
                      {jj(j)}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.production.map((x) => (
                  <tr key={x.produitId} className="border-t border-stone-100">
                    <td className="py-1.5">{x.produit}</td>
                    {r.jours.map((j) => (
                      <td key={j} className="px-1 text-right tabular-nums">
                        {x.parJour[j] ? enGateaux(x.parJour[j], x) : ""}
                      </td>
                    ))}
                    <td className="text-right font-semibold tabular-nums">{enGateaux(x.total, x)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Aucune production saisie sur la période.</p>
        )}
      </Carte>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Carte>
          <h2 className="mb-2 font-semibold">Livraisons par point de vente</h2>
          {r.livraisons.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Point de vente</th>
                  <th className="text-right">Bons</th>
                  <th className="text-right">Reçus</th>
                  <th className="text-right">En attente</th>
                  <th className="text-right">Avec écart</th>
                </tr>
              </thead>
              <tbody>
                {r.livraisons.map((l) => (
                  <tr key={l.destination} className="border-t border-stone-100">
                    <td className="py-1.5">{l.destination}</td>
                    <td className="text-right tabular-nums">{l.bons}</td>
                    <td className="text-right tabular-nums">{l.recus}</td>
                    <td className="text-right tabular-nums">{l.enAttente || ""}</td>
                    <td className={cx("text-right tabular-nums", l.avecEcart > 0 && "font-bold text-red-700")}>{l.avecEcart || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <p className="text-sm text-stone-500">Aucun bon expédié sur la période.</p>
          )}
          {r.enAttente.length > 0 && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <h3 className="mb-1 text-sm font-semibold">Expédiés, pas encore réceptionnés</h3>
              <ul className="text-sm">
                {r.enAttente.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-0.5">
                    <span>
                      Bon n° {b.numero} → {b.destination}
                    </span>
                    <span className="text-stone-500">{b.expedieLe ? formatLocal(b.expedieLe, "dd/MM HH:mm") : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Carte>

        <Carte>
          <h2 className="mb-1 font-semibold">Écarts de livraison</h2>
          <p className="mb-2 text-sm text-stone-500">Reçu au point de vente différent de l&apos;expédié (produit manquant, abîmé, erreur de saisie).</p>
          {r.ecartsLivraison.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Bon</th>
                  <th className="text-left">Produit</th>
                  <th className="text-right">Expédié</th>
                  <th className="text-right">Reçu</th>
                </tr>
              </thead>
              <tbody>
                {r.ecartsLivraison.map((e) => (
                  <tr key={`${e.bonId}-${e.produit}`} className="border-t border-stone-100">
                    <td className="py-1.5 whitespace-nowrap">
                      n° {e.numero} <span className="text-stone-500">· {e.destination}</span>
                    </td>
                    <td>{e.produit}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{libelleQuantite(e.expedie, e)}</td>
                    <td className="text-right font-bold whitespace-nowrap text-red-700 tabular-nums">{libelleQuantite(e.recu, e)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <p className="text-sm text-stone-500">Aucun écart de livraison sur la période.</p>
          )}
        </Carte>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Carte>
          <h2 className="mb-1 font-semibold">Consommation des ingrédients</h2>
          <p className="mb-2 text-sm text-stone-500">
            Réelle : stock d&apos;ouverture + réceptions − pertes − stock compté, cumulé sur les shifts clôturés, valorisée au coût de
            l&apos;ingrédient. Fiche : consommation attendue d&apos;après les fiches techniques (en rouge si la réelle la dépasse).
          </p>
          {r.consommation.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 text-left">Ingrédient</th>
                  <th className="text-right">Réelle</th>
                  <th className="text-right">Fiche</th>
                  <th className="text-right">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {r.consommation.map((c) => (
                  <tr key={c.produitId} className="border-t border-stone-100">
                    <td className="py-1.5">{c.produit}</td>
                    <td className={cx("text-right whitespace-nowrap tabular-nums", c.quantite < 0 && "text-amber-700")}>
                      {formatQuantite(c.quantite)} {UNITE_PLURIEL[c.unite]}
                    </td>
                    <td className={cx("text-right whitespace-nowrap tabular-nums", c.theorique !== null && c.quantite > c.theorique && "font-semibold text-red-700")}>
                      {c.theorique === null ? "—" : formatQuantite(c.theorique)}
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">{c.coutConnu ? formatMad(c.valeur) : <span className="text-stone-400">coût inconnu</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <p className="text-sm text-stone-500">Pas de consommation calculée sur la période (shifts clôturés nécessaires).</p>
          )}
          {r.consommation.some((c) => c.quantite < 0) && (
            <p className="mt-2 text-xs text-amber-800">
              Une consommation négative signale plus de stock compté que prévu : réception non saisie ou erreur de comptage.
            </p>
          )}
        </Carte>

        <Carte>
          <h2 className="mb-2 font-semibold">Pertes au laboratoire</h2>
          {r.pertes.length ? (
            <ul className="divide-y divide-stone-100 text-sm">
              {r.pertes.map((x) => (
                <li key={x.produitId} className="flex justify-between gap-2 py-1.5">
                  <span>{x.produit}</span>
                  <span className="tabular-nums">{libelleQuantite(x.quantite, x)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Aucune perte déclarée sur la période.</p>
          )}
        </Carte>
      </div>
      <p className="mt-4 text-xs text-stone-500">
        <Pastille>Période</Pastille> {libelleJournee(p.du)} → {libelleJournee(p.au)}
      </p>
    </>
  );
}
