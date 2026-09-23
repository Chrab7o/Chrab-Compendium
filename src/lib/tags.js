// Tags replaced folders as the organizing axis (see the tag_groups
// migration). What used to need a tree walk — inherited visibility, inherited
// campaign, inherited tags — is now stamped on the entry itself, so most of
// what lib/folders.js did has no successor here. What's left is the group
// query model and campaign scoping.

// A tag group is a facet: Type, Collection, Region, Faction, Campaign.
// Filtering ORs within a group and ANDs across them — that combination is
// what makes a group read like a folder path ("Type: NPC" + "Region:
// Ashfall") while still letting one entry sit in as many groups as it likes.
export function matchesTagQuery(entryTags, selectionsByGroup) {
  const owned = new Set((entryTags ?? []).map((t) => t.toLowerCase()))
  for (const values of Object.values(selectionsByGroup)) {
    if (!values || values.length === 0) continue
    if (!values.some((v) => owned.has(v.toLowerCase()))) return false
  }
  return true
}

// Region targeting (map_regions.tag_query) is a flat AND — a region shows
// entries carrying *every* tag listed, so "Locations in Ashfall" is two tags
// rather than the one folder it used to take.
export function matchesAllTags(entryTags, query) {
  if (!query || query.length === 0) return false
  const owned = new Set((entryTags ?? []).map((t) => t.toLowerCase()))
  return query.every((t) => owned.has(t.toLowerCase()))
}

export function tagsByGroup(tags, groups) {
  return groups
    .map((group) => ({
      group,
      tags: tags
        .filter((t) => t.group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    }))
    .filter((g) => g.tags.length > 0)
}

// Tags with no group yet — newly created ones, or ones whose group was
// deleted (group_id is ON DELETE SET NULL). They'd otherwise be invisible in
// a strictly grouped UI, so every grouped view renders these under "Other".
export function ungroupedTags(tags) {
  return tags
    .filter((t) => !t.group_id)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
}

export function tagLabel(tags, value) {
  return tags.find((t) => t.value === value)?.label ?? value
}

// The Type group is the old `categories` table: exclusive and required, so
// every entry carries exactly one and it's what a card shows as its kind.
export function typeTagValue(tags, groups, entryTags) {
  const typeGroup = groups.find((g) => g.value === 'type')
  if (!typeGroup) return null
  const owned = new Set(entryTags ?? [])
  return tags.find((t) => t.group_id === typeGroup.id && owned.has(t.value))?.value ?? null
}

// A campaign's mirror tag, kept in sync by the campaigns_sync_tag trigger.
// entries.campaign_id stays authoritative for an entry's primary campaign;
// these tags exist so an entry can *also* surface under other campaigns.
export function campaignTagValue(campaignId) {
  return `campaign-${campaignId}`
}

// The current session's active scope, as a set of campaign ids to match
// against (or null for "no scope, show everything"). A specific campaign
// always wins; with just a world picked (no campaign chosen yet), it's
// every campaign belonging to that world — so entering a world narrows
// Locations/People/Search even before you've picked one of its campaigns.
export function scopedCampaignIds(campaigns, worldId, campaignId) {
  if (campaignId) return new Set([campaignId])
  if (worldId) return new Set(campaigns.filter((c) => c.world_id === worldId).map((c) => c.id))
  return null
}

// An entry is in scope if its primary campaign is, or if it carries the
// mirror tag of any campaign in scope. The second half is the part folders
// couldn't do: one entry genuinely shared between two campaigns, rather than
// duplicated or filed under whichever one it mattered to most.
export function entryInCampaignScope(entry, allowedCampaignIds) {
  if (!allowedCampaignIds) return true
  if (entry.campaign_id && allowedCampaignIds.has(entry.campaign_id)) return true
  const owned = new Set(entry.tags ?? [])
  for (const id of allowedCampaignIds) {
    if (owned.has(campaignTagValue(id))) return true
  }
  // Entries belonging to no campaign at all are general reference material
  // and stay visible in every scope.
  return !entry.campaign_id
}

// A region's tag query, with the active timeline's override applied if one
// exists (region_tag_links). Falls back to the region's own default when
// there's no override for the active campaign, or no campaign selected.
export function effectiveRegionTagQuery(region, links, campaignId) {
  if (campaignId) {
    const override = links.find((l) => l.region_id === region.id && l.campaign_id === campaignId)
    if (override) return override.tag_query ?? []
  }
  return region.tag_query ?? []
}
