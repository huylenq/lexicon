import { describe, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  symlink,
  stat,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { loadModel, parseModel, serializeModel, readModelDocument } from "../server/model";
import { readCode } from "../server/code";

const native = `<lexicon schema="3.0" id="shop"><name>Shop</name><description>Ordering goods.</description>
<context id="orders"><name>Orders</name><description>Accept customer orders.</description>
<concept id="order" classification="aggregate"><name>Order</name><description>Items purchased together.</description>
<annotation kind="rule" evidence="intended">Total follows the items.</annotation>
<code-link file="order.ts" symbol="Order" role="representation">Stores ordered items.</code-link>
</concept><concept id="line"><name>Line</name><description>A quantity of one item.</description></concept></context>
<relationship id="members" from="order" to="line"><name>contains</name><description>The order owns its lines.</description>
<code-link file="order.ts" symbol="Order" role="enforcement">Owns the item collection.</code-link></relationship></lexicon>`;
const temp = async (run: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), "lexicon-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe("the four-object model", () => {
  test("round-trips domain meaning, aggregate classification, evidence, and relationship code links", () => {
    const m = parseModel(native);
    expect(m.issues).toEqual([]);
    expect(parseModel(serializeModel(m))).toEqual(m);
    expect(m.items.find((i) => i.id === "members")?.codeLinks[0].role).toBe(
      "enforcement",
    );
  });
  test("renaming display text preserves identities and endpoints", () => {
    const m = parseModel(
      native.replace("<name>Order</name>", "<name>Purchase</name>"),
    );
    expect(m.issues).toEqual([]);
    expect(m.items.find((i) => i.id === "members")).toMatchObject({
      from: "order",
      to: "line",
    });
  });
  test("catches duplicate identities, dangling endpoints, invalid ownership shapes and code links", () => {
    expect(
      parseModel(native.replace('id="line"', 'id="order"')).issues.some((i) =>
        i.message.includes("Duplicate"),
      ),
    ).toBe(true);
    expect(
      parseModel(native.replace('to="line"', 'to="missing"')).issues.some((i) =>
        i.message.includes("endpoint"),
      ),
    ).toBe(true);
    expect(
      parseModel(native.replace('to="line"', 'to="members"')).issues.some((i) =>
        i.message.includes("endpoint"),
      ),
    ).toBe(true);
    expect(
      parseModel(native.replace('role="representation"', "")).issues.some((i) =>
        i.message.includes("Code links need"),
      ),
    ).toBe(true);
    expect(
      parseModel(
        native.replace('file="order.ts"', 'file="../order.ts"'),
      ).issues.some((i) => i.message.includes("root")),
    ).toBe(true);
    expect(
      parseModel(
        native.replace('evidence="intended"', 'evidence="proven"'),
      ).issues.some((i) => i.message.includes("qualifier")),
    ).toBe(true);
    expect(
      parseModel(
        native.replace("</context>", '<term id="wrong"/></context>'),
      ).issues.some((i) => i.message.includes("Unknown")),
    ).toBe(true);
  });
  test("rejects unsupported schema, malformed XML and entity declarations", () => {
    expect(() =>
      parseModel(native.replace('schema="3.0"', 'schema="9.0"')),
    ).toThrow();
    expect(() => parseModel("<lexicon>")).toThrow();
    expect(() =>
      parseModel('<!DOCTYPE lexicon SYSTEM "file:///tmp/secret">' + native),
    ).toThrow();
  });
  test("fresh reads see edits even when mtimes are restored; malformed native input never falls back", async () =>
    temp(async (dir) => {
      await mkdir(join(dir, "lexicon"));
      await writeFile(join(dir, "lexicon/model.xml"), native);
      expect((await loadModel(dir)).name).toBe("Shop");
      const oldTime = await stat(join(dir, "lexicon/model.xml"));
      await writeFile(
        join(dir, "lexicon/model.xml"),
        native.replace("<name>Shop</name>", "<name>New shop</name>"),
      );
      await utimes(
        join(dir, "lexicon/model.xml"),
        oldTime.atime,
        oldTime.mtime,
      );
      expect((await loadModel(dir)).name).toBe("New shop");
      await writeFile(join(dir, "lexicon/model.xml"), "<bad>");
      await expect(loadModel(dir)).rejects.toThrow();
    }));
  test("earlier split XML is detected without interpreting it or creating an empty model", async () =>
    temp(async (dir) => {
      await mkdir(join(dir, "lexicon"));
      const old = '<system schema="1.0" id="shop"><name>Shop</name><purpose>Ordering.</purpose></system>';
      await writeFile(join(dir, "lexicon/system.xml"), old);
      const document = await readModelDocument(dir);
      expect(document.model).toBeUndefined();
      expect(document.problem?.kind).toBe("schema-mismatch");
      await expect(loadModel(dir)).rejects.toThrow("Open Agent");
      expect(await readFile(join(dir, "lexicon/system.xml"), "utf8")).toBe(old);
    }));
});
describe("links into source", () => {
  test("locates TS and Python declarations, handles qualification, and reports ambiguity", async () =>
    temp(async (dir) => {
      await writeFile(
        join(dir, "order.ts"),
        "export interface Order { total: number }\nexport function total() { return 1; }",
      );
      expect(
        await readCode(dir, {
          file: "order.ts",
          symbol: "Order",
          role: "definition",
          description: "Order",
        }),
      ).toMatchObject({ status: "symbol", startLine: 1, endLine: 1 });
      await writeFile(
        join(dir, "order.py"),
        "class Order:\n    def total(self):\n        return 1\n\nclass Invoice:\n    def total(self):\n        return 2\n",
      );
      const link = {
        file: "order.py",
        symbol: "total",
        role: "implementation",
        description: "Total",
      };
      expect((await readCode(dir, link)).status).toBe("ambiguous-symbol");
      expect(
        await readCode(dir, { ...link, symbol: "Order.total" }),
      ).toMatchObject({ status: "symbol", startLine: 2, endLine: 3 });
      expect((await readCode(dir, { ...link, symbol: "missing" })).status).toBe(
        "missing-symbol",
      );
    }));
  test("supports file and line links, and rejects symlink escape, binary data and invalid lines", async () =>
    temp(async (dir) => {
      await mkdir(join(dir, "project"));
      await writeFile(join(dir, "secret.txt"), "outside");
      await symlink(join(dir, "secret.txt"), join(dir, "project/link.txt"));
      const l = { file: "link.txt", role: "definition", description: "test" };
      await expect(readCode(join(dir, "project"), l)).rejects.toThrow("root");
      await writeFile(join(dir, "project/source.txt"), "a\nb");
      expect(
        (
          await readCode(join(dir, "project"), {
            ...l,
            file: "source.txt",
            line: 2,
          })
        ).status,
      ).toBe("line");
      await expect(
        readCode(join(dir, "project"), { ...l, file: "source.txt", line: 9 }),
      ).rejects.toThrow("beyond");
      await writeFile(join(dir, "project/source.txt"), "a\0b");
      await expect(
        readCode(join(dir, "project"), { ...l, file: "source.txt" }),
      ).rejects.toThrow("binary");
    }));

});

test("the checker reports mismatches without converting or writing the original", async () =>
  temp(async (dir) => {
    await mkdir(join(dir, "lexicon"));
    const original = native.replace('schema="3.0"', 'schema="2.0"');
    await writeFile(join(dir, "lexicon/model.xml"), original);
    const result = spawnSync(process.execPath, [resolve(import.meta.dir, "../server/cli.ts"), "check", dir], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Open Agent to migrate");
    expect(await readFile(join(dir, "lexicon/model.xml"), "utf8")).toBe(original);
  }));

test("optional code-link IDs round-trip and must be unique within their owner", () => {
  const xml = `<lexicon schema="3.0" id="test"><name>Test</name><description>Test.</description><context id="ctx"><name>Context</name><description>Scope.</description><code-link id="definition" file="a.ts" role="definition">Definition.</code-link></context></lexicon>`;
  const model = parseModel(xml);
  expect(model.items[0].codeLinks[0].id).toBe("definition");
  expect(parseModel(serializeModel(model)).items[0].codeLinks[0].id).toBe("definition");
  const duplicate = xml.replace('</context>', '<code-link id="definition" file="b.ts" role="usage">Usage.</code-link></context>');
  expect(parseModel(duplicate).issues.some((i) => i.severity === "error")).toBe(true);
  expect(parseModel(xml.replace('id="definition"', 'id=""')).issues.some((i) => i.severity === "error")).toBe(true);
});
