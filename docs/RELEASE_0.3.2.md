# Web Title Pro 0.3.2

## RU

- **Глобальные шорткаты**: новый toggle «Global» в каждой строке
  Settings → Shortcuts. Когда включен — шорткат работает даже когда
  окно WTP не в фокусе (через Electron `globalShortcut`). MIDI и
  Bitfocus и так global by design. Mouse-кнопки нельзя сделать
  global (ограничение Electron).
- **Шрифт «забинженной кнопки»** (F5, Ctrl+Space, и т.д.) теперь
  крупнее и читаемее (Segoe UI 14px / 700). «Not assigned» — курсив
  dashed-рамка, чтобы сразу отличать пустые от заполненных.
- Тесты на конвертацию шортката в Electron accelerator и
  register/unregister flow (`global-shortcuts.test.js`, 11 кейсов).

## EN

- **Global shortcuts**: new "Global" toggle on every row in
  Settings → Shortcuts. When on, the shortcut fires even when the
  WTP window is not focused (via Electron `globalShortcut`). MIDI
  and Bitfocus are global by design. Mouse buttons cannot be made
  global (Electron limitation).
- **Binding value font** (F5, Ctrl+Space, etc.) is now larger and
  more readable (Segoe UI 14px / 700). "Not assigned" rows use
  italic dashed border so empty vs filled is obvious at a glance.
- Tests for shortcut-to-Electron-accelerator translation and
  register/unregister flow (`global-shortcuts.test.js`, 11 cases).
