import { openAgentConversation, prepareAgent } from "./fixtures/agent-ui";
import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.use({ serviceWorkers: "block" });

test("an empty HTTP error preserves the prompt and explains the server failure", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-empty-response-"));
  try {
    const project = await (await request.post("/api/projects", { data: { root } })).json();
    await page.route("**/agent/send?*", route => route.fulfill({ status: 502, body: "" }));
    await page.goto(`/p/${project.id}`);
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    const chat = page.locator("#chat-pane");
    await expect(chat.getByRole("combobox", { name: "Agent model" })).toContainText("Test model");
    const input = chat.getByRole("textbox", { name: "Message the agent" });
    await input.fill("Explain orders");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.getByRole("alert")).toContainText("empty response (HTTP 502)");
    await expect(input).toHaveValue("Explain orders");
    await expect(chat.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a failed event stream recovers the completed task through snapshots", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-snapshot-response-"));
  let id = "";
  try {
    id = (await (await request.post("/api/projects", { data: { root } })).json()).id;
    await page.route("**/agent/events?*", route => route.abort());
    await page.goto(`/p/${id}`);
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    const chat = page.locator("#chat-pane");
    await expect(chat.getByRole("combobox", { name: "Agent model" })).not.toHaveValue("");
    await chat.getByRole("textbox", { name: "Message the agent" }).fill("Explain orders");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.locator(".chat-message-body").last()).toContainText("An order records a purchase", { timeout: 15000 });
    await expect(chat.getByRole("button", { name: "Send", exact: true })).toBeVisible();
    await expect(chat.getByText("Ready for a follow-up")).toHaveCount(0);
  } finally {
    await page.goto("/");
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
