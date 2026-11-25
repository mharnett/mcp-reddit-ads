/**
 * Write gate at the call site: drives the real tools/list and tools/call
 * handlers that src/index.ts registers, over an in-memory MCP transport.
 *
 * writeGate.test.ts proves assertWriteAllowed() and filterTools() work, but
 * it imports only tools.js, so deleting either call from src/index.ts left
 * every test green (review 2026-11-14). Here every WRITE_TOOLS name is called
 * through the server with REDDIT_ADS_MCP_WRITE unset and must be refused
 * before any request leaves the process.
 *
 * Containment: fetch is a recording fake (tests/helpers/fakeRedditApi.ts)
 * that never calls the network, child_process is replaced so the Keychain
 * branch cannot run, and the npm update check is mocked out.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

import { createRecordingFetch, FAKE_ACCOUNT_ID, FAKE_ENV } from "../tests/helpers/fakeRedditApi.js";
import { bodyOf, connectInMemory } from "../tests/helpers/connect.js";
import { WRITE_TOOLS, WRITE_DISABLED_MESSAGE } from "./writeGate.js";
import { tools } from "./tools.js";

vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));
vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFileSync: () => {
    throw new Error("child_process is disabled in this test");
  },
}));

const api = createRecordingFetch();
const WRITE_TOOL_NAMES = [...WRITE_TOOLS].sort();

/** The bare call, and the most dangerous call: ACTIVE status, real-looking ids. */
const ARG_SHAPES: Array<[string, Record<string, unknown>]> = [
  ["bare", { account_id: FAKE_ACCOUNT_ID }],
  [
    "loaded",
    {
      account_id: FAKE_ACCOUNT_ID,
      configured_status: "ACTIVE",
      campaign_id: "c1",
      ad_group_id: "g1",
      ad_id: "a1",
      item_type: "CAMPAIGN",
      item_ids: ["c1", "c2"],
      name: "gate test",
      objective: "CLICKS",
      daily_budget_dollars: 50,
      start_time: "2026-12-01T00:00:00Z",
    },
  ],
];

let client: Client;
let fetchCallsDuringImport = -1;

beforeAll(async () => {
  vi.stubGlobal("fetch", api.fetch);
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("REDDIT_ADS_MCP_WRITE", undefined);
  const { server } = await import("./index.js");
  await new Promise((r) => setTimeout(r, 50));
  fetchCallsDuringImport = api.total;
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

afterEach(() => {
  vi.stubEnv("REDDIT_ADS_MCP_WRITE", undefined);
});

it("importing index.js does not start the server or call Reddit", () => {
  expect(fetchCallsDuringImport).toBe(0);
});

describe("write gate at the CallTool dispatch (REDDIT_ADS_MCP_WRITE unset)", () => {
  it("covers every create, update, pause and enable tool", () => {
    expect(WRITE_TOOL_NAMES.length).toBe(8);
  });

  describe.each(ARG_SHAPES)("%s arguments", (_shape, args) => {
    it.each(WRITE_TOOL_NAMES)("%s is refused before any Reddit request", async (name) => {
      const result: any = await client.callTool({ name, arguments: args });

      expect(result.isError).toBe(true);
      expect(bodyOf(result).message).toBe(`Tool "${name}" is a write operation. ${WRITE_DISABLED_MESSAGE}`);
      expect(api.total).toBe(0);
    });
  });

  it("hides every write tool from tools/list and keeps every read tool", async () => {
    const { tools: listed } = await client.listTools();
    const names = listed.map((t) => t.name);
    expect(names.filter((n) => WRITE_TOOLS.has(n))).toEqual([]);
    expect(names.sort()).toEqual(tools.map((t) => t.name).filter((n) => !WRITE_TOOLS.has(n)).sort());
  });

  it("still lets a read tool through to the Reddit API (the fake is on the dispatch path)", async () => {
    const result: any = await client.callTool({
      name: "reddit_ads_get_campaigns",
      arguments: { account_id: FAKE_ACCOUNT_ID },
    });

    expect(result.isError).toBeFalsy();
    expect(api.apiRequests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /ad_accounts/${FAKE_ACCOUNT_ID}/campaigns`,
    ]);
  });
});

describe("write gate open (REDDIT_ADS_MCP_WRITE=true)", () => {
  beforeEach(() => {
    vi.stubEnv("REDDIT_ADS_MCP_WRITE", "true");
  });

  it("lists every tool, write tools included", async () => {
    const { tools: listed } = await client.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it("lets a write tool through to the Reddit API", async () => {
    const result: any = await client.callTool({
      name: "reddit_ads_update_campaign",
      arguments: { account_id: FAKE_ACCOUNT_ID, campaign_id: "c1", name: "renamed" },
    });

    expect(result.isError).toBeFalsy();
    expect(api.apiRequests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `PATCH /ad_accounts/${FAKE_ACCOUNT_ID}/campaigns/c1`,
    ]);
  });

  // SDK 1.x validates a task call's result only after the handler has run, so
  // a write that got that far would land and then report an error, inviting a
  // retry. The server declares no tasks capability, so it must be refused first.
  it("refuses a task-augmented write before any Reddit request", async () => {
    const asTask = client.request(
      {
        method: "tools/call",
        params: {
          name: "reddit_ads_update_campaign",
          arguments: { account_id: FAKE_ACCOUNT_ID, campaign_id: "c1", name: "renamed" },
          task: { ttl: 60_000 },
        },
      },
      CallToolResultSchema,
    );

    await expect(asTask).rejects.toThrow();
    expect(api.total).toBe(0);
  });
});
