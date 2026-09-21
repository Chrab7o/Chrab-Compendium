// Discover + download the generator script behind a fantasynamegenerators.com page.
//
// Usage: node fetch.mjs dnd-elf-names
//        node fetch.mjs https://www.fantasynamegenerators.com/dnd-elf-names.php
//        node fetch.mjs dnd-elf-names dnd-dwarf-names dnd-orc-names
//
// Uses curl as the HTTP client: the site's edge rejects node's fetch fingerprint
// with a 403 but serves curl normally. One request per page + one per script,
// spaced out - this is for reading a handful of pages, not crawling the site.
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const BASE = 'https://www.fantasynamegenerators.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const DELAY_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageUrl = (a) => (a.startsWith('http') ? a : `${BASE}/${a.replace(/\.php$/, '')}.php`);

async function get(url, referer, outFile) {
  const args = ['-sS', '-L', '--fail', '-A', UA];
  if (referer) args.push('-e', referer);
  if (outFile) args.push('-o', outFile);
  args.push(url);
  const { stdout } = await exec('curl', args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

// The page loads its data with <script src="scripts/<name>.js?cachebuster">.
// Everything under scripts/ that isn't shared site boilerplate is the scheme.
const SHARED = /^(jquery|main|menu|ads|swear|common|script|analytics|banner|savingNames|randomGen|rocket-loader)/i;

const camel = (slug) =>
  slug.replace(/\.php$/, '').split('-').map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');

function findScripts(html, slug) {
  const all = [...new Set([...html.matchAll(/<script[^>]+src=["']([^"']*scripts\/[^"']+?\.js[^"']*)["']/gi)].map((m) => m[1]))];
  const base = (s) => s.split('/').pop().split('?')[0].replace(/\.js$/, '');
  // The data script is named after the page: dnd-elf-names.php -> dndElfNames.js
  const exact = all.filter((s) => base(s).toLowerCase() === camel(slug).toLowerCase());
  return exact.length ? exact : all.filter((s) => !SHARED.test(base(s)));
}

await mkdir('raw', { recursive: true });
let first = true;

for (const arg of process.argv.slice(2)) {
  if (!first) await sleep(DELAY_MS);
  first = false;
  const page = pageUrl(arg);
  try {
    const slug = page.split('/').pop();
    const found = findScripts(await get(page), slug);
    if (!found.length) { console.log(`?  ${page} - no generator script found`); continue; }
    for (const src of found) {
      await sleep(DELAY_MS);
      const url = new URL(src, page).href;
      const name = url.split('/').pop().split('?')[0];
      await get(url, page, `raw/${name}`);
      console.log(`ok raw/${name}  <- ${page}`);
    }
  } catch (e) {
    console.log(`!  ${arg}: ${e.message.split('\n').find((l) => l.includes('curl')) ?? e.message}`);
  }
}
