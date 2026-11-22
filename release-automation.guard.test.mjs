// ============================================
// CI guard: a release bumps server.json and publishes to npm with no manual
// step.
// ============================================
// server.json is the MCP registry listing. release-please rewrites only the
// files it is told about, so the listing kept the version it was first
// published with (1.0.1) while npm moved on to 1.1.x. extra-files in
// release-please-config.json now bumps every version field in it with each
// release. The action reads extra-files only in manifest mode. (2026-11-22)
//
// release-please creates its Release and pushes its Release PR branch with
// GITHUB_TOKEN, and events from that token start no other workflow, except
// workflow_dispatch. So release-please.yml dispatches publish.yml after a
// release and test.yml on each Release PR branch itself. Publishing stays in
// publish.yml because npm's Trusted Publisher is registered to that filename;
// a publish job inside release-please.yml would fail OIDC.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const REPO = path.dirname(fileURLToPath(import.meta.url));
const wf = (name) => path.join(REPO, ".github/workflows", name);
// A missing file reads as undefined, so each test fails on its own assertion.
const json = (name) => {
  const p = path.join(REPO, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : undefined;
};
// YAML with comment lines dropped, so prose about a step is not the step.
const code = (p) => readFileSync(p, "utf-8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

/** The job's steps, each as its own block of YAML, so a condition is checked on the step it guards. */
function stepsOf(yml) {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => /^\s*steps:\s*$/.test(l));
  const first = lines.slice(start + 1).find((l) => /^\s*- /.test(l)) ?? "";
  const indent = first.match(/^\s*/)[0];
  const blocks = [];
  for (const l of lines.slice(start + 1)) {
    if (l.startsWith(`${indent}- `)) blocks.push([l]);
    else if (blocks.length) blocks[blocks.length - 1].push(l);
  }
  return blocks.map((b) => b.join("\n"));
}

/** Every "version" field in a JSON value, with its concrete path ($.packages[0].version). */
function versionFields(value, at = "$") {
  if (Array.isArray(value)) return value.flatMap((v, i) => versionFields(v, `${at}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k === "version" ? [{ path: `${at}.${k}`, value: v }] : []),
      ...versionFields(v, `${at}.${k}`),
    ]);
  }
  return [];
}

/** Steps of a JSONPath in the plain $.a[*].b form release-please's json updater is given here. */
function pathSteps(p) {
  const step = /\.[A-Za-z_$][\w$]*|\[(?:\*|\d+)\]/g;
  if (!/^\$(?:\.[A-Za-z_$][\w$]*|\[(?:\*|\d+)\])*$/.test(p)) throw new Error(`unsupported JSONPath: ${p}`);
  return p.slice(1).match(step) ?? [];
}

/** Whether a jsonpath selects a concrete path; [*] selects any index. */
function selects(jsonpath, concrete) {
  const want = pathSteps(jsonpath);
  const got = pathSteps(concrete);
  return want.length === got.length && want.every((s, i) => s === got[i] || (s === "[*]" && /^\[\d+\]$/.test(got[i])));
}

describe("release-please bumps server.json with every release", () => {
  const config = json("release-please-config.json");
  const root = config?.packages?.["."] ?? {};
  const serverJson = (root["extra-files"] ?? []).filter((f) => typeof f === "object" && f.path === "server.json");
  const listing = json("server.json");
  const uncovered = (doc) => versionFields(doc).filter((f) => !serverJson.some((e) => selects(e.jsonpath, f.path)));

  it("runs release-please in manifest mode, the only mode that reads extra-files", () => {
    const yml = code(wf("release-please.yml"));
    expect(yml).toMatch(/config-file:\s*release-please-config\.json/);
    expect(yml).toMatch(/manifest-file:\s*\.release-please-manifest\.json/);
    expect(yml).not.toMatch(/release-type:/);
    expect(root["release-type"]).toBe("node");
  });

  it("lists server.json in extra-files as a json file with a jsonpath", () => {
    expect(serverJson.length).toBeGreaterThan(0);
    for (const entry of serverJson) {
      expect(entry.type).toBe("json");
      expect(() => pathSteps(entry.jsonpath)).not.toThrow();
    }
  });

  it("bumps every version field in server.json", () => {
    const paths = versionFields(listing).map((f) => f.path);
    expect(paths).toContain("$.version");
    expect(paths).toContain("$.packages[0].version");
    expect(uncovered(listing)).toEqual([]);
  });

  it("bumps a package added to server.json later", () => {
    const grown = { ...listing, packages: [...listing.packages, { registryType: "npm", version: "0.0.0" }] };
    expect(uncovered(grown)).toEqual([]);
  });

  it("matches jsonpaths by step, so a top-level path does not cover a package version", () => {
    expect(selects("$.version", "$.version")).toBe(true);
    expect(selects("$.version", "$.packages[0].version")).toBe(false);
    expect(selects("$.packages[*].version", "$.packages[3].version")).toBe(true);
    expect(selects("$.packages[0].version", "$.packages[1].version")).toBe(false);
  });

  it("keeps server.json in the layout release-please writes, so a Release PR changes only version lines", () => {
    // release-please re-serialises the file with JSON.stringify at its own indent.
    // It reads the blob from GitHub (LF); a Windows checkout may carry CRLF.
    const raw = readFileSync(path.join(REPO, "server.json"), "utf-8").replace(/\r\n/g, "\n");
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });

  it("server.json, package.json and the manifest name the same version", () => {
    const version = json("package.json").version;
    expect(json(".release-please-manifest.json")).toEqual({ ".": version });
    const fields = versionFields(listing);
    expect(fields.map((f) => [f.path, f.value])).toEqual(fields.map((f) => [f.path, version]));
  });
});

describe("release-please.yml starts the workflows GITHUB_TOKEN events cannot", () => {
  const yml = code(wf("release-please.yml"));
  const stepsRunning = (re) => stepsOf(yml).filter((s) => re.test(s));

  it("gives the release-please step an id so its outputs are readable", () => {
    const [step] = stepsRunning(/uses:\s*googleapis\/release-please-action@/);
    expect(step).toMatch(/id:\s*release\b/);
  });

  it("dispatches publish.yml with the release tag, only when a release was created", () => {
    const steps = stepsRunning(/gh workflow run publish\.yml/);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/-f ref=\$\{\{\s*steps\.release\.outputs\.tag_name\s*\}\}/);
    expect(steps[0]).toMatch(/if:\s*\$\{\{\s*steps\.release\.outputs\.release_created\s*\}\}/);
    expect(steps[0]).toMatch(/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  });

  it("dispatches test.yml on each Release PR branch, only when release-please opened or updated one", () => {
    const steps = stepsRunning(/gh workflow run test\.yml/);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatch(/if:\s*\$\{\{\s*steps\.release\.outputs\.prs_created\s*==\s*'true'\s*\}\}/);
    expect(steps[0]).toMatch(/PRS:\s*\$\{\{\s*steps\.release\.outputs\.prs\s*\}\}/);
    expect(steps[0]).toMatch(/headBranchName/);
    expect(steps[0]).toMatch(/gh workflow run test\.yml[^\n]*--ref "\$branch"/);
    expect(steps[0]).toMatch(/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  });

  it("grants actions: write so GITHUB_TOKEN may dispatch", () => {
    expect(yml).toMatch(/^\s*actions:\s*write\b/m);
  });

  it("does not publish to npm itself (Trusted Publisher is bound to publish.yml)", () => {
    expect(yml).not.toMatch(/npm publish/);
  });
});

describe("publish.yml and test.yml accept the dispatches", () => {
  it("publish.yml accepts workflow_dispatch with a ref input", () => {
    const yml = code(wf("publish.yml"));
    expect(yml).toMatch(/^\s*workflow_dispatch:/m);
    expect(yml).toMatch(/^\s*ref:/m);
  });

  it("test.yml accepts workflow_dispatch", () => {
    expect(code(wf("test.yml"))).toMatch(/^\s*workflow_dispatch:/m);
  });
});
