# Changelog

## [1.1.3](https://github.com/mharnett/mcp-reddit-ads/compare/mcp-reddit-ads-v1.1.2...mcp-reddit-ads-v1.1.3) (2026-09-03)


### Bug Fixes

* **ad-groups:** finish BIDLESS migration — account-scoped update URLs, drop dead bid fields, add tests ([0b2f5b8](https://github.com/mharnett/mcp-reddit-ads/commit/0b2f5b888e6020b4921a17e3d46b346d4f0661aa))
* **ad-groups:** finish BIDLESS migration — account-scoped update URLs, drop dead bid fields, add tests ([cfff8af](https://github.com/mharnett/mcp-reddit-ads/commit/cfff8af410566d810c1e49d3a444e370e3814b97))
* BIDLESS bid strategy, geolocations format, keywords, and update_ad_group improvements ([c844e6c](https://github.com/mharnett/mcp-reddit-ads/commit/c844e6cafec6e26dbdc88187736b1ab199f900db))
* correct PUT endpoints to include /ad_accounts/{id}/ prefix ([410dcee](https://github.com/mharnett/mcp-reddit-ads/commit/410dceeb86c60bfd9c1232b8ff3472f341e7f9d8))
* use PATCH method without account_id prefix for update operations ([90008e1](https://github.com/mharnett/mcp-reddit-ads/commit/90008e1071fc80500ae2386b57cca13bcb66ce5c))

## [1.1.2](https://github.com/mharnett/mcp-reddit-ads/compare/mcp-reddit-ads-v1.1.1...mcp-reddit-ads-v1.1.2) (2026-07-09)


### Bug Fixes

* budget validation, GAQL mutation blocking, future date checks, limit caps ([1d8c954](https://github.com/mharnett/mcp-reddit-ads/commit/1d8c95442c14abbd13446262c5a3dbcc3afc5df8))
* **ci:** registry lockfile + remove orphan updateNotifier.test.ts ([#4](https://github.com/mharnett/mcp-reddit-ads/issues/4)) ([464bdb4](https://github.com/mharnett/mcp-reddit-ads/commit/464bdb4588be249e9263f0d4c3ce601708628dfb))
* config.json no longer required when using env vars ([0d0fac2](https://github.com/mharnett/mcp-reddit-ads/commit/0d0fac2d5eb61d88f70624a73067277bd7b5b157))
* error server prefix, isError consistency, validateCredentials, CHANGELOG ([843ee83](https://github.com/mharnett/mcp-reddit-ads/commit/843ee837d2d5dbabb877de52f770023220ebb32e))
* error size limits, safeResponse mutation, CHANGELOG, security warnings ([b34ee9d](https://github.com/mharnett/mcp-reddit-ads/commit/b34ee9dc8f9d7c954808b8bdb492359e58adfb6e))
* ID validation, path resolution, health tools, descriptions ([3b0d785](https://github.com/mharnett/mcp-reddit-ads/commit/3b0d785b4adfbe9c02466beccd0e4e99ad21cf0d))
* Node 18.18 minimum, env var trimming, unhandledRejection, TTY guard ([47102e6](https://github.com/mharnett/mcp-reddit-ads/commit/47102e6289ef0402897a6d0b08dc27c19d53d5b5))
* README accuracy, env var docs, dependency cleanup ([c639b31](https://github.com/mharnett/mcp-reddit-ads/commit/c639b3123980d6234dcc814d698ab5a0b314400c))
* resolve import and export issues from cascade failure ([e448836](https://github.com/mharnett/mcp-reddit-ads/commit/e448836c815040fec7a3b56e1fe2ea01e10e9187))
* startup checks, credential redaction, schema hardening, format validation ([cc09c5d](https://github.com/mharnett/mcp-reddit-ads/commit/cc09c5d2c64ce408711986eab4de3a3c9304322d))
* stderr logging, Linux/Docker compat, SIGPIPE, version fallback ([2aa081f](https://github.com/mharnett/mcp-reddit-ads/commit/2aa081f743a29c072ec1f3711d526bfd3a376751))
* use fileURLToPath for path resolution (Windows CI green) ([#6](https://github.com/mharnett/mcp-reddit-ads/issues/6)) ([3267dd7](https://github.com/mharnett/mcp-reddit-ads/commit/3267dd760bb4f880762122823ddfade80fcedb65))
* version field, safeResponse loop, auth retry, SIGTERM handling ([6453862](https://github.com/mharnett/mcp-reddit-ads/commit/6453862823ad61a296c7b7a73175dd4d8981fb4f))

## [1.1.1] - 2026-04-18

### Added
- **Startup npm outdated check.** At server boot, fires a fire-and-forget
  HTTP request to `registry.npmjs.org/mcp-reddit-ads/latest` (2s timeout)
  and logs a stderr notice when a newer version is available. stdout stays
  reserved for MCP JSON-RPC. Silent on network error, timeout, or when
  installed version matches registry. Opt out with
  `MCP_DISABLE_UPDATE_CHECK=1`.

## [1.1.0] - 2026-04-18

### Security
- **Read-only by default.** Mutating tools (create/update campaigns, ad groups, ads, plus bulk pause/enable) are now hidden from `ListTools` and refused at call time unless `REDDIT_ADS_MCP_WRITE=true` is set in the server environment. Motivated by a cross-MCP incident on 2026-04-17 where a casual chat message triggered a live mutation on another ad platform: the write-default is the foot-gun, not any specific bug. The 10 read/report/targeting tools remain available unchanged.
- New module `src/writeGate.ts` exports `WRITE_TOOLS`, `isWriteTool`, `isWriteEnabled`, `filterTools`, and `assertWriteAllowed`.
- Drift alarm: `src/writeGate.test.ts` asserts every tool registered in `tools.ts` is classified as either WRITE or in the local READ fixture, so adding a new tool without classifying it fails CI.

## [1.0.11] - 2026-04-04

### Security
- Error responses now pass through `safeResponse` to prevent oversized error payloads
- `safeResponse` deep-clones before truncation to avoid mutating original data
- Write tools (create_campaign, create_ad_group) now enforce PAUSED status server-side, ignoring user-supplied configured_status

## [1.0.7] - 2026-04-09

### Added
- Rewritten from Python to TypeScript
- CLI flags (--help, --version)
- SIGTERM/SIGINT graceful shutdown
- Env var trimming and validation

### Security
- All logging to stderr (stdout reserved for MCP protocol)
- Auth errors not retried (fail fast on 401/403)
