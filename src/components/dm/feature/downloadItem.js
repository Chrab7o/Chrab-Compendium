import { buildFeatureItem, featureName } from '../../../lib/foundryFeatures'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Foundry's own "Export Data" file name. In Foundry: Items -> Create Item (any
// name, same type), right-click it -> Import Data -> pick this file.
export function downloadFeatureItem(spec, draftId = null) {
  const item = buildFeatureItem(spec, { draftId })
  const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fvtt-Item-${slugify(featureName(spec) || 'feature') || 'feature'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
