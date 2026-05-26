# Web Title Pro 0.4.1 Pre-release

Patch release on top of `0.4.0`, focused on Live Notes reliability and small UI polish after the redesign.

## English

### Highlights

- Live Notes rich-text editor fixes:
  - Bold and italic can be toggled on and off reliably.
  - Italic control now uses a slanted `K` marker and larger centered button text.
  - Text color and background color apply to the selected text fragment.
  - Color picker dragging is debounced to avoid freezes while moving through colors.
  - Background color now applies even when Chromium/Electron emits only `input` events and no final `change`.
  - `Clear` background keeps the current selection, so the next text color change applies on the first try.
  - `Clear` is available from the `Fill` control and is positioned beside it so the native color palette does not cover it.
- Live Notes panel polish:
  - Notes panel width can be resized from the left splitter and is persisted.
  - Text, fill, font size, bold, and italic behavior is covered by Playwright regression tests.
- Add Title modal polish:
  - `Local / vMix Title` mode switch now uses the app segmented-control styling.
  - Active vMix mode uses the vMix blue accent.
  - Template upload file picker no longer shows the native gray browser control.
  - Upload drop zone now uses a styled `Choose files` chip and selected-file label.
- Project bundle export/import:
  - `.wtpkg` now always includes `project-summary.json` next to `project.json` and `manifest.json`.
  - Summary lists outputs, local/vMix titles, timers, data sources, bundled custom templates, and discovered vMix inputs.
  - `project.json` now carries a runtime vMix snapshot so the exported archive contains the discovered input list from the export moment.
  - Export feedback now reports how many outputs, titles, data sources, vMix inputs, and custom templates were included.
- Test/build workflow:
  - UI regression coverage expanded for Notes and Add Title modal styling.

### Verification

- `npm.cmd run test:unit`
- `npm.cmd run build`
- `npm.cmd run test:ui`
- `npm.cmd run test:all`
- Windows portable build via `npm.cmd run package:win`

## Русский

### Главное

- Исправлен rich-text редактор Notes:
  - Жирность и курсив теперь корректно включаются и выключаются повторно.
  - Курсив отображается наклонной буквой `K`, кнопки стали крупнее и центрированы.
  - Цвет текста и цвет фона применяются к выделенному фрагменту, а не ко всей заметке.
  - Перетаскивание цвета в палитре обрабатывается с debounce, чтобы не было фризов.
  - Цвет фона применяется даже если Chromium/Electron отправил только `input`, без финального `change`.
  - `Clear` фона сохраняет выделение, поэтому следующий цвет текста применяется с первого раза.
  - `Clear` находится в контроле `Fill` и вынесен в сторону, чтобы нативная палитра его не перекрывала.
- Улучшена панель Notes:
  - Ширину панели можно менять левым разделителем; значение сохраняется.
  - Поведение текста, фона, размера, жирности и курсива покрыто Playwright-регрессиями.
- Полировка модалки Add Title:
  - Переключатель `Local / vMix Title` получил стиль segmented-control приложения.
  - Активный vMix-режим подсвечивается синим vMix-акцентом.
  - Нативная серая кнопка выбора файла больше не отображается.
  - Зона загрузки шаблона использует стилизованную плашку `Choose files` и подпись выбранных файлов.
- Export/import project bundle:
  - `.wtpkg` теперь всегда содержит `project-summary.json` рядом с `project.json` и `manifest.json`.
  - Summary показывает outputs, локальные/vMix титры, таймеры, data sources, вложенные custom templates и обнаруженные vMix inputs.
  - `project.json` теперь содержит runtime-снимок vMix, поэтому в архиве есть список обнаруженных inputs на момент экспорта.
  - После экспорта UI показывает, сколько outputs, titles, data sources, vMix inputs и custom templates попало в bundle.
- Тесты и сборка:
  - Расширено UI-регрессионное покрытие для Notes и стилей Add Title.

### Проверка

- `npm.cmd run test:unit`
- `npm.cmd run build`
- `npm.cmd run test:ui`
- `npm.cmd run test:all`
- Windows portable build через `npm.cmd run package:win`

## Known limitations / Известные ограничения

- vMix ON AIR state is still based on the last command sent by Web Title Pro, not on live vMix readback.
- MIDI bindings currently react to `noteon` and positive `cc` messages.
