import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { childNodes, treeToExportJson, orderNodesForImport, wouldCreateCycle } from '../../lib/skillTrees'

const emptyForm = {
  id: null,
  parent_node_id: null,
  name: '',
  description: '',
  cost: 1,
  require_all_prereqs: true,
  extraPrereqIds: [],
}

function SkillNodeRow({ node, depth, ctx }) {
  const children = childNodes(ctx.nodes, node.id)
  const isExpanded = ctx.expanded.has(node.id)
  const extraCount = (ctx.extrasByNode.get(node.id) ?? []).length

  return (
    <div>
      <div className="tree-row" style={{ paddingLeft: `${depth}rem` }}>
        <button
          type="button"
          className="tree-toggle"
          onClick={() => ctx.toggle(node.id)}
          disabled={children.length === 0}
        >
          {children.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}
        </button>
        <span className="tree-label">
          {node.name} <span className="dm-list-meta">({node.cost} pt{node.cost === 1 ? '' : 's'})</span>
          {extraCount > 0 && (
            <span className="dm-list-meta">
              {' '}
              + {extraCount} more prereq{extraCount === 1 ? '' : 's'} ({node.require_all_prereqs ? 'all' : 'any'})
            </span>
          )}
        </span>
        <div className="tree-actions">
          <button type="button" onClick={() => ctx.startAddChild(node.id)}>
            + Child
          </button>
          <button type="button" onClick={() => ctx.startEdit(node)}>
            Edit
          </button>
          <button type="button" className="danger" onClick={() => ctx.handleDelete(node)}>
            Delete
          </button>
        </div>
      </div>
      {isExpanded &&
        children.map((child) => (
          <SkillNodeRow key={child.id} node={child} depth={depth + 1} ctx={ctx} />
        ))}
    </div>
  )
}

export default function SkillTreeNodeEditor({ trees }) {
  const [treeId, setTreeId] = useState('')
  const [nodes, setNodes] = useState([])
  const [prereqRows, setPrereqRows] = useState([])
  const [expanded, setExpanded] = useState(new Set())
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const tree = trees.find((t) => t.id === treeId)
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const extrasByNode = new Map()
  for (const row of prereqRows) {
    if (!extrasByNode.has(row.node_id)) extrasByNode.set(row.node_id, [])
    extrasByNode.get(row.node_id).push(row.prereq_node_id)
  }

  const loadNodes = useCallback(async () => {
    if (!treeId) {
      setNodes([])
      setPrereqRows([])
      return
    }
    const { data: nodeData } = await supabase.from('skill_tree_nodes').select('*').eq('tree_id', treeId)
    setNodes(nodeData ?? [])
    const ids = (nodeData ?? []).map((n) => n.id)
    if (ids.length === 0) {
      setPrereqRows([])
      return
    }
    const { data: prereqData } = await supabase
      .from('skill_tree_node_prereqs')
      .select('*')
      .in('node_id', ids)
    setPrereqRows(prereqData ?? [])
  }, [treeId])

  useEffect(() => {
    loadNodes()
  }, [loadNodes])

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function startAddChild(parentId) {
    setForm({ ...emptyForm, parent_node_id: parentId })
    setError(null)
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId))
  }

  function startEdit(node) {
    setForm({
      ...node,
      extraPrereqIds: extrasByNode.get(node.id) ?? [],
    })
    setError(null)
  }

  function toggleExtraPrereq(candidateId) {
    setForm((f) => ({
      ...f,
      extraPrereqIds: f.extraPrereqIds.includes(candidateId)
        ? f.extraPrereqIds.filter((id) => id !== candidateId)
        : [...f.extraPrereqIds, candidateId],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      tree_id: treeId,
      parent_node_id: form.parent_node_id,
      name: form.name,
      description: form.description,
      cost: Number(form.cost) || 1,
      require_all_prereqs: form.require_all_prereqs,
    }

    let nodeId = form.id
    if (form.id) {
      const { error: saveError } = await supabase.from('skill_tree_nodes').update(payload).eq('id', form.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    } else {
      const { data, error: saveError } = await supabase
        .from('skill_tree_nodes')
        .insert({ ...payload, sort_order: childNodes(nodes, form.parent_node_id).length })
        .select()
        .single()
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
      nodeId = data.id
    }

    await supabase.from('skill_tree_node_prereqs').delete().eq('node_id', nodeId)
    if (form.extraPrereqIds.length > 0) {
      const { error: prereqError } = await supabase
        .from('skill_tree_node_prereqs')
        .insert(form.extraPrereqIds.map((prereq_node_id) => ({ node_id: nodeId, prereq_node_id })))
      if (prereqError) {
        setSaving(false)
        setError(prereqError.message)
        return
      }
    }

    setSaving(false)
    setForm(null)
    loadNodes()
  }

  async function handleDelete(node) {
    if (!confirm(`Delete "${node.name}"? This also deletes every node nested under it.`)) return
    const { error: deleteError } = await supabase.from('skill_tree_nodes').delete().eq('id', node.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setForm(null)
    loadNodes()
  }

  function handleExport() {
    const json = treeToExportJson(tree, nodes, prereqRows)
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tree.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const json = JSON.parse(await file.text())
      const ordered = orderNodesForImport(json.nodes ?? [])

      const { data: newTree, error: treeError } = await supabase
        .from('skill_trees')
        .insert({ name: json.name || 'Imported tree', description: json.description ?? '' })
        .select()
        .single()
      if (treeError) throw treeError

      const idMap = new Map()
      for (const n of ordered) {
        const { data, error: nodeError } = await supabase
          .from('skill_tree_nodes')
          .insert({
            tree_id: newTree.id,
            parent_node_id: n.parentLocalId ? idMap.get(n.parentLocalId) : null,
            name: n.name,
            description: n.description ?? '',
            cost: n.cost ?? 1,
            sort_order: n.sortOrder ?? 0,
            require_all_prereqs: n.requireAllPrereqs ?? true,
          })
          .select()
          .single()
        if (nodeError) throw nodeError
        idMap.set(n.localId, data.id)

        const extraIds = (n.extraPrereqLocalIds ?? []).map((localId) => idMap.get(localId)).filter(Boolean)
        if (extraIds.length > 0) {
          const { error: prereqError } = await supabase
            .from('skill_tree_node_prereqs')
            .insert(extraIds.map((prereq_node_id) => ({ node_id: data.id, prereq_node_id })))
          if (prereqError) throw prereqError
        }
      }

      setTreeId(newTree.id)
      alert(`Imported "${newTree.name}" as a new tree with ${ordered.length} nodes.`)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    }
  }

  const roots = childNodes(nodes, null)
  const prereqCandidates = form
    ? nodes.filter(
        (n) =>
          n.id !== form.id &&
          !wouldCreateCycle(form.id ?? '__new__', n.id, nodesById, extrasByNode)
      )
    : []

  return (
    <div className="dm-panel">
      <h2>Skill Tree Nodes</h2>
      <div className="map-picker">
        <label>
          Tree to edit
          <select
            value={treeId}
            onChange={(e) => {
              setTreeId(e.target.value)
              setForm(null)
            }}
          >
            <option value="">Choose a tree...</option>
            {trees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Import JSON as a new tree
          <input type="file" accept="application/json" onChange={handleImport} />
        </label>
      </div>

      {tree && (
        <>
          <div className="dm-form-actions">
            <button type="button" onClick={() => startAddChild(null)}>
              + Root node
            </button>
            <button type="button" className="secondary" onClick={handleExport}>
              Export JSON
            </button>
          </div>

          <div className="tree-outline">
            {roots.map((node) => (
              <SkillNodeRow
                key={node.id}
                node={node}
                depth={0}
                ctx={{ nodes, expanded, extrasByNode, toggle, startAddChild, startEdit, handleDelete }}
              />
            ))}
            {roots.length === 0 && <p className="status-message">No nodes yet.</p>}
          </div>

          {form && (
            <form onSubmit={handleSubmit} className="dm-form">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </label>
              <label>
                Cost (points)
                <input
                  type="number"
                  min="0"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                />
              </label>

              {prereqCandidates.length > 0 && (
                <>
                  <fieldset className="tag-checklist">
                    <legend>Additional prerequisites (besides its parent above)</legend>
                    {prereqCandidates.map((n) => (
                      <label key={n.id} className="tag-checklist-item">
                        <input
                          type="checkbox"
                          checked={form.extraPrereqIds.includes(n.id)}
                          onChange={() => toggleExtraPrereq(n.id)}
                        />
                        {n.name}
                      </label>
                    ))}
                  </fieldset>
                  <label className="tag-checklist-item">
                    <input
                      type="checkbox"
                      checked={form.require_all_prereqs}
                      onChange={(e) => setForm({ ...form, require_all_prereqs: e.target.checked })}
                    />
                    Require ALL prerequisites (unchecked = any one is enough)
                  </label>
                </>
              )}

              {error && <p className="status-message error">{error}</p>}
              <div className="dm-form-actions">
                <button type="submit" disabled={saving}>
                  {form.id ? 'Save node' : 'Add node'}
                </button>
                <button type="button" className="secondary" onClick={() => setForm(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {error && !form && <p className="status-message error">{error}</p>}
        </>
      )}
    </div>
  )
}
