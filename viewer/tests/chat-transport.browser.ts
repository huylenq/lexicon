import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.use({ serviceWorkers: "block" });

for (const disconnected of [false, true]) {
  test(`chat ${disconnected ? "recovers through snapshots when events fail" : "renders streamed text before completion"}`, async ({ page, request }) => {
    const root = await mkdtemp(join(tmpdir(), "lexicon-stream-"));
    try {
      const project = await (await request.post("/api/projects", { data: { root } })).json();
      if (disconnected) await page.route("**/chat/events", route => route.abort());
      await page.goto(`/p/${project.id}`);
      await page.getByRole("button", { name: "Open Chat", exact: true }).click();
      const chat = page.getByRole("complementary", { name: "Project conversation" });
      await expect(chat.getByRole("button", { name: "Choose provider and model" })).toContainText("Fast model");
      await chat.getByRole("textbox", { name: "Message the coding agent" }).fill("stream in stages");
      await chat.getByRole("button", { name: "Send", exact: true }).click();
      await expect(chat.locator(".chat-prose").last()).toHaveText("First streamed sentence.");
      await expect(chat.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
      await expect(chat.locator(".chat-prose").last()).toContainText("Second streamed sentence.");
      await expect(chat.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
      if (disconnected) {
        await page.unroute("**/chat/events");
        await expect(chat.locator(".chat-connection-dot")).not.toHaveClass(/offline/);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test("an empty HTTP error preserves the prompt and explains the server failure", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-empty-response-"));
  try {
    const project = await (await request.post("/api/projects", { data: { root } })).json();
    await page.route("**/chat/send", route => route.fulfill({ status: 502, body: "" }));
    await page.goto(`/p/${project.id}`);
    await page.getByRole("button", { name: "Open Chat", exact: true }).click();
    const chat = page.getByRole("complementary", { name: "Project conversation" });
    await expect(chat.getByRole("button", { name: "Choose provider and model" })).toContainText("Fast model");
    const input = chat.getByRole("textbox", { name: "Message the coding agent" });
    await input.fill("Explain orders");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.getByRole("alert")).toContainText("empty response (HTTP 502)");
    await expect(input).toHaveValue("Explain orders");
    await expect(chat.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  } finally { await rm(root, { recursive: true, force: true }); }
});
