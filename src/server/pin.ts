/**
 * Hachage des codes PIN (PBKDF2-SHA256 via Web Crypto : fonctionne sous Node et Cloudflare Workers,
 * qui limite le nombre d'itérations à 100 000).
 */
const ITERATIONS = 100_000;
const enc = new TextEncoder();

const versB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const depuisB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriver(pin: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sel as BufferSource, iterations },
    cle,
    256,
  );
  return new Uint8Array(bits);
}

export function estPinValide(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * « Poivre » : secret du serveur (PIN_PEPPER) mélangé au code avant le hachage. Un code PIN n'a que
 * 10 000 à 1 000 000 valeurs : sans ce secret, une copie de la base suffirait à les retrouver tous.
 * Changer ou retirer PIN_PEPPER rend invalides les codes hachés avec : à définir une fois pour toutes.
 */
async function poivrer(pin: string, poivre: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", enc.encode(poivre), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return versB64(new Uint8Array(await crypto.subtle.sign("HMAC", cle, enc.encode(pin))));
}
const poivreServeur = () => (process.env.PIN_PEPPER?.length ?? 0) >= 16 ? process.env.PIN_PEPPER! : null;

export async function hacherPin(pin: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const poivre = poivreServeur();
  const h = await deriver(poivre ? await poivrer(pin, poivre) : pin, sel, ITERATIONS);
  return [poivre ? "pbkdf2p" : "pbkdf2", ITERATIONS, versB64(sel), versB64(h)].join("$");
}

/** Empreinte ancienne (sans poivre) alors qu'un poivre est configuré : à refaire à la prochaine connexion. */
export const aRehacher = (stocke: string) => Boolean(poivreServeur()) && stocke.startsWith("pbkdf2$");

export async function verifierPin(pin: string, stocke: string): Promise<boolean> {
  const [algo, it, sel, attendu] = stocke.split("$");
  if ((algo !== "pbkdf2" && algo !== "pbkdf2p") || !it || !sel || !attendu) return false;
  let entree = pin;
  if (algo === "pbkdf2p") {
    const poivre = poivreServeur();
    if (!poivre) return false;
    entree = await poivrer(pin, poivre);
  }
  const h = await deriver(entree, depuisB64(sel), Number(it));
  const a = depuisB64(attendu);
  if (a.length !== h.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ h[i];
  return diff === 0;
}
