# UI conventions: buttons and actions

A running list of which control style to use where, so a small action
doesn't end up looking like an unfinished stub — the recurring complaint
that prompted this doc: a bare underlined-text control, alone in its own
row with no border or background, reading as cheap/broken (e.g. "Remove" /
"Unlink" sitting under a textarea with nothing else nearby, or "description
syntax help" floating with no button chrome around it).

## The actual rule

**It's not about the style itself — it's about whether the control is alone.**

- `.link-button` (bare text, no border/background) is correct **only when
  it sits inline among other text**, reading like a hyperlink in a
  sentence. Real examples already in this codebase:
  - `Nav.jsx`'s impersonation banner: `Viewing as **Name** [Exit]` — "Exit"
    reads naturally as a hyperlink because it's part of a sentence.
  - `SessionFlowWidget.jsx`'s `Change plan` next to the plan's name in a
    flex header — text-in-context, not a standalone control.
- The moment a control is **the only interactive thing in its row, card, or
  area** — nothing else around it for it to read "inline" with — it needs
  real chrome: a visible border and background, so it reads as a deliberate
  button rather than stray text. Use one of:
  - `.icon-button` — compact square button for icon-only dismiss/remove
    actions (a card's own "×", removing one item from a list). Has a
    border, background, and a clear hover state by default.
  - A real `<button>` with `.secondary` (or `.danger` for destructive
    actions) wrapped in `.dm-list-actions` if it's a named action ("Edit",
    "Delete", "Unlink") inside a `.dm-list` row — this is the established,
    already-proven pattern (see `TagManager.jsx`, `DMSessionPlannerPage.jsx`).

## Checklist before shipping a new small action

1. Is this control sitting next to other text it's naturally part of (a
   name, a sentence, a header)? → `.link-button` is fine.
2. Is it alone — the only thing in its own row/card/area? → give it real
   chrome. Icon-only → `.icon-button`. Named action → a real bordered
   button (`.secondary`/`.danger`), not bare text.
3. Never leave a `border: none; background: none` button as the sole
   content of a row. If in doubt, add a border and background — it is
   always safer to over-style a small action than to leave it looking
   unfinished.

## Where this has already been fixed

- `RemindersWidget.jsx` — "Remove" per character (now `.icon-button`).
- `SessionPlanEditorPage.jsx` — "Unlink" in the "What happens next" list
  (now a real `.secondary` button inside `.dm-list-actions`).
- `src/components/dm/itemmaker/idm.css` — `.idm-help-toggle` ("description
  syntax help") — was bare underlined text, now a small bordered button.
- `SessionNotesPanel.jsx` — each note title was a `.link-button` inside a
  totally unstyled `<li>` (no border/background at all, just a
  margin-bottom) — the whole row is the only thing there, so it read as
  plain floating text. Now the `<li>` is a real bordered card and the title
  is styled as a bold clickable heading, not muted link text.
