// Widget type registry for the DM Screen - data-only descriptors, same
// shape as sessionPlanner.js's CONTENT_TYPES. The actual type -> component
// mapping lives in DMScreenPage.jsx (keeping JSX out of this plain-data
// file), this just supplies the picker list and each type's default config
// shape for a freshly-added widget.
export const WIDGET_TYPES = [
  { key: 'npc_generator', label: 'NPC Name Generator', defaultConfig: {} },
  { key: 'session_flow', label: 'Session Flow Chart', defaultConfig: { sessionPlanId: null } },
  { key: 'reminders', label: 'Quick Reminders', defaultConfig: {} },
  { key: 'session_wrapup', label: 'Session Wrap-Up', defaultConfig: { text: '' } },
]

export function widgetTypeInfo(key) {
  return WIDGET_TYPES.find((w) => w.key === key) ?? null
}
