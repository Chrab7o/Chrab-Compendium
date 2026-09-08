# Embedding the Item Description Maker

The original `index.html` / `app.js` / `formatter.js` / `style.css` are a full
standalone page (DOCTYPE, `<head>`, global element IDs like `#preview`,
global classes like `.btn`, `.hint`, a bare `h2` selector). Dropping that
straight into another app risks two things: CSS rules bleeding onto/from the
host page, and element IDs colliding with ones the host already uses.

`embed/` contains a compacted, collision-safe version with the same
functionality, reduced to exactly three files:

| File | What it is |
|---|---|
| `embed/idm.html` | The markup only — no `<!DOCTYPE>`/`<head>`/`<body>`. Everything is wrapped in `<div class="idm-widget">`, every id is prefixed `idm-` (`f-name` → `idm-f-name`, etc.), every class is prefixed `idm-`. |
| `embed/idm.css` | Same styles, but every rule is scoped under `.idm-widget` and the color variables live on that element instead of `:root` — nothing here can leak onto, or be overridden by, the host page's styles. |
| `embed/idm.js` | `formatter.js` + `app.js` merged into one IIFE. It defines no globals except `window.ItemDescriptionMaker = { init }`. Nothing runs on load — you call `init()` yourself once the markup is in the DOM. |

## Integration steps (framework-agnostic)

1. **Styles** — include `idm.css` however your app normally loads CSS (global
   import, `<link>`, bundled `import './idm.css'`). It's fully self-contained
   under `.idm-widget`, so it's safe to just always-include it.

2. **Markup** — get the contents of `idm.html` rendered into the page as part
   of whichever component should host the tool. Concretely this differs per
   framework's templating rules (see below), but the DOM structure itself
   doesn't need to change.

3. **Script** — `idm.js` is a plain script, not an ES module, and it must run
   as a real `<script>` tag (see the framework notes below for why). Serve it
   as a static asset and load it with a real `<script src="/idm.js">` tag —
   don't run it through your bundler/transpiler, and don't inject it via
   `innerHTML`/`dangerouslySetInnerHTML`/`v-html` (browsers won't execute
   `<script>` tags inserted that way).

4. **Init** — once both the markup is in the DOM *and* `idm.js` has loaded,
   call:
   ```js
   window.ItemDescriptionMaker.init();
   ```
   This wires up all the event listeners and renders the initial state.
   Calling it again is a harmless no-op (it's guarded), so you don't need to
   worry about double-invoking it from things like React StrictMode.

## Framework-specific notes

- **React** — `dangerouslySetInnerHTML` won't execute the `<script>` tag even
  if it's inside the string, and effects can re-run in dev StrictMode. Put
  the real `<script src="/idm.js">` tag in your root HTML (`public/index.html`)
  once, globally, not inside the component. Render the `idm.html` markup via
  `dangerouslySetInnerHTML` inside a `useEffect`/on mount, then call
  `window.ItemDescriptionMaker.init()` right after.
- **Vue** — raw HTML like `idm.html` can be pasted directly into a `<template>`
  block almost verbatim (Vue 3 supports multiple root nodes). Call
  `ItemDescriptionMaker.init()` in `onMounted`, after `nextTick()`.
- **Svelte** — paste the markup straight into the component; Svelte compiles
  plain HTML natively. Call `init()` in `onMount`.
- **Plain HTML/CMS/embed block** — paste `idm.html`'s contents where you want
  the tool, add `<link rel="stylesheet" href="idm.css">`, then
  `<script src="idm.js"></script>` followed by
  `<script>ItemDescriptionMaker.init();</script>`.

## Things to know before you wire it up

- **One instance per page.** IDs in `idm.html` are static (`idm-f-name`,
  `idm-preview`, …), so only one copy of the widget can exist on a page at a
  time. If you need two side by side, the IDs would need to be made unique
  per instance first — not something this bundle does today.
- **Storage key is shared per origin.** Saved items live in
  `localStorage['idm_saved_items']`. That's already namespaced against
  unrelated site data, but if you ever embed this tool in two different
  places on the *same* domain, they'll share the same saved-items list by
  design (that's usually what you want — it's the same tool).
- **Clipboard button needs a secure context.** `navigator.clipboard` only
  works over HTTPS (or `localhost`). On plain HTTP it silently falls back to
  the older `document.execCommand('copy')`, which still works in effectively
  all current browsers but is deprecated.
- **The preview pane is deliberately unstyled.** `idm.css` only styles the
  *editor UI* (form fields, buttons, panels) — it intentionally does not
  style the generated `ve-stats`/`ve-rd__b` markup itself, since that's meant
  to pick up whatever 5e.tools/Foundry theme is already active wherever the
  final HTML gets pasted. Don't be surprised the live preview looks like
  plain unstyled text; that's the same behavior as the original tool.

## If the source tool changes later

`embed/` is a derived build, not the source of truth — `index.html`,
`app.js`, `formatter.js`, and `style.css` in the repo root are. If you modify
those, regenerate `embed/` by reapplying the same transform: wrap the markup
in `.idm-widget`, prefix every id/class with `idm-`, scope every CSS selector
under `.idm-widget`, and wrap the JS body in the `init(root)` function shown
in `embed/idm.js`.
