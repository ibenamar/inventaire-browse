import { Carte, Message, Titre } from "@/components/ui";
import { getDb } from "@/lib/db";
import { articlesIgnores, categoriesARattacher, compterArticlesRattaches, listerCanaux, magasinsConnus } from "@/server/services/caisse";
import { listerSites } from "@/server/services/sites";
import { dernieresSynchros } from "@/server/services/ventes-loyverse";
import { formatLocal } from "@/domain/temps";
import { formatMad } from "@/components/ui";
import Link from "next/link";
import { listerProduits } from "@/server/services/catalogue";
import { exigerDirection } from "../acces";
import { ArticlesIgnores } from "./ArticlesIgnores";
import { ArticlesNonAssocies, ImportLoyverse } from "./ImportLoyverse";
import { MagasinsSites } from "./MagasinsSites";

export default async function Loyverse() {
  await exigerDirection();
  const db = await getDb();
  const ignores = await articlesIgnores(db);
  const configure = Boolean(process.env.LOYVERSE_TOKEN);
  const [categories, canaux, produits, rattaches, magasins, sites] = await Promise.all([
    categoriesARattacher(db),
    listerCanaux(db),
    listerProduits(db, { actifsSeulement: true }),
    compterArticlesRattaches(db),
    magasinsConnus(db),
    listerSites(db),
  ]);
  const synchros = await dernieresSynchros(db, 15);
  // Les articles retirés de la vente dans tous les magasins ne sont pas proposés (filtre côté base).
  const total = categories.reduce((t, c) => t + c.n, 0);
  const parCanal = canaux.map((c) => ({ ...c, n: rattaches.get(c.id) ?? 0 }));
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
          <h2 className="mb-1 text-lg font-semibold">Articles à rattacher ({total})</h2>
          <p className="mb-3 text-sm text-stone-600">
            Articles Loyverse non reconnus automatiquement. Indiquez le produit qu&apos;ils font sortir du stock et leur canal. Tant qu&apos;un article
            n&apos;est pas rattaché, ses ventes ne seront pas importées.
          </p>
          <ArticlesNonAssocies
            categories={categories}
            produits={produits.map((p) => ({ id: p.id, nom: p.nom, categorie: p.categorie }))}
            canaux={canaux.map((c) => ({ id: c.id, nom: c.nom }))}
          />
        </Carte>
        <Carte>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">Articles ignorés ({ignores.length})</summary>
            <p className="my-2 text-sm text-stone-600">Hors inventaire : leurs ventes ne sont pas importées. Rétablir un article ignoré par erreur.</p>
            <ArticlesIgnores articles={ignores} />
          </details>
        </Carte>
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Derniers imports de ventes</h2>
          <p className="mb-3 text-sm text-stone-600">
            Les ventes de chaque shift sont importées des tickets Loyverse pendant le shift et à sa clôture.
          </p>
          {synchros.length === 0 ? (
            <p className="text-sm text-stone-500">Aucun import pour le moment.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {synchros.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="w-32 shrink-0 text-stone-500">{formatLocal(x.horodatage, "dd/MM HH:mm")}</span>
                  <Link href={`/shift/${x.shiftId}/cloture`} className="font-semibold text-marque-700 underline">
                    {x.site} · {x.creneau} du {x.journee.split("-").reverse().join("/")}
                  </Link>
                  {x.statut === "ok" ? (
                    <span className="text-stone-600">
                      {x.nbRecus} ticket(s), {formatMad(x.montant)}
                      {Array.isArray(x.nonReconnus) && x.nonReconnus.length > 0 && ` · ${x.nonReconnus.length} article(s) non rattaché(s)`}
                    </span>
                  ) : (
                    <span className="text-red-700">Échec : {x.erreur}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>
    </>
  );
}
