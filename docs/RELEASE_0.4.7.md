# Web Title Pro 0.4.7

## RU

Небольшой релиз с исправлениями MIDI, глобальными заметками и улучшением Data.

- MIDI/Akai: подключение стало устойчивее, с fallback по имени, id и индексу порта, таймаутом открытия и автообновлением при переподключении устройств.
- Live Notes теперь глобальные для приложения и не привязаны к выбранному output или data source.
- В Data поле `Source Rows` само растет вниз по содержимому, ручной resize-уголок убран.
- Добавлены regression-тесты для MIDI, Notes и Data textarea.

SHA-256: `23c4e770f871edb4ef2343c08da4b1f3e37678a5fe8defd9e8dc3298e860396f`

## EN

Small release with MIDI fixes, global notes, and a Data tab improvement.

- MIDI/Akai connection is more robust, with fallback by port name, id, and index, open timeout, and automatic refresh when devices reconnect.
- Live Notes are now global for the app and are no longer tied to the selected output or data source.
- In Data, the `Source Rows` field grows downward with content and no longer exposes the native resize handle.
- Added regression coverage for MIDI, Notes, and the Data textarea.

SHA-256: `23c4e770f871edb4ef2343c08da4b1f3e37678a5fe8defd9e8dc3298e860396f`
