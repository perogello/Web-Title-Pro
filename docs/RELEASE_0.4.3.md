# Web Title Pro 0.4.3 Release

Production release of the `0.4.x` line. This release moves the current redesign/MIDI/project-bundle work to `main`; the staging branch is no longer the release target.

## English

### Highlights

- MIDI reliability:
  - Fixed MIDI refresh/reconnect crash caused by incorrect JZZ port handling.
  - MIDI input ports are now opened through the returned chainable JZZ port.
  - Refresh requests are serialized to avoid double-open/double-close races.
  - MIDI Learn no longer triggers the action while learning.
  - Learned bindings are portable across reconnects by storing `device: any` plus display-only `deviceName`.
- MIDI buttons, pads, knobs, and faders:
  - Note buttons/pads bind to `channel + note`.
  - CC controls bind to `channel + controller`.
  - CC/fader bindings now support value rules: any movement, exactly, at/above, and at/below.
  - The Controls tab shows detected inputs, last MIDI message, and MIDI open errors.
- Project bundle export/import:
  - `.wtpkg` includes `manifest.json`, `project-summary.json`, `project.json`, and referenced custom templates.
  - Project settings in `state.integrations` are preserved, including vMix settings, keyboard/global shortcuts, and MIDI bindings.
  - Export summary reports outputs, titles, data sources, discovered vMix inputs, and custom templates.
- UI and documentation:
  - Current redesign is now the main application UI.
  - Add Title modal and upload controls use the app visual style.
  - README was rewritten with clean bilingual documentation.
  - Added dedicated MIDI documentation.

### Verification

- `npm.cmd run test:all`
- `npm.cmd run package:win`

## Русский

### Главное

- Надежность MIDI:
  - Исправлен crash при MIDI refresh/reconnect из-за неправильного использования JZZ port.
  - MIDI input ports теперь открываются через возвращаемый chainable JZZ port.
  - Refresh-запросы сериализованы, чтобы не было гонок double-open/double-close.
  - MIDI Learn больше не выполняет действие в момент обучения.
  - Learned bindings переживают переподключение контроллера: сохраняется `device: any` и `deviceName` только для отображения.
- MIDI кнопки, pads, knobs и фейдеры:
  - Кнопки/pads на note биндятся по `channel + note`.
  - CC controls биндятся по `channel + controller`.
  - Для CC/fader добавлены value rules: любое движение, точное значение, выше/равно, ниже/равно.
  - В Controls отображаются найденные inputs, последнее MIDI-сообщение и ошибки открытия портов.
- Export/import project bundle:
  - `.wtpkg` содержит `manifest.json`, `project-summary.json`, `project.json` и referenced custom templates.
  - Project settings в `state.integrations` сохраняются, включая vMix settings, keyboard/global shortcuts и MIDI bindings.
  - Export summary показывает outputs, titles, data sources, найденные vMix inputs и custom templates.
- UI и документация:
  - Текущий redesign теперь является основным UI приложения.
  - Add Title modal и upload controls приведены к стилю приложения.
  - README переписан заново в чистой bilingual-документации.
  - Добавлена отдельная MIDI-документация.

### Проверка

- `npm.cmd run test:all`
- `npm.cmd run package:win`

## Known Limitations / Известные ограничения

- vMix ON AIR state is still based on the last command sent by Web Title Pro, not on live vMix readback.
- Browser-local Live Notes are not part of `.wtpkg` yet because they currently live in localStorage.
- MIDI currently supports `noteon` and `cc` for action dispatch. Program Change and Pitch Bend can be added later if a controller workflow needs them.
