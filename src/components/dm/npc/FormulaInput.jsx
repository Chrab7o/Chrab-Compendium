import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { FORMULA_REFS, averageFormula, resolveRefs } from '../../../lib/foundryActorBuilder'

// The NPC being edited, so formula fields deep in the action builder can
// resolve @references (and pick other items as spend pools) without every
// card threading the spec through.
export const NpcSpecContext = createContext({ spec: null, rollData: {} })

const GROUPS = [...new Set(FORMULA_REFS.map((r) => r.group))]

// A text input for a Foundry roll formula plus an "@" menu of the references
// this creature has, each with its current number. Below it, what the
// formula comes to right now ("= 2d6 + 4, avg 11").
export default function FormulaInput({ value, onChange, placeholder, ariaLabel, withMod = false, showHint = true }) {
  const { rollData } = useContext(NpcSpecContext)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  function insert(ref) {
    const el = inputRef.current
    const text = String(value ?? '')
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const joiner = before.trim() && !/[+\-*/(]\s*$/.test(before) ? ' + ' : before && !before.endsWith(' ') ? ' ' : ''
    const next = `${before}${joiner}${ref}${text.slice(end)}`
    onChange(next)
    setOpen(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = (before + joiner + ref).length
      el?.setSelectionRange(pos, pos)
    })
  }

  const refs = FORMULA_REFS.filter((r) => withMod || r.ref !== '@mod')
  const text = String(value ?? '').trim()
  const data = { ...rollData, mod: rollData.mod ?? 0 }
  const resolved = text ? resolveRefs(text, data).replace(/\s+/g, ' ') : ''
  const hasDice = /\d*d\d/i.test(text)
  const hint = text && (text.includes('@') || hasDice) ? `= ${resolved}${hasDice ? `, avg ${averageFormula(text, data)}` : ''}` : ''

  return (
    <div className="npc-formula" ref={wrapRef}>
      <div className="npc-formula-field">
        <input ref={inputRef} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
        <button
          type="button"
          className="icon-button npc-formula-ref-button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Insert a reference"
          aria-expanded={open}
          title="Insert a reference (@abilities.str.mod, @prof…)"
        >
          @
        </button>
      </div>
      {showHint && hint && <span className="npc-hint">{hint}</span>}
      {open && (
        <div className="npc-ref-menu" role="menu">
          {GROUPS.map((group) => {
            const inGroup = refs.filter((r) => r.group === group)
            if (!inGroup.length) return null
            return (
              <div key={group} className="npc-ref-group">
                <span className="npc-ref-group-label">{group}</span>
                {inGroup.map((r) => (
                  <button key={r.ref} type="button" role="menuitem" className="npc-ref-option" onClick={() => insert(r.ref)}>
                    <span>{r.label}</span>
                    <code>{r.ref}</code>
                    <span className="npc-ref-value">{r.ref === '@mod' && !withMod ? '' : resolveRefs(r.ref, data)}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
