# Web Title Pro 0.4.2 Pre-release

Patch release on top of the `0.4.x` staging branch, focused on project bundle correctness and cleanup after the `0.4.1` pre-release.

## English

### Highlights

- Project bundle export/import:
  - `.wtpkg` now includes the complete project document with outputs, local titles, vMix titles, timers, data sources, app integrations, keyboard shortcuts, global shortcut flags, MIDI bindings, and vMix settings.
  - `project-summary.json` is included beside `project.json` and `manifest.json` for quick archive verification.
  - Export summary now reports outputs, titles, data sources, discovered vMix inputs, and bundled custom templates.
  - Runtime vMix input discovery is captured at export time in `project.json.runtime.vmix.inputs`.
- Bundle code cleanup:
  - Manifest and summary counts now share one project-data reader to avoid duplicated counting logic.
  - vMix runtime serialization keeps numeric `0` values instead of converting them to empty strings.
  - Export feedback no longer contains an unreachable branch.
  - Frequently polled vMix state is stored through a ref during project export to avoid unnecessary callback churn.
- Documentation:
  - Project memory now documents exactly which settings are saved in `.wtpkg`.
  - Known non-bundle state is documented: window size/position, recent-project history, and browser-local Live Notes.

### Verification

- `npm.cmd run test:all`
- `npm.cmd run package:win`

## Русский

### Главное

- Export/import project bundle:
  - `.wtpkg` теперь содержит полный документ проекта: outputs, локальные титры, vMix титры, таймеры, data sources, настройки интеграций, keyboard shortcuts, global shortcut flags, MIDI bindings и настройки vMix.
  - `project-summary.json` добавлен рядом с `project.json` и `manifest.json`, чтобы архив можно было быстро проверить без ручного разбора всего проекта.
  - После экспорта UI показывает количество outputs, titles, data sources, найденных vMix inputs и вложенных custom templates.
  - Список найденных vMix inputs сохраняется на момент экспорта в `project.json.runtime.vmix.inputs`.
- Чистка bundle-кода:
  - Подсчеты для manifest и summary теперь идут через общий reader, без дублирования логики.
  - Сериализация runtime vMix больше не превращает числовой `0` в пустую строку.
  - Убрана недостижимая ветка в сообщении об export bundle.
  - Часто обновляемое состояние vMix хранится через ref при экспорте проекта, чтобы не пересоздавать callbacks на каждом polling-обновлении.
- Документация:
  - Project memory теперь явно описывает, какие настройки сохраняются в `.wtpkg`.
  - Отдельно указано, что не входит в bundle: размер/позиция окна, история recent projects и browser-local Live Notes.

### Проверка

- `npm.cmd run test:all`
- `npm.cmd run package:win`

## Known Limitations / Известные ограничения

- vMix ON AIR state is still based on the last command sent by Web Title Pro, not on live vMix readback.
- MIDI bindings currently react to `noteon` and positive `cc` messages.
- Browser-local Live Notes are not part of the project bundle yet because they currently live in localStorage.
