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

const sections = [
  {
    group: "基本采集 / 初级采集",
    dir: "beginner",
    pages: [
      ["DG6r1f", "custom-collection"],
      ["XVRM9w", "list-collection"],
      ["uMCrEt", "list-to-detail"],
      ["bIYWS6", "table-collection"],
      ["dian-ji-yuan-su-tiao-zhuan", "click-to-jump"],
      ["amPLH3", "login-verification"],
      ["8H82NJ", "collection-logic"],
      ["ben-di-cai-ji-fang-shi", "local-collection"],
    ],
  },
  {
    group: "基本采集 / 翻页采集多页数据",
    dir: "pagination",
    pages: [
      ["S9DkcF", "next-page-button"],
      ["iaUIik", "scroll-loading-pagination"],
      ["8TVujR", "load-more-button-pagination"],
      ["fHVc3P", "scroll-and-collect"],
      ["Td2V7m", "click-load-more-and-collect"],
      ["lbkGWs", "number-pagination"],
    ],
  },
  {
    group: "基本采集 / 多关键词多网址采集",
    dir: "bulk-input",
    pages: [
      ["2DUt4F", "text-loop-keywords"],
      ["GmOVea", "url-loop-similar-pages"],
    ],
  },
];

const flatPages = sections.flatMap((section) =>
  section.pages.map(([sourceSlug, fileSlug]) => ({
    group: section.group,
    dir: section.dir,
    sourceSlug,
    fileSlug,
  })),
);

const sourceSlugToPath = new Map(
  flatPages.map((page) => [
    page.sourceSlug,
    `/zh/academy/basic-collection/${page.dir}/${page.fileSlug}`,
  ]),
);

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

function sanitizeText(value = "") {
  return decodeEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textFromHtml(html = "") {
  return sanitizeText(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function slugFileName(url, index) {
  let cleanUrl;
  try {
    cleanUrl = new URL(url);
  } catch {
    cleanUrl = new URL(`https://resource-wangsu.helplook.net/${encodeURIComponent(url)}`);
  }
  const ext = path.extname(cleanUrl.pathname).split(/[?#]/)[0] || ".png";
  const base = path.basename(cleanUrl.pathname, ext).replace(/[^a-zA-Z0-9_-]/g, "-") || `image-${index}`;
  return `${String(index).padStart(2, "0")}-${base}${ext}`;
}

function visit(node, fn) {
  fn(node);
  if (node.children) {
    for (const child of node.children) visit(child, fn);
  }
}

function removePlaceholderImages(node) {
  if (!node.children) return;
  node.children = node.children.filter((child) => {
    if (child.type !== "element" || child.tagName !== "img") return true;
    const src = String(child.properties?.src ?? "").trim();
    return src && src !== "load.gif";
  });
  for (const child of node.children) removePlaceholderImages(child);
}

function rewriteLinks(node) {
  visit(node, (child) => {
    if (child.type !== "element" || child.tagName !== "a") return;
    const props = child.properties ?? {};
    const href = String(props.href ?? "").replaceAll("\\/", "/").trim();
    if (!href) return;

    const helpLookMatch = href.match(/(?:https?:\/\/www\.bazhuayu\.com)?\/?helpcenter\/docs\/([^/?#]+)/);
    const bareSlug = /^[a-zA-Z0-9_-]+$/.test(href) ? href : "";
    const sourceSlug = helpLookMatch?.[1] ?? bareSlug;
    if (!sourceSlug) return;

    const hash = href.includes("#") ? `#${href.split("#").slice(1).join("#")}` : "";
    const query = href.includes("?") ? href.slice(href.indexOf("?")) : "";
    const localPath = sourceSlugToPath.get(sourceSlug);
    props.href = localPath ? `${localPath}${hash}` : `${SOURCE_BASE}/${sourceSlug}${query}${hash}`;
    child.properties = props;
  });
}

function normalizeRemoteUrl(src) {
  const cleaned = decodeEntities(String(src ?? "")).replaceAll("\\/", "/").trim();
  if (!cleaned || cleaned.startsWith("data:")) return cleaned;
  if (cleaned.startsWith("//")) return `https:${cleaned}`;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return new URL(cleaned, "https://resource-wangsu.helplook.net").href;
}

async function downloadAsset(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: SOURCE_BASE,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return bytes;
}

function imageDimensions(bytes, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png" && bytes.length >= 24) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (ext === ".gif" && bytes.length >= 10) {
    return {
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    };
  }
  if ((ext === ".jpg" || ext === ".jpeg") && bytes.length > 4) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
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
    const rawSrc = props.src;
    if (!rawSrc || String(rawSrc).startsWith("data:")) return;

    const remoteUrl = normalizeRemoteUrl(String(rawSrc));
    const fileName = slugFileName(remoteUrl, imageIndex++);
    const assetRel = path.posix.join(
      "assets",
      "academy",
      "basic-collection",
      page.fileSlug,
      fileName,
    );
    const outputPath = path.join(root, ...assetRel.split("/"));
    downloads.push(
      downloadAsset(remoteUrl, outputPath).then((bytes) => {
        const dimensions = imageDimensions(bytes, fileName);
        if (dimensions && dimensions.width <= 80 && dimensions.height <= 80) {
          page.inlineIconPaths.add(`/${assetRel}`);
        }
      }),
    );
    props.src = `/${assetRel}`;
    props.alt = textFromHtml(String(props.alt ?? props.title ?? page.title ?? ""));
    node.properties = props;
  });
  await Promise.all(downloads);
}

function escapeAttribute(value = "") {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function compactMarkdown(markdown, page) {
  const inlineIconPaths = page.inlineIconPaths ?? new Set();
  return markdown
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/<((?!\/?(?:iframe|video|source)\b)[^>\n]+)>/g, "&lt;$1&gt;")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\[\]\(([^)\s]+\.mp4[^)]*)\)/gi, (_, url) => {
      const src = url.replace(/\\([&_*[\]()])/g, "$1");
      return `<video controls src="${src}" width="100%"></video>`;
    })
    .replace(/!\[([^\]]*)\]\((\/assets\/academy\/[^)]+)\)/g, (match, alt, src) => {
      if (!inlineIconPaths.has(src)) return match;
      return `<img src="${src}" alt="${escapeAttribute(alt)}" className="academy-inline-icon" />`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function htmlToMarkdown(html, page) {
  const hast = unified().use(rehypeParse, { fragment: true }).parse(html);
  rewriteLinks(hast);
  await localizeImages(hast, page);
  const mdast = toMdast(hast);
  return compactMarkdown(toMarkdown(mdast, { extensions: [gfmToMarkdown()] }), page);
}

async function fetchArticle(sourceSlug) {
  const url = `${API_BASE}/foreground/content/get-content?${new URLSearchParams({
    tannant_id: TENANT_ID,
    slug: sourceSlug,
  })}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: `${SOURCE_BASE}/${sourceSlug}`,
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${sourceSlug}: ${response.status}`);
  const payload = await response.json();
  if (String(payload.code) !== "200") {
    throw new Error(`Unexpected API response for ${sourceSlug}: ${payload.code}`);
  }
  return payload.data;
}

function outputPathFor(page) {
  return path.join(root, "zh", "academy", "basic-collection", page.dir, `${page.fileSlug}.mdx`);
}

async function writeArticle(page) {
  const article = await fetchArticle(page.sourceSlug);
  page.title = article.name;
  const html = article.content?.content ?? "";
  const description = `${article.name}教程，来自八爪鱼帮助中心「操作指南 / 基本采集」。`;
  let markdown = await htmlToMarkdown(html, page);
  if (page.fileSlug === "custom-collection") {
    markdown = `## 课程导览\n\n${markdown}`;
  }
  const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
  const body = `---\ntitle: "${frontmatterEscape(article.name)}"\ndescription: "${frontmatterEscape(description)}"\nsource: "${sourceUrl}"\n---\n\n${markdown}\n`;
  const outputPath = outputPathFor(page);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body, "utf8");
  return {
    ...page,
    title: article.name,
    path: path.relative(root, outputPath).replaceAll(path.sep, "/").replace(/\.mdx$/, ""),
  };
}

function card(title, href, description) {
  return `<Card title="${frontmatterEscape(title)}" href="${href}">\n  ${description}\n</Card>`;
}

async function writeIndex(pages) {
  const byGroup = new Map();
  for (const page of pages) {
    if (!byGroup.has(page.group)) byGroup.set(page.group, []);
    byGroup.get(page.group).push(page);
  }

  const parts = [
    "---",
    'title: "采集学院"',
    'description: "八爪鱼采集器基础采集教程，覆盖初级采集、翻页采集、多关键词和多网址采集。"',
    "---",
    "",
    "# 采集学院",
    "",
    "这里收录八爪鱼采集器的基础采集教程。首批内容来自帮助中心的「操作指南 / 基本采集」，适合从自定义采集、列表采集、翻页采集开始系统学习。",
    "",
  ];

  for (const [group, groupPages] of byGroup) {
    parts.push(`## ${group}`, "", "<CardGroup cols={2}>");
    for (const page of groupPages) {
      parts.push(card(page.title, `/${page.path}`, `来源：${page.sourceSlug}`), "");
    }
    parts.push("</CardGroup>", "");
  }

  await fs.writeFile(path.join(root, "zh", "academy", "index.mdx"), `${parts.join("\n").trim()}\n`, "utf8");
}

async function removeOldAcademy() {
  await fs.rm(path.join(root, "zh", "academy"), { recursive: true, force: true });
  await fs.rm(path.join(root, "assets", "academy"), { recursive: true, force: true });
}

async function updateDocsJson(pages) {
  const docsPath = path.join(root, "docs.json");
  const docs = JSON.parse(await fs.readFile(docsPath, "utf8"));
  const tabs = docs.navigation.languages[0].tabs;
  const academyTab = {
    tab: "采集学院",
    groups: [
      {
        group: "概述",
        pages: ["zh/academy/index"],
      },
      {
        group: "操作指南",
        pages: [
          {
            group: "基本采集",
            pages: sections.map((section) => ({
              group: section.group.replace("基本采集 / ", ""),
              pages: pages
                .filter((page) => page.group === section.group)
                .map((page) => page.path),
            })),
          },
        ],
      },
    ],
  };

  const withoutAcademy = tabs.filter((tab) => tab.tab !== "采集学院");
  const homeIndex = withoutAcademy.findIndex((tab) => tab.tab === "首页");
  withoutAcademy.splice(homeIndex + 1, 0, academyTab);
  docs.navigation.languages[0].tabs = withoutAcademy;
  await fs.writeFile(docsPath, `${JSON.stringify(docs, null, 2)}\n`, "utf8");
}

async function main() {
  await removeOldAcademy();
  const pages = [];
  for (const page of flatPages) {
    console.log(`Importing ${page.sourceSlug} -> ${page.fileSlug}`);
    pages.push(await writeArticle(page));
  }
  await writeIndex(pages);
  await updateDocsJson(pages);
  console.log(`Imported ${pages.length} academy pages.`);
}

await main();
