import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSource, readSourceMetadata } from "../server/source";
import { sourceTargetId, type CodeLink, type SymbolKind } from "../shared/model";

const link = (file: string, symbol: string): CodeLink => ({ kind: "code", file, symbol, role: "definition", description: "Definition." });
test("source metadata distinguishes declaration kinds, ambiguity, and cache refresh without source text", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-symbol-kinds-"));
  try {
    await writeFile(join(root, "types.ts"), `export class Widget { run() {} }
export function create() {}
export interface Contract { value: number }
export type Identifier = string;
export enum Mode { Ready, Done }
export let value = 1;
export const arrow = () => true;
export function duplicate() {}
export function duplicate() {}
`);
    const kinds: Record<string, SymbolKind> = { Widget: "class", "Widget.run": "method", create: "function", Contract: "interface", Identifier: "type", Mode: "enum", value: "variable", arrow: "function" };
    const links = [...Object.keys(kinds), "duplicate", "Missing"].map(name => link("types.ts", name));
    const metadata = await readSourceMetadata(root, links);
    for (const [name, kind] of Object.entries(kinds)) {
      expect(metadata[sourceTargetId(link("types.ts", name))]).toEqual({ symbolKind: kind });
      expect(await readSource(root, link("types.ts", name))).toMatchObject({ status: "symbol", symbolKind: kind });
    }
    expect(metadata[sourceTargetId(link("types.ts", "duplicate"))]).toBeUndefined();
    expect(metadata[sourceTargetId(link("types.ts", "Missing"))]).toBeUndefined();
    expect(await readSourceMetadata(root, links)).toEqual(metadata);
    await writeFile(join(root, "types.ts"), "export function Widget() {}\n");
    expect(await readSourceMetadata(root, links)).toEqual({ [sourceTargetId(links[0])]: { symbolKind: "function" } });
    await writeFile(join(root, "source.py"), `class Agent:
    @staticmethod
    def run():
        def helper():
            pass
        return helper()

def create():
    pass
`);
    const python = ["Agent", "Agent.run", "Agent.run.helper", "create"].map(name => link("source.py", name));
    expect(Object.values(await readSourceMetadata(root, python)).map(m => m.symbolKind)).toEqual(["class", "method", "function", "function"]);
    await writeFile(join(root, "unsupported.rs"), "struct Agent {}\n");
    await symlink(join(root, ".."), join(root, "escape"));
    expect(await readSourceMetadata(root, [link("missing.ts", "A"), link("unsupported.rs", "Agent"), link("escape/anything.ts", "A")])).toEqual({});
  } finally { await rm(root, { recursive: true, force: true }); }
});
