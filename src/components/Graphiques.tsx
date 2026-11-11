"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Graphiques du tableau de bord (SVG, sans dépendance).
 * Couleurs catégorielles dans un ordre fixe (validées : daltonisme et contraste sur fond clair) ;
 * le texte reste en encre neutre ; grille en filet ; infobulle au survol.
 */
// Tokens du design system (globals.css) : adaptés au mode sombre, jamais de couleur en dur ici.
export const COULEURS_SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const SURFACE = "var(--card)";
const GRILLE = "var(--chart-grille)";
const TEXTE = "var(--muted-foreground)";
const REPERE = "var(--chart-repere)";

function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  // Largeur mesurée sur le conteneur (qui ne dépend pas du graphique) : pas de débordement sur téléphone.
  const [largeur, setLargeur] = useState(300);
  useEffect(() => {
    if (!ref.current) return;
    const o = new ResizeObserver(([e]) => setLargeur(Math.max(280, Math.floor(e.contentRect.width))));
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return { ref, largeur };
}

/** Graduations « rondes » de 0 à max. */
function graduations(max: number, n = 4): number[] {
  if (max <= 0) return [0];
  const brut = max / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) ?? brut;
  const res = [];
  for (let v = 0; v <= max + pas * 0.001; v += pas) res.push(Math.round(v * 100) / 100);
  if (res[res.length - 1] < max) res.push(res[res.length - 1] + pas);
  return res;
}

const nombre = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const compact = (n: number) => (n >= 10000 ? `${nombre(n / 1000)} k` : nombre(n));

function Legende({ series }: { series: { nom: string; couleur: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-sm text-foreground">
      {series.map((s) => (
        <span key={s.nom} className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: s.couleur }} />
          {s.nom}
        </span>
      ))}
    </div>
  );
}

function Infobulle({ x, y, largeur, children }: { x: number; y: number; largeur: number; children: React.ReactNode }) {
  const gauche = Math.min(Math.max(8, x + 12), largeur - 188);
  return (
    <div
      className="pointer-events-none absolute z-10 w-44 rounded-lg bg-card px-3 py-2 text-xs text-foreground shadow-lg ring-1 ring-border"
      style={{ left: gauche, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  );
}

/** Colonnes empilées : CA par jour, une couleur par canal. */
export function ColonnesEmpilees({
  jours,
  series,
  unite = "MAD",
}: {
  jours: { cle: string; libelle: string; valeurs: Record<string, number> }[];
  series: { id: string; nom: string }[];
  unite?: string;
}) {
  const { ref, largeur } = useLargeur();
  const [survol, setSurvol] = useState<number | null>(null);
  const H = 220;
  const m = { haut: 10, droite: 8, bas: 26, gauche: 44 };
  const totaux = jours.map((j) => series.reduce((t, s) => t + (j.valeurs[s.id] ?? 0), 0));
  const ticks = graduations(Math.max(...totaux, 0));
  const max = ticks[ticks.length - 1] || 1;
  const l = largeur - m.gauche - m.droite;
  const h = H - m.haut - m.bas;
  const bande = l / Math.max(1, jours.length);
  const larg = Math.min(24, bande * 0.6);
  const y = (v: number) => m.haut + h - (v / max) * h;
  const couleurs = series.map((s, i) => ({ ...s, couleur: COULEURS_SERIES[i % COULEURS_SERIES.length] }));
  const pasLibelle = Math.ceil(jours.length / Math.max(1, Math.floor(l / 44)));

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <Legende series={couleurs} />
      <svg width={largeur} height={H} className="block" role="img" aria-label="Chiffre d'affaires par jour et par canal" onMouseLeave={() => setSurvol(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.gauche} x2={largeur - m.droite} y1={y(t)} y2={y(t)} stroke={GRILLE} strokeWidth={1} />
            <text x={m.gauche - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={TEXTE}>
              {compact(t)}
            </text>
          </g>
        ))}
        {jours.map((j, i) => {
          const cx = m.gauche + bande * i + bande / 2;
          let cumul = 0;
          const segments = couleurs
            .map((s) => ({ s, v: j.valeurs[s.id] ?? 0 }))
            .filter((x) => x.v > 0)
            .map((x) => {
              const bas = cumul;
              cumul += x.v;
              return { ...x, bas, haut: cumul };
            });
          return (
            <g key={j.cle}>
              {segments.map((sg, k) => {
                const yh = y(sg.haut);
                const yb = y(sg.bas);
                // 2 px d'écart entre segments ; seul le segment du haut a ses coins arrondis.
                const hauteur = Math.max(0, yb - yh - (k > 0 ? 2 : 0));
                const dernier = k === segments.length - 1;
                const r = dernier ? Math.min(4, hauteur, larg / 2) : 0;
                const x0 = cx - larg / 2;
                const d = `M${x0},${yh + hauteur} V${yh + r} Q${x0},${yh} ${x0 + r},${yh} H${x0 + larg - r} Q${x0 + larg},${yh} ${x0 + larg},${yh + r} V${yh + hauteur} Z`;
                return <path key={sg.s.id} d={d} fill={sg.s.couleur} opacity={survol === null || survol === i ? 1 : 0.45} />;
              })}
              {i % pasLibelle === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={TEXTE}>
                  {j.libelle}
                </text>
              )}
              <rect x={m.gauche + bande * i} y={m.haut} width={bande} height={h} fill="transparent" onMouseEnter={() => setSurvol(i)} />
            </g>
          );
        })}
      </svg>
      {survol !== null && (
        <Infobulle x={m.gauche + bande * survol + bande / 2} y={y(totaux[survol])} largeur={largeur}>
          <div className="mb-1 font-semibold">{jours[survol].libelle}</div>
          {couleurs.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-sm" style={{ background: s.couleur }} />
                {s.nom}
              </span>
              <span className="tabular-nums">
                {nombre(jours[survol].valeurs[s.id] ?? 0)} {unite}
              </span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {nombre(totaux[survol])} {unite}
            </span>
          </div>
        </Infobulle>
      )}
    </div>
  );
}

/** Courbes : stock compté à chaque clôture, une série par site, minimum en repère. */
export function CourbesStock({
  series,
  minimum,
  unite,
}: {
  series: { nom: string; points: { t: number; libelle: string; valeur: number }[] }[];
  minimum: number | null;
  unite: string;
}) {
  const { ref, largeur } = useLargeur();
  const [survol, setSurvol] = useState<{ s: number; p: number } | null>(null);
  const H = 220;
  const m = { haut: 12, droite: 12, bas: 26, gauche: 36 };
  const tous = series.flatMap((s) => s.points);
  if (!tous.length) return <p className="py-6 text-center text-sm text-muted-foreground">Aucun comptage de clôture sur la période.</p>;
  const ticks = graduations(Math.max(...tous.map((p) => p.valeur), minimum ?? 0, 1));
  const max = ticks[ticks.length - 1];
  const t0 = Math.min(...tous.map((p) => p.t));
  const t1 = Math.max(...tous.map((p) => p.t));
  const l = largeur - m.gauche - m.droite;
  const h = H - m.haut - m.bas;
  const x = (t: number) => m.gauche + (t1 === t0 ? l / 2 : ((t - t0) / (t1 - t0)) * l);
  const y = (v: number) => m.haut + h - (v / max) * h;
  const couleurs = series.map((s, i) => ({ ...s, couleur: COULEURS_SERIES[i % COULEURS_SERIES.length] }));
  const jours = [...new Map(tous.map((p) => [p.libelle.split(" ")[0], p.t])).entries()];
  const pas = Math.ceil(jours.length / Math.max(1, Math.floor(l / 56)));

  const auSurvol = (e: React.MouseEvent<SVGRectElement>) => {
    const bx = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - bx.left + m.gauche;
    const my = e.clientY - bx.top + m.haut;
    let meilleur: { s: number; p: number; d: number } | null = null;
    couleurs.forEach((s, si) =>
      s.points.forEach((p, pi) => {
        const d = Math.abs(x(p.t) - mx) + Math.abs(y(p.valeur) - my) * 0.3;
        if (!meilleur || d < meilleur.d) meilleur = { s: si, p: pi, d };
      }),
    );
    setSurvol(meilleur ? { s: (meilleur as { s: number }).s, p: (meilleur as { p: number }).p } : null);
  };

  const pt = survol ? couleurs[survol.s].points[survol.p] : null;
  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
      <Legende series={couleurs} />
      <svg width={largeur} height={H} className="block" role="img" aria-label="Évolution du stock compté à chaque clôture">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.gauche} x2={largeur - m.droite} y1={y(t)} y2={y(t)} stroke={GRILLE} strokeWidth={1} />
            <text x={m.gauche - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={TEXTE}>
              {nombre(t)}
            </text>
          </g>
        ))}
        {minimum !== null && (
          <g>
            <line x1={m.gauche} x2={largeur - m.droite} y1={y(minimum)} y2={y(minimum)} stroke={REPERE} strokeWidth={1} />
            <text x={largeur - m.droite} y={y(minimum) - 4} textAnchor="end" fontSize={11} fill={TEXTE}>
              minimum {minimum}
            </text>
          </g>
        )}
        {jours.map(([j, t], i) =>
          i % pas === 0 ? (
            <text key={j} x={x(t)} y={H - 8} textAnchor="middle" fontSize={11} fill={TEXTE}>
              {j}
            </text>
          ) : null,
        )}
        {pt && <line x1={x(pt.t)} x2={x(pt.t)} y1={m.haut} y2={m.haut + h} stroke={REPERE} strokeWidth={1} />}
        {couleurs.map((s) => (
          <g key={s.nom}>
            <polyline
              points={s.points.map((p) => `${x(p.t)},${y(p.valeur)}`).join(" ")}
              fill="none"
              stroke={s.couleur}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.length <= 40 &&
              s.points.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.valeur)} r={4} fill={s.couleur} stroke={SURFACE} strokeWidth={2} />)}
          </g>
        ))}
        <rect x={m.gauche} y={m.haut} width={l} height={h} fill="transparent" onMouseMove={auSurvol} onMouseLeave={() => setSurvol(null)} />
      </svg>
      {pt && survol && (
        <Infobulle x={x(pt.t)} y={y(pt.valeur)} largeur={largeur}>
          <div className="font-semibold">{pt.libelle}</div>
          {couleurs.length > 1 && <div className="text-muted-foreground">{couleurs[survol.s].nom}</div>}
          <div className="tabular-nums">
            Stock compté : {nombre(pt.valeur)} {unite}
          </div>
        </Infobulle>
      )}
    </div>
  );
}
