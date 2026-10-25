// An item's written description as blocks, the Item Maker's format, now part
// of the Item Forge (docs/feature-forge-guided.md, phase 4):
//   { type: 'feature', leadIn, name, source, subtitle, castingTime, range,
//     components, duration, description }  a named ability
//   { type: 'text', content }               free prose
// Text uses the Item Maker's light markup: **bold**, *italic*, [[link]],
// "## Heading" for a named sub-section, "- " lists and "> " quotes.
//
// The HTML is the Item Maker's output, unchanged: only <ul>/<li>, <p>,
// <strong>, <em>, <br>, <blockquote> and <a>, because it gets pasted into
// tooltips that strip anything else (tables took whole features with them).

export function emptyAbilityBlock() {
  return { type: 'feature', leadIn: '', name: '', source: '', subtitle: '', castingTime: '', range: '', components: '', duration: '', description: '' }
}

export function emptyTextBlock() {
  return { type: 'text', content: '' }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseInline(text) {
  let s = escapeHtml(text)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
  s = s.replace(/\[\[(.+?)\]\]/g, '<a href="#">$1</a>')
  return s
}

function renderRawBlock(block) {
  const lines = block.split('\n')
  if (lines.every((l) => l.trim().startsWith('> '))) {
    const content = lines.map((l) => l.trim().slice(2)).join(' ')
    return `<blockquote><p>${parseInline(content)}</p></blockquote>`
  }
  if (lines.every((l) => l.trim().startsWith('- '))) {
    const items = lines.map((l) => `<li>${parseInline(l.trim().slice(2))}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  return `<p>${lines.map(parseInline).join('<br>')}</p>`
}

// "## Subtitle" sections: the title is a bold run-in lead, and list / quote
// paragraphs under it render as they would outside it.
function renderNamedBlock(lines) {
  const title = lines[0].trim().replace(/^##\s+/, '')
  const rest = lines.slice(1).join('\n')
  const paragraphs = rest
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const titleHtml = `<strong>${parseInline(title)}.</strong>`
  if (paragraphs.length === 0) return `<p>${titleHtml}</p>`
  const isStructured = (p) => p.split('\n').every((l) => /^\s*[->]\s/.test(l))
  if (isStructured(paragraphs[0])) return [`<p>${titleHtml}</p>`, ...paragraphs.map(renderRawBlock)].join('\n')
  const firstP = `<p>${titleHtml} ${paragraphs[0].split('\n').map(parseInline).join('<br>')}</p>`
  return [firstP, ...paragraphs.slice(1).map(renderRawBlock)].join('\n')
}

function parseBody(text) {
  const lines = (text || '').split('\n')
  const blocks = []
  let rawBuffer = []
  const flushRaw = () => {
    if (!rawBuffer.length) return
    rawBuffer
      .join('\n')
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => blocks.push({ type: 'raw', text: s }))
    rawBuffer = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^##\s+/.test(line.trim())) {
      flushRaw()
      const namedLines = [line]
      i += 1
      while (i < lines.length && !/^##\s+/.test(lines[i].trim())) {
        namedLines.push(lines[i])
        i += 1
      }
      blocks.push({ type: 'named', lines: namedLines })
    } else {
      rawBuffer.push(line)
      i += 1
    }
  }
  flushRaw()
  return blocks.map((b) => (b.type === 'named' ? renderNamedBlock(b.lines) : renderRawBlock(b.text))).join('\n')
}

// A named ability: a bullet with its name (and subtitle) in bold, its spell-like
// stats as a list, and the body as paragraphs under it.
function abilityHtml(block) {
  const heading = [block.leadIn, block.name].filter(Boolean).map(escapeHtml).join(' ')
  const sourceHtml = block.source ? ` <em>(${escapeHtml(block.source)})</em>` : ''
  const subtitleHtml = block.subtitle ? ` — <strong>${parseInline(block.subtitle)}</strong>` : ''
  const stats = [
    ['Casting Time', block.castingTime],
    ['Range', block.range],
    ['Components', block.components],
    ['Duration', block.duration],
  ].filter(([, v]) => v)
  const statList = stats.length ? `<ul>${stats.map(([label, v]) => `<li><strong>${escapeHtml(label)}:</strong> ${parseInline(v)}</li>`).join('')}</ul>` : ''
  const bodyHtml = block.description ? parseBody(block.description) : ''
  // Nothing but a body: it's just text, no empty bullet in front of it.
  if (!heading && !subtitleHtml) return [statList, bodyHtml].filter(Boolean).join('\n')
  const bullet = `<ul>\n  <li><strong>${heading}</strong>${sourceHtml}${subtitleHtml}${statList ? `\n${statList}` : ''}</li>\n</ul>`
  return [bullet, bodyHtml].filter(Boolean).join('\n')
}

export function descriptionHtml(blocks = []) {
  return (blocks ?? [])
    .map((b) => (b.type === 'feature' ? abilityHtml(b) : String(b.content ?? '').trim() ? parseBody(b.content) : ''))
    .filter(Boolean)
    .join('\n')
}

// The markdown the Shops page's descriptions use: a named ability becomes a
// run-in bold lead, as a 5etools sub-entry renders.
export function descriptionMarkdown(blocks = []) {
  return (blocks ?? [])
    .map((block) => {
      if (block.type === 'text') return String(block.content ?? '').trim()
      const heading = [block.name, block.subtitle].filter(Boolean).join(' — ')
      const body = [block.leadIn, block.description].filter((s) => s && s.trim()).join(' ').trim()
      if (!heading) return body
      return body ? `**${heading}.** ${body}` : `**${heading}.**`
    })
    .filter((s) => s.trim())
    .join('\n\n')
}

export const hasDescription = (blocks) => (blocks ?? []).some((b) => (b.type === 'feature' ? b.name || b.description : String(b.content ?? '').trim()))
