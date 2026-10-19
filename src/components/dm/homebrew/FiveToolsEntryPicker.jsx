// Shown after "Import from 5etools" when the file holds more than one
// entry - a homebrew pack, or the official feats.json/backgrounds.json -
// so the DM picks which one to load into the editor.
export default function FiveToolsEntryPicker({ entries, noun, onPick, onCancel }) {
  return (
    <div className="draft-banner">
      <label>
        This file has {entries.length} {noun}s - pick one to import
        <select value="" onChange={(e) => e.target.value !== '' && onPick(entries[Number(e.target.value)])}>
          <option value="">Choose a {noun}…</option>
          {entries.map((entry, i) => (
            <option key={`${entry.name}|${entry.source}|${i}`} value={i}>
              {entry.name}
              {entry.source ? ` (${entry.source})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="dm-form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
