// Supabase Auth is email-based, but players shouldn't need a real email
// address just to log in. A bare username (no "@") gets this fixed,
// non-deliverable domain appended so it's still a valid-looking email for
// Supabase's password auth — anything already containing "@" (e.g. the DM's
// real email) passes through unchanged, so existing accounts keep working.
const USERNAME_DOMAIN = 'players.chrab.us'

export function usernameToEmail(input) {
  const trimmed = input.trim()
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${USERNAME_DOMAIN}`
}

export function emailToUsername(email) {
  const suffix = `@${USERNAME_DOMAIN}`
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email
}
