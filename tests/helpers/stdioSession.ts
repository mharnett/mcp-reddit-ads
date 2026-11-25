/**
 * Drive the built entrypoint (dist/index.js) over raw pipes, the way an MCP
 * client starts it, and keep the exact bytes it writes to stdout.
 *
 * Raw pipes on purpose: the SDK client drops stdout lines it can't parse and
 * re-parses the rest, so it can't show what actually went over the wire.
 *
 * Containment: tests/fixtures/no-network.mjs is preloaded, so every fetch in
 * the child rejects (the startup auth check, the API and the npm update
 * check). The credentials are fakes and the token request never succeeds, so
 * the Keychain-persist branch cannot run.
 */

import { spawn } from "child_process";
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "path";
import { pathToFileURL } from "url";

import { FAKE_ENV } from "./fakeRedditApi.js";

const ROOT = resolve(__dirname, "..", "..");
const ENTRY = resolve(ROOT, "dist/index.js");
const NO_NETWORK = pathToFileURL(resolve(ROOT, "tests/fixtures/no-network.mjs")).href;

/** One JSON-RPC request. */
export interface Step {
  method: string;
  params?: unknown;
}

export interface SessionResult {
  /** Every non-empty stdout line, unparsed. */
  stdoutLines: string[];
  /** The stdout line that answered each step, in step order; undefined if it never answered. */
  answers: Array<string | undefined>;
  stderr: string;
  /** True if the server exited before every step was answered. */
  exitedEarly: boolean;
}

export interface SessionOptions {
  env?: Record<string, string>;
  protocolVersion?: string;
}

/** initialize is always sent first and is answers[0]; the steps follow one at a time. */
export function runStdioSession(steps: Step[], options: SessionOptions = {}): Promise<SessionResult> {
  const script: Step[] = [
    {
      method: "initialize",
      params: {
        protocolVersion: options.protocolVersion ?? "2024-11-05",
        capabilities: {},
        clientInfo: { name: "stdio-session", version: "0.0.0" },
      },
    },
    ...steps,
  ];
  // NODE_ENV and REDDIT_ADS_MCP_WRITE are not in the SDK's default environment,
  // so vitest's NODE_ENV=test and a developer's exported write flag stay out.
  const env = { ...getDefaultEnvironment(), ...FAKE_ENV, MCP_DISABLE_UPDATE_CHECK: "1", ...options.env };

  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", NO_NETWORK, ENTRY], { env, stdio: ["pipe", "pipe", "pipe"] });
    const answers: Array<string | undefined> = script.map(() => undefined);
    let stdout = "";
    let stderr = "";
    let scanned = 0;
    let next = 0;
    let finished = false;

    const write = (message: object) => child.stdin.write(JSON.stringify(message) + "\n");
    const finish = () => {
      finished = true;
      // Quiet time first, so a late stdout line is caught too.
      setTimeout(() => {
        child.stdin.end();
        setTimeout(() => child.kill(), 1_000).unref();
      }, 300);
    };
    const sendNext = () => {
      if (next >= script.length) return finish();
      const { method, params } = script[next];
      next += 1;
      write({ jsonrpc: "2.0", id: next, method, ...(params === undefined ? {} : { params }) });
    };
    const giveUp = setTimeout(() => child.kill(), 25_000);

    child.stdin.on("error", () => {}); // EPIPE if the server exits early; the assertions report it
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      for (let nl = stdout.indexOf("\n", scanned); nl !== -1; nl = stdout.indexOf("\n", scanned)) {
        const line = stdout.slice(scanned, nl);
        scanned = nl + 1;
        const id = parseLine(line)?.id;
        if (typeof id !== "number" || id < 1 || id > script.length) continue;
        answers[id - 1] ??= line;
        if (id !== next) continue;
        if (id === 1) write({ jsonrpc: "2.0", method: "notifications/initialized" });
        sendNext();
      }
    });
    child.on("error", (err) => {
      stderr += `[spawn error] ${err.message}\n`;
    });
    child.on("close", () => {
      clearTimeout(giveUp);
      done({ stdoutLines: linesOf(stdout), answers, stderr, exitedEarly: !finished });
    });

    sendNext();
  });
}

export function linesOf(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

export function parseLine(line: string | undefined): any {
  if (line === undefined) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
