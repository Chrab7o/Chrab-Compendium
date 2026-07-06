// Reads a raw FoundryVTT dnd5e actor export (the JSON you get from Foundry's
// "Export Data" on an actor). That export is SOURCE data only — Foundry
// computes things like AC and max HP live from equipped gear/class levels
// and does not persist the result, so this file estimates them from the
// same inputs Foundry itself uses. Estimates are labeled as such; anything
// that would need full 5e rules coverage to get exactly right (active
// effects, conditional bonuses, feats that modify formulas) is out of scope.

const SKILL_LABELS = {
  acr: 'Acrobatics',
  ani: 'Animal Handling',
  arc: 'Arcana',
  ath: 'Athletics',
  dec: 'Deception',
  his: 'History',
  ins: 'Insight',
  itm: 'Intimidation',
  inv: 'Investigation',
  med: 'Medicine',
  nat: 'Nature',
  prc: 'Perception',
  prf: 'Performance',
  per: 'Persuasion',
  rel: 'Religion',
  slt: 'Sleight of Hand',
  ste: 'Stealth',
  sur: 'Survival',
}

const PROFICIENCY_LABELS = { 0: 'none', 0.5: 'half', 1: 'proficient', 2: 'expertise' }

export function abilityMod(score) {
  if (typeof score !== 'number') return 0
  return Math.floor((score - 10) / 2)
}

function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function getAbilities(actor) {
  const abilities = actor.system?.abilities ?? {}
  return Object.entries(abilities).map(([key, ability]) => ({
    key,
    label: key.toUpperCase(),
    score: ability.value,
    mod: abilityMod(ability.value),
    proficient: !!ability.proficient,
  }))
}

export function getTotalLevel(actor) {
  return (actor.items ?? [])
    .filter((i) => i.type === 'class')
    .reduce((sum, c) => sum + (c.system?.levels ?? 0), 0)
}

export function proficiencyBonus(level) {
  return 2 + Math.floor(Math.max(level - 1, 0) / 4)
}

export function getClasses(actor) {
  const classes = (actor.items ?? []).filter((i) => i.type === 'class')
  const subclasses = (actor.items ?? []).filter((i) => i.type === 'subclass')
  return classes.map((c, i) => ({
    name: c.name,
    levels: c.system?.levels ?? 0,
    subclass: subclasses[i]?.name ?? null,
  }))
}

export function getSkills(actor) {
  const skills = actor.system?.skills ?? {}
  const abilities = actor.system?.abilities ?? {}
  const level = getTotalLevel(actor)
  const prof = proficiencyBonus(level)
  return Object.entries(skills).map(([key, skill]) => {
    const abilityScore = abilities[skill.ability]?.value
    const total = abilityMod(abilityScore) + Math.floor(prof * (skill.value ?? 0))
    return {
      key,
      label: SKILL_LABELS[key] ?? key,
      ability: skill.ability,
      proficiency: PROFICIENCY_LABELS[skill.value] ?? 'none',
      total,
      totalLabel: formatMod(total),
    }
  })
}

// Best-effort AC: base 10 + dex (uncapped) with no armor, or the highest
// equipped body armor's base value + dex up to its cap, plus any equipped
// shield's bonus and any flat magical AC bonuses on other equipped items.
export function estimateAC(actor) {
  const items = actor.items ?? []
  const dexMod = abilityMod(actor.system?.abilities?.dex?.value)
  const equippedArmor = items.filter(
    (i) => i.type === 'equipment' && i.system?.equipped && i.system?.armor
  )

  const bodyArmor = equippedArmor
    .filter((i) => ['light', 'medium', 'heavy'].includes(i.system?.type?.value))
    .sort((a, b) => (b.system.armor.value ?? 0) - (a.system.armor.value ?? 0))[0]

  const dexCap = { light: Infinity, medium: 2, heavy: 0 }
  let base
  if (bodyArmor) {
    const cap = dexCap[bodyArmor.system.type.value] ?? Infinity
    base = (bodyArmor.system.armor.value ?? 10) + Math.min(dexMod, cap)
  } else {
    base = 10 + dexMod
  }

  const shieldBonus = equippedArmor
    .filter((i) => i.system?.type?.value === 'shield' || i.system?.armor?.baseItem === 'shield')
    .reduce((sum, i) => sum + (i.system.armor.value ?? 0), 0)

  const magicalBonus = equippedArmor
    .filter((i) => i !== bodyArmor)
    .reduce((sum, i) => sum + (parseInt(i.system.armor.magicalBonus, 10) || 0), 0)

  return base + shieldBonus + magicalBonus
}

const HIT_DIE_AVERAGE = { d6: 4, d8: 5, d10: 6, d12: 7 }

// Best-effort max HP from each class's HitPoints advancement entry (which
// records, per level, whether the player took "max", "avg", or a specific
// rolled number) plus CON modifier per level.
export function estimateMaxHP(actor) {
  const conMod = abilityMod(actor.system?.abilities?.con?.value)
  const classes = (actor.items ?? []).filter((i) => i.type === 'class')
  if (classes.length === 0) return null

  let total = 0
  for (const cls of classes) {
    const denomination = cls.system?.hd?.denomination
    const levels = cls.system?.levels ?? 0
    const advancement = Object.values(cls.system?.advancement ?? {}).find(
      (a) => a.type === 'HitPoints'
    )
    if (!denomination || !advancement) return null

    const dieMax = parseInt(denomination.replace('d', ''), 10)
    const dieAvg = HIT_DIE_AVERAGE[denomination] ?? Math.ceil(dieMax / 2) + 1

    for (let lvl = 1; lvl <= levels; lvl += 1) {
      const entry = advancement.value?.[String(lvl)]
      if (entry === 'max') total += dieMax
      else if (entry === 'avg') total += dieAvg
      else if (typeof entry === 'number') total += entry
      else return null
    }
    total += conMod * levels
  }
  return total
}

export function getInventory(actor) {
  const skip = new Set(['class', 'subclass', 'race', 'background', 'feat', 'spell'])
  const items = (actor.items ?? []).filter((i) => !skip.has(i.type))
  const grouped = {}
  for (const item of items) {
    ;(grouped[item.type] ??= []).push({
      name: item.name,
      quantity: item.system?.quantity ?? 1,
      equipped: !!item.system?.equipped,
    })
  }
  return grouped
}

export function getSpells(actor) {
  const spells = (actor.items ?? []).filter((i) => i.type === 'spell')
  const byLevel = {}
  for (const spell of spells) {
    const level = spell.system?.level ?? 0
    ;(byLevel[level] ??= []).push(spell.name)
  }
  return byLevel
}

export function getFeats(actor) {
  return (actor.items ?? [])
    .filter((i) => i.type === 'feat')
    .map((i) => ({ name: i.name, description: i.system?.description?.value ?? '' }))
}

export function getRaceAndBackground(actor) {
  const race = (actor.items ?? []).find((i) => i.type === 'race')?.name ?? null
  const background = (actor.items ?? []).find((i) => i.type === 'background')?.name ?? null
  return { race, background }
}

export function getCurrency(actor) {
  return actor.system?.currency ?? {}
}

export function summarizeActor(actor) {
  const level = getTotalLevel(actor)
  const classes = getClasses(actor)
  const { race, background } = getRaceAndBackground(actor)
  const classSummary = classes.map((c) => `${c.name} ${c.levels}`).join(' / ') || 'Unknown class'
  return {
    name: actor.name,
    level,
    classSummary,
    race,
    background,
  }
}
