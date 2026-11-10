import Link from "next/link";
import { Carte, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listerCategories } from "@/server/services/catalogue";
import { CATEGORIE_INGREDIENTS } from "@/server/seed";
import { exigerDirection } from "../../acces";
import { FormulaireNouveauProduit } from "./FormulaireNouveauProduit";

export default async function NouveauProduit() {
  await exigerDirection();
  const categories = await listerCategories(await getDb());
  return (
    <>
      <Link href="/admin/catalogue" className="text-sm font-semibold text-marque-700">
        ← Catalogue
      </Link>
      <Titre sousTitre="La référence est attribuée automatiquement. Photo, coût, articles Loyverse et stocks minimum se règlent ensuite sur la fiche.">
        Nouveau produit
      </Titre>
      <Carte>
        <FormulaireNouveauProduit
          categories={categories.map((c) => ({ id: c.id, nom: c.nom }))}
          categorieIngredients={categories.find((c) => c.nom === CATEGORIE_INGREDIENTS)?.id ?? null}
        />
      </Carte>
    </>
  );
}
