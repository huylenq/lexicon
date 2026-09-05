import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ModelMap from "../client/src/ModelMap";
import { parseModel } from "../server/model";

const model = parseModel(
  await readFile(
    resolve(import.meta.dir, "../examples/dentalml/lexicon/model.xml"),
    "utf8",
  ),
);
test("context overview preserves authored context semantics instead of promoting concept relations", () => {
  const html = renderToStaticMarkup(
    <ModelMap model={model} onSelect={() => {}} />,
  );
  expect(html).toContain("supplies results to");
  expect(html).not.toContain("becomes");
});
test("a focused relationship retains both concept endpoints and its own name", () => {
  const html = renderToStaticMarkup(
    <ModelMap
      model={model}
      item={model.items.find((i) => i.id === "renders-path")}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("Open Measurement path");
  expect(html).toContain("Open Displayed path");
  expect(html).toContain("Read relationship: becomes");
});
