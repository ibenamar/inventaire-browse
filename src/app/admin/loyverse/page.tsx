import { Carte, Message, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { estDisponible, listerArticles, listerCanaux, magasinsConnus } from "@/server/services/caisse";
import { listerSites } from "@/server/services/sites";
import { listerProduits } from "@/server/services/catalogue";
import { exigerDirection } from "../acces";
import { ArticlesNonAssocies, ImportLoyverse } from "./ImportLoyverse";
import { MagasinsSites } from "./MagasinsSites";

export default async function Loyverse() {
  await exigerDirection();
  const db = await getDb();
  const configure = Boolean(process.env.LOYVERSE_TOKEN);
  const [tousNonAssocies, canaux, produits, tous, magasins, sites] = await Promise.all([
    listerArticles(db, { nonAssocies: true }),
    listerCanaux(db),
    listerProduits(db, { actifsSeulement: true }),
    listerArticles(db),
    magasinsConnus(db),
    listerSites(db),
  ]);
  // Les articles retirés de la vente dans tous les magasins ne sont pas proposés.
  const nonAssocies = tousNonAssocies.filter(estDisponible);
  const parCanal = canaux.map((c) => ({ ...c, n: tous.filter((a) => a.canalId === c.id && a.produitId).length }));
  return (
    <>
      <Titre sousTitre="Loyverse reste la référence des articles et des prix. Un produit peut avoir un article par canal (sur place, Glovo…).">
        Loyverse
      </Titre>
      <div className="grid gap-4">
        {!configure && (
          <Message ton="alerte">
            Le jeton d&apos;accès Loyverse n&apos;est pas encore configuré. Dans le Back Office Loyverse : Intégrations › Jetons d&apos;accès › Ajouter
            un jeton, puis l&apos;enregistrer dans le secret GitHub LOYVERSE_TOKEN et relancer le déploiement.
          </Message>
        )}
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Articles et prix</h2>
          <p className="mb-3 text-sm text-stone-600">
            Importe tous les articles Loyverse avec leur prix dans chaque magasin. Les articles de la catégorie « Glovo » vont sur le canal Glovo. Le
            rattachement aux produits suit la table de correspondances validée (y compris les gâteaux entiers et les boîtes), puis les noms
            identiques. Les articles déjà rattachés gardent leur rattachement ; seuls leurs nom, catégorie et prix sont mis à jour.
          </p>
          <ImportLoyverse actif={configure} />
          <p className="mt-3 text-sm text-stone-600">
            Articles rattachés : {parCanal.map((c) => `${c.nom} ${c.n}`).join(" · ")}
          </p>
        </Carte>
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Magasins Loyverse</h2>
          <p className="mb-3 text-sm text-stone-600">
            Les prix peuvent différer d&apos;un magasin à l&apos;autre (ex. Carrot Cake 45 MAD au Coffee Shop, 40 MAD chez Browse Sweet) : indiquez le
            magasin Loyverse de chaque site.
          </p>
          <MagasinsSites
            sites={sites.filter((s) => s.type === "point_de_vente").map((s) => ({ id: s.id, nom: s.nom, magasin: s.loyverseMagasin }))}
            magasins={magasins}
          />
        </Carte>
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Articles à rattacher ({nonAssocies.length})</h2>
          <p className="mb-3 text-sm text-stone-600">
            Articles Loyverse non reconnus automatiquement. Indiquez le produit qu&apos;ils font sortir du stock et leur canal. Tant qu&apos;un article
            n&apos;est pas rattaché, ses ventes ne seront pas importées.
          </p>
          <ArticlesNonAssocies
            articles={nonAssocies.map((a) => ({
              id: a.id,
              nom: a.nomCaisse,
              categorie: a.categorieCaisse,
              sku: a.sku,
              prix: a.prixMagasins.length ? a.prixMagasins : [{ magasin: "Défaut", prix: a.prixVente }],
              canalId: a.canalId,
            }))}
            produits={produits.map((p) => ({ id: p.id, nom: p.nom, categorie: p.categorie }))}
            canaux={canaux.map((c) => ({ id: c.id, nom: c.nom }))}
          />
        </Carte>
      </div>
    </>
  );
}
