#!/bin/bash
# Pull credentials from Keychain
export REDDIT_CLIENT_ID=$(security find-generic-password -a reddit-ads-mcp -s REDDIT_CLIENT_ID -w 2>/dev/null)
export REDDIT_CLIENT_SECRET=$(security find-generic-password -a reddit-ads-mcp -s REDDIT_CLIENT_SECRET -w 2>/dev/null)
export REDDIT_REFRESH_TOKEN=$(security find-generic-password -a reddit-ads-mcp -s REDDIT_REFRESH_TOKEN -w 2>/dev/null)

if [ -z "$REDDIT_CLIENT_ID" ] || [ -z "$REDDIT_CLIENT_SECRET" ] || [ -z "$REDDIT_REFRESH_TOKEN" ]; then
    echo "[FATAL] Missing Reddit credentials in Keychain" >&2
    exit 1
fi

exec node "$(dirname "$0")/dist/index.js"
