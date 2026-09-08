import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator("[data-reader-card]");
const keys = (page: Page) => cards(page).evaluateAll(es => es.map(e => e.getAttribute("data-reader-card")));
const card = (page: Page, id: string) => page.locator(`[data-reader-card="${id}"]`);
const browse = async (page: Page, name: string) => {
  await page.locator(".sidebar .nav-item").filter({ hasText: new RegExp(`^${name}$`) }).click();
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
};
const active = (page: Page) => page.locator("[data-reader-card].active");
const scroll = (page: Page) => page.locator("main").evaluate(el => el.scrollTop);

test("Back interrupts reader travel without overwriting the restored position", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path", "Reference point"]) await browse(page, name);
  const position = await scroll(page);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Selected tooth$/ }).click();
  await expect(page.locator("main")).toHaveAttribute("data-reader-travel", "scroll");
  await page.goBack();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
  await page.waitForTimeout(800);
  expect(await scroll(page)).toBe(position);
  expect(await page.evaluate(() => history.state.usr.readerStack.scrollTop)).toBe(position);
});

test("expanded settled morph controls remain interactive", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  await card(page, "item:tooth-input").evaluate(el => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + 190;
  });
  const morph = page.locator('[data-bottom-morph-card="item:tooth-input"]');
  await expect(morph.locator(".reader-morph-body")).toHaveAttribute("data-expanded", "true");
  const locate = morph.getByRole("button", { name: "Locate in graph", exact: true });
  await expect(locate).toHaveCSS("pointer-events", "auto");
  await locate.click();
  await expect(page.locator(".react-flow__node.selected").first()).toBeVisible();
});

test("a scroll pause away from morph boundaries does not start a settling loop", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  await expect(card(page, "item:selected-tooth")).toBeVisible();
  await page.waitForTimeout(600);
  const reads = await page.locator("main").evaluate(async main => {
    main.scrollTop = 20;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const card = main.querySelector<HTMLElement>("[data-reader-card]")!;
    const original = card.getBoundingClientRect;
    let reads = 0;
    card.getBoundingClientRect = function () { reads++; return original.call(this); };
    try { await new Promise(resolve => setTimeout(resolve, 450)); }
    finally { card.getBoundingClientRect = original; }
    return reads;
  });
  expect(reads).toBe(0);
});

test("reader navigation scrolls at any distance without fading and yields to scrolling", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  await browse(page, "Tooth input");
  const main = page.locator("main");
  const origin = await scroll(page);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Selected tooth$/ }).click();
  await expect(main).toHaveAttribute("data-reader-travel", "scroll");
  await expect.poll(() => scroll(page)).toBeLessThan(origin);
  await main.dispatchEvent("wheel", { deltaY: 1 });
  await expect(main).not.toHaveAttribute("data-reader-travel", /./);
  const interrupted = await scroll(page);
  await page.waitForTimeout(500);
  expect(await scroll(page)).toBe(interrupted);
  for (const name of ["Canal index", "Measurement path", "Reference point"]) await browse(page, name);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Selected tooth$/ }).click();
  await expect(main).toHaveAttribute("data-reader-travel", "scroll");
  const opacities = await main.evaluate(async el => {
    const values: string[] = [];
    do {
      values.push(getComputedStyle(el).opacity);
      await new Promise(requestAnimationFrame);
    } while ((el as HTMLElement).dataset.readerTravel);
    return values;
  });
  expect(opacities.length).toBeGreaterThan(1);
  expect(opacities.every(value => value === "1")).toBe(true);
  await expect(main).not.toHaveAttribute("data-reader-travel", /./);
  await expect(main).toHaveCSS("opacity", "1");
  await expect(card(page, "item:selected-tooth").locator(":scope > header")).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await browse(page, "Reference point");
  await expect(main).not.toHaveAttribute("data-reader-travel", /./);
});

test("pause settling finishes both edge morphs without scrolling the reading text", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  for (const [side, pixels, target] of [["top", 80, 1], ["top", 150, 0], ["bottom", 110, 1], ["bottom", 190, 0]] as const) {
    const key = side === "top" ? "item:selected-tooth" : "item:tooth-input";
    await card(page, key).evaluate((el, { side, pixels }) => {
      const main = el.closest("main")!;
      main.scrollTop = side === "top" ? (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight - pixels
        : (el as HTMLElement).offsetTop - main.clientHeight + pixels;
    }, { side, pixels });
    const morph = page.locator(side === "top" ? `[data-morph-card="${key}"]` : `[data-bottom-morph-card="${key}"]`);
    await expect(morph).toBeVisible();
    const position = await scroll(page);
    const readingBody = card(page, side === "top" ? "item:tooth-input" : "item:selected-tooth").locator(".reader-card-body");
    const y = (await readingBody.boundingBox())!.y;
    await expect.poll(() => morph.evaluate(el => Number((el as HTMLElement).style.getPropertyValue("--morph-progress")))).toBe(target);
    expect(await scroll(page)).toBe(position);
    expect((await readingBody.boundingBox())!.y).toBe(y);
  }
});

test("Browse navigation lands on the expanded card with the preceding edge settled", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path"]) await browse(page, name);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:measurement-path");
  await expect(active(page)).not.toHaveClass(/reader-card-morphing/);
  await expect(active(page).locator(":scope > header")).toBeInViewport();
  const top = page.locator("[data-morph-card]");
  if (await top.count()) {
    await expect.poll(() => top.evaluate(el => Number((el as HTMLElement).style.getPropertyValue("--morph-progress")))).toBe(1);
  }
});

test("bottom row handoff keeps existing tiles still when a new row forms", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path", "Reference point"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  const setVisible = (visible: number) => card(page, "item:tooth-input").evaluate((el, visible) => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + visible;
  }, visible);
  await setVisible(220);
  const tile = page.locator('[data-bottom-card="item:reference-point"]');
  await expect(tile).toBeVisible();
  await tile.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const initialY = (await tile.boundingBox())!.y;
  for (const visible of [205, 220, 205]) {
    await setVisible(visible);
    const positions = await tile.evaluate(async el => {
      const positions: number[] = [];
      for (let frame = 0; frame < 8; frame++) {
        await new Promise(requestAnimationFrame);
        positions.push(el.getBoundingClientRect().y);
      }
      return positions;
    });
    expect(positions.every(y => Math.abs(y - initialY) < 1)).toBe(true);
  }
});

test("bottom morph keeps its whole surface above the occupied rows", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path", "Reference point"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  const forming = page.locator('[data-bottom-morph-card="item:tooth-input"]');
  for (const visible of [190, 160, 120, 80, 30, 80, 160, 190]) {
    await card(page, "item:tooth-input").evaluate((el, pixels) => {
      const main = el.closest("main")!;
      main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + pixels;
    }, visible);
    await expect(forming).toBeVisible();
    await expect.poll(async () => {
      const box = (await forming.boundingBox())!;
      const tiles = await page.locator("[data-bottom-card]").evaluateAll(es => es.map(el => el.getBoundingClientRect().top));
      return Math.min(...tiles) - box.y - box.height;
    }).toBeGreaterThanOrEqual(7);
  }
});

test("overflowing card fades over 24 pixels above the bottom tile gap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path"]) await browse(page, name);
  await page.locator("main").evaluate(el => { el.scrollTop = 0; });
  await expect(page.locator("[data-clipped-bottom]")).toHaveCount(1);
  const clipped = page.locator("[data-clipped-bottom]");
  await expect(clipped).toHaveCSS("mask-image", /^linear-gradient\(/);
  await expect(clipped).toHaveCSS("clip-path", "none");
  await expect(page.locator(".reader-bottom-titles .reader-collapsed-grid")).toBeVisible();
  const gap = await clipped.evaluate(el => {
    const amount = parseFloat((el as HTMLElement).style.getPropertyValue("--bottom-fade-end"));
    const edge = el.getBoundingClientRect().top + amount;
    const grid = document.querySelector(".reader-bottom-titles .reader-collapsed-grid")!;
    return grid.getBoundingClientRect().top - edge;
  });
  expect(gap).toBeCloseTo(12, 0);
  const stops = await clipped.evaluate(el => getComputedStyle(el).maskImage.match(/[\d.]+px/g)!.map(parseFloat));
  expect(stops[1] - stops[0]).toBe(24);
});

test("bottom morph follows reverse scrolling and hands off to the bottom tile", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  await browse(page, "Tooth input");
  const second = card(page, "item:tooth-input");
  const show = (pixels: number) => second.evaluate((el, pixels) => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + pixels;
  }, pixels);
  // Use a shorter viewport so the second card can be entirely below it.
  await page.setViewportSize({ width: 1600, height: 700 });
  const morph = page.locator('[data-bottom-morph-card="item:tooth-input"]');
  await show(120);
  await expect(morph).toBeVisible();
  const width = (await morph.boundingBox())!.width;
  const initialBodyHeight = (await morph.locator(".reader-morph-body").boundingBox())!.height;
  await show(80);
  await expect.poll(() => morph.locator(".reader-card-body").evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0);
  const seam = await morph.evaluate(el => {
    const header = el.querySelector(":scope > header")!.getBoundingClientRect();
    return el.querySelector(".reader-morph-body")!.getBoundingClientRect().top - header.bottom;
  });
  expect(seam).toBeCloseTo(0, 0);
  await show(30);
  await expect.poll(async () => (await morph.boundingBox())!.width).toBeLessThan(width);
  await expect.poll(async () => (await morph.locator(".reader-morph-body").boundingBox())!.height).toBeLessThan(initialBodyHeight);
  await expect.poll(() => morph.locator(".reader-card-body").evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.15);
  await show(120);
  await expect.poll(async () => (await morph.boundingBox())!.width).toBeGreaterThanOrEqual(width - 1);
  await expect.poll(async () => (await morph.locator(".reader-morph-body").boundingBox())!.height).toBeGreaterThanOrEqual(initialBodyHeight - 1);
  await show(-1);
  await expect(morph).toHaveCount(0);
  await expect(page.locator('[data-bottom-card="item:tooth-input"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await show(80);
  await expect(morph).toHaveCount(0);
});

test("bottom tiles reveal later cards and close only their own card", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path", "Reference point"]) await browse(page, name);
  await page.getByRole("button", { name: /^(Read|Reveal) card: Selected tooth$/ }).first().click();
  const bottom = page.getByRole("group", { name: "Collapsed cards below" });
  await expect(bottom).toBeVisible();
  const bottomKeys = await bottom.locator("[data-bottom-card]").evaluateAll(es => es.map(el => el.getAttribute("data-bottom-card")));
  expect(bottomKeys[0]).toBe("item:reference-point");
  expect(bottomKeys[1]).toBe("item:measurement-path");
  const positions = await bottom.locator("[data-bottom-card]").evaluateAll(es => es.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
  for (let index = 1; index < positions.length; index++) {
    const previous = positions[index - 1], current = positions[index];
    if (current.y === previous.y) expect(current.x).toBeLessThan(previous.x);
    else expect(current.y).toBeLessThan(previous.y);
  }
  expect((await bottom.boundingBox())!.height).toBeLessThanOrEqual((await page.locator("main").boundingBox())!.height / 4);
  await expect(bottom).toBeInViewport();
  await bottom.getByRole("button", { name: "Close collapsed Reference point", exact: true }).click();
  await expect(cards(page)).toHaveCount(4);
  await bottom.getByRole("button", { name: "Reveal card: Measurement path", exact: true }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:measurement-path");
  await expect(active(page).locator(":scope > header")).toBeInViewport();
  await expect(page.locator('[data-bottom-card="item:measurement-path"]')).toHaveCount(0);
});

test("header morph follows scroll progress and reverses before becoming a tile", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  await browse(page, "Tooth input");
  const first = card(page, "item:selected-tooth");
  const remaining = (pixels: number) => first.evaluate((el, pixels) => {
    el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight - pixels;
  }, pixels);
  const morph = page.locator('[data-morph-card="item:selected-tooth"]');
  await remaining(120);
  await expect(morph).toBeVisible();
  const opacity = () => morph.locator(".reader-card-body").evaluate(el => Number(getComputedStyle(el).opacity));
  await expect.poll(opacity).toBeGreaterThan(0);
  await expect.poll(opacity).toBeLessThan(1);
  const initialOpacity = await opacity();
  const initialWidth = (await morph.boundingBox())!.width;
  const initialBodyHeight = (await morph.locator(".reader-morph-body").boundingBox())!.height;
  const seam = await morph.evaluate(el => {
    const header = el.querySelector(":scope > header")!.getBoundingClientRect();
    return el.querySelector(".reader-morph-body")!.getBoundingClientRect().top - header.bottom;
  });
  expect(seam).toBeCloseTo(0, 0);
  await remaining(30);
  await expect.poll(async () => (await morph.boundingBox())!.width).toBeLessThan(initialWidth);
  await expect.poll(async () => (await morph.locator(".reader-morph-body").boundingBox())!.height).toBeLessThan(initialBodyHeight);
  await expect.poll(opacity).toBeLessThan(0.15);
  await expect.poll(async () => {
    const forming = (await morph.boundingBox())!;
    const following = (await card(page, "item:tooth-input").locator(":scope > header").boundingBox())!;
    return following.y - forming.y - forming.height;
  }).toBeGreaterThanOrEqual(11);
  await expect(page.locator('[data-collapsed-card="item:selected-tooth"]')).toHaveCount(0);
  await remaining(120);
  await expect.poll(async () => (await morph.boundingBox())!.width).toBeGreaterThanOrEqual(initialWidth - 1);
  await expect.poll(async () => (await morph.locator(".reader-morph-body").boundingBox())!.height).toBeGreaterThanOrEqual(initialBodyHeight - 1);
  await expect.poll(opacity).toBeGreaterThanOrEqual(initialOpacity - 0.01);
  await remaining(-1);
  await expect(morph).toHaveCount(0);
  await expect(page.locator('[data-collapsed-card="item:selected-tooth"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await remaining(80);
  await expect(morph).toHaveCount(0);
  await expect(first).toBeVisible();
});

test("a partly scrolled card retains its sticky header until its whole body passes", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  await browse(page, "Tooth input");
  const first = card(page, "item:selected-tooth");
  await page.locator("main").evaluate(el => { el.scrollTop = 180; });
  await expect(page.locator('[data-collapsed-card="item:selected-tooth"]')).toHaveCount(0);
  await expect.poll(async () => Math.abs((await first.locator(":scope > header").boundingBox())!.y - (await page.locator("main").boundingBox())!.y)).toBeLessThan(2);
  await first.evaluate(el => { el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight + 1; });
  await expect(page.locator('[data-collapsed-card="item:selected-tooth"]')).toBeVisible();
  await page.locator("main").evaluate(el => { el.scrollTop = 180; });
  await expect(page.locator('[data-collapsed-card="item:selected-tooth"]')).toHaveCount(0);
});

test("header breadcrumb follows the active card and navigates without replacing the stack", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  const breadcrumb = page.getByRole("navigation", { name: "Reader breadcrumb" });
  await expect(breadcrumb.locator("button")).toHaveText(["Canal measurement", "Tooth selection", "Selected tooth"]);
  await breadcrumb.getByRole("button", { name: "Tooth selection", exact: true }).click();
  expect(await keys(page)).toEqual(["item:selected-tooth", "item:selection"]);
  await page.getByRole("button", { name: /^(Read|Reveal) card: Selected tooth$/ }).first().click();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Selected tooth");
  await breadcrumb.getByRole("button", { name: "Tooth selection", exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.goBack();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Selected tooth");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(breadcrumb.locator('[aria-current="page"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("one stack appends from old cards, reveals duplicates, closes individually and restores history", async ({ page }) => {
  await page.goto("/p/dentalml?canvas=graph&item=selection");
  await browse(page, "Selected tooth");
  await browse(page, "Tooth input");
  await page.getByRole("button", { name: "Read card: Tooth selection", exact: true }).click();
  await card(page, "item:selection").getByRole("button", { name: /Selected tooth/ }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
  expect(await keys(page)).toEqual(["item:selection", "item:selected-tooth", "item:tooth-input"]);
  await card(page, "item:selected-tooth").getByRole("link", { name: "Read relationship: selects", exact: true }).click();
  expect(await keys(page)).toEqual(["item:selection", "item:selected-tooth", "item:tooth-input", "item:selects-input"]);
  await page.getByRole("button", { name: "Close Selected tooth", exact: true }).click();
  expect(await keys(page)).toEqual(["item:selection", "item:tooth-input", "item:selects-input"]);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:selects-input");
  await page.goBack();
  await expect(cards(page)).toHaveCount(4);
  await page.goForward();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Close Selected tooth selects Tooth input", exact: true }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:tooth-input");
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:tooth-input");
});

test("scroll, project return, overlay resizing and hiding preserve the stack and active context", async ({ page }) => {
  await page.goto("/p/dentalml?item=selected-tooth");
  await browse(page, "Tooth input");
  await browse(page, "Reference point");
  await page.locator("main").evaluate(el => { el.scrollTop = 360; });
  await expect.poll(() => scroll(page)).toBe(360);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await expect.poll(() => scroll(page)).toBe(360);
  const canvas = (await page.locator(".graph-slot").boundingBox())!;
  const reader = (await page.locator("main").boundingBox())!;
  expect(reader.x).toBeGreaterThan(canvas.x);
  expect(reader.x + reader.width).toBeLessThan(canvas.x + canvas.width);
  const divider = page.getByRole("separator", { name: "Resize canvas and reader" });
  await divider.focus();
  await divider.press("ArrowLeft");
  expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(reader.width);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(page.locator("main")).toBeHidden();
  expect((await page.locator(".graph-slot").boundingBox())!.width).toBe(canvas.width);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect.poll(() => scroll(page)).toBe(360);
  await page.getByRole("link", { name: "Lexicon library" }).click();
  await page.goto("/p/dentalml");
  await expect(cards(page)).toHaveCount(3);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:reference-point");
  await expect.poll(() => scroll(page)).toBe(360);
});

test("sticky titles stay bounded, links keep source independent, and narrow screens retain cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/p/dentalml?canvas=graph&item=selected-tooth");
  for (const name of ["Tooth input", "Canal index", "Measurement path", "Reference point", "Length result", "Displayed path"]) await browse(page, name);
  await page.locator("main").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const titles = page.locator(".reader-sticky-list");
  const overflow = page.getByRole("group", { name: "Collapsed cards" });
  await expect(overflow).toBeVisible();
  const overflowCards = await overflow.locator(".reader-collapsed-card").evaluateAll(es => es.map(e => ({ left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right, top: e.getBoundingClientRect().top })));
  expect(overflowCards.length).toBeGreaterThan(1);
  expect(overflowCards[0].top).toBe(overflowCards[1].top);
  const grid = await overflow.evaluate(el => ({ left: el.getBoundingClientRect().left, width: el.clientWidth }));
  const columns = Math.max(1, Math.floor((grid.width + 8) / 228));
  const tileWidth = (grid.width - (columns - 1) * 8) / columns;
  expect(overflowCards.every(card => Math.abs(card.right - card.left - tileWidth) < 1)).toBe(true);
  for (const top of new Set(overflowCards.map(card => card.top))) {
    const row = overflowCards.filter(card => card.top === top);
    expect(Math.abs(row[0].left - grid.left)).toBeLessThan(1);
    if (row.length === columns) expect(Math.abs(row.at(-1)!.right - grid.left - grid.width)).toBeLessThan(1);
    else expect(row.at(-1)!.right).toBeLessThan(grid.left + grid.width - 8);
  }
  await expect(titles.locator("button")).not.toHaveCount(0);
  expect((await titles.boundingBox())!.height).toBeLessThanOrEqual((await page.locator("main").boundingBox())!.height / 4);
  await expect(titles.locator(".reader-card-header .type-icon").first()).toBeVisible();
  expect((await titles.locator(".reader-card-header").first().boundingBox())!.height).toBe(34);
  const pinnedTitle = await titles.locator("button").first().textContent();
  await titles.locator("button").first().click();
  await expect(active(page).locator(":scope > header h1")).toHaveText(pinnedTitle!);
  await expect(active(page).locator(":scope > header")).toBeInViewport();
  await browse(page, "Selected tooth");
  await active(page).locator(".code-links button").first().click();
  await expect(page.locator(".code-pane")).toBeVisible();
  await expect(cards(page)).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Back to reader", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
  await expect(cards(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(page.locator(".graph-slot")).toBeVisible();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(cards(page)).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("closing the last card hides the reader; unavailable items remain closable", async ({ page }) => {
  await page.goto("/p/dentalml?item=missing-object");
  await expect(active(page)).toContainText("That item is unavailable.");
  await page.getByRole("button", { name: "Close Unavailable item", exact: true }).click();
  await expect(page.locator("main")).toBeHidden();
  await browse(page, "Selected tooth");
  await expect(cards(page)).toHaveCount(1);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:selected-tooth");
});
