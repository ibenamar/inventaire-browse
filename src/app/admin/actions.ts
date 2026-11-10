"use server";

import { revalidatePath } from "next/cache";
import { MODES_OUVERTURE, ROLES, STATUTS_SITE, UNITES } from "@/db/schema";
import type { Journee } from "@/domain/temps";
import { journeeLocale } from "@/domain/temps";
import { getDb } from "@/lib/db";
import { executer, type Resultat } from "@/lib/resultat";
import { ErreurMetier, exiger } from "@/server/erreurs";
import {
  ajouterArticle,
  articlesARattacher,
  associerArticle,
  ignorerArticle,
  ignorerCategorie,
  retirerArticle,
  type ArticleARattacher,
} from "@/server/services/caisse";
import { ajouterCout, enregistrerPhoto, modifierProduit } from "@/server/services/catalogue";
import { CORRESPONDANCES_LOYVERSE } from "@/server/correspondances-loyverse";
import { importerArticles, lireArticlesLoyverse, lireExportCsv, type RapportImport } from "@/server/services/loyverse";
import { affecter, dupliquerPeriode, retirerAffectation } from "@/server/services/planning";
import { enregistrerCreneaux, modifierMagasinSite, modifierSite, type SaisieCreneau } from "@/server/services/sites";
import { aAccesAuSite, creerUtilisateur, modifierUtilisateur } from "@/server/services/utilisateurs";
import { ajouterJours } from "@/domain/temps";
import { exigerDirection, exigerEncadrant } from "./acces";

async function exigerSitePilotable(siteId: string) {
  const s = await exigerEncadrant();
  if (!(await aAccesAuSite(await getDb(), s.acteur.id, siteId))) throw new ErreurMetier("Vous ne gérez pas ce site");
  return s;
}

// --- Planning ---------------------------------------------------------------

export async function actionAffecter(v: {
  siteId: string;
  journee: Journee;
  creneauId: string;
  responsableId: string;
  equipierId: string | null;
}): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerSitePilotable(v.siteId);
    await affecter(
      await getDb(),
      { siteId: v.siteId, journee: v.journee, creneauId: v.creneauId, responsableId: v.responsableId, equipierIds: v.equipierId ? [v.equipierId] : [] },
      acteur,
    );
    revalidatePath("/admin/planning");
  });
}

export async function actionRetirer(siteId: string, shiftId: string): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerSitePilotable(siteId);
    await retirerAffectation(await getDb(), shiftId, acteur);
    revalidatePath("/admin/planning");
  });
}

export async function actionDupliquerSemaine(siteId: string, lundi: Journee, semaines: number): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerSitePilotable(siteId);
    exiger(semaines >= 1 && semaines <= 8, "Entre 1 et 8 semaines");
    const db = await getDb();
    let copies = 0;
    let ignores = 0;
    for (let k = 1; k <= semaines; k++) {
      const r = await dupliquerPeriode(db, siteId, { du: lundi, au: ajouterJours(lundi, 6) }, ajouterJours(lundi, 7 * k), acteur);
      copies += r.copies;
      ignores += r.ignores;
    }
    revalidatePath("/admin/planning");
    return `${copies} shift(s) copiés${ignores ? `, ${ignores} ignoré(s) (déjà planifiés ou indisponibles)` : ""}.`;
  });
}

// --- Sites et créneaux (direction) -------------------------------------------

export async function actionModifierSite(id: string, _e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const modeOuverture = String(form.get("modeOuverture")) as (typeof MODES_OUVERTURE)[number];
    const statut = String(form.get("statut")) as (typeof STATUTS_SITE)[number];
    await modifierSite(await getDb(), id, { modeOuverture, statut }, acteur);
    revalidatePath("/admin/sites");
  }, "Site enregistré");
}

export async function actionEnregistrerCreneaux(siteId: string, creneaux: SaisieCreneau[]): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await enregistrerCreneaux(await getDb(), siteId, creneaux, acteur);
    revalidatePath("/admin/sites");
  }, "Créneaux enregistrés");
}

// --- Utilisateurs (direction) ------------------------------------------------

function lireUtilisateur(form: FormData) {
  return {
    nom: String(form.get("nom") ?? ""),
    role: String(form.get("role")) as (typeof ROLES)[number],
    actif: form.get("actif") === "on",
    siteIds: form.getAll("siteIds").map(String),
    pin: String(form.get("pin") ?? "") || undefined,
  };
}

export async function actionCreerUtilisateur(_e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await creerUtilisateur(await getDb(), lireUtilisateur(form), acteur);
    revalidatePath("/admin/utilisateurs");
  }, "Utilisateur créé");
}

export async function actionModifierUtilisateur(id: string, _e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const v = lireUtilisateur(form);
    exiger(!(id === acteur.id && (!v.actif || v.role !== "direction")), "Vous ne pouvez pas retirer vos propres droits de direction");
    await modifierUtilisateur(await getDb(), id, v, acteur);
    revalidatePath("/admin/utilisateurs");
  }, "Utilisateur enregistré");
}

// --- Catalogue (direction) ---------------------------------------------------

const nombreOuNull = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim().replace(",", ".");
  return t === "" ? null : Number(t);
};

export async function actionModifierProduit(id: string, _e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const unite = String(form.get("unite")) as (typeof UNITES)[number];
    await modifierProduit(
      await getDb(),
      id,
      {
        nom: String(form.get("nom") ?? ""),
        unite,
        format: String(form.get("format") ?? "") || null,
        partsParGateau: unite === "part" ? nombreOuNull(form.get("partsParGateau")) : null,
        prixVente: nombreOuNull(form.get("prixVente")),
        suiviStock: form.get("suiviStock") === "on",
        actif: form.get("actif") === "on",
      },
      acteur,
    );
    revalidatePath("/admin/catalogue");
  }, "Produit enregistré");
}

export async function actionAjouterCout(produitId: string, _e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const cout = nombreOuNull(form.get("cout"));
    exiger(cout !== null, "Saisir un coût");
    const date = String(form.get("dateEffet") || journeeLocale(new Date()));
    await ajouterCout(await getDb(), produitId, cout, date, acteur);
    revalidatePath(`/admin/catalogue/${produitId}`);
  }, "Coût enregistré");
}

export async function actionPhoto(produitId: string, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const f = form.get("photo");
    exiger(f instanceof Blob && f.size > 0, "Aucune photo reçue");
    await enregistrerPhoto(await getDb(), produitId, new Uint8Array(await f.arrayBuffer()), f.type, acteur);
    revalidatePath("/admin/catalogue");
  }, "Photo enregistrée");
}

// --- Loyverse (direction) ----------------------------------------------------

export async function actionImporterLoyverse(): Promise<Resultat<RapportImport>> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const jeton = process.env.LOYVERSE_TOKEN;
    exiger(jeton, "Jeton Loyverse non configuré (variable LOYVERSE_TOKEN)");
    const articles = await lireArticlesLoyverse(jeton);
    const r = await importerArticles(await getDb(), articles, acteur, CORRESPONDANCES_LOYVERSE);
    revalidatePath("/admin/catalogue");
    return r;
  });
}

// --- Articles de caisse (direction) -----------------------------------------

export async function actionAjouterArticle(produitId: string, _e: unknown, form: FormData): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await ajouterArticle(
      await getDb(),
      {
        produitId,
        canalId: String(form.get("canalId") ?? ""),
        nomCaisse: String(form.get("nomCaisse") ?? ""),
        sku: String(form.get("sku") ?? "") || null,
        prixVente: nombreOuNull(form.get("prixVente")),
        facteur: Number(form.get("facteur") || 1),
      },
      acteur,
    );
    revalidatePath(`/admin/catalogue/${produitId}`);
  }, "Article ajouté");
}

export async function actionAssocierArticle(
  articleId: string,
  produitId: string | null,
  canalId: string,
  facteur: number,
): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    exiger(canalId, "Choisir le canal");
    await associerArticle(await getDb(), articleId, { produitId, canalId, facteur }, acteur);
    revalidatePath("/admin/loyverse");
    revalidatePath("/admin/catalogue", "layout");
  });
}

export async function actionRetirerArticle(articleId: string): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await retirerArticle(await getDb(), articleId, acteur);
    revalidatePath("/admin/catalogue", "layout");
    revalidatePath("/admin/loyverse");
  });
}

export async function actionIgnorerArticle(articleId: string): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await ignorerArticle(await getDb(), articleId, acteur);
    revalidatePath("/admin/loyverse");
  });
}

/** Import depuis l'export CSV du Back Office Loyverse (Articles › Exporter), en attendant le jeton API. */
export async function actionImporterCsvLoyverse(form: FormData): Promise<Resultat<RapportImport>> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    const f = form.get("fichier");
    exiger(f instanceof Blob && f.size > 0, "Choisir le fichier exporté depuis Loyverse");
    exiger(f.size < 5_000_000, "Fichier trop volumineux");
    const articles = lireExportCsv(await f.text());
    const r = await importerArticles(await getDb(), articles, acteur, CORRESPONDANCES_LOYVERSE);
    revalidatePath("/admin/loyverse");
    revalidatePath("/admin/catalogue", "layout");
    return r;
  });
}

export async function actionMagasinSite(siteId: string, magasin: string): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await modifierMagasinSite(await getDb(), siteId, magasin.trim() || null, acteur);
    revalidatePath("/admin/sites");
    revalidatePath("/admin/loyverse");
  });
}

export async function actionIgnorerCategorie(categorie: string | null): Promise<Resultat> {
  return executer(async () => {
    const { acteur } = await exigerDirection();
    await ignorerCategorie(await getDb(), categorie, acteur);
    revalidatePath("/admin/loyverse");
  });
}

/** Articles à rattacher d'une catégorie, chargés à l'ouverture de la catégorie (page Loyverse légère). */
export async function actionArticlesCategorie(categorie: string | null): Promise<Resultat<ArticleARattacher[]>> {
  return executer(async () => {
    await exigerDirection();
    return articlesARattacher(await getDb(), { categorie });
  });
}

export async function actionChercherArticles(recherche: string): Promise<Resultat<ArticleARattacher[]>> {
  return executer(async () => {
    await exigerDirection();
    const r = recherche.trim();
    exiger(r.length >= 2, "Saisir au moins 2 caractères");
    return articlesARattacher(await getDb(), { recherche: r }, 50);
  });
}
