import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentState } from "../shared/agent-runtime";
import type { ModelItem } from "../shared/model";
import { workModelXml, workRequests } from "./fixtures/agent-work";
import { selectAgentOnCanvas } from "./fixtures/agent-ui";

test.use({ serviceWorkers: "block" });
const controls = (page: Page) => page.getByRole("group", { name: "Agent perspective", exact: true });
async function fixture(request: APIRequestContext) {
  const root = await mkdtemp(join(tmpdir(), "lexicon-agent-interaction-"));
  await mkdir(join(root, "lexicon")); await writeFile(join(root, "lexicon/model.xml"), workModelXml);
  await writeFile(join(root, "order.ts"), Array.from({ length: 100 }, (_, index) => index === 0 ? "export interface Order { id: string }" : index === 79 ? "export const draftEvidence = true;" : `// source line ${index + 1}`).join("\n"));
  await writeFile(join(root, "policy.ts"), "export function acceptOrder() { return true; }\n");
  await writeFile(join(root, "rules.md"), "# Order rules\n\n## Approval\n\nCheck every requested quantity.\n\n## Delivery\n\nShip accepted orders.\n");
  const project = await (await request.post("/api/projects", { data: { root } })).json();
  const agent = await (await request.post(`/api/projects/${project.id}/agents`, { data: { name: "Review interaction", contextIds: ["order"] } })).json();
  const endpoint = (action: string) => `/api/projects/${project.id}/agent/${action}?agent=${agent.id}`;
  const state = async () => await (await request.get(endpoint("state"))).json() as AgentState;
  const send = async (text: string) => {
    const model = await (await request.get(`/api/projects/${project.id}/model`)).json();
    expect((await request.post(endpoint("send"), { data: { text, modelRevision: model.modelRevision, instanceId: "codex", model: "test-model" } })).ok()).toBe(true);
    await expect.poll(async () => (await state()).running).toBe(false);
  };
  const dispose = async (page: Page) => { await page.goto("/"); await request.delete(`/api/projects/${project.id}`); await rm(root, { recursive: true, force: true }); };
  return { root, project, agent, endpoint, state, send, dispose };
}
async function open(page: Page, projectId: string) {
  await page.goto(`/p/${projectId}`);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await page.getByRole("radio", { name: "Combined", exact: true }).check();
  await selectAgentOnCanvas(page, "Review interaction");
  await page.getByRole("button", { name: "Fit model", exact: true }).click();
}
async function inspectOrder(page: Page) {
  await controls(page).getByRole("button", { name: /^Changes/ }).click();
  await controls(page).getByRole("button", { name: "Modified Order", exact: true }).click();
  return page.getByRole("dialog", { name: "Order change details", exact: true });
}

test("nonmodal change inspection accepts keyboard entry and returns focus to its control or canvas trigger", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await f.send(workRequests.sketch); await open(page, f.project.id);
    const changes = controls(page).getByRole("button", { name: /^Changes/ });
    await changes.focus(); await page.keyboard.press("Enter");
    await controls(page).getByRole("button", { name: "Modified Order", exact: true }).focus();
    await page.keyboard.press("Enter");
    const review = page.getByRole("dialog", { name: "Order change details", exact: true });
    await expect(review).toHaveAttribute("aria-modal", "false");
    await expect(review.locator("header > div")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(review.getByRole("button", { name: "Close inspection", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(review).toHaveCount(0); await expect(changes).toBeFocused();
    const footprint = page.locator('[data-agent-footprint="draft"][data-item-id="order"] button');
    await footprint.focus(); await page.keyboard.press("Enter");
    await expect(review.locator("header > div")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(footprint).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(review.locator("header > div")).toBeFocused();
    const draft = (await f.state()).work!.draft!;
    expect((await request.post(f.endpoint("draft-discard"), { data: { draftId: draft.id } })).ok()).toBe(true);
    await expect(review).toHaveCount(0);
    await expect(controls(page).getByRole("button", { name: "Conversation", exact: true })).toBeFocused();
    expect(await readFile(join(f.root, "lexicon/model.xml"), "utf8")).toBe(workModelXml);
  } finally { await f.dispose(page); }
});

test("draft evidence preserves declaration, line and heading through Source Reader history and reload", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    const model = await (await request.get(`/api/projects/${f.project.id}/model`)).json();
    const order = (model.model.items as ModelItem[]).find(item => item.id === "order")!;
    await f.send("APPLICATION TRIAL " + JSON.stringify([{ tool: "lexicon_patch", arguments: { patch: { upsert: [{ ...order, codeLinks: [
      { kind: "code", id: "draft-line", file: "order.ts", line: 80, role: "enforcement", description: "The exact rule implementation." },
      { kind: "document", id: "draft-heading", file: "rules.md", heading: "approval", role: "specification", description: "The acceptance rule." },
    ] }] } } }]));
    await open(page, f.project.id);
    const review = await inspectOrder(page);
    await review.locator(".agent-review-source-links > summary").click();
    const saved = review.getByRole("region", { name: "Saved source links", exact: true }).getByRole("button");
    const candidate = review.getByRole("region", { name: "Draft source links", exact: true });
    const reader = page.getByRole("complementary", { name: "Source Reader", exact: true });
    await saved.click();
    await expect(reader.locator(".source-controls")).toContainText("Declaration");
    await expect(reader.locator(".source-line.highlighted")).toContainText("export interface Order");
    await reader.locator(".source-reader-heading").focus(); await page.keyboard.press("Escape");
    await expect(saved).toBeFocused();
    const line = candidate.getByRole("button", { name: /order\.ts/ });
    await line.click();
    await expect(reader.locator(".source-controls")).toContainText("Line 80");
    await expect(reader.locator(".source-line.highlighted")).toContainText("draftEvidence");
    await reader.getByRole("button", { name: "Close Source Reader", exact: true }).click();
    await expect(line).toBeFocused();
    await candidate.getByRole("button", { name: /rules\.md/ }).click();
    await expect(reader.getByLabel("Document heading")).toHaveValue("approval");
    await expect(reader.locator(".document-selected-section")).toContainText("Check every requested quantity");
    await reader.getByRole("button", { name: "Previous source location", exact: true }).click();
    await expect(reader.locator(".source-controls")).toContainText("Line 80");
    await reader.getByRole("button", { name: "Next source location", exact: true }).click();
    await expect(reader.getByLabel("Document heading")).toHaveValue("approval");
    await page.reload();
    await expect(reader.getByLabel("Document heading")).toHaveValue("approval");
    const draft = (await f.state()).work!.draft!;
    expect((await request.post(f.endpoint("draft-discard"), { data: { draftId: draft.id } })).ok()).toBe(true);
    await page.reload();
    await expect(reader).toContainText("This model delta changed or is no longer available. Review the current overlay.");
    expect(await readFile(join(f.root, "lexicon/model.xml"), "utf8")).toBe(workModelXml);
  } finally { await f.dispose(page); }
});

test("a 390px canvas uses one readable review surface above agent navigation and canvas tools", async ({ page, request }) => {
  const f = await fixture(request);
  try {
    await f.send(workRequests.sketch); await open(page, f.project.id);
    const review = await inspectOrder(page);
    await mkdir("/tmp/lexicon-production-review", { recursive: true });
    await page.screenshot({ path: "/tmp/lexicon-production-review/wide-review.png", animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(review).toBeVisible(); await expect(controls(page)).toBeHidden();
    await expect(review.getByRole("button", { name: "Approve changes", exact: true })).toBeVisible();
    await expect(review.getByRole("button", { name: "Discard draft", exact: true })).toBeVisible();
    const bounds = await review.boundingBox(), hud = await page.locator(".agent-hud-summary").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(hud!.y - 4);
    expect(await review.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(review.locator(".agent-review-values").first()).toHaveCSS("grid-template-columns", /\d+(\.\d+)?px/);
    await expect(review.locator(".agent-review-values p").first()).toHaveCSS("font-size", "13px");
    await expect(review).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: "/tmp/lexicon-production-review/narrow-review.png", animations: "disabled" });
    await review.getByRole("button", { name: "Close inspection", exact: true }).click();
    await expect(controls(page)).toBeVisible();
    await expect(controls(page).getByRole("button", { name: /^Changes/ })).toBeFocused();
  } finally { await f.dispose(page); }
});
