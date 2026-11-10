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

export async function hacherPin(pin: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const h = await deriver(pin, sel, ITERATIONS);
  return ["pbkdf2", ITERATIONS, versB64(sel), versB64(h)].join("$");
}

export async function verifierPin(pin: string, stocke: string): Promise<boolean> {
  const [algo, it, sel, attendu] = stocke.split("$");
  if (algo !== "pbkdf2" || !it || !sel || !attendu) return false;
  const h = await deriver(pin, depuisB64(sel), Number(it));
  const a = depuisB64(attendu);
  if (a.length !== h.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ h[i];
  return diff === 0;
}
