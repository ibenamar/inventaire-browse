import Link from "next/link";
import { PastilleRemontee } from "@/components/StatutRemontee";
import { cx, Message, Titre } from "@/components/ui";
import { intervalleCreneau, libelleHoraire } from "@/domain/creneaux";
import { statutRemontee } from "@/domain/remontees";
import { heureLocale, jourIso, journeeLocale, libelleJournee, NOMS_JOURS_COURTS } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { equipiersPossibles, grillePlanning } from "@/server/services/planning";
import { exigerEncadrant, sitesPilotables } from "../acces";
import { Filtres } from "../Filtres";
import { periode, type Vue } from "../periode";
import { CasePlanning, DupliquerSemaine } from "./Cases";

export default async function Planning({ searchParams }: { searchParams: Promise<{ site?: string; vue?: string; date?: string }> }) {
  const { acteur } = await exigerEncadrant();
  const db = await getDb();
  const sp = await searchParams;
  const sites = (await sitesPilotables(db, acteur, { avecLabo: true })).filter((s) => s.statut === "actif");
  if (!sites.length) return <Message ton="alerte">Aucun site actif à planifier.</Message>;
  const site = sites.find((s) => s.id === sp.site) ?? sites[0];
  const vue: Vue = sp.vue === "mois" ? "mois" : "semaine";
  const p = periode(vue, sp.date);
  const jours = await grillePlanning(db, site.id, p.du, p.au);
  const equipiers = await equipiersPossibles(db, site.id);
  const maintenant = new Date();
  const aujourdhui = journeeLocale(maintenant);
  const sansCreneaux = jours.every((j) => j.cases.length === 0);

  return (
    <>
      <Titre
        sousTitre="Désignez pour chaque shift un responsable d'inventaire et, si besoin, un coéquipier (2 personnes au maximum)."
        actions={vue === "semaine" ? <DupliquerSemaine siteId={site.id} lundi={p.du} /> : undefined}
      >
        Planning
      </Titre>
      <Filtres sites={sites} siteId={site.id} vue={vue} {...p} />
      {sansCreneaux && (
        <Message ton="alerte">
          Aucun créneau défini pour ce site. {acteur.role === "direction" ? <Link className="underline" href={`/admin/sites/${site.id}`}>Définir les créneaux</Link> : "Demandez à la direction de les définir."}
        </Message>
      )}

      {vue === "semaine" ? (
        <div className="grid gap-3">
          {jours.map((j) => (
            <section key={j.journee} className={cx("rounded-2xl bg-card p-3 ring-1", j.journee === aujourdhui ? "ring-2 ring-primary" : "ring-border")}>
              <h2 className="mb-2 font-semibold">{libelleJournee(j.journee)}</h2>
              {j.cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun créneau ce jour.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {j.cases.map((c) => {
                    const horaire = c.creneau
                      ? libelleHoraire(c.creneau)
                      : libelleHoraire({ heureDebut: heureLocale(c.shift!.debutPrevu), heureFin: heureLocale(c.shift!.finPrevue) });
                    return (
                      <CasePlanning
                        key={c.shift?.id ?? c.creneau?.id}
                        siteId={site.id}
                        journee={j.journee}
                        creneauId={c.creneau?.id ?? null}
                        termine={!c.shift && !!c.creneau && intervalleCreneau(j.journee, c.creneau).fin <= new Date()}
                        nom={c.nomCreneau}
                        horaire={horaire}
                        equipiers={equipiers}
                        shift={
                          c.shift && {
                            id: c.shift.id,
                            statut: c.shift.statut,
                            responsableId: c.shift.responsableId,
                            responsable: c.shift.responsable,
                            equipierId: c.shift.equipe.find((e) => e.id !== c.shift!.responsableId)?.id ?? null,
                            equipier: c.shift.equipe.find((e) => e.id !== c.shift!.responsableId)?.nom ?? null,
                          }
                        }
                        remontee={c.shift ? <PastilleRemontee statut={statutRemontee(c.shift, maintenant)} /> : null}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((j) => (
              <div key={j} className="px-1 text-center text-xs font-semibold text-muted-foreground">
                {NOMS_JOURS_COURTS[j]}
              </div>
            ))}
            {Array.from({ length: jourIso(p.du) - 1 }).map((_, i) => (
              <div key={`vide-${i}`} />
            ))}
            {jours.map((j) => (
              <Link
                key={j.journee}
                href={`/admin/planning?site=${site.id}&vue=semaine&date=${j.journee}`}
                className={cx("min-h-24 rounded-xl bg-card p-1.5 ring-1 hover:ring-primary", j.journee === aujourdhui ? "ring-2 ring-primary" : "ring-border")}
              >
                <div className="text-xs font-bold">{Number(j.journee.slice(8))}</div>
                <div className="mt-1 grid gap-0.5">
                  {j.cases.map((c) => {
                    const st = c.shift ? statutRemontee(c.shift, maintenant) : null;
                    return (
                      <div
                        key={c.shift?.id ?? c.creneau?.id}
                        className={cx(
                          "truncate rounded px-1 text-xs leading-5",
                          !c.shift && "bg-muted text-muted-foreground",
                          st === "a_l_heure" && "bg-success-soft text-success",
                          (st === "a_venir" || st === "en_cours") && "bg-info-soft text-info",
                          st === "en_retard" && "bg-warning-soft text-warning",
                          st === "manquant" && "bg-destructive-soft text-destructive",
                        )}
                        title={`${c.nomCreneau} : ${c.shift?.responsable ?? "non planifié"}`}
                      >
                        {c.nomCreneau.slice(0, 3)} · {c.shift?.responsable ?? "—"}
                      </div>
                    );
                  })}
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Touchez un jour pour modifier la semaine correspondante.</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Les shifts de nuit sont rattachés au jour où ils commencent (ex. vendredi 20:00 → samedi 04:00 apparaît le vendredi).
      </p>
    </>
  );
}
