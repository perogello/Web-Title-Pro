# Web Title Pro Template Guide

## RU

### Как сделать титр редактируемым по шрифтам и цветам

В `template.json` включи:

```json
{
  "fieldStyleEditor": true
}
```

После этого:

- у local title появится кнопка редактирования внешнего вида
- в редакторе можно будет менять:
  - `font family`
  - `font size`
  - `color`

### Что обязательно должно быть в HTML

Каждое текстовое поле титра должно иметь `data-field`.

Пример:

```html
<h1 data-field="fullName" data-label="Full Name">Ivan Petrov</h1>
<p data-field="position" data-label="Position">Presenter</p>
```

Что это дает:

- `data-field` — внутренний ключ поля
- `data-label` — красивое имя в интерфейсе приложения

### Когда титр не будет редактируемым

Титр не получит кнопку редактирования, если:

- это `vMix` title
- или в `template.json` нет `"fieldStyleEditor": true`

### Готовый стартовый пример

Смотри:

- [TEMPLATE_STARTER/template.json](./TEMPLATE_STARTER/template.json)
- [TEMPLATE_STARTER/index.html](./TEMPLATE_STARTER/index.html)
- [TEMPLATE_STARTER/styles.css](./TEMPLATE_STARTER/styles.css)
- [TEMPLATE_STARTER/main.js](./TEMPLATE_STARTER/main.js)

---

## EN

### How to make a title editable for fonts and colors

Enable this in `template.json`:

```json
{
  "fieldStyleEditor": true
}
```

After that:

- the local title gets an appearance edit button
- the editor can change:
  - `font family`
  - `font size`
  - `color`

### What your HTML must contain

Each editable text field should have `data-field`.

Example:

```html
<h1 data-field="fullName" data-label="Full Name">Ivan Petrov</h1>
<p data-field="position" data-label="Position">Presenter</p>
```

This means:

- `data-field` is the internal field key
- `data-label` is the user-facing label shown in the app

### When a title will not be editable

The edit button will not appear if:

- it is a `vMix` title
- or `template.json` does not contain `"fieldStyleEditor": true`

### Starter example

See:

- [TEMPLATE_STARTER/template.json](./TEMPLATE_STARTER/template.json)
- [TEMPLATE_STARTER/index.html](./TEMPLATE_STARTER/index.html)
- [TEMPLATE_STARTER/styles.css](./TEMPLATE_STARTER/styles.css)
- [TEMPLATE_STARTER/main.js](./TEMPLATE_STARTER/main.js)
