import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyAgent, type AgentState } from "../shared/agent-runtime";
import { locateAgent } from "./fixtures/agent-ui";

test.use({ serviceWorkers: "block" });

const changes = [{ path: "calculate.ts", additions: 1, deletions: 1 }];
const codeDiff = "--- a/calculate.ts\n+++ b/calculate.ts\n@@ -1 +1 @@\n-export const calculate = () => 1;\n+export const calculate = () => 2;";

/** Projected-state fixture: backend diff calculation and activity filtering have separate tests. */
async function reviewFixture(page: Page, request: APIRequestContext) {
  const root = await mkdtemp(join(tmpdir(), "lexicon-review-browser-"));
  await mkdir(join(root, "lexicon"));
  await writeFile(join(root, "calculate.ts"), "export const calculate = () => 2;\n");
  await writeFile(join(root, "lexicon/model.xml"), '<lexicon schema="3.3" id="review"><name>Review Example</name><description>A code review fixture.</description><context id="arithmetic"><name>Arithmetic</name><description>Calculations.</description><concept id="calculation"><name>Calculation</name><description>A calculated result.</description><code-link kind="code" file="calculate.ts" symbol="calculate" role="implementation">Computes the result.</code-link></concept></context></lexicon>');
  const registration = await request.post("/api/projects", { data: { root } });
  expect(registration.ok()).toBe(true);
  const project = await registration.json();
  const creation = await request.post(`/api/projects/${project.id}/agents`, { data: { name: "Review code", contextIds: ["calculation"] } });
  expect(creation.ok()).toBe(true);
  let state: AgentState = {
    ...emptyAgent(), revision: 1, connected: true, scope: "code", checkpoint: 1, turnState: "completed",
    thread: { id: "review-thread", title: "Review code", branch: "main", workspace: root, instanceId: "codex", model: "test-model" },
    messages: [{ id: "explanation", role: "assistant", text: "The calculation returns the configured result. I have only inspected it.", streaming: false }],
    codeReview: { checkpoint: 1, status: "ready", hasChanges: false },
  };
  let diffRequests = 0;
  let diff = "";
  // Retain open listeners so updates exercise React's existing SSE subscription,
  // including invalidating an already visible diff without remounting the pane.
  await page.addInitScript(() => {
    const Native = window.EventSource;
    const FixtureSource = class extends EventTarget {
      private closed = false;
      private receive = (event: Event) => {
        if (!this.closed) this.dispatchEvent(new MessageEvent("state", { data: (event as CustomEvent<string>).detail }));
      };
      constructor(url: string | URL) {
        super();
        window.addEventListener("lexicon-review-state", this.receive);
        void fetch(url).then(response => response.text()).then(text => {
          if (!this.closed) this.dispatchEvent(new MessageEvent("state", { data: text.split("data: ")[1].trim() }));
        });
      }
      close() { this.closed = true; window.removeEventListener("lexicon-review-state", this.receive); }
    };
    window.EventSource = function(url: string | URL, options?: EventSourceInit) {
      return String(url).includes("/agent/events") ? new FixtureSource(url) : new Native(url, options);
    } as unknown as typeof EventSource;
  });
  await page.route("**/api/settings", route => route.fulfill({ json: {
    revision: 1, connections: { t3: { configured: true, connected: true, url: "http://127.0.0.1:5733", label: "Fixture T3", models: [{ instanceId: "codex", provider: "Codex", id: "test-model", name: "Test model", modelOnly: true }] } },
  } }));
  await page.route(`**/api/projects/${project.id}/agent/**`, async route => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    if (action === "events") return route.fulfill({ contentType: "text/event-stream", body: `event: state\ndata: ${JSON.stringify({ kind: "snapshot", state })}\n\n` });
    if (action === "sessions") return route.fulfill({ json: [{ id: "review-thread", title: "Review code", active: 1 }] });
    if (action === "diff") { diffRequests++; return route.fulfill({ json: { checkpoint: state.checkpoint, diff } }); }
    if (action === "state") return route.fulfill({ json: state });
    return route.fulfill({ status: 400, json: { error: `Unexpected review fixture action: ${action}` } });
  });
  return {
    project, root,
    diffRequests: () => diffRequests,
    setDiff: (value: string) => { diff = value; },
    push: async (next: Partial<AgentState>) => {
      state = { ...state, ...next, revision: state.revision + 1 };
      await page.evaluate(value => window.dispatchEvent(new CustomEvent("lexicon-review-state", { detail: JSON.stringify({ kind: "snapshot", state: value }) })), state);
    },
    dispose: async () => {
      await page.goto("/").catch(() => {});
      await request.delete(`/api/projects/${project.id}`).catch(() => {});
      await rm(root, { recursive: true, force: true });
    },
  };
}

for (const viewport of [{ name: "desktop", width: 1600, height: 1000 }, { name: "narrow", width: 390, height: 844 }]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: 1600, height: 1000 } });
    test("code review reflects cumulative edits, uncertainty, and reverts while activity keeps a neutral heading", async ({ page, request }, testInfo) => {
      const f = await reviewFixture(page, request);
      try {
        await page.goto(`/p/${f.project.id}?item=calculation`);
        await locateAgent(page, "Review code");
        const pane = page.locator("#chat-pane");
        if (viewport.name === "narrow") {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await locateAgent(page, "Review code");
        }
        await expect(pane).toContainText("I have only inspected it.");
        const review = pane.getByRole("button", { name: "Review changes", exact: true });
        const diffView = pane.getByRole("region", { name: "Implementation changes", exact: true });

        // A completed/captured checkpoint alone is not evidence of source edits.
        await expect(review).toHaveCount(0);
        await expect(pane.locator(".implementation-changes")).toHaveCount(0);
        await expect(pane.getByText(/Completed turn \d/)).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath(`inspection-only-${viewport.name}.png`) });

        f.setDiff(codeDiff);
        await f.push({ checkpoint: 2, changes, codeReview: { checkpoint: 2, status: "ready", hasChanges: true } });
        await expect(review).toBeVisible();
        await expect(pane.getByRole("button", { name: "calculate.ts +1 −1", exact: true })).toBeVisible();
        await review.click();
        await expect(diffView).toContainText("+export const calculate = () => 2;");
        expect(f.diffRequests()).toBe(1);

        // A later explanatory turn leaves the earlier net edit reviewable.
        await f.push({ checkpoint: 3, changes, codeReview: { checkpoint: 3, status: "ready", hasChanges: true }, messages: [
          { id: "no-op-follow-up", role: "assistant", text: "The earlier edit still applies. This follow-up only explains it.", streaming: false },
        ] });
        await expect(pane).toContainText("This follow-up only explains it.");
        await expect(review).toBeVisible();
        await expect(pane.getByText("Completed turn 3", { exact: true })).toBeVisible();
        await review.click();
        await expect(diffView).toContainText("Changes through turn 3");

        // Reconciliation may discover a revert at the same checkpoint. It must
        // dismiss the stale open diff as well as remove the review affordance.
        f.setDiff("");
        await f.push({ changes: [], codeReview: { checkpoint: 3, status: "ready", hasChanges: false } });
        await expect(review).toHaveCount(0);
        await expect(diffView).toHaveCount(0);
        await expect(pane.getByText(/Completed turn \d/)).toHaveCount(0);

        await f.push({ checkpoint: 4, changes: [], codeReview: { checkpoint: 4, status: "loading" } });
        await expect(review).toHaveCount(0);
        await expect(pane.getByText(/No code changes/i)).toHaveCount(0);
        await f.push({ codeReview: { checkpoint: 4, status: "error", error: "Checkpoint diff is temporarily unavailable." } });
        const retry = pane.getByRole("button", { name: "Retry code review", exact: true });
        await expect(retry).toBeVisible();
        await expect(pane).toContainText("Could not check code changes.");
        await expect(pane.getByText(/No code changes/i)).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath(`review-unavailable-${viewport.name}.png`) });
        f.setDiff(codeDiff);
        await retry.click();
        await expect.poll(f.diffRequests).toBe(3);
        await f.push({ changes, codeReview: { checkpoint: 4, status: "ready", hasChanges: true } });
        await expect(retry).toHaveCount(0);
        await expect(review).toBeVisible();
        await expect(diffView).toContainText("Changes through turn 4");
        await pane.getByRole("button", { name: "Close diff", exact: true }).click();

        // This legacy/latest-title row guards only heading selection. New
        // transport projections filter successful housekeeping independently.
        await f.push({ running: true, activities: [
          { id: "inspection", title: "Read calculate.ts", kind: "tool", detail: "Inspected the current calculation.", error: false },
          { id: "legacy-checkpoint", title: "Checkpoint captured", kind: "checkpoint", detail: "Historical activity.", error: false },
        ] });
        const activity = pane.locator(".chat-tool-group");
        await expect(activity.locator(":scope > summary")).toHaveText("Activity 2");
        await expect(activity.locator(":scope > summary")).not.toContainText("Checkpoint captured");
        await f.push({ activities: [
          { id: "inspection", title: "Read calculate.ts", kind: "tool", detail: "Inspected the current calculation.", error: false },
          { id: "test-error", title: "Run calculation checks — failed", kind: "tool", detail: "TypeError: The supplied quantity is undefined.\ncalculate.ts:12\nThe check did not pass.", error: true },
        ] });
        const failure = activity.locator(".tool-error");
        await failure.locator("summary").click();
        await expect(failure.locator("pre")).toContainText("The supplied quantity is undefined.");
        await expect(failure.locator("pre")).toContainText("calculate.ts:12");
        await expect(activity.locator(":scope > summary")).toHaveText("Activity 2");
        await expect(pane.getByRole("textbox", { name: "Message the agent" })).toBeVisible();
        const bounds = (await pane.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`activity-and-review-${viewport.name}.png`) });

        // The same code review is available beside the canvas, with its authored
        // model connection visible and without reopening the conversation.
        await f.push({ running: false });
        await pane.getByRole("button", { name: "Minimize agent", exact: true }).click();
        const controls = page.getByRole("group", { name: "Agent perspective", exact: true });
        await controls.getByRole("button", { name: "Code 1", exact: true }).click();
        await controls.getByRole("button", { name: /^calculate.ts/ }).click();
        const localCode = page.getByRole("dialog", { name: "calculate.ts code changes", exact: true });
        await expect(localCode).toContainText("+export const calculate = () => 2;");
        await expect(localCode).toContainText("Linked to Calculation.");
        await expect(pane).toBeHidden();
        const codeBounds = (await localCode.boundingBox())!;
        expect(codeBounds.x).toBeGreaterThanOrEqual(0);
        expect(codeBounds.x + codeBounds.width).toBeLessThanOrEqual(viewport.width + 1);
        await page.screenshot({ path: testInfo.outputPath(`canvas-code-review-${viewport.name}.png`) });
        await localCode.getByRole("button", { name: "Open source", exact: true }).click();
        await expect(page).toHaveURL(/code=repository/);
      } finally { await f.dispose(); }
    });
  });
}
