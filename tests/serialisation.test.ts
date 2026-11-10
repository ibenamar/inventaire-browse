import { describe, expect, it } from "vitest";
import { serialiser } from "@/db";

/** Faux client postgres.js : une requête ne démarre qu'au premier « then », comme dans la vraie bibliothèque. */
function fauxClient() {
  let enCours = 0;
  let maxSimultanees = 0;
  const ordre: string[] = [];
  const requete = (nom: string, echec = false) => {
    let promesse: Promise<string[]> | null = null;
    const demarrer = () =>
      (promesse ??= (async () => {
        enCours++;
        maxSimultanees = Math.max(maxSimultanees, enCours);
        ordre.push(`début ${nom}`);
        await new Promise((r) => setTimeout(r, 5));
        ordre.push(`fin ${nom}`);
        enCours--;
        if (echec) throw new Error(`échec ${nom}`);
        return [nom];
      })());
    return { then: (a: never, b: never) => demarrer().then(a, b), values: () => ({ then: (a: never, b: never) => demarrer().then(a, b) }) };
  };
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe: (q: string) => requete(q, q === "ECHEC"),
    begin: async (f: (c: { unsafe(q: string): unknown }) => Promise<unknown>) => f({ unsafe: (q: string) => requete(`tx:${q}`) }),
  };
  return { client, etat: () => ({ maxSimultanees, ordre }) };
}

describe("file d'attente des requêtes d'une connexion", () => {
  it("exécute des requêtes lancées en parallèle une à une, sans chevauchement", async () => {
    const { client, etat } = fauxClient();
    const c = serialiser(client);
    const r = await Promise.all([c.unsafe("A"), c.unsafe("B").values(), c.unsafe("C")]);
    expect(r).toEqual([["A"], ["B"], ["C"]]);
    expect(etat().maxSimultanees).toBe(1);
    // Chaque requête se termine avant que la suivante ne commence.
    const o = etat().ordre;
    for (let i = 0; i < o.length; i += 2) expect(o[i + 1]).toBe(o[i].replace("début", "fin"));
  });

  it("continue après une requête en échec et transmet l'erreur", async () => {
    const { client } = fauxClient();
    const c = serialiser(client);
    const [a, b] = await Promise.allSettled([c.unsafe("ECHEC"), c.unsafe("D")]);
    expect(a.status).toBe("rejected");
    expect(b).toEqual({ status: "fulfilled", value: ["D"] });
  });

  it("une transaction occupe la file jusqu'à sa fin", async () => {
    const { client, etat } = fauxClient();
    const c = serialiser(client);
    await Promise.all([
      c.begin(async (tx: { unsafe(q: string): unknown }) => {
        await tx.unsafe("T1");
        await tx.unsafe("T2");
      }),
      c.unsafe("APRES"),
    ]);
    expect(etat().ordre).toEqual(["début tx:T1", "fin tx:T1", "début tx:T2", "fin tx:T2", "début APRES", "fin APRES"]);
    expect(c.options).toBe(client.options);
  });
});
