# Repository Crawl + Comparison to Original Baseline

_Date:_ 2026-04-23 (UTC)

## What I compared

Because this repository only has one local branch (`work`) and no configured Git remotes, I treated the **initial/root commit** as the "original code" baseline.

- Original baseline commit: `d80196d5dc39175259400b607e0dffdd628d5583`
- Current commit: `bb6f693` (`work`)
- Comparison range: `d80196d..HEAD`

## High-level change summary (original → current)

- **115 files changed**
- **42,499 insertions**
- **162,963 deletions**

The largest deletions are old E2T JSON/data payloads and legacy assets, while major additions include a new E2T module (`EAS2Text-NG.js`), styling/layout refactors, and expanded TTS/media support assets.

## Functional migration checks performed

### 1) Entry points and renamed docs

- Confirmed the repo now uses `tts-docs.html` (not `docs.html`) in footer/readme references.
- Confirmed no stale references to `docs.html` remain in active site code.

### 2) Decoder/E2T module wiring

- Confirmed active code points at `assets/E2T/EAS2Text-NG.js` from:
  - `index.html`
  - `assets/js/crawl-bundle.js`
  - `assets/js/decoder-bundle.js`

### 3) Removed legacy files reference check

Searched for stale references to removed legacy files (`EAS2Text.js`, `CCL-us.json`, `wfo-us.json`, legacy jQuery bundles). No live references were found.

## Likely conclusion

The current codebase appears to have undergone a **major architectural/content refresh**, not a small patch set. Based on static reference checks, I did **not** find obvious breakage from missing-file references between old and new naming/layout.

If behavior is still "not functioning as intended," the next most likely issue is runtime logic/regression in new bundles or browser-specific behavior, not missing-file linkage from the original code.

## Suggested next debugging pass (targeted)

1. Capture exact failing workflow (crawl, decode, mux, TTS, export, etc.).
2. Reproduce in browser with devtools console/network and record first failing request.
3. Add a small smoke-test checklist for:
   - Decoder load
   - Crawl parse
   - Splicer audio export
   - TTS voice preview
4. Diff only the suspected subsystem against the pre-refresh commit range, rather than full repo diff.
