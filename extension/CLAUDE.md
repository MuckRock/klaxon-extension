# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Klaxon Cloud — a Chrome/Firefox MV3 browser extension (Svelte 5 + Vite + TypeScript) that injects a sidebar into the active page. The user hovers/clicks/drags to pick a DOM region; the extension records a CSS selector + matched text used to monitor that region for changes. Successor to the older Klaxon bookmarklet.

The repo lives at `Klaxon-Cloud/extension/`. The parent repo also contains `plans/` (design docs) and may contain a symlinked `research/` dir.

## Commands

```sh
npm run dev:content  # vite build --watch — content script (src/main.svelte.ts → build/content.js)
npm run dev:service  # vite build --watch -c vite.config.background.ts — service worker (src/background.ts → build/background.js)
npm run build        # one-shot prod build of BOTH bundles into build/
npm run check        # svelte-check (type-check .svelte + .svelte.ts)
npm run lint         # prettier --check .
npm run format       # prettier --write .
npm test             # vitest run (happy-dom)
npm run test:watch
```

Dev runs as two separate vite invocations because they share `build/` and can't both `emptyOutDir` — run them in two terminals (or whatever multiplexer you use). The service-worker config sets `emptyOutDir: false` and `copyPublicDir: false` so the content-script build is the one that owns `build/`.

Single test: `npx vitest run src/lib/tests/oidc.test.ts` or filter by name `npx vitest run -t "pkce"`.

Loading in Chrome: `chrome://extensions` → enable Developer mode → Load unpacked → select `build/`. The action button injects the content script. The extension ID is pinned by the `"key"` in `static/manifest.json`, so it's stable across reloads.

## Env vars

`MUCKROCK_*` vars in `.env` are baked into the bundle at build start (`envPrefix: "MUCKROCK_"` on both vite configs). **Restart both `dev:content` and `dev:service` after editing `.env`** — Vite only reads env files at startup and will otherwise keep emitting builds with stale values. After a rebuild, also reload the extension at `chrome://extensions`. Required: `MUCKROCK_ACCOUNTS_HOST`, `MUCKROCK_CLIENT_ID`. See `.env.example`.

## Architecture

### Build shape

Two vite configs, both emitting into `build/` with stable filenames (Chrome extensions need filenames listed in `manifest.json`, so no asset hashing and no code splitting):

- **`vite.config.ts`** — content script. IIFE bundle at `build/content.js`, entry `src/main.svelte.ts`. CSS is `injected` into JS (Svelte compiler option) so styles work inside the shadow DOM the content script creates. `static/` is its `publicDir`: `manifest.json` and icons get copied to `build/` verbatim.
- **`vite.config.background.ts`** — service worker. ESM bundle at `build/background.js`, entry `src/background.ts`. `emptyOutDir: false` and `copyPublicDir: false` so it doesn't stomp on the content-script build.

### Content script (`src/main.svelte.ts`)

Creates `<div id="klaxon-host">` on `document.body`, attaches an open shadow root, shifts `body.style.marginRight` by `SIDEBAR_WIDTH`, mounts `<App>` inside the shadow root, and on cleanup unmounts and restores the margin. Guarded by `window._klaxonInject` to prevent double-injection (and warns if the legacy bookmarklet is already running).

### Canvas (`src/lib/canvas.svelte.ts`)

The interactive picker. Owns the page-level overlay DOM (dimming, hover outline, locked-selection outline, drag rectangle, dismiss button) and an `<ApertureBar>` that walks ancestors. Listeners on `window` (mousedown/move/up + capturing click) are added/removed via `canvas.active`. The router toggles `canvas.active = (view === "createAlert")`, so picking is only live in the create-alert view. State is exposed as `$state` getters via `canvas.state` so Svelte components can react.

### Selector engine (`src/lib/selector.ts`)

Pure DOM → structured-selector logic, no Svelte. Builds `StructuredSelector` (segments with id/classes/data-attrs/semantic attrs/nth-of-type) and serializes by `SpecificityLevel`. `resolveTarget` (point) and `resolveEnclosingElement` (drag rect) are the two entry points; both filter out the Klaxon host. Covered by `src/lib/tests/selector.test.ts`.

### Shared types and fixtures

- **API types** live in `src/lib/types.d.ts` — `User`, `Org`, `AddOn`, `Run`, `Event`, `Page<T>`, `APIResponse<T, E>`, etc. Most list endpoints return `Page<T>`; `Run` and `Event` reference `AddOn` as either an id or expanded object depending on `?expand=` params.
- **Fixtures** for tests live in `src/test/fixtures/` (`addons.ts`, `events.ts`, `runs.ts`) — typed sample payloads from the DocumentCloud API. Import from tests as `../../test/fixtures/...` (or `../fixtures/...` for tests in `src/test/`).

### UI shell (`src/lib/components/`)

- `App.svelte` — initializes the canvas with `untrack`'d host/shadow refs (one-shot init, not reactive on prop change), renders `Header` + the current view, destroys canvas on unmount. The `{#if router.view === ...}` ladder lives here — add new views to both this ladder and the `View` literal union in `Router.svelte`.
- `Header.svelte` — top bar with the Sign in/Sign out button and (when authenticated) the navigation between alert views. Reads `authState` directly.
- `Welcome.svelte` — wraps authenticated views, showing a sign-in CTA when `authState.status !== "authenticated"` and the view's content otherwise.
- `Router.svelte` — tiny context-based router. `setRouter(router)` exposes `{ view, navigate }`; consumer code calls `getRouter()`. View names are a literal union (`View`).
- `Toaster.svelte` / `ToastList.svelte` — same context pattern, `getToaster()` returns `{ success, error, dismiss }`. Errors are sticky; successes auto-dismiss after 5s.
- `ApertureBar.svelte` — ancestor-walker UI for the picker (driven by `canvas.state`).
- `RelativeTime.svelte` — small helper for human-readable timestamps.
- Views in `src/lib/views/` (`listChanges`, `CreateAlert`, `SaveAlert`).

### Auth (split between SW and sidebar)

OIDC + PKCE against Squarelet, public client (no secret).

- **Service worker** (`src/background.ts`, built to `build/background.js` via `vite.config.background.ts`) does all of: `launchWebAuthFlow`, token exchange, refresh, storage. It must — content scripts can't call `chrome.identity.launchWebAuthFlow`. Tokens persist in `chrome.storage.local` under `muckrock_auth`. Concurrent refreshes are deduped (`refreshPromise`). Listens for `auth/login | auth/logout | auth/token | auth/state` runtime messages, plus `api/fetch` for proxying API calls that need the credentialed token (so the content script doesn't see the bearer).
- **Sidebar client** (`src/lib/auth.svelte.ts`) sends those messages and mirrors the stored record into a reactive `authState: $state<{ status, user, expiresAt, error }>`. Subscribes to `chrome.storage.onChanged` for cross-tab sync (guarded — content scripts don't always see `chrome.storage` even with the permission). `restore()` runs once at content-script boot to seed state from whatever the SW already has.
- **OIDC helpers** in `src/lib/oidc.ts` (PKCE, base64url, JWT payload decode, endpoint URL builders, token-exchange / userinfo / refresh fetchers) are pure functions imported by both the SW and `src/lib/tests/oidc.test.ts`.
- **Redirect URI**: the SW logs `chrome.identity.getRedirectURL()` on boot. Squarelet's `django-oidc-provider` does exact-string matching, so this URL (with trailing slash) must be registered verbatim on the OIDC client. Chrome's URI is stable thanks to `manifest.json` `"key"`; Firefox's is derived from `browser_specific_settings.gecko.id` and is also stable.
- **Pending refactor**: a follow-on PR will introduce a second token tier — `POST /api/jwt/` on Squarelet (already deployed, [PR #675](https://github.com/MuckRock/squarelet/pull/675)) mints a DocumentCloud JWT from the OIDC access token, and DC API calls will use that JWT instead of the OIDC token. Plan at [`../plans/auth-jwt-exchange.md`](../plans/auth-jwt-exchange.md). The current code stores `{ auth, userinfo }`; the refactor moves to `{ oidc, jwt, userinfo }`. Don't bake new code against the current shape.

## Conventions

- **Svelte 5 runes** throughout (`$state`, `$derived`, `$effect`, `$props`). Reactive non-component state lives in `*.svelte.ts` files (e.g. `auth.svelte.ts`, `canvas.svelte.ts`) — the `.svelte.ts` extension is what enables runes outside `.svelte` files.
- **Context-based singletons** (router, toaster) instead of stores. Use `getRouter()` / `getToaster()` from descendants.
- TS is strict throughout. The service worker and OIDC helpers are TypeScript (`src/background.ts`, `src/lib/oidc.ts`); nothing relevant lives in `static/` anymore beyond `manifest.json` and icons.
- Tests use `happy-dom`, not `jsdom`.
