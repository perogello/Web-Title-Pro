import { test, expect } from '@playwright/test';

const waitForBackend = async (request) => {
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await request.get('http://127.0.0.1:4000/api/state');
      if (response.ok()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Backend did not become ready: ${lastError?.message || 'timeout'}`);
};

// End-to-end plugin host: enable the reference plugin from Settings, see it
// mount on Live, and confirm the postMessage bridge works both ways — the
// snapshot reaches the iframe (state:read) and a button in the iframe drives
// the command bus (command:send).
test('Plugins: enable reference plugin, it mounts on Live and the bridge round-trips', async ({ page, request }) => {
  await waitForBackend(request);

  // Start from a known state: make sure the plugin is disabled.
  await request.post('http://127.0.0.1:4000/api/plugins/builtin:rundown-remote/disable');

  await page.goto('/');

  // Settings › Plugins lists the reference plugin.
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();

  const card = page.locator('.plugin-card-v3').filter({ hasText: 'Rundown Remote' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('чтение состояния');
  await expect(card).toContainText('отправка команд');

  // Enable it.
  await card.getByRole('button', { name: 'Включить' }).click();
  await expect(card.getByRole('button', { name: 'Отключить' })).toBeVisible();
  await expect.poll(async () => {
    const res = await request.get('http://127.0.0.1:4000/api/plugins');
    const list = await res.json();
    return list.plugins.find((p) => p.id === 'builtin:rundown-remote')?.enabled;
  }).toBe(true);

  // Back to Live: the host mounts the plugin in a sandboxed iframe.
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.locator('.plugin-frame-head', { hasText: 'Rundown Remote' })).toBeVisible();

  const frame = page.frameLocator('iframe[title="Rundown Remote"]');

  // state:read bridge — the snapshot reached the iframe, so it shows the
  // output name from the store (default "OUTPUT 1").
  await expect(frame.locator('#out')).toHaveText(/OUTPUT/i, { timeout: 10_000 });

  // command:send bridge — clicking a plugin button posts to the command bus.
  const commandRequest = page.waitForRequest(
    (req) => req.url().endsWith('/api/command') && req.method() === 'POST',
  );
  await frame.locator('#in').click();
  const req = await commandRequest;
  expect(JSON.parse(req.postData() || '{}').actionId).toMatch(/^output:.*:titleIn$/);

  // The IN button starts on the default (green) accent.
  await expect(frame.locator('#in')).not.toHaveClass(/accent-blue/);

  // Per-plugin settings: change the accent in Settings › Plugins and confirm it
  // reaches the running plugin live through the bridge.
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();
  await card.locator('.plugin-setting select').selectOption('blue');
  await expect.poll(async () => {
    const res = await request.get('http://127.0.0.1:4000/api/plugins');
    const list = await res.json();
    return list.plugins.find((p) => p.id === 'builtin:rundown-remote')?.settings?.accent;
  }).toBe('blue');

  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(frame.locator('#in')).toHaveClass(/accent-blue/, { timeout: 10_000 });

  // Cleanup: hide any program and disable the plugin again.
  await request.post('http://127.0.0.1:4000/api/plugins/builtin:rundown-remote/disable');
});
