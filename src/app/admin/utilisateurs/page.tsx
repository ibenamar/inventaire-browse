import Link from "next/link";
import { Carte, Pastille, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listerSites } from "@/server/services/sites";
import { listerUtilisateurs } from "@/server/services/utilisateurs";
import { exigerDirection } from "../acces";
import { actionCreerUtilisateur } from "../actions";
import { FormulaireUtilisateur } from "./FormulaireUtilisateur";

const ROLES = { employe: "Employé", manager: "Manager", direction: "Direction", labo: "Laboratoire" };

export default async function Utilisateurs() {
  await exigerDirection();
  const db = await getDb();
  const sites = await listerSites(db);
  const noms = new Map(sites.map((s) => [s.id, s.nom]));
  const us = await listerUtilisateurs(db);
  return (
    <>
      <Titre sousTitre="Chaque personne a son propre code PIN : chaque saisie lui est attribuée.">Utilisateurs</Titre>
      <ul className="mb-6 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
        {us.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/utilisateurs/${u.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
              <span className="font-semibold">{u.nom}</span>
              <Pastille ton={u.role === "direction" ? "marque" : u.role === "manager" ? "bleu" : "neutre"}>{ROLES[u.role]}</Pastille>
              {!u.actif && <Pastille ton="rouge">Désactivé</Pastille>}
              <span className="ml-auto text-sm text-stone-500">
                {u.role === "direction" ? "Tous les sites" : u.siteIds.map((id) => noms.get(id)).filter(Boolean).join(", ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Carte>
        <h2 className="mb-3 text-lg font-semibold">Nouvel utilisateur</h2>
        <FormulaireUtilisateur action={actionCreerUtilisateur} sites={sites} creation />
      </Carte>
    </>
  );
}
