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
import { loadModel, parseModel, serializeModel } from "../server/model";
import { readCode } from "../server/code";

const native = `<lexicon schema="2.0" id="shop"><name>Shop</name><description>Ordering goods.</description>
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
      parseModel(native.replace('schema="2.0"', 'schema="9.0"')),
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
  test("imports earlier XML read-only, preserving concept categories, rules, anchors and references", async () =>
    temp(async (dir) => {
      await mkdir(join(dir, "lexicon/contexts"), { recursive: true });
      const old =
        '<system schema="1.0" id="shop"><name>Shop</name><purpose>Ordering goods.</purpose><contexts><ref to="orders"/></contexts></system>';
      await writeFile(join(dir, "lexicon/system.xml"), old);
      await writeFile(
        join(dir, "lexicon/contexts/orders.xml"),
        '<bounded-context schema="1.0" id="orders"><name>Orders</name><purpose>Ordering.</purpose><term id="order" category="entity"><name>Order</name><definition>A purchase.</definition><symbols><code-anchor file="order.ts" symbol="Order"/></symbols></term><aggregate id="group"><name>Group</name><description>Consistency.</description><root><ref to="order"/></root><rationale>Change together.</rationale></aggregate></bounded-context>',
      );
      const m = await loadModel(dir);
      expect(m.source).toBe("legacy");
      expect(
        m.items.find((i) => i.id === "orders/order")?.codeLinks[0].symbol,
      ).toBe("Order");
      expect(
        m.items.find((i) => i.id === "orders/aggregate/group"),
      ).toMatchObject({ classification: "aggregate" });
      expect(
        m.items.some(
          (i) =>
            i.type === "relationship" &&
            i.from === "orders/aggregate/group" &&
            i.to === "orders/order",
        ),
      ).toBe(true);
      expect(m.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(await readFile(join(dir, "lexicon/system.xml"), "utf8")).toBe(old);
      expect(parseModel(serializeModel(m)).items).toEqual(m.items);
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

test("conversion creates a new model and refuses to overwrite it", async () =>
  temp(async (dir) => {
    await mkdir(join(dir, "lexicon"));
    const original =
      '<system schema="1.0" id="shop"><name>Shop</name><purpose>Purchases.</purpose><contexts><ref to="missing"/></contexts></system>';
    await writeFile(join(dir, "lexicon/system.xml"), original);
    const args = [
      resolve(import.meta.dir, "../server/cli.ts"),
      "convert",
      dir,
      "--write",
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(first.status).toBe(0);
    const output = await readFile(join(dir, "lexicon/model.xml"), "utf8");
    expect(output).toContain('kind="import-review"');
    expect(parseModel(output).issues).toEqual([]);
    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(second.status).toBe(1);
    expect(await readFile(join(dir, "lexicon/model.xml"), "utf8")).toBe(output);
    expect(await readFile(join(dir, "lexicon/system.xml"), "utf8")).toBe(
      original,
    );
  }));
