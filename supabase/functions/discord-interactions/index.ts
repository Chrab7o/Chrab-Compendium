// Discord calls this URL directly (set as the app's "Interactions Endpoint
// URL" in the Developer Portal) whenever someone runs a slash command or
// Discord pings it to confirm the endpoint is alive. Every request must be
// verified with the app's Ed25519 public key before touching anything else -
// otherwise anyone who finds this URL could send fake interaction payloads.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically for
// every Edge Function; DISCORD_PUBLIC_KEY is set manually via
// `supabase secrets set`. The service role key bypasses RLS entirely, which
// is why character_skill_pool_summary is locked down at the grant level
// (see its migration) rather than relying on RLS to keep it DM-only - this
// function is the one place that's allowed to read it directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nacl from 'https://esm.sh/tweetnacl@1.0.3'

const PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const InteractionType = { PING: 1, APPLICATION_COMMAND: 2 }
const InteractionResponseType = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 }

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  return bytes
}

async function verifyDiscordRequest(req: Request, rawBody: string) {
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  if (!signature || !timestamp) return false
  return nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + rawBody),
    hexToBytes(signature),
    hexToBytes(PUBLIC_KEY)
  )
}

const TREE_TYPE_LABELS: Record<string, string> = { feature: 'Feature', archetype: 'Archetype' }

async function buildShowAllMessage() {
  const { data: rows, error } = await supabase
    .from('character_skill_pool_summary')
    .select('*')
    .order('character_name', { ascending: true })

  if (error) return `Couldn't load skill points: ${error.message}`
  if (!rows || rows.length === 0) return 'No characters have a feature point pool set up yet.'

  const lines = rows.map((r) => {
    const label = TREE_TYPE_LABELS[r.tree_type] ?? r.tree_type
    // points_available is a live balance that already counts down as it's
    // spent (see 20260206000000_points_countdown_and_undo.sql) - it's not a
    // total to subtract points_spent from.
    return `**${r.character_name}** — ${label}: ${r.points_available} remaining (${r.points_spent} XP spent so far)`
  })
  return lines.join('\n')
}

Deno.serve(async (req) => {
  const rawBody = await req.text()

  if (!(await verifyDiscordRequest(req, rawBody))) {
    return new Response('invalid request signature', { status: 401 })
  }

  const interaction = JSON.parse(rawBody)

  if (interaction.type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG })
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.name === 'points') {
    const subcommand = interaction.data.options?.[0]?.name
    if (subcommand === 'show-all') {
      const content = await buildShowAllMessage()
      return Response.json({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } })
    }
  }

  return Response.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: 'Unknown command.' },
  })
})
