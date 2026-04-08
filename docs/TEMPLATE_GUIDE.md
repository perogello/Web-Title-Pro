# Web Title Pro Template Guide

## RU

Этот гайд нужен для тех, кто хочет сделать свой local HTML-титр для `Web Title Pro`.
Ниже разобран полный минимальный контракт шаблона: структура папки, поля, стили, анимации, optional JS и частые ошибки.

### 1. Что такое шаблон

Шаблон титра в `Web Title Pro` — это обычная папка с web-файлами:

```text
my-title/
  template.json
  index.html
  styles.css
  main.js
```

Минимально достаточно:

- `template.json`
- `index.html`

Но почти всегда удобно иметь и:

- `styles.css`
- `main.js`

### 2. Что делает каждый файл

`template.json`
- имя шаблона
- описание
- категория
- включает editor внешнего вида, если нужно

`index.html`
- сама разметка титра
- поля с `data-field`
- optional таймеры с `data-timer`

`styles.css`
- внешний вид
- intro / outro анимации

`main.js`
- optional логика шаблона
- lifecycle hooks: `mount`, `update`, `show`, `hide`, `unmount`

### 3. Минимальный `template.json`

```json
{
  "name": "My Lower Third",
  "description": "Simple starter title for Web Title Pro.",
  "category": "lower-third",
  "fieldStyleEditor": true
}
```

Поля:

- `name`
  - человекочитаемое имя шаблона в приложении
- `description`
  - краткое описание
- `category`
  - свободная категория, чисто для структуры
- `fieldStyleEditor`
  - если `true`, у титра появится редактор шрифтов/цветов

### 4. Как объявлять поля титра

Каждое текстовое поле, которое должно участвовать в системе титров, обязано иметь `data-field`.

Пример:

```html
<h1
  data-field="fullName"
  data-label="ФИО"
  data-default="Иван Петров"
  data-placeholder="Иван Петров"
>
  Иван Петров
</h1>

<p
  data-field="position"
  data-label="Должность"
  data-default="Ведущий"
  data-placeholder="Ведущий"
>
  Ведущий
</p>
```

Что означает:

- `data-field`
  - внутренний ключ поля
  - именно по нему приложение понимает, куда писать текст
- `data-label`
  - красивое имя поля в UI
- `data-default`
  - начальное значение
- `data-placeholder`
  - подсказка для интерфейса

### 5. Правила для `data-field`

Рекомендуется:

- использовать понятные стабильные ключи
- `fullName`
- `position`
- `tag`
- `subtitle`

Лучше избегать:

- случайных имен вроде `text1`, `fieldA`, `valueX`

Потому что потом эти названия будут жить в:

- `Mapping`
- style editor
- data source integration

### 6. Как сделать титр редактируемым по шрифтам и цветам

Включи в `template.json`:

```json
{
  "fieldStyleEditor": true
}
```

После этого:

- у local title появляется кнопка редактирования внешнего вида
- можно менять:
  - `font family`
  - `font size`
  - `color`

Важно:

- editor работает только для local HTML titles
- для `vMix` это не используется
- style editor применяется к элементам с `data-field`

### 7. Как работает подмена шрифтов

Сейчас логика приложения такая:

- оператор выбирает шрифт в UI
- приложение находит установленный font file в Windows
- renderer подгружает именно этот файл шрифта
- стиль применяется к нужному `data-field`

То есть шаблон сам:

- не ищет шрифты
- не грузит шрифт-файлы
- не должен делать `@font-face` для пользовательских шрифтов

### 8. Анимации появления и скрытия

Самый удобный способ — строить их через классы, которые ставит renderer на `.render-stage`:

- `.render-stage.is-visible`
- `.render-stage.is-hiding`
- `.render-stage.is-hidden`

Пример:

```css
.my-title {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 280ms ease,
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.render-stage.is-visible .my-title {
  opacity: 1;
  transform: translateY(0);
}

.render-stage.is-hiding .my-title {
  opacity: 0;
  transform: translateY(12px);
}
```

### 9. Как задать длительность outro

Если у титра есть hide-анимация, удобно указать корневому элементу `data-outro-ms`:

```html
<div class="my-title" data-outro-ms="450">
  ...
</div>
```

Это подсказывает renderer-у, сколько ждать перед окончательным скрытием.

### 10. Optional: таймеры внутри шаблона

Если шаблон должен показывать таймер, используй `data-timer`.

Пример:

```html
<span data-timer="main" data-label="Main Timer">00:30</span>
```

Что это дает:

- приложение увидит timer slot
- его можно будет связать с timer-системой

### 11. Optional: `main.js` и lifecycle

Если HTML + CSS недостаточно, можно добавить `main.js`.

Renderer ищет:

```js
window.WebTitleTemplate = {
  mount(context) {},
  update(context) {},
  show(context) {},
  hide(context) {},
  unmount(context) {},
};
```

Что делает каждый hook:

- `mount(context)`
  - вызывается один раз после загрузки шаблона
  - удобно для поиска DOM-узлов и начальной инициализации

- `update(context)`
  - вызывается после обновления полей/стилей/таймеров
  - удобно для derived UI логики

- `show(context)`
  - вызывается, когда титр показывается
  - можно запускать custom-анимации

- `hide(context)`
  - вызывается при скрытии
  - можно запускать outro-логику

- `unmount(context)`
  - cleanup: timers, listeners, observers

### 12. Что находится в `context`

В hooks приходит:

- `context.stage`
  - корневой DOM renderer-а
- `context.snapshot`
  - полный snapshot состояния
- `context.output`
  - текущий output
- `context.program`
  - текущая программа для этого output
- `context.timers`
  - список таймеров

### 13. Что лучше оставить в CSS, а не в JS

Лучше делать в CSS:

- обычные intro/outro анимации
- fades
- slides
- reveal
- transitions

Лучше делать в JS:

- нестандартные фазовые анимации
- вычисление ширины по тексту
- сложные последовательности
- custom timer presentation

### 14. Как renderer понимает поля

Базовая цепочка такая:

1. parser читает `index.html`
2. находит все `[data-field]`
3. строит список полей шаблона
4. при работе renderer пишет текст в эти элементы
5. если включен `fieldStyleEditor`, renderer применяет и стили

### 15. Что обязательно проверить перед импортом

Чек-лист:

- в папке есть `template.json`
- в папке есть хотя бы один `.html`
- все нужные текстовые узлы имеют `data-field`
- intro/outro анимации не конфликтуют с `is-visible / is-hiding`
- нет абсолютных путей к локальным файлам
- нет внешних зависимостей, без которых титр не проживет в renderer
- если есть `main.js`, он не падает без данных

### 16. Частые ошибки

Ошибка: поле не появляется в приложении
- скорее всего, нет `data-field`

Ошибка: поле есть, но его нельзя стилизовать
- скорее всего, нет `fieldStyleEditor: true`

Ошибка: титр дергается при hide
- обычно конфликтует CSS hide-state и `data-outro-ms`

Ошибка: custom JS ломает титр
- проверь, что `main.js` не обращается к DOM-элементам до `mount`

Ошибка: шрифт не применился
- чаще всего это уже не баг шаблона, а выбор шрифта/сохранение style editor в приложении

### 17. Рекомендуемая структура lower third

Для большинства нижних титров хватает такого паттерна:

```html
<div class="title-root" data-outro-ms="400">
  <div class="title-tag" data-field="tag" data-label="Тег">LIVE</div>
  <div class="title-panel">
    <h1 data-field="fullName" data-label="ФИО">Иван Петров</h1>
    <p data-field="position" data-label="Должность">Ведущий</p>
  </div>
</div>
```

### 18. Starter template

Готовый учебный пример:

- [TEMPLATE_STARTER/template.json](./TEMPLATE_STARTER/template.json)
- [TEMPLATE_STARTER/index.html](./TEMPLATE_STARTER/index.html)
- [TEMPLATE_STARTER/styles.css](./TEMPLATE_STARTER/styles.css)
- [TEMPLATE_STARTER/main.js](./TEMPLATE_STARTER/main.js)

### 19. Лучший практический подход

Если делаешь новый титр:

1. Сначала собери чистый статичный HTML
2. Потом добавь `data-field`
3. Потом добавь CSS intro/outro
4. Только потом, если нужно, подключай `main.js`

Так намного проще отлаживать.

---

## EN

This guide explains how to build a local HTML title template for `Web Title Pro`.
It covers the full minimal contract: folder structure, fields, styles, animation, optional JS, and common mistakes.

### 1. What a template is

A template is a regular folder with web files:

```text
my-title/
  template.json
  index.html
  styles.css
  main.js
```

Minimum required:

- `template.json`
- `index.html`

Usually recommended:

- `styles.css`
- `main.js`

### 2. What each file does

`template.json`
- template name
- description
- category
- enables appearance editing when needed

`index.html`
- title markup
- fields with `data-field`
- optional timers with `data-timer`

`styles.css`
- visuals
- intro / outro animation

`main.js`
- optional custom logic
- lifecycle hooks: `mount`, `update`, `show`, `hide`, `unmount`

### 3. Minimal `template.json`

```json
{
  "name": "My Lower Third",
  "description": "Simple starter title for Web Title Pro.",
  "category": "lower-third",
  "fieldStyleEditor": true
}
```

Fields:

- `name`
  - human-readable name shown in the app
- `description`
  - short explanation
- `category`
  - freeform organizational label
- `fieldStyleEditor`
  - enables the appearance editor for local titles

### 4. How to declare title fields

Every text field that should participate in the app must have `data-field`.

Example:

```html
<h1
  data-field="fullName"
  data-label="Full Name"
  data-default="Ivan Petrov"
  data-placeholder="Ivan Petrov"
>
  Ivan Petrov
</h1>

<p
  data-field="position"
  data-label="Position"
  data-default="Presenter"
  data-placeholder="Presenter"
>
  Presenter
</p>
```

Meaning:

- `data-field`
  - internal field key
- `data-label`
  - user-facing label in the app
- `data-default`
  - initial value
- `data-placeholder`
  - UI hint

### 5. Recommended field naming

Use stable, readable keys such as:

- `fullName`
- `position`
- `tag`
- `subtitle`

Avoid vague names like:

- `text1`
- `fieldA`
- `valueX`

because these names also appear in:

- `Mapping`
- the style editor
- data workflows

### 6. How to make a title editable for fonts and colors

Enable this in `template.json`:

```json
{
  "fieldStyleEditor": true
}
```

Then:

- the local title gets an appearance edit button
- the app can change:
  - `font family`
  - `font size`
  - `color`

### 7. How font replacement works

The app handles font replacement globally:

- the operator picks a font in the UI
- the app resolves the installed Windows font file
- the renderer loads that exact font file
- the chosen style is applied to matching `data-field` nodes

So the template itself should not:

- discover system fonts
- load user font files manually
- implement its own Windows font lookup

### 8. Intro and outro animation

The simplest approach is to animate from renderer state classes on `.render-stage`:

- `.render-stage.is-visible`
- `.render-stage.is-hiding`
- `.render-stage.is-hidden`

Example:

```css
.my-title {
  opacity: 0;
  transform: translateY(16px);
  transition:
    opacity 280ms ease,
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.render-stage.is-visible .my-title {
  opacity: 1;
  transform: translateY(0);
}

.render-stage.is-hiding .my-title {
  opacity: 0;
  transform: translateY(12px);
}
```

### 9. Outro duration

If the title has an outro animation, you can declare it with `data-outro-ms`:

```html
<div class="my-title" data-outro-ms="450">
  ...
</div>
```

This tells the renderer how long to wait before fully hiding the title.

### 10. Optional timers

If the template should expose a timer slot, use `data-timer`.

Example:

```html
<span data-timer="main" data-label="Main Timer">00:30</span>
```

### 11. Optional `main.js` lifecycle

If HTML + CSS is not enough, add `main.js`.

The renderer looks for:

```js
window.WebTitleTemplate = {
  mount(context) {},
  update(context) {},
  show(context) {},
  hide(context) {},
  unmount(context) {},
};
```

Hook meaning:

- `mount(context)`
  - called once after load
- `update(context)`
  - called after fields/styles/timers update
- `show(context)`
  - called when the title goes on air
- `hide(context)`
  - called when hide starts
- `unmount(context)`
  - cleanup before the template is replaced

### 12. What is in `context`

- `context.stage`
- `context.snapshot`
- `context.output`
- `context.program`
- `context.timers`

### 13. CSS vs JS

Prefer CSS for:

- normal intro/outro
- fades
- slides
- reveals

Prefer JS for:

- phased motion
- text-based layout calculation
- derived UI logic
- custom timer rendering

### 14. How the app finds fields

The pipeline is:

1. parser reads `index.html`
2. finds `[data-field]`
3. builds the field list
4. renderer writes values into those nodes
5. renderer also applies field styles when enabled

### 15. Pre-import checklist

- `template.json` exists
- at least one `.html` file exists
- all required text nodes have `data-field`
- intro/outro works with `is-visible / is-hiding`
- no absolute local asset paths
- no brittle external runtime dependency
- `main.js` does not crash when data is missing

### 16. Common mistakes

Field does not appear in the app:
- usually there is no `data-field`

Field exists but cannot be styled:
- usually `fieldStyleEditor: true` is missing

Hide animation glitches:
- usually CSS hide-state conflicts with `data-outro-ms`

Custom JS breaks the title:
- check that DOM access happens after `mount`

Font does not apply:
- usually that is an app-side font selection issue, not a template markup issue

### 17. Recommended lower-third structure

```html
<div class="title-root" data-outro-ms="400">
  <div class="title-tag" data-field="tag" data-label="Tag">LIVE</div>
  <div class="title-panel">
    <h1 data-field="fullName" data-label="Full Name">Ivan Petrov</h1>
    <p data-field="position" data-label="Position">Presenter</p>
  </div>
</div>
```

### 18. Starter template

Reference files:

- [TEMPLATE_STARTER/template.json](./TEMPLATE_STARTER/template.json)
- [TEMPLATE_STARTER/index.html](./TEMPLATE_STARTER/index.html)
- [TEMPLATE_STARTER/styles.css](./TEMPLATE_STARTER/styles.css)
- [TEMPLATE_STARTER/main.js](./TEMPLATE_STARTER/main.js)

### 19. Best practical workflow

When building a new title:

1. build a clean static HTML version first
2. add `data-field`
3. add CSS intro/outro
4. only then add `main.js` if necessary

That makes debugging much easier.
