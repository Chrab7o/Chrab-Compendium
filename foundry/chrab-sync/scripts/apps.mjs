// The two Chrab Sync windows, both GM-only:
//   SyncApp   - three tabs: NPCs sent from the NPC Forge, Items sent from the
//               Feature Forge (each with checkboxes and Apply), and player
//               character sync with pending shop trades.
//   ConfigApp - sync account sign-in/out and the world -> campaign mapping.
//
// Built on ApplicationV2 rendering raw HTML (_renderHTML/_replaceHTML) with
// data-action buttons, rather than Handlebars templates or form handlers, to
// lean on as little of the window API as possible.

import { applyQueuedNpc, findDraftActor } from './apply.mjs'
import { characterState, partyActors, pendingTrades, pushCharacter, pushCharacters } from './characters.mjs'
import { MODULE_ID } from './constants.mjs'
import { applyQueuedFeature, findDraftCopies, findDraftItem } from './items.mjs'
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
      applyItems: SyncApp.#onApplyItems,
      settings: SyncApp.#onSettings,
      toggleAll: SyncApp.#onToggleAll,
      syncCharacters: SyncApp.#onSyncCharacters,
      settle: SyncApp.#onSettle,
      tab: SyncApp.#onTab,
    },
  }

  tab = 'npcs' // 'npcs' | 'items' | 'characters'
  entries = []
  results = {} // draft id -> { ok, text }
  features = [] // queued Feature Forge items
  featureResults = {} // draft id -> { ok, text }
  updateCopies = true
  trades = [] // unsettled shop trades, from sync_pending_trades
  tradeMessage = ''
  message = ''
  busy = false
  loaded = false

  static open({ tab } = {}) {
    const app = foundry.applications.instances?.get('chrab-sync-queue') ?? new SyncApp()
    if (tab) app.tab = tab
    app.load()
    return app
  }

  async load() {
    this.busy = true
    this.message = 'Checking the Compendium…'
    this.render({ force: true })
    try {
      const { entries, features, reason } = await checkQueue({ notify: false })
      this.entries = entries
      this.features = features ?? []
      this.message = reason ?? ''
    } catch (err) {
      this.entries = []
      this.features = []
      this.message = err.message
    }
    await this.loadTrades()
    this.busy = false
    this.loaded = true
    this.render()
  }

  async loadTrades() {
    if (!isSignedIn()) {
      this.trades = []
      return
    }
    try {
      this.trades = (await pendingTrades()) ?? []
      this.tradeMessage = ''
    } catch (err) {
      this.trades = []
      this.tradeMessage = err.message
    }
  }

  // Player characters: last push, a Sync now button, and unsettled shop
  // trades grouped by character, each group with its own Sync & settle.
  #charactersHTML() {
    if (!isSignedIn()) return ''
    const last = characterState.last
    const status = last
      ? `Last sync ${esc(last.at.toLocaleTimeString())}: ${last.counts.updated} updated, ${last.counts.unchanged} unchanged` +
        (last.counts.failed ? `, <span class="chrab-sync-result fail">${last.counts.failed} failed</span>` : '') +
        (last.unmatched.length ? `<br>Not on the site yet (import once there): ${esc(last.unmatched.join(', '))}` : '')
      : game.settings.get(MODULE_ID, 'syncCharacters')
        ? 'Not synced yet this session.'
        : 'Automatic sync is off (module settings).'
    const groups = new Map()
    for (const t of this.trades) {
      if (!groups.has(t.actor_id)) groups.set(t.actor_id, [])
      groups.get(t.actor_id).push(t)
    }
    const tradeRows = [...groups.entries()]
      .map(([actorId, trades]) => {
        const inWorld = !!game.actors.get(actorId)
        const lines = trades
          .map((t) => `<li>${t.kind === 'buy' ? 'Bought' : 'Sold'} ${t.quantity > 1 ? `${esc(t.quantity)}× ` : ''}${esc(t.item_name)} — ${t.kind === 'buy' ? '−' : '+'}${esc(Number(t.total_gp))} gp <span class="chrab-sync-meta">${esc(t.shop_name)}${t.note ? ` · ${esc(t.note)}` : ''}</span></li>`)
          .join('')
        return `
          <li class="chrab-sync-row">
            <strong>${esc(trades[0].character_name)}</strong>
            <ul class="chrab-sync-trades">${lines}</ul>
            ${
              inWorld
                ? `<button type="button" data-action="settle" data-actor="${esc(actorId)}" ${this.busy ? 'disabled' : ''}><i class="fa-solid fa-check"></i> Applied in Foundry — sync &amp; settle</button>`
                : `<span class="chrab-sync-meta">Not in this world.</span>`
            }
          </li>`
      })
      .join('')
    return `
      <h3 class="chrab-sync-heading">Player characters</h3>
      <p class="chrab-sync-meta">${status}</p>
      ${this.tradeMessage ? `<p class="chrab-sync-message">${esc(this.tradeMessage)}</p>` : ''}
      ${
        tradeRows
          ? `<p>Pending shop trades. Apply them to the sheet first; settling pushes the sheet and stops them counting on top of its gold.</p><ul class="chrab-sync-list">${tradeRows}</ul>`
          : ''
      }
      <footer class="chrab-sync-footer">
        <button type="button" data-action="syncCharacters" ${this.busy ? 'disabled' : ''}><i class="fa-solid fa-users"></i> Sync characters now</button>
      </footer>`
  }

  #npcsHTML() {
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
      ${this.entries.length ? `<ul class="chrab-sync-list">${rows}</ul>` : this.loaded && !this.message ? '<p class="chrab-sync-message">No NPCs waiting. Send them from the NPC Forge on the Compendium site.</p>' : ''}
      <footer class="chrab-sync-footer">
        ${this.entries.length ? `<button type="button" data-action="toggleAll">Toggle all</button>` : ''}
        <button type="button" data-action="apply" class="chrab-sync-primary" ${this.busy || !pending ? 'disabled' : ''}>
          <i class="fa-solid fa-download"></i> Apply selected
        </button>
      </footer>`
  }

  // Feature Forge items: new ones go to the Items folder; an update also
  // refreshes the copies characters already have, when ticked.
  #itemsHTML() {
    const rows = this.features
      .map((f) => {
        const result = this.featureResults[f.id]
        const copies = findDraftCopies(f.id)
        const target = findDraftItem(f.id) ? 'update existing' : 'new'
        const owners = copies.length ? ` · on ${esc(copies.map((c) => c.parent?.name).join(', '))}` : ''
        return `
          <li class="chrab-sync-row">
            <label>
              <input type="checkbox" name="pickItem" value="${esc(f.id)}" ${result?.ok ? 'disabled' : 'checked'}>
              <strong>${esc(f.name)}</strong>
              <span class="chrab-sync-meta">${f.kind === 'spell' ? 'Spell' : 'Feature'} · ${target}${owners} · sent ${esc(new Date(f.queued_at).toLocaleString())}</span>
            </label>
            ${result ? `<span class="chrab-sync-result ${result.ok ? 'ok' : 'fail'}">${esc(result.text)}</span>` : ''}
          </li>`
      })
      .join('')
    const pending = this.features.filter((f) => !this.featureResults[f.id]?.ok).length
    return `
      ${this.features.length ? `<ul class="chrab-sync-list">${rows}</ul>` : this.loaded && !this.message ? '<p class="chrab-sync-message">No features waiting. Send them from the Feature Forge on the Compendium site.</p>' : ''}
      <label class="chrab-sync-inline"><input type="checkbox" name="updateCopies" ${this.updateCopies ? 'checked' : ''}> Also update copies already on characters (keeps their spent uses)</label>
      <p class="chrab-sync-meta">Features can carry scripts that run in players' browsers once they're on a character. They were written by a DM on the Compendium site.</p>
      <footer class="chrab-sync-footer">
        <button type="button" data-action="applyItems" class="chrab-sync-primary" ${this.busy || !pending ? 'disabled' : ''}>
          <i class="fa-solid fa-download"></i> Apply selected
        </button>
      </footer>`
  }

  async _renderHTML() {
    const count = (n) => (n ? ` (${n})` : '')
    const tabs = [
      ['npcs', 'fa-dragon', `NPCs${count(this.entries.filter((e) => !this.results[e.id]?.ok).length)}`],
      ['items', 'fa-wand-sparkles', `Items${count(this.features.filter((f) => !this.featureResults[f.id]?.ok).length)}`],
      ['characters', 'fa-users', `Characters${count(new Set(this.trades.map((t) => t.actor_id)).size)}`],
    ]
      .map(
        ([key, icon, label]) =>
          `<button type="button" data-action="tab" data-tab="${key}" class="chrab-sync-tab ${this.tab === key ? 'active' : ''}" aria-pressed="${this.tab === key}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`,
      )
      .join('')
    const body = this.tab === 'items' ? this.#itemsHTML() : this.tab === 'characters' ? this.#charactersHTML() : this.#npcsHTML()
    return `
      <section class="chrab-sync-body">
        <nav class="chrab-sync-tabs">${tabs}</nav>
        ${this.message ? `<p class="chrab-sync-message">${esc(this.message)}</p>` : ''}
        ${body}
        <footer class="chrab-sync-footer chrab-sync-footer-quiet">
          <button type="button" data-action="settings"><i class="fa-solid fa-gear"></i> Account &amp; campaign</button>
          <button type="button" data-action="refresh" ${this.busy ? 'disabled' : ''}><i class="fa-solid fa-rotate"></i> Refresh</button>
        </footer>
      </section>`
  }

  _replaceHTML(result, content) {
    content.innerHTML = result
  }

  static async #onRefresh() {
    this.results = {}
    this.featureResults = {}
    await this.load()
  }

  static #onTab(event, target) {
    this.tab = target.dataset.tab
    this.render()
  }

  static async #onApplyItems() {
    const picked = new Set([...this.element.querySelectorAll('input[name="pickItem"]:checked:not(:disabled)')].map((b) => b.value))
    this.updateCopies = !!this.element.querySelector('input[name="updateCopies"]')?.checked
    if (!picked.size) return
    this.busy = true
    this.render()
    for (const entry of this.features.filter((f) => picked.has(f.id))) {
      try {
        const { item, mode, copies } = await applyQueuedFeature(entry, { updateCopies: this.updateCopies })
        await rpc('sync_report_feature', {
          p_draft_id: entry.id,
          p_queued_at: entry.queued_at,
          p_world_id: game.world.id,
          p_item_uuid: item.uuid,
          p_error: null,
        })
        const what = mode === 'created' ? 'Created' : 'Updated (backup saved)'
        this.featureResults[entry.id] = { ok: true, text: copies ? `${what}, ${copies} character cop${copies === 1 ? 'y' : 'ies'} updated` : what }
      } catch (err) {
        console.error(`${MODULE_ID} | failed to apply ${entry.name}`, err)
        this.featureResults[entry.id] = { ok: false, text: err.message }
        try {
          await rpc('sync_report_feature', {
            p_draft_id: entry.id,
            p_queued_at: entry.queued_at,
            p_world_id: game.world.id,
            p_item_uuid: null,
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
    ui.items?.render()
    await checkQueue({ notify: false }).catch(() => {})
  }

  static async #onSyncCharacters() {
    this.busy = true
    this.render()
    try {
      await pushCharacters(partyActors(), { force: true })
    } catch (err) {
      ui.notifications.warn(`Chrab Sync: ${err.message}`)
    }
    await this.loadTrades()
    this.busy = false
    this.render()
  }

  static async #onSettle(event, target) {
    const actor = game.actors.get(target.dataset.actor)
    if (!actor) return
    // Exactly the trades shown, so one made on the site since this window
    // loaded stays pending.
    const ids = this.trades.filter((t) => t.actor_id === actor.id).map((t) => t.trade_id)
    this.busy = true
    this.render()
    let message = ''
    try {
      const result = await pushCharacter(actor, { settleTradeIds: ids })
      if (result === 'unmatched') message = `${actor.name} isn't linked on the site.`
      else ui.notifications.info(`Chrab Sync: ${actor.name} synced, ${ids.length} trade${ids.length === 1 ? '' : 's'} settled.`)
    } catch (err) {
      message = err.message
    }
    await this.loadTrades()
    if (message) this.tradeMessage = message
    this.busy = false
    this.render()
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
