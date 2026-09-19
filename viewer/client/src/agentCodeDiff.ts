const normalizePath = (path: string) => path.replace(/^\.\//, "");

/** Git quotes non-ASCII bytes and control characters in diff paths. */
function gitPath(value: string): string {
  if (!value.startsWith('"')) return value.replace(/\t.*$/, "");
  const bytes: number[] = [], encoder = new TextEncoder();
  const text = value.slice(1, value.lastIndexOf('"'));
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (character !== "\\") { const point = String.fromCodePoint(text.codePointAt(index)!); bytes.push(...encoder.encode(point)); index += point.length - 1; continue; }
    const next = text[++index] || "";
    if (/[0-7]/.test(next)) {
      const octal = text.slice(index).match(/^[0-7]{1,3}/)![0]; bytes.push(parseInt(octal, 8)); index += octal.length - 1;
    } else bytes.push(...encoder.encode(({ a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r" } as Record<string, string>)[next] || next));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function diffForFile(diff: string, path: string) {
  const wanted = normalizePath(path);
  return diff.split(/(?=^diff --git )/m).filter(section => {
    const header = section.split(/^(?:@@|GIT binary patch)/m, 1)[0] || "";
    const first = header.split("\n", 1)[0] || "";
    if (first === `diff --git a/${wanted} b/${wanted}`) return true;
    const quoted = first.match(/"(?:\\.|[^"\\])*"/g) || [];
    if (quoted.some(token => normalizePath(gitPath(token).replace(/^[ab]\//, "")) === wanted)) return true;
    return [...header.matchAll(/^(--- |\+\+\+ |rename from |rename to )(.+)$/gm)].some(([, prefix, value]) => normalizePath(prefix!.startsWith("rename") ? gitPath(value!) : gitPath(value!).replace(/^[ab]\//, "")) === wanted);
  }).join("");
}
