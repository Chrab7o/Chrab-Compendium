// Categories are DM-editable (see CategoryContext), fetched once and cached
// here so categoryLabel() can stay a plain synchronous lookup everywhere
// it's already used, instead of every call site needing the live list.
let cache = []

export function setCategoriesCache(list) {
  cache = list
}

export function categoryLabel(value) {
  return cache.find((c) => c.value === value)?.label ?? value
}
