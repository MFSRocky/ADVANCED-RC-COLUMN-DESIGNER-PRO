# Installation & Offline Use

## Requirements

- Node.js ≥ 20 (for the static server and tests). The app itself is plain HTML/ES modules.
- A modern browser with IndexedDB, Canvas, SVG and service-worker support.

## Run locally

```bash
npm install
npm run serve      # http://0.0.0.0:8080
```

Any static file server works (e.g. `python -m http.server 8080`). ES modules require HTTP(S),
not `file://`.

## Tests

```bash
npm test           # node:test engineering regression suite
npm run validate   # human-readable benchmark report
```

## Offline / PWA

1. Open the app once over HTTP(S).
2. The service worker (`sw.js`) caches the shell and fetches modules cache-first.
3. Use the browser's *Install app* / *Add to Home screen* to install the PWA.
4. All subsequent design, drawing, storage and report operations work without a network.

## Vendored assets

- `vendor/jspdf.umd.min.js` — jsPDF 4.2.1 (MIT), loaded locally for PDF reports.
- `assets/fonts/` — Inter variable + IBM Plex Mono (OFL).
- `assets/icons/` — Lucide icons (ISC).

No CDN or remote API is referenced by the application.
