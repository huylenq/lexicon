import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
test.use({ serviceWorkers: "block" });
const xml =
  '<lexicon schema="2.0" id="shop"><name>Shop</name><description>Orders.</description><context id="scope"><name>Ordering</name><description>Orders.</description><concept id="thing"><name>Order</name><description>A purchase.</description><code-link file="order.ts" symbol="Order" role="representation">Stores the order.</code-link></concept></context><relationship id="owns" from="scope" to="thing"><name>owns</name><description>Owns orders.</description></relationship></lexicon>';
test("conversation refines a selected concept, survives navigation and reload, and undoes the file change", async ({
  page,
  request,
}) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-chat-browser-"));
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), xml);
    await writeFile(
      join(root, "order.ts"),
      "export interface Order { id: string }",
    );
    const project = await (
      await request.post("/api/projects", { data: { root } })
    ).json();
    await page.goto(`/p/${project.id}?item=thing`);
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const chat = page.getByRole("complementary", {
      name: "Project conversation",
    });
    await expect(chat.locator(".chat-attachment")).toContainText("Order");
    const model = chat.getByRole("button", { name: "Choose provider and model" });
    await expect(model).toContainText("Fast model");
    await model.click();
    await chat.getByRole("combobox", { name: "Search models" }).fill("deep");
    await chat.getByRole("option", { name: "Deep model", exact: true }).click();
    await chat.getByRole("combobox", { name: "Reasoning effort" }).selectOption("high");
    await chat.getByRole("button", { name: "Fast mode", exact: true }).click();
    await chat
      .getByRole("textbox", { name: "Message the coding agent" })
      .fill("Rename Order to Purchase and show tools");
    const send = chat.getByRole("button", { name: "Send", exact: true });
    expect(await send.innerText()).toBe("");
    const area = await chat.getByRole("textbox", { name: "Message the coding agent" }).boundingBox();
    const button = await send.boundingBox();
    expect(button!.x).toBeGreaterThan(area!.x);
    expect(button!.y + button!.height).toBeLessThan(area!.y + area!.height);
    await expect(chat.getByText("Model location", { exact: true })).toHaveCount(0);
    await expect(chat.locator(".chat-connection-dot")).toHaveCount(1);
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      chat.getByText("Model updated", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Purchase");
    await expect(chat.locator(".chat-message-model")).toHaveText("test-deep · high · Fast");
    const tool = chat.locator(".chat-tool");
    await expect(tool).toContainText("cat order.ts");
    await expect(tool).toContainText("Done");
    await tool.locator("summary").click();
    await expect(tool.locator("pre").last()).toContainText("export interface Order {}");
    expect(await readFile(join(root, "order.ts"), "utf8")).toBe(
      "export interface Order { id: string }",
    );
    await expect(page.getByRole("region", { name: "Model canvas" })).toBeVisible();
    await expect(chat).toBeVisible();
    await expect(page.locator("#browse-pane")).toBeVisible();
    await page.getByRole("button", { name: "Toggle code workspace" }).click();
    await expect(chat).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await expect(model).toContainText("Deep model");
    await expect(chat.getByRole("button", { name: "Fast mode", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(chat.getByRole("combobox", { name: "Reasoning effort" })).toHaveValue("high");
    await expect(chat.locator(".chat-tool")).toContainText("cat order.ts");
    await expect(
      chat.getByText("Model updated", { exact: true }),
    ).toBeVisible();
    await chat.getByRole("button", { name: "Undo edit" }).click();
    await expect(page.locator("main [data-reader-card].active > header h1")).toHaveText("Order");
    expect(await readFile(join(root, "lexicon/model.xml"), "utf8")).toBe(xml);
    await chat
      .getByRole("textbox", { name: "Message the coding agent" })
      .fill("ask a question");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.getByText("Which area?", { exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Orders", exact: true }).click();
    await chat.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(chat.getByText("Selected Orders.")).toBeVisible();
    await chat
      .getByRole("textbox", { name: "Message the coding agent" })
      .fill("slow");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await chat.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(
      chat.getByText("Stopped. No pending model change was applied."),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      chat.getByRole("textbox", { name: "Message the coding agent" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/lexicon-implementation-evidence/chat-mobile.png",
    });
    await chat.getByRole("button", { name: "Close Chat pane" }).click();
    await expect(chat).toBeHidden();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("chat switches between floating and attached layouts while preserving drafts and conversations", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-chat-dock-"));
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), xml);
    await writeFile(join(root, "order.ts"), "export interface Order { id: string }");
    const project = await (await request.post("/api/projects", { data: { root } })).json();
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/p/${project.id}?item=thing`);
    const graph = page.getByRole("region", { name: "Model canvas" });
    await expect(graph).toBeVisible();
    const graphBounds = await graph.boundingBox();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    const chat = page.getByRole("complementary", { name: "Project conversation" });
    const input = chat.getByRole("textbox", { name: "Message the coding agent" });
    await expect(chat.getByRole("combobox", { name: "Reasoning effort" })).toBeVisible();
    await expect(chat.getByText("Reasoning", { exact: true })).toHaveCount(0);
    expect(await graph.boundingBox()).toEqual(graphBounds);
    const dockBounds = await chat.boundingBox();
    expect(dockBounds!.x + dockBounds!.width).toBe(1264);
    expect(dockBounds!.y + dockBounds!.height).toBe(802);
    await input.fill("A draft to refine Order");
    await chat.getByRole("button", { name: "Attach Agent to right side", exact: true }).click();
    const attachedBounds = (await chat.boundingBox())!;
    expect(attachedBounds.x + attachedBounds.width).toBe(1280);
    expect(attachedBounds.y).toBe(48);
    expect(attachedBounds.y + attachedBounds.height).toBe(814);
    expect((await graph.boundingBox())!.width).toBeLessThan(graphBounds!.width);
    expect(await page.locator(".pane-area").evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(attachedBounds.x);
    const chatDivider = page.getByRole("separator", { name: "Resize Agent and reader", exact: true });
    await expect(chatDivider).toBeVisible();
    const originalChatWidth = attachedBounds.width;
    await chatDivider.focus();
    await page.keyboard.press("ArrowLeft");
    const resizedBounds = (await chat.boundingBox())!;
    expect(resizedBounds.width).toBeGreaterThan(originalChatWidth);
    expect(await chatDivider.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return [getComputedStyle(el).borderLeftWidth, getComputedStyle(el).borderRightWidth, style.width];
    })).toEqual(["0px", "0px", "1px"]);
    await expect(input).toHaveValue("A draft to refine Order");
    await chat.getByRole("button", { name: "Minimize Chat", exact: true }).click();
    await expect(input).toBeHidden();
    await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeFocused();
    await expect(chat).toBeHidden();
    expect(await graph.boundingBox()).toEqual(graphBounds);
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    expect(await chat.boundingBox()).toEqual(resizedBounds);
    await expect(input).toHaveValue("A draft to refine Order");
    await expect(input).toBeFocused();
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    expect((await chat.boundingBox())!.x).toBe(resizedBounds.x);
    await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
    await chat.getByRole("button", { name: "Float Agent window", exact: true }).click();
    expect(await chat.boundingBox()).toEqual(dockBounds);
    expect(await graph.boundingBox()).toEqual(graphBounds);
    await chat.getByRole("button", { name: "Close Chat pane" }).click();
    await expect(chat).toBeHidden();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await expect(input).toHaveValue("A draft to refine Order");
    await input.fill("slow");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Minimize Chat", exact: true }).click();
    await expect(page.getByRole("status", { name: "Agent is working" })).toBeVisible();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await chat.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(chat.getByText("Stopped. No pending model change was applied.")).toBeVisible();
    await chat.getByRole("button", { name: "Attach Agent to right side", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Agent", exact: true }).click();
    await expect(chat.getByRole("button", { name: "Float Agent window", exact: true })).toBeVisible();
    await expect(chat.getByText("Stopped. No pending model change was applied.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(chat.getByRole("button", { name: "Attach Agent to right side", exact: true })).toBeHidden();
    const mobile = await chat.boundingBox();
    expect(mobile!.x).toBeGreaterThanOrEqual(0);
    expect(mobile!.y).toBeGreaterThanOrEqual(0);
    expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(390);
    const bar = await page.getByRole("region", { name: "Workspace status", exact: true }).boundingBox();
    expect(mobile!.y + mobile!.height).toBeLessThan(bar!.y);
    await expect(input).toBeVisible();
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("model choices stay separate by provider and catalog errors allow retry or a custom ID", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-model-picker-"));
  try {
    const project = await (await request.post("/api/projects", { data: { root } })).json();
    await page.goto(`/p/${project.id}`);
    await page.getByRole("button", { name: "Open Chat", exact: true }).click();
    const model = page.getByRole("button", { name: "Choose provider and model" });
    await expect(model).toContainText("Fast model");
    await model.click();
    const search = page.getByRole("combobox", { name: "Search models" });
    await search.fill("codex");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(model).toContainText("CodexDeep model");
    await model.click();
    await search.fill("grok");
    await expect(page.getByRole("option", { name: "Fast model", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Grok test", exact: true }).click();
    await expect(model).toContainText("GrokGrok test");
    await expect(page.getByRole("button", { name: "Fast mode", exact: true })).toHaveCount(0);
    await model.click();
    await search.fill("test-deep");
    await search.press("Enter");
    await expect(model).toContainText("CodexDeep model");
    await model.click();
    await search.fill("no-such-model");
    await expect(page.getByText('No models match “no-such-model”.')).toBeVisible();
    await search.press("Escape");
    await expect(model).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Choose a model" })).toHaveCount(0);
    await page.route("**/api/providers/codex/models", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Runtime unavailable" }) }));
    await model.click();
    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect(page.getByRole("alert")).toContainText("Runtime unavailable");
    await page.getByRole("group", { name: "Codex", exact: true }).getByRole("option", { name: "Custom model…", exact: true }).click();
    await page.getByRole("textbox", { name: "Custom model ID" }).fill("custom-model");
    await page.getByRole("textbox", { name: "Message the coding agent" }).fill("Report model selection");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Model custom-model, effort default.", { exact: true })).toBeVisible();
    await page.unroute("**/api/providers/codex/models");
    await model.click();
    await page.getByRole("button", { name: "Refresh models" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await search.press("Escape");
    await expect(page.getByRole("textbox", { name: "Custom model ID" })).toHaveValue("custom-model");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(model).toBeVisible();
    await model.click();
    await search.fill("claude");
    await expect(page.getByRole("option", { name: "Opus", exact: true })).toBeVisible();
    const popup = await page.getByRole("dialog", { name: "Choose a model" }).boundingBox();
    expect(popup!.y).toBeGreaterThanOrEqual(0);
    expect(popup!.x + popup!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("an unmodeled project opens with a question-led chat and optional overview", async ({
  page,
  request,
}) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-chat-empty-"));
  try {
    const project = await (
      await request.post("/api/projects", { data: { root } })
    ).json();
    await page.goto(`/p/${project.id}`);
    await page.getByRole("button", { name: "Open Chat", exact: true }).click();
    await expect(
      page.getByText("Ask about this project and build its model as you go.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Give me a small overview" }),
    ).toBeVisible();
    await expect(readFile(join(root, "lexicon/model.xml"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
