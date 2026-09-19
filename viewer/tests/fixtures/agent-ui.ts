import { expect, type Page } from "@playwright/test";

/** Tasks are created explicitly; opening a project never creates one. */
export async function prepareAgent(page: Page) {
  const projectId = new URL(page.url()).pathname.split("/")[2];
  if (!projectId) throw new Error("Open a project before preparing an agent");
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/agents`;
  const response = await page.request.get(endpoint);
  expect(response.ok()).toBe(true);
  const tasks = await response.json() as { id: string; name: string; lifecycle?: string }[];
  let task = tasks.find(task => task.name === "New task" && (!task.lifecycle || task.lifecycle === "active"));
  if (!task) {
    const created = await page.request.post(endpoint, { data: {} });
    expect(created.ok()).toBe(true);
    task = await created.json();
  }
  const hud = page.locator(".agent-hud-summary");
  if (await hud.getAttribute("aria-expanded") !== "true") await hud.click();
  const button = page.locator(`.agent-session-button[data-agent-id="${task!.id}"]`);
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  await openAgentConversation(page);
  await page.getByRole("button", { name: "Minimize agent", exact: true }).click();
  if (await page.locator(".canvas-agent-markers").count()) return page.locator(`.agent-canvas-card[data-agent-id="${task!.id}"]`);
  if (await hud.getAttribute("aria-expanded") !== "true") await hud.click();
  return button;
}

/** Conversation remains an explicit action separate from selecting a canvas agent. */
export async function openAgentConversation(page: Page) {
  if (await page.locator("#chat-pane").isVisible()) return;
  await page.getByRole("group", { name: "Agent perspective", exact: true }).getByRole("button", { name: "Conversation", exact: true }).click();
  await expect(page.locator("#chat-pane")).toBeVisible();
}

/** Explicit navigation is required when a card leaves the viewport or active plane. */
export async function selectAgentOnCanvas(page: Page, name: string, agentId?: string) {
  const hud = page.locator(".agent-hud-summary");
  if (await hud.getAttribute("aria-expanded") !== "true") await hud.click();
  const task = agentId ? page.locator(`.agent-roster [data-agent-id="${agentId}"]`) : page.locator(".agent-roster").getByRole("button", { name, exact: true });
  await task.click();
  // A fresh viewer can reveal the conversation before its canvas surface publishes.
  if (await page.locator("#chat-pane").isVisible()) await page.locator("#chat-pane").getByRole("button", { name: "Minimize agent", exact: true }).click();
  try { await expect(page.getByRole("group", { name: "Agent perspective", exact: true })).toBeVisible(); }
  catch (error) {
    console.log("Agent locate geometry", JSON.stringify(await page.evaluate(() => ({
      surfaces: [...document.querySelectorAll(".agent-canvas-card, .canvas-agent-markers, .canvas-toolbar, .tl-camera, #chat-pane")].map(element => ({
        className: element.className, style: element.getAttribute("style"), bounds: element.getBoundingClientRect().toJSON(),
      })),
      placements: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith("lexicon.agent.placements.")).map(key => [key, localStorage.getItem(key)])),
    })), null, 2));
    throw error;
  }
}

/** Reach a task from the HUD, then explicitly open its conversation. */
export async function locateAgent(page: Page, name: string, agentId?: string) {
  await selectAgentOnCanvas(page, name, agentId);
  await openAgentConversation(page);
}
