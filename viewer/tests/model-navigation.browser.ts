import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.use({ serviceWorkers: "block" });

test("object type tooltips work with hover, keyboard, and a zoomed canvas", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth");
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
  await expect(page.locator("main h1")).toHaveText("Selected tooth");
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await tooth.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Concept · entity");
  await page.keyboard.press("Tab");
  await expect(tooth).not.toBeFocused();
  await page.keyboard.press("Escape");

  await page.goto("/p/dentalml");
  await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
  const canvasIcon = page.getByRole("button", { name: "concept: Selected tooth", exact: true })
    .getByRole("img", { name: "Concept · entity", exact: true });
  await canvasIcon.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveText("Concept · entity");
  const anchorBox = await canvasIcon.boundingBox();
  const tipBox = await tooltip.boundingBox();
  expect(Math.abs(tipBox!.y - anchorBox!.y - anchorBox!.height - 8)).toBeLessThan(2);
  await page.mouse.wheel(0, -100);
  await expect(tooltip).toBeHidden();
});

test("a registered model with parallel edges, self-links, stale links, and invalid endpoints stays usable", async ({
  page,
  request,
}) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-model-browser-"));
  let id = "";
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(
      join(root, "lexicon/model.xml"),
      `<lexicon schema="2.0" id="edge-cases"><name>Edge cases</name><description>Canvas validation.</description><context id="c"><name>Context</name><description>Example.</description><concept id="a"><name>Alpha</name><description>First.</description><code-link file="missing.ts" symbol="Missing" role="definition">Missing code.</code-link></concept><concept id="b"><name>Beta</name><description>Second.</description></concept></context><relationship id="one" from="a" to="b"><name>one</name><description>First edge.</description></relationship><relationship id="two" from="a" to="b"><name>two</name><description>Second edge.</description></relationship><relationship id="self" from="a" to="a"><name>itself</name><description>Self edge.</description></relationship><relationship id="bad" from="a" to="missing"><name>bad</name><description>Missing endpoint.</description></relationship></lexicon>`,
    );
    const response = await request.post("/api/projects", { data: { root } });
    id = (await response.json()).id;
    await page.goto(`/p/${id}`);
    await expect(page.locator(".canvas-card[data-model-id^='item:']")).toHaveCount(2);
    await expect(page.locator(".issues")).toContainText("Model needs attention");
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Read relationship: itself",
        exact: true,
      }),
    ).toBeVisible();
    const paths = await page
      .locator(".canvas-connection > path:first-child")
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
