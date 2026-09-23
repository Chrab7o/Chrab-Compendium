// Tags are DM-editable (see TagContext), fetched once and cached here so
// tagLabel() can stay a plain synchronous lookup everywhere it's used,
// instead of every call site needing the live list. Replaces lib/categories.js,
// which did the same job for the categories table the Type group absorbed.
let cache = []

export function setTagsCache(list) {
  cache = list
}

export function tagLabel(value) {
  return cache.find((t) => t.value === value)?.label ?? value
}

export function tagColor(value) {
  return cache.find((t) => t.value === value)?.color ?? null
}
