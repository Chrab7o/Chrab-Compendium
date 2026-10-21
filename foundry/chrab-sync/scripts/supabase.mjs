// Minimal Supabase client for Chrab Sync - plain fetch against the auth and
// PostgREST endpoints, so the module ships no bundled library.
//
// config.json (supabaseUrl + anonKey) sits next to module.json. It is NOT a
// secret: module files are publicly downloadable, and the same two values
// ship inside the public Chrab Compendium site. What protects the data is the
// sync account's login plus the RLS/RPC rules in
// supabase/migrations/20261030000000_foundry_sync.sql.
//
// The session (access + refresh token, never the password) lives in this
// browser only: localStorage when "remember me" is ticked, sessionStorage
// otherwise. It is never written to world settings, which every connected
// client can read.

import { MODULE_ID } from './constants.mjs'

const SESSION_KEY = `${MODULE_ID}.session`
let config = null

export async function loadConfig() {
  if (config) return config
  const response = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/config.json`), { cache: 'no-store' })
  if (!response.ok) throw new Error('Chrab Sync is missing config.json - reinstall the module from the Compendium manifest.')
  config = await response.json()
  if (!config.supabaseUrl || !config.anonKey) throw new Error('Chrab Sync config.json is incomplete.')
  return config
}

function readSession() {
  for (const store of [localStorage, sessionStorage]) {
    const raw = store.getItem(SESSION_KEY)
    if (raw) {
      try {
        return { ...JSON.parse(raw), store }
      } catch {
        store.removeItem(SESSION_KEY)
      }
    }
  }
  return null
}

function writeSession(data, store) {
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    email: data.user?.email ?? readSession()?.email ?? '',
  }
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  store.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function currentEmail() {
  return readSession()?.email ?? null
}

export function isSignedIn() {
  return !!readSession()?.refreshToken
}

async function authRequest(grantType, body) {
  const { supabaseUrl, anonKey } = await loadConfig()
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || `Sign-in failed (${response.status})`)
  return data
}

export async function signIn(email, password, remember = true) {
  const data = await authRequest('password', { email, password })
  return writeSession(data, remember ? localStorage : sessionStorage)
}

export async function signOut() {
  const session = readSession()
  if (session) {
    try {
      const { supabaseUrl, anonKey } = await loadConfig()
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: anonKey, Authorization: `Bearer ${session.accessToken}` },
      })
    } catch {
      // Revoking is best-effort; the local copy is cleared either way.
    }
  }
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

async function accessToken() {
  const session = readSession()
  if (!session?.refreshToken) throw new Error('Not signed in to Chrab Sync.')
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken
  try {
    const data = await authRequest('refresh_token', { refresh_token: session.refreshToken })
    return writeSession(data, session.store).accessToken
  } catch (err) {
    // A dead refresh token means signing in again - don't keep retrying it.
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    throw new Error(`Chrab Sync session expired - sign in again. (${err.message})`)
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const { supabaseUrl, anonKey } = await loadConfig()
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data?.message || data?.hint || `Chrab Compendium request failed (${response.status})`)
  return data
}

export function rpc(fn, args = {}) {
  return request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args })
}

// campaigns are publicly readable, so this needs no special grant.
export function listCampaigns() {
  return request('/rest/v1/campaigns?select=id,name&order=name.asc')
}
