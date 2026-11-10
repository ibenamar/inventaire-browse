/**
 * Parcours du laboratoire dans un navigateur (format téléphone) : shift labo avec comptage des
 * ingrédients au poids, production en gâteaux entiers, réception fournisseur, bon de livraison
 * expédié, clôture (consommation d'ingrédients), puis réception du bon au point de vente avec un
 * écart, et rapport du laboratoire.
 *
 *   BASE=http://localhost:3000 OUT=./captures node tests/e2e/laboratoire.cjs
 *
 * Prérequis : base neuve où le laboratoire est actif avec un créneau en cours, Browse 2 Mars a un
 * créneau en cours et un manager « Karim » (PIN 456789), et des ingrédients existent dont « Farine T55 » (kg).
 */
const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3200";
const OUT = process.env.OUT || require("node:os").tmpdir();

async function connecter(browser, site, erreurs, nom = "Direction", pin = process.env.PIN || "123456") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept()); // confirmations (expédition, clôture)
  page.on("pageerror", (e) => erreurs.push("pageerror " + e.message));
  page.on("console", (m) => m.type() === "error" && erreurs.push("console " + m.text()));
  await page.goto(B + "/");
  await page.getByRole("link", { name: site }).click();
  if (nom === "Direction") {
    // La direction n'est pas listée sur les sites : elle saisit son nom.
    await page.getByRole("button", { name: "Compte direction" }).click();
    await page.getByLabel("Nom du compte direction").fill(nom);
  } else await page.getByRole("button", { name: nom }).click();
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByRole("heading", { name: `Bonjour ${nom}` }).waitFor();
  return page;
}

async function toutCompter(page, valeur) {
  const ins = page.getByLabel(/^Quantité /);
  const n = await ins.count();
  for (let i = 0; i < n; i++) await ins.nth(i).fill(valeur);
  return n;
}

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const shot = (page, n, full = false) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full, caret: "initial" });

  // --- Laboratoire -----------------------------------------------------------
  const labo = await connecter(browser, "Laboratoire", erreurs);
  await labo.getByRole("button", { name: "Créer et ouvrir ce shift" }).click();
  await labo.waitForURL(/\/shift\/[0-9a-f-]+$/);
  const shiftLabo = labo.url();
  await shot(labo, "L01-etapes-labo", true);

  await labo.getByRole("link", { name: /Comptage d'ouverture/ }).click();
  await labo.waitForURL(/ouverture/);
  const n = await toutCompter(labo, "0");
  await labo.getByLabel("Quantité Farine T55").fill("10,5");
  await labo.getByText("Terminé ✓").waitFor({ timeout: 60000 });
  console.log("produits et ingrédients comptés à l'ouverture du labo :", n);
  await labo.reload();
  // La capture masque le curseur des champs : attendre l'hydratation pour ne pas la perturber.
  await labo.waitForLoadState("networkidle");
  const farine = await labo.getByLabel("Quantité Farine T55").inputValue();
  if (farine !== "10,5") throw new Error("farine à l'ouverture attendue 10,5, obtenu " + farine);
  await shot(labo, "L02-ouverture-labo");

  await labo.goto(shiftLabo + "/production");
  await labo.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await labo.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await labo.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await labo.getByText("= 24 parts").waitFor();
  await shot(labo, "L03-production");
  await labo.getByRole("button", { name: /Enregistrer la production/ }).click();
  await labo.getByText("Production enregistrée").waitFor();

  await labo.goto(shiftLabo + "/entrees");
  await labo.getByLabel("Quantité Farine T55").fill("25");
  await labo.getByRole("button", { name: /Enregistrer la réception/ }).click();
  await labo.getByText("Réception enregistrée").waitFor();

  await labo.goto(shiftLabo + "/livraisons");
  await labo.getByLabel("Site destinataire").selectOption({ label: "Livrer à : Browse 2 Mars" });
  await labo.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await labo.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await labo.getByRole("button", { name: "Plus Lemon Cake" }).click();
  await shot(labo, "L04-bon");
  // Lemon Cake n'a pas été produit : l'expédition est refusée avec la marche à suivre.
  await labo.getByRole("button", { name: /^Expédier/ }).click();
  await labo.getByText(/Stock insuffisant — Lemon Cake/).waitFor();
  await labo.getByRole("button", { name: "Moins Lemon Cake" }).click();
  await labo.getByRole("button", { name: /^Expédier/ }).click();
  await labo.getByText(/Bon expédié/).waitFor();
  await labo.getByText(/Bon n° \d+ → Browse 2 Mars/).waitFor();
  await shot(labo, "L05-bon-expedie", true);

  await labo.goto(shiftLabo + "/comptage");
  await toutCompter(labo, "0");
  await labo.getByLabel("Quantité Farine T55").fill("30,25");
  await labo.getByLabel("Quantité Matilda Cake").fill("1");
  await labo.getByText("Terminé ✓").waitFor({ timeout: 60000 });
  await shot(labo, "L06-comptage-labo");

  await labo.goto(shiftLabo + "/cloture");
  const conso = await labo.locator("tr", { hasText: "Farine T55" }).locator("td").nth(1).innerText();
  if (conso.trim() !== "conso 5,25") throw new Error("consommation de farine attendue « conso 5,25 », obtenu " + conso);
  const ecartMatilda = await labo.locator("tr", { hasText: "Matilda Cake" }).locator("td").nth(1).innerText();
  if (ecartMatilda.trim() !== "0") throw new Error("écart Matilda attendu 0, obtenu " + ecartMatilda);
  await shot(labo, "L07-recap-labo", true);
  await labo.getByRole("button", { name: "Clôturer et signer le shift" }).click();
  await labo.getByText(/Clôturé le/).waitFor();

  // --- Point de vente ----------------------------------------------------------
  // Une autre personne : la Direction est déjà planifiée sur le shift du labo qui chevauche celui-ci.
  const pdv = await connecter(browser, "Browse 2 Mars", erreurs, "Karim", "456789");
  await pdv.getByRole("button", { name: "Créer et ouvrir ce shift" }).click();
  await pdv.waitForURL(/\/shift\/[0-9a-f-]+$/);
  const shiftPdv = pdv.url();
  await pdv.getByText("1 livraison à réceptionner").waitFor();
  await shot(pdv, "P01-etapes-pdv", true);
  await pdv.getByRole("link", { name: /Réceptions/ }).click();
  await pdv.getByText(/Expédié : 2 gâteaux \(16 parts\)/).waitFor();
  await pdv.getByLabel("Quantité reçue Matilda Cake").fill("15");
  await pdv.getByPlaceholder(/Expliquer l'écart/).fill("Une part écrasée");
  await shot(pdv, "P02-reception-bon");
  await pdv.getByRole("button", { name: /Réceptionner avec 1 écart/ }).click();
  await pdv.getByText(/réceptionné · 1 produit\(s\) en écart/).waitFor();
  await pdv.getByText("Livraisons à réceptionner").waitFor({ state: "detached" }).catch(() => undefined);
  await shot(pdv, "P03-reception-ok", true);
  const ligne = pdv.locator("li", { hasText: "Matilda Cake" }).first();
  if (!(await ligne.innerText()).includes("15")) throw new Error("entrée Matilda de 15 parts attendue");

  // --- Rapport ---------------------------------------------------------------------
  // Le manager du point de vente n'a pas accès au laboratoire ; la direction, si.
  await pdv.goto(B + "/admin/laboratoire");
  await pdv.getByText("Aucun laboratoire accessible").waitFor();
  await labo.setViewportSize({ width: 1280, height: 900 });
  await labo.goto(B + "/admin/laboratoire");
  await labo.getByRole("heading", { name: "Écarts de livraison" }).waitFor();
  await labo.locator("td", { hasText: "Farine T55" }).waitFor();
  await shot(labo, "R01-rapport-labo", true);
  await labo.goto(B + "/admin/catalogue/nouveau");
  await labo.getByRole("button", { name: "Ingrédient du laboratoire" }).click();
  await shot(labo, "R02-nouvel-ingredient");
  void shiftPdv;

  if (erreurs.length) throw new Error("Erreurs navigateur : " + erreurs.join("\n"));
  console.log("Parcours laboratoire OK");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
