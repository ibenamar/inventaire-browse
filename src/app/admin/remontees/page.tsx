import Link from "next/link";
import { PastilleRemontee } from "@/components/StatutRemontee";
import { cx, formatMad, Titre } from "@/components/ui";
import { heureLocale, libelleJournee } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { suiviRemontees } from "@/server/services/remontees";
import { exigerEncadrant, sitesPilotables } from "../acces";
import { Filtres } from "../Filtres";
import { periode, type Vue } from "../periode";

export default async function Remontees({ searchParams }: { searchParams: Promise<{ site?: string; vue?: string; date?: string }> }) {
  const { acteur } = await exigerEncadrant();
  const db = await getDb();
  const sp = await searchParams;
  const sites = await sitesPilotables(db, acteur);
  const tous = acteur.role === "direction";
  const siteId = sites.find((s) => s.id === sp.site)?.id ?? (tous ? null : (sites[0]?.id ?? null));
  const vue: Vue = sp.vue === "mois" ? "mois" : "semaine";
  const p = periode(vue, sp.date);
  const maintenant = new Date();
  const r = await suiviRemontees(db, { siteId: siteId ?? undefined, du: p.du, au: p.au }, maintenant);
  const idsPilotables = new Set(sites.map((s) => s.id));
  const shifts = r.shifts.filter((s) => idsPilotables.has(s.siteId)).reverse();

  return (
    <>
      <Titre sousTitre="Comptages remontés à l'heure, en retard ou manquants, par responsable d'inventaire.">Suivi des remontées</Titre>
      <Filtres sites={sites} siteId={siteId} tousLesSites={tous} vue={vue} {...p} />

      <h2 className="mb-2 text-lg font-semibold">Par responsable</h2>
      <div className="mb-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-stone-200">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-xs text-stone-600">
            <tr>
              <th className="px-3 py-2 text-left">Responsable</th>
              <th className="px-3 py-2 text-right">Shifts échus</th>
              <th className="px-3 py-2 text-right">À l&apos;heure</th>
              <th className="px-3 py-2 text-right">En retard</th>
              <th className="px-3 py-2 text-right">Manquants</th>
              <th className="px-3 py-2 text-right">Taux</th>
              <th className="px-3 py-2 text-right">Valeur des écarts</th>
              <th className="px-3 py-2 text-right">Pertes</th>
            </tr>
          </thead>
          <tbody>
            {r.parResponsable.map((b) => (
              <tr key={b.responsableId ?? "-"} className="border-t border-stone-100">
                <td className="px-3 py-2 font-semibold">{b.responsable}</td>
                <td className="px-3 py-2 text-right">{b.planifies}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{b.aLHeure}</td>
                <td className={cx("px-3 py-2 text-right", b.enRetard > 0 && "font-semibold text-amber-700")}>{b.enRetard}</td>
                <td className={cx("px-3 py-2 text-right", b.manquants > 0 && "font-semibold text-red-700")}>{b.manquants}</td>
                <td className="px-3 py-2 text-right font-bold">{b.tauxALHeure === null ? "—" : `${b.tauxALHeure} %`}</td>
                <td className={cx("px-3 py-2 text-right", b.valeurEcartsVente < 0 && "text-red-700")}>{formatMad(b.valeurEcartsVente)}</td>
                <td className="px-3 py-2 text-right">{formatMad(b.valeurPertesVente)}</td>
              </tr>
            ))}
            {r.parResponsable.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500">
                  Aucun shift échu sur la période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Shifts de la période</h2>
      <ul className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
        {shifts.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {s.nomCreneau} · {libelleJournee(s.journee)} · {heureLocale(s.debutPrevu)}–{heureLocale(s.finPrevue)}
              </div>
              <div className="text-sm text-stone-600">
                {!siteId && `${s.site} · `}
                {s.responsable ?? "Responsable non désigné"}
                {s.produitsAvecEcart !== null && ` · ${s.produitsAvecEcart} écart(s), ${formatMad(s.valeurEcartsVente)}`}
              </div>
            </div>
            <PastilleRemontee statut={s.statutRemontee} />
            {s.statut !== "planifie" && (
              <Link href={`/shift/${s.id}/cloture`} className="text-sm font-semibold text-marque-700 underline">
                Détail
              </Link>
            )}
          </li>
        ))}
        {shifts.length === 0 && <li className="px-4 py-6 text-center text-stone-500">Aucun shift planifié sur la période.</li>}
      </ul>
    </>
  );
}
