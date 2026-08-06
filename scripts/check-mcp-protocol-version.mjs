import fs from "node:fs/promises";
import path from "node:path";
import { root } from "./lib/kb-utils.mjs";

const baselinePath = path.join(root, "scripts", "data", "mcp-protocol-baseline.json");
const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const response = await fetch(baseline.versioningUrl, {
  headers: { "user-agent": "bazhuayu-docs-mcp-version-check/1.0" },
});

if (!response.ok) throw new Error(`MCP 版本页面访问失败：HTTP ${response.status}`);

const page = (await response.text())
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/\s+/g, " ");
const currentMatch = page.match(/Current Protocol Version.{0,240}?(20\d{2}-\d{2}-\d{2})/i);

if (!currentMatch) throw new Error("未能从 MCP 官方版本页识别当前正式协议版本，请人工检查。");

const officialVersion = currentMatch[1];
if (officialVersion !== baseline.protocolVersion) {
  throw new Error(`MCP 正式协议版本发生变化：基线为 ${baseline.protocolVersion}，官方当前版本为 ${officialVersion}。请人工审核后更新基线。`);
}

console.log(`MCP 正式协议版本未变化：${officialVersion}`);
