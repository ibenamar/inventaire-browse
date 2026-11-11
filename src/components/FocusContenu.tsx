"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Après un changement d'écran, le focus va au contenu principal (#contenu) : le lecteur d'écran
 * annonce le nouvel écran et la navigation au clavier repart du bon endroit. Pas au premier affichage.
 */
export function FocusContenu() {
  const chemin = usePathname();
  // Chemin déjà traité : ni le premier affichage, ni la double exécution des effets en développement
  // ne déplacent le focus.
  const precedent = useRef(chemin);
  useEffect(() => {
    if (precedent.current === chemin) return;
    precedent.current = chemin;
    document.getElementById("contenu")?.focus({ preventScroll: true });
  }, [chemin]);
  return null;
}
