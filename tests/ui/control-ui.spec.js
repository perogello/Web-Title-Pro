import { test, expect } from '@playwright/test';

const seedSourceLibrary = async (page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'web-title-pro-source-library',
      JSON.stringify([
        {
          id: 'ui-test-source',
          name: 'UI Test Source',
          delimiter: ',',
          linkedTimerId: null,
          linkedTimerByOutput: {},
          columns: [
            { id: 'col-0', label: 'Name' },
            { id: 'col-1', label: 'Role' },
          ],
          rows: [
            {
              id: 'row-1',
              index: 1,
              values: ['Alice', 'Host'],
              label: 'Alice | Host',
              timer: { baseMs: 0, format: 'mm:ss' },
            },
          ],
        },
      ]),
    );
  });
};

const waitForBackend = async (request) => {
  const deadline = Date.now() + 15_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await request.get('http://127.0.0.1:4000/api/state');
      if (response.ok()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Backend did not become ready: ${lastError?.message || 'timeout'}`);
};

test('control UI loads and Live Notes editor toggles open', async ({ page, request }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');
  await page.getByRole('button', { name: /LIVE/i }).click();

  await expect(page.getByText('Live data source')).toBeVisible();
  await expect(page.getByRole('button', { name: /Preview/i })).toBeVisible();

  await page.getByRole('button', { name: /Notes/i }).click();
  const notes = page.getByRole('textbox', { name: 'Notes editor' });
  await expect(notes).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text color' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Background color' })).toBeVisible();
  await expect(page.getByRole('separator', { name: 'Resize notes' })).toBeVisible();
  await notes.fill('Director note');
  await expect(notes).toContainText('Director note');

  await notes.evaluate((editor) => {
    const textNode = editor.firstChild;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 'Director'.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  const boldButton = page.getByRole('button', { name: 'Bold' });
  await boldButton.click();
  await page.getByRole('button', { name: 'Italic' }).click();
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('22');
  await page.locator('.note-hidden-color').first().evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '#ffd166');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('font-size: 22px');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(255, 209, 102)');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect(notes).toContainText('note');

  const widthBefore = await page.locator('.live-notes-v2').evaluate((panel) => panel.getBoundingClientRect().width);
  const splitterBox = await page.getByRole('separator', { name: 'Resize notes' }).boundingBox();
  expect(splitterBox).not.toBeNull();
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x - 90, splitterBox.y + splitterBox.height / 2);
  await page.mouse.up();
  const widthAfter = await page.locator('.live-notes-v2').evaluate((panel) => panel.getBoundingClientRect().width);
  expect(widthAfter).toBeGreaterThan(widthBefore + 40);

  expect(consoleErrors).toEqual([]);
});

test('Controls exposes MIDI status, refresh, and Learn button', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');

  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Controls/i }).click();

  await expect(page.getByText(/MIDI (offline|device)/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh MIDI/i })).toBeVisible();

  const titleInRow = page.locator('.ctl-row').filter({ has: page.locator('.ctl-row-name', { hasText: 'Title In' }) });
  await titleInRow.locator('.ctl-row-label').click();
  await expect(titleInRow.getByRole('button', { name: 'Learn' }).first()).toBeVisible();
});
