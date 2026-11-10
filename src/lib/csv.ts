/** Lecture CSV (séparateur virgule, guillemets doublés, BOM éventuel). */
export function lireCsv(texteBrut: string): Record<string, string>[] {
  const lignes: string[][] = [];
  const texte = texteBrut.replace(/^\uFEFF/, "");
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x !== "")) lignes.push(ligne);
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete.map((k, i) => [k.trim(), (l[i] ?? "").trim()])));
}

