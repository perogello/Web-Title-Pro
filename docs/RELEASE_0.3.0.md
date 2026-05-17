# Web Title Pro 0.3.0

## RU

Большой релиз с фокусом на стабильность для эфира, удобство для оператора и
расширение возможностей привязки команд (keyboard / MIDI / Bitfocus).

### Что нового

**Цветовые триггеры таймеров (clockotron-style)**
- У каждого таймера — иконка палитры → окно с настройкой default цвета и
  списком цветовых триггеров по времени.
- При достижении порога таймер автоматически перекрашивается в local title
  и в vMix text field (через `SetTextColour`).
- Цвет считается на сервере, попадает в snapshot `timer.color`. Рендер
  локального титра применяет `style.color` к `[data-timer]` и CSS variable
  `--timer-color` для кастомных шаблонов.

**Унифицированные шорткаты по всем каналам**
- Keyboard / Mouse / MIDI / Bitfocus теперь имеют один и тот же набор
  действий: program (show / load / live / hide), title-next / prev,
  output-select, **entry-select**, **timer-toggle**, **timer-reset**.
- В Settings → Shortcuts четыре секции: Commands, Outputs, **Title entries**,
  **Timers**. Каждый entry/timer можно забиндить через Learn.
- MIDI bindings теперь персистятся в `state.integrations.midi.bindings`.

**Compact / адаптивный режим**
- Минимальный размер окна 1280×820 → **640×480**.
- При width ≤ 900px: табы превращаются в иконки, кнопки Project / Add Title
  скрываются в бургер-меню (⋯), Output chips заменяются на dropdown,
  TITLE IN / LOAD / TITLE OUT — в один ряд.
- При width ≤ 640px: дополнительно скрываются preview / vMix / integration
  cards.

**UI/UX поправки**
- Кнопки переименованы под broadcast-терминологию: SHOW → **TITLE IN**,
  SET → **LOAD**, HIDE → **TITLE OUT** (красная, с pulse-анимацией для
  ON AIR badge).
- Bulk TXT Import удалён (рудимент).
- Learn-режим шортката: подсвечивает строку самого action (зелёный pulse +
  inline "Press a key…"), показывает только кнопку **Cancel** на время
  ожидания. Старый floating блок Learning сверху убран.
- Кнопка LOAD получила tooltip с пояснением назначения.
- Status badge ON AIR / OFF: контраст исправлен с **1.65:1 → 7.5:1**,
  размер 11→12px, tooltip "Last action from this app".
- В Live Data Source: видимые **разделительные линии** между колонками,
  hit-зона ресайз-ручки 9px → **20px**, drag в **Excel-стиле** — колонки
  независимы (table-layout: fixed + snapshot всех ширин при начале drag).
- Модалка цвета таймера — починена вёрстка (color picker + hex + Clear
  в одну строку).

**Стабильность**
- **Atomic write** state.json (tmp + rename) — не битый JSON при
  внезапном kill.
- **Single instance lock** в Electron + second-instance фокусит окно.
- **uncaughtException / unhandledRejection** handlers в server и desktop
  main — больше не падает молча.
- **vMix polling backoff** 1s → 15s exponential при ошибках, reset на
  успех. Лог не спамится при отвалившемся vMix.
- **vMix SetTextColour delta-sync** — посылается только при изменении
  цвета per input/field, не на каждом тике.
- **Splash «не отвечает» исправлено** — jsdom / jzz / xlsx переведены в
  lazy-import. Cold start `import('./server/index.js')` упал с
  ~1.5-2.5s до **~500-700ms**.
- **Startup GitHub error dialog** больше не появляется — сетевые
  ошибки updater'а логируются тихо.
- **Фикс регрессии:** vMix entry ON AIR/OFF badge корректно отслеживает
  последнюю команду из приложения (не сбрасывается обратно в LOAD из-за
  reconcile-логики).

**Bitfocus интеграция**
- Документация на двух языках:
  - [docs/BITFOCUS.md](BITFOCUS.md) — English
  - [docs/BITFOCUS_RU.md](BITFOCUS_RU.md) — Русский
- Используется встроенный Companion Generic HTTP module — без
  установки кастомного плагина. Полный reference HTTP-endpoints, curl
  снипеты, button-preset пример, HTTP-poll feedback для подсветки кнопок
  по состоянию.

**Чистка**
- Удалён дублирующий `start-web-title-pro.cmd` (dev-only PowerShell
  flow, путал конечных пользователей). Единственный launcher теперь —
  `launch-web-title-pro.cmd`, который просто запускает
  `release/WebTitlePro.exe`.

### Технические улучшения

- React shortcut helpers (formatShortcutFromEvent, isTypingTarget) вынесены
  в `client/src/control-shell/shortcut-utils.js` — тестируемы.
- Keyboard/mouse event handler ControlShell вынесен в хук
  `useGlobalShortcuts` (175 строк).
- Тесты: **45/45** (node:test). Покрытие парсеров (MIDI message,
  Updates) + новый regression-тест на ON AIR/OFF поведение vMix entry.

### Известные ограничения

- **vMix two-way state** не реализован. Badge показывает последнюю
  команду из этого приложения, а не реальное состояние титра в vMix.
  Если оператор переключит титр прямо в vMix — наш UI про это не узнает.
- Backend слушает на 0.0.0.0:4000 без аутентификации. В open Wi-Fi venue
  любой в подсети может POST'ить на /api. Изолируй сеть в публичных местах.

### Запуск

Запусти `launch-web-title-pro.cmd` или `release/WebTitlePro.exe`. Ждать
~10 секунд при первом запуске (portable распаковка в %TEMP%).

---

## EN

Major release focused on broadcast-grade stability, operator-friendly UX, and
unified command bindings (keyboard / MIDI / Bitfocus).

### What's new

**Timer color triggers (clockotron-style)**
- Each timer has a palette icon → a window with default color picker and
  a list of time-threshold triggers.
- When the timer crosses a threshold the color is applied to local titles
  and to the vMix text field (via `SetTextColour`).
- Active color is computed server-side and ships in the snapshot as
  `timer.color`. The renderer applies `style.color` to `[data-timer]`
  nodes and also exposes a `--timer-color` CSS variable for custom
  templates.

**Unified shortcut bindings across all channels**
- Keyboard / Mouse / MIDI / Bitfocus all share the same action namespace:
  program (show / load / live / hide), title-next / prev, output-select,
  **entry-select**, **timer-toggle**, **timer-reset**.
- Settings → Shortcuts now has four sections: Commands, Outputs,
  **Title entries**, **Timers**. Every entry and every timer can be bound
  via Learn.
- MIDI bindings persist in `state.integrations.midi.bindings`.

**Compact / responsive layout**
- Minimum window size 1280×820 → **640×480**.
- ≤ 900px: tabs become icon-only, Project / Add Title collapse into a
  burger menu (⋯), Output chips become a dropdown, TITLE IN / LOAD /
  TITLE OUT lay out in a single row.
- ≤ 640px: preview / vMix / integration cards hide entirely.

**UI/UX fixes**
- Top buttons renamed for broadcast clarity: SHOW → **TITLE IN**,
  SET → **LOAD**, HIDE → **TITLE OUT** (red, with pulse animation on ON
  AIR badge).
- Bulk TXT Import removed (legacy feature).
- Shortcut Learn mode highlights the action row itself (green pulse +
  inline "Press a key…") and shows a single **Cancel** button while
  learning. The old floating Learning panel is gone.
- LOAD button now has a tooltip explaining the purpose.
- ON AIR / OFF status badge: contrast lifted from **1.65:1 → 7.5:1**,
  size 11→12px, tooltip "Last action from this app".
- Live Data Source: visible **column dividers**, resize handle hit zone
  9px → **20px**, **Excel-style** dragging (table-layout: fixed plus a
  one-time width snapshot of all sibling columns so they don't reflow).
- Timer color modal: layout fixed (color picker + hex + Clear in one
  row).

**Stability**
- **Atomic write** for state.json (tmp + rename) — no more corrupted
  JSON on sudden kill.
- **Single-instance lock** in Electron; second instance focuses the
  running window.
- **uncaughtException / unhandledRejection** handlers in both server
  and desktop main — silent crashes are now logged.
- **vMix polling backoff** 1s → 15s exponential on errors, resets on
  success. Logs no longer spam when vMix is down.
- **vMix SetTextColour delta-sync** — sent only when color changes per
  input/field, not on every tick.
- **Splash "not responding" fix** — jsdom / jzz / xlsx moved to lazy
  import. Cold-start `import('./server/index.js')` dropped from
  ~1.5-2.5s to **~500-700ms**.
- **Startup GitHub error dialog gone** — updater network failures are
  logged silently.
- **Regression fix:** vMix entry ON AIR/OFF badge correctly tracks the
  last command from this app (no longer reset to LOAD by the reconcile
  pass).

**Bitfocus integration**
- Documentation in two languages:
  - [docs/BITFOCUS.md](BITFOCUS.md) — English
  - [docs/BITFOCUS_RU.md](BITFOCUS_RU.md) — Russian
- Uses Companion's built-in Generic HTTP module — no custom plugin
  install required. Full HTTP endpoint reference, curl snippets, a
  button preset example, and HTTP-poll feedback for state-driven button
  highlighting.

**Cleanup**
- Duplicate `start-web-title-pro.cmd` removed (dev-only PowerShell flow,
  confused end users). The only launcher is now `launch-web-title-pro.cmd`,
  which simply starts `release/WebTitlePro.exe`.

### Technical improvements

- React shortcut helpers (formatShortcutFromEvent, isTypingTarget) extracted
  to `client/src/control-shell/shortcut-utils.js` — testable.
- ControlShell keyboard/mouse event handler extracted into a
  `useGlobalShortcuts` hook (175 lines).
- Tests: **45/45** (node:test). Covers MIDI message + Updates parsers plus
  a new regression test for vMix entry ON AIR/OFF behavior.

### Known limitations

- **vMix two-way state** is not implemented. The badge reflects the last
  command sent from this app, not the actual title state in vMix. If the
  operator switches a title directly in vMix, our UI will not know.
- Backend listens on 0.0.0.0:4000 without authentication. In open Wi-Fi
  venues anyone on the subnet can POST to /api. Isolate the network in
  public spaces.

### Launch

Run `launch-web-title-pro.cmd` or `release/WebTitlePro.exe`. Expect ~10
seconds on first launch (portable extraction into %TEMP%).
