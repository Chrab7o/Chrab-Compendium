// Check each compiled scheme reproduces its source script.
//
// Compares a large sample from the original (run in the sandbox) against one
// from the compiled scheme, on two signals that catch mis-attribution:
//   - name-length distribution (total variation distance)
//   - character-trigram profile (Jaccard overlap)
// A scheme that compiled wrong shows up as short/garbled names or trigrams the
// original never produces.
import { readFileSync, globSync } from 'node:fs';
import { basename } from 'node:path';
import vm from 'node:vm';

const N = 3000;
const noop = () => {};
const el = () => new Proxy({}, { get: (_, k) => (['appendChild', 'setAttribute', 'removeChild'].includes(k) ? noop : el()) });

function sandboxCtx(file) {
  const out = [];
  const sb = {
    $: () => ({ css: noop, html: noop, text: noop, val: () => '' }),
    document: {
      createElement: el,
      createTextNode: (t) => { const s = String(t ?? '').trim(); if (s) out.push(s.toLowerCase()); return el() },
      getElementById: () => el(), body: el(),
    },
    navigator: { userAgent: '' }, console,
    testSwear: function (s) { sb.nMs = s; if (s) out.push(String(s).trim().toLowerCase()) },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext('var i=0, nTp=0, names="", nMs="", nFm="", nTmp="";var ' + Array.from({length:12},(_,n)=>'rnd'+(n||'')).join('=0,') + '=0;', ctx);
  vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: file });
  return { ctx, out };
}

// Sample one generator from the original script, matching how the compiler
// reached it: a leaf function, or nameGen(type) for the inline schemes.
function sampleOriginal(file, key) {
  const { ctx, out } = sandboxCtx(file);
  const m = /^nameGen(\d*)$/.exec(key);
  for (let n = 0; n < N; n++) {
    ctx.i = n % 10;
    try {
      if (m) ctx.nameGen(m[1] === '' ? undefined : Number(m[1]));
      else {
        ctx.nMs = ''; ctx.nFm = '';
        ctx[key]();
        // A few leaves only assign the global and never call testSwear.
        const direct = String(ctx.nMs || ctx.nFm || '').trim();
        if (direct && out[out.length - 1] !== direct.toLowerCase()) out.push(direct.toLowerCase());
      }
    } catch {}
    if (out.length >= N) break;
  }
  return out.slice(0, N);
}

const trigrams = (list) => {
  const set = new Set();
  for (const s of list) for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return set;
};
const lengths = (list) => {
  const h = new Map();
  for (const s of list) h.set(s.length, (h.get(s.length) ?? 0) + 1);
  for (const [k, v] of h) h.set(k, v / list.length);
  return h;
};
const tvd = (a, b) => {
  let d = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) d += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return d / 2;
};
const jaccard = (a, b) => {
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return inter / (a.size + b.size - inter || 1);
};

const { generateOne } = await import('../Chrab-Corner/src/lib/nameSchemes.js');

const rows = [];
for (const file of globSync('raw/*.js')) {
  const id = basename(file, '.js');
  let scheme;
  try { scheme = JSON.parse(readFileSync(`schemes/${id}.json`, 'utf8')) } catch { continue }
  for (const key of Object.keys(scheme.generators)) {
    // Two independent samples of the ORIGINAL give the baseline similarity we
    // can expect at this sample size - a big syllable space never self-overlaps
    // fully, so comparing against 1.0 would fail every healthy scheme.
    const origA = sampleOriginal(file, key);
    const origB = sampleOriginal(file, key);
    const mine = [];
    for (let n = 0; n < N; n++) {
      const s = generateOne(scheme, key, { row: n % 10 });
      if (s) mine.push(s.toLowerCase());
    }
    if (origA.length < 50 || origB.length < 50 || mine.length < 50) {
      rows.push({ id: `${id}:${key}`, broken: true, no: origA.length, nm: mine.length });
      continue;
    }
    const base = { t: tvd(lengths(origA), lengths(origB)), j: jaccard(trigrams(origA), trigrams(origB)) };
    const got = { t: tvd(lengths(origA), lengths(mine)), j: jaccard(trigrams(origA), trigrams(mine)) };
    rows.push({
      id: `${id}:${key}`,
      dt: got.t - base.t,             // excess length-distribution drift
      rj: got.j / (base.j || 1),      // trigram overlap as a fraction of baseline
      base, got,
    });
  }
}

const broken = rows.filter((r) => r.broken);
const scored = rows.filter((r) => !r.broken);
const bad = scored.filter((r) => r.dt > 0.1 || r.rj < 0.75);
scored.sort((a, b) => (b.dt - b.rj) - (a.dt - a.rj));

console.log(`${rows.length} generators checked`);
console.log(`  ${scored.length - bad.length} match the original within sampling noise`);
console.log(`  ${bad.length} diverge`);
console.log(`  ${broken.length} produced nothing on one side`)
console.log('')
if (broken.length) { console.log('no output:', broken.map((r) => `${r.id} (${r.no}/${r.nm})`).join(', ')); console.log('') }
const tiers = { close: 0, minor: 0, real: 0 };
for (const r of scored) {
  if (r.dt <= 0.1 && r.rj >= 0.75) tiers.close++;
  else if (r.rj >= 0.85) tiers.minor++;
  else tiers.real++;
}
console.log(`  breakdown: ${tiers.close} close, ${tiers.minor} minor length-mix only, ${tiers.real} need review`);
console.log('');
console.log('most divergent (excess length drift / trigram overlap vs baseline):');
for (const r of scored.slice(0, 12))
  console.log(`  ${r.id.padEnd(30)} drift ${r.dt.toFixed(2)}  overlap ${(r.rj * 100).toFixed(0)}% of baseline`);
