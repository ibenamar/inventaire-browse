import Link from "next/link";
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
      <Link href="/admin/utilisateurs" className="text-sm font-semibold text-marque-700">
        ← Utilisateurs
      </Link>
      <Titre>{u.nom}</Titre>
      <Carte>
        <FormulaireUtilisateur action={actionModifierUtilisateur.bind(null, id)} sites={sites} initial={u} />
      </Carte>
    </>
  );
}
