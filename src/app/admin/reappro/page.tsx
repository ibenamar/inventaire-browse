import Link from "next/link";
import { BoutonAction } from "@/components/BoutonAction";
import { Carte, Message, Titre } from "@/components/ui";
import { libelleJournee } from "@/domain/temps";
import { libelleQuantite } from "@/domain/unites";
import { getDb } from "@/lib/db";
import { besoinsReappro } from "@/server/services/reappro";
import { actionPreparerReappro } from "../actions";
import { exigerEncadrant, sitesPilotables } from "../acces";

/** Réapprovisionnement : produits sous le stock minimum et quantités à fournir, par site. */
export default async function Reappro() {
  const { acteur } = await exigerEncadrant();
  const db = await getDb();
  const sites = (await sitesPilotables(db, acteur, { avecLabo: true })).filter((s) => s.statut === "actif");
  const besoins = await besoinsReappro(db, sites.map((s) => s.id));
  const aucun = besoins.every((b) => !b.besoins.length);
  return (
    <>
      <Titre sousTitre="Produits sous leur stock minimum au dernier comptage de clôture, déduction faite de ce qui est déjà en route. Les cakes sont arrondis au gâteau entier.">
        Réapprovisionnement
      </Titre>
      {aucun && (
        <Message>
          Aucun produit sous le stock minimum. Les minimums se règlent sur chaque{" "}
          <Link href="/admin/catalogue" className="underline">
            fiche produit
          </Link>{" "}
          et s&apos;appliquent à partir du prochain shift ouvert de chaque site.
        </Message>
      )}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {besoins
          .filter((b) => b.besoins.length)
          .map((b) => {
            const labo = b.besoins.filter((x) => x.source === "labo");
            const fournisseur = b.besoins.filter((x) => x.source === "fournisseur");
            return (
              <Carte key={b.siteId}>
                <h2 className="font-semibold">{b.site}</h2>
                <p className="mb-2 text-sm text-stone-500">Dernier comptage : {b.journee ? libelleJournee(b.journee) : "—"}</p>
                {labo.length > 0 && (
                  <>
                    <h3 className="mt-2 text-sm font-semibold text-marque-900">À livrer par le laboratoire</h3>
                    <Tableau lignes={labo} />
                    <div className="mt-2">
                      <BoutonAction action={actionPreparerReappro.bind(null, b.siteId)} confirmation={`Préparer au laboratoire le bon de ${b.site} ?`}>
                        Préparer le bon du laboratoire
                      </BoutonAction>
                    </div>
                  </>
                )}
                {fournisseur.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold text-marque-900">
                      {b.typeSite === "laboratoire" ? "Ingrédients à commander" : "À commander au fournisseur"}
                    </h3>
                    <Tableau lignes={fournisseur} />
                  </>
                )}
              </Carte>
            );
          })}
      </div>
    </>
  );
}

function Tableau({ lignes }: { lignes: Awaited<ReturnType<typeof besoinsReappro>>[number]["besoins"] }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="text-xs text-stone-500">
        <tr>
          <th className="py-1 text-left">Produit</th>
          <th className="text-right">Stock / min.</th>
          <th className="text-right">En route</th>
          <th className="text-right">À fournir</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.produitId} className="border-t border-stone-100">
            <td className="py-1.5">{l.produit}</td>
            <td className="text-right whitespace-nowrap tabular-nums">
              <span className="font-bold text-red-700">{libelleQuantite(l.stock, l)}</span>
              <span className="block text-xs text-stone-500">min. {libelleQuantite(l.minimum, l)}</span>
            </td>
            <td className="text-right whitespace-nowrap tabular-nums">{l.enRoute ? libelleQuantite(l.enRoute, l) : ""}</td>
            <td className="text-right font-semibold whitespace-nowrap tabular-nums">{libelleQuantite(l.aFournir, l)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
