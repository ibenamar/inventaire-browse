import { UNITE_SINGULIER } from "@/domain/unites";
import Link from "next/link";
import { PhotoProduit } from "@/components/PhotoProduit";
import { cx, formatMad, Kpi, LienBouton, Pastille, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listerProduits, type ProduitVue } from "@/server/services/catalogue";
import { exigerDirection } from "../acces";

const UNITES = UNITE_SINGULIER;

export default async function Catalogue() {
  await exigerDirection();
  const produits = await listerProduits(await getDb());
  const parCat = new Map<string, ProduitVue[]>();
  for (const p of produits) parCat.set(p.categorie, [...(parCat.get(p.categorie) ?? []), p]);
  const actifs = produits.filter((p) => p.actif);
  return (
    <>
      <Titre
        sousTitre="Photos, prix (repris de Loyverse), unité de comptage, coût de revient, stocks minimum."
        actions={<LienBouton href="/admin/catalogue/nouveau">+ Nouveau produit</LienBouton>}
      >
        Catalogue
      </Titre>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Produits actifs" valeur={actifs.length} />
        <Kpi label="Suivis en stock" valeur={actifs.filter((p) => p.suiviStock).length} />
        <Kpi label="Sans photo" valeur={actifs.filter((p) => !p.photoId).length} ton={actifs.some((p) => !p.photoId) ? "rouge" : "vert"} />
        <Kpi label="Sans prix" valeur={actifs.filter((p) => p.prixVente === null).length} ton={actifs.some((p) => p.prixVente === null) ? "rouge" : "vert"} />
      </div>
      {[...parCat.entries()].map(([cat, ps]) => (
        <section key={cat} className="mb-5">
          <h2 className="mb-2 font-semibold">{cat}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {ps.map((p) => (
              <Link
                key={p.id}
                href={`/admin/catalogue/${p.id}`}
                className={cx("overflow-hidden rounded-2xl bg-card ring-1 ring-border hover:ring-primary", !p.actif && "opacity-50")}
              >
                <PhotoProduit photoId={p.photoId} nom={p.nom} categorie={p.categorie} />
                <div className="p-2">
                  <div className="line-clamp-2 min-h-10 text-sm leading-tight font-semibold">{p.nom}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {p.nature === "produit" && <span>{formatMad(p.prixVente)} ·</span>}
                    <span>{UNITES[p.unite]}</span>
                    {p.nature === "ingredient" && <Pastille ton="marque">matière première</Pastille>}
                    {p.nature === "intermediaire" && <Pastille ton="marque">préparation</Pastille>}
                    {p.fabriqueLabo && <Pastille ton="bleu">labo</Pastille>}
                    {!p.suiviStock && <Pastille>vente seule</Pastille>}
                    {!p.actif && <Pastille ton="rouge">inactif</Pastille>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
