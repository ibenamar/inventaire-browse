import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (base embarquée de développement) ne doit pas être empaquetée.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default config;
