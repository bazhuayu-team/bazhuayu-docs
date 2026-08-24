import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(root, "zh");
const reportPath = path.join(root, "reports", "document-link-audit.json");
const write = process.argv.includes("--write");
const repairReport = process.argv.includes("--repair-report");
const debug = process.argv.includes("--debug");
const OLD_HELP_CENTER = "https://www.bazhuayu.com/helpcenter";
const BLANK_ATTRIBUTES = 'target="_blank" rel="noopener noreferrer"';
const legacyOverrides = new Map([
  ["865xfpn6", "/zh/academy/basic-collection/beginner/custom-collection"],
  ["qeAA9j", "/zh/academy/basic-collection/beginner/custom-collection"],
  ["4lkVQT", "/zh/academy/index"],
  ["NNq78SWX", "/zh/academy/xpath/getting-started/why-use-xpath"],
  ["pWdSFO", "/zh/academy/xpath/getting-started/why-use-xpath"],
  ["V2h1Ec", "/zh/academy/xpath/getting-started/why-use-xpath"],
  ["B6sFwm", "/zh/academy/premium-features/cloud-extraction/scheduled-cloud-extraction"],
  ["gui-ze-you-hua", "/zh/academy/troubleshooting/rule-optimization"],
  ["K2lJPG", "/zh/academy/data-export/file-download"],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.mdx?$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function splitFrontmatter(source) {
  const match = source.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);
  return match ? { frontmatter: match[1], body: match[2] } : { frontmatter: "", body: source };
}

function routeFor(file) {
  return `/${path.relative(root, file).replace(/\\/g, "/").replace(/\.mdx?$/i, "")}`;
}

function titleFrom(source, fallback) {
  const { frontmatter } = splitFrontmatter(source);
  const match = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return match ? match[1].trim() : fallback;
}

function normalizeLegacy(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(`${parsed.origin}${parsed.pathname}`).replace(/\/$/, "");
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function legacyId(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.match(/\/helpcenter\/docs\/([^/]+)/i)?.[1] ?? "") || null;
  } catch {
    return null;
  }
}

function normalizeText(value = "") {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").trim();
}

function similarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (value) => new Set(Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)));
  const leftGrams = grams(a);
  const rightGrams = grams(b);
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1;
  return shared / (leftGrams.size + rightGrams.size - shared);
}

function isOldHelpCenter(url) {
  return /^https?:\/\/(?:www\.)?bazhuayu\.com\/helpcenter(?:\/|$)/i.test(url);
}

function isCurrentDocs(url) {
  return /^https?:\/\/(?:www\.)?bazhuayu\.com\/docs(?:\/|$)/i.test(url);
}

function sourceLegacyUrl(source) {
  const { frontmatter } = splitFrontmatter(source);
  return frontmatter.match(/^source:\s*["']?(https?:\/\/(?:www\.)?bazhuayu\.com\/helpcenter\/docs\/[^\s"']+)["']?\s*$/m)?.[1] ?? null;
}

function categoryRoute(file) {
  const relative = path.relative(docsRoot, file).replace(/\\/g, "/");
  if (relative.startsWith("academy/video/")) {
    const parts = relative.split("/");
    return parts.length > 3 ? `/zh/academy/video/${parts.slice(2, -1).join("/")}/index` : "/zh/academy/video/index";
  }
  // The academy home is the only stable category landing page for every text section.
  // Several legacy category directories intentionally have no standalone index document.
  if (relative.startsWith("academy/") || relative.startsWith("knowledge-base/")) return "/zh/academy/index";
  return "/zh/academy/index";
}

function withQueryAndHash(route, url) {
  const parsed = new URL(url);
  return `${route}${parsed.search}${parsed.hash}`;
}

async function fetchLegacyTitle(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) return null;
    const html = await response.text();
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title/i);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return (og?.[1] ?? title?.[1] ?? "").replace(/\s*[-_|].*$/, "").trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function anchor(label, href) {
  return `<a href="${href}" ${BLANK_ATTRIBUTES}>${label}</a>`;
}

function updateHtmlAnchor(tag, resolve) {
  if (/\bclassName\s*=\s*["'][^"']*\bmcp-case-card\b/i.test(tag)) return tag;
  const hrefMatch = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
  if (!hrefMatch || !/^(https?:\/\/|\/zh\/)/i.test(hrefMatch[2])) return tag;
  const resolved = resolve(hrefMatch[2], "");
  if (!resolved) return tag;
  let next = tag.replace(hrefMatch[0], `href=${hrefMatch[1]}${resolved.href}${hrefMatch[1]}`);
  next = next.replace(/\s+target\s*=\s*(["'])[^"']*\1/ig, "");
  next = next.replace(/\s+rel\s*=\s*(["'])[^"']*\1/ig, "");
  return next.replace(/>$/, ` ${BLANK_ATTRIBUTES}>`);
}

function transformBody(body, resolve) {
  const cleaned = body.replace(/<\/a\s+target=["']_blank["']\s+rel=["']noopener noreferrer["']\s*>/gi, "</a>");
  return cleaned.split(/(```[\s\S]*?```)/g).map((fenced, fenceIndex) => {
    if (fenceIndex % 2) return fenced;
    return fenced.split(/(`[^`]*`)/g).map((piece, inlineIndex) => {
      if (inlineIndex % 2) return piece;
      let next = piece.replace(/<a\b[^>]*>/gi, (tag) => updateHtmlAnchor(tag, resolve));
      next = next.replace(/(^|[^!])\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/zh\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/gm, (whole, prefix, label, href) => {
        const resolved = resolve(href, label);
        return resolved ? `${prefix}${anchor(label, resolved.href)}` : whole;
      });
      return next;
    }).join("");
  }).join("");
}

const files = await walk(docsRoot);
const documents = [];
const sourceMap = new Map();
const videoMap = new Map([["7T3XuG", "/zh/academy/video/index"]]);
for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  const document = { file, source, route: routeFor(file), title: titleFrom(source, path.basename(file, path.extname(file))) };
  documents.push(document);
  const legacy = sourceLegacyUrl(source);
  if (legacy) sourceMap.set(normalizeLegacy(legacy), document.route);
  if (document.route.startsWith("/zh/academy/video/")) {
    const id = path.basename(file, path.extname(file));
    if (id !== "index") videoMap.set(id, document.route);
  }
}

const oldUrls = new Set();
for (const document of documents) {
  const { body } = splitFrontmatter(document.source);
  for (const match of body.matchAll(/https?:\/\/(?:www\.)?bazhuayu\.com\/helpcenter[^\s\]>)"']+/gi)) oldUrls.add(match[0]);
}

const legacyTitles = new Map();
const unresolved = [...oldUrls].filter((url) => !sourceMap.has(normalizeLegacy(url)) && !videoMap.has(legacyId(url)) && normalizeLegacy(url) !== OLD_HELP_CENTER);
for (let index = 0; index < unresolved.length; index += 5) {
  const batch = unresolved.slice(index, index + 5);
  for (const [url, title] of await Promise.all(batch.map(async (url) => [url, await fetchLegacyTitle(url)]))) if (title) legacyTitles.set(url, title);
}

const mappings = [];
function resolveLegacy(url, label, sourceDocument) {
  const normalized = normalizeLegacy(url);
  const id = legacyId(url);
  if (legacyOverrides.has(id)) return { href: withQueryAndHash(legacyOverrides.get(id), url), method: "override" };
  if (videoMap.has(id)) return { href: withQueryAndHash(videoMap.get(id), url), method: "video-id" };
  if (sourceMap.has(normalized)) return { href: withQueryAndHash(sourceMap.get(normalized), url), method: "source" };
  if (normalized === OLD_HELP_CENTER) return { href: "/zh/academy/index", method: "help-center-root" };
  const legacyTitle = legacyTitles.get(url) ?? "";
  const needle = `${label} ${legacyTitle} ${id ?? ""}`;
  let best = null;
  for (const candidate of documents) {
    const score = Math.max(similarity(needle, candidate.title), similarity(legacyTitle, candidate.title));
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (best && best.score >= 0.4) return { href: best.route, method: "title-match", score: Number(best.score.toFixed(3)), legacyTitle };
  return { href: categoryRoute(sourceDocument.file), method: "category-fallback", legacyTitle };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function repairMappingsFromReport() {
  const previous = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const byRoute = new Map(documents.map((document) => [path.relative(root, document.file).replace(/\\/g, "/"), document]));
  let repaired = 0;
  for (const item of previous.oldHelpCenter.mappings) {
    const document = byRoute.get(item.sourceFile);
    const id = legacyId(item.oldUrl);
    const needsRepair = legacyOverrides.has(id)
      || item.method === "category-fallback"
      || (item.method === "title-match" && (item.score ?? 0) < 0.4);
    if (!document || !needsRepair) continue;
    const resolved = resolveLegacy(item.oldUrl, item.label, document);
    if (resolved.href === item.href) continue;
    const current = await fs.readFile(document.file, "utf8");
    const labelPattern = item.label ? escapeRegExp(item.label) : "[\\s\\S]*?";
    const pattern = new RegExp(`(<a\\b[^>]*\\bhref=)(["'])${escapeRegExp(item.href)}\\2([^>]*>)(${labelPattern})(</a>)`, "g");
    const next = current.replace(pattern, `$1$2${resolved.href}$2$3$4$5`);
    if (next !== current) {
      await fs.writeFile(document.file, next, "utf8");
      repaired += 1;
    }
    item.href = resolved.href;
    item.method = resolved.method;
    item.score = resolved.score;
    item.legacyTitle = resolved.legacyTitle;
  }
  previous.generatedAt = new Date().toISOString();
  previous.mode = "repair-report";
  previous.repairedFiles = repaired;
  const methods = ["override", "video-id", "source", "help-center-root", "title-match", "category-fallback"];
  previous.oldHelpCenter.methodCounts = Object.fromEntries(methods.map((method) => [method, previous.oldHelpCenter.mappings.filter((item) => item.method === method).length]));
  previous.oldHelpCenter.nonExactMappings = previous.oldHelpCenter.mappings.filter((item) => item.method === "title-match" || item.method === "category-fallback");
  await fs.writeFile(reportPath, `${JSON.stringify(previous, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ mode: "repair-report", repairedFiles: repaired, methodCounts: previous.oldHelpCenter.methodCounts }, null, 2));
}

if (repairReport) {
  await repairMappingsFromReport();
  process.exit(0);
}

let changedFiles = 0;
const converted = { currentDocs: 0, oldHelpCenter: 0, external: 0, internalRelative: 0 };
for (const document of documents) {
  const { frontmatter, body } = splitFrontmatter(document.source);
  const nextBody = transformBody(body, (href, label) => {
    if (/^\/zh\//i.test(href)) { converted.internalRelative += 1; return { href, method: "internal-relative" }; }
    if (isCurrentDocs(href)) { converted.currentDocs += 1; return { href: new URL(href).pathname.replace(/^\/docs(?=\/|$)/, "") + new URL(href).search + new URL(href).hash, method: "current-docs" }; }
    if (isOldHelpCenter(href)) {
      converted.oldHelpCenter += 1;
      const resolved = resolveLegacy(href, label, document);
      mappings.push({ sourceFile: path.relative(root, document.file).replace(/\\/g, "/"), oldUrl: href, label, ...resolved });
      return resolved;
    }
    if (/^https?:\/\//i.test(href)) { converted.external += 1; return { href, method: "external" }; }
    return null;
  });
  if (nextBody !== body) {
    changedFiles += 1;
    if (debug) console.error(`Would update: ${path.relative(root, document.file)}`);
    if (write) await fs.writeFile(document.file, `${frontmatter}${nextBody}`, "utf8");
  }
}

const methodCounts = Object.fromEntries(["override", "video-id", "source", "help-center-root", "title-match", "category-fallback"].map((method) => [method, mappings.filter((item) => item.method === method).length]));
const report = { generatedAt: new Date().toISOString(), mode: write ? "write" : "check", filesScanned: documents.length, changedFiles, converted, oldHelpCenter: { uniqueUrls: oldUrls.size, methodCounts, nonExactMappings: mappings.filter((item) => item.method === "title-match" || item.method === "category-fallback"), mappings } };
if (write) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ ...report, oldHelpCenter: { uniqueUrls: oldUrls.size, methodCounts, nonExactMappings: report.oldHelpCenter.nonExactMappings.length } }, null, 2));
