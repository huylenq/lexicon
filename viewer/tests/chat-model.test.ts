import { afterAll, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  link,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseModel } from "../server/model";
import {
  applyPatch,
  extractPatch,
  modelOrEmpty,
  saveXml,
  validateChangedLinks,
} from "../server/chat/model-edit";

const root = await mkdtemp(join(tmpdir(), "lexicon-chat-model-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const xml =
  '<lexicon schema="2.0" id="shop"><name>Shop</name><description>Orders.</description><context id="ordering"><name>Ordering</name><description>Accept orders.</description><concept id="order"><name>Order</name><description>An order.</description></concept></context><relationship id="owns" from="ordering" to="order"><name>owns</name><description>Owns orders.</description></relationship></lexicon>';

test("incremental renaming preserves unrelated objects and stable relationship endpoints", () => {
  const model = parseModel(xml),
    order = model.items.find((i) => i.id === "order")!;
  const next = applyPatch(model, { upsert: [{ ...order, name: "Purchase" }] });
  expect(next.items.find((i) => i.id === "order")?.name).toBe("Purchase");
  expect(next.items.find((i) => i.id === "owns")).toEqual(
    model.items.find((i) => i.id === "owns"),
  );
  expect(model.items.find((i) => i.id === "order")?.name).toBe("Order");
  expect(() => applyPatch(model, { remove: ["order"] })).toThrow(
    "Relationship endpoint",
  );
  expect(() => applyPatch(model, { remove: ["ordering"] })).toThrow(
    "Unknown owning context",
  );
  expect(() =>
    applyPatch(model, {
      upsert: [
        {
          ...order,
          annotations: [{ kind: "rule", text: "x", evidence: "guess" }],
        },
      ],
    }),
  ).toThrow("Invalid annotation");
});
test("conversation text never becomes a write without one complete explicit patch", () => {
  expect(extractPatch("Should we split Order?")).toEqual({
    text: "Should we split Order?",
  });
  expect(
    extractPatch('Renamed.\n```lexicon-patch\n{"remove":[]}\n```'),
  ).toEqual({ text: "Renamed.", patch: { remove: [] } });
  expect(() => extractPatch('```lexicon-patch\n{"remove":[]')).toThrow(
    "incomplete",
  );
  expect(() => applyPatch(parseModel(xml), { source: "malicious" })).toThrow(
    "Unknown field",
  );
});
test("new source links must resolve, including symbols, before a model can be saved", async () => {
  await writeFile(
    join(root, "order.ts"),
    "export interface Order { id: string }",
  );
  const model = parseModel(xml),
    order = model.items.find((i) => i.id === "order")!;
  const changed = (symbol: string) =>
    applyPatch(model, {
      upsert: [
        {
          ...order,
          codeLinks: [
            {
              file: "order.ts",
              symbol,
              role: "representation",
              description: "Stores the order.",
            },
          ],
        },
      ],
    });
  expect(await validateChangedLinks(model, changed("Order"), root)).toEqual([]);
  await expect(
    validateChangedLinks(model, changed("Missing"), root),
  ).rejects.toThrow("missing-symbol");
});
test("empty projects stay unwritten until a model edit, and undo can restore absence", async () => {
  const folder = join(root, "empty");
  await mkdir(folder);
  expect((await modelOrEmpty(folder)).items).toEqual([]);
  await expect(readFile(join(folder, "lexicon/model.xml"))).rejects.toThrow();
  await saveXml(folder, null, xml);
  await expect(saveXml(folder, null, xml)).rejects.toThrow("changed outside");
  await saveXml(folder, xml, null);
  await expect(readFile(join(folder, "lexicon/model.xml"))).rejects.toThrow();
});
test("save and undo refuse external edits and linked destinations", async () => {
  const folder = join(root, "edits");
  await mkdir(join(folder, "lexicon"), { recursive: true });
  const file = join(folder, "lexicon/model.xml");
  await writeFile(file, xml);
  await expect(saveXml(folder, "stale", "overwrite")).rejects.toThrow(
    "changed outside",
  );
  expect(await readFile(file, "utf8")).toBe(xml);
  await rm(file);
  await symlink(join(root, "order.ts"), file);
  await expect(saveXml(folder, null, xml)).rejects.toThrow("regular");
  await rm(file);
  await link(join(root, "order.ts"), file);
  await expect(saveXml(folder, null, xml)).rejects.toThrow("regular");
  const escape = join(root, "escape");
  await mkdir(escape);
  await symlink(folder, join(escape, "lexicon"));
  await expect(saveXml(escape, null, xml)).rejects.toThrow("outside");
});
