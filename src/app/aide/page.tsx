import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Marked, type Tokens } from "marked";
import source from "../../../docs/GUIDE_UTILISATEUR.md";

// Le guide est la source unique docs/GUIDE_UTILISATEUR.md, intégrée au build
// (règle Turbopack « raw » dans next.config.ts) et rendue en page statique.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Aide — Inventaire Browse",
  robots: { index: false, follow: false },
};

const ancre = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function chargerGuide() {
  // Le titre et l'adresse de l'application sont déjà portés par l'en-tête de la page.
  const corps = source.replace(/^# .*\n+(Application : .*\n+)?/, "");
  const sommaire: { id: string; titre: string }[] = [];
  const marked = new Marked({
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const id = ancre(text);
        if (depth === 2) sommaire.push({ id, titre: text });
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  const html = (marked.parse(corps, { async: false }) as string)
    .replaceAll("<table>", '<div class="defilement"><table>')
    .replaceAll("</table>", "</table></div>");
  return { html, sommaire };
}

export default function PageAide() {
  const { html, sommaire } = chargerGuide();
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-card ">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="size-8" />
            <span className="truncate text-sm font-bold">Inventaire Browse</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1 ml-auto rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-soft">
            <ArrowLeft aria-hidden className="size-4" /> Retour
          </Link>
        </div>
      </header>
      <main id="contenu" tabIndex={-1} className="focus:outline-none mx-auto max-w-3xl px-4 py-5">
        <h1 className="text-2xl font-bold">Guide d&apos;utilisation</h1>
        <nav aria-label="Sommaire" className="mt-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border">
          <p className="mb-2 text-sm font-semibold text-muted-foreground">Sommaire</p>
          <ol className="grid gap-1 text-sm">
            {sommaire.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-primary hover:underline">
                  {s.titre}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="guide mt-2" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    </>
  );
}
