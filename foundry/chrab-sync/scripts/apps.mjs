// The two Chrab Sync windows, both GM-only:
//   SyncApp   - the queue: NPCs sent from the Compendium, checkboxes, Apply.
//   ConfigApp - sync account sign-in/out and the world -> campaign mapping.
//
// Built on ApplicationV2 rendering raw HTML (_renderHTML/_replaceHTML) with
// data-action buttons, rather than Handlebars templates or form handlers, to
// lean on as little of the window API as possible.

import { applyQueuedNpc, findDraftActor } from './apply.mjs'
import { MODULE_ID } from './constants.mjs'
import { checkQueue } from './queue.mjs'
import { currentEmail, isSignedIn, listCampaigns, rpc, signIn, signOut } from './supabase.mjs'

const { ApplicationV2 } = foundry.applications.api

function esc(value) {
  return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function crLabel(cr) {
  return { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[Number(cr)] ?? String(cr)
}

export class SyncApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'chrab-sync-queue',
    classes: ['chrab-sync'],
    window: { title: 'Chrab Sync', icon: 'fa-solid fa-cloud-arrow-down', resizable: true },
    position: { width: 560, height: 'auto' },
    actions: {
      refresh: SyncApp.#onRefresh,
      apply: SyncApp.#onApply,
      settings: SyncApp.#onSettings,
      toggleAll: SyncApp.#onToggleAll,
    },
  }

  entries = []
  results = {} // draft id -> { ok, text }
  message = ''
  busy = false
  loaded = false

  static open() {
    const app = foundry.applications.instances?.get('chrab-sync-queue') ?? new SyncApp()
    app.load()
    return app
  }

  async load() {
    this.busy = true
    this.message = 'Checking the Compendium…'
    this.render({ force: true })
    try {
      const { entries, reason } = await checkQueue({ notify: false })
      this.entries = entries
      this.message = reason ?? (entries.length ? '' : 'Nothing waiting. Send NPCs from the NPC Forge on the Compendium site.')
    } catch (err) {
      this.entries = []
      this.message = err.message
    }
    this.busy = false
    this.loaded = true
    this.render()
  }

  async _renderHTML() {
    const rows = this.entries
      .map((e) => {
        const result = this.results[e.id]
        const target = findDraftActor(e.id) ? 'update existing' : 'new'
        return `
          <li class="chrab-sync-row">
            <label>
              <input type="checkbox" name="pick" value="${esc(e.id)}" ${result?.ok ? 'disabled' : 'checked'}>
              <strong>${esc(e.name)}</strong>
              <span class="chrab-sync-meta">CR ${esc(crLabel(e.cr))} · ${target} · sent ${esc(new Date(e.queued_at).toLocaleString())}</span>
            </label>
            ${result ? `<span class="chrab-sync-result ${result.ok ? 'ok' : 'fail'}">${esc(result.text)}</span>` : ''}
          </li>`
      })
      .join('')
    const pending = this.entries.filter((e) => !this.results[e.id]?.ok).length
    return `
      <section class="chrab-sync-body">
        ${this.message ? `<p class="chrab-sync-message">${esc(this.message)}</p>` : ''}
        ${this.entries.length ? `<ul class="chrab-sync-list">${rows}</ul>` : ''}
        <footer class="chrab-sync-footer">
          <button type="button" data-action="settings"><i class="fa-solid fa-gear"></i> Account &amp; campaign</button>
          <button type="button" data-action="refresh" ${this.busy ? 'disabled' : ''}><i class="fa-solid fa-rotate"></i> Refresh</button>
          ${this.entries.length ? `<button type="button" data-action="toggleAll">Toggle all</button>` : ''}
          <button type="button" data-action="apply" class="chrab-sync-primary" ${this.busy || !pending ? 'disabled' : ''}>
            <i class="fa-solid fa-download"></i> Apply selected
          </button>
        </footer>
      </section>`
  }

  _replaceHTML(result, content) {
    content.innerHTML = result
  }

  static async #onRefresh() {
    this.results = {}
    await this.load()
  }

  static #onSettings() {
    new ConfigApp().render({ force: true })
  }

  static #onToggleAll() {
    const boxes = [...this.element.querySelectorAll('input[name="pick"]:not(:disabled)')]
    const allOn = boxes.every((b) => b.checked)
    for (const b of boxes) b.checked = !allOn
  }

  static async #onApply() {
    const picked = new Set([...this.element.querySelectorAll('input[name="pick"]:checked:not(:disabled)')].map((b) => b.value))
    if (!picked.size) return
    this.busy = true
    this.render()
    for (const entry of this.entries.filter((e) => picked.has(e.id))) {
      try {
        const { actor, mode } = await applyQueuedNpc(entry)
        await rpc('sync_report_npc', {
          p_draft_id: entry.id,
          p_queued_at: entry.queued_at,
          p_world_id: game.world.id,
          p_actor_uuid: actor.uuid,
          p_error: null,
        })
        this.results[entry.id] = { ok: true, text: mode === 'created' ? 'Created' : 'Updated (backup saved)' }
      } catch (err) {
        console.error(`${MODULE_ID} | failed to apply ${entry.name}`, err)
        this.results[entry.id] = { ok: false, text: err.message }
        try {
          await rpc('sync_report_npc', {
            p_draft_id: entry.id,
            p_queued_at: entry.queued_at,
            p_world_id: game.world.id,
            p_actor_uuid: null,
            p_error: String(err.message).slice(0, 500),
          })
        } catch (reportErr) {
          console.error(`${MODULE_ID} | could not report the failure`, reportErr)
        }
      }
      this.render()
    }
    this.busy = false
    this.render()
    ui.actors?.render()
    await checkQueue({ notify: false }).catch(() => {})
  }
}

export class ConfigApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'chrab-sync-config',
    classes: ['chrab-sync'],
    window: { title: 'Chrab Sync: account & campaign', icon: 'fa-solid fa-link' },
    position: { width: 440, height: 'auto' },
    actions: {
      signIn: ConfigApp.#onSignIn,
      signOut: ConfigApp.#onSignOut,
      saveCampaign: ConfigApp.#onSaveCampaign,
      openQueue: () => SyncApp.open(),
    },
  }

  campaigns = null
  message = ''

  async _prepareContext() {
    if (isSignedIn() && this.campaigns === null) {
      try {
        this.campaigns = await listCampaigns()
      } catch (err) {
        this.campaigns = []
        this.message = err.message
      }
    }
    return {}
  }

  async _renderHTML() {
    const message = this.message ? `<p class="chrab-sync-message">${esc(this.message)}</p>` : ''
    if (!isSignedIn()) {
      return `
        <section class="chrab-sync-body">
          <p>Sign in with the <strong>foundry-sync</strong> account (not your DM login). Only this browser keeps the session.</p>
          ${message}
          <label>Email <input type="email" name="email" autocomplete="username"></label>
          <label>Password <input type="password" name="password" autocomplete="current-password"></label>
          <label class="chrab-sync-inline"><input type="checkbox" name="remember" checked> Remember me on this browser</label>
          <footer class="chrab-sync-footer">
            <button type="button" data-action="signIn" class="chrab-sync-primary"><i class="fa-solid fa-right-to-bracket"></i> Sign in</button>
          </footer>
        </section>`
    }
    const current = game.settings.get(MODULE_ID, 'campaignId')
    const options = (this.campaigns ?? [])
      .map((c) => `<option value="${esc(c.id)}" ${c.id === current ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('')
    return `
      <section class="chrab-sync-body">
        <p>Signed in as <strong>${esc(currentEmail())}</strong> on this browser.</p>
        ${message}
        <label>Campaign for this world
          <select name="campaign"><option value="">— pick one —</option>${options}</select>
        </label>
        <p class="chrab-sync-meta">This world only receives NPCs sent to the campaign picked here.</p>
        <footer class="chrab-sync-footer">
          <button type="button" data-action="signOut"><i class="fa-solid fa-right-from-bracket"></i> Sign out</button>
          <button type="button" data-action="openQueue"><i class="fa-solid fa-list"></i> Open queue</button>
          <button type="button" data-action="saveCampaign" class="chrab-sync-primary"><i class="fa-solid fa-floppy-disk"></i> Save</button>
        </footer>
      </section>`
  }

  _replaceHTML(result, content) {
    content.innerHTML = result
  }

  static async #onSignIn() {
    const email = this.element.querySelector('[name="email"]').value.trim()
    const password = this.element.querySelector('[name="password"]').value
    const remember = this.element.querySelector('[name="remember"]').checked
    try {
      await signIn(email, password, remember)
      this.message = ''
      this.campaigns = null
      ui.notifications.info('Chrab Sync: signed in.')
    } catch (err) {
      this.message = err.message
    }
    this.render()
  }

  static async #onSignOut() {
    await signOut()
    this.campaigns = null
    this.message = 'Signed out on this browser.'
    this.render()
    ui.actors?.render()
  }

  static async #onSaveCampaign() {
    const campaignId = this.element.querySelector('[name="campaign"]').value
    await game.settings.set(MODULE_ID, 'campaignId', campaignId)
    this.message = campaignId ? 'Saved.' : 'Cleared - this world will not receive NPCs.'
    this.render()
    await checkQueue({ notify: true }).catch((err) => ui.notifications.warn(`Chrab Sync: ${err.message}`))
  }
}
