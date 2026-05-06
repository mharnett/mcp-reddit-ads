#!/usr/bin/env bash
# Per-repo wrapper. Delegates to canonical MCP smoke test.
# See /Users/mark/claude-code/mcps/scripts/mcp-smoke.sh
set -e
cd "$(dirname "$0")/.."
exec /Users/mark/claude-code/mcps/scripts/mcp-smoke.sh /Users/mark/claude-code/mcps/mcp-reddit-ads/run-mcp.sh
