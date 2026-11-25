/**
 * What an MCP client sees on the wire, byte for byte, so an SDK upgrade can't
 * change the tool surface without a visible diff.
 *
 * tests/fixtures/tools-list.*.json are the raw `result` of tools/list from the
 * server built on @modelcontextprotocol/sdk 0.5.0, captured before the move to
 * 1.x. After an intended change to src/tools.ts, replace them with the new
 * result and review the diff: it is what npm users get.
 *
 * Containment: see tests/helpers/stdioSession.ts. Every fetch in the spawned
 * server rejects and the credentials are fakes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve } from "path";

import { WRITE_DISABLED_MESSAGE, WRITE_TOOLS } from "../src/writeGate.js";
import { FAKE_ACCOUNT_ID, TOKEN_URL } from "./helpers/fakeRedditApi.js";
import { parseLine, runStdioSession, type Step } from "./helpers/stdioSession.js";

const TEST_TIMEOUT_MS = 30_000;
const WRITE_MODE = { REDDIT_ADS_MCP_WRITE: "true" };

const snapshot = (name: string): string =>
  readFileSync(resolve(__dirname, "fixtures", `tools-list.${name}.json`), "utf8").trimEnd();
const toolsListLine = (name: string): string => `{"result":${snapshot(name)},"jsonrpc":"2.0","id":2}`;

const toolsList: Step = { method: "tools/list", params: {} };
const call = (name: string, args?: unknown): Step => ({ method: "tools/call", params: { name, arguments: args } });

describe("initialize and tools/list", () => {
  // SDK 0.5.0 answered 2024-11-05 to every one of these.
  it.each(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"])(
    "protocol %s: negotiated as asked, read-only tool list byte-identical",
    async (protocolVersion) => {
      const { answers, stderr } = await runStdioSession([toolsList], { protocolVersion });

      expect(parseLine(answers[0])?.result, stderr).toMatchObject({
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "mcp-reddit-ads" },
      });
      expect(answers[1]).toBe(toolsListLine("read-only"));
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "write mode: tool list byte-identical",
    async () => {
      const { answers } = await runStdioSession([toolsList], { env: WRITE_MODE });
      expect(answers[1]).toBe(toolsListLine("write-enabled"));
    },
    TEST_TIMEOUT_MS,
  );
});

describe("write gate on the built server (REDDIT_ADS_MCP_WRITE unset)", () => {
  it(
    "refuses every write tool over stdio, whatever the arguments",
    async () => {
      const names = [...WRITE_TOOLS].sort();
      expect(names.length).toBe(8);
      const loaded = {
        account_id: FAKE_ACCOUNT_ID,
        configured_status: "ACTIVE",
        campaign_id: "c1",
        ad_group_id: "g1",
        ad_id: "a1",
        item_type: "CAMPAIGN",
        item_ids: ["c1"],
        name: "gate test",
        daily_budget_dollars: 50,
      };

      const { answers, stderr } = await runStdioSession(names.map((name) => call(name, loaded)));

      const refusals = answers.slice(1).map((line) => {
        const result = parseLine(line)?.result;
        return { isError: result?.isError, message: JSON.parse(result?.content?.[0]?.text ?? "{}").message };
      });
      expect(refusals, stderr).toEqual(
        names.map((name) => ({ isError: true, message: `Tool "${name}" is a write operation. ${WRITE_DISABLED_MESSAGE}` })),
      );
    },
    TEST_TIMEOUT_MS,
  );
});

describe("stdout through a session of failures", () => {
  it(
    "carries one JSON-RPC answer per request and nothing else, and the server survives malformed calls",
    async () => {
      const steps: Step[] = [
        { method: "ping" },
        call("reddit_ads_get_campaigns", {}),
        call("no_such_tool", {}),
        { method: "tools/call", params: { arguments: {} } },
        call("reddit_ads_get_campaigns", "not-an-object"),
        { method: "resources/list", params: {} },
        { method: "no/such/method" },
        toolsList,
      ];

      const { stdoutLines, answers, stderr, exitedEarly } = await runStdioSession(steps, {
        protocolVersion: "2025-11-25",
        env: { LOG_LEVEL: "debug" },
      });

      expect(exitedEarly, stderr).toBe(false);
      expect(stdoutLines.filter((line) => parseLine(line)?.jsonrpc !== "2.0")).toEqual([]);
      expect(stdoutLines.map((line) => parseLine(line).id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const [, ping, networkError, unknownTool, noName, badArguments, resources, unknownMethod, listed] = answers.map(parseLine);
      expect(ping.result).toEqual({});
      // The read tool got past the gate and failed at the stubbed token request.
      expect(networkError.result.isError).toBe(true);
      expect(JSON.parse(networkError.result.content[0].text).message).toContain(TOKEN_URL);
      expect(unknownTool.result.isError).toBe(true);
      expect(JSON.parse(unknownTool.result.content[0].text).message).toBe("Unknown tool: no_such_tool");
      // A call the SDK can't parse is a protocol error, as it was on 0.5.0.
      expect(noName.error.code).toBe(-32603);
      expect(badArguments.error.code).toBe(-32603);
      expect(resources.error.code).toBe(-32601);
      expect(unknownMethod.error.code).toBe(-32601);
      expect(listed.result.tools.length).toBe(JSON.parse(snapshot("read-only")).tools.length);
      // The failures were logged, to stderr.
      expect(stderr).toContain('"msg":"Tool call failed"');
    },
    TEST_TIMEOUT_MS,
  );
});

describe("the zod the SDK loads", () => {
  // SDK 1.x accepts zod "^3.25 || ^4.0" and imports its zod/v4 build, so bumping
  // only the SDK over an older lockfile keeps zod 3.25 and starts loading the
  // array parser GHSA-mrhx-c7xc-m3w5 is about (fixed in 4.6.6).
  it("is at or past 4.6.6", () => {
    const sdkTypes = createRequire(import.meta.url).resolve("@modelcontextprotocol/sdk/types.js");
    const { version } = createRequire(sdkTypes)("zod/package.json");
    const [major, minor, patch] = version.split(".").map(Number);
    expect(major * 1e6 + minor * 1e3 + patch, `zod ${version}`).toBeGreaterThanOrEqual(4_006_006);
  });
});
