import { useState } from 'react'

// Syllable-pool procedural generator, not a curated name list - small,
// self-contained, no data files to maintain. Each style picks 2-3 syllables
// from its own pools and stitches them together. Fully self-contained: no
// Supabase calls, no persisted state - accepts (and ignores) the standard
// campaignId/config/onConfigChange props so DMScreenPage's widget map can
// treat every widget type uniformly.
const STYLES = {
  Human: {
    prefix: ['Ar', 'Ber', 'Cal', 'Dor', 'Ed', 'Fen', 'Gar', 'Hal', 'Jor', 'Ken', 'Mar', 'Ros', 'Tal', 'Wil'],
    middle: ['a', 'an', 'en', 'in', 'on', 'wyn', 'ric', 'mund', 'wen', ''],
    suffix: ['ard', 'wick', 'ton', 'well', 'mond', 'ley', 'ric', 'a', 'e', 'ith'],
  },
  Elf: {
    prefix: ['Ael', 'Cael', 'El', 'Fael', 'Ith', 'Lae', 'Nym', 'Syl', 'Thal', 'Ver', 'Yl'],
    middle: ['a', 'ae', 'i', 'io', 'ie', 'ori', 'ana', 'wyn', ''],
    suffix: ['iel', 'wen', 'driel', 'thas', 'ion', 'a', 'wyn', 'reth', 'lorien'],
  },
  Dwarf: {
    prefix: ['Bal', 'Dur', 'Grim', 'Kaz', 'Mor', 'Nor', 'Or', 'Thok', 'Ug', 'Vor'],
    middle: ['a', 'o', 'u', 'un', 'ar', 'ok', ''],
    suffix: ['in', 'grim', 'dun', 'gar', 'ok', 'thor', 'bak', 'nir', 'ur'],
  },
  Orc: {
    prefix: ['Gor', 'Grak', 'Krul', 'Mog', 'Rok', 'Skar', 'Thrak', 'Ug', 'Zog'],
    middle: ['a', 'u', 'o', 'ug', ''],
    suffix: ['nak', 'gor', 'mash', 'zug', 'dur', 'krag', 'thok'],
  },
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateName(style) {
  const pool = STYLES[style]
  // prefix entries are already capitalized, middle/suffix are lowercase -
  // concatenating them directly is already correctly cased.
  return pick(pool.prefix) + pick(pool.middle) + pick(pool.suffix)
}

export default function NpcNameGeneratorWidget() {
  const [style, setStyle] = useState('Human')
  const [current, setCurrent] = useState(() => generateName('Human'))
  const [history, setHistory] = useState([])

  function handleGenerate() {
    const name = generateName(style)
    setCurrent(name)
    setHistory((h) => [name, ...h].slice(0, 10))
  }

  return (
    <div className="dm-screen-widget-body">
      <div className="dm-form-row">
        <label>
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            {Object.keys(STYLES).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="dm-screen-npc-name">{current}</p>
      <button type="button" onClick={handleGenerate}>
        Generate
      </button>
      {history.length > 0 && (
        <ul className="dm-list dm-screen-npc-history">
          {history.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
