/**
 * Parcours complet dans un navigateur (format téléphone) contre une application démarrée :
 * connexion PIN, ouverture du shift, comptage, réception de cakes en gâteaux, perte, ventes,
 * comptage de fin, clôture, puis écrans d'administration.
 *
 *   BASE=http://localhost:3000 PIN=123456 OUT=./captures node tests/e2e/parcours.cjs
 *
 * Prérequis : base neuve (créneaux d'exemple) et un créneau en cours à l'heure du test.
 */
const { chromium } = require("playwright");
const B = process.env.BASE || "http://localhost:3100";
const OUT = process.env.OUT || require("node:os").tmpdir();
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("dialog", (d) => d.accept()); // confirmation de clôture
  page.on("pageerror", (e) => erreurs.push("pageerror " + e.message));
  page.on("console", (m) => m.type() === "error" && erreurs.push("console " + m.text()));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false, caret: "initial" });

  await page.goto(B + "/");
  await page.getByRole("link", { name: "Browse 2 Mars" }).click();
  // La direction n'est pas listée sur les sites : elle saisit son nom.
  await page.getByRole("button", { name: "Compte direction" }).click();
  await page.getByLabel("Nom du compte direction").fill("Direction");
  await shot("01-pin");
  await page.getByRole("button", { name: "0" }).click(); // mauvais code
  for (const d of "000") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByText("Code incorrect").waitFor();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Effacer" }).click();
  for (const d of (process.env.PIN || "123456")) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByRole("heading", { name: "Bonjour Direction" }).waitFor();
  await shot("02-accueil");

  await page.getByRole("button", { name: "Créer et ouvrir ce shift" }).click();
  await page.waitForURL(/\/shift\/[0-9a-f-]+$/);
  const shiftUrl = page.url();
  await shot("03-hub");

  await page.getByRole("link", { name: /Comptage d'ouverture/ }).click();
  await page.waitForURL(/ouverture/);
  // L'adresse change dès le clic (écran de chargement) : attendre la grille avant de compter les champs.
  await page.getByText(/\d+ \/ \d+ comptés/).waitFor();
  const ins = page.getByLabel(/^Quantité /);
  const n = await ins.count();
  console.log("produits à compter à l'ouverture:", n);
  for (let i = 0; i < n; i++) await ins.nth(i).fill("10");
  await page.getByText("Terminé", { exact: true }).waitFor({ timeout: 60000 });
  await shot("04-ouverture");
  await page.reload();
  console.log("après rechargement, valeur 1er produit:", await page.getByLabel(/^Quantité /).first().inputValue());
  await page.getByText(`${n} / ${n} comptés`).waitFor();

  await page.goto(shiftUrl + "/entrees");
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Plus Mango Can" }).click();
  await page.getByRole("button", { name: "Cakes & Cheesecakes" }).click();
  const carteMatilda = page.locator("div.overflow-hidden", { hasText: "Matilda Cake" }).first();
  await carteMatilda.getByRole("button", { name: "Gâteaux" }).click();
  await page.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await page.getByRole("button", { name: "Plus Matilda Cake" }).click();
  await shot("05-entrees");
  await page.getByRole("button", { name: /Enregistrer la réception/ }).click();
  await page.getByText("Réception enregistrée").waitFor();

  await page.goto(shiftUrl + "/pertes");
  await page.getByRole("button", { name: /Mango Can/ }).first().click();
  await page.getByRole("button", { name: "Endommagé" }).click();
  await shot("06-perte");
  await page.getByRole("button", { name: "Déclarer la perte" }).click();
  await page.getByText(/déclaré\(s\) en perte/).waitFor();

  await page.goto(shiftUrl + "/ventes");
  // 9 Mango Can vendus : 6 sur place + 3 via Glovo (SKU et prix différents, même stock).
  await page.getByLabel("Quantité Mango Can").fill("6");
  await page.getByLabel("Quantité Crêpe Lotus").fill("4");
  await page.getByText("Tout est enregistré").waitFor({ timeout: 60000 });
  await page.getByRole("tab", { name: /Glovo/ }).click();
  await page.waitForURL(/canal=glovo/);
  await page.getByLabel("Quantité Mango Can").fill("3");
  await page.getByText("Tout est enregistré").waitFor({ timeout: 60000 });
  await shot("06b-ventes-glovo");

  await page.goto(shiftUrl + "/comptage");
  const c = page.getByLabel(/^Quantité /);
  const m = await c.count();
  for (let i = 0; i < m; i++) await c.nth(i).fill("10");
  await page.getByLabel("Quantité Mango Can").fill("5");
  await page.getByLabel("Quantité Matilda Cake").fill("26");
  await page.getByText("Terminé", { exact: true }).waitFor({ timeout: 60000 });
  await shot("07-comptage");

  await page.goto(shiftUrl + "/cloture");
  await page.screenshot({ path: `${OUT}/08-recap.png`, fullPage: true, caret: "initial" });
  await page.getByRole("button", { name: "Clôturer et signer le shift" }).click();
  await page.getByText(/Clôturé le/).waitFor();
  const ecartMango = await page.locator("tr", { hasText: "Mango Can" }).locator("td").nth(1).innerText();
  if (ecartMango.trim() !== "-1") throw new Error("écart Mango attendu -1, obtenu " + ecartMango);
  const entreesMatilda = await page.locator("tr", { hasText: "Matilda Cake" }).locator("td").nth(5).innerText();
  if (entreesMatilda.trim() !== "16") throw new Error("entrées Matilda attendues 16, obtenu " + entreesMatilda);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(B + "/admin");
  await page.screenshot({ path: `${OUT}/09-remontees.png`, fullPage: true, caret: "initial" });
  await page.goto(B + "/admin/planning");
  await page.screenshot({ path: `${OUT}/10-planning.png`, fullPage: true, caret: "initial" });
  await page.getByRole("button", { name: "Planifier" }).first().click();
  await page.getByLabel("Responsable d'inventaire").selectOption({ label: "Direction" });
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForTimeout(1500);
  await page.goto(B + "/admin/planning?vue=mois");
  await page.screenshot({ path: `${OUT}/11-planning-mois.png`, fullPage: true, caret: "initial" });
  await page.goto(B + "/admin/sites");
  await page.getByRole("link", { name: /Browse Sweets 2 Mars/ }).click();
  await page.getByLabel("Nom du créneau").first().fill("Matin semaine");
  await page.locator('input[type="time"]').nth(5).fill("03:00"); // nuit finit à 03:00
  await page.screenshot({ path: `${OUT}/12-creneaux.png`, fullPage: true, caret: "initial" });
  await page.goto(B + "/admin/catalogue");
  await page.screenshot({ path: `${OUT}/13-catalogue.png`, caret: "initial" });
  await page.getByRole("link", { name: /Mango Can/ }).click();
  await page.setInputFiles('input[type="file"]', { name: "mango.png", mimeType: "image/png", buffer: require("fs").readFileSync(require("node:path").join(__dirname, "../../public/icon-512.png")) });
  await page.getByText("Photo enregistrée").waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${OUT}/14-produit.png`, fullPage: true, caret: "initial" });

  if (erreurs.length) throw new Error("Erreurs navigateur : " + erreurs.join("\n"));
  console.log("Parcours OK");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
