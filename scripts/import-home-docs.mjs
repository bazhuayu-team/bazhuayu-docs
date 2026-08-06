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

const pages = [
  {
    title: "什么是八爪鱼采集器？",
    localFile: "什么是八爪鱼采集器？.html",
    sourceSlug: "oxiwrD",
    output: "zh/product/intro/what-is-octoparse",
    assetSlug: "what-is-octoparse",
  },
  {
    title: "八爪鱼采集器的优势和特点",
    localFile: "八爪鱼采集器的优势和特点.html",
    sourceSlug: "cGBpf7",
    output: "zh/product/intro/features",
    assetSlug: "features",
  },
  {
    title: "八爪鱼采集器和八爪鱼RPA的区别",
    localFile: "八爪鱼采集器和八爪鱼RPA的区别.html",
    sourceSlug: "ba-zhua-yu-cai-ji-qi-he-ba-zhua-yu-RPA-de-qu-bie",
    output: "zh/product/intro/octoparse-vs-rpa",
    assetSlug: "octoparse-vs-rpa",
  },
  {
    title: "使用须知",
    localFile: "使用须知.html",
    sourceSlug: "w34ej9",
    output: "zh/product/intro/usage-notice",
    assetSlug: "usage-notice",
  },
  {
    title: "计费概述",
    localFile: "计费概述.html",
    sourceSlug: "AgjGy4",
    output: "zh/product/pricing/overview",
    assetSlug: "pricing-overview",
  },
  {
    title: "不同套餐版本",
    localFile: "不同套餐版本.html",
    sourceSlug: "PwIe4F",
    output: "zh/product/pricing/plans",
    assetSlug: "plans",
  },
  {
    title: "模板计费",
    localFile: "模板计费.html",
    sourceSlug: "RQBceQ",
    output: "zh/product/pricing/template",
    assetSlug: "template",
  },
  {
    title: "验证码计费",
    localFile: "验证码计费.html",
    sourceSlug: "lnAABN",
    output: "zh/product/pricing/captcha",
    assetSlug: "captcha",
  },
  {
    title: "代理IP计费",
    localFile: "代理IP计费.html",
    sourceSlug: "dai-li-IP-ji-fei",
    output: "zh/product/pricing/proxy-ip",
    assetSlug: "proxy-ip",
  },
  {
    title: "一对一远程服务",
    localFile: "一对一远程服务.html",
    sourceSlug: "4qdMh5",
    output: "zh/product/pricing/remote-service",
    assetSlug: "remote-service",
  },
  {
    title: "数据定制和模板定制计费",
    localFile: "数据定制和模板定制计费.html",
    sourceSlug: "AHb9F8",
    output: "zh/product/pricing/custom-service",
    assetSlug: "custom-service",
  },
];

const internalSlugMap = new Map([
  ...pages.map((page) => [page.sourceSlug, `/${page.output}`]),
  ["dai-li-IP", "/zh/academy/premium-features/paid-features/proxy-ip"],
  ["zi-dong-da-ma", "/zh/academy/premium-features/paid-features/auto-captcha"],
  ["yun-cai-ji-jie-shao-B550", "/zh/academy/premium-features/cloud-collection/cloud-collection-intro"],
  ["xin-yun-cai-ji-shi-yong-fang-fa-han-ding-shi-yun-cai-ji-wei-bian-ji-wan-quan-jin-zhi-fa-bu", "/zh/academy/premium-features/cloud-collection/scheduled-cloud-collection"],
  ["yun-cai-ji-yuan-li-ji-gui-ze-jia-su-yuan-li", "/zh/academy/premium-features/cloud-collection/cloud-rule-acceleration"],
  ["x70uLO", "/zh/academy/premium-features/cloud-collection/cloud-collection-logs"],
  ["lnO7c2", "/zh/academy/premium-features/cloud-collection/cloud-run-records"],
  ["wen-jian-xia-zai-ge-ren-ban-ji-yi-shang-zhuan-xiang", "/zh/academy/data-export/file-download"],
]);

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

function normalizeRemoteUrl(src) {
  const cleaned = decodeEntities(String(src ?? "")).replaceAll("\\/", "/").trim();
  if (!cleaned || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("../media/")) return new URL(cleaned.replace(/^\.\.\//, ""), `${SOURCE_BASE}/`).href;
  if (cleaned.startsWith("media/")) return new URL(cleaned, `${SOURCE_BASE}/`).href;
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
    const assetRel = path.posix.join("assets", "home", page.assetSlug, fileName);
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
    .replace(/!\[([^\]]*)\]\((\/assets\/home\/[^)]+)\)/g, (match, alt, src) => {
      if (!inlineIconPaths.has(src)) return match;
      return `<img src="${src}" alt="${escapeAttribute(alt)}" className="home-inline-icon" />`;
    })
    .replace(/\]\(([a-zA-Z0-9_-]+)(#[^)]+)?\)/g, (match, slug, hash = "") => {
      const localPath = internalSlugMap.get(slug);
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
    const localPath = internalSlugMap.get(sourceSlug);
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
  const localPath = path.join(LOCAL_HTML_DIR, page.localFile);
  await fs.access(localPath);
}

function descriptionFor(page, article) {
  const raw = article.seo_desc || article.desc || "";
  const clean = textFromHtml(raw);
  if (clean) return clean;
  if (page.output.includes("/pricing/")) return `${page.title}，介绍八爪鱼采集器相关计费规则、适用版本和注意事项。`;
  return `${page.title}，介绍八爪鱼采集器产品能力、适用场景和使用说明。`;
}

async function writeArticle(page) {
  await assertLocalHtml(page);
  const article = await fetchArticle(page.sourceSlug);
  const html = article.content?.content || "";
  const title = article.name || page.title;
  const markdown = await htmlToMarkdown(html, { ...page, title });
  const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
  const body = `---\ntitle: "${frontmatterEscape(title)}"\ndescription: "${frontmatterEscape(descriptionFor(page, article))}"\nsource: "${sourceUrl}"\n---\n\n${markdown}\n`;
  const outputPath = path.join(root, `${page.output}.mdx`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body, "utf8");
  return page.output;
}

async function main() {
  await fs.rm(path.join(root, "assets", "home"), { recursive: true, force: true });
  const outputs = [];
  for (const page of pages) {
    outputs.push(await writeArticle(page));
    console.log(`[home] ${page.title} -> ${page.output}`);
  }
  console.log(`[home] imported ${outputs.length} pages`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
