# mcp-reddit-ads

MCP server for Reddit Ads API v3 -- campaign management, ad creation, performance reporting, and audience targeting via Claude.

## Features

- **18 tools** covering full CRUD for campaigns, ad groups, and ads
- Performance reports with daily breakdowns
- Subreddit, interest, and geographic targeting
- Bulk pause/enable operations
- Safe by default: all new entities created in PAUSED status
- Budget inputs in dollars (auto-converts to Reddit's microcurrency format)

## Installation

```bash
npm install mcp-reddit-ads
```

Or clone the repository:

```bash
git clone https://github.com/mharnett/mcp-reddit-ads.git
cd mcp-reddit-ads
npm install
npm run build
```

## Configuration

### 1. Reddit OAuth App

Create a Reddit OAuth app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps):

- Select "script" type
- Note the client ID and client secret
- Obtain a refresh token with `adsread adsedit read` scopes

### 2. Environment Variables

Set credentials via environment variables:

| Variable | Description |
|---|---|
| `REDDIT_CLIENT_ID` | OAuth app client ID |
| `REDDIT_CLIENT_SECRET` | OAuth app client secret |
| `REDDIT_REFRESH_TOKEN` | OAuth refresh token with ads scopes |

### 3. Config File

Copy `config.example.json` to `config.json` and fill in defaults:

```json
{
  "reddit_api": {
    "base_url": "https://ads-api.reddit.com/api/v3",
    "auth": {
      "client_id": "",
      "client_secret": "",
      "refresh_token": "",
      "user_agent": "reddit-ad-mcp/1.0"
    }
  },
  "defaults": {
    "account_id": "",
    "business_id": "",
    "report_metrics": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm"],
    "date_range_days": 7
  }
}
```

Environment variables take precedence over config file values.

## Usage

### Claude Code (.mcp.json)

```json
{
  "mcpServers": {
    "reddit-ads": {
      "command": "node",
      "args": ["/path/to/mcp-reddit-ads/dist/index.js"],
      "env": {
        "REDDIT_CLIENT_ID": "$(security find-generic-password -a reddit-ads-mcp -s REDDIT_CLIENT_ID -w)",
        "REDDIT_CLIENT_SECRET": "$(security find-generic-password -a reddit-ads-mcp -s REDDIT_CLIENT_SECRET -w)",
        "REDDIT_REFRESH_TOKEN": "$(security find-generic-password -a reddit-ads-mcp -s REDDIT_REFRESH_TOKEN -w)"
      }
    }
  }
}
```

**Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

## Tools

### Context

| Tool | Description |
|---|---|
| `reddit_ads_get_client_context` | Get account info and verify API connectivity |
| `reddit_ads_get_accounts` | List all ad accounts accessible to the authenticated user |

### Read

| Tool | Description |
|---|---|
| `reddit_ads_get_campaigns` | List campaigns with optional status filter |
| `reddit_ads_get_ad_groups` | List ad groups for a campaign |
| `reddit_ads_get_ads` | List ads for an ad group |
| `reddit_ads_get_performance_report` | Aggregated performance metrics for campaigns/ad groups/ads |
| `reddit_ads_get_daily_performance` | Day-by-day performance breakdown |

### Write: Campaigns

| Tool | Description |
|---|---|
| `reddit_ads_create_campaign` | Create a new campaign (PAUSED by default) |
| `reddit_ads_update_campaign` | Update campaign name, budget, objective, or status |

### Write: Ad Groups

| Tool | Description |
|---|---|
| `reddit_ads_create_ad_group` | Create a new ad group with targeting (PAUSED by default) |
| `reddit_ads_update_ad_group` | Update ad group bid, targeting, or status |

### Write: Ads

| Tool | Description |
|---|---|
| `reddit_ads_create_ad` | Create a new ad with headline, body, URL, and media (PAUSED by default) |
| `reddit_ads_update_ad` | Update ad creative or status |

### Bulk Operations

| Tool | Description |
|---|---|
| `reddit_ads_pause_items` | Pause multiple campaigns, ad groups, or ads at once |
| `reddit_ads_enable_items` | Enable multiple campaigns, ad groups, or ads at once |

### Targeting

| Tool | Description |
|---|---|
| `reddit_ads_search_subreddits` | Search for subreddits by keyword for targeting |
| `reddit_ads_get_interest_categories` | List available interest categories for targeting |
| `reddit_ads_search_geo_targets` | Search for geographic targeting options (countries, regions, metros) |

## Key Conventions

- **Spend values** are returned from the API in microcurrency (1 dollar = 1,000,000 microcurrency units). Divide by 1,000,000 to get dollar amounts. Budget inputs accept dollars and auto-convert.
- **Dates and times** use ISO 8601 format (`YYYY-MM-DDTHH:MM:SSZ`).
- **New entities default to PAUSED** status. Explicitly set status to `ACTIVE` to go live.
- **Report metrics** default to the set configured in `config.json` but can be overridden per request.

## Architecture

- **Resilience**: Uses [cockatiel](https://github.com/connor4312/cockatiel) for retry policies and circuit breaking on API calls
- **Logging**: Structured logging via [pino](https://github.com/pinojs/pino)
- **Response truncation**: Large API responses are truncated at 200KB to stay within MCP message limits
- **Auth**: OAuth 2.0 refresh token flow with automatic access token renewal

## License

MIT -- see [LICENSE](LICENSE).

## Author

Built by Mark Harnett / [drak-marketing](https://github.com/drak-marketing).
