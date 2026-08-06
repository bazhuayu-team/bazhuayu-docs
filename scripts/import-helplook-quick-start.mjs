import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toMdast } from "hast-util-to-mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmToMarkdown } from "mdast-util-gfm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const API_BASE = "https://api-get.helplook.net";
const SOURCE_BASE = "https://www.bazhuayu.com/helpcenter/docs";
const TENANT_ID = "1564";
const LOCAL_HTML_DIR = "D:/工作/html";

const sections = [
  {
    group: "注册安装",
    dir: "registration-installation",
    pages: [
      ["Windows客户端安装方法", "Windows客户端安装方法.html", "z7XRmv", "windows-client-installation"],
      ["Mac客户端安装方法", "Mac客户端安装方法.html", "6LvfMI", "mac-client-installation"],
      ["免费注册账号", "免费注册账号.html", "Ckdsd5", "free-account-registration"],
    ],
  },
  {
    group: "3分钟快速上手",
    dir: "three-minute-quick-start",
    pages: [
      ["客户端", "客户端.html", "fuhjWG", "client-overview"],
      ["采集界面", "采集界面.html", "cQgrm1", "collection-interface"],
      ["新手指引", "新手指引.html", "zcwRgn", "beginner-guide"],
      ["模板采集", "模板采集.html", "qqLFYk", "template-collection"],
      ["自动识别采集", "自动识别采集.html", "wduVyb", "auto-recognize-collection"],
      ["搭建第一个规则任务", "搭建第一个规则任务.html", "SJU89o", "build-first-rule-task"],
      ["八爪鱼采集器：官方推广福利", "八爪鱼采集器：官方推广福利.html", "ba-zhua-yu-cai-ji-qi-guan-fang-tui-guang-fu-li", "official-promo-benefits"],
      ["【八爪鱼新手入门】常见问题清单-官方版", "【八爪鱼新手入门】常见问题清单-官方版.html", "ba-zhua-yu-xin-shou-ru-men-chang-jian-wen-ti-qing-dan-guan-fang-ban", "beginner-faq-official"],
    ],
  },
];

const flatPages = sections.flatMap((section) =>
  section.pages.map(([title, localFile, sourceSlug, fileSlug]) => ({
    title,
    localFile,
    group: section.group,
    dir: section.dir,
    sourceSlug,
    fileSlug,
  })),
);

let sourceSlugToPath = new Map();

function frontmatterEscape(value = "") {
  return String(value).replaceAll('"', '\\"').replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "-",
    mdash: "-",
    hellip: "...",
    lsquo: "'",
    rsquo: "'",
    ldquo: '"',
    rdquo: '"',
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (_, name) => named[name] ?? `&${name};`);
}

function textFromHtml(html = "") {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function slugFileName(url, index) {
  const cleanUrl = new URL(url);
  const ext = path.extname(cleanUrl.pathname).split(/[?#]/)[0] || ".png";
  const base = path.basename(cleanUrl.pathname, ext).replace(/[^a-zA-Z0-9_-]/g, "-") || `image-${index}`;
  return `${String(index).padStart(2, "0")}-${base}${ext}`;
}

function visit(node, fn) {
  fn(node);
  if (!node.children) return;
  for (const child of node.children) visit(child, fn);
}

function removePlaceholderImages(node) {
  if (!node.children) return;
  node.children = node.children.filter((child) => {
    if (child.type !== "element" || child.tagName !== "img") return true;
    const src = String(child.properties?.src ?? "").trim();
    return src && src !== "load.gif" && !src.startsWith("data:");
  });
  for (const child of node.children) removePlaceholderImages(child);
}

async function buildExistingSourceSlugMap() {
  const map = new Map();
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".mdx")) {
        const text = await fs.readFile(full, "utf8");
        const sourceMatch = text.match(/^source:\s+"https:\/\/www\.bazhuayu\.com\/helpcenter\/docs\/([^"\n]+)"/m);
        if (!sourceMatch) continue;
        const rel = path.relative(root, full).replaceAll(path.sep, "/").replace(/\.mdx$/, "");
        map.set(sourceMatch[1], `/${rel}`);
      }
    }
  }
  await walk(path.join(root, "zh", "academy"));
  await walk(path.join(root, "zh", "product"));
  return map;
}

function normalizeRemoteUrl(src) {
  const cleaned = decodeEntities(String(src ?? "")).replaceAll("\\/", "/").trim();
  if (!cleaned || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("../media/")) {
    return new URL(cleaned.replace(/^\.\.\//, ""), `${SOURCE_BASE}/`).href;
  }
  if (cleaned.startsWith("media/")) {
    return new URL(cleaned, `${SOURCE_BASE}/`).href;
  }
  return new URL(cleaned, `${SOURCE_BASE}/`).href;
}

function assetCandidates(url) {
  const candidates = [url];
  try {
    const parsed = new URL(url);
    const mediaIndex = parsed.pathname.indexOf("/media/");
    if (mediaIndex !== -1) {
      const mediaPath = parsed.pathname.slice(mediaIndex);
      candidates.push(new URL(mediaPath, "https://www.bazhuayu.com/helpcenter/docs/").href);
      candidates.push(new URL(mediaPath, "https://www.bazhuayu.com/").href);
    }
  } catch {}
  return [...new Set(candidates)];
}

async function downloadAsset(url, outputPath) {
  let lastError = null;
  for (const candidate of assetCandidates(url)) {
    try {
      const response = await fetch(candidate, {
        headers: { "user-agent": "Mozilla/5.0", referer: SOURCE_BASE },
      });
      if (!response.ok) {
        lastError = new Error(`Failed to download ${candidate}: ${response.status}`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, bytes);
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Failed to download ${url}`);
}

function imageDimensions(bytes, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (ext === ".gif" && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if ((ext === ".jpg" || ext === ".jpeg") && bytes.length > 4) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

async function localizeImages(hast, page) {
  let imageIndex = 1;
  page.inlineIconPaths = new Set();
  const downloads = [];
  removePlaceholderImages(hast);
  visit(hast, (node) => {
    if (node.type !== "element" || node.tagName !== "img") return;
    const props = node.properties ?? {};
    const rawSrc = props["data-origin"] ?? props.src;
    if (!rawSrc || String(rawSrc).startsWith("data:")) return;

    const remoteUrl = normalizeRemoteUrl(String(rawSrc));
    const fileName = slugFileName(remoteUrl, imageIndex++);
    const assetRel = path.posix.join("assets", "academy", "quick-start", page.fileSlug, fileName);
    const outputPath = path.join(root, ...assetRel.split("/"));
    downloads.push(
      downloadAsset(remoteUrl, outputPath)
        .then((bytes) => {
          const dimensions = imageDimensions(bytes, fileName);
          if (dimensions && dimensions.width <= 80 && dimensions.height <= 80) {
            page.inlineIconPaths.add(`/${assetRel}`);
          }
        })
        .catch((error) => {
          console.warn(`[asset] ${page.sourceSlug}: ${error.message}`);
          props.src = remoteUrl;
        }),
    );
    props.src = `/${assetRel}`;
    props.alt = textFromHtml(String(props.alt ?? props.title ?? page.title ?? ""));
    delete props["data-origin"];
    node.properties = props;
  });
  await Promise.all(downloads);
}

function preserveRemoteMedia(node) {
  visit(node, (child) => {
    if (child.type !== "element" || !["video", "iframe", "source"].includes(child.tagName)) return;
    const props = child.properties ?? {};
    if (props.src) props.src = normalizeRemoteUrl(String(props.src));
    child.properties = props;
  });
}

function escapeAttribute(value = "") {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function compactMarkdown(markdown, page) {
  const inlineIconPaths = page.inlineIconPaths ?? new Set();
  return markdown
    .replace(/https\\?:\/\/[^\s)\u3002\uff0c\uff1b\u3001\uff09]+/g, (url) => url.replace(/\\([:/.])/g, "$1"))
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/<((?!\/?(?:iframe|video|source|br|img)\b)[^>\n]+)>/g, "&lt;$1&gt;")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\\\n(?=\S)/g, "\n\n")
    .replace(/\[\]\(([^)\s]+\.mp4[^)]*)\)/gi, (_, url) => {
      const src = url.replace(/\\([&_*[\]()])/g, "$1");
      return `<video controls src="${src}" width="100%"></video>`;
    })
    .replace(/(^|[\s>:\u3000\uff1a])((?:https?:\/\/)[^\s)\u3002\uff0c\uff1b\u3001\uff09]+)/g, (match, prefix, url) => {
      return `${prefix}[${url}](${url})`;
    })
    .replace(/!\[([^\]]*)\]\((\/assets\/academy\/[^)]+)\)/g, (match, alt, src) => {
      if (!inlineIconPaths.has(src)) return match;
      return `<img src="${src}" alt="${escapeAttribute(alt)}" className="academy-inline-icon" />`;
    })
    .replace(/\]\(([a-zA-Z0-9_-]+)(#[^)]+)?\)/g, (match, slug, hash = "") => {
      const localPath = sourceSlugToPath.get(slug);
      if (localPath) return `](${localPath}${hash})`;
      return `](${SOURCE_BASE}/${slug}${hash})`;
    })
    .replace(/^\s*#\s+.+\n+/, "")
    .replace(/^\s*#{1,6}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function htmlToMarkdown(html, page) {
  const hast = unified().use(rehypeParse, { fragment: true }).parse(html);
  visit(hast, (child) => {
    if (child.type !== "element" || child.tagName !== "a") return;
    const props = child.properties ?? {};
    const href = String(props.href ?? "").replaceAll("\\/", "/").trim();
    if (!href) return;
    const helpLookMatch = href.match(/(?:https?:\/\/www\.bazhuayu\.com)?\/?helpcenter\/docs\/([^/?#]+)/);
    const bareSlug = /^[a-zA-Z0-9_-]+$/.test(href) ? href : "";
    const sourceSlug = helpLookMatch?.[1] ?? bareSlug;
    if (!sourceSlug) return;
    const hash = href.includes("#") ? `#${href.split("#").slice(1).join("#")}` : "";
    const localPath = sourceSlugToPath.get(sourceSlug);
    props.href = localPath ? `${localPath}${hash}` : `${SOURCE_BASE}/${sourceSlug}${hash}`;
    child.properties = props;
  });
  preserveRemoteMedia(hast);
  await localizeImages(hast, page);
  const mdast = toMdast(hast);
  return compactMarkdown(toMarkdown(mdast, { extensions: [gfmToMarkdown()] }), page);
}

async function fetchArticle(sourceSlug) {
  const url = `${API_BASE}/foreground/content/get-content?${new URLSearchParams({ tannant_id: TENANT_ID, slug: sourceSlug })}`;
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0", referer: `${SOURCE_BASE}/${sourceSlug}` },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${sourceSlug}: ${response.status}`);
  const payload = await response.json();
  if (String(payload.code) !== "200") throw new Error(`Unexpected API response for ${sourceSlug}: ${payload.code}`);
  return payload.data;
}

async function assertLocalHtml(page) {
  await fs.access(path.join(LOCAL_HTML_DIR, page.localFile));
}

function outputPathFor(page) {
  return path.join(root, "zh", "academy", "quick-start", page.dir, `${page.fileSlug}.mdx`);
}

async function writeArticle(page) {
  await assertLocalHtml(page);
  const article = await fetchArticle(page.sourceSlug);
  const html = article.content?.content || "";
  page.title = article.name || page.title;
  const markdown = await htmlToMarkdown(html, page);
  const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
  const description = article.seo_desc || article.desc || `快速入门教程：${page.title}`;
  const body = `---\ntitle: "${frontmatterEscape(page.title)}"\ndescription: "${frontmatterEscape(description)}"\nsource: "${sourceUrl}"\n---\n\n${markdown}\n`;
  const outputPath = outputPathFor(page);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body, "utf8");
  return { ...page, path: path.relative(root, outputPath).replaceAll(path.sep, "/").replace(/\.mdx$/, "") };
}

function pagesForSection(section, pages) {
  return pages.filter((page) => page.group === section.group).map((page) => page.path);
}

async function updateDocsJson(pages) {
  const docsPath = path.join(root, "docs.json");
  const docs = JSON.parse(await fs.readFile(docsPath, "utf8"));
  const academyTab = docs.navigation.languages[0].tabs.find((tab) => tab.tab === "采集学院");
  if (!academyTab) throw new Error("docs.json does not contain 采集学院 tab");

  const quickStartNav = {
    group: "快速入门",
    pages: sections.map((section) => ({
      group: section.group,
      pages: pagesForSection(section, pages),
    })),
  };

  academyTab.groups = (academyTab.groups ?? []).filter((group) => group.group !== "快速入门");
  const overviewIndex = academyTab.groups.findIndex((group) => group.group === "概述");
  academyTab.groups.splice((overviewIndex >= 0 ? overviewIndex : 0) + 1, 0, quickStartNav);

  await fs.writeFile(docsPath, `${JSON.stringify(docs, null, 2)}\n`, "utf8");
}

async function main() {
  sourceSlugToPath = await buildExistingSourceSlugMap();
  for (const page of flatPages) {
    sourceSlugToPath.set(page.sourceSlug, `/zh/academy/quick-start/${page.dir}/${page.fileSlug}`);
  }

  await fs.rm(path.join(root, "zh", "academy", "quick-start"), { recursive: true, force: true });
  await fs.rm(path.join(root, "assets", "academy", "quick-start"), { recursive: true, force: true });

  const pages = [];
  for (const page of flatPages) {
    console.log(`Importing ${page.sourceSlug} -> ${page.fileSlug}`);
    pages.push(await writeArticle(page));
  }

  await updateDocsJson(pages);
  console.log(`Imported ${pages.length} quick start pages.`);
}

await main();
