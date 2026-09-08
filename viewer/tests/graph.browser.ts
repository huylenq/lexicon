import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Network failure fixtures must reach Playwright routing; PWA behavior has its own suite.
test.use({ serviceWorkers: "block" });

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
async function graphAction(page: Page, name: string) {
  const id = new URL(page.url()).searchParams.get("item");
  const node = page.locator(`[data-id="item:${id}"]`);
  if (await node.count()) await node.click({ button: "right" });
  else await page.locator(`[data-id="relation:${id}"]`).click({ button: "right" });
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function openGraph(page: Page) {
  await page.goto("/p/dentalml?canvas=graph");
  await expect(page.locator(".graph-vertex.concept")).toHaveCount(8);
  await expect(page.getByText("Arranging the graph…")).toBeHidden();
  await expect.poll(() => viewport(page)).not.toContain("scale(1)");
}

test("object type tooltips work with hover, keyboard, and a zoomed graph", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth&canvas=graph");
  const tooth = page.getByRole("button", { name: "Concept · entity Selected tooth", exact: true });
  const icon = tooth.getByRole("img", { name: "Concept · entity", exact: true });
  await expect(tooth).toHaveText("Selected tooth");
  await icon.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Concept · entity");
  await page.getByRole("tooltip").hover();
  await page.waitForTimeout(180); // The tooltip remains readable after crossing from its icon.
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await tooth.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Concept · entity");
  await page.keyboard.press("Tab");
  await expect(tooth).not.toBeFocused();
  await page.keyboard.press("Escape");

  await openGraph(page);
  const graphIcon = page.getByRole("button", { name: "concept: Selected tooth", exact: true })
    .getByRole("img", { name: "Concept · entity", exact: true });
  await graphIcon.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Concept · entity");
  const anchorBox = await graphIcon.boundingBox();
  const tipBox = await tooltip.boundingBox();
  expect(Math.abs(tipBox!.y - anchorBox!.y - anchorBox!.height - 8)).toBeLessThan(2);
  await page.mouse.wheel(0, -100);
  await expect(tooltip).toBeHidden();
  const relationship = page.getByRole("button", { name: "Read relationship: selects", exact: true });
  const relationshipIcon = relationship.getByRole("img", { name: "Relationship", exact: true });
  const relationshipBox = await relationshipIcon.boundingBox();
  expect(relationshipBox!.width).toBeGreaterThan(0);
  expect(relationshipBox!.height).toBeGreaterThan(0);
  await relationshipIcon.hover();
  await expect(tooltip).toHaveText("Relationship");
});

test("domain selection, context collapse, code expansion, focus, and history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openGraph(page);
  const originalCamera = await viewport(page);
  const selectedTooth = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  const labelBeforeSelection = await selectedTooth
    .locator(".object-name-text")
    .boundingBox();
  await selectedTooth.click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  const labelAfterSelection = await selectedTooth
    .locator(".object-name-text")
    .boundingBox();
  expect(labelAfterSelection).toEqual(labelBeforeSelection);
  expect(await viewport(page)).toBe(originalCamera);
  const before = await positions(page);
  await graphAction(page, "Expand code");
  await expect(page.locator(".graph-vertex.code")).toHaveCount(1);
  const after = await positions(page);
  for (const [id, position] of Object.entries(before))
    expect(after[id]).toBe(position);
  expect(await viewport(page)).toBe(originalCamera);
  await page
    .getByRole("button", { name: "Read relationship: selects", exact: true })
    .click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText(
    "Selected tooth selects Tooth input",
  );
  await page.goBack();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await page.goForward();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText(
    "Selected tooth selects Tooth input",
  );
  await graphAction(page, "Focus");
  await expect(
    page.getByRole("button", { name: "Back to overview", exact: true }),
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

test("shared code nodes, mapping readers, Browse toggling, search, and resizing", async ({
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
  await expect(page.locator(".code-pane")).toContainText("Mapped from");
  await expect(
    page.getByRole("complementary", { name: "Code workspace" }),
  ).toBeVisible();
  await expect(page.locator(".code-pane .code-scroll")).toBeVisible();
  await expect(page.locator(".react-flow__edge.mapping")).toHaveCount(18);
  await page.locator(".code-mappings summary").click();
  await page.locator(".code-mapping .quiet").first().click();
  await expect(page.locator("main")).toContainText("Mapping explanation");
  await expect(
    page.getByRole("complementary", { name: "Code workspace" }),
  ).toBeVisible();
  const oldWidth = await page
    .locator("main")
    .evaluate((el) => el.getBoundingClientRect().width);
  await page
    .getByRole("separator", { name: "Resize graph and reader" })
    .focus();
  await page.keyboard.press("ArrowRight");
  expect(
    await page
      .locator("main")
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThan(oldWidth);
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
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Reference point");
  await page
    .locator(".reader-card.active").getByRole("button", { name: "Locate in graph", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "concept: Reference point", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("region", { name: "Domain graph" })).toBeVisible();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Reference point");
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
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
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
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await expect(page.locator(".graph-slot")).toBeHidden();
  await page
    .getByRole("button", { name: "Toggle reader", exact: true })
    .click();
  await expect(page.locator(".graph-slot")).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await graphAction(page, "Expand code");
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
  await expect(
    page.getByRole("complementary", { name: "Code workspace" }),
  ).toBeVisible();
  await expect(page.locator("main")).toBeHidden();
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
    await page.goto(`/p/${id}?canvas=graph`);
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
    await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Alpha itself Alpha");
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});

test("left drag selects while right drag, wheel, and Space navigate the canvas", async ({
  page,
}) => {
  await openGraph(page);
  const pane = (await page.locator(".graph-canvas").boundingBox())!;
  const shelf = (await page.locator("#browse-pane").boundingBox())!;
  const canvasLeft = Math.max(pane.x, shelf.x + shelf.width);
  await page.mouse.move(canvasLeft + 15, pane.y + 15);
  const original = await viewport(page);
  await expect(page.locator(".react-flow__pane")).toHaveCSS("cursor", "default");
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width - 20, pane.y + pane.height - 20, {
    steps: 8,
  });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up();
  expect(await viewport(page)).toBe(original);
  expect(await page.locator(".react-flow__node.selected").count()).toBeGreaterThan(1);
  await expect(page.locator(".react-flow__nodesselection-rect")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(page.locator(".react-flow__nodesselection-rect")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".react-flow__nodesselection-rect")).toHaveCSS(
    "pointer-events",
    "none",
  );
  const marqueeSelectedTooth = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  const selectedBeforeToggle = await page.locator(".react-flow__node.selected").count();
  await marqueeSelectedTooth.click({ modifiers: ["Meta"] });
  await expect(marqueeSelectedTooth).not.toHaveClass(/selected/);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(
    selectedBeforeToggle - 1,
  );
  await marqueeSelectedTooth.click({ modifiers: ["Meta"] });
  await expect(marqueeSelectedTooth).toHaveClass(/selected/);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(
    selectedBeforeToggle,
  );

  await page.mouse.move(canvasLeft + 15, pane.y + 15);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(canvasLeft + 65, pane.y + 40, { steps: 8 });
  await page.mouse.up({ button: "right" });
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
  expect(new URL(page.url()).search).toBe("?canvas=graph");
  await page.getByRole("textbox", { name: "Search model" }).fill("selected");
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Search model" })).toHaveValue(
    "selected ",
  );
  await expect(page.locator(".space-panning")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Search model" }).fill("");
  await page.mouse.click(canvasLeft + 15, pane.y + 15);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  const selectedTooth = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  const toothInput = page.getByRole("button", {
    name: "concept: Tooth input",
    exact: true,
  });
  await selectedTooth.click();
  await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Selected tooth");
  await toothInput.click({ modifiers: ["Meta"] });
  await expect(selectedTooth).toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  await selectedTooth.click({ modifiers: ["Meta"] });
  await expect(selectedTooth).not.toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
});

test("marquee selection includes a node when the rectangle only touches it", async ({
  page,
}) => {
  await openGraph(page);
  const group = page.locator('[data-id="item:selection"]');
  const box = (await group.boundingBox())!;
  const startX = box.x - 10;
  const startY = box.y + 10;
  const camera = await viewport(page);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(box.x + 2, startY + 10, { steps: 6 });
  await expect(page.locator(".react-flow__selection")).toBeVisible();
  await page.mouse.up();

  expect(await viewport(page)).toBe(camera);
  await expect(group).toHaveClass(/selected/);
  await expect(
    page.getByRole("button", { name: "concept: Selected tooth", exact: true }),
  ).not.toHaveClass(/selected/);
});

test("Command-drag inside a context toggles children without selecting the context", async ({
  page,
}) => {
  await openGraph(page);
  const groupNode = page.locator('[data-id="item:selection"]');
  const group = (await groupNode.boundingBox())!;
  const selectedTooth = page.getByRole("button", {
    name: "concept: Selected tooth",
    exact: true,
  });
  const toothInput = page.getByRole("button", {
    name: "concept: Tooth input",
    exact: true,
  });
  const selectedBox = (await selectedTooth.boundingBox())!;
  const commandClickContext = async () => {
    await page.keyboard.down("Meta");
    await page.mouse.click(
      group.x + group.width - 5,
      selectedBox.y + selectedBox.height / 2,
    );
    await page.keyboard.up("Meta");
  };
  const commandMarquee = async (node: typeof selectedTooth) => {
    const box = (await node.boundingBox())!;
    await page.keyboard.down("Meta");
    await page.mouse.move(group.x + group.width - 5, box.y - 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 2, box.y + box.height + 2, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
  };

  await selectedTooth.click();
  await expect(selectedTooth).toHaveClass(/selected/);
  await expect(toothInput).not.toHaveClass(/selected/);
  await commandClickContext();
  await expect(groupNode).toHaveClass(/selected/);
  await expect(selectedTooth).toHaveClass(/selected/);
  await commandClickContext();
  await expect(groupNode).not.toHaveClass(/selected/);
  await expect(selectedTooth).toHaveClass(/selected/);

  await commandMarquee(toothInput);
  await expect(selectedTooth).toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
  await expect(groupNode).not.toHaveClass(/selected/);

  await commandMarquee(selectedTooth);
  await expect(selectedTooth).not.toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
  await expect(groupNode).not.toHaveClass(/selected/);

  await page.keyboard.down("Meta");
  await page.mouse.move(group.x - 10, group.y + 5);
  await page.mouse.down();
  await page.mouse.move(group.x + 2, group.y + 15, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await expect(groupNode).toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);

  const groupTitle = groupNode.locator(".graph-node-title");
  await groupTitle.click({ modifiers: ["Meta"] });
  await expect(groupNode).not.toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
  await groupTitle.click({ modifiers: ["Meta"] });
  await expect(groupNode).toHaveClass(/selected/);

  await commandClickContext();
  await expect(groupNode).not.toHaveClass(/selected/);
  await expect(toothInput).toHaveClass(/selected/);
});

test("an overlapping concept continues to cover edges when a neighboring node is selected", async ({
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
  await expect.poll(topItem).toBe("item:reference-point");
});

test("selection and focus controls do not move the graph canvas", async ({
  page,
}) => {
  await openGraph(page);
  const canvasTop = () =>
    page.locator(".graph-canvas").evaluate((element) =>
      element.getBoundingClientRect().top,
    );
  const initialTop = await canvasTop();

  await page
    .getByRole("button", { name: "concept: Canal measurement", exact: true })
    .click();
  expect(await canvasTop()).toBe(initialTop);
  await graphAction(page, "Focus");
  expect(await canvasTop()).toBe(initialTop);
  await page
    .getByRole("button", { name: "Back to overview", exact: true })
    .click();
  expect(await canvasTop()).toBe(initialTop);
  await page.getByRole("button", { name: "Locate", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".graph-scope")).toHaveText("Overall domain");
  expect(await canvasTop()).toBe(initialTop);

  await page.locator(".reader-workspace").evaluate((element) =>
    (element as HTMLElement).style.setProperty("--reader-width", "75%"),
  );
  const narrowTop = await canvasTop();
  await page
    .getByRole("button", { name: "concept: Canal measurement", exact: true })
    .click();
  expect(await canvasTop()).toBe(narrowTop);
  await graphAction(page, "Focus");
  expect(await canvasTop()).toBe(narrowTop);
});

test("node context menu targets the clicked node and supports dismissal and keyboard", async ({ page }) => {
  await openGraph(page);
  const tooth = page.locator('[data-id="item:selected-tooth"]');
  await tooth.click({ button: "right" });
  await expect(tooth).toHaveClass(/selected/);
  await expect(page.locator('.graph-toolbar').getByRole('button', { name: 'Focus', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Expand code', exact: true })).toBeVisible();
  // Allow newly mounted external SVG icons to paint before visual capture.
  await page.waitForTimeout(150);
  await page.screenshot({ path: '../artifacts/graph-node-context-menu.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(tooth).not.toHaveClass(/selected/);
  await tooth.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Expand code', exact: true }).click();
  await expect(page.locator('.graph-vertex.code')).toHaveCount(1);
  await tooth.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Hide code', exact: true }).click();
  await expect(page.locator('.graph-vertex.code')).toHaveCount(0);
  await tooth.click({ button: 'right' });
  await page.locator('.graph-scope').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});
