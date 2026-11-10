import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (base embarquée de développement) ne doit pas être empaquetée.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Le guide d'utilisation (docs/*.md) est importé comme texte et intégré au bundle :
  // aucune lecture de fichier à l'exécution sur Cloudflare.
  turbopack: {
    rules: { "*.md": { type: "raw" } },
  },
  // En-têtes de sécurité : pas d'affichage dans un cadre (clickjacking), HTTPS imposé, pas de fuite d'URL.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default config;
