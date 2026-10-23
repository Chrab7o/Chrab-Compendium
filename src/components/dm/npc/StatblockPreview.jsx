import {
  ITEM_SECTIONS,
  NPC_ABILITIES,
  NPC_SIZES,
  NPC_SKILLS,
  abilityMod,
  activitySummary,
  crLabel,
  npcMaxHp,
  npcRollData,
  spellcastingText,
  usesLabel,
} from '../../../lib/foundryActorBuilder'
import { behaviorSummary } from '../../../lib/foundryBehaviors'

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const signed = (n) => (n >= 0 ? `+${n}` : String(n))

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;Reference\[condition=(\w+)\]/g, '$1')
    .replace(/\[\[\/\w+ ([^\]]+)\]\](\{([^}]+)\})?/g, (_, roll, __, label) => label ?? roll)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function listOrNull(values) {
  const list = (values ?? []).filter(Boolean)
  return list.length ? list.map(cap).join(', ') : null
}

// 2024-style statblock rendered from the spec with the same math the builder
// uses, so what you see here is what Foundry will compute.
export default function StatblockPreview({ spec }) {
  const data = npcRollData(spec)
  const size = NPC_SIZES.find((s) => s.key === spec.size)?.label ?? 'Medium'
  const initiative = spec.initiative !== '' && spec.initiative != null ? Number(spec.initiative) : data.dex
  const speeds = [
    spec.speed?.walk != null ? `${spec.speed.walk} ft.` : null,
    ...['fly', 'swim', 'climb', 'burrow'].map((k) => (spec.speed?.[k] ? `${cap(k)} ${spec.speed[k]} ft.${k === 'fly' && spec.speed.hover ? ' (hover)' : ''}` : null)),
  ].filter(Boolean)
  const skills = Object.entries(spec.skills ?? {})
    .filter(([key, v]) => NPC_SKILLS[key] && v)
    .map(([key, v]) => `${NPC_SKILLS[key].label} ${signed(data[NPC_SKILLS[key].ability] + Math.floor(data.prof * v))}`)
  const perception = 10 + data.wis + Math.floor(data.prof * (spec.skills?.prc ?? 0))
  const senses = [
    ...['blindsight', 'darkvision', 'tremorsense', 'truesight'].map((k) => (spec.senses?.[k] ? `${cap(k)} ${spec.senses[k]} ft.` : null)),
    spec.senses?.special || null,
    `Passive Perception ${perception}`,
  ].filter(Boolean)
  const languages = [...(spec.languages ?? []), spec.languagesCustom].filter(Boolean).join(', ') || 'None'

  return (
    <aside className="npc-statblock" aria-label="Statblock preview">
      <h2>{spec.name || 'Unnamed NPC'}</h2>
      <p className="npc-statblock-sub">
        {size} {cap(spec.creatureType)}
        {spec.subtype ? ` (${spec.subtype})` : ''}
        {spec.alignment ? `, ${spec.alignment}` : ''}
      </p>
      <hr />
      <p>
        <strong>AC</strong> {spec.ac || 10}
        {spec.naturalArmor ? ' (natural armor)' : ''} <strong className="npc-statblock-gap">Initiative</strong> {signed(initiative)} ({10 + initiative})
      </p>
      <p>
        <strong>HP</strong> {npcMaxHp(spec)}
        {spec.hpFormula ? ` (${spec.hpFormula})` : ''}
      </p>
      <p>
        <strong>Speed</strong> {speeds.join(', ') || '0 ft.'}
      </p>
      <table className="npc-statblock-abilities">
        <thead>
          <tr>
            <th />
            <th>Score</th>
            <th>Mod</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {NPC_ABILITIES.map((a) => {
            const mod = abilityMod(spec.abilities?.[a])
            const save = mod + ((spec.saves ?? []).includes(a) ? data.prof : 0)
            return (
              <tr key={a}>
                <th>{a.toUpperCase()}</th>
                <td>{spec.abilities?.[a] ?? 10}</td>
                <td>{signed(mod)}</td>
                <td>{signed(save)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {skills.length > 0 && (
        <p>
          <strong>Skills</strong> {skills.join(', ')}
        </p>
      )}
      {listOrNull(spec.vulnerabilities) && (
        <p>
          <strong>Vulnerabilities</strong> {listOrNull(spec.vulnerabilities)}
        </p>
      )}
      {listOrNull(spec.resistances) && (
        <p>
          <strong>Resistances</strong> {listOrNull(spec.resistances)}
        </p>
      )}
      {(listOrNull(spec.immunities) || listOrNull(spec.conditionImmunities)) && (
        <p>
          <strong>Immunities</strong> {[listOrNull(spec.immunities), listOrNull(spec.conditionImmunities)].filter(Boolean).join('; ')}
        </p>
      )}
      <p>
        <strong>Senses</strong> {senses.join(', ')}
      </p>
      <p>
        <strong>Languages</strong> {languages}
      </p>
      <p>
        <strong>CR</strong> {crLabel(spec.cr)} <span className="npc-statblock-muted">(PB {signed(data.prof)})</span>
      </p>

      {ITEM_SECTIONS.map((section) => {
        const items = (spec.items ?? []).filter((i) => i.section === section.key)
        const extraLr = section.key === 'trait' && Number(spec.legendaryResistances) > 0 && !items.some((i) => i.name === 'Legendary Resistance')
        // The generated Spellcasting entry: Traits for slot casters, else where the editor put it.
        const castingSection = spec.spellcasting?.slots ? 'trait' : spec.spellcasting?.section || 'action'
        const casting = (spec.spells ?? []).length && castingSection === section.key ? spellcastingText(spec).split('\n') : null
        if (!items.length && !extraLr && !casting) return null
        return (
          <section key={section.key} className="npc-statblock-section">
            <h3>{section.label}</h3>
            {section.key === 'legendary' && Number(spec.legendaryActions) > 0 && (
              <p className="npc-statblock-muted">Legendary Action Uses: {spec.legendaryActions}.</p>
            )}
            {extraLr && (
              <p>
                <strong>
                  <em>Legendary Resistance ({spec.legendaryResistances}/Day).</em>
                </strong>{' '}
                If {spec.name || 'the creature'} fails a saving throw, it can choose to succeed instead.
              </p>
            )}
            {casting && (
              <p>
                <strong>
                  <em>Spellcasting.</em>
                </strong>{' '}
                {casting[0]}
                {casting.slice(1).map((line) => (
                  <span key={line} className="npc-statblock-spell-line">
                    {line}
                  </span>
                ))}
              </p>
            )}
            {items.map((item) => {
              const uses = usesLabel(item, spec)
              const cost = section.key === 'legendary' && Number(item.legendaryCost) > 1 ? `Costs ${item.legendaryCost} Actions` : ''
              const tag = [uses, cost].filter(Boolean).join('; ')
              const text =
                stripHtml(item.description) ||
                [...(item.activities ?? []).map((a) => activitySummary(spec, a)), behaviorSummary(item.behavior, item.name)].filter(Boolean).join(' ')
              return (
                <p key={item.key}>
                  <strong>
                    <em>
                      {item.name || 'Unnamed'}
                      {tag ? ` (${tag})` : ''}.
                    </em>
                  </strong>{' '}
                  {text}
                </p>
              )
            })}
          </section>
        )
      })}
    </aside>
  )
}
