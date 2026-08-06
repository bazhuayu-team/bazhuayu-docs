import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toMdast } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";
import {
  buildSourceRouteMap,
  escapeYaml,
  excerpt,
  root,
  writeJsonAtomic,
} from "./lib/kb-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = "https://api-get.helplook.net";
const SOURCE_BASE = "https://www.bazhuayu.com/helpcenter/docs";
const TENANT_ID = "1564";
const ROOT_SLUG = "C83Oeh";
const EXPECTED = { groups: 17, articles: 541, operation: 208, business: 329, troubleshooting: 4 };

const groupDirectories = new Map([
  ["mKZQvN", "operation"], ["hUiqok", "install-login"], ["kPSGSS", "custom-collection"],
  ["RVnV8N", "template"], ["L6hsFb", "tasks"], ["Hkn723", "export"], ["RyMARX", "cloud"], ["uTqv4s", "api"],
  ["0lxJre", "business"], ["sMbV9q", "human-service"], ["p6x0Gj", "collection"], ["DIzYD0", "company"],
  ["mxBh9y", "website"], ["XERE5K", "purchase"], ["5VysGE", "account"],
  ["d2gxPo", "troubleshooting"],
]);

function visit(node, fn) {
  fn(node);
  for (const child of node.children ?? []) visit(child, fn);
}

function decodeEntities(value = "") {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-" };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name] ?? `&${name};`);
}

function textFromHtml(html = "") {
  return decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function normalizeRemoteUrl(src) {
  const cleaned = decodeEntities(String(src ?? "")).replaceAll("\\/", "/").trim();
  if (!cleaned || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return new URL(cleaned, "https://resource-wangsu.helplook.net").href;
}

function safeFileName(url, index) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).split(/[?#]/)[0] || ".png";
  const name = path.basename(parsed.pathname, ext).replace(/[^a-zA-Z0-9_-]/g, "-") || `image-${index}`;
  return `${String(index).padStart(2, "0")}-${name}${ext}`;
}

function removePlaceholderImages(node) {
  if (!node.children) return;
  node.children = node.children.filter((child) => child.type !== "element" || child.tagName !== "img" || (child.properties?.src && child.properties.src !== "load.gif"));
  for (const child of node.children) removePlaceholderImages(child);
}

async function fetchJson(url, referer) {
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer } });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}

async function fetchTree() {
  const payload = await fetchJson(`${API_BASE}/foreground/content/get-list?${new URLSearchParams({ tannant_id: TENANT_ID })}`, SOURCE_BASE);
  if (String(payload.code) !== "200") throw new Error(`Unexpected list response: ${payload.code}`);
  return payload.data?.list ?? [];
}

async function fetchArticle(slug) {
  // Some legacy slugs contain whitespace characters that cannot be sent in an HTTP header.
  const payload = await fetchJson(`${API_BASE}/foreground/content/get-content?${new URLSearchParams({ tannant_id: TENANT_ID, slug })}`, SOURCE_BASE);
  if (String(payload.code) !== "200") throw new Error(`Unexpected article response for ${slug}: ${payload.code}`);
  return payload.data;
}

function findNode(nodes, slug) {
  for (const node of nodes ?? []) {
    if (node.slug === slug) return node;
    const found = findNode(node.child, slug);
    if (found) return found;
  }
  return undefined;
}

function flattenFaq(rootNode) {
  const groups = [];
  const articles = [];
  function walk(node, parents = []) {
    const nextParents = node.slug === ROOT_SLUG ? parents : [...parents, node];
    if (String(node.type) === "2") {
      const parentGroups = parents.filter((item) => String(item.type) !== "2");
      const top = parentGroups[0];
      const routeParts = parentGroups.map((item) => groupDirectories.get(item.slug)).filter(Boolean);
      articles.push({
        sourceSlug: node.slug,
        treeTitle: node.name,
        category: parentGroups.map((item) => item.name).join(" / "),
        categorySlugs: parentGroups.map((item) => item.slug),
        topCategory: top?.name ?? "常见问题",
        topSlug: top?.slug ?? "",
        directory: routeParts.length ? routeParts.join("/") : "other",
        route: `/zh/knowledge-base/faq/${routeParts.join("/") || "other"}/${node.slug}`,
      });
      return;
    }
    if (node.slug !== ROOT_SLUG) groups.push(node);
    for (const child of node.child ?? []) walk(child, nextParents);
  }
  walk(rootNode);
  return { groups, articles };
}

function validateTree(flat) {
  const byTop = Object.groupBy(flat.articles, (item) => item.topSlug);
  const actual = {
    // The source report counts the FAQ root itself as one of the 17 directory nodes.
    groups: flat.groups.length + 1,
    articles: flat.articles.length,
    operation: byTop.mKZQvN?.length ?? 0,
    business: byTop["0lxJre"]?.length ?? 0,
    troubleshooting: byTop.d2gxPo?.length ?? 0,
  };
  const mismatch = Object.entries(EXPECTED).filter(([key, count]) => actual[key] !== count);
  if (mismatch.length) throw new Error(`FAQ directory validation failed: ${mismatch.map(([key, count]) => `${key}: expected ${count}, got ${actual[key]}`).join("; ")}`);
  return actual;
}

function riskLabels(text) {
  const value = String(text ?? "");
  const rules = [
    ["price", /\d+(?:\.\d+)?\s*元|价格|套餐|优惠|收费|续费/],
    ["contact", /1\d{10}|\b(?:qq|tel|email)\b|邮箱|电话|客服|联系/iu],
    ["policy", /发票|合同|退款|试用|账号|权限/],
    ["version", /\bv?\d+(?:\.\d+){1,3}\b|版本|Win(?:7|8|10|11)|Mac/iu],
    ["outdated", /旧版|老版本|过期|8\.1\.12|已下线|停止服务/],
    ["external-link", /https?:\/\//i],
  ];
  return rules.filter(([, expression]) => expression.test(value)).map(([label]) => label);
}

function imageDimensions(bytes, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (ext === ".gif" && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  return undefined;
}

async function downloadAsset(url, outputPath) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", referer: SOURCE_BASE } });
      if (!response.ok) throw new Error(String(response.status));
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, bytes);
      return bytes;
    } catch (error) {
      if (attempt === 2) throw new Error(`Failed asset ${url}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

function rewriteLinks(hast, sourceSlugToPath) {
  visit(hast, (node) => {
    if (node.type !== "element" || node.tagName !== "a") return;
    const props = node.properties ?? {};
    const href = String(props.href ?? "").replaceAll("\\/", "/").trim();
    const match = href.match(/(?:https?:\/\/www\.bazhuayu\.com)?\/?helpcenter\/docs\/([^/?#]+)/);
    const bareSlug = /^[a-zA-Z0-9_-]+$/.test(href) ? href : "";
    const slug = match?.[1] ?? bareSlug;
    if (!slug) return;
    const hash = href.includes("#") ? `#${href.split("#").slice(1).join("#")}` : "";
    props.href = sourceSlugToPath.get(slug) ? `${sourceSlugToPath.get(slug)}${hash}` : `${SOURCE_BASE}/${slug}${hash}`;
    node.properties = props;
  });
}

async function localizeImages(hast, page) {
  let index = 1;
  page.inlineIconPaths = new Set();
  page.assets = [];
  removePlaceholderImages(hast);
  const downloads = [];
  visit(hast, (node) => {
    if (node.type !== "element" || node.tagName !== "img") return;
    const props = node.properties ?? {};
    if (!props.src || String(props.src).startsWith("data:")) return;
    const remoteUrl = normalizeRemoteUrl(props.src);
    const fileName = safeFileName(remoteUrl, index++);
    const assetRel = path.posix.join("assets", "knowledge-base", "faq", page.sourceSlug, fileName);
    const outputPath = path.join(root, ...assetRel.split("/"));
    downloads.push(downloadAsset(remoteUrl, outputPath).then((bytes) => {
      page.assets.push(`/${assetRel}`);
      const dimensions = imageDimensions(bytes, fileName);
      if (dimensions && dimensions.width <= 80 && dimensions.height <= 80) page.inlineIconPaths.add(`/${assetRel}`);
    }));
    props.src = `/${assetRel}`;
    props.alt = textFromHtml(String(props.alt ?? props.title ?? page.title));
    node.properties = props;
  });
  await Promise.all(downloads);
}

function compactMarkdown(markdown, page) {
  return markdown
    .replace(/\\\[/g, "[").replace(/\\\]/g, "]")
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/<((?!\/?(?:iframe|video|source)\b)[^>\n]+)>/g, "&lt;$1&gt;")
    // HelpLook articles sometimes include literal configuration objects. MDX treats
    // braces as JavaScript expressions unless they are escaped.
    .replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/\[\]\(([^)\s]+\.mp4[^)]*)\)/gi, (_, url) => `<video controls src="${url.replace(/\\([&_*[\]()])/g, "$1")}" width="100%"></video>`)
    .replace(/!\[([^\]]*)\]\((\/assets\/knowledge-base\/faq\/[^)]+)\)/g, (match, alt, src) => page.inlineIconPaths.has(src) ? `<img src="${src}" alt="${String(alt).replaceAll('"', "&quot;")}" className="academy-inline-icon" />` : match)
    // Markdown escapes the HTML entities generated above; re-escaping the ampersand
    // keeps text such as `option[position() > 1]` from being reparsed as JSX.
    .replace(/\\?&lt;/g, "&amp;lt;").replace(/\\?&gt;/g, "&amp;gt;")
    .replace(/<(?!\/?(?:iframe|video|source|img)\b)/g, "&amp;lt;")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function htmlToMarkdown(html, page, sourceSlugToPath) {
  const hast = unified().use(rehypeParse, { fragment: true }).parse(html);
  rewriteLinks(hast, sourceSlugToPath);
  await localizeImages(hast, page);
  return compactMarkdown(toMarkdown(toMdast(hast), { extensions: [gfmToMarkdown()] }), page);
}

function collectDuplicateTitles(items) {
  const titles = new Map();
  for (const item of items) {
    const key = item.title.replace(/\s+/g, "").toLowerCase();
    titles.set(key, [...(titles.get(key) ?? []), item.sourceSlug]);
  }
  return new Map([...titles].filter(([, slugs]) => slugs.length > 1));
}

async function ensureQuestionTab() {
  const docsPath = path.join(root, "docs.json");
  const docs = JSON.parse(await fs.readFile(docsPath, "utf8"));
  const tabs = docs.navigation?.languages?.find((language) => language.language === "zh")?.tabs;
  if (!tabs) throw new Error("Cannot find the Chinese navigation tabs in docs.json");
  const existing = tabs.find((tab) => tab.tab === "问题解答");
  if (!existing) {
    const academyIndex = tabs.findIndex((tab) => tab.tab === "采集学院");
    tabs.splice(academyIndex + 1, 0, { tab: "问题解答", pages: ["zh/help/index"] });
    await fs.writeFile(docsPath, `${JSON.stringify(docs, null, 2)}\n`, "utf8");
  }
}

async function importFaq() {
  const tree = await fetchTree();
  const sourceRoot = findNode(tree, ROOT_SLUG);
  if (!sourceRoot) throw new Error(`Cannot find FAQ root ${ROOT_SLUG}`);
  const flat = flattenFaq(sourceRoot);
  const stats = validateTree(flat);
  const sourceSlugToPath = await buildSourceRouteMap();
  for (const page of flat.articles) sourceSlugToPath.set(page.sourceSlug, page.route);
  const records = [];
  for (let position = 0; position < flat.articles.length; position += 1) {
    const page = flat.articles[position];
    process.stdout.write(`\r[${position + 1}/${flat.articles.length}] ${page.sourceSlug}                 `);
    const article = await fetchArticle(page.sourceSlug);
    page.title = article.name || page.treeTitle;
    const html = article.content?.content ?? "";
    const markdown = await htmlToMarkdown(html, page, sourceSlugToPath);
    const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
    const outputPath = path.join(root, ...page.route.slice(1).split("/")) + ".mdx";
    const description = excerpt(markdown, 160) || `${page.title}常见问题解答`;
    const body = `---\ntitle: "${escapeYaml(page.title)}"\ndescription: "${escapeYaml(description)}"\nhidden: true\nkbStatus: "unverified"\nkbSource: "faq"\nsourceSlug: "${page.sourceSlug}"\nsource: "${sourceUrl}"\n---\n\n${markdown}\n`;
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, body, "utf8");
    records.push({
      sourceSlug: page.sourceSlug, title: page.title, route: page.route, category: page.category,
      categorySlugs: page.categorySlugs, topCategory: page.topCategory, topSlug: page.topSlug,
      sourceUrl, updatedAt: article.update_time || article.updated_at || article.updateTime || "",
      description, imageCount: page.assets.length, assets: page.assets, videoHosts: [...new Set((markdown.match(/(?:https?:)?\/\/[^\s"')>]+/g) ?? []).filter((url) => /video|v\.qq\.com|qcloud/i.test(url)).map((url) => { try { return new URL(url.startsWith("//") ? `https:${url}` : url).host; } catch { return "remote"; } }))],
      riskLabels: riskLabels(`${page.title}\n${markdown}`), bodyLength: markdown.length,
      titleDuplicateWith: [],
    });
  }
  process.stdout.write("\n");
  const duplicateTitles = collectDuplicateTitles(records);
  for (const record of records) record.titleDuplicateWith = duplicateTitles.get(record.title.replace(/\s+/g, "").toLowerCase())?.filter((slug) => slug !== record.sourceSlug) ?? [];
  const manifest = { version: 1, importedAt: new Date().toISOString(), rootSlug: ROOT_SLUG, stats, groups: flat.groups.map((group) => ({ slug: group.slug, title: group.name, directory: groupDirectories.get(group.slug) ?? "" })), items: records };
  await fs.mkdir(path.join(root, "reports"), { recursive: true });
  await writeJsonAtomic(path.join(root, "reports", "knowledge-base-audit.json"), manifest);
  const csv = ["sourceSlug,title,category,route,risks,duplicates", ...records.map((record) => [record.sourceSlug, record.title, record.category, record.route, record.riskLabels.join("|"), record.titleDuplicateWith.join("|")].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
  await fs.writeFile(path.join(root, "reports", "kb-review-queue.csv"), `${csv}\n`, "utf8");
  await ensureQuestionTab();
  console.log(`Imported ${records.length} hidden FAQ pages. Audit report: reports/knowledge-base-audit.json`);
}

const checkOnly = process.argv.includes("--check");
const tree = await fetchTree();
const sourceRoot = findNode(tree, ROOT_SLUG);
if (!sourceRoot) throw new Error(`Cannot find FAQ root ${ROOT_SLUG}`);
const preliminary = flattenFaq(sourceRoot);
console.log(`FAQ tree validated: ${JSON.stringify(validateTree(preliminary))}`);
if (!checkOnly) await importFaq();
