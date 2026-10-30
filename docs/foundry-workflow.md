# Foundry work: where things go and how they ship

## Where things go

Foundry experiments happen in the sandbox repo `C:\Users\Cducl\OneDrive\Documents\GitHub\foundry-expirmenets`, not here.
- Test files, exports, prototype macros/modules, API research and one-off scripts go in the sandbox. Foundry exports
  (`fvtt-*.json`, `party.json`) go in its `exports/`; if the user drops one in this repo's root, move it there. Read its
  `README.md` first; it has the layout, the target versions (Foundry 14.368, dnd5e 5.3.3) and how to run scripts.
- Once something works the way we want, build the real version here:
  - Site features and anything tied to the Supabase schema go in `src/`.
  - Foundry module code goes in `foundry/chrab-sync/`.
- midi-qol automation (over time, macros, conditions): read the sandbox's `probes/midi-qol-v14-reference.md` first. The
  midi-qol source is cloned at `vendor/midi-qol` (v14 branch) for anything it doesn't cover.
- Existing design and setup docs: `docs/npc-forge.md` (Phase 1 builder) and `docs/npc-forge-phase2.md` (Chrab Sync
  module and queue).

## Class and subclass mechanics

This is the Foundry automation on homebrew class features. The full steps are in the sandbox README's **Class and
feature mechanics** section. The rules:
- **Where things live:**
  - The site's database is the live copy.
  - The site editor owns feature text, names and levels.
  - Mechanics built in the sandbox live in `mechanics/<name>.mjs`, one file per class or subclass.
- **Making a change:**
  - Change the mechanics in that file. Never write a mechanics JSON for the site's "Load mechanics".
  - From the sandbox root, run `node scripts/chrab.mjs diff <name>`: before working on a class and after each edit.
  - `preview <name>` is safe to run anytime. It's for testing in Foundry before a push.
- **Pushing:**
  - `push`, `publish` and `--force` write to the live site and the pack players sync from. Run them only when the user
    asks for that push.
  - When a change needs `src/` code (a template, recipe or builder fix), the user commits and deploys first, and only
    then pushes. Otherwise the next save on the site rebuilds the pack with the old code and undoes it.
  - If `diff` shows `!` (edited on the site), copy the site's change into the file or ask the user. Don't `--force`
    unless they say to.
- **Converting a hand-built character:** write a converter in the sandbox that reads the `preview` pack. Its output
  goes to `out/`, imported onto a new actor first.
- **Never commit generated files** (`out/`, `samples/*.json`). Don't add per-subclass build scripts or sample packs.
