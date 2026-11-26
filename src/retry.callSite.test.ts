/**
 * Non-idempotent writes must not be retried.
 *
 * withResilience() retries any transient failure (5xx, network error,
 * timeout) up to three more times. A create that fails with a 5xx after
 * Reddit stored it would then create the campaign, ad group or ad a second,
 * third and fourth time. Creates go out once; reads still retry.
 *
 * Containment: same recording fetch, child_process and update-check fakes as
 * writeGate.callSite.test.ts. Nothing reaches reddit.com.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { createRecordingFetch, FAKE_ACCOUNT_ID, FAKE_ENV } from "../tests/helpers/fakeRedditApi.js";
import { connectInMemory } from "../tests/helpers/connect.js";

vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));
vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFileSync: () => {
    throw new Error("child_process is disabled in this test");
  },
  spawnSync: () => {
    throw new Error("child_process is disabled in this test");
  },
}));

const api = createRecordingFetch();
let client: Client;

beforeAll(async () => {
  vi.stubGlobal("fetch", api.fetch);
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("REDDIT_ADS_MCP_WRITE", "true");
  const { server } = await import("./index.js");
  client = await connectInMemory(server);
});

afterAll(async () => {
  await client?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  // One successful call resets the shared circuit breaker's consecutive-failure
  // count, so a failure in one test cannot open the circuit for the next.
  api.reset();
  await client.callTool({ name: "reddit_ads_get_campaigns", arguments: { account_id: FAKE_ACCOUNT_ID } });
  api.reset();
  api.setRoute(() => ({ status: 503, body: { error: "Service Unavailable" } }));
});

const CREATES: Array<[string, string, Record<string, unknown>]> = [
  [
    "reddit_ads_create_campaign",
    `/ad_accounts/${FAKE_ACCOUNT_ID}/campaigns`,
    { name: "c", objective: "CLICKS", daily_budget_dollars: 50, start_time: "2026-12-01T00:00:00Z" },
  ],
  [
    "reddit_ads_create_ad_group",
    `/ad_accounts/${FAKE_ACCOUNT_ID}/ad_groups`,
    { campaign_id: "c1", name: "g", start_time: "2026-12-01T00:00:00Z" },
  ],
  [
    "reddit_ads_create_ad",
    `/ad_accounts/${FAKE_ACCOUNT_ID}/ads`,
    { ad_group_id: "g1", name: "a", headline: "h", click_url: "https://example.com" },
  ],
];

describe("a create that fails with a 5xx", () => {
  it.each(CREATES)("%s is sent exactly once", async (tool, path, args) => {
    const result: any = await client.callTool({ name: tool, arguments: { account_id: FAKE_ACCOUNT_ID, ...args } });

    expect(result.isError).toBe(true);
    expect(api.apiRequests.filter((r) => r.method === "POST" && r.path === path)).toHaveLength(1);
  }, 20_000);
});

describe("a read that fails with a 5xx", () => {
  it("is still retried (the fake 503 drives the retry policy)", async () => {
    const result: any = await client.callTool({
      name: "reddit_ads_get_campaigns",
      arguments: { account_id: FAKE_ACCOUNT_ID },
    });

    expect(result.isError).toBe(true);
    expect(api.apiRequests.length).toBeGreaterThan(1);
  }, 20_000);
});
