# Knowledge Agent Service

Production integration and operations handoff: [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md)

This service is the only component that reads `DEEPSEEK_API_KEY`. Keep the key in the server environment, never in this repository or the Mintlify site.

1. Run `npm run kb:build` after documentation or FAQ-review changes.
2. Copy `.env.example` values into the server's secret/environment configuration.
3. Start with `npm run kb:agent` behind an HTTPS reverse proxy for `docs-api.bazhuayu.com`.
4. Point `assets/knowledge-base/agent-config.json.txt` at that HTTPS endpoint.

The process listens on `127.0.0.1` by default, so the reverse proxy and the service can run on the same machine. Set the allowed origins to the exact public documentation origins before deployment.

The service reloads the generated knowledge index for every question, so answers confirmed in the local review console take effect after its background rebuild without restarting this process. MCP questions use two model calls: the first drafts the answer and the second checks it against the stable MCP protocol baseline and Octoparse product documentation. A failed second check never returns the unchecked draft.

Run `npm run kb:mcp:check` periodically to detect a change to the official stable MCP protocol version. This command only reports drift; it never upgrades the trusted baseline automatically.

For local testing, configure `DEEPSEEK_API_KEY` in your terminal/session, run `npm run kb:agent`, then open the Mintlify preview. The public configuration selects its `localEndpoint` only for `localhost` and `127.0.0.1`.
