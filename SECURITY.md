# Security policy

mcp-reddit-ads is a Model Context Protocol (MCP) server that can change Reddit Ads accounts. I maintain it on my own. If you find a way around its safeguards, or a way to make it leak a credential, please tell me privately.

## Reporting a problem

Please keep the details out of public issues, pull requests and discussions.

- If this repo's **Security** tab shows a **Report a vulnerability** button, use it. That report is private.
- If there's no button, open an issue that asks for a private contact and says nothing else about the problem.

In the private report, the useful details are the version, the tool or command, the smallest steps that show the problem and what someone could do with it. Please use made-up account ids, and leave out real tokens and account data.

## In scope

- **Write-gate bypass.** The server is read-only until `REDDIT_ADS_MCP_WRITE` is turned on: write tools are left out of the tool list and refused if called. A way to change an account while it's off is in scope, and so is a tool that writes but isn't in the gate's list (`src/writeGate.ts`).
- **A write that skips PAUSED staging.** Campaigns, ad groups and ads are created PAUSED, whatever status the call asks for. A way to create one that starts live is in scope. Edits and `reddit_ads_enable_items` aren't staged.
- **Credential leakage.** A token, secret or key that ends up in a tool result, an error message or a log, or that gets sent anywhere other than the platform it belongs to.

## What I assume

- **A single-user Mac.** I build this for one person running it on their own Mac, or on another computer only they use. The server runs as you, over stdio, and can read what you can. Anyone able to run programs under your account can use your credentials and turn writes on. The gate is there to stop accidental changes, not someone with that access.
- **Your own platform credentials.** You connect the server to an account you control, and the platform decides what that login can do. The gate limits this server's tools, not the login: a leaked token or key works without the server. If you only need to read, a read-only login is the stronger limit.
