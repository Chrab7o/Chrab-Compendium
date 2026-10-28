import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { FEAT_TYPES, buildFeatureItem, featureItemToSpec, featureName, gearType, itemMakerRecordToSpec, rarityLabel } from '../../lib/foundryFeatures'
import { AUTOMATION_TEMPLATES, TEMPLATE_GROUPS } from '../../lib/automationTemplates'
import { useCampaignContext } from '../../contexts/CampaignContext'
import { downloadFeatureItem } from '../../components/dm/feature/downloadItem'
import { SyncBadge } from './DMNpcForgePage'

// Monster features get their own section: the NPC Forge saves every
// statblock ability it builds here, and they'd bury the player features.
const isMonster = (d) => d.kind === 'feat' && d.spec?.featType === 'monster'
const LIBRARY_SECTIONS = [
  ['feat', 'Features', (d) => d.kind === 'feat' && !isMonster(d)],
  ['monster', 'Monster features', isMonster],
  ['gear', 'Magic items & gear', (d) => d.kind === 'gear'],
  ['spell', 'Spells', (d) => d.kind === 'spell'],
]

// Which collapsible sections are open is remembered per browser, so they
// start collapsed once and then stay how the DM left them.
const OPEN_KEY = 'itemForge.openSections'
function readOpen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY)) ?? [])
  } catch {
    return new Set()
  }
}

// Item Forge list (the Feature Forge until it became the item library): single features and spells, built on the site and sent
// to the world's Items directory through Chrab Sync (its Items tab), ready to
// drag onto characters. Templates start from a finished feature.
export default function DMFeatureForgePage() {
  const navigate = useNavigate()
  const { campaigns, campaignId } = useCampaignContext()
  const [drafts, setDrafts] = useState([])
  const [worlds, setWorlds] = useState([])
  const [npcUses, setNpcUses] = useState(() => new Map()) // draft id -> names of NPCs that link it
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [open, setOpen] = useState(readOpen)
  const [query, setQuery] = useState('')

  const toggle = (id) => (e) => {
    const isOpen = e.currentTarget.open
    setOpen((prev) => {
      if (prev.has(id) === isOpen) return prev
      const next = new Set(prev)
      if (isOpen) next.add(id)
      else next.delete(id)
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
      } catch {
        // Private window or blocked storage: it just won't be remembered.
      }
      return next
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('feature_drafts').select('*').order('updated_at', { ascending: false })
    if (loadError) setError(loadError.message)
    else setDrafts(data ?? [])
    const { data: worldRows } = await supabase.from('foundry_worlds').select('world_id, title')
    setWorlds(worldRows ?? [])
    // NPC Forge links (lib/itemLibrary.js), read from each NPC's items.
    const { data: npcRows } = await supabase.from('npc_drafts').select('name, items:spec->items')
    const uses = new Map()
    for (const npc of npcRows ?? []) {
      for (const id of new Set((npc.items ?? []).map((i) => i?.draftId).filter(Boolean))) uses.set(id, [...(uses.get(id) ?? []), npc.name || 'Untitled NPC'])
    }
    setNpcUses(uses)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const spec = featureItemToSpec(JSON.parse(await file.text()))
      const { data, error: saveError } = await supabase
        .from('feature_drafts')
        .insert({ name: featureName(spec) || 'Imported feature', kind: spec.kind, campaign_id: campaignId || null, spec })
        .select()
        .single()
      if (saveError) throw saveError
      navigate(`/dm/item-forge/${data.id}/edit`)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  // The old Item Maker's saved items (item_maker_items) come in once each as
  // wondrous items with their written description; spec.gear.source remembers
  // which record, so running it again only brings in what's new.
  async function handleItemMakerImport() {
    setError(null)
    setNotice(null)
    const { data: records, error: loadError } = await supabase.from('item_maker_items').select('id, name, item').order('name')
    if (loadError) return setError(`Couldn't read the Item Maker's items: ${loadError.message}`)
    const done = new Set(drafts.map((d) => d.spec?.gear?.source?.itemMaker).filter(Boolean))
    const fresh = (records ?? []).filter((r) => !done.has(r.id))
    if (!fresh.length) return setNotice(records?.length ? 'Every Item Maker item is already in the library.' : 'The Item Maker has no saved items.')
    if (!confirm(`Bring ${fresh.length} Item Maker item${fresh.length === 1 ? '' : 's'} into the library as wondrous items? Set each one's kind and rarity afterwards.`)) return
    const rows = fresh.map((r) => {
      const spec = itemMakerRecordToSpec(r)
      return { name: featureName(spec) || 'Untitled', kind: 'gear', campaign_id: campaignId || null, spec }
    })
    const { error: saveError } = await supabase.from('feature_drafts').insert(rows)
    if (saveError) return setError(`Import failed: ${saveError.message}`)
    setNotice(`Brought in ${rows.length} item${rows.length === 1 ? '' : 's'} from the Item Maker.`)
    load()
  }

  async function handleSend(draft) {
    if (!draft.campaign_id) {
      setError(`"${draft.name}" has no campaign yet - open it and pick one, so the right Foundry world picks it up.`)
      return
    }
    const { error: sendError } = await supabase
      .from('feature_drafts')
      .update({ queued_item: buildFeatureItem(draft.spec, { draftId: draft.id }), sync_status: 'queued', sync_error: null })
      .eq('id', draft.id)
    if (sendError) setError(sendError.message)
    else load()
  }

  async function handleDuplicate(draft) {
    const copyName = `${draft.name} (copy)`
    const spec = structuredClone(draft.spec)
    if (spec.kind === 'spell') spec.spell.name = copyName
    else spec.item.name = copyName
    // A copy isn't the imported Item Maker record, so a re-import won't skip it.
    if (spec.gear?.source) spec.gear.source = null
    const { error: saveError } = await supabase.from('feature_drafts').insert({ name: copyName, kind: draft.kind, campaign_id: draft.campaign_id, spec })
    if (saveError) setError(saveError.message)
    else load()
  }

  async function handleDelete(draft) {
    const npcs = npcUses.get(draft.id) ?? []
    const onNpcs = npcs.length ? ` It's on ${npcs.join(', ')}, which will lose it the next time they're saved or sent.` : ''
    if (!confirm(`Delete "${draft.name}"?${onNpcs} This only removes it here, not any item already in Foundry.`)) return
    const { error: deleteError } = await supabase.from('feature_drafts').delete().eq('id', draft.id)
    if (deleteError) setError(deleteError.message)
    else load()
  }

  const campaignName = (id) => campaigns.find((c) => c.id === id)?.name
  const worldTitle = (id) => worlds.find((w) => w.world_id === id)?.title
  const kindLabel = (draft) => {
    if (draft.kind === 'spell') return 'Spell'
    if (draft.kind === 'gear') {
      const gear = draft.spec?.gear ?? {}
      const type = gearType(draft.spec).subtypes.find(([k]) => k === gear.subtype)?.[1] ?? 'Item'
      return [rarityLabel(gear.rarity), type].filter(Boolean).join(' ')
    }
    return FEAT_TYPES.find((t) => t.key === draft.spec?.featType)?.label ?? 'Feature'
  }

  // A search replaces the sections with one flat list across every kind.
  // It matches the name, the kind label ("Rare Wondrous") and the NPCs using it.
  const q = query.trim().toLowerCase()
  const matches = q
    ? drafts.filter((d) => [d.name, kindLabel(d), ...(npcUses.get(d.id) ?? [])].some((s) => s?.toLowerCase().includes(q)))
    : null

  const renderRow = (draft) => (
    <li key={draft.id}>
      <span>{draft.name}</span>
      <span className="dm-list-meta">{kindLabel(draft)}</span>
      {npcUses.get(draft.id)?.length > 0 && (
        <span className="badge" title={npcUses.get(draft.id).join(', ')}>
          On {npcUses.get(draft.id).length} NPC{npcUses.get(draft.id).length === 1 ? '' : 's'}
        </span>
      )}
      {draft.campaign_id && <span className="badge badge-campaign">{campaignName(draft.campaign_id) ?? 'Campaign'}</span>}
      <SyncBadge draft={draft} worldTitle={worldTitle(draft.foundry_world_id)} />
      <div className="dm-list-actions">
        <Link to={`/dm/item-forge/${draft.id}/edit`}>Edit</Link>
        <button type="button" className="secondary" onClick={() => handleSend(draft)}>
          {draft.sync_status === 'draft' ? 'Send to Foundry' : 'Re-send'}
        </button>
        <button type="button" className="secondary" onClick={() => downloadFeatureItem(draft.spec, draft.id)}>
          Download
        </button>
        <button type="button" className="secondary" onClick={() => handleDuplicate(draft)}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={() => handleDelete(draft)}>
          Delete
        </button>
      </div>
    </li>
  )

  return (
    <section className="page-wide">
      <div className="view-header">
        <h1>Item Forge</h1>
      </div>
      <p className="view-subtitle">
        The item library: class features, feats, monster abilities and spells with their own automation - stances,
        &ldquo;when I hit…&rdquo; rules, midi-qol scripts. NPCs in the NPC Forge link these items, so one Bite works on
        every creature that has it. Send one to Foundry and it lands in the Items directory, ready to drag onto a
        character.
      </p>

      <details className="dm-panel forge-panel" open={open.has('templates')} onToggle={toggle('templates')}>
        <summary>
          <h2>Start from a template</h2>
          <span className="forge-count">{AUTOMATION_TEMPLATES.length}</span>
        </summary>
        <div className="forge-groups">
          {TEMPLATE_GROUPS.map((group) => {
            const templates = AUTOMATION_TEMPLATES.filter((t) => t.group === group)
            if (!templates.length) return null
            const id = `templates:${group}`
            return (
              <details key={group} className="forge-group" open={open.has(id)} onToggle={toggle(id)}>
                <summary>
                  <span className="forge-group-name">{group}</span>
                  <span className="forge-count">{templates.length}</span>
                </summary>
                <ul className="dm-list">
                  {templates.map((t) => (
                    <li key={t.key}>
                      <span>{t.label}</span>
                      <span className="dm-list-meta">{t.help}</span>
                      <div className="dm-list-actions">
                        <Link to={`/dm/item-forge/new?template=${t.key}`}>Use</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </div>
      </details>

      <div className="dm-panel">
        <div className="dm-panel-header">
          <h2>Library</h2>
          <div className="dm-form-actions">
            <label className="button-link">
              Import Foundry item
              <input type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
            <button type="button" className="secondary" onClick={handleItemMakerImport}>
              Import from the Item Maker
            </button>
            <Link to="/dm/item-forge/new" className="button-link">
              + New
            </Link>
          </div>
        </div>
        {error && <p className="status-message error">{error}</p>}
        {notice && <p className="status-message">{notice}</p>}
        <input
          type="search"
          className="forge-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library: Bite, Fireball, Cloak of Elvenkind…"
          aria-label="Search the library"
        />
        {loading ? (
          <p className="status-message">Loading...</p>
        ) : matches ? (
          <>
            <p className="dm-list-meta">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </p>
            <ul className="dm-list">
              {matches.map(renderRow)}
              {matches.length === 0 && <li className="status-message">Nothing matches.</li>}
            </ul>
          </>
        ) : (
          <div className="forge-groups">
            {LIBRARY_SECTIONS.map(([key, label, inSection]) => {
              const items = drafts.filter(inSection)
              const id = `library:${key}`
              return (
                <details key={key} className="forge-group" open={open.has(id)} onToggle={toggle(id)}>
                  <summary>
                    <span className="forge-group-name">{label}</span>
                    <span className="forge-count">{items.length}</span>
                  </summary>
                  <ul className="dm-list">
                    {items.map(renderRow)}
                    {items.length === 0 && <li className="status-message">None yet.</li>}
                  </ul>
                </details>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
