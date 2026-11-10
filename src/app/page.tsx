import Link from "next/link";
import { BarreHaut } from "@/components/BarreHaut";
import { BoutonAction } from "@/components/BoutonAction";
import { Carte, LienBouton, Message, Pastille } from "@/components/ui";
import { libelleHoraire } from "@/domain/creneaux";
import { formatLocal, heureLocale, libelleJournee } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { exigerSession } from "@/lib/session";
import { estEncadrant } from "@/server/acteur";
import { ListeAlertes } from "@/components/ListeAlertes";
import { alertesExploitation } from "@/server/services/alertes";
import { etatAccueil, type ResumeShift } from "@/server/services/shifts";
import { lireSite } from "@/server/services/sites";
import { actionCreerEtOuvrir, actionOuvrirShift } from "./actions-shift";

export const dynamic = "force-dynamic";

function Horaire({ s }: { s: ResumeShift }) {
  return (
    <span>
      {libelleJournee(s.journee)} · {libelleHoraire({ heureDebut: heureLocale(s.debutPrevu), heureFin: heureLocale(s.finPrevue) })}
    </span>
  );
}

export default async function Accueil() {
  const session = await exigerSession();
  const db = await getDb();
  const site = await lireSite(db, session.siteId);
  const maintenant = new Date();
  const etat = await etatAccueil(db, site.id, maintenant);
  const { acteur } = session;
  const peutOuvrir = (s: ResumeShift) => s.responsableId === acteur.id || estEncadrant(acteur);
  // Les encadrants voient ce qui demande une action sur ce site (shift non clôturé, écart, rupture…).
  const alertes = estEncadrant(acteur) ? await alertesExploitation(db, [site.id], maintenant) : [];

  return (
    <>
      <BarreHaut session={session} nomSite={site.nom} />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-5">
        <h1 className="text-2xl font-bold">Bonjour {acteur.nom}</h1>
        {alertes.length > 0 && <ListeAlertes alertes={alertes} max={3} afficherSite={false} />}

        {etat.ouvert ? (
          <Carte className="ring-2 ring-marque-500">
            <div className="mb-1 flex items-center gap-2">
              <Pastille ton="vert">Shift en cours</Pastille>
            </div>
            <h2 className="text-xl font-bold">{etat.ouvert.nomCreneau}</h2>
            <p className="text-stone-600">
              <Horaire s={etat.ouvert} />
            </p>
            <p className="mb-4 text-stone-600">Responsable d&apos;inventaire : {etat.ouvert.responsable ?? "—"}</p>
            <LienBouton href={`/shift/${etat.ouvert.id}`} grand className="w-full">
              Continuer la saisie
            </LienBouton>
          </Carte>
        ) : etat.aOuvrir ? (
          <Carte className="ring-2 ring-marque-500">
            <Pastille ton="orange">À ouvrir</Pastille>
            <h2 className="mt-1 text-xl font-bold">{etat.aOuvrir.nomCreneau}</h2>
            <p className="text-stone-600">
              <Horaire s={etat.aOuvrir} />
            </p>
            <p className="mb-4 text-stone-600">Responsable d&apos;inventaire : {etat.aOuvrir.responsable ?? "—"}</p>
            {peutOuvrir(etat.aOuvrir) ? (
              <BoutonAction action={actionOuvrirShift.bind(null, etat.aOuvrir.id)} grand className="w-full">
                Ouvrir le shift
              </BoutonAction>
            ) : (
              <Message>Seul {etat.aOuvrir.responsable} (ou un manager) peut ouvrir ce shift.</Message>
            )}
          </Carte>
        ) : (
          <Carte>
            <h2 className="text-lg font-semibold">Aucun shift à ouvrir pour le moment</h2>
            {etat.creneauSansShift ? (
              <>
                <p className="mb-3 text-stone-600">
                  Le créneau « {etat.creneauSansShift.creneau.nom} » ({libelleJournee(etat.creneauSansShift.journee)},{" "}
                  {libelleHoraire(etat.creneauSansShift.creneau)}) n&apos;a pas été planifié.
                </p>
                {estEncadrant(acteur) ? (
                  <BoutonAction action={actionCreerEtOuvrir} grand className="w-full">
                    Créer et ouvrir ce shift
                  </BoutonAction>
                ) : (
                  <Message ton="alerte">Prévenez votre manager pour qu&apos;il planifie ce shift.</Message>
                )}
              </>
            ) : (
              <p className="text-stone-600">Le prochain shift apparaîtra ici une heure avant son début.</p>
            )}
          </Carte>
        )}

        {etat.prochains.length > 0 && (
          <Carte>
            <h2 className="mb-2 font-semibold">Prochains shifts</h2>
            <ul className="divide-y divide-stone-100">
              {etat.prochains.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-semibold">{s.nomCreneau}</span> · <Horaire s={s} />
                  </span>
                  <span className="text-sm text-stone-600">{s.responsable ?? "Responsable non désigné"}</span>
                </li>
              ))}
            </ul>
          </Carte>
        )}

        {etat.dernierClos && (
          <p className="text-sm text-stone-600">
            Dernier shift clôturé :{" "}
            <Link className="font-semibold text-marque-700 underline" href={`/shift/${etat.dernierClos.id}/cloture`}>
              {etat.dernierClos.nomCreneau} du {libelleJournee(etat.dernierClos.journee)}
            </Link>{" "}
            (fin prévue {formatLocal(etat.dernierClos.finPrevue, "HH:mm")})
          </p>
        )}
      </main>
    </>
  );
}
