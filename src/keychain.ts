import { spawnSync } from "child_process";

export const KEYCHAIN_ACCOUNT = "reddit-ads-mcp";

/**
 * `security -i` reads each command into a 4096-byte buffer. It splits a longer
 * line and runs the first piece on its own, which stores a truncated secret in
 * the default Keychain.
 */
export const MAX_COMMAND_BYTES = 4000;
const UNQUOTABLE = /["\\\x00-\x1f\x7f]/;

/**
 * Build the `security -i` input line that upserts a generic-password item, or
 * null when these values cannot be sent that way (too long, or holding a
 * quote, backslash or control character).
 *
 * `-U` (update-or-insert) makes the write a SINGLE atomic call. Deleting and
 * then adding would lose a rotated refresh token, and the entry with it, if
 * the process died or the add failed between the two.
 */
export function buildKeychainUpsertCommand(
  service: string,
  secret: string,
  account: string = KEYCHAIN_ACCOUNT,
): string | null {
  if ([account, service, secret].some((v) => UNQUOTABLE.test(v))) return null;
  const line = `add-generic-password -a "${account}" -s "${service}" -w "${secret}" -U\n`;
  return Buffer.byteLength(line) > MAX_COMMAND_BYTES ? null : line;
}

export type RunSecurity = (
  file: string,
  args: string[],
  opts: { input: string; stdio: ["pipe", "ignore", "ignore"] },
) => { status: number | null };

/**
 * Persist a secret to the macOS Keychain via a single atomic upsert. The
 * secret goes to `security` on stdin, never in its arguments, and its output
 * is discarded because its errors quote the input.
 *
 * Returns true on success, false on failure (never throws to the caller, so a
 * locked/denied Keychain degrades to "use this session's token" rather than
 * crashing the refresh path).
 */
export function persistSecretToKeychain(
  service: string,
  secret: string,
  run: RunSecurity = spawnSync,
  account: string = KEYCHAIN_ACCOUNT,
): boolean {
  const input = buildKeychainUpsertCommand(service, secret, account);
  if (input === null) return false;
  try {
    return run("security", ["-i"], { input, stdio: ["pipe", "ignore", "ignore"] }).status === 0;
  } catch {
    return false;
  }
}
