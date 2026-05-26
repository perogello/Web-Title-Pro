# MIDI Controls

## English

Web Title Pro supports MIDI Learn for keyboard-style controllers, pads, buttons, knobs, and faders.

### Basic Flow

1. Open `Settings -> Controls`.
2. Press `Refresh MIDI`.
3. Check that your controller appears in `Inputs`.
4. Expand an action row.
5. In the MIDI row, press `Learn`.
6. Press a key/pad/button or move a knob/fader.

The learned binding is stored with:

- event type: `noteon` or `cc`
- channel: `1-16`
- note or controller number: `0-127`
- optional CC value rule
- display-only device name

Bindings use `device: any` by default so they keep working after unplug/replug cycles where Windows changes the device name.

### Buttons And Pads

Most MIDI buttons/pads send `noteon`. These work directly after Learn.

Some controllers send buttons as `cc` with `value 127` on press and `value 0` on release. Web Title Pro triggers only positive CC values, so release events do not fire actions.

### Faders And Knobs

Faders and knobs usually send `cc` messages with a `value` from `0` to `127`.

For CC bindings, the UI shows `CC Value`:

- `Any movement` - trigger on any positive movement.
- `Exactly` - trigger only when `value == N`.
- `At or above` - trigger when `value >= N`.
- `At or below` - trigger when `value <= N`.

Examples:

- Trigger a title when a fader reaches the top: `At or above 120`.
- Trigger a reset when a fader is pulled down: `At or below 5`.
- Trigger only on a specific encoder value: `Exactly 64`.

### Diagnostics

The Controls tab shows:

- `Inputs` - detected MIDI input ports.
- `Last` - last received MIDI message.
- `Error` - port open errors from the MIDI backend.

If Learn does not bind, move/press the controller and check whether `Last` changes.

## Русский

Web Title Pro поддерживает MIDI Learn для клавиш, pads, кнопок, крутилок и фейдеров.

### Базовый сценарий

1. Открой `Settings -> Controls`.
2. Нажми `Refresh MIDI`.
3. Проверь, что контроллер появился в `Inputs`.
4. Раскрой строку нужного действия.
5. В строке MIDI нажми `Learn`.
6. Нажми клавишу/pad/кнопку или двинь knob/fader.

Binding сохраняет:

- тип события: `noteon` или `cc`
- канал: `1-16`
- note или controller number: `0-127`
- опциональное правило CC value
- имя устройства только для отображения

По умолчанию bindings используют `device: any`, чтобы они продолжали работать после отключения/подключения контроллера, когда Windows меняет имя MIDI-порта.

### Кнопки и pads

Большинство MIDI-кнопок и pads отправляют `noteon`. После Learn они работают сразу.

Некоторые контроллеры отправляют кнопки как `cc`: `value 127` при нажатии и `value 0` при отпускании. Web Title Pro запускает действие только на positive CC, поэтому отпускание не вызывает повторный trigger.

### Фейдеры и крутилки

Фейдеры и knobs обычно отправляют `cc` с `value` от `0` до `127`.

Для CC bindings в UI появляется `CC Value`:

- `Any movement` - любое положительное движение.
- `Exactly` - только когда `value == N`.
- `At or above` - когда `value >= N`.
- `At or below` - когда `value <= N`.

Примеры:

- Запустить титр, когда фейдер поднят вверх: `At or above 120`.
- Сбросить действие, когда фейдер опущен вниз: `At or below 5`.
- Сработать на конкретном значении энкодера: `Exactly 64`.

### Диагностика

Во вкладке Controls отображается:

- `Inputs` - найденные MIDI input ports.
- `Last` - последнее принятое MIDI-сообщение.
- `Error` - ошибки открытия портов MIDI backend.

Если Learn не биндит действие, нажми/двинь контроллер и проверь, меняется ли `Last`.
