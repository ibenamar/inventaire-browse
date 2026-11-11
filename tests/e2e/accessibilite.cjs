/**
 * Contrôle d'accessibilité et de mise en page des écrans clés, en clair et en sombre, à
 * 375 / 768 / 1024 / 1440 px : règles WCAG 2.1 A et AA d'axe-core (contrastes compris) et
 * absence de défilement horizontal. Une capture par écran, largeur et thème.
 *
 *   BASE=http://localhost:3200 OUT=./captures node tests/e2e/accessibilite.cjs
 *
 * Prérequis : base de démonstration du parcours laboratoire (tests/e2e/laboratoire.cjs) déjà joué,
 * compte Direction (PIN 123456).
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const B = process.env.BASE || "http://localhost:3200";
const OUT = process.env.OUT || require("node:os").tmpdir();
const AXE = fs.readFileSync(path.join(__dirname, "../../node_modules/axe-core/axe.min.js"), "utf8");
const LARGEURS = (process.env.LARGEURS || "375,768,1024,1440").split(",").map(Number);
const THEMES = (process.env.THEMES || "light,dark").split(",");

async function connecter(page) {
  await page.goto(B + "/login");
  await page.getByRole("link", { name: "Browse 2 Mars" }).click();
  await page.getByRole("button", { name: "Compte direction" }).click();
  await page.getByLabel("Nom du compte direction").fill("Direction");
  for (const d of "123456") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByRole("heading", { name: "Bonjour Direction" }).waitFor();
}

(async () => {
  const browser = await chromium.launch();
  const bilan = [];
  let shift = null;
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await connecter(page);
    shift ??= await page.getByRole("link", { name: "Continuer la saisie" }).getAttribute("href");
    const ecrans = [
      ["accueil", "/"],
      ["shift", shift],
      ["comptage", shift + "/comptage"],
      ["receptions", shift + "/entrees"],
      ["pertes", shift + "/pertes"],
      ["recap", shift + "/cloture"],
      ["tableau", "/admin"],
      ["planning", "/admin/planning"],
      ["labo", "/admin/laboratoire"],
      ["catalogue", "/admin/catalogue"],
      ["aide", "/aide"],
    ];
    for (const w of LARGEURS) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const [nom, url] of ecrans) {
        await page.goto(B + url, { waitUntil: "networkidle" });
        await page.addScriptTag({ content: AXE });
        const r = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
          return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, exemple: v.nodes[0]?.target?.join(" ") ?? "", resume: v.nodes[0]?.failureSummary?.split("\n")[1] ?? "" }));
        });
        const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        for (const v of r) bilan.push(`${theme} ${w}px ${nom} : ${v.id} (${v.impact}, ${v.n}) ${v.exemple} — ${v.resume}`);
        if (debord > 1) bilan.push(`${theme} ${w}px ${nom} : défilement horizontal de ${debord}px`);
        await page.screenshot({ path: `${OUT}/${theme}-${w}-${nom}.png`, fullPage: false, caret: "initial" });
      }
    }
    await ctx.close();
  }
  await browser.close();
  if (bilan.length) {
    console.log(bilan.join("\n"));
    console.log(`\n${bilan.length} problème(s)`);
    process.exit(1);
  }
  console.log("Accessibilité OK : aucune violation WCAG 2.1 AA, aucun défilement horizontal");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
