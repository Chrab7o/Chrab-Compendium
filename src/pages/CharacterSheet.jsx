import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  getAbilities,
  getTotalLevel,
  proficiencyBonus,
  getClasses,
  getSkills,
  estimateAC,
  estimateMaxHP,
  getInventory,
  getSpells,
  getFeats,
  getRaceAndBackground,
  getCurrency,
} from '../lib/foundryCharacter'

export default function CharacterSheet() {
  const { id } = useParams()
  const [character, setCharacter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else setCharacter(data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <p className="status-message">Loading...</p>
  if (error || !character)
    return <p className="status-message error">Couldn't find that character.</p>

  const actor = character.raw_data
  const level = getTotalLevel(actor)
  const classes = getClasses(actor)
  const { race, background } = getRaceAndBackground(actor)
  const abilities = getAbilities(actor)
  const skills = getSkills(actor)
  const ac = estimateAC(actor)
  const maxHp = estimateMaxHP(actor)
  const currentHp = actor.system?.attributes?.hp?.value
  const inventory = getInventory(actor)
  const spells = getSpells(actor)
  const feats = getFeats(actor)
  const currency = getCurrency(actor)

  return (
    <article className="page character-sheet">
      <div className="view-header">
        <h1>{character.name}</h1>
        <p className="view-subtitle">
          {classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.levels}`).join(' / ')}
          {' · Level '}
          {level}
          {race && ` · ${race}`}
          {background && ` · ${background}`}
        </p>
      </div>

      <div className="sheet-stat-row">
        <div className="sheet-stat">
          <span className="sheet-stat-label">HP</span>
          <span className="sheet-stat-value">{currentHp ?? '?'}</span>
          {maxHp !== null && (
            <span className="sheet-estimate">~{maxHp} base max (before feats like Tough)</span>
          )}
        </div>
        <div className="sheet-stat">
          <span className="sheet-stat-label">AC</span>
          <span className="sheet-stat-value">{ac}</span>
          <span className="sheet-estimate">estimated</span>
        </div>
        <div className="sheet-stat">
          <span className="sheet-stat-label">Proficiency</span>
          <span className="sheet-stat-value">+{proficiencyBonus(level)}</span>
        </div>
      </div>

      <h2>Abilities</h2>
      <div className="ability-grid">
        {abilities.map((a) => (
          <div key={a.key} className="ability-card">
            <span className="ability-label">{a.label}</span>
            <span className="ability-score">{a.score}</span>
            <span className="ability-mod">{a.mod >= 0 ? `+${a.mod}` : a.mod}</span>
          </div>
        ))}
      </div>

      <h2>Skills</h2>
      <ul className="skill-list">
        {skills.map((s) => (
          <li key={s.key} className={s.proficiency !== 'none' ? 'skill-proficient' : undefined}>
            <span>{s.label}</span>
            <span className="dm-list-meta">{s.ability?.toUpperCase()}</span>
            <span>{s.totalLabel}</span>
          </li>
        ))}
      </ul>

      {Object.keys(spells).length > 0 && (
        <>
          <h2>Spells</h2>
          {Object.entries(spells)
            .sort(([a], [b]) => a - b)
            .map(([level, names]) => (
              <p key={level}>
                <strong>{level === '0' ? 'Cantrips' : `Level ${level}`}:</strong> {names.join(', ')}
              </p>
            ))}
        </>
      )}

      {feats.length > 0 && (
        <>
          <h2>Feats &amp; Features</h2>
          <div className="entry-card-tags">
            {feats.map((f) => (
              <span key={f.name} className="tag">
                {f.name}
              </span>
            ))}
          </div>
        </>
      )}

      <h2>Inventory</h2>
      {Object.entries(inventory).map(([type, items]) => (
        <div key={type}>
          <h3 className="inventory-type">{type}</h3>
          <ul className="dm-list">
            {items.map((item, i) => (
              <li key={i}>
                <span>{item.name}</span>
                <span className="dm-list-meta">
                  x{item.quantity} {item.equipped && '· equipped'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Currency</h2>
      <p>
        {Object.entries(currency)
          .filter(([, v]) => v)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ') || 'None recorded'}
      </p>
    </article>
  )
}
