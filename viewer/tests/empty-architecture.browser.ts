import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("childless systems and containers fit centered cards while parents retain boundaries", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-empty-architecture-"));
  let id: string | undefined;
  try {
    await mkdir(join(root, "lexicon"));
    await writeFile(join(root, "lexicon/model.xml"), `<lexicon schema="3.3" id="empty-architecture">
      <name>Architecture</name><description>Leaf sizing</description>
      <system id="external"><name>External</name><description>Empty system</description></system>
      <system id="parent"><name>Parent</name><description>Parent system</description>
        <container id="leaf"><name>Leaf</name><description>Empty container</description></container>
        <container id="nested"><name>Nested</name><description>Parent container</description>
          <component id="child"><name>Child</name><description>Component</description></component>
        </container>
      </system>
    </lexicon>`);
    const response = await request.post("/api/projects", { data: { root } });
    expect(response.ok()).toBe(true);
    id = (await response.json()).id;
    await page.goto(`/p/${id}`);
    await expect(page.locator('.canvas-stage[data-ready="true"]')).toBeVisible();
    await page.getByRole("radio", { name: "Architecture", exact: true }).check();
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      for (const name of ["external", "leaf", "child"]) {
        const card = page.locator(`.canvas-object[data-model-id="item:${name}"]`);
        await expect(card).toHaveClass(/canvas-card/);
        const geometry = await card.evaluate(element => {
          const card = element.getBoundingClientRect();
          const heading = element.querySelector(".canvas-object-heading")!.getBoundingClientRect();
          return { height: parseFloat((element as HTMLElement).style.height), offset: Math.abs((heading.top + heading.bottom - card.top - card.bottom) / 2) / card.height };
        });
        expect(geometry.height).toBeLessThan(60);
        expect(geometry.offset).toBeLessThan(0.1);
      }
      for (const name of ["parent", "nested"])
        await expect(page.locator(`.canvas-object[data-model-id="item:${name}"]`)).toHaveAttribute("data-context-boundary", "rectangle");
    }
  } finally {
    if (id) await request.delete(`/api/projects/${id}`);
    await rm(root, { recursive: true, force: true });
  }
});
