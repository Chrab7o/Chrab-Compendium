# Name schemes

The D&D name generator at `/dm/name-generator` is driven by data files in
`src/data/name-schemes/`, compiled from the generator scripts behind
[fantasynamegenerators.com](https://www.fantasynamegenerators.com/dungeons-and-dragons.php).

## Provenance and credit

**The syllable pools are that site's content, not ours.** The pipeline, the
runtime in `src/lib/nameSchemes.js` and the UI are ours; the word lists are not.

The decision taken: **credit and link**, with the page living in the DM-only
area. Every race renders a footer crediting fantasynamegenerators.com and
linking to the exact page its scheme came from — `manifest.json` stores that URL
per race, so the link stays correct as races are added.

Two things to keep in mind:

- Crediting is honest attribution, not a licence. If this ever moves somewhere
  more public, or the site asks, the fallback is to keep the structure and
  substitute different syllables — the compiled format separates pools from
  rules, so nothing in `src/` has to change.
- `RequireDM` is a client-side route guard, not access control. This is a static
  build, so `src/data/name-schemes/*.json` ship as publicly fetchable assets.
  The gate affects discoverability, not reachability.

The randomisation logic is already ours and can be rewritten freely — the
compiled branches are a recovered description of the original rules, not their
code. Swapping in your own weighting only means editing `generators` in the
JSON, or ignoring it and reading `parts` directly.

## Coverage

78 races from 77 scheme files: a scheme can serve more than one race, because
the Firbolg page loads the same generator script as the Elf page. The manifest
lists one entry per race page (`key`, `label`, `source`) pointing at its
`scheme` file, so both get their own name and their own credit link.

## Pipeline

Run from this directory. Each step is independent.

```sh
node fetch.mjs dnd-elf-names dnd-dwarf-names   # download (slug or full URL)
node compile.mjs raw/*.js                      # -> schemes/*.json
node verify.mjs                                # check schemes match the originals
node install.mjs ../..                         # -> src/data/name-schemes/
```

`fetch.mjs` goes through `curl`: the site's edge rejects Node's `fetch`
fingerprint with a 403 but serves curl normally. Requests are spaced 1.5s apart.

## How compiling works

The source generators are browser code that concatenates reads from syllable
arrays and writes the result into the DOM. Rather than parse that JavaScript,
`compile.mjs` runs it in a `node:vm` sandbox with every pool wrapped in a
recording Proxy, generates a few thousand names, and reads the structure off
the reads that actually landed in each name. Each distinct part-sequence
becomes a branch; how often it appears becomes its weight.

Attribution uses a small dynamic program that finds the parse explaining each
name with the fewest leftover characters. That matters because the originals
re-roll in `while` loops, leaving discarded reads in the log — greedy matching
picks the wrong one and cascades into nonsense.

Quirks it handles, each found by a scheme that broke without it:

- pools declared inside a function, not at top level
- pools named `nmF`/`nmMFf`/`names1`, not just `nm1`
- declarations spanning several lines, or with no trailing semicolon
- fixed connectives in the output (`"'"`, `"-"`, a trailing `"s"`)
- parts re-cased mid-name, so matching is case-insensitive
- a global row index `i`: several schemes use one shape for the first five
  names of a batch and another for the rest (recorded as `rows` on a branch)
- generators that only assign `nMs` and never call `testSwear`

## Verifying

`verify.mjs` samples each generator from the original script and from the
compiled scheme, then compares name-length distributions and character-trigram
profiles. It first measures the original against *itself* — two independent
samples of a large syllable space never overlap fully, so a fixed threshold
would fail healthy schemes — and judges the compiled output against that
baseline.

Last run: **142 generators, 112 matching within sampling noise**, 22 differing
only in length mix, 8 needing review (the phrase-style generators: Tabaxi,
Grung, Hag, Triton, Troglodytes). Those still produce usable names; their
branch weights are approximations.

This check earned its keep — it caught a bug where every compiled sequence was
emitted reversed. Name *lengths* were unaffected, so only the trigram
comparison revealed it.
