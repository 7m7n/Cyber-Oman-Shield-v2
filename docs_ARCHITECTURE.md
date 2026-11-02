# Architecture

## Components
- **content.js** — Runs on Gmail. Extracts the latest message, runs local heuristics, injects the banner, deduplicates per thread.
- **background.js** (service worker) — Handles provider calls, caching, rate limiting. Uses `importScripts` for shared libs.
- **popup.js** — Reads the last analysis from the content script and renders a summary.
- **options.js** — Manages preferences (sync), keys (local), history, whitelist, audit export.
- **lib/*** — Shared modules attached to `globalThis.COSShield`.

## Data flow
1. Gmail DOM → `content.js` extract.
2. Local scoring via `lib/scoring.js` + `lib/url-analysis.js` + `lib/attachments.js`.
3. Optional external checks via message → `background.js` → providers.
4. Merge results → render banner → push to history.
5. Popup reads last result via `COS_GET_LAST_RESULT`.

## Rule configuration
All heuristic weights and lists live in `rules.json`. The version field is surfaced in the banner and audit export.