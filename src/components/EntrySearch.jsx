import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useTags } from '../contexts/TagContext'
import { entryInCampaignScope, matchesTagQuery, scopedCampaignIds, tagsByGroup } from '../lib/tags'
import { BrowseIcon } from './Icons'
import EntryCard from './EntryCard'
import BulkEditBar from './dm/BulkEditBar'

// The primary way to find an entry now that folders are gone. Each tag group
// renders as its own filter row, and the query ORs within a group while
// ANDing across them — "Type: NPC" + "Region: Ashfall" reads like a folder
// path, except the same entry can also answer to "Faction: Ashen Hand"
// without being filed twice.
// Stays empty until the visitor actually searches or filters for something;
// dumping every entry in scope by default is exactly the "messy, nobody
// asked for this" result this component exists to avoid.
export default function EntrySearch() {
  const { isDM } = useAuth()
  const { campaigns, campaignId, worldId } = useCampaignContext()
  const { tags, groups } = useTags()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  // { [groupId]: string[] } — selected tag values per group.
  const [selections, setSelections] = useState({})
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [showAllFilters, setShowAllFilters] = useState(false)

  const reload = useMemo(
    () => async () => {
      setLoading(true)
      const { data } = await supabase.from('entries').select('*')
      setEntries(data ?? [])
      setLoading(false)
    },
    []
  )

  useEffect(() => {
    reload()
  }, [reload])

  function toggleTag(groupKey, value) {
    setSelections((prev) => {
      const current = prev[groupKey] ?? []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      return { ...prev, [groupKey]: next }
    })
  }

  function clearFilters() {
    setSelections({})
    setQuery('')
  }

  const activeCount = Object.values(selections).reduce((n, v) => n + (v?.length ?? 0), 0)
  const hasFilters = Boolean(query || activeCount > 0)

  const grouped = tagsByGroup(tags, groups)
  // Campaign membership is already handled by the world/campaign scope
  // picker in the nav, so showing it again as a filter row is noise.
  const filterGroups = grouped.filter((g) => g.group.value !== 'campaign')
  // The first two groups (Type, Collection) carry most of the weight; the
  // rest collapse so the control doesn't become a wall of chips.
  const visibleGroups = showAllFilters ? filterGroups : filterGroups.slice(0, 2)

  const results = useMemo(() => {
    if (!hasFilters) return []
    const q = query.trim().toLowerCase()
    const allowedCampaignIds = scopedCampaignIds(campaigns, worldId, campaignId)
    return entries
      .filter((e) => {
        if (!entryInCampaignScope(e, allowedCampaignIds)) return false
        if (!matchesTagQuery(e.tags, selections)) return false
        if (q && !e.title.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [hasFilters, entries, campaigns, campaignId, worldId, selections, query])

  const resultIds = useMemo(() => new Set(results.map((r) => r.id)), [results])
  // Dropping a filter can take a selected entry out of the results; keeping
  // it selected would mean a bulk edit silently touching rows that are no
  // longer on screen.
  const activeSelection = useMemo(
    () => [...selectedIds].filter((id) => resultIds.has(id)),
    [selectedIds, resultIds]
  )

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="entry-search">
      <div className="entry-search-controls">
        <input
          type="search"
          className="entry-search-input"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search entries by name"
        />

        {visibleGroups.map(({ group, tags: groupTags }) => (
          <div key={group.id} className="entry-search-group">
            <span className="entry-search-group-label">{group.label}</span>
            <div className="entry-search-chips" role="group" aria-label={`Filter by ${group.label}`}>
              {groupTags.map((t) => {
                const active = (selections[group.id] ?? []).includes(t.value)
                return (
                  <button
                    key={t.value}
                    type="button"
                    className={active ? 'chip chip-tag active' : 'chip chip-tag'}
                    style={t.color ? { '--chip-accent': t.color } : undefined}
                    aria-pressed={active}
                    onClick={() => toggleTag(group.id, t.value)}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="entry-search-actions">
          {filterGroups.length > 2 && (
            <button
              type="button"
              className="link-button"
              onClick={() => setShowAllFilters((v) => !v)}
            >
              {showAllFilters ? 'Fewer filters' : `More filters (${filterGroups.length - 2})`}
            </button>
          )}
          {hasFilters && (
            <button type="button" className="link-button" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {isDM && activeSelection.length > 0 && (
        <BulkEditBar
          entryIds={activeSelection}
          onDone={() => {
            setSelectedIds(new Set())
            reload()
          }}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {loading && (
        <div className="browse-loading" role="status">
          <span className="browse-loading-spinner" aria-hidden="true" />
          Loading...
        </div>
      )}

      {!loading && !hasFilters && (
        <div className="browse-empty">
          <BrowseIcon />
          <p className="browse-empty-title">Search to see results</p>
          <p>Type a name or pick a tag above.</p>
        </div>
      )}

      {!loading && hasFilters && results.length === 0 && (
        <div className="browse-empty">
          <BrowseIcon />
          <p className="browse-empty-title">Nothing found</p>
          <p>Try a different search or fewer filters.</p>
        </div>
      )}

      {!loading && hasFilters && results.length > 0 && (
        <div className="entry-grid">
          {results.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selectable={isDM}
              selected={selectedIds.has(entry.id)}
              onToggleSelect={() => toggleSelected(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
