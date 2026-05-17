# Web Title Pro 0.3.1

## RU

Патч после 0.3.0.

- **Единый набор actions** во вкладках Shortcuts / MIDI / Bitfocus —
  Commands, Outputs, Title entries, Timers (toggle + reset). В
  Bitfocus раньше отсутствовали entries и timers.
- **MIDI tab**: Learn-режим теперь подсвечивает строку самого action
  и показывает Cancel в той же строке (как в Shortcuts).
- **MIDI Monitor**: новая панель в Settings → MIDI с последними
  50 сырыми сообщениями от контроллера (hex bytes + распарсенный
  тип). Помогает диагностировать контроллеры (APC mini и пр.) если
  бинды не срабатывают.
- Новый endpoint `POST /api/timers/<id>/toggle` для Bitfocus.

## EN

Patch on top of 0.3.0.

- **Unified action set** across Shortcuts / MIDI / Bitfocus tabs —
  Commands, Outputs, Title entries, Timers (toggle + reset). Bitfocus
  was previously missing entries and timers.
- **MIDI tab**: Learn now highlights the action row inline with a
  Cancel button (same UX as Shortcuts).
- **MIDI Monitor**: new panel in Settings → MIDI showing the last 50
  raw messages from the connected controller (hex bytes + parsed
  type). Useful for diagnosing controllers (APC mini etc.) when
  bindings don't fire.
- New endpoint `POST /api/timers/<id>/toggle` for Bitfocus.
