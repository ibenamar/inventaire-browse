import type { Role } from "@/db/schema";

/** Utilisateur à l'origine d'une action. */
export interface Acteur {
  id: string;
  nom: string;
  role: Role;
}

export const estEncadrant = (a: Pick<Acteur, "role">) => a.role === "manager" || a.role === "direction";
