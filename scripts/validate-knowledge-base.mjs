import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, root } from "./lib/kb-utils.mjs";

const audit = JSON.parse(await fs.readFile(path.join(root, "reports", "knowledge-base-audit.json"), "utf8"));
const index = JSON.parse(await fs.readFile(path.join(root, "assets", "knowledge-base", "search-index.json"), "utf8"));
const agentIndex = JSON.parse(await fs.readFile(path.join(root, "assets", "knowledge-base", "agent-index.json"), "utf8"));
const overrides = JSON.parse(await fs.readFile(path.join(root, "scripts", "data", "kb-review-overrides.json"), "utf8"));
const curatedAnswers = JSON.parse(await fs.readFile(path.join(root, "scripts", "data", "kb-curated-answers.json"), "utf8"));
const errors = [];
const warnings = [];

for (const item of audit.items) {
  const file = path.join(root, ...item.route.slice(1).split("/")) + ".mdx";
  try {
    const source = await fs.readFile(file, "utf8");
    const { attributes } = parseFrontmatter(source);
    if (!(attributes.hidden === true || attributes.hidden === "true")) errors.push(`${item.sourceSlug}: must be hidden`);
    if (attributes.kbStatus !== "unverified") errors.push(`${item.sourceSlug}: initial kbStatus must be unverified`);
    if (/!\[[^\]]*\]\(https?:\/\//i.test(source)) errors.push(`${item.sourceSlug}: remote image remains in MDX`);
    if (/https?:\/\/(?:www\.)?bazhuayu\.com\/helpcenter\/docs\/[^)\r\n]+\.(?:png|gif|jpg|jpeg|webp)/i.test(source)) errors.push(`${item.sourceSlug}: old HelpCenter image remains`);
  } catch {
    errors.push(`${item.sourceSlug}: missing generated page`);
  }
}

const intentsById = new Map(index.intents.map((intent) => [intent.id, intent]));
for (const [answerId, answer] of Object.entries(index.answers)) {
  if (answerId.startsWith("faq:")) errors.push(`${answerId}: unverified FAQ cannot become an answer`);
  if (!answer.summary) errors.push(`${answerId}: empty answer summary`);
}
for (const intent of index.intents) {
  if (["unverified", "deferred"].includes(intent.status) && intent.answerIds.length) warnings.push(`${intent.sourceSlug}: has a linked answer while marked ${intent.status}`);
  if (intent.status === "blocked") errors.push(`${intent.sourceSlug}: blocked intent leaked to customer index`);
}
if (agentIndex.protocolBaseline?.version !== "2025-11-25" || agentIndex.protocolBaseline?.status !== "stable") {
  errors.push("agent index: MCP stable protocol baseline must be 2025-11-25");
}
if (!agentIndex.chunks.some((chunk) => chunk.sourceType === "MCP 协议")) {
  errors.push("agent index: MCP protocol evidence is missing");
}
if (agentIndex.chunks.some((chunk) => chunk.sourceType === "FAQ" || chunk.sourceType === "faq")) {
  errors.push("agent index: unreviewed FAQ body leaked into trusted chunks");
}
for (const [slug, decision] of Object.entries(overrides.items ?? {})) {
  const chunks = agentIndex.chunks.filter((chunk) => chunk.id.startsWith(`verified:${slug}:`));
  if (decision.status === "verified" && !chunks.length) errors.push(`${slug}: verified answer missing from agent index`);
  if (decision.status !== "verified" && chunks.length) errors.push(`${slug}: non-verified answer leaked into agent index`);
}
for (const item of curatedAnswers.items ?? []) {
  const chunks = agentIndex.chunks.filter((chunk) => chunk.id.startsWith(`curated:${item.id}:`));
  if (item.status === "verified" && !chunks.length) errors.push(`${item.id}: curated answer missing from agent index`);
  if (item.status !== "verified" && chunks.length) errors.push(`${item.id}: non-verified curated answer leaked into agent index`);
}
if (audit.stats.articles !== 541 || audit.items.length !== 541) errors.push(`audit count is ${audit.items.length}, expected 541`);
if (errors.length) {
  console.error(`Knowledge-base validation failed (${errors.length} errors):\n${errors.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Knowledge-base validation passed: ${audit.items.length} hidden FAQ pages, ${index.counts.publicAnswers} trusted answers.`);
}
if (warnings.length) console.warn(`Warnings (${warnings.length}):\n${warnings.slice(0, 20).join("\n")}`);
