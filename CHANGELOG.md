# Changelog

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
