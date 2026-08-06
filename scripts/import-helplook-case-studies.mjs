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
    group: "电商",
    dir: "ecommerce",
    pages: [
      ["【京东】商品列表采集", "vOELFx", "jd-product-list"],
      ["【京东】商品评价采集", "GbAlIH", "jd-product-reviews"],
      ["【京东】商品详情页采集", "eYW3hC", "jd-product-detail"],
      ["【京东】商品list列表采集", "DO9Tpt", "jd-product-list-alt"],
      ["【京东】采集场景汇总", "CmGyhd", "jd-scenarios-overview"],
      ["【京东】商品轮播图采集下载", "jing-dong-shang-pin-lun-bo-tu-cai-ji-xia-zai", "jd-carousel-download"],
      ["【淘宝】商品列表页采集", "jEn5z9", "taobao-product-list"],
      ["【Amazon】商品评论采集", "jtJjlo", "amazon-product-reviews"],
      ["【Amazon】商品列表页采集", "77G16M", "amazon-product-list"],
      ["【Amazon】商品详情页采集", "HDW4r2", "amazon-product-detail"],
      ["【速卖通】AliExpress(速卖通)关键词搜索采集商品信息", "QLu99s", "aliexpress-keyword-products"],
      ["【百度爱采购】关键词搜索厂家", "X63SGz", "baidu-aigou-suppliers"],
      ["百度爱采购关键词搜索商品", "s9G1u8", "baidu-aigou-products"],
      ["【速卖通】AliExpress(速卖通)商品评价", "VFrvAo", "aliexpress-product-reviews"],
    ],
  },
  {
    group: "社交媒体",
    dir: "social-media",
    pages: [
      ["【微博】评论采集（只采一级评论）", "r7dFc3", "weibo-first-level-comments"],
      ["【微博】搜索关键词采集", "OGo3db", "weibo-keyword-search"],
      ["【微博】博主主页的博文", "WFEMUY", "weibo-author-posts"],
      ["【搜狗微信】搜索关键词采集", "sou-gou-wei-xin-sou-suo-guan-jian-ci-cai-ji", "sogou-wechat-keyword-search"],
      ["【搜狗微信】文章列表和详情页正文采集", "AxBDMv", "sogou-wechat-list-and-detail"],
      ["【知乎】关键词搜索采集", "SkL3fZ", "zhihu-keyword-search"],
      ["【知乎】近期热榜采集", "zhi-hu-jin-qi-re-bang-cai-ji", "zhihu-hot-ranking"],
      ["【哔哩哔哩】视频采集", "kLsdjN", "bilibili-video-collection"],
      ["【B站】UP主主页视频采集", "OcDG4q", "bilibili-up-videos"],
      ["【B站】视频详情页数据采集", "uOyBiq", "bilibili-video-detail"],
      ["【B站】按类目标签采集视频", "3hXzjL", "bilibili-category-videos"],
      ["【豆瓣】热门电影采集", "bsuKzb", "douban-hot-movies"],
      ["【豆瓣】图书评论采集", "KfW4lO", "douban-book-reviews"],
      ["【豆瓣】电影短评采集", "dou-ban-dian-ying-duan-ping-cai-ji", "douban-movie-short-reviews"],
      ["【快手】关键词视频采集", "kuai-shou-guan-jian-ci-shi-pin-cai-ji", "kuaishou-keyword-videos"],
      ["【快手】个人账号视频采集", "kuai-shou-ge-ren-zhang-hao-shi-pin-cai-ji", "kuaishou-account-videos"],
      ["【微信公众号】文章采集（反爬较严重）", "wei-xin-gong-zhong-hao-wen-zhang-cai-ji-fan-pa-jiao-yan-zhong", "wechat-articles-anti-crawl"],
    ],
  },
  {
    group: "新闻资讯",
    dir: "news",
    pages: [
      ["【今日头条】头条号文章采集", "SCdWQP", "toutiao-author-articles"],
      ["【全国公共资源交易平台】用触发器采集当天最新招标数据", "quan-guo-gong-gong-zi-yuan-jiao-yi-ping-tai-yong-chu-fa-qi-cai-ji-dang-tian-zui-xin-zhao-biao-shu-ju", "public-resources-trigger-bids"],
      ["【今日头条】首页新闻采集", "xJh31I", "toutiao-home-news"],
      ["【搜狐】时政新闻采集", "sou-hu-shi-zheng-xin-wen-cai-ji", "sohu-politics-news"],
      ["【界面新闻】批量搜索关键词采集列表+详情", "jie-mian-xin-wen-pi-liang-sou-suo-guan-jian-ci-cai-ji-lie-biao-xiang-qing", "jiemian-keyword-list-detail"],
      ["【澎湃新闻】图文按顺序采集新闻正文", "peng-pai-xin-wen-an-tu-wen-an-shun-xu-cai-ji-xin-wen-zheng-wen", "thepaper-ordered-article-content"],
      ["【腾讯新闻】视频采集与导出", "shi-pin-cai-ji-xia-zai-fang-shi", "tencent-news-video-export"],
      ["【政府网站】采集正文及下载文中附件", "zheng-fu-wang-zhan-fu-jian-xia-zai", "gov-article-and-attachments"],
      ["【维普网】关键词搜索文献采集", "wei-pu-wang-guan-jian-ci-sou-suo-wen-xian-cai-ji", "cqvip-keyword-papers"],
      ["【人民网】首页新闻采集", "ren-min-wang-shou-ye-xin-wen-cai-ji", "people-home-news"],
      ["【新华网】关键词搜索采集", "xin-hua-wang-guan-jian-ci-sou-suo-cai-ji", "xinhuanet-keyword-search"],
      ["【央视新闻】关键词搜索列表采集", "yang-shi-xin-wen-guan-jian-ci-sou-suo-lie-biao-cai-ji", "cctv-keyword-list"],
    ],
  },
  {
    group: "房产",
    dir: "real-estate",
    pages: [
      ["【百姓网】短租房源数据采集", "WecuLu", "baixing-short-rental-listings"],
      ["【房天下】房源数据采集", "iVO0Zf", "fang-home-listings"],
      ["【58同城】民宿短租数据采集", "9o4uKv", "58-short-rental-listings"],
      ["【黄河口信息港】房源数据采集", "eVGXYN", "huanghekou-home-listings"],
      ["【房天下】二手房数据采集", "iJLXdM", "fang-second-hand-housing"],
    ],
  },
  {
    group: "生活服务",
    dir: "life-services",
    pages: [
      ["【百度图片】采集与导出", "mOW8t5", "baidu-images-export"],
      ["【百度地图】列表采集", "LJDdmk", "baidu-map-list"],
      ["【58同城】职位信息采集", "PbzsFA", "58-job-listings"],
      ["中国天气网数据采集", "4nxt2f", "weather-china-data"],
      ["【天眼查】企业信息采集", "SZ51ko", "tianyancha-company-info"],
      ["【携程】景点评价采集", "TT3Kzl", "ctrip-attraction-reviews"],
      ["【携程】游记攻略采集", "xie-cheng-you-ji-gong-lyue-cai-ji", "ctrip-travel-guides"],
      ["【智联招聘】智联招聘职位数据采集", "Pf4Q6V", "zhaopin-job-listings"],
      ["【国聘】招聘职位数据采集", "guo-pin-zhao-pin-zhi-wei-shu-ju-cai-ji", "iguopin-job-listings"],
      ["【百度】搜索结果采集", "V8f8zt", "baidu-search-results"],
    ],
  },
  {
    group: "金融",
    dir: "finance",
    pages: [
      ["【东方财富】定向增发股数据采集", "WXAzqs", "eastmoney-private-placement"],
      ["【同花顺】基金净值数据采集", "7tzrij", "10jqka-fund-nav"],
      ["【银保监】官网政策公告采集", "eyxkrQ", "cbirc-policy-announcements"],
      ["【雪球】热帖评论采集", "15dMlG", "xueqiu-hot-post-comments"],
      ["【股吧】股票评论采集", "w9DTXu", "guba-stock-comments"],
      ["【财联社】财经信息短报采集", "cai-lian-she-cai-jing-xin-xi-duan-bao-cai-ji", "cls-finance-briefs"],
      ["【国家统计局】筛选指定年份下月度指标数据", "guo-jia-tong-ji-ju-shai-xuan-zhi-ding-nian-fen-xia-yue-du-zhi-biao-shu-ju", "stats-monthly-indicators"],
    ],
  },
];

const flatPages = sections.flatMap((section) =>
  section.pages.map(([title, sourceSlug, fileSlug]) => ({
    title,
    group: section.group,
    dir: section.dir,
    sourceSlug,
    fileSlug,
  })),
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
  const cleanUrl = new URL(url);
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

async function buildExistingSourceSlugMap() {
  const map = new Map();
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
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
  for (const page of flatPages) {
    map.set(page.sourceSlug, `/zh/academy/case-studies/${page.dir}/${page.fileSlug}`);
  }
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
    const assetRel = path.posix.join("assets", "academy", "case-studies", page.fileSlug, fileName);
    const outputPath = path.join(root, ...assetRel.split("/"));
    const fallbackSrc = remoteUrl;
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
          props.src = fallbackSrc;
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
    .replace(/<=/g, "&lt;=")
    .replace(/>=/g, "&gt;=")
    .replace(/!\[([^\]]*)\]\((\/assets\/academy\/[^)]+)\)/g, (match, alt, src) => {
      if (!inlineIconPaths.has(src)) return match;
      return `<img src="${src}" alt="${escapeAttribute(alt)}" className="academy-inline-icon" />`;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function htmlToMarkdown(html, page, sourceSlugToPath) {
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
    const query = href.includes("?") ? href.slice(href.indexOf("?"), href.includes("#") ? href.indexOf("#") : undefined) : "";
    const localPath = sourceSlugToPath.get(sourceSlug);
    props.href = localPath ? `${localPath}${hash}` : `${SOURCE_BASE}/${sourceSlug}${query}${hash}`;
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

function outputPathFor(page) {
  return path.join(root, "zh", "academy", "case-studies", page.dir, `${page.fileSlug}.mdx`);
}

async function writeArticle(page, sourceSlugToPath) {
  const article = await fetchArticle(page.sourceSlug);
  const html = article.content?.content || "";
  page.title = article.name || page.title;
  const markdown = await htmlToMarkdown(html, page, sourceSlugToPath);
  const sourceUrl = `${SOURCE_BASE}/${page.sourceSlug}`;
  const description = article.seo_desc || article.desc || `实战案例：${page.title}。`;
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
  const tabs = docs.navigation.languages[0].tabs;
  const academyTab = tabs.find((tab) => tab.tab === "采集学院");
  if (!academyTab) throw new Error("docs.json does not contain 采集学院 tab");
  const caseStudiesGroup = {
    group: "实战案例",
    pages: sections.map((section) => ({
      group: section.group,
      pages: pagesForSection(section, pages),
    })),
  };
  academyTab.groups = (academyTab.groups ?? []).filter((item) => item?.group !== "实战案例");
  academyTab.groups.push(caseStudiesGroup);
  await fs.writeFile(docsPath, `${JSON.stringify(docs, null, 2)}\n`, "utf8");
}

async function main() {
  await fs.rm(path.join(root, "zh", "academy", "case-studies"), { recursive: true, force: true });
  await fs.rm(path.join(root, "assets", "academy", "case-studies"), { recursive: true, force: true });
  const sourceSlugToPath = await buildExistingSourceSlugMap();
  const pages = [];
  for (const page of flatPages) {
    console.log(`Importing ${page.sourceSlug} -> ${page.fileSlug}`);
    pages.push(await writeArticle(page, sourceSlugToPath));
  }
  await updateDocsJson(pages);
  console.log(`Imported ${pages.length} case-study pages.`);
}

await main();
