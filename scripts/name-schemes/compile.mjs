// Recover each generator's naming scheme as declarative JSON - no JS parsing.
//
// The site's generators are pure concatenations of reads from syllable arrays
// (`nMs = nm3[i] + nm4[j]`), sometimes behind a weighted branch and a reroll
// loop. So instead of parsing their code, we wrap every array in a recording
// Proxy, run each generator a few thousand times, and read the structure off
// the reads that actually landed in the output. Each distinct part-sequence is
// a branch; how often it turns up is its weight.
//
// Usage: node compile.mjs raw/dndElfNames.js [...]   -> schemes/<id>.json
import { readFileSync, writeFileSync, mkdirSync, globSync } from 'node:fs';
import { basename } from 'node:path';
import vm from 'node:vm';

const RUNS = 6000;
const noop = () => {};
const el = () => new Proxy({}, { get: (_, k) => (['appendChild', 'setAttribute', 'removeChild'].includes(k) ? noop : el()) });

function instrument(file) {
  const log = [];
  const parts = {};
  // Some scripts declare their pools at top level, others inside nameGen() where
  // a plain context walk can't see them. Rewriting each single-line declaration
  // into a tracked assignment catches both, and re-catches pools that get
  // rebuilt (and spliced) on every call.
  // Pools are named nm1/nm2 in most scripts but nmF/nmMFf/... in others, and a
  // few span several lines. Rewriting each declaration into a tracked
  // assignment catches all of them, including pools declared inside a function
  // and pools rebuilt (and spliced) on every call.
  const src = readFileSync(file, 'utf8').replace(
    /^[ \t]*var[ \t]+((?:nm|names)[A-Za-z0-9_]*)[ \t]*=[ \t]*(\[[\s\S]*?\])[ \t]*;?[ \t]*$/gm,
    (_, name, arr) => `var ${name} = __track(${JSON.stringify(name)}, ${arr});`,
  );

  const sb = {
    $: () => ({ css: noop, html: noop, text: noop, val: () => '' }),
    document: {
      createElement: el,
      // Marks the end of one name's reads, for schemes that build names inline.
      createTextNode: (t) => { log.push({ marker: String(t ?? '') }); return el() },
      getElementById: () => el(), body: el(),
    },
    navigator: { userAgent: '' }, console,
    testSwear: function (s) { sb.nMs = s; },
    __track(name, arr) {
      parts[name] = [...arr];
      return new Proxy(arr, {
        get(t, prop) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) log.push({ name, value: t[prop] });
          return t[prop];
        },
      });
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext('var i=0, nTp=0, names="", nMs="";' + 'var ' + Array.from({length:12},(_,n)=>'rnd'+(n||'')).join('=0,') + '=0;', ctx);
  vm.runInContext(src, ctx, { filename: file });
  return { ctx, parts, log };
}

// Which reads actually built this name? Match the output's suffix backwards
// against the read log; reroll loops leave discarded reads that won't match.
// Which reads actually built this name? Reroll loops leave discarded reads in
// the log, so greedy matching picks the wrong one and cascades. Instead search
// for the parse that explains the name with the fewest leftover literal
// characters - the true sequence needs none beyond real connectives like "s".
function attribute(log, out) {
  const reads = log.filter((r) => r.marker === undefined);
  const memo = new Map();
  // Several schemes re-case a part mid-name (charAt(0).toUpperCase()), so the
  // read no longer matches the output byte-for-byte. Compare case-insensitively;
  // the runtime capitalises at the end regardless.
  const hay = out.toLowerCase();

  function best(pos, cur) {
    if (pos === 0) return { cost: 0, seq: [] };
    const key = pos * 4096 + cur;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    let win = null;
    if (cur >= 0) {
      const { name, value } = reads[cur];
      if (value && value.length <= pos && hay.slice(pos - value.length, pos) === value.toLowerCase()) {
        const sub = best(pos - value.length, cur - 1);
        if (sub) win = { cost: sub.cost, seq: [...sub.seq, name] };
      }
      const skip = best(pos, cur - 1);
      if (skip && (!win || skip.cost < win.cost)) win = skip;
    }
    // Fall back to treating a character as fixed connective text.
    const asLit = best(pos - 1, cur);
    if (asLit) {
      const cand = { cost: asLit.cost + 1, seq: [...asLit.seq, { lit: out[pos - 1] }] };
      if (!win || cand.cost < win.cost) win = cand;
    }
    memo.set(key, win);
    return win;
  }

  const found = best(out.length, reads.length - 1);
  if (!found || found.cost > 12) return null;

  // best() already accumulates prefix-first, so found.seq is in reading order.
  // Merge the per-character literals back into whole connectives.
  const seq = [];
  for (const tok of found.seq) {
    if (typeof tok === 'string') { seq.push(tok); continue }
    const prev = seq[seq.length - 1];
    if (prev && prev.startsWith('lit:')) seq[seq.length - 1] = prev + tok.lit;
    else seq.push(`lit:${tok.lit}`);
  }
  return seq.length ? seq : null;
}

// Some scripts keep the whole scheme inside nameGen(), writing each name straight
// into the DOM. Drive that instead, splitting the read log on the text nodes.
function compileViaNameGen(ctx, log, tally) {
  const arity = ctx.nameGen?.length ?? 0;
  const types = arity > 0 ? [0, 1, 2, 3] : [undefined];
  const out = {};
  for (const type of types) {
    const seen = new Map();
    let names = 0;
    for (let n = 0; n < 400; n++) {
      log.length = 0;
      try { ctx.nameGen(type); } catch { /* keep the names emitted before it threw */ }
      let reads = [];
      for (const rec of log) {
        if (rec.marker === undefined) { reads.push(rec); continue; }
        const text = rec.marker.trim();
        if (text) {
          const seq = attribute(reads, rec.marker);
          if (seq) { const k = seq.join('+'); seen.set(k, (seen.get(k) ?? 0) + 1); names++; }
        }
        reads = [];
      }
    }
    const total = [...seen.values()].reduce((a, b) => a + b, 0);
    if (!total) continue;
    const branches = [...seen.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ seq: k.split('+'), weight: +(n / total).toFixed(4) }));
    const key = arity > 0 ? `nameGen${type}` : 'nameGen';
    const sig = JSON.stringify(branches);
    if (Object.values(out).some((g) => JSON.stringify(g.branches) === sig)) continue;
    out[key] = { branches };
  }
  return out;
}

mkdirSync('schemes', { recursive: true });
const files = process.argv.slice(2).flatMap((a) => (a.includes('*') ? globSync(a) : [a]));
let okCount = 0, warnCount = 0;

for (const file of files) {
  const id = basename(file, '.js');
  let inst; try { inst = instrument(file); } catch (e) { console.log(`!  ${id}: ${e.message}`); continue; }
  const { ctx, parts, log } = inst;
  const leaves = Object.keys(ctx).filter((k) => typeof ctx[k] === 'function' && /^name/.test(k) && k !== 'nameGen' && ctx[k].length === 0);

  const generators = {};
  const warnings = [];
  for (const fn of leaves) {
    const seen = new Map();
    let unattributed = 0;
    for (let n = 0; n < RUNS; n++) {
      log.length = 0; ctx.nMs = ''; ctx.i = n % 10;
      try { ctx[fn](); } catch { unattributed++; continue; }
      const out = ctx.nMs;
      if (!out) continue;
      const seq = attribute(log, out);
      if (!seq) { unattributed++; continue; }
      const key = seq.join('+');
      const e = seen.get(key) ?? { n: 0, lo: false, hi: false };
      e.n++; if (ctx.i < 5) e.lo = true; else e.hi = true;
      seen.set(key, e);
    }
    const total = [...seen.values()].reduce((a, b) => a + b.n, 0);
    if (!total) { warnings.push(`${fn}: no output`); continue; }
    if (unattributed / RUNS > 0.02) warnings.push(`${fn}: ${((unattributed / RUNS) * 100).toFixed(1)}% unattributed`);
    generators[fn] = {
      branches: [...seen.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([key, e]) => ({
          seq: key.split('+'),
          weight: +(e.n / total).toFixed(4),
          ...(e.lo && e.hi ? {} : { rows: e.lo ? 'first5' : 'last5' }),
        })),
    };
  }

  if (!Object.keys(generators).length && typeof ctx.nameGen === 'function') {
    Object.assign(generators, compileViaNameGen(ctx, log));
    if (Object.keys(generators).length) warnings.length = 0;
  }

  const used = new Set(Object.values(generators).flatMap((g) => g.branches.flatMap((b) => b.seq)));
  const scheme = {
    id, parts: Object.fromEntries(Object.entries(parts).filter(([k]) => used.has(k))), generators,
  };
  writeFileSync(`schemes/${id}.json`, JSON.stringify(scheme, null, 2));
  const nb = Object.values(generators).reduce((a, g) => a + g.branches.length, 0);
  if (warnings.length) { warnCount++; console.log(`~  ${id}: ${Object.keys(generators).length} gens, ${nb} branches  [${warnings.join('; ')}]`); }
  else { okCount++; console.log(`ok ${id}: ${Object.keys(generators).length} gens, ${nb} branches`); }
}
console.log(`\n${okCount} clean, ${warnCount} with warnings`);
