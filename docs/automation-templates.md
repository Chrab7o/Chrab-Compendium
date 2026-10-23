# Automation templates

## What they are

A template is a **type** of mechanic ("defenses", "a resource pool", "bonus damage on hit"), not a copy of a finished
feature. You pick it, fill in its settings, and it fills in the Feature Forge editor. Everything it creates stays
editable afterwards. Finished features worth copying, like Death Stance, are listed separately as **examples**.

**Where templates appear:**
- The **Foundry mechanics** panel on every class or subclass feature row.
- The Feature Forge's "Start from a template" list.

Both use `TemplatePicker.jsx`, and a `?template=` link asks for the settings first.

The list grows class by class. It started with the Dark Knight on 2026-10-23, from a read of every feature of the
public classes, which sorted them into 22 mechanic types.

## Adding a template

In `src/lib/automationTemplates.js`, add an entry to `AUTOMATION_TEMPLATES`:

```js
{
  key: 'defenses', kind: 'type', label: '…', help: '…',
  params: [{ key: 'saveAdvantage', label: 'Advantage on saves against', kind: 'conditions', hint: '…' }],
  build(values) { /* -> Feature Forge spec; throw new Error('…') when a required choice is missing */ },
}
```

- **Setting kinds:** `conditions` and `damageTypes` are multi-select lists (`PARAM_OPTIONS`). Add a kind there and in
  `TemplatePicker.jsx` when a template needs something new.
- **What `build` returns:** the same spec shape the Feature Forge edits, made from the existing pieces: effects with
  `EFFECT_CHANGES`, rolls, uses and behaviors. If a template needs something those can't express, add that to the
  framework first (an effect change, a behavior event or outcome), then build the template on it.
- **Tests:** add a case to `automationTemplates.test.mjs`, and a sandbox probe for anything midi-qol or dnd5e behavior
  hasn't confirmed yet.

## Built

| Template | Settings | What it makes | Covers |
| --- | --- | --- | --- |
| **Defenses** | Advantage on saves against (conditions), immune to conditions, resistance / immunity / vulnerability (damage types) | One always-on effect with one change per choice | TDK L1 Tainted Soul (frightened), part of L18 Unstoppable (restrained, stunned) |
| **Resource pool** | Identifier (default `darkness`), pool size (default `@scale.the-dark-knight.darkness-points`), refills on | A feature whose uses are the pool, with that `system.identifier` | TDK L2 Dark Arts (Darkness); later Ink and Ki |
| Death Stance *(example)* | none | The full Harbinger feature | TDK (Harbinger) L3 / L7 |

**New with Resource pool:**
- **Spending from it.** "+ Spend a resource" on any roll has a new source, **A class resource (by identifier)**. Its
  dnd5e cost is `{ type: "itemUses", target: "darkness" }`.
  - dnd5e 5.3.3 re-links an identifier target to the item on the actor that has it (`_remapConsumptionTarget`), so the
    cost works on every character. A Plutonium import gives each character different item ids, so an id target would
    break there.
- **Can spend more: +1 die each.** On any spend row. It turns on dnd5e's own "spend more" scaling and adds a die per
  extra point to the roll's first damage part, or its healing. For example, Restore Vitality is 3 Darkness for
  2d8 + CON, or 5 Darkness for 4d8 + CON.
- **Resource identifier.** A feature with uses can set this, so a pool keeps its identifier even when the feature is
  named "Dark Arts".
- **Status:** these match the dnd5e 5.3.3 source but haven't run in Foundry yet. See the sandbox's
  `probes/resource-pool.md`, which also records how Rezire's hand-built Dark Knight is wired today.

**New with Defenses:** the effect change **Advantage on saves against a condition** (`advSaveVs`). Midi-qol has no
built-in setting for it, so the change stores the condition and is built as a condition expression on
`flags.midi-qol.advantage.ability.save.all`.
- **How the expression works:** `saveAgainstCondition` in `foundryActorBuilder.js`. It's true when the save's activity,
  or else its item, applies that status or an effect named for it.
- **Reading it back:** exports read it back into the editor by that expression.
- **Unconfirmed:** that this works in Foundry. Run the sandbox's `probes/defenses.md`.

## Dark Knight roadmap

These are in the order I suggest building them. Each one unlocks the Dark Knight features listed.

| # | Template | Dark Knight features | New framework needed |
| --- | --- | --- | --- |
| 1 | **Defenses** (built) | Tainted Soul; Unstoppable (condition part); Vanguard L7 (advantage on WIS saves) | Done. "Can't be moved" and "bypass physical resistance" are still to add. |
| 2 | **Resource pool + spending** (built, Foundry check pending) | Dark Arts (the Darkness pool) and every art: Restore Vitality, Shadow Lance, Grasp of Shadows, Shadow Veil, Absorb Wounds, Shadow Smite, Enthrall, Despairing Cry, Deflecting Darkness, Shadow Warp, Defend the Weak, Curse, Wings of Darkness, Bulwark, Death Wave | A pool feature with uses = `@scale.the-dark-knight.darkness-points` per long rest. A "spends N from the pool" option on every other template, plus "+1 die per extra point" (dnd5e's own consumption scaling). **Needs a probe first:** spending another item's uses on a player character. |
| 3 | **Passive bonus** | Fighting Style options (Defense +1 AC, Dueling +2 damage, Blind Fighting blindsight 10 ft); Imposing Presence's Intimidation advantage | Mostly existing effect changes. Add a skill advantage change. |
| 4 | **Stance** (Death Stance generalized) | Vanguard Stance (1 minute, temp HP 1d10 at the start of each turn, disadvantage on own attacks, PB uses); Wings of Darkness (fly 50 ft for an hour); The Final Art | A new behavior event, **"at the start of my turn"**, for Vanguard's temp HP. |
| 5 | **Attack** (class ability to hit). Framework done: save DCs accept a formula, and a feature's attack carries its own range. | Shadow Lance (60/120 ft, 1d8 + CON necrotic); Shadow Bolt; Death Wave (line) | A per-class attack ability and save DC setting (`10 + @prof + @abilities.con.mod`). |
| 6 | **Save or suffer** | Grasp of Shadows (30 ft CON save, 3d10, half); Enthrall (WIS save, charmed); Despairing Cry (WIS save, frightened, repeat save) | Existing save + area + effect + repeat. Needs the per-class DC from #5. |
| 7 | **Heal / temp HP** | Restore Vitality (2d8 + CON); Bulwark (take 3d10 necrotic, allies gain that much temp HP) | Bulwark needs "allies gain what I took". |
| 8 | **Bonus damage on hit** | Shadow Smite (2d10 necrotic, +1d10 per extra point) | Spending from the pool (#2) inside a rule. |
| 9 | **Reaction when hit** | Shadow Veil (+5 AC until your next turn); Deflecting Darkness (reduce by 2d10 + CON); Absorb Wounds (take an ally's damage) | New behavior events "I'm hit" and "an ally within N ft is hit", with outcomes "reduce the damage by X" and "I take it instead". These reuse the damage-rewriting hook from Refuse to Fall. |
| 10 | **Mark / curse** | Mark of Darkness (PB per long rest, free reapply on a kill); Curse (+1d6 when hit, −2 to one save); Mark of Devastation (L17 upgrade) | An effect on the target that knows who applied it. A "target has my mark" condition for bonus damage and advantage rules. |

**Later, each its own project:**
- **Aura:** Imposing Presence, plus the Harbinger and Vanguard L19 upgrades.
- **Teleport:** Shadow Warp.
- **Summon:** Shadow Image.
- **Cost reductions:** Magus L7 / L19, The Final Art.

**Left as text, or to Plutonium:**
- **Choice menus:** Fighting Style, Dark Arts picks.
- **Action economy:** Extra Attack, Soul Surge.
- **Narrative:** Soul Bound.
- **Hard to automate:** Inevitable (auto-succeed after a turn).

**Content to fix as we reach it:**
- Chains of Despair's text is cut off.
- Magus L7 references "Dark Pulse", assumed to mean Grasp of Shadows.
