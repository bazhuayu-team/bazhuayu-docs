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
const HTML_DIR = "D:/工作/html";

const sections = [
  {
    group: "数据处理（格式化）",
    dir: "data-processing",
    pages: [
      ["字段格式化", "dR29V2", "field-formatting"],
      ["字段合并", "QBKtqb", "field-merge"],
      ["添加特殊字段", "wNil3e", "add-special-fields"],
      ["自定义抓取方式", "WoDMcd", "custom-extraction-method"],
      ["无此字段时如何处理", "ocsCPR", "missing-field-handling"],
      ["设置备用位置", "diZtWC", "backup-location"],
      ["数据去重", "AMkU9y", "deduplicate-data"],
      ["正则表达式", "lweEtU", "regular-expression"],
    ],
  },
  {
    group: "特殊流程步骤介绍",
    dir: "special-steps",
    pages: [
      ["返回上一级网页", "fan-hui-shang-yi-ji-wang-ye", "return-to-previous-page"],
      ["鼠标移动出现新数据", "hZLTY4", "hover-to-load-data"],
      ["循环下拉框（切换下拉选项）", "GYA3P9", "loop-dropdown-options"],
      ["判断条件", "EiGV1Z", "conditions"],
    ],
  },
  {
    group: "流程设置",
    dir: "workflow-settings",
    pages: [
      ["获取/修改浏览器UA", "qie-huan-liu-lan-qi-UA", "browser-user-agent"],
      ["触发器", "Vja5wT", "trigger"],
      ["网址批量输入（补充用法）", "I0LCzr", "bulk-url-input-extra"],
      ["增量采集", "zeng-liang-cai-ji", "incremental-collection"],
      ["网页包含iframe框架处理办法", "t3auZp", "iframe-page-handling"],
      ["json采集", "NaoIII", "json-collection"],
    ],
  },
  {
    group: "技巧操作",
    dir: "tips",
    pages: [
      ["点击展开获取全文-微博为例", "dian-ji-zhan-kai-huo-qu-quan-wen-wei-bo-wei-li", "click-expand-full-text-weibo"],
      ["断点采集（采集中断，需要采集后续数据）", "duan-dian-cai-ji-cai-ji-zhong-duan-xu-yao-cai-ji-hou-xu-shu-ju", "resume-interrupted-collection"],
      ["ajax加载网页进入详情页无法正常返回到列表", "ajax-jia-zai-wang-ye-jin-ru-xiang-qing-ye-wu-fa-zheng-chang-fan-hui-dao-lie-biao", "ajax-detail-return-list"],
    ],
    children: [
      {
        group: "RPA相关",
        dir: "rpa",
        pages: [
          ["采集器数据导入飞书表格（RPA实现）", "cai-ji-qi-shu-ju-dao-ru-fei-shu-biao-ge-RPA-shi-xian", "import-data-to-feishu-rpa"],
          ["采集数据（通过RPA）批量任务导出excel", "cai-ji-shu-ju-tong-guo-RPA-pi-liang-ren-wu-dao-chu-excel", "batch-export-excel-rpa"],
        ],
      },
    ],
  },
];

const flatPages = sections.flatMap((section) => [
  ...section.pages.map(([title, sourceSlug, fileSlug]) => ({
    title,
    group: section.group,
    dir: section.dir,
    sourceSlug,
    fileSlug,
  })),
  ...(section.children ?? []).flatMap((child) =>
    child.pages.map(([title, sourceSlug, fileSlug]) => ({
      title,
      group: section.group,
      childGroup: child.group,
      dir: path.posix.join(section.dir, child.dir),
      sourceSlug,
      fileSlug,
    })),
  ),
]);

const sourceSlugToPath = new Map(
  flatPages.map((page) => [
    page.sourceSlug,
    `/zh/academy/advanced-features/${page.dir}/${page.fileSlug}`,
  ]),
);

const existingSourceSlugToPath = new Map([
  ["DG6r1f", "/zh/academy/basic-collection/beginner/custom-collection"],
  ["XVRM9w", "/zh/academy/basic-collection/beginner/list-collection"],
  ["uMCrEt", "/zh/academy/basic-collection/beginner/list-to-detail"],
  ["bIYWS6", "/zh/academy/basic-collection/beginner/table-collection"],
  ["dian-ji-yuan-su-tiao-zhuan", "/zh/academy/basic-collection/beginner/click-to-jump"],
  ["amPLH3", "/zh/academy/basic-collection/beginner/login-verification"],
  ["8H82NJ", "/zh/academy/basic-collection/beginner/collection-logic"],
  ["ben-di-cai-ji-fang-shi", "/zh/academy/basic-collection/beginner/local-collection"],
  ["S9DkcF", "/zh/academy/basic-collection/pagination/next-page-button"],
  ["iaUIik", "/zh/academy/basic-collection/pagination/scroll-loading-pagination"],
  ["8TVujR", "/zh/academy/basic-collection/pagination/load-more-button-pagination"],
  ["fHVc3P", "/zh/academy/basic-collection/pagination/scroll-and-collect"],
  ["Td2V7m", "/zh/academy/basic-collection/pagination/click-load-more-and-collect"],
  ["lbkGWs", "/zh/academy/basic-collection/pagination/number-pagination"],
  ["2DUt4F", "/zh/academy/basic-collection/bulk-input/text-loop-keywords"],
  ["GmOVea", "/zh/academy/basic-collection/bulk-input/url-loop-similar-pages"],
]);

for (const [slug, localPath] of existingSourceSlugToPath) sourceSlugToPath.set(slug, localPath);

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
    return src && src !== "load.gif" && !src.startsWith("data:");
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
    const query = href.includes("?") ? href.slice(href.indexOf("?"), href.includes("#") ? href.indexOf("#") : undefined) : "";
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
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return bytes;
}

function imageDimensions(bytes, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (ext === ".gif" && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
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
    const assetRel = path.posix.join("assets", "academy", "advanced-features", page.fileSlug, fileName);
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
    .replace(/\\\[/g, "[")
    .replace(/\\\]/g, "]")
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/g, "[$1]($1)")
    .replace(/<((?!\/?(?:iframe|video|source|br|img)\b)[^>\n]+)>/g, "&lt;$1&gt;")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\[\]\(([^)\s]+\.mp4[^)]*)\)/gi, (_, url) => {
      const src = url.replace(/\\([&_*[\]()])/g, "$1");
      return `<video controls src="${src}" width="100%"></video>`;
    })
    .replace(/\(\?</g, "(?&lt;")
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
  preserveRemoteMedia(hast);
  await localizeImages(hast, page);
  const mdast = toMdast(hast);
  return compactMarkdown(toMarkdown(mdast, { extensions: [gfmToMarkdown()] }), page);
}

function extractEditorHtmlFromLocal(html) {
  if (!html || html.includes("504 Gateway Time-out")) return "";
  const idIndex = html.indexOf("hl-edior3");
  if (idIndex < 0) return "";
  const start = html.indexOf(">", idIndex);
  if (start < 0) return "";
  const markers = [
    '<div class="flex flex-col items-center',
    '<div class="hl-article-footer',
    '<div class="hl-bottom',
    'class="hl-toc',
    'class="hl-article-bottom',
  ];
  let end = html.length;
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker, start + 1);
    if (markerIndex > start && markerIndex < end) end = markerIndex;
  }
  return html.slice(start + 1, end);
}

async function readLocalHtml(page) {
  const candidates = [
    `${page.title}.html`,
    page.title.replace("/", "").replace("获取修改", "获取修改") + ".html",
    page.title.replace("获取/修改", "获取修改") + ".html",
    page.title.replace("办法", "方法") + ".html",
  ];
  for (const name of candidates) {
    const filePath = path.join(HTML_DIR, name);
    try {
      const html = await fs.readFile(filePath, "utf8");
      const content = extractEditorHtmlFromLocal(html);
      if (content) return content;
    } catch {
      // keep trying candidates
    }
  }
  return "";
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
  return path.join(root, "zh", "academy", "advanced-features", page.dir, `${page.fileSlug}.mdx`);
}

async function writeArticle(page) {
  const article = await fetchArticle(page.sourceSlug);
  const html = article.content?.content || "";
  page.title = article.name || page.title;
  const markdown = await htmlToMarkdown(html, page);
  const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
  const description = article.seo_desc || article.desc || `介绍八爪鱼采集器进阶功能：${page.title}。`;
  const body = `---\ntitle: "${frontmatterEscape(page.title)}"\ndescription: "${frontmatterEscape(description)}"\nsource: "${sourceUrl}"\n---\n\n${markdown}\n`;
  const outputPath = outputPathFor(page);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, body, "utf8");
  return {
    ...page,
    path: path.relative(root, outputPath).replaceAll(path.sep, "/").replace(/\.mdx$/, ""),
  };
}

function card(title, href, description) {
  return `<Card title="${frontmatterEscape(title)}" href="${href}">\n  ${description}\n</Card>`;
}

function pagesForSection(section, pages) {
  const directPages = pages
    .filter((page) => page.group === section.group && !page.childGroup)
    .map((page) => page.path);
  const childGroups = (section.children ?? []).map((child) => ({
    group: child.group,
    pages: pages.filter((page) => page.group === section.group && page.childGroup === child.group).map((page) => page.path),
  }));
  return [...directPages, ...childGroups];
}

async function updateDocsJson(pages) {
  const docsPath = path.join(root, "docs.json");
  const docs = JSON.parse(await fs.readFile(docsPath, "utf8"));
  const tabs = docs.navigation.languages[0].tabs;
  const academyTab = tabs.find((tab) => tab.tab === "采集学院");
  if (!academyTab) throw new Error("docs.json does not contain 采集学院 tab");
  const guideGroup = academyTab.groups?.find((group) => group.group === "操作指南");
  if (!guideGroup) throw new Error("docs.json does not contain 操作指南 group");
  const advancedNav = {
    group: "进阶功能",
    pages: [
      ...sections.map((section) => ({
        group: section.group,
        pages: pagesForSection(section, pages),
      })),
    ],
  };
  guideGroup.pages = (guideGroup.pages ?? []).filter((item) => item?.group !== "进阶功能");
  guideGroup.pages.push(advancedNav);
  await fs.writeFile(docsPath, `${JSON.stringify(docs, null, 2)}\n`, "utf8");
}

async function main() {
  await fs.rm(path.join(root, "zh", "academy", "advanced-features"), { recursive: true, force: true });
  await fs.rm(path.join(root, "assets", "academy", "advanced-features"), { recursive: true, force: true });

  const pages = [];
  for (const page of flatPages) {
    console.log(`Importing ${page.sourceSlug} -> ${page.fileSlug}`);
    pages.push(await writeArticle(page));
  }
  await updateDocsJson(pages);
  console.log(`Imported ${pages.length} advanced feature pages.`);
}

await main();
