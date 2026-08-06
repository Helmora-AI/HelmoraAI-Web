<p align="center">
  <img src="public/logo/helmoraai-readme.png" alt="Helmora.ai" width="960">
</p>

# Helmora-Web v2

<p align="center">
  <a href="#known-limitations"><img alt="Status: Alpha" src="https://img.shields.io/badge/status-alpha-F59E0B?style=flat-square"></a>
  <a href="package.json"><img alt="Node.js >= 22.13" src="https://img.shields.io/badge/Node.js-%3E%3D22.13-339933?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="https://react.dev/"><img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react&logoColor=white"></a>
  <a href="https://vite.dev/"><img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/github/license/Helmora-AI/HelmoraAI-Web?style=flat-square&color=0EA5A4"></a>
  <a href="https://github.com/Helmora-AI/HelmoraAI-Web/commits"><img alt="Last commit" src="https://img.shields.io/github/last-commit/Helmora-AI/HelmoraAI-Web?style=flat-square&color=64748B"></a>
</p>

<p align="center">
  <a href="https://github.com/Helmora-AI/HelmoraAI-Hub-v2"><strong>Helmora Hub</strong></a>
  ·
  <a href="https://github.com/Helmora-AI/HelmoraAI-Web"><strong>Helmora Web</strong></a>
</p>

Chat workspace and operations console for Helmora-Hub. The Web application
uses only the Hub's public HTTP contract: it does not import backend internals,
read SQLite or the credential vault, or retain setup tokens, API keys,
passwords or provider secrets in browser storage.

> **Status:** `2.0.0-alpha.1` — functional alpha with responsive and browser
> coverage across the primary workflows. It is not yet production-proven.

## Repository pair

| Repository | Role |
| --- | --- |
| [Helmora-AI/HelmoraAI-Web](https://github.com/Helmora-AI/HelmoraAI-Web) | This repository: chat workspace and operations console |
| [Helmora-AI/HelmoraAI-Hub-v2](https://github.com/Helmora-AI/HelmoraAI-Hub-v2) | Required gateway, orchestration, storage, security and management API |

Web always connects to a compatible Helmora-Hub through its public HTTP
contract. It can run as a separate service, or its production build can be
placed in `Helmora-Hub/dist/web` so Hub serves both UI and API from one process
and one origin.

## Available surfaces

| Group | Surface |
| --- | --- |
| Auth | first-run setup, one-time API-key receipt, login, session, logout, CSRF |
| Work | direct Responses SSE chat, native agent/memory chat, conversations, research, tools |
| Operate | overview, provider connections, Models & routes, durable tasks |
| Knowledge | memories, files, knowledge bases/documents/search |
| System | scoped API keys, usage/request inspector, audit, runtime/OpenAPI, webhooks |

Highlights:

- Streaming Chat supports stop/abort, sanitized Markdown, code copy,
  direct/native modes and source links validated by Hub.
- Conversations support search, rename, archive/restore, fork, export and
  delete.
- Provider cards expose Active, Coming Soon and Blocked catalog states plus
  Ready/Attention operational state. Configure supports Save, Save & Verify,
  Diagnose and Import. `/providers` includes detailed local filters
  (availability, connection state, verification, protocol, source, tier).
- Models & routes includes Diagnose quick-add, searchable provider/model/
  connection selectors, catalog search/filter, metadata editing with locked
  identity fields, Enable/Disable, hard Delete and route simulation. Route
  creation keeps a stable Route ID plus a required operator-facing Display name.
- Chat routed-model control is a searchable Typeahead; the top bar shows Hub
  `/health` round-trip latency every five seconds.
- Provider forms are driven by Hub `config_fields`; multi-connection state is
  isolated to the selected connection.
- Light, dark and system themes, responsive navigation, lazy-loaded
  routes/charts and reduced-motion handling are included.
- Motion is centralized in a small token-driven system (single keyframe
  library, `--ctrl-motion-*` durations and `--ctrl-ease-*` curves, staggered
  entrances, direction-aware route transitions, live metric count-ups and chat
  streaming feedback); see [Motion and interaction design](#motion-and-interaction-design).
- Mobile drawers manage keyboard/AT focus (inert off-canvas panels, focus
  restore, Escape close), and a contrast guard test locks WCAG AA text contrast
  across both themes plus a 9.6px floor on mono font sizes.

## Requirements

- Node.js `>=22.13.0` (Node.js 24 recommended)
- a compatible Helmora-Hub at `http://127.0.0.1:3000` or another configured
  origin

## Local development

From the `Helmora-Web` directory:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Vite reverse-proxies Hub API, cookies and SSE so
the browser always communicates through one origin.

To develop against the backend, run a compatible Helmora-Hub checkout at
`127.0.0.1:3000`, then start Web as shown above. Installation, type checking,
unit tests and production builds in this repository do not depend on a parent
npm workspace or files outside this directory.

## All-in-one integration

Helmora-Hub can serve the Web production build directly. After building both
repositories, copy the contents of `Helmora-Web/dist/` into
`Helmora-Hub/dist/web/`:

```powershell
Copy-Item -Recurse -Force .\dist\* <path-to-Helmora-Hub>\dist\web\
```

Hub then serves UI and API from the same origin with CSP, cache policy, path
containment and SPA fallback that does not mask `/api`, `/v1`, `/mcp`, health
or file errors. `HELMORA_WEB_DIR` may point Hub to another valid Web build.

The all-in-one layout requires only the Hub process at runtime; a separate Web
server is not needed.

## Production Web-only

From the `Helmora-Web` directory:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run build
npm.cmd start
```

Default `.env`:

```dotenv
HELMORA_WEB_HOST=127.0.0.1
HELMORA_WEB_PORT=4173
HELMORA_HUB_URL=http://127.0.0.1:3000
```

The built-in server serves the SPA and reverse-proxies `/api`, `/v1`, `/mcp`,
health, readiness, version and OpenAPI requests to Hub. `HELMORA_HUB_URL` is a
server-side origin and must not contain credentials.

For Internet exposure, place an HTTPS reverse proxy in front of Web. Publish
the Hub port only when SDK, IDE or CLI clients require it; otherwise keep the
Hub origin private and accessible only to the Web server.

## Optional Cloudflare Pages Hub proxy

The production Vite `dist` can be hosted on Cloudflare Pages. Pages does not
run `scripts/serve.mjs`, so Hub API surfaces need an optional Pages Function
reverse proxy. The browser continues to call same-origin `/api`, `/v1`, `/mcp`,
health, readiness, version and OpenAPI paths; cookies, CSRF and SSE stay
same-origin from the browser’s perspective.

This path is **opt-in and fail-closed**. Enable it only with exact Pages
Function bindings (never `VITE_` variables; never compile Hub URLs into the
client bundle):

```text
HELMORA_CF_PAGES_PROXY_ENABLED=true
HELMORA_HUB_URL=https://hub.example.com
```

Pair Hub/Pterodactyl with the public Hub origin and every browser origin that
must authenticate (Production and Preview Pages environments are separate):

```text
HELMORA_PUBLIC_URL=https://hub.example.com
HELMORA_ALLOWED_ORIGINS=https://hub.example.com,https://app.example.com
```

Rules:

- `HELMORA_HUB_URL` must be an exact HTTPS origin (no credentials, path, query
  or fragment). It is not a Vite variable.
- Missing, empty, false or invalid `HELMORA_CF_PAGES_PROXY_ENABLED` keeps the
  proxy off. Hub routes then return a typed `HUB_PROXY_DISABLED` / config 503
  without upstream fetches.
- Never place tunnel tokens, setup tokens, master keys, provider keys or Hub
  API keys in Cloudflare Pages.
- Cloudflare Tunnel and the Pages proxy are separate concerns. The Hub URL may
  be backed by Tunnel or any other HTTPS deployment.
- The Function does not weaken Hub authentication, CSRF, allowed-origin or
  request-limit enforcement.
- Vite `npm run dev`, `npm start`, Docker/Pterodactyl and all-in-one ignore the
  Pages Function directory and keep their existing proxies.

Cloudflare Pages build settings remain: Framework preset React (Vite), build
command `npm run build`, output directory `dist`, Node 24. Evidence for this
proxy is local mock/contract tests plus production bundle/typecheck; it is not
claimed as live-validated on Cloudflare until an operator deploys it.

Static delivery contract for production `dist`:

- Explicit Cloudflare SPA route rewrites in `public/_redirects` (no broad
  `/*` catch-all) cover document routes such as `/chat` so missing `/assets/*`
  paths fall through to a real 404 (`public/404.html`), never SPA HTML.
- Hashed `/assets/*` use long-lived immutable caching via `public/_headers`.
- HTML/app-shell targets (`/index.html`, `/`, `/404.html`) use
  revalidate/no-cache headers in configuration so stale shells do not keep
  referencing removed lazy chunks after deploy.
- Local `npm start` (`scripts/serve.mjs`) is covered by local standalone server
  tests (document routes, MIME, missing-asset 404, cache headers).
- Cloudflare Pages `_headers`/`_redirects`/`_routes.json` are covered by a
  configuration contract test against official Pages docs; this is not a live
  Cloudflare deployment. Effective Cache-Control on 200 rewrite responses
  remains a remaining live-deployment validation item. No live Cloudflare
  deployment was performed in this patch.

If a browser still holds an old shell after deploy, Web performs one guarded
hard reload per build/path on Vite preload/dynamic-import chunk failure, then
shows a recovery UI with a manual Reload action instead of a black screen.

## Chat scroll and follow behavior

- `/chat` is bounded to the viewport (`100dvh` with safe fallback); history and
  transcript are independently bounded inside `HelmoraScrollArea`, with the
  composer outside those scroll regions.
- Native scrollbars remain visible and operable; keyboard, pointer, wheel,
  touch, and horizontal scrolling stay native. The velocity thumb is decorative
  only and respects `prefers-reduced-motion`.
- Transcript smart-follow pauses when the reader scrolls up, resumes near the
  bottom during streaming, and exposes a compact **Jump to latest** control.
- Usage ledger uses the same native overflow model, including horizontal
  overflow for wide request tables.
- Browser evidence for these scroll surfaces covers Chromium and WebKit once
  `e2e/scroll-containment.e2e.ts` passes with real scroll geometry assertions.

## Motion and interaction design

Motion is defined once and reused, never hand-written per page:

- **Tokens**: durations `--ctrl-motion-fast` (140ms), `--ctrl-motion-base`
  (240ms), `--ctrl-motion-slow` (420ms), `--ctrl-motion-press` (80ms) and
  `--ctrl-motion-stagger` (55ms); easing `--ctrl-ease-out` for entrances and
  `--ctrl-ease-spring` for state changes such as the toggle thumb and popover
  chevrons.
- **Keyframe library**: all entrance/exit animations (route, panel, modal,
  alert, message, receipt, result, typing, shimmer and pulse) live in one
  `AppShell.css` section and are reused by class rather than re-declared.
- **Micro-interactions**: sliding nav underline, spring toggle thumb, hover
  lift on panels/cards/metrics, instant press feedback on buttons, segmented
  tab selection easing, animated focus rings on toolbar selects, and smooth
  file-drop highlight states.
- **Route and page transitions**: route changes slide direction-aware
  (forward/back) with staggered `panel-enter` for page headers, panels, metric
  strips and list rows using `calc(var(--ctrl-motion-stagger) * N)` delays.
- **Data feedback**: Overview metrics count up on change (720ms cubic ease-out,
  deterministic under Vitest); charts animate on mount with per-series stagger;
  loading skeletons shimmer via a shared gradient; empty states fade/slide in.
- **Chat experience**: a three-dot typing indicator shows while awaiting the
  first stream byte, the streaming cursor blinks only while text flows, the
  newest completed assistant message gets a soft emphasis flash, and run-receipt
  timeline rows stagger in.
- **Reduced motion**: every animated and transformed hover/state effect is
  cancelled under `prefers-reduced-motion` (see `reducedMotion.ts`), which also
  disables chart animations and metric count-ups; non-animated layout remains
  identical.

## Usage monitoring semantics

- Summary cards and charts use Hub full-period aggregation (`summary` +
  UTC daily `buckets`).
- The request ledger remains capped (`limit`, default 500 recent rows); charts
  never derive from the capped ledger alone.
- Logical request tokens describe the final/downstream request result; physical
  attempts are individual outbound provider calls.
- **Estimated cost** (`Known estimated cost (USD)`) is the sum of known
  physical-attempt subtotals calculated from each attempt’s reported or safely
  estimated usage and catalog pricing — monitoring estimation, not provider
  billing truth. No live provider pricing fetch or billing reconciliation is
  added.
- Provenance and coverage distinguish:
  - `complete` coverage: all persisted physical attempts have known accounting;
  - `partial` coverage (`partial_pricing` label): displayed amount is only a known subtotal;
  - `unknown` coverage (`unknown_pricing` label): no trustworthy subtotal; rendered as `Unknown` / `—`, never `$0.00`;
  - `legacy_estimate`: legacy pre-migration request estimate rows;
  - explicit known free cost remains `$0.00`.
- Request inspector shows structured Overview/Usage/Attempts sections with physical attempt cost subtotals; raw JSON stays in a collapsed Advanced section only.

## Provider and model workflow

Web preserves the lifecycle boundaries enforced by Hub:

1. Save a connection; new connections remain disabled.
2. Diagnose connectivity and optionally list upstream models.
3. Select explicit model IDs and Import; models are never auto-imported.
4. Edit metadata when needed; `id`, `providerId` and `upstreamId` remain locked.
5. Verify the exact connection/model with a chat probe before enabling the
   connection.
6. Enable the model and add it to a route.

Model Edit changes only fields represented by the form. Pricing, modalities,
`parallelTools`, `structuredOutput` and `streaming` are preserved from the
original model. Hard Delete removes the catalog row and related route targets
while retaining route profiles. The model catalog is currently global, and
environment-managed models may be seeded again after restart.

Diagnose proves only that an upstream model ID can be listed. It does not prove
pricing, tools, structured output or native streaming support. Web currently
has no global "model does not support SSE" badge; operators inspect request
attempts, resilience observations and Hub logs.

## Data and security boundary

- Only the `helmora.theme` preference is stored in localStorage.
- Browser sessions use HttpOnly cookies; the CSRF token exists only in memory.
- Setup tokens and one-time API keys are not persisted after their request.
- Provider and webhook secrets are never read back from Hub.
- Markdown is sanitized before rendering.
- The static server blocks traversal, dotfiles, source maps, unsupported
  extensions and symlink escape.
- The UI does not replace TLS, firewall rules, backups, provider-key rotation
  or host/container egress policy.

## Test and build

From this repository:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check
```

`npm run check` is the standalone Web gate: strict type checking, unit tests
and a production build. Browser E2E uses the Helmora distribution's integrated
fixture, so `npm run test:e2e` requires an integration checkout with a
compatible test harness.

The current release matrix covers Chromium desktop, tablet and mobile plus
WebKit desktop on Windows. Visual baselines under
`e2e/visual.e2e.ts-snapshots/` are source-controlled test assets rather than
local test output.

## Deployment assets

- Docker/Compose: `docker compose up -d --build`
- systemd: `deploy/systemd/helmora-web.service`
- environment template: `deploy/systemd/helmora-web.env.example`
- Pterodactyl egg: `deploy/pterodactyl/egg-helmora-web.json`
- Pterodactyl startup: `npm run ptero:start`
- Cloudflare Pages (optional): `functions/[[path]].ts`, `public/_routes.json`,
  bindings `HELMORA_CF_PAGES_PROXY_ENABLED` + HTTPS `HELMORA_HUB_URL`

These assets pass static/config validation. The current Docker image, systemd
host deployment and Pterodactyl panel flow have not yet been live-proven
against this exact source revision. The Pages Hub proxy has mock/contract
evidence only until an operator deploys it.

## Repository documentation

- [Production environment template](.env.example)
- [systemd service](deploy/systemd/helmora-web.service)
- [Pterodactyl egg](deploy/pterodactyl/egg-helmora-web.json)
- [Apache License 2.0](LICENSE) and [attribution notice](NOTICE)

## Known limitations

- Inline regenerate/edit-and-branch and a source drawer are not yet available
  in Chat; explicit fork/export is available under Conversations.
- Direct Chat sends the loaded transcript and does not yet use the Hub context
  planner to budget long histories.
- Recovery/deployment-doctor UI and full reconnect/resume semantics remain
  deferred.
- Provider logo assets remain large and have no public asset-size gate.
- There is no dedicated UI for native-stream support observations or synthetic
  TTFT.
- Optional Cloudflare Pages Hub proxy is implemented and mock/contract-tested;
  it is not claimed as live-validated on Cloudflare until an operator deploys
  it.

Treat these items as alpha release boundaries, not as a production-readiness
claim.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
