import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventaire Browse",
    short_name: "Inventaire",
    description: "Inventaire inter-shifts des points de vente Browse",
    start_url: "/",
    display: "standalone",
    // Valeurs des tokens --background et --primary (le manifeste exige des couleurs littérales).
    background_color: "#fcfcf4",
    theme_color: "#753b36",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
