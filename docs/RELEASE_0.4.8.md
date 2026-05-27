# Web Title Pro 0.4.8

## RU

Патч-релиз для MIDI/Akai/APC.

- Исправлено повторяющееся `failed to open` при открытии Akai/APC: неудачные попытки открытия теперь явно закрываются.
- MIDI refresh больше не запускается повторно от шумных `onChange`, если список портов фактически не изменился.
- Ошибка MIDI теперь сжимается в понятное сообщение вместо длинного повтора одного и того же текста.
- Если порт занят vMix или другим приложением через эксклюзивный Windows MIDI-драйвер, UI теперь сообщает об этом прямо и предлагает закрыть владельца порта или использовать virtual MIDI splitter.
- Если часть MIDI-портов недоступна, но хотя бы один вход открылся, приложение не показывает это как полный offline.

SHA-256: `f4c8299ab7b399e45a21edff6cac7c45c54022cea46e8fdda030c3cb37feee8b`

## EN

Patch release for MIDI/Akai/APC.

- Fixed repeated `failed to open` errors when opening Akai/APC devices: failed open attempts are now explicitly closed.
- MIDI refresh no longer loops on noisy `onChange` events when the actual port list did not change.
- MIDI errors are compacted into a readable message instead of repeating the same text.
- If the port is owned by vMix or another app through an exclusive Windows MIDI driver, the UI now says that directly and suggests closing the owner or using a virtual MIDI splitter.
- If some MIDI ports are unavailable but at least one input opens, the app no longer reports full MIDI offline.

SHA-256: `f4c8299ab7b399e45a21edff6cac7c45c54022cea46e8fdda030c3cb37feee8b`
