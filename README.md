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

Ứng dụng chat và operations console cho Helmora-Hub. Web chỉ dùng public HTTP
contract của Hub: không import backend internals, không đọc SQLite/vault và
không giữ setup token, API key, password hoặc provider secret trong browser
storage.

> **Trạng thái:** `2.0.0-alpha.1` — functional alpha đã có responsive/browser
> coverage trên các flow chính, chưa phải production-proven.

## Cặp repository

| Repository | Vai trò |
| --- | --- |
| [Helmora-AI/HelmoraAI-Web](https://github.com/Helmora-AI/HelmoraAI-Web) | Repo hiện tại: chat workspace và operations console |
| [Helmora-AI/HelmoraAI-Hub-v2](https://github.com/Helmora-AI/HelmoraAI-Hub-v2) | Gateway, orchestration, storage, security và management API bắt buộc |

Web luôn kết nối tới một Helmora-Hub tương thích qua public HTTP contract. Có
thể chạy Web như một service riêng hoặc build rồi đặt vào `Helmora-Hub/dist/web`
để Hub phục vụ cả UI và API bằng một process, một origin.

## Các màn hình hiện có

| Nhóm | Surface |
| --- | --- |
| Auth | first-run setup, one-time API-key receipt, login, session, logout, CSRF |
| Work | direct Responses SSE chat, native agent/memory chat, conversations, research, tools |
| Operate | overview, provider connections, Models & routes, durable tasks |
| Knowledge | memories, files, knowledge bases/documents/search |
| System | scoped API keys, usage/request inspector, audit, runtime/OpenAPI, webhooks |

Chi tiết nổi bật:

- Chat stream có stop/abort, sanitized Markdown, copy code, direct/native mode
  và source links do Hub validate.
- Conversations có search, rename, archive/restore, fork, export và delete.
- Provider cards hiển thị Active / Coming Soon / Blocked cùng trạng thái
  Ready/Attention; Configure hỗ trợ Save, Save & Verify, Diagnose và Import.
- Models & routes có Diagnose quick-add, search/filter, metadata Edit với
  identity bị khóa, Enable/Disable, hard Delete và route simulation.
- Form provider lấy `config_fields` từ Hub; multi-connection state được cô lập
  theo connection đang chọn.
- Light/dark/system theme, responsive navigation, lazy-loaded routes/charts và
  reduced-motion handling.

## Yêu cầu

- Node.js `>=22.13.0` (khuyến nghị Node.js 24)
- Helmora-Hub chạy tại `http://127.0.0.1:3000` hoặc một origin khác được cấu hình

## Local development

Trong thư mục `Helmora-Web`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Mở `http://127.0.0.1:5173`. Vite reverse-proxy Hub API, cookie và SSE để browser
luôn làm việc trên một origin.

Để phát triển cùng backend, chạy một checkout Helmora-Hub tương thích ở
`127.0.0.1:3000` rồi khởi động Web như trên. Repo Web không phụ thuộc npm
workspace hoặc file ở thư mục cha cho các bước install, typecheck, unit test và
production build.

## Tích hợp all-in-one

Helmora-Hub có thể phục vụ trực tiếp production build của Web. Sau khi build
cả hai repo, copy nội dung `Helmora-Web/dist/` vào `Helmora-Hub/dist/web/`:

```powershell
Copy-Item -Recurse -Force .\dist\* <path-to-Helmora-Hub>\dist\web\
```

Hub sẽ phục vụ UI và API cùng origin với CSP, cache policy, path containment và
SPA fallback không che lỗi `/api`, `/v1`, `/mcp`, health hoặc file. Có thể dùng
`HELMORA_WEB_DIR` để trỏ Hub tới một build Web hợp lệ khác.

## Production Web-only

Trong thư mục `Helmora-Web`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run build
npm.cmd start
```

`.env` mặc định:

```dotenv
HELMORA_WEB_HOST=127.0.0.1
HELMORA_WEB_PORT=4173
HELMORA_HUB_URL=http://127.0.0.1:3000
```

Built-in server phục vụ SPA và reverse-proxy `/api`, `/v1`, `/mcp`,
health/readiness/version/OpenAPI tới Hub. `HELMORA_HUB_URL` là server-side
origin và không được chứa credentials.

Nếu expose Internet, đặt HTTPS reverse proxy trước Web. Chỉ public Hub port khi
cần cho SDK/IDE/CLI; nếu không, giữ Hub origin private và chỉ cho Web server
truy cập.

## Provider và model workflow

Web phản ánh đúng các boundary của Hub:

1. Save connection; connection mới vẫn disabled.
2. Diagnose connectivity và optional model listing.
3. Chọn rõ model IDs rồi Import; không auto-import.
4. Edit metadata nếu cần; `id`, `providerId`, `upstreamId` luôn bị khóa.
5. Verify exact connection/model bằng chat probe rồi mới Enable connection.
6. Enable model và thêm vào route.

Edit model chỉ đổi các field có trên form. Pricing, modalities,
`parallelTools`, `structuredOutput` và `streaming` được giữ nguyên từ model gốc.
Hard delete xóa catalog row và route targets liên quan; route profiles vẫn còn.
Catalog model hiện là global, và model do environment quản lý có thể được seed
lại sau restart.

Diagnose chỉ chứng minh upstream ID có thể được liệt kê; nó không phải bằng
chứng cho pricing, tools, structured output hoặc native streaming. Web hiện
không có global badge “model không hỗ trợ SSE”; operator xem request attempts,
resilience observations và Hub logs.

## Data và security boundary

- Chỉ preference `helmora.theme` được lưu trong localStorage.
- Browser session dùng HttpOnly cookie; CSRF token chỉ tồn tại trong memory.
- Setup token và one-time API key không được persist sau request.
- Provider/webhook secrets không bao giờ được đọc lại từ Hub.
- Markdown được sanitize trước khi render.
- Static server chặn traversal, dotfiles, source maps, unsupported extensions
  và symlink escape.
- Giao diện không thay thế TLS, firewall, backup, provider-key rotation hoặc
  host/container egress policy.

## Test và build

Trong workspace:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check
```

`npm run check` là gate độc lập của repo Web: strict typecheck, unit tests và
production build. Browser E2E dùng fixture tích hợp của bộ phát hành Helmora,
vì vậy `npm run test:e2e` chỉ chạy được khi repo nằm trong checkout tích hợp có
test harness tương thích.

Functional/accessibility matrix của bộ phát hành hiện gồm Chromium
desktop/tablet/mobile và WebKit desktop trên Windows. Visual baselines trong
`e2e/visual.e2e.ts-snapshots/` là source-controlled test assets, không phải
local test output.

## Deployment assets

- Docker/Compose: `docker compose up -d --build`
- systemd: `deploy/systemd/helmora-web.service`
- environment template: `deploy/systemd/helmora-web.env.example`
- Pterodactyl egg: `deploy/pterodactyl/egg-helmora-web.json`
- Pterodactyl startup: `npm run ptero:start`

Các assets đã có static/config validation; Docker image, systemd host và
Pterodactyl panel thật chưa được live-proven cho source hiện tại.

## Tài liệu trong repo

- [Mẫu cấu hình production](.env.example)
- [systemd service](deploy/systemd/helmora-web.service)
- [Pterodactyl egg](deploy/pterodactyl/egg-helmora-web.json)
- [Apache License 2.0](LICENSE) và [attribution notice](NOTICE)

## Known limitations

- Inline regenerate/edit-and-branch và source drawer chưa có trong Chat;
  explicit fork/export nằm ở Conversations.
- Direct Chat gửi transcript đã tải, chưa dùng Hub context planner để budget
  lịch sử dài.
- Recovery/deployment-doctor UI và full reconnect/resume semantics còn deferred.
- Modal focus trap/restoration và transcript roles chưa đồng nhất hoàn toàn.
- Provider logo assets còn lớn và chưa có public asset-size gate.
- Chưa có UI riêng cho native-stream support observation hoặc synthetic TTFT.

Xem các mục này như boundary của bản alpha, không phải tuyên bố production
readiness.

## License

Apache License 2.0. Xem [LICENSE](LICENSE) và [NOTICE](NOTICE).
