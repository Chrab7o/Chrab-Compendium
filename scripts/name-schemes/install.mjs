// Copy the compiled schemes into Chrab-Corner, with a manifest the UI reads.
//
// Usage: node install.mjs [path-to-site]   (default: ../Chrab-Corner)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, globSync, rmSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const site = process.argv[2] ?? '../Chrab-Corner';
const dest = join(site, 'src/data/name-schemes');

// Each generator page -> the script that powers it. A script can serve more
// than one race (the Firbolg page uses the Elf scheme), so this is many-to-one
// and the manifest lists a race per page, not per scheme file.
const pages = [];
if (existsSync('fetch.log')) {
  for (const line of readFileSync('fetch.log', 'utf8').split('\n')) {
    const m = /^ok raw\/(\S+\.js)\s+<- (\S+)$/.exec(line.trim());
    if (m) pages.push({ scheme: basename(m[1], '.js'), page: m[2] });
  }
}

const labelFor = (page, id) => {
  const slug = page ? basename(new URL(page).pathname, '.php') : id;
  return slug
    .replace(/^dnd-/, '')
    .replace(/-names$/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};
const keyFor = (page, id) => (page ? basename(new URL(page).pathname, '.php') : id);

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const installed = new Set();
for (const file of globSync('schemes/*.json')) {
  const id = basename(file, '.json');
  const scheme = JSON.parse(readFileSync(file, 'utf8'));
  if (!Object.keys(scheme.generators ?? {}).length) continue;
  copyFileSync(file, join(dest, `${id}.json`));
  installed.add(id);
}

const races = [];
const seen = new Set();
for (const { scheme, page } of pages) {
  if (!installed.has(scheme)) continue;
  const key = keyFor(page, scheme);
  if (seen.has(key)) continue;
  seen.add(key);
  races.push({ key, scheme, label: labelFor(page, scheme), source: page });
}
// Any scheme no page claimed still gets an entry, so nothing is silently dropped.
for (const id of installed) {
  if (races.some((r) => r.scheme === id)) continue;
  races.push({ key: id, scheme: id, label: labelFor(null, id), source: null });
}
races.sort((a, b) => a.label.localeCompare(b.label));

writeFileSync(join(dest, 'manifest.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  note: 'Syllable data from fantasynamegenerators.com, used with credit; each race links to its source page. See scripts/name-schemes/README.md.',
  races,
}, null, 2));

console.log(`installed ${installed.size} schemes covering ${races.length} races -> ${dest}`);
console.log(`first few: ${races.slice(0, 5).map((r) => r.label).join(', ')}`);
