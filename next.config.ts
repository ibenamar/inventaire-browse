import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (base embarquée de développement) ne doit pas être empaquetée.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Le guide d'utilisation (docs/*.md) est importé comme texte et intégré au bundle :
  // aucune lecture de fichier à l'exécution sur Cloudflare.
  turbopack: {
    rules: { "*.md": { type: "raw" } },
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default config;
