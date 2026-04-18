import { registerMcpTests } from "@drak-marketing/mcp-test-harness";
import { fileURLToPath } from "url";
import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

registerMcpTests({
  name: "mcp-reddit-ads",
  repoRoot: path.resolve(__dirname, ".."),
  toolPrefix: "reddit_ads_",
  minTools: 10,
  requiredTools: ["reddit_ads_get_client_context", "reddit_ads_get_campaigns"],
  binEntries: { "mcp-reddit-ads": "dist/index.js" },
  hasAuthCli: false,
  hasCredentials: false,
  hasResilience: true,
  hasPlatform: false,
  requiredEnvVars: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_REFRESH_TOKEN"],
  envPrefix: "REDDIT_",
  sourceLintIgnore: ["index.ts"], // index.ts uses execFileSync for Keychain + new URL for path resolution
});
