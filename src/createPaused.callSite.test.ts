/**
 * Force-PAUSED on create, read off the request body each create tool sends.
 *
 * create_campaign and create_ad_group already overrode configured_status to
 * PAUSED, but nothing tested it, and create_ad passed a caller's "ACTIVE"
 * straight through, so a new ad in a live ad group went live on create
 * (review 2026-11-14). Every create must reach Reddit as PAUSED whatever the
 * caller sends; activation goes through update_* or enable_items.
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

beforeEach(() => {
  api.reset();
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

async function createdStatus(tool: string, path: string, args: Record<string, unknown>): Promise<unknown> {
  const result: any = await client.callTool({ name: tool, arguments: { account_id: FAKE_ACCOUNT_ID, ...args } });
  expect(result.isError).toBeFalsy();
  const posts = api.apiRequests.filter((r) => r.method === "POST" && r.path === path);
  expect(posts).toHaveLength(1);
  return posts[0].body.data.configured_status;
}

describe.each(CREATES)("%s", (tool, path, args) => {
  it.each([["ACTIVE"], ["active"], ["PAUSED"]])("sends PAUSED when the caller asks for %s", async (status) => {
    expect(await createdStatus(tool, path, { ...args, configured_status: status })).toBe("PAUSED");
  });

  it("sends PAUSED when the caller leaves the status out", async () => {
    expect(await createdStatus(tool, path, args)).toBe("PAUSED");
  });

  it("still rejects a status that is neither ACTIVE nor PAUSED, without a request", async () => {
    const result: any = await client.callTool({
      name: tool,
      arguments: { account_id: FAKE_ACCOUNT_ID, ...args, configured_status: "DELETED" },
    });
    expect(JSON.parse(result.content[0].text).error).toMatch(/Invalid configured_status/);
    expect(api.apiRequests).toEqual([]);
  });
});

describe("activation still works through the update path", () => {
  it("update_ad passes ACTIVE through", async () => {
    await client.callTool({
      name: "reddit_ads_update_ad",
      arguments: { account_id: FAKE_ACCOUNT_ID, ad_id: "a1", configured_status: "ACTIVE" },
    });
    expect(api.apiRequests.map((r) => [r.method, r.path, r.body.data.configured_status])).toEqual([
      ["PATCH", `/ad_accounts/${FAKE_ACCOUNT_ID}/ads/a1`, "ACTIVE"],
    ]);
  });
});
