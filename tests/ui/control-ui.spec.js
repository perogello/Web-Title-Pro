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
  // Exact match: the preview overlay's pop-out buttons ("Open Preview … in
  // separate window") would ambiguously match a loose /Preview/i.
  await expect(page.getByRole('button', { name: 'Preview ▾' })).toBeVisible();

  await page.getByRole('button', { name: /Notes/i }).click();
  const notes = page.getByRole('textbox', { name: 'Notes editor' });
  await expect(notes).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply text colour' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply fill colour' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear background' })).toBeHidden();
  await page.getByRole('button', { name: 'Choose fill colour' }).click();
  await expect(page.getByRole('menu', { name: 'Fill menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear background' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Fill menu' })).toBeHidden();
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

  // Custom colour: dragging inside the system picker (input events) must not
  // touch the text; the colour is applied once, on change (picker closed).
  const htmlBeforeTextColorDrag = await notes.evaluate((editor) => editor.innerHTML);
  await page.getByRole('button', { name: 'Choose text colour' }).click();
  const customTextColor = page.getByLabel('Text colour menu: custom colour');
  await customTextColor.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const color of ['#ff0000', '#00ff00', '#0000ff', '#cc00ff', '#ffaa00']) {
      setter.call(input, color);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(await notes.evaluate((editor) => editor.innerHTML)).toBe(htmlBeforeTextColorDrag);
  await customTextColor.evaluate((input) => {
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
  await page.getByRole('button', { name: 'Choose fill colour' }).click();
  await expect(page.getByRole('menu', { name: 'Fill menu' })).toBeVisible();
  const customFillColor = page.getByLabel('Fill menu: custom colour');
  await customFillColor.evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    for (const color of ['#111111', '#223344', '#334455', '#445566', '#556677']) {
      setter.call(input, color);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(await notes.evaluate((editor) => editor.innerHTML)).toBe(htmlBeforeFillColorDrag);
  await customFillColor.evaluate((input) => input.dispatchEvent(new Event('change', { bubbles: true })));
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('note');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(85, 102, 119)');
  await page.getByRole('button', { name: 'Choose fill colour' }).click();
  await page.getByRole('button', { name: 'Clear background' }).click();
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).not.toContain('rgb(85, 102, 119)');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('Director');
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(255, 209, 102)');

  // A swatch applies immediately and keeps the selection for the next command.
  await page.getByRole('button', { name: 'Choose text colour' }).click();
  await page.getByRole('button', { name: '#4dabf7' }).click();
  await expect.poll(async () => notes.evaluate((editor) => editor.innerHTML)).toContain('rgb(77, 171, 247)');
  expect(await page.evaluate(() => window.getSelection().toString())).toBe('Director note');

  // A partial "None" fill clears only the selected word.
  await page.getByRole('button', { name: 'Apply fill colour' }).click();
  await selectText('note');
  await page.getByRole('button', { name: 'Choose fill colour' }).click();
  await page.getByRole('button', { name: 'Clear background' }).click();
  const fills = await notes.evaluate((editor) => {
    const result = {};
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue.trim();
      // background-color isn't inherited: take the nearest painted ancestor.
      let element = walker.currentNode.parentElement;
      let color = 'rgba(0, 0, 0, 0)';
      while (element && element !== editor) {
        const value = window.getComputedStyle(element).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
          color = value;
          break;
        }
        element = element.parentElement;
      }
      if (text) result[text] = color;
    }
    return result;
  });
  expect(fills.Director).toBe('rgb(85, 102, 119)');
  expect(fills.note).not.toBe('rgb(85, 102, 119)');

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

  // Shortcut model v2 keys everything by canonical action ids. Bind a CC to a
  // real per-output command (Title IN) and assert the value-rule controls show
  // up on that row inside the output's section.
  const state = await (await request.get('http://127.0.0.1:4000/api/state')).json();
  const outputId = state.outputs[0].id;
  const action = `output:${outputId}:titleIn`;
  await request.patch(`http://127.0.0.1:4000/api/midi/bindings/${encodeURIComponent(action)}`, {
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

  const titleInRow = page
    .locator('.ctl-row')
    .filter({ has: page.locator('.ctl-row-name', { hasText: 'Title IN' }) });
  await titleInRow.locator('.ctl-row-label').click();

  await expect(titleInRow.getByText('CC Value')).toBeVisible();
  await expect(titleInRow.locator('select')).toHaveValue('gte');
  await expect(titleInRow.locator('input[type="number"]')).toHaveValue('100');
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

test('Preview overlay: embed frames, PVW bus, pop-out and Live-tab gating', async ({ page, request }) => {
  await seedSourceLibrary(page);
  await waitForBackend(request);

  const apiState = async () =>
    (await request.get('http://127.0.0.1:4000/api/state')).json();
  const before = await apiState();
  const output = before.outputs?.[0];
  const previousSelectedEntryId = output?.selectedEntryId || null;

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Live', exact: true }).click();

    await page.getByRole('button', { name: 'Preview ▾' }).click();
    const overlay = page.locator('.preview-overlay-v2');
    await expect(overlay).toHaveClass(/is-open/);

    // Both in-app frames must load the scaled embed page; the live frame must
    // NOT load the raw ?output= URL (the old bug showed a 1920x1080 corner).
    const srcs = await overlay
      .locator('.preview-frame-v2 iframe')
      .evaluateAll((els) => els.map((el) => el.getAttribute('src')));
    expect(srcs.length).toBe(2);
    for (const src of srcs) expect(src).toContain('embed=1');
    expect(srcs[0]).toContain('preview=1');
    expect(srcs[1]).not.toContain('preview=1');

    // Frames keep a strict 16:9 footprint.
    const box = await overlay.locator('.preview-frame-v2').first().boundingBox();
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);

    // PVW IN needs a selected title; pick the first entry if none is set.
    const pvwIn = overlay.locator('.pvw-cmd.is-in');
    if (await pvwIn.isDisabled()) {
      const entryId = before.entries?.[0]?.id;
      expect(entryId).toBeTruthy();
      await request.post(`http://127.0.0.1:4000/api/entries/${entryId}/select`, {
        data: { outputId: output?.id },
      });
      await expect(pvwIn).toBeEnabled();
    }

    await pvwIn.click();
    await expect
      .poll(async () => (await apiState()).outputs?.[0]?.previewProgram?.visible)
      .toBe(true);

    await overlay.locator('.pvw-cmd.is-out').click();
    await expect
      .poll(async () => (await apiState()).outputs?.[0]?.previewProgram?.visible)
      .toBe(false);

    // Pop-out falls back to window.open outside Electron.
    const popupPromise = page.waitForEvent('popup');
    await overlay.locator('.pf-popout').first().click();
    const popup = await popupPromise;
    expect(popup.url()).toContain('preview=1');
    await popup.close();

    // The overlay lives only on the Live tab.
    await page.getByRole('button', { name: 'Config', exact: true }).click();
    await expect(overlay).not.toHaveClass(/is-open/);
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(overlay).toHaveClass(/is-open/);
    await expect(overlay.locator('.preview-resize-handle')).toBeVisible();
  } finally {
    // Restore the operator's original selection in the shared dev state.
    if (previousSelectedEntryId) {
      await request.post(`http://127.0.0.1:4000/api/entries/${previousSelectedEntryId}/select`, {
        data: { outputId: output?.id },
      });
    }
    await request.post('http://127.0.0.1:4000/api/preview/hide', {
      data: { outputId: output?.id },
    });
  }
});

test('Data sources migrate from localStorage to the server on load', async ({ page, request }) => {
  // Clear any server-side sources first so we prove the migration path.
  await waitForBackend(request);
  await request.put('http://127.0.0.1:4000/api/sources', { data: { items: [] } });

  // Seed a legacy browser-only source, then load the app.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'web-title-pro-source-library',
      JSON.stringify([
        {
          id: 'legacy-src',
          name: 'Legacy Roster',
          delimiter: ',',
          linkedTimerId: null,
          linkedTimerByOutput: {},
          remote: null,
          columns: [{ id: 'col-0', label: 'Name' }],
          rows: [
            { id: 'lr1', index: 1, values: ['Migrated Row'], label: 'Migrated Row', timer: { baseMs: 0, format: 'mm:ss' } },
          ],
        },
      ]),
    );
  });

  await page.goto('/');

  // The client should push the legacy library to the server on mount.
  await expect
    .poll(async () => {
      const sources = await (await request.get('http://127.0.0.1:4000/api/sources')).json();
      return sources.map((s) => s.name);
    }, { timeout: 5000 })
    .toContain('Legacy Roster');

  // And the same sources are now in the live snapshot for any consumer.
  const state = await (await request.get('http://127.0.0.1:4000/api/state')).json();
  const migrated = state.sources.find((s) => s.name === 'Legacy Roster');
  expect(migrated?.rows?.[0]?.values?.[0]).toBe('Migrated Row');

  // Clean up shared dev state.
  await request.put('http://127.0.0.1:4000/api/sources', { data: { items: [] } });
});

const seedCustomSources = async (page, sources) => {
  await page.addInitScript((items) => {
    window.localStorage.setItem('web-title-pro-source-library', JSON.stringify(items));
  }, sources);
};

const makeSource = (rows) => ({
  id: 'ui-regress-source',
  name: 'UI Regress Source',
  delimiter: ',',
  linkedTimerId: null,
  linkedTimerByOutput: {},
  remote: null,
  columns: [
    { id: 'col-0', label: 'Name' },
    { id: 'col-1', label: 'Role' },
  ],
  rows: rows.map((values, index) => ({
    id: `rr-${index + 1}`,
    index: index + 1,
    values,
    label: values.join(' | '),
    timer: { baseMs: 0, format: 'mm:ss' },
  })),
});

test('Data: a click that misses a row action button does not apply that row', async ({ page, request }) => {
  await waitForBackend(request);
  const apiState = async () => (await request.get('http://127.0.0.1:4000/api/state')).json();
  const before = await apiState();
  const output = before.outputs?.[0];
  const previousSelectedEntryId = output?.selectedEntryId || null;
  const previousSources = await (await request.get('http://127.0.0.1:4000/api/sources')).json();
  const entry = before.entries.find((item) => (item.templateFields || []).length >= 2);
  expect(entry).toBeTruthy();

  try {
    await request.post(`http://127.0.0.1:4000/api/entries/${entry.id}/select`, { data: { outputId: output.id } });
    await seedCustomSources(page, [makeSource([['Alice', 'Host'], ['Bob', 'Guest']])]);
    await page.goto('/');
    await page.getByRole('button', { name: /DATA/i }).click();

    const row1 = page.locator('.source-table tr[data-source-row-id="rr-1"]');
    const row2 = page.locator('.source-table tr[data-source-row-id="rr-2"]');
    await row1.locator('td').nth(1).click();
    await expect(row1).toHaveClass(/is-active-source-row/);

    // Click the padding of row 2's actions cell — next to, not on, the Edit
    // button. This used to bubble to the row and send it to air.
    await row2.locator('td.source-row-actions-cell').click({ position: { x: 2, y: 2 } });
    await page.waitForTimeout(300);
    await expect(row1).toHaveClass(/is-active-source-row/);
    await expect(row2).not.toHaveClass(/is-active-source-row/);

    // Edit itself still works and doesn't apply the row either.
    await row2.getByRole('button', { name: 'Edit row' }).click();
    await expect(row2.locator('input.source-table-input').first()).toBeVisible();
    await expect(row2).not.toHaveClass(/is-active-source-row/);
    const fields = (await apiState()).entries.find((item) => item.id === entry.id)?.fields || {};
    expect(Object.values(fields)).not.toContain('Bob');
  } finally {
    await request.put('http://127.0.0.1:4000/api/sources', { data: { items: previousSources } });
    if (previousSelectedEntryId) {
      await request.post(`http://127.0.0.1:4000/api/entries/${previousSelectedEntryId}/select`, { data: { outputId: output.id } });
    }
  }
});

test('Live: a column can be dragged narrower than its text without growing the row', async ({ page, request }) => {
  await waitForBackend(request);
  const previousSources = await (await request.get('http://127.0.0.1:4000/api/sources')).json();

  try {
    await seedCustomSources(page, [makeSource([
      ['Alice', 'Senior correspondent covering the regional elections tonight'],
      ['Bob', 'Guest'],
    ])]);
    await page.goto('/');
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    const table = page.locator('table.source-v2');
    await expect(table).toBeVisible();
    const rowHeight = await table.locator('tbody tr').first().evaluate((row) => row.offsetHeight);

    // Drag the Role column's right edge to just past its left edge — far
    // narrower than "Senior correspondent…" — staying inside the viewport.
    const header = table.locator('th').nth(2);
    const headerBox = await header.boundingBox();
    const box = await header.locator('.col-resizer').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(headerBox.x + 20, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const metrics = await table.evaluate((element) => {
      const col = element.querySelector('col[data-col-id="col-1"]');
      const cell = element.querySelector('tbody tr td:nth-child(3)');
      const text = cell.querySelector('.cell-text');
      return {
        colWidth: col.offsetWidth,
        cellWidth: cell.offsetWidth,
        rowHeight: cell.parentElement.offsetHeight,
        textFits: text.offsetHeight <= cell.clientHeight,
      };
    });
    expect(metrics.colWidth).toBeLessThan(60);
    expect(metrics.cellWidth).toBe(metrics.colWidth);
    expect(metrics.rowHeight).toBe(rowHeight);
    expect(metrics.textFits).toBe(true);
  } finally {
    await request.put('http://127.0.0.1:4000/api/sources', { data: { items: previousSources } });
  }
});

test('Live: notes are available even with no data source', async ({ page, request }) => {
  await waitForBackend(request);
  const previousSources = await (await request.get('http://127.0.0.1:4000/api/sources')).json();

  try {
    await request.put('http://127.0.0.1:4000/api/sources', { data: { items: [] } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.getByText('No source', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Notes/i }).click();
    const notes = page.getByRole('textbox', { name: 'Notes editor' });
    await expect(notes).toBeVisible();
    await notes.fill('Works without data');
    await expect(notes).toContainText('Works without data');
  } finally {
    await request.put('http://127.0.0.1:4000/api/sources', { data: { items: previousSources } });
  }
});

test('Top bar: window controls stay on screen at every window width', async ({ page, request }) => {
  await waitForBackend(request);
  await page.addInitScript(() => {
    window.webTitleDesktop = {
      minimizeWindow() {},
      toggleMaximizeWindow() {},
      closeWindow() {},
      getWindowState: async () => ({ ok: true, isMaximized: false }),
      onWindowStateChanged: () => () => {},
    };
  });
  await page.goto('/');
  const controls = page.locator('.window-controls-v2');
  await expect(controls).toBeVisible();

  for (const width of [1400, 1200, 1050, 950, 860, 760, 680, 560]) {
    await page.setViewportSize({ width, height: 700 });
    await expect.poll(async () => controls.evaluate((element) => {
      const header = element.closest('.topbar-v2').getBoundingClientRect();
      return element.getBoundingClientRect().right <= Math.min(header.right, window.innerWidth) + 0.5;
    }), { message: `controls clipped at ${width}px` }).toBe(true);
  }
});

test('Config: outputs rename inline and titles show which outputs use them', async ({ page, request }) => {
  await waitForBackend(request);
  const apiState = async () => (await request.get('http://127.0.0.1:4000/api/state')).json();
  const before = await apiState();
  const created = await (await request.post('http://127.0.0.1:4000/api/outputs', { data: {} })).json();
  const entry = before.entries.find((item) => (item.templateFields || []).length >= 1) || before.entries[0];
  const original = before.outputs[0];

  try {
    for (const output of [original, created]) {
      await request.post(`http://127.0.0.1:4000/api/entries/${entry.id}/select`, { data: { outputId: output.id } });
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Config', exact: true }).click();

    // Rename via the pencil: inline input, Enter commits.
    const outputRow = page.locator('.config-item-v2').filter({ hasText: created.name }).first();
    await outputRow.getByRole('button', { name: 'Rename output' }).click();
    const input = page.getByRole('textbox', { name: 'Output name' });
    await expect(input).toBeFocused();
    await input.fill('Studio Renamed');
    await input.press('Enter');
    await expect.poll(async () => (await apiState()).outputs.find((o) => o.id === created.id)?.name).toBe('Studio Renamed');

    // Escape cancels.
    const renamedRow = page.locator('.config-item-v2').filter({ hasText: 'Studio Renamed' }).first();
    await renamedRow.getByRole('button', { name: 'Rename output' }).click();
    await page.getByRole('textbox', { name: 'Output name' }).fill('Should not stick');
    await page.getByRole('textbox', { name: 'Output name' }).press('Escape');
    await page.waitForTimeout(300);
    expect((await apiState()).outputs.find((o) => o.id === created.id)?.name).toBe('Studio Renamed');

    // The title used by both outputs shows compact numbered markers, and the
    // Titles card names the output a click assigns to.
    const titleRow = page.locator('.config-item-v2:has(.config-assign-radio-v2)').filter({ hasText: entry.name }).first();
    await expect(titleRow.locator('.config-entry-outputs-v2 .config-output-num-v2')).toHaveCount(2);
    await renamedRow.locator('.main').click();
    await expect(page.locator('.config-assign-hint-v2')).toContainText('Studio Renamed');
    await expect(titleRow).toHaveClass(/is-assigned/);
  } finally {
    await request.delete(`http://127.0.0.1:4000/api/outputs/${created.id}`);
    if (original.selectedEntryId) {
      await request.post(`http://127.0.0.1:4000/api/entries/${original.selectedEntryId}/select`, { data: { outputId: original.id } });
    }
  }
});

test('File shortcuts: Ctrl+S is wired and its result is shown to the operator', async ({ page, request }) => {
  await waitForBackend(request);
  await page.goto('/');
  await expect(page.locator('.topbar-v2')).toBeVisible();
  // Outside the desktop app saving isn't available — but the shortcut must
  // reach saveProject and the message must actually be displayed.
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('alert')).toContainText('desktop app only');
});

test('Settings: notifications can be set to all / errors only / none', async ({ page, request }) => {
  await waitForBackend(request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /System/ }).click();
  const group = page.getByRole('radiogroup', { name: 'Notifications' });
  await expect(group).toBeVisible();

  // Errors only: an error still shows (red), an info message doesn't.
  await group.getByRole('radio', { name: 'Только ошибки' }).click();
  await expect(group.getByRole('radio', { name: 'Только ошибки' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('alert')).toContainText('desktop app only');
  await page.getByRole('button', { name: 'Config', exact: true }).click();
  await page.getByRole('button', { name: '+ Add Output' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('status')).toHaveCount(0);

  // None: nothing at all, and the choice survives a reload.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /System/ }).click();
  await group.getByRole('radio', { name: 'Никакие' }).click();
  await page.reload();
  await expect(page.locator('.topbar-v2')).toBeVisible();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(400);
  await expect(page.locator('.feedback-toast-v2')).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('wtp.notifications'))).toBe('none');

  // Clean up the output this test added.
  const state = await (await request.get('http://127.0.0.1:4000/api/state')).json();
  const added = state.outputs[state.outputs.length - 1];
  if (state.outputs.length > 1) await request.delete(`http://127.0.0.1:4000/api/outputs/${added.id}`);
});

test('Settings: Companion module card shows the module path, package and guide', async ({ page, request }) => {
  await waitForBackend(request);
  const info = await (await request.get('http://127.0.0.1:4000/api/companion-module')).json();
  expect(info.available, 'run npm run build:companion first').toBe(true);

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav-item', { hasText: 'Integrations' }).click();
  const card = page.locator('.companion-settings-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(`v${info.version}`);
  await expect(card).toContainText(info.folder);
  await expect(card).toContainText('Import module package');

  const download = page.waitForEvent('download');
  await card.getByRole('link', { name: 'Скачать' }).click();
  expect((await download).suggestedFilename()).toBe(`web-title-pro-${info.version}.tgz`);

  // The Controls tab links to the card.
  await page.locator('.settings-nav-item', { hasText: 'Controls' }).click();
  await page.getByRole('button', { name: 'Модуль Companion…' }).click();
  await expect(card).toBeVisible();
});

test('Controls: each command shows the exact Companion fields to copy', async ({ page, request }) => {
  await waitForBackend(request);
  const state = await (await request.get('http://127.0.0.1:4000/api/state')).json();
  const output = state.outputs[0];

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-nav-item', { hasText: 'Controls' }).click();
  await page.locator('.ctl-row .ctl-row-label').first().click();

  const fields = page.locator('.ctl-detail-row-cp').first();
  await expect(fields).toContainText('Output: command');
  await expect(fields).toContainText(`#1 ${output.name}`);
  await expect(fields).toContainText('Title IN (show on air)');
  await expect(fields).toContainText('/api/command');
  await expect(fields).toContainText(JSON.stringify({ actionId: `output:${output.id}:titleIn` }));
  await expect(fields).toContainText('header input(JSON)');
  await expect(fields.locator('.ctl-cp-copy')).toHaveCount(3);
});
