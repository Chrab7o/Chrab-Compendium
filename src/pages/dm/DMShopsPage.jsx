import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import {
  DEFAULT_SPEC,
  RARITIES,
  cycleProgress,
  missingCounts,
  totalMissing,
  SETTING_NEUTRAL_SOURCES,
  SOURCE_LABELS,
  attunementLabel,
  loadPool,
  rollStock,
  slugify,
  sortStock,
  toStockRow,
} from '../../lib/shopPool'

const emptyDraft = { name: '', slug: '', blurb: '', campaign_id: '', visibility: 'dm' }
const emptyManual = { name: '', rarity: '', description: '' }

// The rotating shop roller. A shop is a randomised list of magic items the
// party can browse in character; the app does not sell anything, so there is
// no gold or stock count here - see the migration for why.
//
// Restocking is a total re-randomisation by design. Items the DM added on
// purpose (homebrew from the Item Maker, or typed in by hand) are kept, since
// a reroll is about the random stock, not about discarding deliberate choices.
export default function DMShopsPage() {
  const [shops, setShops] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [stock, setStock] = useState([])
  const [homebrew, setHomebrew] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [manual, setManual] = useState(emptyManual)
  const [showAdd, setShowAdd] = useState(false)
  const [pool, setPool] = useState(null)
  // The rarity counts are edited locally and only written on blur. Keeping a
  // draft here (rather than reading straight from `spec`) means typing stays
  // responsive, and - more importantly - the restock below can use what is
  // currently in the boxes instead of whatever last round-tripped from the
  // database.
  const [countDraft, setCountDraft] = useState({})

  const selected = shops.find((s) => s.id === selectedId) ?? null
  const spec = useMemo(() => ({ ...DEFAULT_SPEC, ...(selected?.spec ?? {}) }), [selected])

  const load = useCallback(async () => {
    const [{ data: shopRows, error: shopError }, { data: campaignRows }] = await Promise.all([
      supabase.from('shops').select('*').order('name', { ascending: true }),
      supabase.from('campaigns').select('id, name').order('name', { ascending: true }),
    ])
    if (shopError) setError(shopError.message)
    setShops(shopRows ?? [])
    setCampaigns(campaignRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Stock is loaded per shop rather than all at once: the descriptions are full
  // item text, and there is no reason to pull every shop's worth to render one.
  const loadStock = useCallback(async (shopId) => {
    if (!shopId) {
      setStock([])
      return
    }
    const { data, error: stockError } = await supabase
      .from('shop_items')
      .select('*')
      .eq('shop_id', shopId)
      .order('position', { ascending: true })
    if (stockError) setError(stockError.message)
    setStock(data ?? [])
  }, [])

  useEffect(() => {
    loadStock(selectedId)
  }, [selectedId, loadStock])

  // The pool is only needed to roll and to show how far through each deck the
  // shop is, so it loads on first shop selection rather than with the page.
  useEffect(() => {
    if (!selectedId || pool) return
    loadPool().then(setPool).catch((err) => setError(err.message))
  }, [selectedId, pool])

  // Seed the count boxes once per shop, as soon as that shop's row is actually
  // in hand. Keying this on `selectedId` alone seeded them from a row that had
  // not loaded yet, so a freshly created shop showed zeros; re-seeding on every
  // change of `spec` would instead stomp a number still being typed.
  const seededFor = useRef(null)
  useEffect(() => {
    if (!selected) {
      seededFor.current = null
      setCountDraft({})
      return
    }
    if (seededFor.current === selected.id) return
    seededFor.current = selected.id
    setCountDraft({ ...DEFAULT_SPEC.counts, ...(selected.spec?.counts ?? {}) })
  }, [selected])

  // Gaps left by items that were removed or banished, so the fill button can
  // say how many slots it would actually plug.
  const missing = useMemo(
    () => missingCounts(stock, { ...spec, counts: { ...spec.counts, ...countDraft } }),
    [stock, spec, countDraft]
  )
  const gaps = totalMissing(missing)

  const progress = useMemo(
    () => (pool && selected ? cycleProgress(pool, spec, selected.draw_history ?? {}) : []),
    [pool, selected, spec]
  )

  async function handleCreate(e) {
    e.preventDefault()
    const name = draft.name.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('shops')
      .insert({
        name,
        slug: draft.slug.trim() || slugify(name),
        blurb: draft.blurb.trim(),
        campaign_id: draft.campaign_id || null,
        visibility: draft.visibility,
        spec: DEFAULT_SPEC,
      })
      .select()
      .single()
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDraft(emptyDraft)
    setSelectedId(data.id)
    load()
  }

  async function patchShop(changes) {
    if (!selected) return
    setError(null)
    const { error: updateError } = await supabase.from('shops').update(changes).eq('id', selected.id)
    if (updateError) setError(updateError.message)
    else load()
  }

  async function handleDeleteShop() {
    if (!selected) return
    if (!confirm(`Delete "${selected.name}" and its stock?`)) return
    const { error: deleteError } = await supabase.from('shops').delete().eq('id', selected.id)
    if (deleteError) setError(deleteError.message)
    else {
      setSelectedId(null)
      load()
    }
  }

  // Renumber the whole shelf into rarity order. Run after anything that changes
  // the stock, so a topped-up item lands with its own rarity instead of at the
  // bottom of the list.
  async function resortStock(shopId) {
    const { data } = await supabase.from('shop_items').select('id, name, rarity').eq('shop_id', shopId)
    const ordered = sortStock(data ?? [])
    await Promise.all(
      ordered.map((row, i) => supabase.from('shop_items').update({ position: i }).eq('id', row.id))
    )
  }

  // A restock replaces every rolled row and leaves the DM's own additions
  // alone, then the whole shelf is re-sorted by rarity.
  async function handleRestock() {
    if (!selected) return
    const kept = stock.filter((row) => row.origin !== '5etools')
    const keptNote = kept.length ? ` ${kept.length} hand-added item(s) will be kept.` : ''
    // What is in the boxes right now, which is not necessarily what has been
    // saved: clicking this button blurs the count input, and that write is
    // still in flight while the confirm dialog blocks.
    const counts = { ...spec.counts, ...countDraft }
    const total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0)
    if (!confirm(`Reroll ${total} random items for "${selected.name}"?${keptNote}`)) return

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const pool = await loadPool()
      const rollSpec = { ...spec, counts }
      // Save the counts before rolling, so what the shop stocks always matches
      // what its saved spec says it stocks.
      await commitCounts(counts)
      // Re-read the discard pile rather than trusting the loaded row: a restock
      // is the one action where using a stale value silently corrupts the
      // no-repeat cycle.
      const { data: fresh } = await supabase
        .from('shops')
        .select('draw_history')
        .eq('id', selected.id)
        .single()
      // The discard pile makes restocks mutually exclusive: an item can't come
      // back until the rest of its rarity has been dealt. See rollStock.
      const { items, shortfalls, history, cycles } = rollStock(pool, rollSpec, {
        history: fresh?.draw_history ?? {},
      })

      const { error: clearError } = await supabase
        .from('shop_items')
        .delete()
        .eq('shop_id', selected.id)
        .eq('origin', '5etools')
      if (clearError) throw clearError

      if (items.length > 0) {
        const { error: insertError } = await supabase
          .from('shop_items')
          .insert(items.map((item, i) => toStockRow(item, selected.id, i)))
        if (insertError) throw insertError
      }

      await resortStock(selected.id)

      await supabase
        .from('shops')
        .update({ restocked_at: new Date().toISOString(), draw_history: history })
        .eq('id', selected.id)

      const messages = []
      if (cycles.length > 0) {
        messages.push(
          `Every ${cycles.join(' and ')} item has now been stocked at least once — those decks reshuffled.`
        )
      }
      if (shortfalls.length > 0) {
        messages.push(
          `Not enough items for: ${shortfalls
            .map((s) => `${s.rarity} (wanted ${s.want}, got ${s.got})`)
            .join(', ')}. Widen the sources or trim the never-stock list.`
        )
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null)
      await loadStock(selected.id)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Deal only into the empty slots, leaving everything already on the shelf
  // alone. Same deck and same discard pile as a restock - this is a partial
  // deal, not a separate randomiser.
  async function handleFillGaps() {
    if (!selected || gaps === 0) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const pool = await loadPool()
      const { data: fresh } = await supabase
        .from('shops')
        .select('draw_history')
        .eq('id', selected.id)
        .single()
      const { items, shortfalls, history, cycles } = rollStock(
        pool,
        { ...spec, counts: missing },
        {
          history: fresh?.draw_history ?? {},
          avoid: stock.map((row) => row.item_key).filter(Boolean),
        }
      )

      if (items.length > 0) {
        const start = stock.length
        const { error: insertError } = await supabase
          .from('shop_items')
          .insert(items.map((item, i) => toStockRow(item, selected.id, start + i)))
        if (insertError) throw insertError
      }

      await resortStock(selected.id)
      await supabase.from('shops').update({ draw_history: history }).eq('id', selected.id)

      const messages = [`Filled ${items.length} empty slot${items.length === 1 ? '' : 's'}.`]
      if (cycles.length > 0) {
        messages.push(`The ${cycles.join(' and ')} deck${cycles.length === 1 ? '' : 's'} reshuffled.`)
      }
      if (shortfalls.length > 0) {
        messages.push(
          `Still short on: ${shortfalls
            .map((s) => `${s.rarity} (${s.got} of ${s.want})`)
            .join(', ')}. Widen the sources or trim the never-stock list.`
        )
      }
      setNotice(messages.join(' '))
      await loadStock(selected.id)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeRow(row) {
    const { error: deleteError } = await supabase.from('shop_items').delete().eq('id', row.id)
    if (deleteError) setError(deleteError.message)
    else loadStock(selected.id)
  }

  // "Never stock again" is per shop, and it is what makes a total reroll
  // liveable: without it a banished item simply comes back next restock.
  async function banishRow(row) {
    if (!row.item_key) return
    const exclude = [...new Set([...(spec.exclude ?? []), row.item_key])]
    await patchShop({ spec: { ...spec, exclude } })
    await removeRow(row)
  }

  async function unbanish(key) {
    await patchShop({ spec: { ...spec, exclude: (spec.exclude ?? []).filter((k) => k !== key) } })
  }

  // Wiping the discard pile puts every item back in the deck. Separate from
  // the roll spec on purpose: changing what a shop stocks shouldn't silently
  // reshuffle, and reshuffling shouldn't change what it stocks.
  async function resetCycle() {
    if (!confirm('Put every item back in the deck? Items already stocked become drawable again.')) return
    await patchShop({ draw_history: {} })
  }

  function toggleSource(code) {
    const current = new Set(spec.sources ?? SETTING_NEUTRAL_SOURCES)
    if (current.has(code)) current.delete(code)
    else current.add(code)
    patchShop({ spec: { ...spec, sources: SETTING_NEUTRAL_SOURCES.filter((s) => current.has(s)) } })
  }

  const clampCount = (value) => Math.max(0, Math.min(50, Number(value) || 0))

  function editCount(rarity, value) {
    setCountDraft((prev) => ({ ...prev, [rarity]: clampCount(value) }))
  }

  function commitCounts(counts = countDraft) {
    if (!selected) return Promise.resolve()
    if (JSON.stringify(counts) === JSON.stringify(spec.counts)) return Promise.resolve()
    return supabase
      .from('shops')
      .update({ spec: { ...spec, counts } })
      .eq('id', selected.id)
      .then(({ error: e }) => {
        if (e) setError(e.message)
        else load()
      })
  }

  const openAddPanel = useCallback(async () => {
    setShowAdd(true)
    if (homebrew.length > 0) return
    const { data } = await supabase
      .from('item_maker_items')
      .select('id, name, item')
      .order('name', { ascending: true })
    setHomebrew(data ?? [])
  }, [homebrew.length])

  async function addRow(row) {
    const { error: insertError } = await supabase
      .from('shop_items')
      .insert({ ...row, shop_id: selected.id, position: stock.length })
    if (insertError) setError(insertError.message)
    else {
      setManual(emptyManual)
      setShowAdd(false)
      await resortStock(selected.id)
      loadStock(selected.id)
    }
  }

  async function handleAddManual(e) {
    e.preventDefault()
    if (!manual.name.trim()) return
    await addRow({
      name: manual.name.trim(),
      rarity: manual.rarity || null,
      description: manual.description.trim(),
      origin: 'manual',
    })
  }

  // The Item Maker owns its own item shape - a list of 'feature' blocks (a
  // named ability with a description) and 'text' blocks (free prose). Flatten
  // those to the markdown this page's descriptions use, matching how a named
  // 5etools sub-entry is rendered: a run-in bold lead.
  //
  // It has no rarity field, so homebrew arrives unrated; that is what the
  // manual form's rarity select is for if one is wanted.
  function blocksToMarkdown(blocks = []) {
    return blocks
      .map((block) => {
        if (block.type === 'text') return (block.content ?? '').trim()
        const heading = [block.name, block.subtitle].filter(Boolean).join(' — ')
        const body = [block.leadIn, block.description].filter((s) => s && s.trim()).join(' ').trim()
        if (!heading) return body
        return body ? `**${heading}.** ${body}` : `**${heading}.**`
      })
      .filter((s) => s.trim())
      .join('\n\n')
  }

  function addHomebrew(record) {
    addRow({
      name: record.name || 'Untitled',
      rarity: null,
      description: blocksToMarkdown(record.item?.blocks),
      origin: 'homebrew',
    })
  }

  if (loading) return <p className="status-message">Loading...</p>

  const excluded = spec.exclude ?? []
  const playerUrl = selected ? `${window.location.origin}${window.location.pathname}#/shop/${selected.slug}` : ''

  return (
    <section className="page">
      <div className="view-header">
        <h1>Shops</h1>
        <p className="view-subtitle">
          Roll a shop's stock from the published wondrous items, then point players at it. Nothing here is
          transactional — buying and bartering happen at the table. Restocking rerolls the random items and keeps
          anything you added by hand.
        </p>
      </div>

      {error && <p className="status-message error">{error}</p>}

      <div className="dm-panel">
        <h2>New shop</h2>
        <form onSubmit={handleCreate} className="dm-form">
          <div className="dm-form-row">
            <label>
              Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. The Gilded Astrolabe"
                required
              />
            </label>
            <label>
              URL slug (optional)
              <input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder={draft.name ? slugify(draft.name) : 'gilded-astrolabe'}
              />
            </label>
          </div>
          <div className="dm-form-actions">
            <button type="submit" disabled={saving || !draft.name.trim()}>
              {saving ? 'Creating...' : '+ Create shop'}
            </button>
          </div>
        </form>
      </div>

      {shops.length > 0 && (
        <div className="shop-tabs">
          {shops.map((shop) => (
            <button
              key={shop.id}
              type="button"
              className={`secondary${shop.id === selectedId ? ' is-active' : ''}`}
              onClick={() => setSelectedId(shop.id)}
            >
              {shop.name}
              {shop.visibility === 'dm' && <span className="badge badge-dm">DM only</span>}
            </button>
          ))}
        </div>
      )}

      {shops.length === 0 && <p className="status-message">No shops yet. Create one above.</p>}

      {selected && (
        <>
          <div className="dm-panel">
            <h2>{selected.name}</h2>
            <div className="dm-form">
              <div className="dm-form-row">
                <label>
                  Campaign
                  <select
                    value={selected.campaign_id ?? ''}
                    onChange={(e) => patchShop({ campaign_id: e.target.value || null })}
                  >
                    <option value="">General (no campaign)</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Visibility
                  <select
                    value={selected.visibility}
                    onChange={(e) => patchShop({ visibility: e.target.value })}
                  >
                    <option value="dm">DM only</option>
                    <option value="public">Visible to players</option>
                  </select>
                </label>
              </div>
              <label>
                Blurb shown above the stock
                <textarea
                  rows={3}
                  defaultValue={selected.blurb}
                  key={`blurb-${selected.id}`}
                  onBlur={(e) => {
                    if (e.target.value !== selected.blurb) patchShop({ blurb: e.target.value })
                  }}
                  placeholder="Who runs the place, what they'll trade for, when they're open..."
                />
              </label>
              <p className="shop-url">
                Player link: <code>#/shop/{selected.slug}</code>{' '}
                <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(playerUrl)}>
                  Copy
                </button>
              </p>
              <div className="dm-form-actions">
                <button type="button" className="danger" onClick={handleDeleteShop}>
                  Delete shop
                </button>
              </div>
            </div>
          </div>

          <div className="dm-panel">
            <h2>What it stocks</h2>
            <div className="dm-form">
              <fieldset className="shop-fieldset">
                <legend>How many of each rarity</legend>
                <div className="shop-counts">
                  {RARITIES.map((rarity) => (
                    <label key={rarity}>
                      {rarity}
                      {/* Edited locally, saved on blur: writing on every
                          keystroke would round-trip the database per digit and
                          the reload would fight the cursor. Restock uses the
                          draft directly, so an unsaved box still counts. */}
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={countDraft[rarity] ?? 0}
                        onChange={(e) => editCount(rarity, e.target.value)}
                        onBlur={() => commitCounts()}
                      />
                    </label>
                  ))}
                </div>
                {progress.length > 0 && (
                  <div className="shop-progress">
                    <p className="shop-progress-note">
                      Each rarity is dealt like a shuffled deck — an item won't come back until the rest of its
                      rarity has been stocked.
                    </p>
                    {progress.map(({ rarity, drawn, total }) => (
                      <div key={rarity} className="shop-progress-row">
                        <span className="shop-progress-label">{rarity}</span>
                        <span className="shop-progress-bar">
                          <span style={{ width: total ? `${(drawn / total) * 100}%` : 0 }} />
                        </span>
                        <span className="shop-progress-count">
                          {drawn}/{total} dealt
                        </span>
                      </div>
                    ))}
                    <button type="button" className="secondary" onClick={resetCycle}>
                      Reshuffle all decks
                    </button>
                  </div>
                )}
              </fieldset>

              <fieldset className="shop-fieldset">
                <legend>Sources to draw from</legend>
                <div className="shop-sources">
                  {SETTING_NEUTRAL_SOURCES.map((code) => (
                    <label key={code} className="shop-source">
                      <input
                        type="checkbox"
                        checked={(spec.sources ?? []).includes(code)}
                        onChange={() => toggleSource(code)}
                      />
                      <span>
                        <strong>{code}</strong> {SOURCE_LABELS[code]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {excluded.length > 0 && (
                <fieldset className="shop-fieldset">
                  <legend>Never stock ({excluded.length})</legend>
                  <ul className="shop-banished">
                    {excluded.map((key) => (
                      <li key={key}>
                        <span>{key.split('|')[0].replace(/-/g, ' ')}</span>
                        <button type="button" className="secondary" onClick={() => unbanish(key)}>
                          Allow again
                        </button>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              <div className="dm-form-actions">
                <button type="button" onClick={handleRestock} disabled={saving}>
                  {saving ? 'Rolling...' : 'Restock (reroll everything)'}
                </button>
                <button type="button" className="secondary" onClick={handleFillGaps} disabled={saving || gaps === 0}>
                  {gaps === 0 ? 'No empty slots' : `Fill ${gaps} empty slot${gaps === 1 ? '' : 's'}`}
                </button>
                <button type="button" className="secondary" onClick={openAddPanel}>
                  + Add an item by hand
                </button>
              </div>
              {selected.restocked_at && (
                <p className="shop-restocked">
                  Last restocked {new Date(selected.restocked_at).toLocaleString()}
                </p>
              )}
              {notice && <p className="status-message error">{notice}</p>}
            </div>
          </div>

          {showAdd && (
            <div className="dm-panel">
              <h2>Add an item</h2>
              <form onSubmit={handleAddManual} className="dm-form">
                <div className="dm-form-row">
                  <label>
                    Name
                    <input
                      value={manual.name}
                      onChange={(e) => setManual({ ...manual, name: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Rarity
                    <select
                      value={manual.rarity}
                      onChange={(e) => setManual({ ...manual, rarity: e.target.value })}
                    >
                      <option value="">—</option>
                      {RARITIES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Description (markdown)
                  <textarea
                    rows={4}
                    value={manual.description}
                    onChange={(e) => setManual({ ...manual, description: e.target.value })}
                  />
                </label>
                <div className="dm-form-actions">
                  <button type="submit" disabled={!manual.name.trim()}>
                    Add to shop
                  </button>
                  <button type="button" className="secondary" onClick={() => setShowAdd(false)}>
                    Cancel
                  </button>
                </div>
              </form>

              {homebrew.length > 0 && (
                <>
                  <h3>...or from the Item Maker</h3>
                  <ul className="shop-homebrew">
                    {homebrew.map((record) => (
                      <li key={record.id}>
                        <span>{record.name}</span>
                        <button type="button" className="secondary" onClick={() => addHomebrew(record)}>
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="dm-panel">
            <h2>Current stock ({stock.length})</h2>
            {stock.length === 0 ? (
              <p className="status-message">Nothing on the shelf. Restock to roll the first batch.</p>
            ) : (
              <ul className="dm-list shop-stock">
                {stock.map((row) => (
                  <li key={row.id}>
                    <div className="shop-stock-main">
                      <strong>{row.name}</strong>
                      {row.rarity && <span className={`badge rarity-${slugify(row.rarity)}`}>{row.rarity}</span>}
                      {row.origin !== '5etools' && <span className="badge badge-own">{row.origin}</span>}
                      {row.attunement && <span className="shop-attune">{attunementLabel(row.attunement)}</span>}
                    </div>
                    <div className="dm-list-actions">
                      {row.item_key && (
                        <button type="button" className="secondary" onClick={() => banishRow(row)}>
                          Never stock
                        </button>
                      )}
                      <button type="button" className="danger" onClick={() => removeRow(row)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
