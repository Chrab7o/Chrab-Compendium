import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { averageFormula, resolveRefs } from '../../../lib/foundryActorBuilder'
import { ATTRIBUTE_GROUPS, attributeOptions, searchAttributes } from '../../../lib/foundryAttributes'

// The NPC being edited, so formula fields deep in the action builder can
// resolve @references (and pick other items as spend pools) without every
// card threading the spec through.
export const NpcSpecContext = createContext({ spec: null, rollData: {} })

const MOD_OPTION = { path: 'mod', ref: '@mod', label: 'This roll’s ability modifier', group: 'This roll' }

function lookup(data, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), data)
}

function useDismiss(open, setOpen, wrapRef) {
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
  }, [open, setOpen, wrapRef])
}

// Searchable, grouped list of the attributes from foundryAttributes.js, each
// with this NPC's current number where the editor can work it out.
function AttributeMenu({ use, withMod, onPick }) {
  const { rollData } = useContext(NpcSpecContext)
  const [query, setQuery] = useState('')
  const options = useMemo(() => [...(withMod ? [MOD_OPTION] : []), ...attributeOptions(use)], [use, withMod])
  const shown = searchAttributes(options, query)
  const groups = [MOD_OPTION.group, ...ATTRIBUTE_GROUPS]

  return (
    <div className="npc-ref-menu" role="dialog" aria-label="Pick an attribute">
      <input
        className="npc-ref-search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (shown[0]) onPick(shown[0].ref)
          }
        }}
        placeholder="Search: stealth, dc, speed, slots…"
        aria-label="Search attributes"
      />
      <div className="npc-ref-list" role="menu">
        {!shown.length && <p className="npc-hint">Nothing matches - you can still type any path into the field.</p>}
        {groups.map((group) => {
          const inGroup = shown.filter((o) => o.group === group)
          if (!inGroup.length) return null
          return (
            <div key={group} className="npc-ref-group">
              <span className="npc-ref-group-label">{group}</span>
              {inGroup.map((o) => {
                const value = lookup(rollData, o.path)
                return (
                  <button key={o.ref} type="button" role="menuitem" className="npc-ref-option" onClick={() => onPick(o.ref)}>
                    <span>{o.label}</span>
                    <code>{o.ref}</code>
                    <span className="npc-ref-value">{typeof value === 'number' ? value : '—'}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BrowseButton({ open, setOpen, label, children }) {
  return (
    <button
      type="button"
      className="icon-button npc-formula-ref-button"
      onClick={() => setOpen((o) => !o)}
      aria-label={label}
      aria-expanded={open}
      title={label}
    >
      {children}
    </button>
  )
}

// A text input for a Foundry roll formula plus an "@" menu of everything
// this creature has. Below it, what the formula comes to right now
// ("= 2d6 + 4, avg 11").
export default function FormulaInput({ value, onChange, placeholder, ariaLabel, withMod = false, showHint = true }) {
  const { rollData } = useContext(NpcSpecContext)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  useDismiss(open, setOpen, wrapRef)

  function insert(ref) {
    const el = inputRef.current
    const text = String(value ?? '')
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const joiner = before.trim() && !/[+\-*/(]\s*$/.test(before) ? ' + ' : before && !before.endsWith(' ') ? ' ' : ''
    onChange(`${before}${joiner}${ref}${text.slice(end)}`)
    setOpen(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = (before + joiner + ref).length
      el?.setSelectionRange(pos, pos)
    })
  }

  const text = String(value ?? '').trim()
  const data = { ...rollData, mod: rollData.mod ?? 0 }
  const hasDice = /\d*d\d/i.test(text)
  const hint = text && (text.includes('@') || hasDice) ? `= ${resolveRefs(text, data).replace(/\s+/g, ' ')}${hasDice ? `, avg ${averageFormula(text, data)}` : ''}` : ''

  return (
    <div className="npc-formula" ref={wrapRef}>
      <div className="npc-formula-field">
        <input ref={inputRef} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
        <BrowseButton open={open} setOpen={setOpen} label="Insert a reference (@abilities.str.mod, @prof…)">
          @
        </BrowseButton>
      </div>
      {showHint && hint && <span className="npc-hint">{hint}</span>}
      {open && <AttributeMenu use="formula" withMod={withMod} onPick={insert} />}
    </div>
  )
}

// A path field (effect change key, spend target) with the same searchable
// menu; picking replaces the value. Typing a path the catalog doesn't know
// (a module flag, say) still works.
export function AttributePathInput({ value, onChange, use, placeholder, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useDismiss(open, setOpen, wrapRef)
  return (
    <div className="npc-formula" ref={wrapRef}>
      <div className="npc-formula-field">
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
        <BrowseButton open={open} setOpen={setOpen} label="Browse attributes">
          ⋯
        </BrowseButton>
      </div>
      {open && (
        <AttributeMenu
          use={use}
          onPick={(ref) => {
            onChange(ref)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
