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
  await expect(page.getByLabel('Background color')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear background' })).toBeHidden();
  await page.getByLabel('Background color').click();
  await expect(page.getByRole('menu', { name: 'Fill menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear background' })).toBeVisible();
  await expect(page.getByRole('separator', { name: 'Resize notes' })).toBeVisible();
  await notes.fill('Director note');
  await expect(notes).toContainText('Director note');

  const selectText = async (text) => notes.evaluate((editor, selectedText) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !textNode.nodeValue.includes(selectedText)) {
      textNode = walker.nextNode();
    }
    if (!textNode) throw new Error(`Text not found: ${selectedText}`);
    const start = textNode.nodeValue.indexOf(selectedText);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + selectedText.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);

  await selectText('Director');
  const boldButton = page.getByRole('button', { name: 'Bold' });
  const italicButton = page.getByRole('button', { name: 'Italic' });
  await boldButton.click();
  await expect(boldButton).toHaveClass(/is-active/);
  await italicButton.click();
  await expect(italicButton).toHaveClass(/is-active/);
  await page.getByRole('combobox', { name: 'Font size' }).selectOption('22');

  const htmlBeforeTextColorDrag = await notes.evaluate((editor) => editor.innerHTML);
  await page.locator('.note-hidden-color').first().evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const color of ['#ff0000', '#00ff00', '#0000ff', '#cc00ff', '#ffaa00']) {
      setter.call(input, color);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(await notes.evaluate((editor) => editor.innerHTML)).toBe(htmlBeforeTextColorDrag);
  await page.locator('.note-hidden-color').first().evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '#ffd166');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('font-size: 22px');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(255, 209, 102)');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect(notes).toContainText('note');

  await selectText('Director');
  await boldButton.click();
  await italicButton.click();
  await expect.poll(async () => notes.evaluate((editor) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !textNode.nodeValue.includes('Director')) {
      textNode = walker.nextNode();
    }
    const element = textNode?.parentElement;
    if (!element) return null;
    const computed = window.getComputedStyle(element);
    return {
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      html: editor.innerHTML,
    };
  })).toMatchObject({ fontStyle: 'normal' });

  await notes.evaluate((editor) => {
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  const htmlBeforeFillColorDrag = await notes.evaluate((editor) => editor.innerHTML);
  await page.getByLabel('Background color').click();
  await expect(page.getByRole('menu', { name: 'Fill menu' })).toBeVisible();
  await page.locator('.note-fill-native-color').evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const color of ['#111111', '#223344', '#334455', '#445566', '#556677']) {
      setter.call(input, color);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(await notes.evaluate((editor) => editor.innerHTML)).toBe(htmlBeforeFillColorDrag);
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('note');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(85, 102, 119)');
  await page.getByRole('button', { name: 'Clear background' }).click();
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).not.toContain('rgb(85, 102, 119)');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(255, 209, 102)');
  await page.locator('.note-hidden-color').first().evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '#6aa3ff');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(106, 163, 255)');

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
  await expect(page.getByText('Inputs', { exact: true })).toBeVisible();

  const titleInRow = page.locator('.ctl-row').filter({ has: page.locator('.ctl-row-name', { hasText: 'Title In' }) });
  await titleInRow.locator('.ctl-row-label').click();
  await expect(titleInRow.getByRole('button', { name: 'Learn' }).first()).toBeVisible();
});

test('Controls exposes MIDI CC value rule controls for fader bindings', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');
  await request.patch('http://127.0.0.1:4000/api/midi/bindings/live', {
    data: {
      device: 'any',
      deviceName: 'AKAI MPK mini',
      type: 'cc',
      channel: 1,
      controller: 7,
      valueMode: 'gte',
      value: 100,
    },
  });

  await page.getByRole('button', { name: /SETTINGS/i }).click();
  await page.getByRole('button', { name: /Controls/i }).click();

  const liveRow = page.locator('.ctl-row').filter({ has: page.locator('.ctl-row-name', { hasText: 'Live' }) });
  await liveRow.locator('.ctl-row-label').click();

  await expect(liveRow.getByText('CC Value')).toBeVisible();
  await expect(liveRow.locator('select')).toHaveValue('gte');
  await expect(liveRow.locator('input[type="number"]')).toHaveValue('100');
});

test('Add Title modal uses app-styled mode and upload controls', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');

  await page.getByRole('button', { name: /CONFIG/i }).click();
  await page.getByRole('button', { name: '+ Add Title' }).click();

  const modal = page.locator('.modal-card').filter({ hasText: 'Add Title' });
  await expect(modal).toBeVisible();

  const modeControl = modal.locator('.seg-control-v3');
  await expect(modeControl).toBeVisible();
  await expect(modeControl.locator('.seg-button-v3.is-active')).toHaveText('Local');
  await expect(modeControl).toHaveCSS('border-radius', '6px');
  await expect(modeControl.locator('.seg-button-v3.is-active')).toHaveCSS('background-color', 'rgb(32, 32, 42)');

  await modeControl.getByRole('button', { name: 'vMix Title' }).click();
  await expect(modeControl.locator('.seg-button-v3.is-active')).toHaveText('vMix Title');
  await expect(modeControl.locator('.seg-button-v3.is-active')).toHaveCSS('color', 'rgb(106, 163, 255)');

  const dropZone = modal.locator('.template-drop-zone');
  await expect(dropZone.locator('.add-title-file-picker')).toBeVisible();
  await expect(dropZone.locator('.add-title-file-button')).toHaveText('Choose files');
  await expect(dropZone.locator('.add-title-file-name')).toHaveText('No file selected');
  await expect(dropZone.locator('.add-title-file-input')).toHaveCSS('opacity', '0');
});
