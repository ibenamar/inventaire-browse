import { ErreurMetier } from "@/server/erreurs";

export type Resultat<T = unknown> = { ok: true; valeur?: T; message?: string } | { ok: false; erreur: string };

/** Exécute une action serveur et transforme les erreurs métier en message affichable. */
export async function executer<T>(fn: () => Promise<T>, message?: string): Promise<Resultat<T>> {
  try {
    const valeur = await fn();
    return { ok: true, valeur, message };
  } catch (e) {
    if (e instanceof ErreurMetier) return { ok: false, erreur: e.message };
    // Les redirections de Next.js passent par des exceptions : on les laisse remonter.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, erreur: "Une erreur technique est survenue. Réessayez." };
  }
}
