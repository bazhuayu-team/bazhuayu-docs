import fs from "node:fs/promises";
import path from "node:path";
import {
  extractSteps,
  excerpt,
  normalizeText,
  parseFrontmatter,
  relativeRoute,
  root,
  tokenize,
  walkFiles,
  writeJsonAtomic,
} from "./lib/kb-utils.mjs";
import { legacyApprovedContent } from "./lib/kb-review-decision.mjs";

const auditPath = path.join(root, "reports", "knowledge-base-audit.json");
const overridePath = path.join(root, "scripts", "data", "kb-review-overrides.json");
const curatedAnswerPath = path.join(root, "scripts", "data", "kb-curated-answers.json");
const aliasPath = path.join(root, "scripts", "data", "kb-aliases.json");
const outputPath = path.join(root, "assets", "knowledge-base", "search-index.json");
const browserIndexPath = path.join(root, "assets", "knowledge-base", "search-index.json.txt");
const agentIndexPath = path.join(root, "assets", "knowledge-base", "agent-index.json");
const agentConfigPath = path.join(root, "assets", "knowledge-base", "agent-config.json.txt");
const mcpBaselinePath = path.join(root, "scripts", "data", "mcp-protocol-baseline.json");

function tokenSet(...values) {
  return [...new Set(values.flatMap((value) => tokenize(value)))];
}

function aliasTokens(tokens, aliases) {
  const expanded = new Set(tokens);
  for (const group of aliases.groups ?? []) {
    const groupTokens = tokenSet(group.terms.join(" "));
    if (groupTokens.some((token) => expanded.has(token))) groupTokens.forEach((token) => expanded.add(token));
  }
  return [...expanded];
}

async function trustedDocuments() {
  const directories = [
    path.join(root, "zh", "academy"),
    path.join(root, "zh", "product"),
    path.join(root, "zh", "mcp"),
    path.join(root, "zh", "cli"),
    path.join(root, "zh", "api-reference"),
  ];
  const files = (await Promise.all(directories.map((directory) => walkFiles(directory, (file) => file.endsWith(".mdx"))))).flat();
  files.push(path.join(root, "zh", "overview.mdx"));
  const documents = [];
  for (const file of files) {
    const source = await fs.readFile(file, "utf8");
    const { attributes, body } = parseFrontmatter(source);
    if (attributes.hidden === true || attributes.hidden === "true") continue;
    const route = relativeRoute(file);
    const title = attributes.title || path.basename(file, ".mdx");
    const summary = attributes.description || excerpt(body, 180);
    documents.push({
      id: `doc:${route}`,
      route,
      title,
      summary,
      steps: extractSteps(body),
      sourceType: documentSourceType(route),
      // The customer index is loaded in the browser. Title, summary and explicit steps
      // are enough for recall here; indexing complete MDX bodies makes the JSON impractically large.
      tokens: tokenSet(title, summary, ...extractSteps(body)),
      body,
    });
  }
  const baseline = JSON.parse(await fs.readFile(mcpBaselinePath, "utf8"));
  for (const entry of baseline.entries ?? []) {
    documents.push({
      id: `doc:mcp-protocol:${entry.id}`,
      route: entry.sourceUrl,
      title: entry.title,
      summary: excerpt(entry.content, 220),
      steps: [],
      sourceType: "MCP 协议",
      protocolVersion: baseline.protocolVersion,
      tokens: tokenSet(entry.title, entry.heading, entry.content, "MCP 协议"),
      body: `## ${entry.heading}\n\n${entry.content}`,
    });
  }
  return documents;
}

function documentSourceType(route) {
  if (route.startsWith("/zh/product/") || route === "/zh/overview") return "产品文档";
  if (route.startsWith("/zh/mcp/")) return "MCP 服务";
  if (route.startsWith("/zh/cli/")) return "CLI";
  if (route.startsWith("/zh/api-reference/")) return "OpenAPI";
  return "采集学院";
}

function documentChunks(document) {
  const chunks = [];
  const minimumLength = document.id.startsWith("verified:") ? 8 : 24;
  let heading = document.title;
  let buffer = [];
  const flush = () => {
    const content = String(buffer.join("\n"))
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (content.length < minimumLength) {
      buffer = [];
      return;
    }
    for (let offset = 0; offset < content.length; offset += 1400) {
      const slice = content.slice(offset, offset + 1400);
      chunks.push({
        id: `${document.id}:${chunks.length + 1}`,
        route: document.route,
        title: document.title,
        heading,
        content: slice,
        sourceType: document.sourceType,
        tokens: tokenSet(document.title, heading, slice),
      });
    }
    buffer = [];
  };

  for (const line of document.body.split(/\r?\n/)) {
    const match = line.match(/^#{2,4}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].replace(/[*_`]/g, "").trim() || document.title;
      continue;
    }
    buffer.push(line);
    if (buffer.join("\n").length > 1600) flush();
  }
  flush();
  return chunks;
}

function appendPosting(postings, token, id, weight) {
  const entry = postings[token] ?? [];
  const existing = entry.find((item) => item[0] === id);
  if (existing) existing[1] = Math.max(existing[1], weight);
  else entry.push([id, weight]);
  postings[token] = entry;
}

async function build() {
  const [audit, overrides, curatedAnswers, aliases, trusted] = await Promise.all([
    fs.readFile(auditPath, "utf8").then(JSON.parse),
    fs.readFile(overridePath, "utf8").then(JSON.parse),
    fs.readFile(curatedAnswerPath, "utf8").then(JSON.parse),
    fs.readFile(aliasPath, "utf8").then(JSON.parse),
    trustedDocuments(),
  ]);
  const trustedByRoute = new Map(trusted.map((document) => [document.route, document]));
  const answerDocuments = [...trusted];
  const answerById = new Map(answerDocuments.map((document) => [document.id, document]));
  const intents = [];

  for (const item of audit.items) {
    const override = overrides.items?.[item.sourceSlug] ?? {};
    const status = override.status ?? "unverified";
    if (status === "blocked") continue;
    const answerIds = [];
    if (status === "linked" && trustedByRoute.has(override.linkedRoute)) {
      answerIds.push(trustedByRoute.get(override.linkedRoute).id);
    }
    if (status === "verified") {
      const answer = legacyApprovedContent(override).trim();
      if (answer) {
        const id = `verified:${item.sourceSlug}`;
        const steps = extractSteps(answer);
        const document = {
          id,
          route: "",
          title: item.title,
          summary: excerpt(answer, 360),
          steps,
          sourceType: "人工确认",
          tokens: tokenSet(item.title, item.category, answer, ...steps),
          body: answer,
        };
        answerDocuments.push(document);
        answerById.set(id, document);
        answerIds.push(id);
      }
    }
    const titleTokens = aliasTokens(tokenSet(item.title), aliases);
    const categoryTokens = aliasTokens(tokenSet(item.category), aliases);
    intents.push({
      id: `faq:${item.sourceSlug}`,
      sourceSlug: item.sourceSlug,
      title: item.title,
      category: item.category,
      status,
      titleTokens,
      categoryTokens,
      answerIds,
    });
  }

  for (const item of curatedAnswers.items ?? []) {
    if (item.status !== "verified") continue;
    const answer = String(item.content ?? "").trim();
    if (!item.id || !item.title || answer.length < 8) continue;
    const id = `curated:${item.id}`;
    const steps = extractSteps(answer);
    const document = {
      id,
      route: String(item.route ?? "").trim(),
      title: item.title,
      summary: excerpt(answer, 360),
      steps,
      sourceType: "人工确认",
      tokens: tokenSet(item.title, item.category, answer, ...steps),
      body: answer,
    };
    answerDocuments.push(document);
    answerById.set(id, document);
    intents.push({
      id: `curated:${item.id}`,
      sourceSlug: item.id,
      title: item.title,
      category: item.category || "人工确认",
      status: "verified",
      titleTokens: aliasTokens(tokenSet(item.title), aliases),
      categoryTokens: aliasTokens(tokenSet(item.category), aliases),
      answerIds: [id],
    });
  }

  const postings = {};
  for (const intent of intents) {
    for (const token of intent.titleTokens) appendPosting(postings, token, intent.id, 8);
    for (const token of intent.categoryTokens) appendPosting(postings, token, intent.id, 3);
  }
  for (const document of answerDocuments) {
    for (const token of document.tokens) appendPosting(postings, token, document.id, 2);
  }

  const publicAnswers = Object.fromEntries(answerDocuments.map((document) => [document.id, {
    title: document.title,
    summary: document.summary,
    steps: document.steps,
    route: document.route,
    sourceType: document.sourceType,
  }]));
  const publicIntents = intents.map(({ titleTokens, categoryTokens, ...intent }) => intent);
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: { faqIntents: intents.length, publicAnswers: Object.keys(publicAnswers).length },
    aliases: aliases.groups ?? [],
    postings,
    intents: publicIntents,
    answers: publicAnswers,
  };
  await writeJsonAtomic(outputPath, payload);
  // Mintlify exposes local .txt assets but responds with 404 for unknown JSON assets.
  // The browser only needs intent metadata and trusted answers, never FAQ bodies or postings.
  const browserPayload = {
    version: payload.version,
    generatedAt: payload.generatedAt,
    counts: payload.counts,
    aliases: payload.aliases,
    intents: publicIntents,
    answers: publicAnswers,
  };
  await writeJsonAtomic(browserIndexPath, browserPayload);
  const verifiedChunks = answerDocuments
    .filter((document) => document.id.startsWith("verified:") || document.id.startsWith("curated:"))
    .flatMap(documentChunks);
  const agentPayload = {
    version: 1,
    generatedAt: payload.generatedAt,
    protocolBaseline: {
      version: JSON.parse(await fs.readFile(mcpBaselinePath, "utf8")).protocolVersion,
      status: "stable",
    },
    chunks: [...trusted.flatMap(documentChunks), ...verifiedChunks],
  };
  await writeJsonAtomic(agentIndexPath, agentPayload);
  try {
    await fs.access(agentConfigPath);
  } catch {
    await writeJsonAtomic(agentConfigPath, {
      enabled: true,
      endpoint: "https://docs-api.bazhuayu.com/v1/ask",
      feedbackEndpoint: "https://docs-api.bazhuayu.com/v1/feedback",
      localEndpoint: "http://127.0.0.1:8787/v1/ask",
      localFeedbackEndpoint: "http://127.0.0.1:8787/v1/feedback",
      timeoutMs: 45000,
    });
  }
  console.log(`Built customer knowledge index: ${payload.counts.faqIntents} question intents, ${payload.counts.publicAnswers} trusted answers.`);
}

await build();
