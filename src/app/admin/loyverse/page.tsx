import { Carte, Message, Titre } from "@/components/ui";
import { exigerDirection } from "../acces";
import { ImportLoyverse } from "./ImportLoyverse";

export default async function Loyverse() {
  await exigerDirection();
  const configure = Boolean(process.env.LOYVERSE_TOKEN);
  return (
    <>
      <Titre sousTitre="Loyverse reste la référence des articles et des prix de vente.">Loyverse</Titre>
      <div className="grid gap-4">
        {!configure && (
          <Message ton="alerte">
            Le jeton d&apos;accès Loyverse n&apos;est pas encore configuré. Dans le Back Office Loyverse : Intégrations › Jetons d&apos;accès › Ajouter
            un jeton, puis le renseigner dans la variable d&apos;environnement LOYVERSE_TOKEN de l&apos;application (voir README).
          </Message>
        )}
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Articles et prix</h2>
          <p className="mb-3 text-sm text-stone-600">
            Associe chaque produit du catalogue à son article Loyverse (par SKU, sinon par nom identique) et reprend le prix de vente. Relancez
            l&apos;import après un changement de prix dans Loyverse.
          </p>
          <ImportLoyverse actif={configure} />
        </Carte>
        <Carte>
          <h2 className="mb-1 text-lg font-semibold">Ventes</h2>
          <p className="text-sm text-stone-600">
            L&apos;import automatique des ventes de chaque shift (reçus Loyverse entre l&apos;ouverture et la clôture) arrive en phase 2.
          </p>
        </Carte>
      </div>
    </>
  );
}
