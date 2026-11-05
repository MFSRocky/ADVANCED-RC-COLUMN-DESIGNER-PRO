# Vercel Deployment

This app is a static ES-module application. Vercel must serve the built static artifact, not the
repository root and not `server.mjs`.

## Recommended project settings

The repository includes `vercel.json`, which sets:

- **Framework Preset:** Other / `null`
- **Install Command:** `npm ci --omit=dev --ignore-scripts`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

`npm run build` runs `scripts/build-static.mjs`, which copies the runtime files into `dist/`:

```
dist/
  index.html
  manifest.webmanifest
  sw.js
  src/
  assets/
  vendor/
```

## If the page shows “Failed to load the application module”

1. Open DevTools → Network and check `/src/ui/app.js?v=20261105`.
   - **404:** Vercel is not serving the built `dist/` output. Confirm Output Directory is `dist`
     and Build Command is `npm run build`, then redeploy.
   - **200 but wrong MIME/CSP:** ensure no custom headers override `Content-Type` for `.js` files.
2. Confirm the deployment is from the branch/commit that contains `vercel.json` and the build script.
3. Hard-refresh (Ctrl/Cmd+Shift+R). The service worker cache is versioned, and navigation is
   network-first, but an old service worker can survive until the new one activates.

## Local verification of the production artifact

```bash
npm run build
npm run serve:dist   # serves dist/ on http://0.0.0.0:8080
npm run test:ui      # headless presentation/boot smoke test against the running server
```
