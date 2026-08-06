import crypto from "node:crypto";
import { normalizeText, tokenize } from "../../../scripts/lib/kb-utils.mjs";

const COMPLEX_PATTERN = /错误|失败|无法|不能|异常|不生效|为什么|原因|排错|怎么办|怎么处理|冲突|兼容/;
const STRICT_PATTERN = /价格|套餐|计费|退款|合同|发票|权限|账号|版本|企业版|试用/;
const MCP_PATTERN = /\bmcp\b|模型上下文协议|model\s+context\s+protocol/i;
const OCTOPARSE_MCP_PATTERN = /八爪鱼|采集任务|采集额度|云采集|api\s*key|删除任务|修改任务/i;

export function classifyQuestion(question) {
  const text = normalizeText(question);
  return {
    complex: COMPLEX_PATTERN.test(text),
    strict: STRICT_PATTERN.test(text),
  };
}

export function isMcpQuestion(question) {
  return MCP_PATTERN.test(String(question ?? ""));
}

export function requiresOctoparseMcpEvidence(question) {
  return isMcpQuestion(question) && OCTOPARSE_MCP_PATTERN.test(String(question ?? ""));
}

export function retrieveChunks(index, question, limit = 8) {
  const query = normalizeText(question);
  const queryTokens = tokenize(question);
  const sourceHint = /\bmcp\b/i.test(question)
    ? "MCP 服务"
    : /\bcli\b/i.test(question)
      ? "CLI"
      : /\bopenapi\b/i.test(question)
        ? "OpenAPI"
        : "";
  const scored = (index.chunks ?? []).map((chunk) => {
    const tokens = new Set(chunk.tokens ?? tokenize(`${chunk.title} ${chunk.heading} ${chunk.content}`));
    let score = 0;
    for (const token of queryTokens) {
      if (!tokens.has(token)) continue;
      score += token.length > 1 ? 3 : 1;
    }
    const title = normalizeText(chunk.title);
    const heading = normalizeText(chunk.heading);
    if (query && title.includes(query)) score += 20;
    if (query && heading.includes(query)) score += 10;
    if (sourceHint && chunk.sourceType === sourceHint) score += 8;
    return { chunk, score };
  }).filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const selected = [];
  const perRoute = new Map();
  for (const entry of scored) {
    const count = perRoute.get(entry.chunk.route) ?? 0;
    if (count >= 2) continue;
    selected.push(entry);
    perRoute.set(entry.chunk.route, count + 1);
    if (selected.length === limit) break;
  }
  return selected;
}

export function retrieveMcpEvidence(index, question, protocolLimit = 4, productLimit = 4) {
  const chunks = index.chunks ?? [];
  const protocol = retrieveChunks(
    { chunks: chunks.filter((chunk) => chunk.sourceType === "MCP 协议") },
    question,
    protocolLimit,
  );
  const product = retrieveChunks(
    { chunks: chunks.filter((chunk) => chunk.sourceType === "MCP 服务") },
    question,
    productLimit,
  );
  return { protocol, product, combined: [...protocol, ...product] };
}

export function retrieveIntentHints(index, question, limit = 3) {
  const query = normalizeText(question);
  const queryTokens = tokenize(question);
  return (index.intents ?? []).map((intent) => {
    const title = normalizeText(intent.title);
    const category = normalizeText(intent.category);
    const tokens = new Set(tokenize(`${intent.title} ${intent.category}`));
    let score = 0;
    for (const token of queryTokens) if (tokens.has(token)) score += token.length > 1 ? 3 : 1;
    if (query && title.includes(query)) score += 16;
    return { title: intent.title, category: intent.category, status: intent.status, score };
  }).filter((hint) => hint.status !== "blocked" && hint.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function hasTrustedMatch(results) {
  return results.length > 0 && results[0].score >= 3;
}

export function redactedText(value = "") {
  return String(value)
    .replace(/1\d{10}/g, "[已隐藏手机号]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[已隐藏邮箱]")
    .replace(/(?:sk|api)[-_][A-Za-z0-9_-]{12,}/gi, "[已隐藏密钥]");
}

export function safeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: redactedText(String(message.content ?? "").trim()).slice(0, message.role === "user" ? 1000 : 1800),
    }))
    .filter((message) => message.content);
}

export function contextForModel(results) {
  return results.map(({ chunk }, index) => [
    `[资料 ${index + 1}]`,
    `标题：${chunk.title}`,
    `小节：${chunk.heading}`,
    `路径：${chunk.route}`,
    `内容：${chunk.content}`,
  ].join("\n")).join("\n\n");
}

export function contextForMcpModel(evidence) {
  return [
    "=== MCP 官方协议资料（只用于协议共性） ===",
    contextForModel(evidence.protocol) || "未检索到相关协议片段。",
    "=== 八爪鱼 MCP 产品资料（只用于八爪鱼具体能力） ===",
    contextForModel(evidence.product) || "未检索到相关产品片段。",
  ].join("\n\n");
}

export function sourceList(results) {
  const seen = new Set();
  return results.map(({ chunk }) => ({ title: chunk.title, route: chunk.route, heading: chunk.heading, sourceType: chunk.sourceType }))
    .filter((source) => {
      const key = source.route || `${source.title}:${source.heading}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseModelAnswer(content) {
  const raw = String(content ?? "").trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(raw);
  const answer = redactedText(String(parsed.answer ?? "").trim());
  const steps = Array.isArray(parsed.steps) ? parsed.steps.map((step) => redactedText(String(step).trim())).filter(Boolean).slice(0, 8) : [];
  const cautions = Array.isArray(parsed.cautions) ? parsed.cautions.map((item) => redactedText(String(item).trim())).filter(Boolean).slice(0, 5) : [];
  const followUps = Array.isArray(parsed.followUps) ? parsed.followUps.map((item) => redactedText(String(item).trim())).filter(Boolean).slice(0, 3) : [];
  if (answer.length < 8 || answer.length > 1200) throw new Error("模型返回的答案格式无效。");
  return { answer, steps, cautions, followUps, needsHumanReview: Boolean(parsed.needsHumanReview) };
}

export function parseMcpValidation(content) {
  const raw = String(content ?? "").trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(raw);
  const result = parseModelAnswer(JSON.stringify(parsed));
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => redactedText(String(issue).trim())).filter(Boolean).slice(0, 8)
    : [];
  return {
    passed: parsed.passed === true,
    issues,
    result,
  };
}

export function questionFingerprint(question) {
  return crypto.createHash("sha256").update(normalizeText(question)).digest("hex").slice(0, 16);
}
