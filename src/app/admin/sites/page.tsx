import Link from "next/link";
import { Pastille, Titre } from "@/components/ui";
import { libelleHoraire } from "@/domain/creneaux";
import { NOMS_JOURS_COURTS } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { listerCreneaux, listerSites } from "@/server/services/sites";
import { exigerDirection } from "../acces";

export default async function Sites() {
  await exigerDirection();
  const db = await getDb();
  const sites = await listerSites(db);
  const creneaux = await Promise.all(sites.map((s) => listerCreneaux(db, s.id)));
  return (
    <>
      <Titre sousTitre="Statut des sites, mode d'ouverture et grille des créneaux par jour de la semaine.">Sites & créneaux</Titre>
      <div className="grid gap-3 md:grid-cols-2">
        {sites.map((s, i) => (
          <Link key={s.id} href={`/admin/sites/${s.id}`} className="rounded-2xl bg-card p-4 ring-1 ring-border hover:ring-primary">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{s.nom}</span>
              {s.type === "laboratoire" && <Pastille ton="marque">Laboratoire</Pastille>}
              <Pastille ton={s.statut === "actif" ? "vert" : "neutre"}>{s.statut === "actif" ? "Actif" : "En ouverture"}</Pastille>
            </div>
            <div className="mb-2 text-sm text-muted-foreground">
              Ouverture : {s.modeOuverture === "reprise" ? "reprise de la clôture précédente" : "recomptage par l'équipe entrante"}
            </div>
            {creneaux[i].length ? (
              <ul className="text-sm">
                {creneaux[i].map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{c.nom}</span> · {libelleHoraire(c)} ·{" "}
                    <span className="text-muted-foreground">{c.jours.map((j) => NOMS_JOURS_COURTS[j]).join(" ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun créneau défini</p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
