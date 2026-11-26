# Szukaj w filmie

Offline video search app (PWA + Windows Electron program). The user communicates in Polish; reply in Polish.

## Rule: bump the version on every update

The header shows the app version (`v1`, `v2`, …) so the user can tell a new version has loaded.
With **every** change that is pushed to the branch:

1. Increase `APP_VERSION` in `version.js` by 1.
2. Bump `VERSION` in `sw.js` (the service worker cache name) in the same commit.

## Layout

- `index.html`, `styles.css`, `app.js` – the app; `worker.js` – AI in a Web Worker; `translate.js` – PL→EN dictionary
- `models.js` – the fast and accurate AI models; `version.js` – app version
- `desktop/` – Electron wrapper; `scripts/prepare-offline.sh`, `scripts/package-windows.sh` – Windows build
- `tests/e2e.mjs` (mock AI), `tests/electron-smoke.mjs`, `tests/web-real.mjs` – tests; CI in `.github/workflows/desktop.yml`
