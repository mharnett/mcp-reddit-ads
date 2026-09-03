#!/bin/bash
# Shared Keychain helper (drak-ops): resolves through the installed package
# location, not a vendored copy — see drak_ops.keychain.keychain_shell_helper_path().
HELPER="$(python3 -c 'from drak_ops.keychain import keychain_shell_helper_path as p; print(p())')"
source "$HELPER"

# Pull credentials from Keychain
export REDDIT_CLIENT_ID=$(keychain_get "REDDIT_CLIENT_ID" "reddit-ads-mcp" 2>/dev/null)
export REDDIT_CLIENT_SECRET=$(keychain_get "REDDIT_CLIENT_SECRET" "reddit-ads-mcp" 2>/dev/null)
export REDDIT_REFRESH_TOKEN=$(keychain_get "REDDIT_REFRESH_TOKEN" "reddit-ads-mcp" 2>/dev/null)

if [ -z "$REDDIT_CLIENT_ID" ] || [ -z "$REDDIT_CLIENT_SECRET" ] || [ -z "$REDDIT_REFRESH_TOKEN" ]; then
    echo "[FATAL] Missing Reddit credentials in Keychain" >&2
    exit 1
fi

exec node "$(dirname "$0")/dist/index.js"
