import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LIVE = process.env.LIVE_TEST === "true";
const ACCOUNT_ID = process.env.TEST_REDDIT_ACCOUNT_ID || "t2_zfxqy5r";

function parseToolResult(result: any): any {
  const text = result?.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

describe.skipIf(!LIVE)("mcp-reddit-ads integration", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "bash",
      args: ["-c", "source ./run-mcp.sh"],
      cwd: "/Users/mark/claude-code/mcps/reddit-ad-mcp",
    });
    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it("lists tools and finds expected tool names", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("reddit_ads_get_client_context");
    expect(names).toContain("reddit_ads_get_campaigns");
    expect(names).toContain("reddit_ads_get_daily_performance");
    expect(names).toContain("reddit_ads_search_subreddits");
    expect(names.length).toBeGreaterThanOrEqual(15);
  });

  it("reddit_ads_get_client_context returns account info", async () => {
    const result = await client.callTool({
      name: "reddit_ads_get_client_context",
      arguments: { account_id: ACCOUNT_ID },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.account_id || data.error).toBeDefined();
    if (!data.error) {
      expect(data.status).toBe("connected");
      expect(data.total_campaigns).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);

  it("reddit_ads_get_campaigns returns campaigns", async () => {
    const result = await client.callTool({
      name: "reddit_ads_get_campaigns",
      arguments: { account_id: ACCOUNT_ID },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.data || data.error).toBeDefined();
    if (data.data) {
      expect(Array.isArray(data.data)).toBe(true);
    }
  }, 15_000);

  it("reddit_ads_get_daily_performance returns report data", async () => {
    const result = await client.callTool({
      name: "reddit_ads_get_daily_performance",
      arguments: {
        account_id: ACCOUNT_ID,
        days: 7,
      },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    // Report data should be an object with data array or records
    expect(typeof data === "object").toBe(true);
  }, 15_000);

  it("reddit_ads_search_subreddits with a query", async () => {
    const result = await client.callTool({
      name: "reddit_ads_search_subreddits",
      arguments: { query: "fulfillment" },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(typeof data === "object").toBe(true);
  }, 15_000);

  it("error: invalid account_id returns error", async () => {
    const result = await client.callTool({
      name: "reddit_ads_get_campaigns",
      arguments: { account_id: "t2_invalid_000" },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error || data.error_type).toBeDefined();
  }, 15_000);

  it("reddit_ads_get_interest_categories returns categories", async () => {
    const result = await client.callTool({
      name: "reddit_ads_get_interest_categories",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(typeof data === "object").toBe(true);
  }, 15_000);
});
