import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator("[data-reader-card]");
const keys = (page: Page) => cards(page).evaluateAll(es => es.map(e => e.getAttribute("data-reader-card")));
const card = (page: Page, id: string) => page.locator(`[data-reader-card="${id}"]`);
const browse = async (page: Page, name: string) => {
  await page.locator(".sidebar .nav-item").filter({ hasText: new RegExp(`^${name}$`) }).click({ modifiers: ["Meta"] });
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
};
const active = (page: Page) => page.locator("[data-reader-card].active");
const openPinned = async (page: Page, id: string) => {
  await page.goto(`/p/shop?item=${id}`);
  await active(page).locator("[data-pin-card]").click();
};
const scroll = (page: Page) => page.locator("main").evaluate(el => el.scrollTop);

test("Back interrupts reader travel without overwriting the restored position", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API"]) await browse(page, name);
  const position = await scroll(page);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(page.locator("main")).toHaveAttribute("data-reader-travel", "scroll");
  await page.goBack();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:api");
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
  await page.waitForTimeout(800);
  expect(await scroll(page)).toBe(position);
  expect(await page.evaluate(() => history.state.usr.readerStack.scrollTop)).toBe(position);
});

test("expanded settled morph controls remain interactive", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  await card(page, "item:order-line").evaluate(el => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + 190;
  });
  const morph = page.locator('[data-bottom-morph-card="item:order-line"]');
  await expect(morph.locator(".reader-morph-body")).toHaveAttribute("data-expanded", "true");
  const locate = morph.getByRole("button", { name: "Locate in canvas", exact: true });
  await expect(locate).toHaveCSS("pointer-events", "auto");
  const camera = await page.locator(".tl-html-layer").getAttribute("style");
  await locate.click();
  await expect(page.locator(".tl-html-layer")).not.toHaveAttribute("style", camera!);
  await expect(page.locator('[data-model-id="item:order-line"]')).toBeInViewport();
});

test("a scroll pause away from morph boundaries does not start a settling loop", async ({ page }) => {
  await openPinned(page, "order");
  await expect(card(page, "item:order")).toBeVisible();
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
  await openPinned(page, "order");
  await browse(page, "Order Line");
  const main = page.locator("main");
  const origin = await scroll(page);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
  await expect(main).toHaveAttribute("data-reader-travel", "scroll");
  await expect.poll(() => scroll(page)).toBeLessThan(origin);
  await main.dispatchEvent("wheel", { deltaY: 1 });
  await expect(main).not.toHaveAttribute("data-reader-travel", /./);
  const interrupted = await scroll(page);
  await page.waitForTimeout(500);
  expect(await scroll(page)).toBe(interrupted);
  for (const name of ["Customer", "Shop", "Shop API"]) await browse(page, name);
  await page.locator(".sidebar .nav-item").filter({ hasText: /^Order$/ }).click();
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
  await expect(card(page, "item:order").locator(":scope > header")).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await browse(page, "Shop API");
  await expect(main).not.toHaveAttribute("data-reader-travel", /./);
});

test("pause settling finishes both edge morphs without scrolling the reading text", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  for (const [side, pixels, target] of [["top", 80, 1], ["top", 150, 0], ["bottom", 110, 1], ["bottom", 190, 0]] as const) {
    const key = side === "top" ? "item:order" : "item:order-line";
    await card(page, key).evaluate((el, { side, pixels }) => {
      const main = el.closest("main")!;
      main.scrollTop = side === "top" ? (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight - pixels
        : (el as HTMLElement).offsetTop - main.clientHeight + pixels;
    }, { side, pixels });
    const morph = page.locator(side === "top" ? `[data-morph-card="${key}"]` : `[data-bottom-morph-card="${key}"]`);
    await expect(morph).toBeVisible();
    const position = await scroll(page);
    const readingBody = card(page, side === "top" ? "item:order-line" : "item:order").locator(".reader-card-body");
    const y = (await readingBody.boundingBox())!.y;
    await expect.poll(() => morph.evaluate(el => Number((el as HTMLElement).style.getPropertyValue("--morph-progress")))).toBe(target);
    expect(await scroll(page)).toBe(position);
    expect((await readingBody.boundingBox())!.y).toBe(y);
  }
});

test("Browse navigation lands on the expanded card with the preceding edge settled", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop"]) await browse(page, name);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:shop");
  await expect(active(page)).not.toHaveClass(/reader-card-morphing/);
  await expect(active(page).locator(":scope > header")).toBeInViewport();
  const top = page.locator("[data-morph-card]");
  if (await top.count()) {
    await expect.poll(() => top.evaluate(el => Number((el as HTMLElement).style.getPropertyValue("--morph-progress")))).toBe(1);
  }
});

test("bottom row handoff keeps existing tiles still when a new row forms", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  const setVisible = (visible: number) => card(page, "item:order-line").evaluate((el, visible) => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + visible;
  }, visible);
  await setVisible(220);
  const tile = page.locator('[data-bottom-card="item:api"]');
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
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API"]) await browse(page, name);
  await page.setViewportSize({ width: 1600, height: 700 });
  const forming = page.locator('[data-bottom-morph-card="item:order-line"]');
  for (const visible of [190, 160, 120, 80, 30, 80, 160, 190]) {
    await card(page, "item:order-line").evaluate((el, pixels) => {
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
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop"]) await browse(page, name);
  await page.locator("main").evaluate(el => { el.scrollTop = 0; });
  await expect(page.locator("[data-clipped-bottom]")).toHaveCount(1);
  const clipped = page.locator("[data-clipped-bottom]");
  await expect(clipped).toHaveCSS("mask-image", "none");
  await expect(clipped.locator(":scope > .reader-card-body")).toHaveCSS("mask-image", /^linear-gradient\(/);
  await expect(clipped).toHaveCSS("clip-path", "none");
  await expect(page.locator(".reader-bottom-titles .reader-collapsed-grid")).toBeVisible();
  const gap = await clipped.evaluate(el => {
    const amount = parseFloat((el as HTMLElement).style.getPropertyValue("--bottom-fade-end"));
    const edge = el.getBoundingClientRect().top + amount;
    const grid = document.querySelector(".reader-bottom-titles .reader-collapsed-grid")!;
    return grid.getBoundingClientRect().top - edge;
  });
  expect(gap).toBeCloseTo(12, 0);
  const stops = await clipped.evaluate(el => getComputedStyle(el, "::before").maskImage.match(/[\d.]+px/g)!.map(parseFloat));
  expect(stops[1] - stops[0]).toBeCloseTo(24, 2);
});

test("bottom morph follows reverse scrolling and hands off to the bottom tile", async ({ page }) => {
  await openPinned(page, "order");
  await browse(page, "Order Line");
  const second = card(page, "item:order-line");
  const show = (pixels: number) => second.evaluate((el, pixels) => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop - main.clientHeight + pixels;
  }, pixels);
  // Use a shorter viewport so the second card can be entirely below it.
  await page.setViewportSize({ width: 1600, height: 700 });
  const morph = page.locator('[data-bottom-morph-card="item:order-line"]');
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
  await expect(page.locator('[data-bottom-card="item:order-line"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await show(80);
  await expect(morph).toHaveCount(0);
});

test("bottom tiles reveal later cards and close only their own card", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API"]) await browse(page, name);
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
  await page.locator(".reader-sticky-titles").getByRole("button", { name: /^(Read|Reveal) card: Order$/ }).click();
  const bottom = page.getByRole("group", { name: "Collapsed cards below" });
  await expect(bottom).toBeVisible();
  const bottomKeys = await bottom.locator("[data-bottom-card]").evaluateAll(es => es.map(el => el.getAttribute("data-bottom-card")));
  expect(bottomKeys[0]).toBe("item:api");
  expect(bottomKeys[1]).toBe("item:shop");
  const positions = await bottom.locator("[data-bottom-card]").evaluateAll(es => es.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
  for (let index = 1; index < positions.length; index++) {
    const previous = positions[index - 1], current = positions[index];
    if (current.y === previous.y) expect(current.x).toBeLessThan(previous.x);
    else expect(current.y).toBeLessThan(previous.y);
  }
  expect((await bottom.boundingBox())!.height).toBeLessThanOrEqual((await page.locator("main").boundingBox())!.height / 4);
  await expect(bottom).toBeInViewport();
  await bottom.getByRole("button", { name: "Close collapsed Shop API", exact: true }).click();
  await expect(cards(page)).toHaveCount(4);
  await bottom.getByRole("button", { name: "Reveal card: Shop", exact: true }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:shop");
  await expect(active(page).locator(":scope > header")).toBeInViewport();
  await expect(page.locator('[data-bottom-card="item:shop"]')).toHaveCount(0);
});

test("header morph follows scroll progress and reverses before becoming a tile", async ({ page }) => {
  await openPinned(page, "order");
  await browse(page, "Order Line");
  const first = card(page, "item:order");
  const remaining = (pixels: number) => first.evaluate((el, pixels) => {
    el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight - pixels;
  }, pixels);
  const morph = page.locator('[data-morph-card="item:order"]');
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
    const following = (await card(page, "item:order-line").locator(":scope > header").boundingBox())!;
    return following.y - forming.y - forming.height;
  }).toBeGreaterThanOrEqual(11);
  await expect(page.locator('[data-collapsed-card="item:order"]')).toHaveCount(0);
  await remaining(120);
  await expect.poll(async () => (await morph.boundingBox())!.width).toBeGreaterThanOrEqual(initialWidth - 1);
  await expect.poll(async () => (await morph.locator(".reader-morph-body").boundingBox())!.height).toBeGreaterThanOrEqual(initialBodyHeight - 1);
  await expect.poll(opacity).toBeGreaterThanOrEqual(initialOpacity - 0.01);
  await remaining(-1);
  await expect(morph).toHaveCount(0);
  await expect(page.locator('[data-collapsed-card="item:order"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await remaining(80);
  await expect(morph).toHaveCount(0);
  await expect(first).toBeVisible();
});

test("a partly scrolled card retains its sticky header until its whole body passes", async ({ page }) => {
  await openPinned(page, "order");
  await browse(page, "Order Line");
  const first = card(page, "item:order");
  await page.locator("main").evaluate(el => { el.scrollTop = 180; });
  await expect(page.locator('[data-collapsed-card="item:order"]')).toHaveCount(0);
  await expect.poll(async () => Math.abs((await first.locator(":scope > header").boundingBox())!.y - (await page.locator("main").boundingBox())!.y)).toBeLessThan(2);
  await first.evaluate(el => { el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight + 1; });
  await expect(page.locator('[data-collapsed-card="item:order"]')).toBeVisible();
  await expect(page.locator(".reader-sticky-list").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.locator("main").evaluate(el => { el.scrollTop = 180; });
  await expect(page.locator('[data-collapsed-card="item:order"]')).toHaveCount(0);
});

test("selection border stays attached when native scrolling outruns scroll handlers", async ({ page }) => {
  await openPinned(page, "order");
  const selected = card(page, "item:order");
  const result = await selected.evaluate(el => {
    const main = el.closest("main")!;
    const header = el.querySelector(".reader-card-header")!;
    const stop = (event: Event) => event.stopImmediatePropagation();
    window.addEventListener("scroll", stop, true);
    try {
      return [0, 140, 60, 0].map(amount => {
        main.scrollTop = (el as HTMLElement).offsetTop + amount;
        const edge = getComputedStyle(header, "::before");
        return { position: getComputedStyle(header).position, top: edge.top,
          width: edge.borderTopWidth, radius: edge.borderTopLeftRadius,
          shadow: getComputedStyle(header).boxShadow };
      });
    } finally { window.removeEventListener("scroll", stop, true); }
  });
  for (const edge of result) expect(edge).toEqual({ position: "sticky", top: "-1px", width: "1px", radius: "10px", shadow: "none" });
  await selected.evaluate(el => { el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + 140; });
  await page.screenshot({ path: test.info().outputPath("reader-native-border.png") });
});

test("header breadcrumb follows the active card and pins without replacing the stack", async ({ page }) => {
  await openPinned(page, "order");
  const breadcrumb = page.getByRole("navigation", { name: "Reader breadcrumb" });
  await expect(breadcrumb.locator("button")).toHaveText(["Shop", "Ordering", "Order"]);
  await breadcrumb.getByRole("button", { name: "Ordering", exact: true }).click({ modifiers: ["Meta"] });
  expect(await keys(page)).toEqual(["item:order", "item:ordering"]);
  await expect(page.locator("main")).not.toHaveAttribute("data-reader-travel", /./);
  await page.locator(".reader-sticky-titles").getByRole("button", { name: /^(Read|Reveal) card: Order$/ }).click();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Order");
  await breadcrumb.getByRole("button", { name: "Ordering", exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.goBack();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Order");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(breadcrumb.locator('[aria-current="page"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("one stack pins from old cards, reveals duplicates, closes individually and restores history", async ({ page }) => {
  await openPinned(page, "order");
  await browse(page, "Order");
  await browse(page, "Order Line");
  await browse(page, "Ordering");
  await card(page, "item:ordering").getByRole("button", { name: /^Concept · entity Order / }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:order");
  expect(await keys(page)).toEqual(["item:order", "item:order-line", "item:ordering"]);
  await card(page, "item:order").getByRole("link", { name: "Read relationship: contains", exact: true }).click({ modifiers: ["Meta"] });
  expect(await keys(page)).toEqual(["item:order", "item:order-line", "item:ordering", "item:order-lines"]);
  await page.getByRole("button", { name: "Close Order", exact: true }).click();
  expect(await keys(page)).toEqual(["item:order-line", "item:ordering", "item:order-lines"]);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:order-lines");
  await page.goBack();
  await expect(cards(page)).toHaveCount(4);
  await page.goForward();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Close Order contains Order Line", exact: true }).click();
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:ordering");
  await page.reload();
  await expect(cards(page)).toHaveCount(2);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:ordering");
});

test("scroll, project return, overlay resizing and hiding preserve the stack and active context", async ({ page }) => {
  await openPinned(page, "order");
  await browse(page, "Order Line");
  await browse(page, "Shop API");
  await page.locator("main").evaluate(el => { el.scrollTop = 360; });
  await expect.poll(() => scroll(page)).toBe(360);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:api");
  await page.reload();
  await expect(cards(page)).toHaveCount(3);
  await expect.poll(() => scroll(page)).toBe(360);
  const canvas = (await page.locator(".canvas-slot").boundingBox())!;
  const reader = (await page.locator("main").boundingBox())!;
  expect(reader.x).toBeGreaterThan(canvas.x);
  expect(reader.x + reader.width).toBeLessThan(canvas.x + canvas.width);
  const divider = page.getByRole("separator", { name: "Resize canvas and reader" });
  await divider.focus();
  await divider.press("ArrowLeft");
  expect((await page.locator("main").boundingBox())!.width).toBeGreaterThan(reader.width);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(page.locator("main")).toBeHidden();
  expect((await page.locator(".canvas-slot").boundingBox())!.width).toBe(canvas.width);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect.poll(() => scroll(page)).toBe(360);
  await page.getByRole("link", { name: "Lexicon library" }).click();
  await page.goto("/p/shop");
  await expect(cards(page)).toHaveCount(3);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:api");
  await expect.poll(() => scroll(page)).toBe(360);
});

test("sticky titles stay bounded, links keep source independent, and narrow screens retain cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API", "Order Handling", "Order Repository"]) await browse(page, name);
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
  await browse(page, "Order");
  await active(page).locator(".code-links button").first().click();
  await expect(page.locator(".code-pane")).toBeVisible();
  await expect(cards(page)).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Back to reader", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
  await expect(cards(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(page.locator(".canvas-slot")).toBeVisible();
  await page.getByRole("button", { name: "Toggle reader", exact: true }).click();
  await expect(cards(page)).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("closing the last card hides the reader; unavailable items remain closable", async ({ page }) => {
  await page.goto("/p/shop?item=missing-object");
  await expect(active(page)).toContainText("That item is unavailable.");
  await page.getByRole("button", { name: "Close Unavailable item", exact: true }).click();
  await expect(page.locator("main")).toBeHidden();
  await browse(page, "Order");
  await expect(cards(page)).toHaveCount(1);
  await expect(active(page)).toHaveAttribute("data-reader-card", "item:order");
});

test("expanded bodies are clipped out of the transparent collapsed rail", async ({ page }) => {
  await openPinned(page, "order");
  for (const name of ["Order Line", "Customer", "Shop", "Shop API"]) await browse(page, name);
  await card(page, "item:api").evaluate(el => {
    const main = el.closest("main")!;
    main.scrollTop = (el as HTMLElement).offsetTop + 60;
  });
  const rail = page.locator(".reader-sticky-titles > .reader-sticky-list");
  await expect(page.locator("[data-collapsed-card]").first()).toBeVisible();
  await expect.poll(() => rail.evaluate(el => {
    const box = el.getBoundingClientRect();
    // The top padding and row gaps must expose the canvas, never body text.
    for (let y = box.top + 1; y < box.bottom; y += 3) {
      for (let x = box.left + 1; x < box.right; x += 17) {
        if (document.elementsFromPoint(x, y).some(hit => hit.closest("[data-reader-card]"))) return false;
      }
    }
    return true;
  })).toBe(true);
  await expect(rail).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // Simulate scrolling outrunning JS: no scroll handler can refresh geometry.
  // The viewport must still clip bodies at every intermediate position.
  const leaked = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const rail = document.querySelector(".reader-sticky-titles > .reader-sticky-list")!;
    const box = rail.getBoundingClientRect();
    const origin = main.scrollTop;
    const stopScroll = (event: Event) => event.stopImmediatePropagation();
    window.addEventListener("scroll", stopScroll, true);
    try {
      for (const offset of [500, -300, 900, -700, 120, -60, 0]) {
        main.scrollTop = origin + offset;
        for (let y = box.top + 1; y < box.bottom; y += 5) {
          if (document.elementsFromPoint(box.left + box.width / 2, y)
            .some(hit => hit.closest("[data-reader-card]"))) return true;
        }
      }
      return false;
    } finally {
      main.scrollTop = origin;
      window.removeEventListener("scroll", stopScroll, true);
    }
  });
  expect(leaked).toBe(false);
  const beforeWheel = await scroll(page);
  await rail.hover();
  await page.mouse.wheel(0, -180);
  await expect.poll(() => scroll(page)).toBeLessThan(beforeWheel);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({ path: test.info().outputPath("reader-rail-clipping.png") });
});


test("scrolling body remains behind the glass sticky header", async ({ page }) => {
  await openPinned(page, "order");
  const selected = card(page, "item:order");
  await selected.evaluate(el => {
    el.closest("main")!.scrollTop = (el as HTMLElement).offsetTop + 140;
  });
  await expect.poll(() => selected.evaluate(el => {
    const header = el.querySelector(".reader-card-header")!;
    const rect = header.getBoundingClientRect();
    return document.elementsFromPoint(rect.right - 90, rect.bottom - 8)
      .some(hit => hit.closest(".reader-card-body"));
  })).toBe(true);
  await expect(selected.locator(".reader-card-body")).toHaveCSS("clip-path", "none");
  expect(await selected.locator(".reader-card-header").evaluate(el => getComputedStyle(el, "::after").backdropFilter))
    .toBe(await page.locator(".sidebar").evaluate(el => getComputedStyle(el).backdropFilter));
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: test.info().outputPath("sticky-header-translucent.png") });
});

test("tall cards and sticky headers blur their backdrop while the bottom fades", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/p/shop");
  await page.locator(".canvas-stage").waitFor();
  await expect(page.locator("[data-clipped-bottom]")).toHaveCount(1);
  const stripes = "repeating-linear-gradient(90deg, #e699c0 0 10px, #528cae 10px 20px)";
  await page.evaluate(stripes => {
    (document.querySelector(".canvas-stage") as HTMLElement).style.background = stripes;
  }, stripes);
  await page.addStyleTag({ content: ".canvas-stage > *, .sidebar > *, .reader-card-body > * { visibility: hidden !important; }" });
  const samples = async (selector: string, nearTop = false) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    // Capture the viewport before sampling: a tightly cropped screenshot can
    // change Chromium's backdrop-filter rendering outside the captured strip.
    const png = await page.screenshot();
    return page.evaluate(async ({ base64, x, y }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(x, y, 100, 1).data;
      return [0, 1, 2].map(channel => {
        const values = Array.from({ length: 100 }, (_, x) => pixels[x * 4 + channel]);
        return { range: Math.max(...values) - Math.min(...values), mean: values.reduce((a, b) => a + b) / values.length };
      });
    }, {
      base64: png.toString("base64"),
      x: Math.floor(box.x + box.width / 2 - 50),
      y: Math.floor(box.y + (nearTop ? 12 : box.height / 2)),
    });
  };
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelector("main")!.scrollTop = 0; }, theme);
    const browseGlass = await samples(".sidebar");
    const cardGlass = await samples("[data-reader-card] > .reader-card-body", true);
    const toolbarGlass = await samples(".toolbar");
    for (let channel = 0; channel < 3; channel++) {
      expect(toolbarGlass[channel].range).toBeLessThan(4);
      expect(Math.abs(toolbarGlass[channel].mean - browseGlass[channel].mean)).toBeLessThan(4);
      expect(cardGlass[channel].range).toBeLessThan(4);
      expect(Math.abs(cardGlass[channel].mean - browseGlass[channel].mean)).toBeLessThan(4);
    }
  }
  await page.evaluate(stripes => {
    (document.querySelector("[data-reader-card] > .reader-card-body") as HTMLElement).style.background = stripes;
    // Measure the blur independently of the header's decorative color gradient.
    (document.querySelector("[data-reader-card] > .reader-card-header") as HTMLElement).style.setProperty("--reader-card-illumination", "none");
    document.querySelector("main")!.scrollTop = 150;
  }, stripes);
  const headerGlass = await samples("[data-reader-card] > .reader-card-header");
  for (const channel of headerGlass) expect(channel.range).toBeLessThan(4);
  await page.screenshot({ path: test.info().outputPath("frosted-scrolled-header.png") });
});
