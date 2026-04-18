import { describe, expect, it } from "vitest";
import { checkForUpdate } from "./updateNotifier.js";

// Non-production env must not short-circuit the check when the test
// overrides env explicitly; otherwise vitest (NODE_ENV=test) would make
// every "newer available" case a no-op and hide real regressions.
const PROD_ENV = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

describe("checkForUpdate", () => {
  it("logs a stderr-style message when a newer version is available", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "1.0.0", {
      fetchLatestVersion: async () => "1.1.0",
      log: (m) => messages.push(m),
      env: PROD_ENV,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("1.1.0");
    expect(messages[0]).toContain("1.0.0");
    expect(messages[0]).toContain("mcp-example@latest");
  });

  it("is silent when installed version matches registry latest", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "1.1.0", {
      fetchLatestVersion: async () => "1.1.0",
      log: (m) => messages.push(m),
      env: PROD_ENV,
    });
    expect(messages).toEqual([]);
  });

  it("is silent when installed version is ahead of registry (dev build)", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "2.0.0", {
      fetchLatestVersion: async () => "1.1.0",
      log: (m) => messages.push(m),
      env: PROD_ENV,
    });
    expect(messages).toEqual([]);
  });

  it("is silent when the registry fetch throws (offline / timeout)", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "1.0.0", {
      fetchLatestVersion: async () => {
        throw new Error("ENOTFOUND registry.npmjs.org");
      },
      log: (m) => messages.push(m),
      env: PROD_ENV,
    });
    expect(messages).toEqual([]);
  });

  it("is silent when MCP_DISABLE_UPDATE_CHECK=1", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "1.0.0", {
      fetchLatestVersion: async () => "1.1.0",
      log: (m) => messages.push(m),
      env: { ...PROD_ENV, MCP_DISABLE_UPDATE_CHECK: "1" },
    });
    expect(messages).toEqual([]);
  });

  it("is silent when NODE_ENV=test (vitest runs)", async () => {
    const messages: string[] = [];
    await checkForUpdate("mcp-example", "1.0.0", {
      fetchLatestVersion: async () => "1.1.0",
      log: (m) => messages.push(m),
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });
    expect(messages).toEqual([]);
  });
});
