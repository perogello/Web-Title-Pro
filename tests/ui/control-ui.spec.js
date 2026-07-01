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
            {
              id: 'row-2',
              index: 2,
              values: ['Bob', 'Guest'],
              label: 'Bob | Guest',
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
  // Exact match: the top bar now also has a "Live-edit" status chip that a
  // loose /LIVE/i would ambiguously match alongside the Live tab.
  await page.getByRole('button', { name: 'Live', exact: true }).click();

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
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(window.localStorage.getItem('web-title-pro.liveNotes') || 'null');
    const legacyKeys = Object.keys(window.localStorage).filter((key) => key.startsWith('web-title-pro:live-notes:'));
    return { text: saved?.text || '', legacyCount: legacyKeys.length };
  })).toEqual({ text: 'Director note', legacyCount: 0 });

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

  const boldButton = page.getByRole('button', { name: 'Bold' });
  const italicButton = page.getByRole('button', { name: 'Italic' });

  await notes.evaluate((editor) => {
    editor.innerHTML = '';
    editor.focus();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type) => (type === 'text/plain' ? 'Yandex styled text' : '<b style="font-family: serif; color: red">Yandex styled text</b>'),
      },
    });
    editor.dispatchEvent(event);
  });
  await expect(notes).toContainText('Yandex styled text');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).not.toContain('font-family');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).not.toContain('serif');
  await selectText('Yandex');
  await boldButton.click();
  await expect(boldButton).toHaveClass(/is-active/);
  await boldButton.click();
  await expect.poll(async () => notes.evaluate((editor) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !textNode.nodeValue.includes('Yandex')) {
      textNode = walker.nextNode();
    }
    const element = textNode?.parentElement;
    return element ? window.getComputedStyle(element).fontWeight : '';
  })).not.toMatch(/700|bold/);

  await notes.fill('Director note');
  await selectText('Director');
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

  await page.getByRole('button', { name: /DATA/i }).click();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(notes).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('web-title-pro.liveNotesOpen'))).toBe('true');

  await page.getByRole('button', { name: /Notes/i }).click();
  await expect(notes).toBeHidden();
  await page.getByRole('button', { name: /DATA/i }).click();
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(notes).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('web-title-pro.liveNotesOpen'))).toBe('false');

  expect(consoleErrors).toEqual([]);
});

test('Data manual text source textarea auto-grows without manual resize handle', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');

  await page.getByRole('button', { name: /DATA/i }).click();

  const textarea = page.locator('textarea.source-manual-textarea');
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveCSS('resize', 'none');

  const initialHeight = await textarea.evaluate((element) => element.getBoundingClientRect().height);
  await textarea.fill(Array.from({ length: 18 }, (_, index) => `Row ${index + 1}|Value`).join('\n'));
  await expect.poll(() => textarea.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(initialHeight + 20);

  const firstRow = page.locator('[data-source-row-id="row-1"]');
  const secondRow = page.locator('[data-source-row-id="row-2"]');
  await expect(firstRow).toContainText('Alice');
  await expect(secondRow).toContainText('Bob');
  await firstRow.locator('.source-row-drag-handle').dragTo(secondRow);
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(window.localStorage.getItem('web-title-pro-source-library') || '[]');
    return library[0]?.rows?.map((row) => `${row.index}:${row.values[0]}`).join('|') || '';
  })).toBe('1:Bob|2:Alice');
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

test('Config: Mapping shows field/column labels and each title row has a duplicate button', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);
  await page.goto('/');

  await page.getByRole('button', { name: /CONFIG/i }).click();

  // Title rows expose a Duplicate action (read-only assertion — no click, so we
  // don't mutate the backend's title list). Only title rows carry this button.
  await expect(page.locator('button[title="Duplicate title"]').first()).toBeVisible();

  // Selecting a title reveals the Mapping card with labelled columns so it's
  // clear what each side of the row maps.
  const firstTitle = page.locator('button[title="Duplicate title"]').first()
    .locator('xpath=ancestor::*[contains(@class,"config-item-v2")]');
  await firstTitle.locator('.main').click();
  const mappingHead = page.locator('.mapping-row-v2-head');
  await expect(mappingHead).toBeVisible();
  await expect(mappingHead.locator('span').nth(0)).toHaveText('Поле в титре');
  await expect(mappingHead.locator('span').nth(1)).toHaveText('Столбец в источнике данных');
});

test('Timers: a running countdown visibly ticks down in the UI', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);

  // Create a dedicated timer via the API, then clean it up at the end so the
  // shared dev state is left untouched.
  const created = await request.post('http://127.0.0.1:4000/api/timers', {
    data: { name: 'UI Tick Test', mode: 'countdown', durationMs: 90_000, valueMs: 90_000 },
  });
  const timer = await created.json();

  try {
    await page.goto('/');
    await page.getByRole('button', { name: /TIMERS/i }).click();

    const panel = page.locator('.timer-panel').filter({ hasText: 'UI Tick Test' });
    await expect(panel).toBeVisible();

    // Start it and confirm the big readout switches to the live (red) value and
    // the displayed number actually decreases — the bug was that it never moved.
    await panel.locator('.timer-state-btn-v2').first().click();
    const readout = panel.locator('.timer-readout-edit');
    await expect(readout).toHaveClass(/is-readonly/);

    const first = await readout.textContent();
    await expect
      .poll(async () => readout.textContent(), { timeout: 5000 })
      .not.toBe(first);
  } finally {
    await request.delete(`http://127.0.0.1:4000/api/timers/${timer.id}`);
  }
});
