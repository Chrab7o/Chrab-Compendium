import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useCampaignContext } from '../contexts/CampaignContext'
import { useCategories } from '../contexts/CategoryContext'
import { useTags } from '../contexts/TagContext'
import { effectiveEntryCampaignId, mergePlacements } from '../lib/folders'
import { BrowseIcon } from './Icons'
import EntryCard from './EntryCard'

// A flexible, non-hierarchical alternative to browsing the folder tree:
// free-text title search plus category/tag filters, both sourced live from
// the DM-managed categories/tags vocabularies — a new tag or category shows
// up here automatically, no new page or route needed the way the old
// Locations/People/Session Notes tag pages did.
export default function EntrySearch({ initialCategory = null }) {
  const { campaignId } = useCampaignContext()
  const { categories } = useCategories()
  const { tags } = useTags()
  const [entries, setEntries] = useState([])
  const [folders, setFolders] = useState([])
  const [placements, setPlacements] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(initialCategory ?? '')
  const [activeTags, setActiveTags] = useState(() => new Set())

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('entries').select('*'),
      supabase.from('folders').select('*'),
      supabase.from('entry_placements').select('*'),
    ]).then(([{ data: entryData }, { data: folderData }, { data: placementData }]) => {
      setEntries(entryData ?? [])
      setFolders(folderData ?? [])
      setPlacements(placementData ?? [])
      setLoading(false)
    })
  }, [])

  // A quick-link from CampaignHome can re-target this same page/instance
  // with a different starting category (e.g. navigating from one campaign
  // card to another) — sync when that changes, but leave the user's own
  // in-progress filter choices alone otherwise.
  useEffect(() => {
    if (initialCategory) setCategory(initialCategory)
  }, [initialCategory])

  function toggleTag(value) {
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const hasFilters = Boolean(query || category || activeTags.size > 0)

  // Nothing typed and nothing filtered means every entry in scope would
  // match — showing that whole pile by default is exactly the "messy, no
  // one asked for this" result this component exists to avoid, so it
  // stays empty until the visitor actually searches or filters for
  // something (an incoming initialCategory from a quick-link counts).
  const results = useMemo(() => {
    if (!hasFilters) return []
    const merged = mergePlacements(entries, placements)
    const q = query.trim().toLowerCase()
    return merged
      .filter((e) => {
        if (campaignId) {
          const eff = effectiveEntryCampaignId(folders, e)
          if (eff && eff !== campaignId) return false
        }
        if (category && e.category !== category) return false
        if (activeTags.size > 0 && !e.tags?.some((t) => activeTags.has(t))) return false
        if (q && !e.title.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [hasFilters, entries, placements, folders, campaignId, category, activeTags, query])

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

        {categories.length > 0 && (
          <div className="entry-search-chips" role="group" aria-label="Filter by category">
            <button
              type="button"
              className={category ? 'chip' : 'chip active'}
              onClick={() => setCategory('')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.value}
                type="button"
                className={category === c.value ? 'chip active' : 'chip'}
                onClick={() => setCategory(category === c.value ? '' : c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="entry-search-chips" role="group" aria-label="Filter by tag">
            {tags.map((t) => (
              <button
                key={t.value}
                type="button"
                className={activeTags.has(t.value) ? 'chip chip-tag active' : 'chip chip-tag'}
                onClick={() => toggleTag(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

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
          <p>Type a name or pick a category/tag above.</p>
        </div>
      )}

      {!loading && hasFilters && results.length === 0 && (
        <div className="browse-empty">
          <BrowseIcon />
          <p className="browse-empty-title">Nothing found</p>
          <p>Try a different search or fewer filters.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="entry-grid">
          {results.map((entry) => (
            <EntryCard key={entry.__placementId ? `placement-${entry.__placementId}` : entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
