import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const viewport = (page: Page) =>
  page
    .locator(".react-flow__viewport")
    .evaluate((el) => el.getAttribute("style"));
const positions = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [
        ...document.querySelectorAll<HTMLElement>(".react-flow__node-vertex"),
      ].map((el) => [el.dataset.id!, el.style.transform]),
    ),
  );
async function openGraph(page: Page) {
  await page.goto("/p/dentalml");
  await page.getByRole("button", { name: "◇ Graph", exact: true }).click();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  await expect(page.getByText("Arranging the graph…")).toBeHidden();
  await expect.poll(() => viewport(page)).not.toContain("scale(1)");
}

test("domain selection, context collapse, code expansion, focus, and history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGraph(page);
  const originalCamera = await viewport(page);
  await page
    .getByRole("button", { name: "concept: Selected tooth", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  expect(await viewport(page)).toBe(originalCamera);
  const before = await positions(page);
  await page.getByRole("button", { name: "Expand code", exact: true }).click();
  await expect(page.locator(".graph-vertex.code")).toHaveCount(1);
  const after = await positions(page);
  for (const [id, position] of Object.entries(before))
    expect(after[id]).toBe(position);
  expect(await viewport(page)).toBe(originalCamera);
  await page
    .getByRole("button", { name: "Read relationship: selects", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText(
    "Selected tooth selects Tooth input",
  );
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await page.goForward();
  await expect(page.locator("main h1")).toHaveText(
    "Selected tooth selects Tooth input",
  );
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(
    page.getByText("Focused neighborhood", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => viewport(page)).not.toBe(originalCamera);
  expect(
    await page.locator(".graph-vertex.concept:visible").count(),
  ).toBeLessThan(8);
  await page
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  await expect.poll(() => viewport(page)).toBe(originalCamera);
  await page
    .getByRole("button", {
      name: "Collapse context Tooth selection",
      exact: true,
    })
    .click();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(6);
  await expect(page.locator(".graph-vertex.code")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Read summary: 1 relationship",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Read summary: 1 relationship", exact: true })
    .click();
  await expect(page.locator("main")).toContainText("Underlying relationships");
  await page.reload();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(6);
  await expect(page.locator(".graph-vertex.code")).toHaveCount(1);
  await expect(page.locator("main")).toContainText("Underlying relationships");
  expect(errors).toEqual([]);
});

test("shared code nodes, mapping readers, graph toggles, search, and resizing", async ({
  page,
}) => {
  await openGraph(page);
  await page
    .getByRole("button", { name: "Show all code", exact: true })
    .click();
  await expect(page.locator(".graph-vertex.code")).toHaveCount(6);
  await expect(page.locator(".react-flow__edge.mapping")).toHaveCount(18);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await expect(page.locator(".react-flow__edge.mapping")).toHaveCount(18);
  const code = page
    .locator(".react-flow__node-vertex")
    .filter({ has: page.locator(".graph-vertex.code") })
    .first();
  await code.click();
  await expect(page.locator("main")).toContainText("Domain mappings");
  await expect(page.locator("main .embedded-code")).toBeVisible();
  await expect(page.locator("main .code-scroll")).toBeVisible();
  await expect(page.locator(".react-flow__edge.mapping")).toHaveCount(18);
  await page.locator("main .mapping-target").first().click();
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(page.locator("main .embedded-code")).toBeVisible();
  const oldWidth = await page
    .locator(".graph-slot")
    .evaluate((el) => el.getBoundingClientRect().width);
  await page
    .getByRole("separator", { name: "Resize graph and reader" })
    .focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page
      .locator(".graph-slot")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(oldWidth);
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Model navigation" }),
  ).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Domain graph" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle navigation", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search model" }).fill("reference");
  await expect(
    page.locator(".react-flow__node.search-dim").first(),
  ).toBeVisible();
  await page
    .locator(".sidebar .nav-item")
    .filter({ hasText: "Reference point" })
    .click();
  await expect(page.locator("main h1")).toHaveText("Reference point");
  await page
    .getByRole("button", { name: "Locate in graph", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "concept: Reference point", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "◇ Graph", exact: true }).click();
  await expect(page.getByRole("region", { name: "Domain graph" })).toBeHidden();
  await expect(page.locator("main h1")).toHaveText("Reference point");
});

test("manual group placement and keyboard selection survive reload; reset restores the overview", async ({
  page,
}) => {
  await openGraph(page);
  const node = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  const initial = await positions(page);
  const heading = page.locator(
    '[data-id="item:selection"] .graph-group-heading',
  );
  const box = (await heading.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 35, { steps: 8 });
  await page.mouse.up();
  const moved = await positions(page);
  expect(moved["item:selection"]).not.toBe(initial["item:selection"]);
  await page.reload();
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  expect((await positions(page))["item:selection"]).toBe(
    moved["item:selection"],
  );
  await page.getByLabel("Graph options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Reset graph view", exact: true })
    .click();
  await expect
    .poll(async () => (await positions(page))["item:selection"])
    .toBe(initial["item:selection"]);
});

test("narrow screens and dark theme retain graph state and show readable code errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGraph(page);
  await expect(page.locator("main")).toBeHidden();
  await page
    .getByRole("button", { name: "concept: Selected tooth", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await expect(page.locator(".graph-slot")).toBeHidden();
  await page
    .getByRole("button", { name: "← Back to graph", exact: true })
    .click();
  await expect(page.locator(".graph-slot")).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Expand code", exact: true }).click();
  await expect(page.locator(".graph-vertex.code")).toHaveCount(1);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  await page.route("**/api/projects/dentalml/code?**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Linked file is unavailable." }),
    }),
  );
  await page
    .locator(".react-flow__node-vertex")
    .filter({ has: page.locator(".graph-vertex.code") })
    .click();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "Linked file is unavailable.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("mobile-dark.png") });
});

test("a registered model with parallel edges, self-links, stale links, and invalid endpoints stays usable", async ({
  page,
  request,
}) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-graph-browser-"));
  let id = "";
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(
      join(root, "lexicon/model.xml"),
      `<lexicon schema="2.0" id="edge-cases"><name>Edge cases</name><description>Graph validation.</description><context id="c"><name>Context</name><description>Example.</description><concept id="a"><name>Alpha</name><description>First.</description><code-link file="missing.ts" symbol="Missing" role="definition">Missing code.</code-link></concept><concept id="b"><name>Beta</name><description>Second.</description></concept></context><relationship id="one" from="a" to="b"><name>one</name><description>First edge.</description></relationship><relationship id="two" from="a" to="b"><name>two</name><description>Second edge.</description></relationship><relationship id="self" from="a" to="a"><name>itself</name><description>Self edge.</description></relationship><relationship id="bad" from="a" to="missing"><name>bad</name><description>Missing endpoint.</description></relationship></lexicon>`,
    );
    const response = await request.post("/api/projects", { data: { root } });
    id = (await response.json()).id;
    await page.goto(`/p/${id}`);
    await page.getByRole("button", { name: "◇ Graph", exact: true }).click();
    await expect(page.locator(".graph-vertex.concept")).toHaveCount(2);
    await expect(page.locator(".graph-notice")).toContainText(
      "1 connections have unavailable endpoints",
    );
    await expect(
      page.getByRole("button", {
        name: "Read relationship: itself",
        exact: true,
      }),
    ).toBeVisible();
    const paths = await page
      .locator(".react-flow__edge-path")
      .evaluateAll((els) => els.map((el) => el.getAttribute("d")));
    expect(new Set(paths).size).toBe(3);
    await page
      .getByRole("button", { name: "Read relationship: itself", exact: true })
      .click();
    await expect(page.locator("main h1")).toHaveText("Alpha itself Alpha");
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});

test("wheel zoom and Space panning over nodes preserve ordinary canvas and node dragging", async ({
  page,
}) => {
  await openGraph(page);
  const pane = (await page.locator(".graph-canvas").boundingBox())!;
  await page.mouse.move(pane.x + 15, pane.y + 15);
  const original = await viewport(page);
  await page.mouse.down();
  await page.mouse.move(pane.x + 65, pane.y + 40, { steps: 8 });
  await page.mouse.up();
  expect(await viewport(page)).not.toBe(original);
  const zoom = () =>
    page
      .locator(".react-flow__viewport")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const beforeZoom = await zoom();
  await page.mouse.wheel(0, -150);
  await expect.poll(zoom).toBeGreaterThan(beforeZoom);
  await page.getByRole("button", { name: "Fit view", exact: true }).click();
  const node = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  await expect(node).toBeInViewport();
  const box = (await node.boundingBox())!;
  const beforePositions = await positions(page);
  const beforePan = await viewport(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Space");
  await expect(page.locator(".react-flow__pane")).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await expect(page.locator(".react-flow__pane")).toHaveCSS(
    "cursor",
    /grab(bing)?/,
  );
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await viewport(page)).not.toBe(beforePan);
  expect(await positions(page)).toEqual(beforePositions);
  await expect(page.locator(".react-flow__pane")).toHaveCSS(
    "cursor",
    "default",
  );
  expect(new URL(page.url()).search).toBe("");
  await page.getByRole("textbox", { name: "Search model" }).fill("selected");
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Search model" })).toHaveValue(
    "selected ",
  );
  await expect(page.locator(".space-panning")).toHaveCount(0);
});

test("an overlapping concept covers ordinary edges and labels, with selected neighbors raised above it", async ({
  page,
}) => {
  await openGraph(page);
  const concept = page.getByRole("button", {
    name: "concept: Reference point",
    exact: true,
  });
  const label = page.locator(
    '[data-id="relation:owns-length"] .graph-edge-label',
  );
  const nodeBox = (await concept.boundingBox())!;
  const edgeBox = (await label.boundingBox())!;
  const point = {
    x: edgeBox.x + edgeBox.width / 2,
    y: edgeBox.y + edgeBox.height / 2,
  };
  await page.mouse.move(
    nodeBox.x + nodeBox.width / 2,
    nodeBox.y + nodeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.up();
  const topItem = () =>
    page.evaluate(
      (p) =>
        document
          .elementFromPoint(p.x, p.y)
          ?.closest("[data-id]")
          ?.getAttribute("data-id"),
      point,
    );
  expect(await topItem()).toBe("item:reference-point");
  await page
    .getByRole("button", { name: "concept: Canal measurement", exact: true })
    .click();
  await expect.poll(topItem).toBe("relation:owns-length");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect.poll(topItem).toBe("item:reference-point");
});
