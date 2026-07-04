export const CATEGORIES = [
  { value: 'lore', label: 'World Lore' },
  { value: 'npc', label: 'NPC' },
  { value: 'location', label: 'Location' },
  { value: 'session-note', label: 'Session Note' },
  { value: 'homebrew', label: 'Homebrew' },
  { value: 'item', label: 'Item' },
]

export function categoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}
