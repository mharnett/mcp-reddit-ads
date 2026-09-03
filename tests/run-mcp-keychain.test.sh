#!/bin/bash
# Behavioral + ratchet test for run-mcp.sh's Keychain resolution.
#
# run-mcp.sh must source the shared drak_ops keychain_get.sh helper (resolved
# via keychain_shell_helper_path()) instead of shelling out to
# `security find-generic-password` inline. Runs hermetically: a fake
# `security` and a fake `node` are placed first on PATH, so no real Keychain
# access and no server launch. Mirrors drak-ops's own
# tests/test_keychain_get_sh.py fake-security-on-PATH technique and
# mharnett/mcp-linkedin-ads's tests/run-mcp-credentials.test.sh shape.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/run-mcp.sh"
PASS=0
FAIL=0

make_sandbox() {
  local dir
  dir="$(mktemp -d)"

  # Fake `security`: answers only for the account/service pairs listed in
  # KEYCHAIN (newline-separated "acct|svc|value" rows). Exit 44 (real
  # `security`'s "not found" code) on a miss.
  cat >"$dir/security" <<'STUB'
#!/bin/bash
acct=""; svc=""
while [ $# -gt 0 ]; do
  case "$1" in
    -a) acct="$2"; shift 2 ;;
    -s) svc="$2";  shift 2 ;;
    *)  shift ;;
  esac
done
while IFS= read -r row; do
  [ -z "$row" ] && continue
  racct="${row%%|*}"; rest="${row#*|}"; rsvc="${rest%%|*}"
  [ "$rsvc" = "$svc" ] || continue
  if [ -z "$acct" ] || [ "$racct" = "$acct" ]; then
    printf '%s' "${row##*|}"; exit 0
  fi
done <<< "$KEYCHAIN"
exit 44
STUB

  # Fake `node`: prints the resolved env instead of starting a server.
  cat >"$dir/node" <<'STUB'
#!/bin/bash
echo "CLIENT_ID=${REDDIT_CLIENT_ID:-}"
echo "CLIENT_SECRET=${REDDIT_CLIENT_SECRET:-}"
echo "REFRESH_TOKEN=${REDDIT_REFRESH_TOKEN:-}"
exit 0
STUB

  chmod +x "$dir/security" "$dir/node"
  echo "$dir"
}

run_case() {
  local sandbox
  sandbox="$(make_sandbox)"
  OUT="$(KEYCHAIN="$1" PATH="$sandbox:$PATH" bash "$SCRIPT" 2>&1)"
  RC=$?
  rm -rf "$sandbox"
}

assert_contains() {
  if grep -qF -- "$2" <<<"$1"; then
    echo "  ok: contains '$2'"; PASS=$((PASS+1))
  else
    echo "  FAIL: expected '$2' in:"; sed 's/^/       /' <<<"$1"; FAIL=$((FAIL+1))
  fi
}

assert_rc() {
  if [ "$1" -eq "$2" ]; then
    echo "  ok: exit $2"; PASS=$((PASS+1))
  else
    echo "  FAIL: expected exit $2, got $1"; FAIL=$((FAIL+1))
  fi
}

FULL="reddit-ads-mcp|REDDIT_CLIENT_ID|cid
reddit-ads-mcp|REDDIT_CLIENT_SECRET|csec
reddit-ads-mcp|REDDIT_REFRESH_TOKEN|rtok"

echo "case: all three creds present -> resolved and node launched"
run_case "$FULL"
assert_contains "$OUT" "CLIENT_ID=cid"
assert_contains "$OUT" "CLIENT_SECRET=csec"
assert_contains "$OUT" "REFRESH_TOKEN=rtok"
assert_rc "$RC" 0

echo "case: refresh token missing -> fatal, exit 1"
run_case "reddit-ads-mcp|REDDIT_CLIENT_ID|cid
reddit-ads-mcp|REDDIT_CLIENT_SECRET|csec"
assert_contains "$OUT" "[FATAL] Missing Reddit credentials in Keychain"
assert_rc "$RC" 1

echo "case: everything missing -> fatal, exit 1"
run_case ""
assert_contains "$OUT" "[FATAL] Missing Reddit credentials in Keychain"
assert_rc "$RC" 1

echo "check: run-mcp.sh sources the shared helper via keychain_shell_helper_path()"
if grep -q "keychain_shell_helper_path" "$SCRIPT" && grep -q '^source "\$HELPER"' "$SCRIPT"; then
  echo "  ok: sources shared helper"; PASS=$((PASS+1))
else
  echo "  FAIL: run-mcp.sh does not resolve+source keychain_get.sh via keychain_shell_helper_path()"
  FAIL=$((FAIL+1))
fi

echo "ratchet: no tracked .sh file still shells out to security find-generic-password"
INLINE=""
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  if grep -q "find-generic-password" "$ROOT/$rel" 2>/dev/null; then
    INLINE="$INLINE $rel"
  fi
done <<< "$(git -C "$ROOT" ls-files '*.sh')"
if [ -z "$INLINE" ]; then
  echo "  ok: no inline find-generic-password in tracked .sh files"; PASS=$((PASS+1))
else
  echo "  FAIL: inline find-generic-password still present in: $INLINE"
  FAIL=$((FAIL+1))
fi

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
