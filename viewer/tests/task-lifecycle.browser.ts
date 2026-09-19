import { openAgentConversation } from "./fixtures/agent-ui";
import { expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("closing the last draft leaves no widget; settled and archived tasks resume their T3 history", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-lifecycle-browser-"));
  let projectId = "";
  try {
    projectId = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.goto(`/p/${projectId}`);
    await expect(page.locator(".agent-session-button")).toHaveCount(0);
    const newAgent = page.getByRole("button", { name: "New agent", exact: true });
    const menu = page.getByRole("dialog", { name: "New agent", exact: true });
    await newAgent.click();
    await menu.getByRole("button", { name: "Start agent" }).click();
    const pane = page.locator("#chat-pane");
    await pane.getByLabel("Message the agent").fill("Unsent draft");
    await pane.getByRole("button", { name: "Minimize agent" }).click();
    await expect(page.locator(".agent-session-button")).toHaveCount(1);
    await page.locator(".agent-hud-summary").click();
    await page.locator(".agent-session-button").click();
    await openAgentConversation(page);
    await expect(pane.getByLabel("Message the agent")).toHaveValue("Unsent draft");
    await pane.getByRole("button", { name: "Task details", exact: true }).click();
    await pane.getByRole("button", { name: "Discard task" }).click();
    await expect(page.locator(".agent-session-button")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".agent-session-button")).toHaveCount(0);
    await newAgent.click();
    await menu.getByRole("button", { name: "Start agent" }).click();
    await pane.getByLabel("Message the agent").fill("Explain this task");
    await pane.getByRole("button", { name: "Send", exact: true }).click();
    await expect(pane.locator(".chat-message-body").last()).toContainText("An order records a purchase");
    const agentId = await page.locator(".agent-session-button").getAttribute("data-agent-id");
    await pane.getByRole("button", { name: "Mark settled", exact: true }).click();
    await expect(page.locator(".agent-session-button")).toHaveCount(0);
    await newAgent.click();
    await expect(menu.getByText("Settled", { exact: true })).toBeVisible();
    await menu.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(page.locator(".agent-session-button")).toHaveAttribute("data-agent-id", agentId!);
    await expect(pane.locator(".chat-message-body").last()).toContainText("An order records a purchase");
    await pane.getByRole("button", { name: "Task details", exact: true }).click();
    await pane.getByRole("button", { name: "Archive task" }).click();
    await expect(page.locator(".agent-session-button")).toHaveCount(0);
    await newAgent.click();
    await expect(menu.getByText("Archived", { exact: true })).toBeVisible();
    await menu.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.locator(".agent-session-button")).toHaveAttribute("data-agent-id", agentId!);
    await expect(pane.locator(".chat-message-body").last()).toContainText("An order records a purchase");
  } finally {
    await page.goto("/");
    if (projectId) await request.delete(`/api/projects/${projectId}`);
    await rm(root, { recursive: true, force: true });
  }
});
