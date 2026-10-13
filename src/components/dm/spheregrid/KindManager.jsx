import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { kindDescendants, kindPath, kindPrompts, kindTree, parsePoolText } from '../../../lib/sphereGrid'
import { tagsByGroup, ungroupedTags } from '../../../lib/tags'
import { useTags } from '../../../contexts/TagContext'
import { parsePlaceSource, placeSource } from '../../../lib/placeNames'
import GeneratorOptions, { LanguageOptions } from './GeneratorOptions'
import KindSelect from './KindSelect'

const emptyKind = { label: '', parent_id: null, tag: '' }
const emptyQuestion = { id: null, label: '', question: '', text: '', spawn_kind_id: null, pool_id: '' }

// Curating the kind list and its questions. Kinds nest; a sub-kind inherits
// every question above it, and any inherited question that doesn't fit can be
// switched off here (which also switches it off for that kind's own
// sub-kinds). This is the only place guide content comes from.
export default function KindManager({ kinds, prompts, hidden, overrides, pools, onChanged }) {
  const { tags, groups } = useTags()
  const [selectedId, setSelectedId] = useState(null)
  const [newKind, setNewKind] = useState(null)
  const [kindDraft, setKindDraft] = useState(null)
  const [question, setQuestion] = useState(emptyQuestion)
  // Inherited question whose ideas are being tailored: { promptId, text }.
  const [tailoring, setTailoring] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const tree = useMemo(() => kindTree(kinds), [kinds])
  const selected = kinds.find((k) => k.id === selectedId) ?? null
  const tagLabel = (v) => tags.find((t) => t.value === v)?.label ?? v
  // The draft's generator split for its two pickers: place:ruins@old shows as
  // "Ruins" + "Old Tongue".
  const draftPlace = parsePlaceSource(kindDraft?.name_generator)

  const groupsForKind = useMemo(
    () => (selected ? kindPrompts(kinds, prompts, hidden, selected.id, { includeHidden: true, overrides }) : []),
    [kinds, prompts, hidden, overrides, selected]
  )
  const own = groupsForKind.find((g) => !g.inherited)?.prompts ?? []
  const inherited = groupsForKind.filter((g) => g.inherited)

  function selectKind(kind) {
    setSelectedId(kind.id)
    setKindDraft({ label: kind.label, parent_id: kind.parent_id, tag: kind.tag ?? '', name_generator: kind.name_generator ?? '' })
    setQuestion(emptyQuestion)
    setTailoring(null)
    setNewKind(null)
    setError(null)
  }

  const tagOptions = (
    <>
      {tagsByGroup(tags, groups).map(({ group, tags: groupTags }) => (
        <optgroup key={group.id} label={group.label}>
          {groupTags.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
      {ungroupedTags(tags).length > 0 && (
        <optgroup label="Other">
          {ungroupedTags(tags).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )

  async function run(promise) {
    setSaving(true)
    setError(null)
    const { data, error: runError } = await promise
    setSaving(false)
    if (runError) {
      setError(runError.message)
      return null
    }
    onChanged()
    return data ?? true
  }

  // --- Kinds ---------------------------------------------------------------
  async function createKind(e) {
    e.preventDefault()
    const label = newKind.label.trim()
    if (!label) return
    const siblings = kinds.filter((k) => (k.parent_id ?? null) === (newKind.parent_id ?? null))
    const data = await run(
      supabase
        .from('sphere_kinds')
        .insert({ label, parent_id: newKind.parent_id, tag: newKind.tag || null, sort_order: siblings.length })
        .select()
        .single()
    )
    if (data) {
      setNewKind(null)
      selectKind(data)
    }
  }

  async function saveKind(e) {
    e.preventDefault()
    const label = kindDraft.label.trim()
    if (!label) return
    await run(
      supabase
        .from('sphere_kinds')
        .update({
          label,
          parent_id: kindDraft.parent_id,
          tag: kindDraft.tag || null,
          name_generator: kindDraft.name_generator || null,
        })
        .eq('id', selected.id)
    )
  }

  async function deleteKind() {
    const subs = kinds.filter((k) => k.parent_id === selected.id).length
    const parts = [`Delete the kind "${selected.label}" and its ${own.length} own question(s)?`]
    if (subs) parts.push(`Its ${subs} sub-kind(s) move up a level.`)
    parts.push('Spheres of this kind keep their text and tags but lose the kind.')
    if (!confirm(parts.join(' '))) return
    // Lift sub-kinds to this kind's parent rather than the top level.
    await supabase.from('sphere_kinds').update({ parent_id: selected.parent_id }).eq('parent_id', selected.id)
    const ok = await run(supabase.from('sphere_kinds').delete().eq('id', selected.id))
    if (ok) {
      setSelectedId(null)
      setKindDraft(null)
    }
  }

  // --- Inherited questions: on/off for this kind ---------------------------
  async function toggleInherited(prompt, hiddenHere) {
    await run(
      hiddenHere
        ? supabase.from('sphere_kind_hidden_prompts').delete().eq('kind_id', selected.id).eq('prompt_id', prompt.id)
        : supabase.from('sphere_kind_hidden_prompts').insert({ kind_id: selected.id, prompt_id: prompt.id })
    )
  }

  // --- Inherited questions: tailored ideas for this kind --------------------
  async function saveTailoring(prompt) {
    const ideas = parsePoolText(tailoring.text)
    const ok = await run(
      supabase
        .from('sphere_kind_prompt_ideas')
        .upsert({ kind_id: selected.id, prompt_id: prompt.id, ideas }, { onConflict: 'kind_id,prompt_id' })
    )
    if (ok) setTailoring(null)
  }

  async function resetTailoring(prompt) {
    const ok = await run(
      supabase.from('sphere_kind_prompt_ideas').delete().eq('kind_id', selected.id).eq('prompt_id', prompt.id)
    )
    if (ok) setTailoring(null)
  }

  // --- Own questions -------------------------------------------------------
  function editQuestion(p) {
    setError(null)
    setQuestion({
      id: p.id,
      label: p.label,
      question: p.question,
      text: p.ideas.join('\n'),
      spawn_kind_id: p.spawn_kind_id ?? null,
      pool_id: p.pool_id ?? '',
    })
  }

  async function saveQuestion(e) {
    e.preventDefault()
    const label = question.label.trim()
    const text = question.question.trim()
    if (!label || !text) return
    if (label.includes(':') || label.includes('*')) {
      setError('Keep the short label free of ":" and "*" — it is written into entries as **Label:**.')
      return
    }
    // A label is how an answer is recognised in the text, so it must be
    // unique across everything this kind shows, inherited included.
    const clash = groupsForKind
      .flatMap((g) => g.prompts)
      .find((p) => p.id !== question.id && p.label.toLowerCase() === label.toLowerCase())
    if (clash) {
      setError(`"${label}" is already used by "${clash.question}". Pick a different label.`)
      return
    }
    const seen = new Set()
    const ideas = parsePoolText(question.text).filter((i) => {
      const key = i.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const row = {
      label,
      question: text,
      ideas,
      spawn_kind_id: question.spawn_kind_id,
      pool_id: question.spawn_kind_id ? question.pool_id || null : null,
    }
    const ok = await run(
      question.id
        ? supabase.from('sphere_prompts').update(row).eq('id', question.id)
        : supabase
            .from('sphere_prompts')
            .insert({ ...row, kind_id: selected.id, sort_order: own.reduce((m, p) => Math.max(m, p.sort_order), -1) + 1 })
    )
    if (ok) setQuestion(emptyQuestion)
  }

  async function deleteQuestion(p) {
    if (!confirm(`Delete "${p.question}"? Answers already written into entries stay.`)) return
    const ok = await run(supabase.from('sphere_prompts').delete().eq('id', p.id))
    if (ok && question.id === p.id) setQuestion(emptyQuestion)
  }

  async function moveQuestion(index, delta) {
    const target = index + delta
    if (target < 0 || target >= own.length) return
    const next = [...own]
    ;[next[index], next[target]] = [next[target], next[index]]
    const results = await Promise.all(
      next.map((p, i) => supabase.from('sphere_prompts').update({ sort_order: i }).eq('id', p.id))
    )
    const failed = results.find((r) => r.error)
    if (failed) setError(failed.error.message)
    onChanged()
  }

  const hiddenHere = new Set(hidden.filter((h) => h.kind_id === selectedId).map((h) => h.prompt_id))

  return (
    <div className="sg-pools sg-kinds">
      <p className="status-message">
        Each sphere has one kind. A sub-kind asks its parent&apos;s questions too — switch off any that don&apos;t fit.
      </p>

      <ul className="sg-kind-tree">
        {tree.map(({ kind, depth }) => (
          <li key={kind.id} style={{ '--depth': depth }}>
            <button
              type="button"
              className={`sg-kind-node${kind.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => selectKind(kind)}
            >
              <span>{kind.label}</span>
              <span className="sg-kind-node-meta">
                {prompts.filter((p) => p.kind_id === kind.id).length}q
                {kind.tag ? ` · ${tagLabel(kind.tag)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {newKind ? (
        <form className="dm-form sg-kind-form" onSubmit={createKind}>
          <h3 className="sg-subhead">New kind</h3>
          <label>
            Name
            <input
              autoFocus
              value={newKind.label}
              onChange={(e) => setNewKind({ ...newKind, label: e.target.value })}
              placeholder="e.g. Cave / Dungeon"
              required
            />
          </label>
          <label>
            Under
            <KindSelect
              kinds={kinds}
              value={newKind.parent_id}
              onChange={(v) => setNewKind({ ...newKind, parent_id: v })}
              emptyLabel="— Top level —"
            />
          </label>
          <label>
            Adds wiki tag
            <select value={newKind.tag} onChange={(e) => setNewKind({ ...newKind, tag: e.target.value })}>
              <option value="">{newKind.parent_id ? '— Same as parent —' : '— None —'}</option>
              {tagOptions}
            </select>
          </label>
          <div className="dm-form-actions">
            <button type="submit" disabled={saving}>
              Add kind
            </button>
            <button type="button" className="secondary" onClick={() => setNewKind(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="secondary"
          onClick={() => setNewKind({ ...emptyKind, parent_id: selectedId })}
        >
          + New kind{selected ? ` under ${selected.label}` : ''}
        </button>
      )}

      {error && <p className="status-message error">{error}</p>}

      {selected && kindDraft && (
        <div className="sg-kind-detail">
          <h3 className="sg-subhead">{kindPath(kinds, selected.id)}</h3>

          <form className="dm-form" onSubmit={saveKind}>
            <label>
              Name
              <input value={kindDraft.label} onChange={(e) => setKindDraft({ ...kindDraft, label: e.target.value })} />
            </label>
            <label>
              Under
              <KindSelect
                kinds={kinds}
                value={kindDraft.parent_id}
                onChange={(v) => setKindDraft({ ...kindDraft, parent_id: v })}
                emptyLabel="— Top level —"
                exclude={kindDescendants(kinds, selected.id)}
              />
            </label>
            <label>
              Adds wiki tag
              <select value={kindDraft.tag} onChange={(e) => setKindDraft({ ...kindDraft, tag: e.target.value })}>
                <option value="">{kindDraft.parent_id ? '— Same as parent —' : '— None —'}</option>
                {tagOptions}
              </select>
            </label>
            <label>
              Names from
              <select
                value={draftPlace ? placeSource(draftPlace.generator) : kindDraft.name_generator}
                onChange={(e) => {
                  // Switching between place generators keeps the language.
                  const next = parsePlaceSource(e.target.value)
                  const value = next ? placeSource(next.generator, draftPlace?.language) : e.target.value
                  setKindDraft({ ...kindDraft, name_generator: value })
                }}
              >
                <option value="">{kindDraft.parent_id ? '— Same as parent —' : '— None —'}</option>
                <GeneratorOptions pools={pools} />
              </select>
            </label>
            {draftPlace && (
              <label>
                In language
                <select
                  value={draftPlace.language ?? ''}
                  onChange={(e) =>
                    setKindDraft({ ...kindDraft, name_generator: placeSource(draftPlace.generator, e.target.value) })
                  }
                >
                  <option value="">— Whichever is picked when generating —</option>
                  <LanguageOptions />
                </select>
              </label>
            )}
            <div className="dm-form-actions">
              <button type="submit" disabled={saving}>
                Save kind
              </button>
              <button type="button" className="danger" onClick={deleteKind}>
                Delete kind
              </button>
            </div>
          </form>

          {inherited.map(({ kind, prompts: list }) => (
            <div key={kind.id} className="sg-kind-inherited">
              <h4 className="sg-kind-subhead">From {kind.label}</h4>
              <ul className="dm-list">
                {list.map((p) => {
                  const offHere = hiddenHere.has(p.id)
                  const offAbove = p.hidden && !offHere
                  const isTailoring = tailoring?.promptId === p.id
                  return (
                    <li key={p.id} className={p.hidden ? 'is-off' : ''}>
                      <span className="sg-prompt-admin-text">
                        <strong>{p.label}</strong>
                        <span className="dm-list-meta">
                          {p.question}
                          {p.tailoredAt
                            ? ` · ideas tailored${p.tailoredAt === selected.id ? ' here' : ` in ${kinds.find((k) => k.id === p.tailoredAt)?.label}`}`
                            : ''}
                        </span>
                      </span>
                      <div className="dm-list-actions">
                        {!p.hidden && (
                          <button
                            type="button"
                            className="secondary sg-small"
                            onClick={() => setTailoring(isTailoring ? null : { promptId: p.id, text: p.ideas.join('\n') })}
                          >
                            Ideas
                          </button>
                        )}
                        {offAbove ? (
                          <span className="dm-list-meta">Off in a parent kind</span>
                        ) : (
                          <button
                            type="button"
                            className={`secondary sg-small sg-toggle${offHere ? '' : ' is-on'}`}
                            onClick={() => toggleInherited(p, offHere)}
                            aria-pressed={!offHere}
                          >
                            {offHere ? 'Off' : 'On'}
                          </button>
                        )}
                      </div>
                      {isTailoring && (
                        <div className="sg-tailor">
                          <label>
                            Ideas for {selected.label} and its sub-kinds — one per line
                            <textarea
                              rows={6}
                              value={tailoring.text}
                              onChange={(e) => setTailoring({ ...tailoring, text: e.target.value })}
                            />
                          </label>
                          <div className="dm-form-actions">
                            <button type="button" className="sg-small" onClick={() => saveTailoring(p)} disabled={saving}>
                              Save ideas
                            </button>
                            {p.tailoredAt === selected.id && (
                              <button type="button" className="secondary sg-small" onClick={() => resetTailoring(p)}>
                                Reset to {kind.label}&apos;s
                              </button>
                            )}
                            <button type="button" className="secondary sg-small" onClick={() => setTailoring(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          <h4 className="sg-kind-subhead">{selected.label}&apos;s own questions</h4>
          {own.length ? (
            <ul className="dm-list">
              {own.map((p, i) => (
                <li key={p.id} className={question.id === p.id ? 'is-editing' : ''}>
                  <span className="sg-prompt-admin-text">
                    <strong>{p.label}</strong>
                    <span className="dm-list-meta">
                      {p.ideas.length} ideas
                      {p.spawn_kind_id ? ` · makes ${kinds.find((k) => k.id === p.spawn_kind_id)?.label ?? '?'}` : ''}
                    </span>
                  </span>
                  <div className="dm-list-actions">
                    <button type="button" className="secondary sg-small" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      type="button"
                      className="secondary sg-small"
                      onClick={() => moveQuestion(i, 1)}
                      disabled={i === own.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button type="button" className="secondary sg-small" onClick={() => editQuestion(p)}>
                      Edit
                    </button>
                    <button type="button" className="danger sg-small" onClick={() => deleteQuestion(p)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="status-message">None yet.</p>
          )}

          <h4 className="sg-kind-subhead">{question.id ? 'Edit question' : 'New question'}</h4>
          <form className="dm-form" onSubmit={saveQuestion}>
            <label>
              Question
              <input
                value={question.question}
                onChange={(e) => setQuestion({ ...question, question: e.target.value })}
                placeholder="e.g. What lives in the dark?"
                required
              />
            </label>
            <label>
              Short label (written into the entry)
              <input
                value={question.label}
                onChange={(e) => setQuestion({ ...question, label: e.target.value })}
                placeholder="e.g. In the dark"
                required
              />
            </label>
            <label>
              Ideas — one per line ({parsePoolText(question.text).length})
              <textarea
                rows={7}
                value={question.text}
                onChange={(e) => setQuestion({ ...question, text: e.target.value })}
                placeholder={'blind fish\na hibernating beast\ncultists'}
              />
            </label>
            <label>
              Answer can become a sphere of kind
              <KindSelect
                kinds={kinds}
                value={question.spawn_kind_id}
                onChange={(v) => setQuestion({ ...question, spawn_kind_id: v })}
                emptyLabel="— Text only —"
              />
            </label>
            {question.spawn_kind_id && (
              <label>
                Roll names for that sphere from
                <select value={question.pool_id} onChange={(e) => setQuestion({ ...question, pool_id: e.target.value })}>
                  <option value="">— No pool —</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="dm-form-actions">
              <button type="submit" disabled={saving}>
                {question.id ? 'Save question' : 'Add question'}
              </button>
              {question.id && (
                <button type="button" className="secondary" onClick={() => setQuestion(emptyQuestion)}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
