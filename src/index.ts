#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import {
  RedditAdsAuthError,
  RedditAdsRateLimitError,
  RedditAdsServiceError,
  classifyError,
  validateCredentials,
} from "./errors.js";
import { tools } from "./tools.js";
import { withResilience, safeResponse, logger } from "./resilience.js";
import v8 from "v8";

// CLI package info
const __cliPkg = JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "package.json"), "utf-8"));

// Log build fingerprint at startup
try {
  const __buildInfoDir = dirname(new URL(import.meta.url).pathname);
  const buildInfo = JSON.parse(readFileSync(join(__buildInfoDir, "build-info.json"), "utf-8"));
  console.error(`[build] SHA: ${buildInfo.sha} (${buildInfo.builtAt})`);
} catch {
  console.error(`[build] ${__cliPkg.name}@${__cliPkg.version} (dev mode)`);
}

// Version safety: warn if running a deprecated or dangerously old version
const __minimumSafeVersion = "1.0.5"; // minimum version with input sanitization
if (__cliPkg.version < __minimumSafeVersion) {
  console.error(`[WARNING] Running deprecated version ${__cliPkg.version}. Minimum safe version is ${__minimumSafeVersion}. Please upgrade.`);
}

// CLI flags
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.error(`${__cliPkg.name} v${__cliPkg.version}\n`);
  console.error(`Usage: ${__cliPkg.name} [options]\n`);
  console.error("MCP server communicating via stdio. Configure in your .mcp.json.\n");
  console.error("Options:");
  console.error("  --help, -h       Show this help message");
  console.error("  --version, -v    Show version number");
  console.error(`\nDocumentation: https://github.com/mharnett/mcp-reddit-ads`);
  process.exit(0);
}
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.error(__cliPkg.version);
  process.exit(0);
}

// Startup: detect npx vs direct node
if (process.argv[1]?.includes('.npm/_npx')) {
  console.error("[startup] Running via npx -- first run may be slow due to package resolution");
}

// Startup: check heap size
const heapLimit = v8.getHeapStatistics().heap_size_limit;
if (heapLimit < 256 * 1024 * 1024) {
  console.error(`[startup] WARNING: Heap limit is ${Math.round(heapLimit / 1024 / 1024)}MB`);
}

// ============================================
// ENV VAR TRIMMING
// ============================================

const envTrimmed = (key: string): string => (process.env[key] || "").trim().replace(/^["']|["']$/g, "");

// ============================================
// CONFIGURATION
// ============================================

interface Config {
  reddit_api: {
    base_url: string;
    auth: {
      client_id: string;
      client_secret: string;
      refresh_token: string;
      user_agent: string;
    };
  };
  defaults: {
    account_id: string;
    business_id: string;
    report_metrics: string[];
    date_range_days: number;
  };
}

function loadConfig(): Config {
  // Try config.json first
  const configPath = join(dirname(new URL(import.meta.url).pathname), "..", "config.json");
  let config: Config;

  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } else {
    // Build config entirely from env vars (see config.example.json for file-based setup)
    config = {
      reddit_api: {
        base_url: "https://ads-api.reddit.com/api/v3",
        auth: {
          client_id: "",
          client_secret: "",
          refresh_token: "",
          user_agent: "reddit-ad-mcp/1.0",
        },
      },
      defaults: {
        account_id: "",
        business_id: "",
        report_metrics: ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm"],
        date_range_days: 7,
      },
    };
  }

  // Environment overrides (always applied)
  if (process.env.REDDIT_CLIENT_ID) config.reddit_api.auth.client_id = envTrimmed("REDDIT_CLIENT_ID");
  if (process.env.REDDIT_CLIENT_SECRET) config.reddit_api.auth.client_secret = envTrimmed("REDDIT_CLIENT_SECRET");
  if (process.env.REDDIT_REFRESH_TOKEN) config.reddit_api.auth.refresh_token = envTrimmed("REDDIT_REFRESH_TOKEN");
  if (process.env.REDDIT_ACCOUNT_ID) config.defaults.account_id = envTrimmed("REDDIT_ACCOUNT_ID");

  return config;
}

// ============================================
// DATE HELPERS
// ============================================

function getDateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

// ============================================
// REDDIT ADS API CLIENT
// ============================================

class RedditAdsManager {
  private config: Config;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: Config) {
    this.config = config;

    const creds = validateCredentials();
    if (!creds.valid) {
      const msg = `[STARTUP ERROR] Missing required credentials: ${creds.missing.join(", ")}. MCP will not function. Check run-mcp.sh and Keychain entries.`;
      console.error(msg);
      throw new RedditAdsAuthError(msg);
    }
    console.error("[startup] Credentials validated: all required env vars present");
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = this.config.reddit_api.auth;
    const credentials = Buffer.from(`${auth.client_id}:${auth.client_secret}`).toString("base64");

    const resp = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "User-Agent": auth.user_agent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.refresh_token,
      }).toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const error = new Error(`OAuth token refresh failed: ${resp.status} ${text}`);
      (error as any).status = resp.status;
      throw classifyError(error);
    }

    const data = await resp.json() as any;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;

    return this.accessToken!;
  }

  private async apiCall(method: string, path: string, options?: {
    params?: Record<string, string>;
    body?: any;
  }): Promise<any> {
    const token = await this.getAccessToken();
    const auth = this.config.reddit_api.auth;

    let url = `${this.config.reddit_api.base_url}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(options.params).toString();
      if (qs) url += `?${qs}`;
    }

    const resp = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": auth.user_agent,
        "Content-Type": "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      const error = new Error(`Reddit API error: ${resp.status} ${text}`);
      (error as any).status = resp.status;
      throw classifyError(error);
    }

    return resp.json();
  }

  private resolveAccountId(accountId?: string): string {
    const id = accountId || this.config.defaults.account_id;
    if (!id) throw new Error("No account_id provided and no default configured");
    // Validate account_id format: Reddit account IDs use "t2_" prefix
    if (!id.startsWith("t2_")) {
      throw new Error(`Invalid account_id format: "${id}". Reddit account IDs must start with "t2_" prefix (e.g., "t2_abc123").`);
    }
    return id;
  }

  // ── Read operations ──────────────────────────────────────────────

  async getMe(): Promise<any> {
    return withResilience(() => this.apiCall("GET", "/me"), "getMe");
  }

  async getAccounts(): Promise<any> {
    return withResilience(async () => {
      const businesses = await this.apiCall("GET", "/me/businesses");
      if (businesses?.data?.length > 0) {
        const bizId = businesses.data[0].id;
        return this.apiCall("GET", `/businesses/${bizId}/ad_accounts`);
      }
      return { data: [], error: "No businesses found" };
    }, "getAccounts");
  }

  async getCampaigns(accountId: string): Promise<any> {
    return withResilience(
      () => this.apiCall("GET", `/ad_accounts/${accountId}/campaigns`),
      "getCampaigns",
    );
  }

  async getAdGroups(accountId: string, campaignId?: string): Promise<any> {
    const params: Record<string, string> = {};
    if (campaignId) params.campaign_id = campaignId;
    return withResilience(
      () => this.apiCall("GET", `/ad_accounts/${accountId}/ad_groups`, { params }),
      "getAdGroups",
    );
  }

  async getAds(accountId: string, adGroupId?: string): Promise<any> {
    const params: Record<string, string> = {};
    if (adGroupId) params.ad_group_id = adGroupId;
    return withResilience(
      () => this.apiCall("GET", `/ad_accounts/${accountId}/ads`, { params }),
      "getAds",
    );
  }

  async getReport(accountId: string, options: {
    startDate: string;
    endDate: string;
    fields?: string[];
    breakdowns?: string[];
  }): Promise<any> {
    const fields = options.fields || this.config.defaults.report_metrics;
    let startDate = options.startDate;
    let endDate = options.endDate;

    // Ensure ISO 8601 format
    if (!startDate.includes("T")) startDate = `${startDate}T00:00:00Z`;
    if (!endDate.includes("T")) endDate = `${endDate}T00:00:00Z`;

    const reportData: any = {
      starts_at: startDate,
      ends_at: endDate,
      fields,
    };
    if (options.breakdowns) {
      reportData.breakdowns = options.breakdowns;
    }

    return withResilience(
      () => this.apiCall("POST", `/ad_accounts/${accountId}/reports`, { body: { data: reportData } }),
      "getReport",
    );
  }

  // ── Write operations ─────────────────────────────────────────────

  async createCampaign(accountId: string, data: {
    name: string;
    objective: string;
    dailyBudgetMicro: number;
    startTime: string;
    endTime?: string;
    configuredStatus?: string;
  }): Promise<any> {
    const body: any = {
      name: data.name,
      objective: data.objective,
      goal_type: "DAILY_SPEND",
      goal_value: data.dailyBudgetMicro,
      start_time: data.startTime,
      configured_status: data.configuredStatus || "PAUSED",
    };
    if (data.endTime) body.end_time = data.endTime;

    return withResilience(
      () => this.apiCall("POST", `/ad_accounts/${accountId}/campaigns`, { body: { data: body } }),
      "createCampaign",
    );
  }

  async updateCampaign(campaignId: string, updates: Record<string, any>): Promise<any> {
    return withResilience(
      () => this.apiCall("PUT", `/campaigns/${campaignId}`, { body: { data: updates } }),
      "updateCampaign",
    );
  }

  async createAdGroup(accountId: string, data: {
    campaignId: string;
    name: string;
    bidMicro: number;
    startTime: string;
    endTime?: string;
    target?: Record<string, any>;
    bidStrategy?: string;
    configuredStatus?: string;
    optimizationGoal?: string;
  }): Promise<any> {
    const body: any = {
      campaign_id: data.campaignId,
      name: data.name,
      bid_type: data.bidStrategy || "CPM",
      bid_value: data.bidMicro,
      start_time: data.startTime,
      configured_status: data.configuredStatus || "PAUSED",
    };
    if (data.endTime) body.end_time = data.endTime;
    if (data.target) body.targeting = data.target;
    if (data.optimizationGoal) body.optimization_goal = data.optimizationGoal;

    return withResilience(
      () => this.apiCall("POST", `/ad_accounts/${accountId}/ad_groups`, { body: { data: body } }),
      "createAdGroup",
    );
  }

  async updateAdGroup(adGroupId: string, updates: Record<string, any>): Promise<any> {
    return withResilience(
      () => this.apiCall("PUT", `/ad_groups/${adGroupId}`, { body: { data: updates } }),
      "updateAdGroup",
    );
  }

  async createAd(accountId: string, data: {
    adGroupId: string;
    name: string;
    headline?: string;
    clickUrl?: string;
    thumbnailUrl?: string;
    bodyText?: string;
    callToAction?: string;
    configuredStatus?: string;
    creativeType?: string;
    videoUrl?: string;
    postUrl?: string;
  }): Promise<any> {
    const adData: any = {
      ad_group_id: data.adGroupId,
      name: data.name,
      configured_status: data.configuredStatus || "PAUSED",
    };
    if (data.headline) adData.headline = data.headline;
    if (data.clickUrl) adData.click_url = data.clickUrl;
    if (data.thumbnailUrl) adData.thumbnail_url = data.thumbnailUrl;
    if (data.bodyText) adData.body = data.bodyText;
    if (data.callToAction) adData.call_to_action = data.callToAction;
    if (data.creativeType) adData.creative_type = data.creativeType;
    if (data.videoUrl) adData.video_url = data.videoUrl;
    if (data.postUrl) adData.post_url = data.postUrl;

    return withResilience(
      () => this.apiCall("POST", `/ad_accounts/${accountId}/ads`, { body: { data: adData } }),
      "createAd",
    );
  }

  async updateAd(adId: string, updates: Record<string, any>): Promise<any> {
    return withResilience(
      () => this.apiCall("PUT", `/ads/${adId}`, { body: { data: updates } }),
      "updateAd",
    );
  }

  // ── Targeting ────────────────────────────────────────────────────

  async searchSubreddits(query: string): Promise<any> {
    return withResilience(
      () => this.apiCall("GET", "/targeting/subreddits", { params: { query } }),
      "searchSubreddits",
    );
  }

  async getInterestCategories(): Promise<any> {
    return withResilience(
      () => this.apiCall("GET", "/targeting/interests"),
      "getInterestCategories",
    );
  }

  async searchGeoTargets(query?: string): Promise<any> {
    const params: Record<string, string> = {};
    if (query) params.query = query;
    return withResilience(
      () => this.apiCall("GET", "/targeting/geos", { params }),
      "searchGeoTargets",
    );
  }

  getDefaultAccountId(): string | null {
    return this.config.defaults.account_id || null;
  }
}

// ============================================
// MCP SERVER
// ============================================

const config = loadConfig();
const adsManager = new RedditAdsManager(config);

const server = new Server(
  { name: __cliPkg.name, version: __cliPkg.version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const ok = (data: any) => ({
    content: [{ type: "text" as const, text: JSON.stringify(safeResponse(data, name), null, 2) }],
  });

  try {
    const accountId = () => {
      const id = args?.account_id as string | undefined;
      if (id) return id;
      const def = adsManager.getDefaultAccountId();
      if (def) return def;
      throw new Error("No account_id provided and no default configured");
    };

    switch (name) {
      // ── Context ──
      case "reddit_ads_get_client_context": {
        const acctId = accountId();
        const me = await adsManager.getMe();
        const campaigns = await adsManager.getCampaigns(acctId);
        const campaignData = (campaigns?.data || []) as any[];
        const active = campaignData.filter((c: any) => c.configured_status === "ACTIVE");
        return ok({
          account_id: acctId,
          user: me?.data || {},
          total_campaigns: campaignData.length,
          active_campaigns: active.length,
          active_campaign_names: active.map((c: any) => c.name),
          status: "connected",
        });
      }

      // ── Read ──
      case "reddit_ads_get_accounts":
        return ok(await adsManager.getAccounts());

      case "reddit_ads_get_campaigns":
        return ok(await adsManager.getCampaigns(accountId()));

      case "reddit_ads_get_ad_groups":
        return ok(await adsManager.getAdGroups(accountId(), args?.campaign_id as string));

      case "reddit_ads_get_ads":
        return ok(await adsManager.getAds(accountId(), args?.ad_group_id as string));

      case "reddit_ads_get_performance_report": {
        const acctId = accountId();
        const { startDate, endDate } = args?.start_date && args?.end_date
          ? { startDate: args.start_date as string, endDate: args.end_date as string }
          : getDateRange(7);
        return ok(await adsManager.getReport(acctId, {
          startDate,
          endDate,
          fields: args?.fields as string[],
          breakdowns: args?.breakdowns as string[],
        }));
      }

      case "reddit_ads_get_daily_performance": {
        const acctId = accountId();
        const days = (args?.days as number) || 7;
        const { startDate, endDate } = getDateRange(days);
        return ok(await adsManager.getReport(acctId, {
          startDate,
          endDate,
          fields: ["impressions", "clicks", "spend", "ctr", "cpc"],
          breakdowns: ["date"],
        }));
      }

      // ── Write: Campaigns ──
      case "reddit_ads_create_campaign": {
        const acctId = accountId();
        // Note: floating point precision -- 19.99 * 1000000 = 19989999.999999996. Math.round handles this.
        // Reddit API expects micro currency (1/1,000,000 of a dollar).
        const budgetMicro = Math.round((args?.daily_budget_dollars as number) * 1_000_000);
        // Safe by default: force PAUSED on create, ignore configured_status from args.
        // Use reddit_ads_update_campaign to activate after review.
        if (args?.configured_status && (args.configured_status as string) !== "PAUSED") {
          logger.warn({ requested: args.configured_status }, "Overriding configured_status to PAUSED for safety -- use update_campaign to activate");
        }
        return ok(await adsManager.createCampaign(acctId, {
          name: args?.name as string,
          objective: args?.objective as string,
          dailyBudgetMicro: budgetMicro,
          startTime: args?.start_time as string,
          endTime: args?.end_time as string,
          configuredStatus: "PAUSED", // force PAUSED -- override any user-supplied status
        }));
      }

      case "reddit_ads_update_campaign": {
        const updates: Record<string, any> = {};
        if (args?.name != null) updates.name = args.name;
        if (args?.daily_budget_dollars != null) updates.daily_budget_micro = Math.round((args.daily_budget_dollars as number) * 1_000_000);
        if (args?.configured_status != null) updates.configured_status = args.configured_status;
        if (args?.end_time != null) updates.end_time = args.end_time;
        return ok(await adsManager.updateCampaign(args?.campaign_id as string, updates));
      }

      // ── Write: Ad Groups ──
      case "reddit_ads_create_ad_group": {
        const acctId = accountId();
        const bidMicro = Math.round((args?.bid_dollars as number) * 1_000_000);
        const target: Record<string, any> = {};
        if (args?.subreddit_names) target.communities = args.subreddit_names;
        if (args?.interest_ids) target.interests = args.interest_ids;
        if (args?.geo_country_codes) target.geos = (args.geo_country_codes as string[]).map(c => ({ country: c }));
        if (args?.device_types) target.devices = args.device_types;

        // Safe by default: force PAUSED on create
        if (args?.configured_status && (args.configured_status as string) !== "PAUSED") {
          logger.warn({ requested: args.configured_status }, "Overriding configured_status to PAUSED for safety -- use update_ad_group to activate");
        }
        return ok(await adsManager.createAdGroup(acctId, {
          campaignId: args?.campaign_id as string,
          name: args?.name as string,
          bidMicro,
          startTime: args?.start_time as string,
          endTime: args?.end_time as string,
          target: Object.keys(target).length > 0 ? target : undefined,
          bidStrategy: (args?.bid_strategy as string) || "CPM",
          configuredStatus: "PAUSED", // force PAUSED -- override any user-supplied status
          optimizationGoal: args?.optimization_goal as string,
        }));
      }

      case "reddit_ads_update_ad_group": {
        const updates: Record<string, any> = {};
        if (args?.name != null) updates.name = args.name;
        if (args?.bid_dollars != null) updates.bid_micro = Math.round((args.bid_dollars as number) * 1_000_000);
        if (args?.configured_status != null) updates.configured_status = args.configured_status;
        if (args?.end_time != null) updates.end_time = args.end_time;
        return ok(await adsManager.updateAdGroup(args?.ad_group_id as string, updates));
      }

      // ── Write: Ads ──
      case "reddit_ads_create_ad": {
        const acctId = accountId();
        return ok(await adsManager.createAd(acctId, {
          adGroupId: args?.ad_group_id as string,
          name: args?.name as string,
          headline: args?.headline as string,
          clickUrl: args?.click_url as string,
          thumbnailUrl: args?.thumbnail_url as string,
          bodyText: args?.body_text as string,
          callToAction: (args?.call_to_action as string) || "LEARN_MORE",
          configuredStatus: (args?.configured_status as string) || "PAUSED",
          creativeType: (args?.creative_type as string) || "IMAGE",
          videoUrl: args?.video_url as string,
          postUrl: args?.post_url as string,
        }));
      }

      case "reddit_ads_update_ad": {
        const updates: Record<string, any> = {};
        if (args?.name != null) updates.name = args.name;
        if (args?.headline != null) updates.headline = args.headline;
        if (args?.click_url != null) updates.click_url = args.click_url;
        if (args?.configured_status != null) updates.configured_status = args.configured_status;
        if (args?.call_to_action != null) updates.call_to_action = args.call_to_action;
        return ok(await adsManager.updateAd(args?.ad_id as string, updates));
      }

      // ── Bulk status ──
      case "reddit_ads_pause_items":
      case "reddit_ads_enable_items": {
        const statusValue = name === "reddit_ads_pause_items" ? "PAUSED" : "ACTIVE";
        const itemType = args?.item_type as string;
        const itemIds = args?.item_ids as string[];

        const updateFn: Record<string, (id: string, updates: any) => Promise<any>> = {
          CAMPAIGN: (id, u) => adsManager.updateCampaign(id, u),
          AD_GROUP: (id, u) => adsManager.updateAdGroup(id, u),
          AD: (id, u) => adsManager.updateAd(id, u),
        };

        const fn = updateFn[itemType];
        if (!fn) return ok({ error: `Invalid item_type: ${itemType}. Use CAMPAIGN, AD_GROUP, or AD.` });

        const results = [];
        for (const itemId of itemIds) {
          try {
            const result = await fn(itemId, { configured_status: statusValue });
            results.push({ id: itemId, status: statusValue.toLowerCase(), result });
          } catch (e: any) {
            results.push({ id: itemId, status: "error", error: e.message });
          }
        }
        return ok(results);
      }

      // ── Targeting ──
      case "reddit_ads_search_subreddits":
        return ok(await adsManager.searchSubreddits(args?.query as string));

      case "reddit_ads_get_interest_categories":
        return ok(await adsManager.getInterestCategories());

      case "reddit_ads_search_geo_targets":
        return ok(await adsManager.searchGeoTargets(args?.query as string));

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (rawError: any) {
    const error = classifyError(rawError);
    logger.error({ error_type: error.name, message: error.message }, "Tool call failed");

    const response: Record<string, unknown> = {
      error: true,
      error_type: error.name,
      message: error.message,
      server: __cliPkg.name,
    };

    if (error instanceof RedditAdsAuthError) {
      response.action_required = "Re-authenticate: refresh token may be expired. Run oauth_flow.py and update Keychain.";
    } else if (error instanceof RedditAdsRateLimitError) {
      response.retry_after_ms = error.retryAfterMs;
      response.action_required = `Rate limited. Retry after ${Math.ceil(error.retryAfterMs / 1000)} seconds.`;
    } else if (error instanceof RedditAdsServiceError) {
      response.action_required = "Reddit API server error. This is transient - retry in a few minutes.";
    } else {
      response.details = rawError.stack;
    }

    // Size-limit error responses through safeResponse to prevent oversized payloads
    const safeErrorResponse = safeResponse(response, "error");
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(safeErrorResponse, null, 2) }],
    };
  }
});

// Start server
async function main() {
  try {
    const me = await adsManager.getMe();
    console.error(`[startup] Auth verified: logged in as ${me?.data?.username || "unknown"}`);
  } catch (err: any) {
    console.error(`[STARTUP WARNING] Auth check FAILED: ${err.message}`);
    console.error(`[STARTUP WARNING] MCP will start but API calls may fail until auth is fixed.`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[startup] MCP Reddit Ads server running");
}

process.on("SIGTERM", () => {
  console.error("[shutdown] SIGTERM received, exiting");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.error("[shutdown] SIGINT received, exiting");
  process.exit(0);
});

process.on("SIGPIPE", () => {
  // Client disconnected -- expected during shutdown
});

process.on("unhandledRejection", (reason) => {
  console.error("[error] Unhandled promise rejection:", reason);
});

main().catch(console.error);
