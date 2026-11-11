import type { Metadata, Viewport } from "next";
import { FocusContenu } from "@/components/FocusContenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventaire Browse",
  description: "Inventaire inter-shifts des points de vente Browse",
  appleWebApp: { capable: true, title: "Inventaire", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Couleur de la barre du navigateur (tokens --primary / --background du design system).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#753b36" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1918" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">
        <a href="#contenu" className="lien-evitement">
          Aller au contenu
        </a>
        {children}
        <FocusContenu />
      </body>
    </html>
  );
}
