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

// Install a custom plugin from loose files, then remove it.
test('Plugins: install a custom plugin from files, then delete it', async ({ page, request }) => {
  await waitForBackend(request);
  await page.goto('/');
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();

  // Upload a minimal valid package (manifest + entry) via the hidden file input.
  await page.locator('input[type="file"][accept*=".webm"]').setInputFiles([
    {
      name: 'plugin.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ name: 'E2E Import', version: '1.0.0', entry: 'index.html', mount: { type: 'panel', location: 'live' } }),
      ),
    },
    { name: 'index.html', mimeType: 'text/html', buffer: Buffer.from('<title>e2e</title>') },
  ]);

  const card = page.locator('.plugin-card-v3').filter({ hasText: 'E2E Import' });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText('пользовательский');
  await expect.poll(async () => {
    const list = await (await request.get('http://127.0.0.1:4000/api/plugins')).json();
    return list.plugins.some((p) => p.name === 'E2E Import');
  }).toBe(true);

  // Delete it (auto-accept the confirm dialog).
  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Удалить' }).click();
  await expect(card).toBeHidden({ timeout: 10_000 });
  await expect.poll(async () => {
    const list = await (await request.get('http://127.0.0.1:4000/api/plugins')).json();
    return list.plugins.some((p) => p.name === 'E2E Import');
  }).toBe(false);
});

// A plugin contributes a native button into a host slot (live.toolbar).
test('Plugins: a contributed button appears in the Live toolbar and fires its command', async ({ page, request }) => {
  await waitForBackend(request);
  // Enable the reference plugin (it contributes a PANIC button -> global:allOutputsOut).
  await request.post('http://127.0.0.1:4000/api/plugins/builtin:rundown-remote/enable');
  await page.goto('/');

  const panic = page.locator('.plugin-slot[data-slot="live.toolbar"] .plugin-slot-btn', { hasText: 'PANIC' });
  await expect(panic).toBeVisible({ timeout: 10_000 });

  const commandRequest = page.waitForRequest(
    (req) =>
      req.url().endsWith('/api/command') &&
      req.method() === 'POST' &&
      JSON.parse(req.postData() || '{}').actionId === 'global:allOutputsOut',
  );
  await panic.click();
  await commandRequest;

  await request.post('http://127.0.0.1:4000/api/plugins/builtin:rundown-remote/disable');
});

// A background (headless) plugin runs in a hidden iframe with no visible UI.
test('Plugins: a background plugin runs headless and can drive commands', async ({ page, request }) => {
  await waitForBackend(request);
  await page.goto('/');
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();

  const html =
    '<script>' +
    "window.addEventListener('message',function(e){" +
    "if(e.data&&e.data.source==='wtp-host'&&e.data.type==='init'){" +
    "parent.postMessage({source:'wtp-plugin',type:'command',actionId:'global:allOutputsOut',requestId:'1'},'*');}});" +
    "parent.postMessage({source:'wtp-plugin',type:'ready'},'*');" +
    '</script>';

  await page.locator('input[type="file"][accept*=".webm"]').setInputFiles([
    {
      name: 'plugin.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ name: 'Headless', version: '1.0.0', entry: 'index.html', capabilities: ['command:send'], mount: { type: 'background' } }),
      ),
    },
    { name: 'index.html', mimeType: 'text/html', buffer: Buffer.from(html) },
  ]);

  const card = page.locator('.plugin-card-v3').filter({ hasText: 'Headless' });
  await expect(card).toBeVisible({ timeout: 10_000 });

  // Enabling loads the hidden iframe; on init it fires a command through the bridge.
  const commandRequest = page.waitForRequest(
    (req) =>
      req.url().endsWith('/api/command') &&
      req.method() === 'POST' &&
      JSON.parse(req.postData() || '{}').actionId === 'global:allOutputsOut',
  );
  await card.getByRole('button', { name: 'Включить' }).click();
  await commandRequest;

  // It contributes no visible surface: no plugin tab, and the hidden host exists.
  await expect(page.locator('.tab-v2.is-plugin')).toHaveCount(0);
  await expect(page.locator('.plugin-host.is-background')).toHaveCount(1);

  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Удалить' }).click();
});

// A plugin whose manifest mounts as a tab gets its own top-level nav tab.
test('Plugins: a tab-mount plugin adds a top-level tab that shows it full-size', async ({ page, request }) => {
  await waitForBackend(request);
  await page.goto('/');
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();

  await page.locator('input[type="file"][accept*=".webm"]').setInputFiles([
    {
      name: 'plugin.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ name: 'Tab Plugin', version: '1.0.0', entry: 'index.html', mount: { type: 'tab', label: 'Tabby' } }),
      ),
    },
    { name: 'index.html', mimeType: 'text/html', buffer: Buffer.from('<title>t</title><body>TAB PLUGIN BODY</body>') },
  ]);

  const card = page.locator('.plugin-card-v3').filter({ hasText: 'Tab Plugin' });
  await expect(card).toBeVisible({ timeout: 10_000 });

  // No tab while disabled; enabling makes the tab appear.
  await expect(page.locator('.tab-v2.is-plugin')).toHaveCount(0);
  await card.getByRole('button', { name: 'Включить' }).click();

  const pluginTab = page.locator('.tab-v2.is-plugin', { hasText: 'Tabby' });
  await expect(pluginTab).toBeVisible({ timeout: 10_000 });

  // Opening the tab renders the plugin iframe full-size in the content area.
  await pluginTab.click();
  await expect(page.locator('.plugin-host.is-tab iframe[title="Tab Plugin"]')).toBeVisible({ timeout: 10_000 });

  // Disabling removes the tab and falls back to Live.
  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Plugins/i }).click();
  await card.getByRole('button', { name: 'Отключить' }).click();
  await expect(page.locator('.tab-v2.is-plugin')).toHaveCount(0);

  page.on('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Удалить' }).click();
});
