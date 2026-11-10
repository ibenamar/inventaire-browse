import { getDb } from "@/lib/db";
import { lirePhoto } from "@/server/services/catalogue";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Introuvable", { status: 404 });
  const photo = await lirePhoto(await getDb(), id);
  if (!photo) return new Response("Introuvable", { status: 404 });
  // Une nouvelle photo reçoit un nouvel identifiant : la réponse peut être mise en cache indéfiniment.
  return new Response(photo.donnees as unknown as BodyInit, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
