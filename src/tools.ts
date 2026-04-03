import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const tools: Tool[] = [
  {
    name: "reddit_ads_get_client_context",
    description:
      "Get a quick overview of the Reddit Ads account. Returns account info and active campaign count.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: {
          type: "string",
          description: "Ad account ID. Uses default if not provided.",
        },
      },
    },
  },
  {
    name: "reddit_ads_get_accounts",
    description:
      "List all Reddit ad accounts accessible to this user.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "reddit_ads_get_campaigns",
    description:
      "List all campaigns for a Reddit ad account.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: {
          type: "string",
          description: "Ad account ID. Uses default if not provided.",
        },
      },
    },
  },
  {
    name: "reddit_ads_get_ad_groups",
    description:
      "List ad groups for a Reddit ad account, optionally filtered by campaign.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        campaign_id: { type: "string", description: "Optional - filter to a specific campaign." },
      },
    },
  },
  {
    name: "reddit_ads_get_ads",
    description:
      "List ads for a Reddit ad account, optionally filtered by ad group.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        ad_group_id: { type: "string", description: "Optional - filter to a specific ad group." },
      },
    },
  },
  {
    name: "reddit_ads_get_performance_report",
    description:
      "Get a performance report for Reddit ads. Spend values are in microcurrency (divide by 1,000,000 for dollars).",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to 7 days ago." },
        end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        fields: {
          type: "array",
          items: { type: "string" },
          description:
            "Metric fields. Defaults to impressions, clicks, spend, ctr, cpc, ecpm. Available: impressions, reach, clicks, spend, ecpm, ctr, cpc, video_watched_25/50/75/100_percent, conversion_purchase_clicks, etc.",
        },
        breakdowns: {
          type: "array",
          items: { type: "string" },
          description: "Breakdown dimensions: ad_id, campaign_id, ad_group_id, date, country, region, community, placement, device_os.",
        },
      },
    },
  },
  {
    name: "reddit_ads_get_daily_performance",
    description:
      "Get daily performance breakdown for the last N days. Convenience tool with date breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        days: { type: "number", description: "Number of days to look back. Defaults to 7." },
      },
    },
  },
  {
    name: "reddit_ads_create_campaign",
    description:
      "Create a new Reddit ad campaign. Created as PAUSED by default for safety.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name." },
        objective: {
          type: "string",
          description: "Campaign objective: CONVERSIONS, TRAFFIC, AWARENESS, VIDEO_VIEWS, APP_INSTALLS, CONSIDERATION.",
        },
        daily_budget_dollars: { type: "number", description: "Daily budget in dollars (e.g. 50.00 for $50/day)." },
        start_time: { type: "string", description: "Start datetime in ISO 8601 (e.g. 2026-03-17T00:00:00Z)." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        end_time: { type: "string", description: "Optional end datetime in ISO 8601." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED. Defaults to PAUSED." },
      },
      required: ["name", "objective", "daily_budget_dollars", "start_time"],
    },
  },
  {
    name: "reddit_ads_update_campaign",
    description:
      "Update an existing Reddit campaign. Only pass fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "The campaign ID to update." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        name: { type: "string", description: "New campaign name." },
        daily_budget_dollars: { type: "number", description: "New daily budget in dollars." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED." },
        end_time: { type: "string", description: "New end datetime in ISO 8601." },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "reddit_ads_create_ad_group",
    description:
      "Create an ad group within a campaign. Created as PAUSED by default.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Parent campaign ID." },
        name: { type: "string", description: "Ad group name." },
        bid_dollars: { type: "number", description: "Bid amount in dollars (e.g. 5.00 for $5 CPM)." },
        start_time: { type: "string", description: "Start datetime in ISO 8601." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        end_time: { type: "string", description: "Optional end datetime." },
        bid_strategy: { type: "string", description: "CPM, CPC, or CPV. Defaults to CPM." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED. Defaults to PAUSED." },
        optimization_goal: { type: "string", description: "IMPRESSIONS, CLICKS, CONVERSIONS, etc." },
        subreddit_names: { type: "array", items: { type: "string" }, description: "Subreddit names to target (without r/ prefix)." },
        interest_ids: { type: "array", items: { type: "string" }, description: "Interest category IDs for targeting." },
        geo_country_codes: { type: "array", items: { type: "string" }, description: 'Country codes (e.g. ["US", "CA"]).' },
        device_types: { type: "array", items: { type: "string" }, description: "Device types: DESKTOP, MOBILE, TABLET." },
      },
      required: ["campaign_id", "name", "bid_dollars", "start_time"],
    },
  },
  {
    name: "reddit_ads_update_ad_group",
    description:
      "Update an existing ad group. Only pass fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        ad_group_id: { type: "string", description: "The ad group ID to update." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        name: { type: "string", description: "New ad group name." },
        bid_dollars: { type: "number", description: "New bid in dollars." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED." },
        end_time: { type: "string", description: "New end datetime in ISO 8601." },
      },
      required: ["ad_group_id"],
    },
  },
  {
    name: "reddit_ads_create_ad",
    description:
      "Create a new Reddit ad within an ad group. Created as PAUSED by default.",
    inputSchema: {
      type: "object",
      properties: {
        ad_group_id: { type: "string", description: "Parent ad group ID." },
        name: { type: "string", description: "Internal ad name." },
        headline: { type: "string", description: "Ad headline (max 300 chars)." },
        click_url: { type: "string", description: "Landing page URL." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        thumbnail_url: { type: "string", description: "URL to image asset (for image ads)." },
        body_text: { type: "string", description: "Optional body text." },
        call_to_action: { type: "string", description: "CTA: SIGN_UP, LEARN_MORE, SHOP_NOW, INSTALL, GET_QUOTE, CONTACT_US, DOWNLOAD." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED. Defaults to PAUSED." },
        creative_type: { type: "string", description: "IMAGE, VIDEO, CAROUSEL, or TEXT. Defaults to IMAGE." },
        video_url: { type: "string", description: "URL to video asset (for video ads)." },
        post_url: { type: "string", description: "URL to existing Reddit post to promote." },
      },
      required: ["ad_group_id", "name", "headline", "click_url"],
    },
  },
  {
    name: "reddit_ads_update_ad",
    description:
      "Update an existing ad. Only pass fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        ad_id: { type: "string", description: "The ad ID to update." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
        name: { type: "string", description: "New ad name." },
        headline: { type: "string", description: "New headline text." },
        click_url: { type: "string", description: "New landing page URL." },
        configured_status: { type: "string", description: "ACTIVE or PAUSED." },
        call_to_action: { type: "string", description: "New CTA button text." },
      },
      required: ["ad_id"],
    },
  },
  {
    name: "reddit_ads_pause_items",
    description:
      "Pause one or more campaigns, ad groups, or ads.",
    inputSchema: {
      type: "object",
      properties: {
        item_type: { type: "string", description: "Type: CAMPAIGN, AD_GROUP, or AD." },
        item_ids: { type: "array", items: { type: "string" }, description: "List of IDs to pause." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
      },
      required: ["item_type", "item_ids"],
    },
  },
  {
    name: "reddit_ads_enable_items",
    description:
      "Enable (unpause) one or more campaigns, ad groups, or ads.",
    inputSchema: {
      type: "object",
      properties: {
        item_type: { type: "string", description: "Type: CAMPAIGN, AD_GROUP, or AD." },
        item_ids: { type: "array", items: { type: "string" }, description: "List of IDs to enable." },
        account_id: { type: "string", description: "Ad account ID. Uses default if not provided." },
      },
      required: ["item_type", "item_ids"],
    },
  },
  {
    name: "reddit_ads_search_subreddits",
    description:
      "Search for subreddits to use as targeting in ad groups.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Search query (e.g. "ecommerce", "fulfillment", "shopify").' },
      },
      required: ["query"],
    },
  },
  {
    name: "reddit_ads_get_interest_categories",
    description:
      "Get available interest categories for ad group targeting.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "reddit_ads_search_geo_targets",
    description:
      "Search geographic targeting options (countries, regions).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Search query (e.g. "United States", "California").' },
      },
    },
  },
];
