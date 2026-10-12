import { useMemo } from 'react'
import { kindTree } from '../../../lib/sphereGrid'

// A <select> of sphere kinds in tree order, sub-kinds indented under their
// parent. `exclude` hides ids (a kind can't become its own descendant).
export default function KindSelect({ kinds, value, onChange, emptyLabel = '— No kind —', exclude, ...rest }) {
  const tree = useMemo(() => kindTree(kinds), [kinds])
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...rest}>
      <option value="">{emptyLabel}</option>
      {tree
        .filter(({ kind }) => !exclude?.has(kind.id))
        .map(({ kind, depth }) => (
          <option key={kind.id} value={kind.id}>
            {`${'\u00a0\u00a0\u00a0'.repeat(depth)}${depth ? '› ' : ''}${kind.label}`}
          </option>
        ))}
    </select>
  )
}
