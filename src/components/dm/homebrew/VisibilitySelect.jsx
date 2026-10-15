// The 'public' | 'dm' switch every homebrew editor carries. RLS is what
// actually hides 'dm' rows (and everything under them) from players - this
// just sets the flag.
export default function VisibilitySelect({ value, onChange, label = 'Visibility' }) {
  return (
    <label>
      {label}
      <select value={value ?? 'dm'} onChange={(e) => onChange(e.target.value)}>
        <option value="dm">DM only (draft)</option>
        <option value="public">Visible to players</option>
      </select>
    </label>
  )
}
