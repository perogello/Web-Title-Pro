## Web Title Pro

Control [Web Title Pro](https://github.com/perogello/Web-Title-Pro) titles, outputs and timers from Companion — with live on-air feedback.

**Setup:** set **Host** to the computer running Web Title Pro (`127.0.0.1` if it is this computer, otherwise its IP) and **Port** to `4000`. Web Title Pro must be running.

**Fastest start:** open the **Presets** tab and drag the ready-made buttons onto your page:

- **Output #N** — a toggle button (shows the output and the first field of the selected title, red while on air), plus IN / OUT / PVW / ROW ▲▼ / row timer.
- **Titles → #N** — one button per title to put it on that output (blue when selected).
- **Timers** — start/stop with the live time (colour follows the timer's colour rules) and reset.
- **Global** — panic (hide every output) and an on-air counter.

**Actions:** output command, toggle title, select title (optionally take it on air), timer command / toggle, panic, and *Any Web Title Pro command* — includes plugin commands and overlays.

**Feedbacks:** title on air, preview bus, title selected, any output on air, timer running, timer colour, connected.

**Variables:** `o1_name`, `o1_title`, `o1_value1`, `o1_value2`, `o1_on_air`, `o1_preview`, `o1_row` (o2_…, o3_… for the next outputs — numbered as in the Web Title Pro Config tab), `t1_name`, `t1_time`, `t1_running` per timer, `on_air_count`, `connected`, `module_version`, `module_update` (newer module version shipped with Web Title Pro; empty = up to date).

**Updates:** the module ships with Web Title Pro. Installed from the app on the same computer it updates itself; an imported `.tgz` must be re-imported after updating Web Title Pro — the connection shows a warning when versions differ.

---

### По-русски

**Настройка:** в **Host** укажите компьютер с Web Title Pro (`127.0.0.1`, если это этот же компьютер, иначе его IP), **Port** — `4000`. Web Title Pro должен быть запущен.

**Быстрый старт:** вкладка **Presets** — перетащите готовые кнопки на страницу: переключатель титра для каждого output (красный в эфире), IN/OUT/PVW/строки, кнопки выбора титра, таймеры с живым временем и Panic.
