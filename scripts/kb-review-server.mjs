import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  normalizeText,
  parseFrontmatter,
  readJson,
  root,
  writeJsonAtomic,
} from "./lib/kb-utils.mjs";
import {
  cleanDecision,
  createRebuildQueue,
  legacyApprovedContent,
} from "./lib/kb-review-decision.mjs";

const execFileAsync = promisify(execFile);
const auditPath = path.join(root, "reports", "knowledge-base-audit.json");
const overridesPath = path.join(root, "scripts", "data", "kb-review-overrides.json");
const draftsPath = path.join(root, ".kb-review", "drafts.json");
const historyPath = path.join(root, ".kb-review", "history.json");
const statePath = path.join(root, ".kb-review", "state.json");
const publicDir = path.join(root, "tools", "kb-review");
const sessionToken = crypto.randomBytes(24).toString("hex");
const buildScript = path.join(root, "scripts", "build-knowledge-index.mjs");
const rebuildQueue = createRebuildQueue(async () => {
  await execFileAsync(process.execPath, [buildScript], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
});

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function pageHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知识审核台</title><link rel="stylesheet" href="/app.css"></head><body><div id="app"></div><script>window.__KB_SESSION__=${JSON.stringify(sessionToken)};</script><script type="module" src="/app.js"></script></body></html>`;
}

async function auditData() {
  return readJson(auditPath, null);
}

async function overrides() {
  return readJson(overridesPath, { version: 1, items: {} });
}

async function trustedDocuments() {
  const index = await readJson(path.join(root, "assets", "knowledge-base", "search-index.json"), null);
  if (!index) return [];
  return Object.entries(index.answers)
    .filter(([id, answer]) => id.startsWith("doc:") && answer.route)
    .map(([, answer]) => ({ route: answer.route, title: answer.title, summary: answer.summary, steps: answer.steps, sourceType: answer.sourceType }));
}

function riskExcerpt(body) {
  const markers = [/\d+(?:\.\d+)?\s*元/g, /1\d{10}/g, /邮箱|电话|客服|联系/g, /发票|合同|退款|试用|权限/g, /版本|Win(?:7|8|10|11)|Mac/g];
  const matches = [];
  for (const expression of markers) for (const match of body.matchAll(expression)) matches.push({ value: match[0], index: match.index });
  return matches.sort((left, right) => left.index - right.index).slice(0, 30);
}

async function itemDetails(slug) {
  const audit = await auditData();
  const item = audit?.items.find((entry) => entry.sourceSlug === slug);
  if (!item) return null;
  const source = await fs.readFile(path.join(root, ...item.route.slice(1).split("/")) + ".mdx", "utf8");
  const { body } = parseFrontmatter(source);
  const [allOverrides, allDrafts] = await Promise.all([
    overrides(),
    readJson(draftsPath, { items: {} }),
  ]);
  const override = allOverrides.items?.[slug] ?? {};
  return {
    ...item,
    body,
    riskMatches: riskExcerpt(body),
    override,
    approvedContent: legacyApprovedContent(override),
    draft: allDrafts.items?.[slug] ?? {},
  };
}

function queryValue(url, name) { return url.searchParams.get(name) || ""; }

async function listItems(url) {
  const audit = await auditData();
  const allOverrides = await overrides();
  const category = queryValue(url, "category");
  const status = queryValue(url, "status");
  const search = normalizeText(queryValue(url, "search"));
  const highRisk = queryValue(url, "highRisk") === "1";
  const noAnswer = queryValue(url, "noAnswer") === "1";
  const page = Math.max(1, Number(queryValue(url, "page")) || 1);
  const pageSize = 30;
  const items = audit.items.map((item) => {
    const record = allOverrides.items?.[item.sourceSlug] ?? {};
    return {
      ...item,
      status: record.status === "linked" ? "verified" : record.status ?? "unverified",
      hasTrustedAnswer: record.status === "linked" || Boolean(legacyApprovedContent(record)),
    };
  });
  const filtered = items.filter((item) =>
    (!category || item.topSlug === category) &&
    (!status || item.status === status) &&
    (!highRisk || item.riskLabels.length > 0) &&
    (!noAnswer || !item.hasTrustedAnswer) &&
    (!search || normalizeText(`${item.title} ${item.sourceSlug} ${item.category}`).includes(search)),
  );
  const start = (page - 1) * pageSize;
  return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize, categories: [...new Map(audit.items.map((item) => [item.topSlug, item.topCategory])).entries()].map(([slug, title]) => ({ slug, title })) };
}

async function stats() {
  const audit = await auditData();
  const allOverrides = await overrides();
  const counts = { unverified: 0, verified: 0, blocked: 0, deferred: 0 };
  let highRisk = 0;
  for (const item of audit.items) {
    const status = allOverrides.items?.[item.sourceSlug]?.status ?? "unverified";
    counts[status === "linked" ? "verified" : status] += 1;
    if (item.riskLabels.length) highRisk += 1;
  }
  return { total: audit.items.length, counts, highRisk, duplicates: audit.items.filter((item) => item.titleDuplicateWith.length).length };
}

async function secureWrite(request, response, port) {
  const origin = request.headers.origin;
  if (request.headers["x-kb-session"] !== sessionToken || origin !== `http://127.0.0.1:${port}`) {
    send(response, 403, { error: "This local review action is not authorized." });
    return false;
  }
  return true;
}

async function bodyJson(request) {
  let body = "";
  for await (const part of request) {
    body += part;
    if (Buffer.byteLength(body, "utf8") > 64 * 1024) throw new Error("请求正文不能超过 64 KB。");
  }
  return body ? JSON.parse(body) : {};
}

async function start() {
  const initialAudit = await auditData();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (request.method === "GET" && url.pathname === "/") return send(response, 200, pageHtml(), "text/html; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/app.css") return send(response, 200, await fs.readFile(path.join(publicDir, "styles.review-css"), "utf8"), "text/css; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/app.js") return send(response, 200, await fs.readFile(path.join(publicDir, "app.js"), "utf8"), "text/javascript; charset=utf-8");
      if (!initialAudit) return send(response, 409, { error: "未找到 FAQ 数据。请先运行 npm run kb:import 和 npm run kb:build。" });
      if (request.method === "GET" && url.pathname === "/api/stats") return send(response, 200, await stats());
      if (request.method === "GET" && url.pathname === "/api/index-status") return send(response, 200, rebuildQueue.status());
      if (request.method === "GET" && url.pathname === "/api/items") return send(response, 200, await listItems(url));
      if (request.method === "GET" && url.pathname.startsWith("/api/items/")) {
        const item = await itemDetails(decodeURIComponent(url.pathname.slice("/api/items/".length)));
        return item ? send(response, 200, item) : send(response, 404, { error: "未找到该问题。" });
      }
      if (request.method === "GET" && url.pathname === "/api/trusted-docs") {
        const search = normalizeText(queryValue(url, "q"));
        const docs = await trustedDocuments();
        return send(response, 200, docs.filter((document) => !search || normalizeText(`${document.title} ${document.summary}`).includes(search)).slice(0, 25));
      }
      if (request.method === "PUT" && url.pathname.startsWith("/api/items/") && url.pathname.endsWith("/draft")) {
        const port = Number(request.headers.host.split(":").pop());
        if (!await secureWrite(request, response, port)) return;
        const slug = decodeURIComponent(url.pathname.slice("/api/items/".length, -"/draft".length));
        const payload = await bodyJson(request);
        const drafts = await readJson(draftsPath, { items: {} });
        drafts.items[slug] = { ...payload, updatedAt: new Date().toISOString() };
        await writeJsonAtomic(draftsPath, drafts);
        return send(response, 200, { ok: true });
      }
      if (request.method === "POST" && url.pathname.startsWith("/api/items/") && url.pathname.endsWith("/decision")) {
        const port = Number(request.headers.host.split(":").pop());
        if (!await secureWrite(request, response, port)) return;
        const slug = decodeURIComponent(url.pathname.slice("/api/items/".length, -"/decision".length));
        const item = await itemDetails(slug);
        if (!item) return send(response, 404, { error: "未找到该问题。" });
        const payload = await bodyJson(request);
        const decision = cleanDecision(payload);
        const review = await overrides();
        const history = await readJson(historyPath, { entries: [] });
        history.entries.push({ slug, previous: review.items[slug] ?? null, next: decision, createdAt: new Date().toISOString() });
        review.items[slug] = decision;
        await Promise.all([writeJsonAtomic(overridesPath, review), writeJsonAtomic(historyPath, history)]);
        return send(response, 200, { ok: true, item: decision, indexStatus: rebuildQueue.schedule() });
      }
      if (request.method === "POST" && url.pathname === "/api/undo") {
        const port = Number(request.headers.host.split(":").pop());
        if (!await secureWrite(request, response, port)) return;
        const [review, history] = await Promise.all([overrides(), readJson(historyPath, { entries: [] })]);
        const entry = history.entries.pop();
        if (!entry) return send(response, 409, { error: "没有可撤销的操作。" });
        if (entry.previous) review.items[entry.slug] = entry.previous;
        else delete review.items[entry.slug];
        await Promise.all([writeJsonAtomic(overridesPath, review), writeJsonAtomic(historyPath, history)]);
        return send(response, 200, { ok: true, slug: entry.slug, indexStatus: rebuildQueue.schedule() });
      }
      if (request.method === "POST" && url.pathname === "/api/rebuild") {
        const port = Number(request.headers.host.split(":").pop());
        if (!await secureWrite(request, response, port)) return;
        return send(response, 202, { ok: true, indexStatus: rebuildQueue.schedule() });
      }
      return send(response, 404, { error: "Not found" });
    } catch (error) {
      return send(response, 500, { error: error.message || "Local review server error" });
    }
  });

  let port = 4173;
  for (;;) {
    try {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      port += 1;
    }
  }
  const state = await readJson(statePath, {});
  await writeJsonAtomic(statePath, { ...state, lastOpenedAt: new Date().toISOString(), port });
  console.log(`知识审核台已启动：http://127.0.0.1:${port}`);
}

await start();
