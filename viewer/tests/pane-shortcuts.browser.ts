import { expect, test } from "@playwright/test";

for (const width of [1600, 800]) {
  test(`pane shortcuts preserve state and text entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/p/shop?item=order');
    const reader = page.getByRole('button', { name: 'Toggle reader', exact: true });
    const sources = page.getByRole('button', { name: 'Toggle source workspace', exact: true });
    const agent = page.getByRole('button', { name: 'Agent', exact: true });
    await expect(reader).toHaveAttribute('aria-pressed', 'true');
    await agent.focus();
    await page.keyboard.press('i');
    await expect(reader).toHaveAttribute('aria-pressed', 'false');
    await expect(agent).toBeFocused();
    await page.keyboard.press('i');
    await expect(reader).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main [data-reader-card].active > header h1')).toHaveText('Order');
    await page.keyboard.press('s');
    await expect(sources).toHaveAttribute('aria-pressed', 'true');
    await agent.focus();
    await page.keyboard.press('s');
    await expect(sources).toHaveAttribute('aria-pressed', 'false');
    await expect(agent).toBeFocused();
    await page.keyboard.press('Backslash');
    await expect(agent).toHaveAttribute('aria-pressed', 'true');
    const input = page.getByRole('textbox', { name: 'Message the coding agent' });
    await expect(input).toBeFocused();
    await input.fill('draft ');
    await input.pressSequentially('is\\/');
    await expect(input).toHaveValue('draft is\\/');
    await expect(agent).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Meta+Backslash');
    await expect(agent).toHaveAttribute('aria-pressed', 'false');
    await agent.focus();
    await page.keyboard.press('Backslash');
    await expect(input).toHaveValue('draft is\\/');
    await expect(input).toBeFocused();
    await agent.focus();
    await page.keyboard.press('Backslash');
    await expect(agent).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toBeFocused();
    await agent.focus();
    await agent.dispatchEvent('keydown', { key: '\\', code: 'Backslash', repeat: true });
    await expect(agent).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Control+Backslash');
    await expect(agent).toHaveAttribute('aria-pressed', 'false');
    await reader.focus();
    await page.keyboard.press('/');
    const search = page.getByRole('textbox', { name: 'Search model' });
    await expect(search).toBeFocused();
    await search.pressSequentially('is\\/');
    await expect(search).toHaveValue('is\\/');
  });
}

test('pane shortcuts work from the canvas without taking drawing shortcuts', async ({ page }) => {
  await page.goto('/p/shop?item=order');
  const draw = page.getByTestId('tools.draw').filter({ visible: true });
  await draw.click();
  await page.keyboard.press('v');
  await expect(page.getByTestId('tools.select').filter({ visible: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('i');
  await expect(page.getByRole('button', { name: 'Toggle reader', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('d');
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Backslash');
  await expect(page.getByRole('button', { name: 'Agent', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
