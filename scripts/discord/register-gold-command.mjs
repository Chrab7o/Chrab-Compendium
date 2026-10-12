// Registers the /gold slash command with Discord. Run once (and again only if
// the command's definition below changes):
//
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node scripts/discord/register-gold-command.mjs
//
// Add DISCORD_GUILD_ID=... to register it on just your server, where it shows
// up instantly; without it the command is global.
//
// This POSTs one command, which creates or updates /gold by name and leaves
// every other command (/points) alone. Bulk-overwriting with PUT would delete
// any command not in the list - and /points was registered by hand, so its
// exact definition isn't in this repo to include.
//
// The bot's code is in supabase/functions/discord-interactions; this only
// tells Discord the command exists.

const appId = process.env.DISCORD_APPLICATION_ID
const token = process.env.DISCORD_BOT_TOKEN
const guildId = process.env.DISCORD_GUILD_ID

if (!appId || !token) {
  console.error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN (Developer Portal -> your app).')
  process.exit(1)
}

const command = {
  name: 'gold',
  description: "Show the party's spendable gold",
  type: 1,
  options: [
    {
      name: 'character',
      description: 'Only characters whose name contains this',
      type: 3, // string
      required: false,
    },
  ],
  // "Manage Server" (0x20): hidden from regular members by default, so
  // players can't look up each other's purses. Server admins can widen this
  // under Server Settings -> Integrations without re-running this script.
  default_member_permissions: '32',
  dm_permission: false,
}

const url = guildId
  ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${appId}/commands`

const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(command),
})

const body = await res.json()
if (!res.ok) {
  console.error(`Discord said ${res.status}:`, JSON.stringify(body, null, 2))
  process.exit(1)
}
console.log(`Registered /gold (id ${body.id}) ${guildId ? `on guild ${guildId}` : 'globally'}.`)
