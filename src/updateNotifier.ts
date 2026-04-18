// Fire-and-forget npm registry check at startup. Logs to stderr when a
// newer version is available. stdout is reserved for MCP JSON-RPC, so the
// message never goes there. Silent on network error, timeout, or when the
// installed version is equal to or ahead of the registry latest.
//
// Opt out by setting MCP_DISABLE_UPDATE_CHECK=1 (CI, offline, air-gapped).
// Also skipped when NODE_ENV=test to keep vitest runs silent.

export type FetchLatestVersion = () => Promise<string>;

export interface UpdateNotifierDeps {
  fetchLatestVersion?: FetchLatestVersion;
  log?: (msg: string) => void;
  env?: NodeJS.ProcessEnv;
}

export async function checkForUpdate(
  pkgName: string,
  currentVersion: string,
  deps: UpdateNotifierDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  if (env.MCP_DISABLE_UPDATE_CHECK === "1" || env.NODE_ENV === "test") {
    return;
  }
  const log = deps.log ?? ((msg) => process.stderr.write(msg + "\n"));
  const fetcher = deps.fetchLatestVersion ?? (() => defaultFetch(pkgName));
  let latest: string;
  try {
    latest = await fetcher();
  } catch {
    return;
  }
  if (!latest || !semverLt(currentVersion, latest)) {
    return;
  }
  log(
    `[update] ${pkgName}@${latest} is available (running ${currentVersion}). ` +
      `Upgrade: npx -y ${pkgName}@latest (and relaunch Claude Desktop).`,
  );
}

async function defaultFetch(pkgName: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version !== "string") {
      throw new Error("registry response missing version field");
    }
    return body.version;
  } finally {
    clearTimeout(timer);
  }
}

function semverLt(a: string, b: string): boolean {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}
