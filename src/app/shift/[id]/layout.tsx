import Link from "next/link";
import { BarreHaut } from "@/components/BarreHaut";
import { Pastille } from "@/components/ui";
import { libelleHoraire } from "@/domain/creneaux";
import { heureLocale, libelleJournee } from "@/domain/temps";
import { chargerShift } from "./donnees";

const STATUTS = {
  planifie: { libelle: "Planifié", ton: "neutre" },
  ouvert: { libelle: "Ouvert", ton: "vert" },
  cloture: { libelle: "Clôturé", ton: "bleu" },
  valide: { libelle: "Validé", ton: "bleu" },
} as const;

export default async function LayoutShift({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, d } = await chargerShift(id);
  const s = d.shift;
  const st = STATUTS[s.statut];
  return (
    <>
      <BarreHaut session={session} nomSite={s.site} />
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/shift/${id}`} className="text-lg font-bold hover:underline">
              {s.nomCreneau}
            </Link>
            <Pastille ton={st.ton}>{st.libelle}</Pastille>
            {s.clotureForcee && <Pastille ton="orange">Clôture forcée</Pastille>}
          </div>
          <p className="text-sm text-stone-600">
            {libelleJournee(s.journee)} · {libelleHoraire({ heureDebut: heureLocale(s.debutPrevu), heureFin: heureLocale(s.finPrevue) })} ·
            Responsable : {s.responsable ?? "—"}
            {d.equipe.length > 1 && ` · Équipe : ${d.equipe.map((e) => e.nom).join(", ")}`}
          </p>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </>
  );
}
