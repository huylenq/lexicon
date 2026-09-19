import { locateAgent, openAgentConversation, prepareAgent } from "./fixtures/agent-ui";
import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyAgent, type AgentState } from "../shared/agent-runtime";

test.use({ serviceWorkers: "block" });
test("code scope handles requests, reviews changes, and resumes after reload", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-implement-browser-"));
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "sum.ts"), "export function sum(a: number, b: number) { return a + b; }\n");
    await writeFile(join(root, "lexicon/model.xml"), '<lexicon schema="3.3" id="math"><name>Math</name><description>Arithmetic.</description><context id="arithmetic"><name>Arithmetic</name><description>Operations.</description><concept id="addition"><name>Addition</name><description>Add numbers.</description><code-link kind="code" file="sum.ts" symbol="sum" role="implementation">Adds.</code-link></concept></context></lexicon>');
    const project = await (await request.post("/api/projects", { data: { root } })).json();
    let state: AgentState = { ...emptyAgent(), connected: true, scope: "code" };
    let active = false;
    const sent: Record<string, unknown>[] = [];
    // Keep the fixture stream open after its snapshot, like the real SSE route.
    await page.addInitScript(() => {
      const Native = window.EventSource;
      const FixtureSource = class extends EventTarget {
        private closed = false;
        constructor(url: string | URL, options?: EventSourceInit) {
          super();
          void fetch(url).then(response => response.text()).then(text => {
            if (!this.closed) this.dispatchEvent(new MessageEvent("state", { data: text.split("data: ")[1].trim() }));
          });
        }
        close() { this.closed = true; }
      };
      window.EventSource = function(url: string | URL, options?: EventSourceInit) {
        return String(url).includes("/agent/events") ? new FixtureSource(url, options) : new Native(url, options);
      } as unknown as typeof EventSource;
    });
    await page.route("**/api/settings", route => route.fulfill({ json: { revision: 1, connections: { t3: { configured: true, connected: true, url: "http://127.0.0.1:5733", label: "Test T3", models: [{ instanceId: "codex", provider: "Codex", id: "test-model", name: "Test model", modelOnly: true }] } } } }));
    await page.route(`**/api/projects/${project.id}/agent/**`, async route => {
      const path = new URL(route.request().url()).pathname.split("/").at(-1);
      if (path === "state") return route.fulfill({ json: state });
      if (path === "events") return route.fulfill({ contentType: "text/event-stream", body: `event: state\ndata: ${JSON.stringify({ kind: "snapshot", state })}\n\n` });
      if (path === "sessions") return route.fulfill({ json: active ? [{ id: "thread-1", title: "Fix addition", active: 1 }] : [] });
      if (path === "diff") return route.fulfill({ json: { checkpoint: 1, diff: "--- a/sum.ts\n+++ b/sum.ts\n-return a - b;\n+return a + b;" } });
      const body = route.request().postDataJSON();
      sent.push({ action: path, ...body });
      if (path === "scope") state = { ...state, scope: body.scope };
      if (path === "send") {
        active = true;
        state = { ...state, revision: state.revision + 1, running: true, thread: { id: "thread-1", title: "Fix addition", branch: "main", workspace: root, instanceId: "codex", model: "test-model" }, messages: [{ id: "request-1", role: "user", text: body.text, streaming: false, context: { id: "addition", type: "concept", name: "Addition", codeLinks: [] } }], activities: [{ id: "read", title: "Read sum.ts", kind: "tool", detail: "return a - b", error: false }], approvals: [{ id: "approval-1", detail: "Run arithmetic checks", options: [{ decision: "accept", label: "Allow once" }, { decision: "decline", label: "Decline" }] }] };
      }
      if (path === "approve") state = { ...state, approvals: [], questions: [{ id: "question-1", dismissible: false, questions: [{ id: "scope", text: "Which checks?", options: [{ label: "Unit" }, { label: "Integration" }], multiple: true, custom: false }] }] };
      if (path === "answer") state = { ...state, questions: [], running: false, checkpoint: 1, changes: [{ path: "sum.ts", additions: 1, deletions: 1 }], messages: [...state.messages, { id: "reply", role: "assistant", text: "Addition fixed. Arithmetic checks passed.", streaming: false }] };
      if (path === "stop") state = { ...state, running: false, approvals: [] };
      state = { ...state, revision: state.revision + 1 };
      return route.fulfill({ json: state });
    });
    await page.goto(`/p/${project.id}?item=addition`);
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    const pane = page.locator("#chat-pane");
    const groom = pane.getByRole("textbox", { name: "Message the agent" });
    await groom.fill("Explain addition");
    await pane.getByLabel("Editing scope").selectOption("code");
    const input = pane.getByRole("textbox", { name: "Message the agent" });
    await expect(input).toBeFocused();
    await expect(pane.getByRole("combobox", { name: "Agent model" })).toContainText("Test model");
    await input.fill("Fix addition");
    await input.press("Enter");
    await expect(pane.getByText("Run arithmetic checks", { exact: true })).toBeVisible();
    expect(sent.find(value => value.action === "send")).toMatchObject({ action: "send", text: "Fix addition", contextId: "addition", instanceId: "codex" });
    await pane.getByRole("button", { name: "Allow once", exact: true }).click();
    await pane.getByRole("button", { name: "Unit", exact: true }).click();
    await pane.getByRole("button", { name: "Integration", exact: true }).click();
    await pane.getByRole("button", { name: "Continue", exact: true }).click();
    expect(sent.at(-1)).toMatchObject({ action: "answer", answers: { scope: ["Unit", "Integration"] } });
    await expect(pane.getByText("Addition fixed. Arithmetic checks passed.", { exact: true })).toBeVisible();
    await pane.getByRole("button", { name: "Review changes", exact: true }).click();
    await expect(pane.getByRole("region", { name: "Implementation changes" })).toContainText("+return a + b;");
    await pane.getByRole("button", { name: "sum.ts +1 −1", exact: true }).click();
    await expect(page).toHaveURL(/code=repository/);

    await expect(pane.getByText("Addition fixed. Arithmetic checks passed.", { exact: true })).toBeVisible();
    await page.reload();
    await (await prepareAgent(page)).click();
    await openAgentConversation(page);
    await expect(pane.getByText("Addition fixed. Arithmetic checks passed.", { exact: true })).toBeVisible();
    await input.fill("Check once more");
    await pane.getByRole("button", { name: "Send" }).click();
    await pane.getByRole("button", { name: "Stop" }).click();
    expect(sent.at(-1)?.action).toBe("stop");
    await page.setViewportSize({ width: 390, height: 844 });
    // This transport fixture bypasses the server's automatic task rename.
    await locateAgent(page, "New task");
    await expect(input).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/lexicon-implementation-evidence/implement-mobile.png" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
