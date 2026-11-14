import { useEffect, useMemo, useState } from 'react'
import ParamFields from '../feature/ParamFields'
import FeatureWizard from '../feature/FeatureWizard'
import { NpcSpecContext } from '../npc/FormulaInput'
import { OWNER_CONTEXT } from '../feature/ownerContext'
import { BLOCKS, BLOCK_GROUPS, USE_PARAMS, blockDefaults, blocksOf, buildFeatureFromBlocks, findBlock, newBlockId, specFromSource, useDefaults } from '../../../lib/forgeBlocks'
import { emptyFeatureSpec, mechanicsSummary } from '../../../lib/foundryFeatures'
import { automationOf, automationSummary } from '../../../lib/automation'
import { saveLibraryItem } from '../../../lib/itemLibraryStore'
import { featureDraftLinks, republishQuietly } from '../../../lib/foundryClassPackPublish'

// A feature's mechanics as "how it's used" plus building blocks
// (lib/forgeBlocks.js), edited in the Levels panel. Saving writes the Item
// Forge draft at once (keeping its Foundry ids) and, when a class already uses
// it, republishes the class pack. docs/forge-overhaul.md, Phase 2c, in the lab.
//
// stored: the draft's spec (one that follows its template or blocks), or null
// for a new one. onSaved(row): the saved draft row. onHandEdit: open the
// guided steps instead.

const rollBlock = (entry) => !!findBlock(entry.block)?.used || entry.block === 'extraRoll'
const blockName = (entry) => entry.settings?.rollName?.trim() || findBlock(entry.block)?.label || entry.block

// What each roll and effect of a built spec does, in a line, for the preview.
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
function rollLine(a) {
  const bits = []
  if (a.kind === 'attack') bits.push(`${a.attackType === 'ranged' ? 'ranged' : 'melee'} attack`)
  if (a.kind === 'save') bits.push(`${String(a.saveAbility).toUpperCase()} save${a.onSave === 'half' ? ' (half on a save)' : ''}`)
  if (a.kind === 'summon') bits.push('summons')
  if (a.kind === 'transform') bits.push('transforms')
  const damage = (a.damage ?? []).filter((d) => String(d.formula ?? '').trim()).map((d) => `${d.formula}${d.types?.length ? ` ${d.types.join('/')}` : ''}`)
  if (damage.length) bits.push(`${damage.join(' + ')} damage`)
  const heal = typeof a.healing === 'object' ? a.healing?.formula : a.healing
  if (String(heal ?? '').trim()) bits.push(`heals ${heal}${a.healType === 'temphp' ? ' temp HP' : ''}`)
  if (a.areaType && a.areaSize) bits.push(`${a.areaSize} ft ${a.areaType}`)
  return `${a.name || cap(a.kind)}: ${bits.join(', ') || 'no roll'}`
}
const effectLine = (e) => `${e.name || 'Effect'}${e.statuses?.length ? ` (${e.statuses.join(', ')})` : ''}${e.passive ? ', always on' : ''}`

// The Custom block's hand-built parts ({ activities, effects, rules }), edited
// with the guided steps' Rolls, Effects and Reactions on a spec made of just
// them. The other blocks keep following their templates.
const CUSTOM_STEPS = ['rolls', 'effects', 'reactions']
function CustomPart({ part = {}, name, onChange }) {
  const base = emptyFeatureSpec('feat')
  const rules = part.rules ?? []
  const spec = { ...base, item: { ...base.item, name, activities: part.activities ?? [], effects: part.effects ?? [], behavior: rules.length ? { mode: 'passive', rules } : null } }
  const write = (next) => onChange({ activities: next.item.activities ?? [], effects: next.item.effects ?? [], rules: next.item.behavior?.rules ?? [] })
  return (
    <NpcSpecContext.Provider value={OWNER_CONTEXT}>
      <FeatureWizard
        spec={spec}
        set={(patch) => write({ ...spec, ...(typeof patch === 'function' ? patch(spec) : patch) })}
        replace={(next) => write(typeof next === 'function' ? next(spec) : next)}
        linkedText
        allowSpell={false}
        allowGear={false}
        only={CUSTOM_STEPS}
      />
    </NpcSpecContext.Provider>
  )
}

// "How it's used": only the settings that matter for what's chosen.
function useParams(use) {
  return USE_PARAMS.filter((p) => {
    if (p.key === 'usesMax' || p.key === 'usesRecovery') return use.uses === 'custom'
    if (p.key === 'poolCost' || p.key === 'poolExtra') return !!String(use.pool ?? '').trim()
    return true
  })
}

export default function BlockEditor({ stored = null, draftId = null, name, description, campaignId = null, onSaved, onCancel, onHandEdit }) {
  const [def, setDef] = useState(() => (stored?.source && blocksOf(stored.source)) || { use: useDefaults(), blocks: [] })
  const [open, setOpen] = useState(() => (stored ? null : 'pick'))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [links, setLinks] = useState([])

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    featureDraftLinks(draftId)
      .then((l) => !cancelled && setLinks(l))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [draftId])

  const edit = (next) => {
    setDef(next)
    setDirty(true)
  }
  const setBlocks = (blocks) => edit({ ...def, blocks })
  const setBlock = (id, settings) => setBlocks(def.blocks.map((b) => (b.id === id ? { ...b, settings } : b)))

  function add(key) {
    const block = findBlock(key)
    if (!block) return
    const settings = key === 'custom' ? { part: { activities: [], effects: [], rules: [] } } : blockDefaults(block)
    const entry = { id: newBlockId(), block: key, settings }
    setBlocks([...def.blocks, entry])
    setOpen(entry.id)
  }
  function move(id, by) {
    const i = def.blocks.findIndex((b) => b.id === id)
    const j = i + by
    if (j < 0 || j >= def.blocks.length) return
    const next = [...def.blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    setBlocks(next)
  }
  function remove(id) {
    const named = def.blocks.filter((b) => b.settings?.from === id)
    if (named.length && !confirm(`${named.map(blockName).join(', ')} ${named.length === 1 ? 'is' : 'are'} applied by this roll; ${named.length === 1 ? 'it' : 'they'} will go on the first roll instead. Remove it?`)) return
    setBlocks(def.blocks.filter((b) => b.id !== id).map((b) => (b.settings?.from === id ? { ...b, settings: { ...b.settings, from: '' } } : b)))
  }

  // What it builds, as it stands.
  const preview = useMemo(() => {
    if (!def.blocks.length) return { lines: [], summary: '' }
    try {
      const spec = buildFeatureFromBlocks(def, { featureName: name })
      return {
        summary: mechanicsSummary(spec),
        lines: [...spec.item.activities.map(rollLine), ...spec.item.effects.map(effectLine), ...automationSummary(automationOf(spec.item), spec.item)],
      }
    } catch (err) {
      return { problem: err.message }
    }
  }, [def, name])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const words = (spec) => ({ ...spec, item: { ...spec.item, name, description } })
      const { spec, error: problem } = specFromSource(def, stored ? words(stored) : null, draftId ?? '')
      if (problem) throw new Error(problem)
      const row = await saveLibraryItem(draftId, stored ? spec : words(spec), { campaignId })
      // Already in the Foundry class pack: keep it current. A new one goes in
      // when the class is saved with its link.
      const notice = links.length ? await republishQuietly() : null
      setDirty(false)
      onSaved(row)
      if (notice) setError(notice)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  function cancel() {
    if (!dirty || confirm('Close the blocks without saving them?')) onCancel()
  }

  const firstUsed = def.blocks.find((b) => findBlock(b.block)?.used)?.id
  const used = !!firstUsed
  const rolls = def.blocks.filter(rollBlock)

  return (
    <div className="block-editor mechanics-editing">
      {links.length > 1 && <p className="draft-banner">Shared: saving also changes it on {links.map((l) => l.label).join(', ')}.</p>}

      <section className="block-editor-use">
        <h4>How it’s used</h4>
        {used ? (
          <ParamFields params={useParams(def.use)} values={def.use} onChange={(use) => edit({ ...def, use })} />
        ) : (
          <p className="npc-hint">Nothing to use yet: add a roll (an attack, a save…) and set what it takes here. A feature of only “always true” blocks has no button.</p>
        )}
      </section>

      <ol className="block-list">
        {def.blocks.map((entry, i) => {
          const block = findBlock(entry.block)
          const isOpen = open === entry.id
          const others = rolls.filter((r) => r.id !== entry.id).map((r) => [r.id, blockName(r)])
          return (
            <li key={entry.id} className={`block-card${isOpen ? ' is-open' : ''}`}>
              <div className="block-card-head">
                <button type="button" className="link-button block-card-title" onClick={() => setOpen(isOpen ? null : entry.id)} aria-expanded={isOpen}>
                  <span className="block-card-group">{BLOCK_GROUPS.find((g) => g.key === block?.group)?.label ?? 'Block'}</span>
                  {blockName(entry)}
                </button>
                <span className="npc-item-actions-spacer" />
                <button type="button" className="secondary npc-small-button" onClick={() => move(entry.id, -1)} disabled={i === 0} aria-label="Earlier">
                  ↑
                </button>
                <button type="button" className="secondary npc-small-button" onClick={() => move(entry.id, 1)} disabled={i === def.blocks.length - 1} aria-label="Later">
                  ↓
                </button>
                <button type="button" className="danger npc-small-button" onClick={() => remove(entry.id)} aria-label={`Remove ${blockName(entry)}`}>
                  ×
                </button>
              </div>
              {isOpen &&
                (!block ? (
                  <p className="status-message error">There’s no block called “{entry.block}” any more.</p>
                ) : entry.block === 'custom' ? (
                  <>
                    <p className="npc-hint">{block.help} Its rolls set their own action on the Rolls step; “How it’s used” goes to the first template block.</p>
                    <CustomPart part={entry.settings?.part} name={name} onChange={(part) => setBlock(entry.id, { ...entry.settings, part })} />
                  </>
                ) : (
                  <>
                    {block.help && <p className="npc-hint">{block.help}</p>}
                    {block.used && entry.id !== firstUsed && <p className="npc-hint">A second button on the feature: no action and no cost of its own.</p>}
                    <ParamFields params={block.params} values={{ ...blockDefaults(block), ...entry.settings }} onChange={(s) => setBlock(entry.id, s)} blocks={others} />
                  </>
                ))}
            </li>
          )
        })}
      </ol>

      <label className="block-editor-add">
        {def.blocks.length ? 'Add a block' : 'Start with a block'}
        <select value="" onChange={(e) => add(e.target.value)} autoFocus={open === 'pick'}>
          <option value="">Choose…</option>
          {BLOCK_GROUPS.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {BLOCKS.filter((b) => b.group === g.key).map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {preview.problem ? (
        <p className="status-message error">{preview.problem}</p>
      ) : (
        def.blocks.length > 0 && (
          <div className="block-editor-preview">
            <p className="feature-mechanics-summary">{preview.summary || 'Nothing to roll or apply yet.'}</p>
            {preview.lines.length > 0 && (
              <ul className="feature-automation-lines">
                {preview.lines.map((line, n) => (
                  <li key={n}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
      {error && <p className="status-message error">{error}</p>}

      <div className="dm-form-actions">
        <button type="button" onClick={save} disabled={saving || !def.blocks.length || !!preview.problem || (!dirty && !!stored)}>
          {saving ? 'Saving…' : 'Save mechanics'}
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          {dirty ? 'Cancel' : 'Close'}
        </button>
        <span className="npc-item-actions-spacer" />
        {onHandEdit && (
          <button
            type="button"
            className="secondary npc-small-button"
            disabled={dirty}
            title={dirty ? 'Save or cancel the blocks first.' : undefined}
            onClick={() => {
              if (!stored || confirm('Editing by hand stops it following its blocks: a later fix to a block won’t reach it. Go on?')) onHandEdit()
            }}
          >
            {stored ? 'Edit by hand' : 'Build by hand instead'}
          </button>
        )}
      </div>
    </div>
  )
}
