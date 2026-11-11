import { FilAriane } from "@/components/FilAriane";
import { notFound } from "next/navigation";
import { Carte, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listerSites } from "@/server/services/sites";
import { listerUtilisateurs } from "@/server/services/utilisateurs";
import { exigerDirection } from "../../acces";
import { actionModifierUtilisateur } from "../../actions";
import { FormulaireUtilisateur } from "../FormulaireUtilisateur";

export default async function Utilisateur({ params }: { params: Promise<{ id: string }> }) {
  await exigerDirection();
  const { id } = await params;
  const db = await getDb();
  const u = (await listerUtilisateurs(db)).find((x) => x.id === id);
  if (!u) notFound();
  const sites = await listerSites(db);
  return (
    <>
      <FilAriane etapes={[{ libelle: "Administration", href: "/admin" }, { libelle: "Utilisateurs", href: "/admin/utilisateurs" }, { libelle: u.nom }]} />
      <Titre>{u.nom}</Titre>
      <Carte>
        <FormulaireUtilisateur action={actionModifierUtilisateur.bind(null, id)} sites={sites} initial={u} />
      </Carte>
    </>
  );
}
