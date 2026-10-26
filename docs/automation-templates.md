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

- **Setting kinds:**
  - Multi-select lists (`PARAM_OPTIONS`): `conditions`, `damageTypes`, `abilities`, `skills`.
  - Single settings: `text`, `formula`, `number`, `checkbox`, `select`.
  - Templates for things you use start their settings with `costParams()`: the action it takes, limited uses, a
    resource it spends, and "+1 die each". `usedFeature()` applies them.
  - Add a new kind in `TemplatePicker.jsx` too.
- **Grouping:** `group` sets where the template shows in the picker (`TEMPLATE_GROUPS`).
- **What `build` returns:** the same spec shape the Feature Forge edits, made from the existing pieces: effects with
  `EFFECT_CHANGES`, rolls, uses and behaviors. If a template needs something those can't express, add that to the
  framework first (an effect change, a behavior event or outcome), then build the template on it.
- **Tests:** add a case to `automationTemplates.test.mjs`, and a sandbox probe for anything midi-qol or dnd5e behavior
  hasn't confirmed yet.

## Built

Every template under **Things you use** also has the cost settings:
- **Takes:** action, bonus action, reaction, or no action.
- **Limited uses:** PB per long rest, or once per long or short rest.
- **Spends from a resource:** the identifier, the amount, and "can spend more: +1 die each".

| Group | Template | Settings | Dark Knight features it makes |
| --- | --- | --- | --- |
| Always on | **Defenses** | Advantage on saves against (conditions), immune to conditions, resistance / immunity / vulnerability (damage types), reduce all damage by, reduce nonmagical physical damage by | Tainted Soul, Unstoppable |
| Always on | **Reminder on your turn** | Start or end of your turn, only while you have one of some conditions (blank = always), the text (`@name`, `@statuses` fill in), flavor, color. A chat card from a hidden turn tick, in combat. | Inevitable |
| Always on | **Passive bonus** | AC, initiative, walk/fly/swim/climb speed, the four senses, weapon attack bonus, melee/ranged weapon damage bonus, spell attack and DC bonus, weapon crit range, advantage on saves (abilities) and on skills | Vanguard L7 (WIS saves), Imposing Presence's Intimidation, Fighting Styles (Defense +1 AC, Dueling +2 damage, Blind Fighting blindsight 10 ft) |
| Resources | **Cost reduction** | Resource, amount, only these features (blank = all). Never below 1. | Magus L7 (Shadow Lance, Grasp of Shadows −1), Magus L19 (all −2) |
| Resources | **Resource pool** | Identifier (default `darkness`), size (default `@scale.the-dark-knight.darkness-points`), refills on | Dark Arts (Darkness) |
| Things you use | **Attack** | Ranged or melee, spell or weapon, ability, range / long range, damage and type | Shadow Lance, Shadow Bolt |
| Things you use | **Save or suffer** | Save ability, DC (number or formula), one target or an area (radius/cone/line/cube, size), range, damage and type, half or none on a success, a condition, repeat save each turn | Grasp of Shadows, Enthrall, Despairing Cry |
| Things you use | **Heal or temporary HP** | Amount, hit points or temp HP, target (self / ally / creature), range | Restore Vitality, Deflecting Darkness (approximation) |
| Things you use | **Self buff** | Lasts (until your next turn starts or ends, until you're attacked, until removed), AC, fly / walk speed, resistances, advantage on attacks or saves | Shadow Veil, Wings of Darkness |
| Things you use | **Extra damage after a hit** | Damage and type. Takes no action by default. | Shadow Smite |
| Things you use | **Mark or curse** | Effect name, target (creature / ally), range, save penalty, extra damage taken from every source, attacks against it have advantage, disadvantage on its attacks or saves | Mark of Darkness, Curse (+1d6), Mark of Devastation |
| Things you use | **Bond: share a creature's damage** | Share %, bond name, ally or any creature, range, lasts | Defend the Weak (50%), Necromancer's Split Damage later |
| Things you use | **Teleport yourself** | Range | Shadow Warp |
| Things you use | **Missiles: pick a target for each** | Missiles, more per slot level up, damage per missile and type, range (blank: the spell's own, in any units), roll once for all. After use, a blue range ring; click a creature per missile (again to stack, shift-click for the rest, right-click takes one back, Esc cancels). One roll per creature (`alter(n)`: 1d6 + 1 ×3 = 3d6 + 3). The extra missiles come from dnd5e's `system.scaling` on the use card. Tested against a stand-in canvas only. | Lunar Missile Barrage (3 × 1d6 + 1 radiant, 120 ft), Magic Missile |
| Things you use | **Hurt yourself, allies gain temp HP** | Damage and type, ally range | Bulwark |
| Reactions | **Take a creature's damage instead** | Range. Asks the amount after the hit. | Absorb Wounds |
| Things you use | **Use and spend** | Target, range. No roll: it spends the cost and says so in chat. | Soul Surge, Shadow Warp, Shadow Image, Absorb Wounds |
| Reactions | **Reaction when you're hit or take damage** | Offered when (hit, damaged, attacked, missed, failed save), cost, AC until your next turn, reduce that damage by, resistance to that damage, heal after | Shadow Veil (hit, +5 AC), Deflecting Darkness (damaged, −2d10 + CON) |
| When you attack | **Extra damage on a hit (asks each time)** | Melee/ranged, weapon/spell, damage and type, ask, once per turn, crits only, take the same yourself, cost with "spend more" | Shadow Smite |
| When you attack | **Heal or temp HP when you hit (or drain)** | When (hit, attack roll, damage landed), filters, natural d20 at least, crits only, heal or temp HP, amount (`@dealt` for drain), ask, once per turn, cost | Blood Harvest-style heals; drain features (Necromancer) |
| Stances | **Stance** | Takes, uses, minutes, visual, advantage or disadvantage on attacks, AC, resistances, temp HP at the start of each turn | Vanguard Stance (Death Stance's rules are added in its Behavior section) |
| Over time | **Lingering damage or healing** | Damage / healing / temp HP each turn, type, start or end of its turn, target, range, a save to resist, repeat save ends it, effect name, minutes | Wither-style curses, regeneration on an ally |
| Auras | **Aura around you** | Radius, enemies / allies / everyone, minutes or perm, an effect while inside (AC, save change, disadvantage on attacks, a condition, resistances, ability scores −N), damage on entering or starting a turn inside with an optional save (half / none / full), a condition or named effect on a failed save until its next turn, "you heal for half" | Imposing Presence, Vanguard L19, Harbinger L19 |
| Summons & shapes | **Summon a creature** | Creature UUID (or "up to CR" for the player to pick), name, how many (a formula), minutes | A bound spirit; not Shadow Image (see below) |
| Summons & shapes | **Transform into a creature** | Creature UUID or up to CR, keeps (nothing / mind / mind, class, features and HP / appearance only), minutes | Shape-change features |
| Examples | Death Stance | none | Harbinger L3 / L7 |

**The test of the set:** the sandbox's `build-dark-knight-probe.mjs` now builds 22 of the 27 Dark Knight features from
these templates. Compared with the hand-built version tested in Foundry, the mechanics are identical, apart from
Shadow Lance and Shadow Bolt now targeting exactly one creature.

Imposing Presence and the Vanguard / Harbinger L19 upgrades are now Aura templates (each upgrade is the whole stronger
aura, used in place of the base one). The rest are hand-built, because each combines things no single template does
yet:
- **Chains of Despair:** its text is cut off.
- **Bulwark:** damages yourself.
- **Death Wave:** a line of weapon attacks.

**New with Resource pool:**
- **Spending from it.** "+ Spend a resource" on any roll has a new source, **A class resource (by identifier)**. Its
  dnd5e cost is `{ type: "itemUses", target: "darkness" }`.
  - dnd5e 5.3.3 re-links an identifier target to the item on the actor that has it (`_remapConsumptionTarget`), so the
    cost works on every character. Each character's copy of a class feature gets its own item id, so an id target would
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

## Chat cards and prompts

Every automation step reports in a **chat card**, and every choice is a **prompt to the player who owns the
creature**. Both come from one shared runtime (`src/lib/foundryChat.js`, `CHAT_RUNTIME`) pasted into each generated
macro: behavior rules and the Feature Forge script recipes.

- **The card:** the feature's name and icon, a colored border, a line of flavor text, then one line per step, with
  the dice rendered underneath. For example, "Hit on Goblin with Longsword", "Spends 3 darkness (4 left)", "+12
  necrotic damage added to the hit", "Bhern takes 12 necrotic damage". A rule posts one card when it happens. Stances
  post one when they start and end. Always-on resistance bypasses stay quiet.
- **Flavor:** each rule has a **Flavor text** line. The behavior has a **Card color** (shadow violet by default, or
  the stance's visual) and, for a stance, flavor lines for starting and ending. Templates that post cards have
  **Flavor text** and **Card color** settings.
- **The prompt:** "Ask first" shows the card so far (what triggered it, its cost, what it will do) with **Use it** /
  **Not now**. Costs that can be more ask how much.
  - It goes to the player who owns the creature, on their screen, through Foundry's user queries
    (`DialogV2.query`'s `dialog` query, permission `QUERY_USER`, which players have by default). This matters for
    rules that run inside someone else's attack, usually on the GM's client: "I would drop to 0" (Refuse to Fall) and
    "I take damage". Those can now ask.
  - The player is the creature's active non-GM owner (their own character first), else the GM.
  - No answer within two minutes counts as no, and the attack carries on.
  - Bonded-creature rules (sharing a hit, getting a cost back) never ask.
- **Default:** new rules whose outcome is a choice (extra damage, staying up, "only the actions") ask first. Heals
  and temp HP that the text grants outright just happen, with their card.
- **Costs from the feature's own uses:** a rule's Costs can be "Uses of this feature" (Mark of Darkness on a hit).
- **Apply-an-effect options:**
  - **One creature at a time:** applying it removes the copies on everyone else in the scene (a mark moves).
  - **Player picks an ability:** `{ability}` in the effect's change keys becomes the choice, and the effect is named
    after it (Curse's −2 saves).
  - **`{owner}`:** in a change's value, this becomes the applier's actor uuid, for midi conditions such as
    `workflow?.actor?.uuid === "{owner}"`.

**New with this:**
- **Mark or curse:** marks are placed by the feature's own rules, which makes these options possible:
  - also offered on a hit (asks, costs a use)
  - one at a time
  - a save penalty on an ability the player picks
  - "those count only between it and you", for Mark of Devastation
- **Teleport:** can offer to warp beside the creature carrying your mark (Shadow Warp).
- **Use and spend:** can post an announcement (Soul Surge, Shadow Image).
- **Weapon attack against everyone in an area:** Death Wave. It asks which melee weapon, then makes one attack roll
  against each AC through `MidiQOL.completeActivityUse`, with the extra damage as a short-lived melee damage bonus.

## Dark Knight roadmap

These are in the order I suggest building them. Each one unlocks the Dark Knight features listed.

**Status, 2026-10-23:**
- **Built as templates:** 1–10 (see the table above). Vanguard Stance's temp HP each turn uses midi OverTime, so no new
  behavior event was needed.
- **How reactions work:** they use midi's own reaction prompts. A roll's **Midi offers it when** setting
  (`reactionTrigger`) becomes its `reactionCondition`. Damage reduction is `system.traits.dm.midi.all = -(formula)`,
  which midi rolls against the defender.
- **Ally damage:** done two ways.
  - **Bond:** a behavior event "a creature bonded to me is about to take damage". Its hook rides on the item's **bond
    effect**, set to "The target, bonded", so midi runs it for the ally, and the macro moves the share onto the owner.
  - **Take a hit:** for one-off reactions. Midi only offers reactions to the creature that's hit, so this is used after
    the hit with the amount typed in.
- **Scripts:** teleport, take a hit and sacrifice are `foundryAutomation.js` script recipes. They run on the user's
  client, and anything touching another creature goes through midi's GM socket (`updateActor`, `moveToken`).
- **Group 1 (Dark Knight odds and ends):**
  - **Live over-time formulas.** Standalone features keep their over-time formulas live (`formulasAsIs`), so `1d10 +
    @abilities.con.mod` is the real owner's CON, not a baked 0. Commas are fine (`min(1, …)`): midi's OverTime setting
    splits only at `, key=`, and the stance template refuses just that.
  - **New behavior outcome "my damage ignores resistance".** It adds `idr.<type>` to midi's per-roll ignore list and
    removes it when the roll completes. It's built into Defenses ("Your damage ignores resistance to").
  - **New linked-creature event "a creature I've marked drops to 0".** Its outcome gives back a use of the feature, or
    the resource it cost. It's built into Mark or curse ("When the marked creature drops to 0").
  - **Attack-count upgrades** like Shadow Bolt's second bolt are a second roll with a use condition, e.g.
    `classes["the-dark-knight"]?.levels >= 7`.
- **Group 2 (cost reductions) and The Final Art:**
  - **Discount flags.** Discounts live on the owner as `flags.chrab-sync.discount.<resource>` and
    `.discount.<feature identifier>`.
  - **Spender costs.** A spender's cost is `max(1, N - @flags…<resource> - @flags…<feature>)`. dnd5e evaluates costs
    against the actor's roll data, which includes its flags.
  - **Keeping the flags defined.** Every spender carries a synthetic always-on "cost" effect that upgrades both flags
    to at least 0, because a missing reference would break the formula. Upgrade runs after add, so a discount survives
    it.
  - **Rule costs.** A behavior rule's cost reads the same flags.
  - **Cost reduction template.** It adds to the resource's flag, or to the listed features'.
  - **Stance template.** Gained "while on, a resource costs less" and "healing each turn".
  - **Attack template.** Gained an extra to-hit bonus and "ignores resistance and immunity" (midi `ignoreTraits`,
    also a checkbox on any damage roll).
- **Group 3 (the interaction list):**
  - **Behavior rules** gained triggers (I take damage, a target fails my save, I use this feature, start / end of my
    turn), checks on yourself (HP, statuses, a resource, in combat), a dice check (roll X, compare to Y) and extra
    actions (apply an effect, gain or spend a resource, store a value on the item, show a message or chat text).
  - **Auras** (`activity.aura`, any roll): midi's `regionBehavior` on the activity, which needs range `self` and a
    radius template. Rules: when a creature enters / leaves / starts / ends its turn inside → use a roll on it, apply
    or remove an effect. `targetId` is an activity id (or identifier) or an effect id on the same item; aura effects
    get `flags.dae.dontApply`. In the editor: Midi-qol automation → "+ Make this an aura", and an effect's Applies
    to → "Creatures in the aura".
  - **Over time on others:** a lingering effect carries `ActivityOverTime` naming a tick roll, rolled as the source
    (`overTimeProperties.rollAs: "source"`), so the formula uses the caster's numbers.
  - **Summon / transform rolls:** dnd5e 5.3 activity types. One profile, by UUID (`mode: ""`) or by CR and creature
    type (`mode: "cr"`, the player picks from the compendium browser). Summons match your attack, save and
    proficiency and take your side (midi `friendlySummon`). Transform presets are dnd5e's; "keep mind, class,
    features and HP" is a customized settings block.
  - **Upcasting beyond dice:** target counts are dnd5e formulas evaluated on the scaled item, so
    `1 + @scaling.increase` is one more target per extra point spent (Save or suffer: "one more target per extra
    point").
  - **Template costs** now land on the first roll only; helper rolls (a repeat save, an aura's damage, a lingering
    tick) cost nothing.
  - **Range increases:** skipped on purpose.
  - **Not possible with dnd5e + midi alone:** "a duplicate of yourself" (Shadow Image). A summon needs a creature
    chosen in advance and doesn't share your stats or Darkness pool; it would need a script that copies the actor.
- **Still to do:** Death Wave (an area weapon attack).

**Costs on behavior rules:** a "when I hit…" rule can now cost a resource. Set **Costs from resource** to the
identifier, the amount, and optionally **Can spend more**.
- The generated macro finds the owner's pool item by identifier and checks there's enough.
- Asking first or spending more shows a "spend how much?" prompt.
- It deducts what was spent, and each point over the cost adds one of the formula's first die.

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
- **Aura:** done (Imposing Presence, Harbinger and Vanguard L19).
- **Teleport:** done (Shadow Warp).
- **Summon:** the template is done; Shadow Image (a copy of yourself) needs a copy-the-actor script.
- **Cost reductions:** done (Magus L7 / L19, The Final Art).

**Left as text, or to the class itself:**
- **Choice menus:** Dark Arts picks are the class's own dnd5e choices (`docs/foundry-classes.md`). Fighting Style
  is still text.
- **Action economy:** Extra Attack, Soul Surge.
- **Narrative:** Soul Bound.
- **Hard to automate:** Inevitable (auto-succeed after a turn).

**Content to fix as we reach it:**
- Chains of Despair's text is cut off.
- Magus L7 references "Dark Pulse", assumed to mean Grasp of Shadows.
