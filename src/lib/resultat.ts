import { ErreurMetier } from "@/server/erreurs";

export type Resultat<T = unknown> = { ok: true; valeur?: T; message?: string } | { ok: false; erreur: string };

/**
 * Résumé d'erreur pour les journaux : jamais les paramètres d'une requête SQL (qui peuvent contenir
 * une empreinte de PIN ou des données personnelles), seulement le type et la cause.
 */
export function resumeErreur(e: unknown): string {
  if (!(e instanceof Error)) return String(e).slice(0, 300);
  const c = e.cause as { message?: string; code?: string } | undefined;
  const msg = e.message.split("\nparams:")[0].slice(0, 300);
  return `${e.name}: ${msg}${c?.message ? ` | cause ${c.code ?? ""} ${c.message}` : ""}`;
}

/** Exécute une action serveur et transforme les erreurs métier en message affichable. */
export async function executer<T>(fn: () => Promise<T>, message?: string): Promise<Resultat<T>> {
  try {
    const valeur = await fn();
    return { ok: true, valeur, message };
  } catch (e) {
    if (e instanceof ErreurMetier) return { ok: false, erreur: e.message };
    // Les redirections de Next.js passent par des exceptions : on les laisse remonter.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(resumeErreur(e));
    return { ok: false, erreur: "Une erreur technique est survenue. Réessayez." };
  }
}
