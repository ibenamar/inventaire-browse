/** Erreur métier affichable telle quelle à l'utilisateur. */
export class ErreurMetier extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurMetier";
  }
}

export function exiger(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ErreurMetier(message);
}
