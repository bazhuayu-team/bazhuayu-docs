import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(root, "zh");
const write = process.argv.includes("--write");

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.mdx?$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function countMatches(source, pattern) {
  return Array.from(source.matchAll(pattern)).length;
}

function descriptionFor(file, title) {
  const relative = path.relative(docsRoot, file).replace(/\\/g, "/");
  if (relative.startsWith("academy/video/")) return `观看“${title}”视频教程。`;
  if (relative.startsWith("academy/case-studies/")) return `学习如何使用八爪鱼完成“${title}”数据采集。`;
  if (relative.startsWith("academy/troubleshooting/")) return `了解“${title}”的排查方法与解决方案。`;
  if (relative.startsWith("api-reference/")) return `介绍“${title}”接口的功能、参数与调用方法。`;
  return `介绍“${title}”的功能与使用方法。`;
}

function addMissingDescription(source, file, issues) {
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch || /^description:\s*.+$/m.test(frontmatterMatch[1])) return source;

  const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
  if (!titleMatch) return source;

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const title = titleMatch[1].trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const description = descriptionFor(file, title);
  issues.generatedDescriptions += 1;
  return source.replace(/^title:.*$/m, (line) => `${line}${eol}description: "${description}"`);
}

function normalizeBody(source, issues) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const hadFinalEol = source.endsWith("\n");
  const lines = source.split(/\r?\n/);
  const output = [];
  let fence = null;

  for (const originalLine of lines) {
    let line = originalLine;
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      output.push(line);
      continue;
    }

    if (!fence) {
      if (/^[\t \u00a0]*\\[\t \u00a0]*$/.test(line)) {
        issues.standaloneSlashes += 1;
        line = "";
      } else if (/^[\t \u00a0]+$/.test(line) && line.includes("\u00a0")) {
        issues.nonBreakingSpaceLines += 1;
        line = "";
      } else if (/^#{1,6}[\t \u00a0]*(?:\*+)?[\t \u00a0]*$/.test(line)) {
        issues.emptyHeadings += 1;
        line = "";
      } else {
        const imageHeading = line.match(/^#{1,6}\s+(\*{0,2})(!\[[^\]]*\]\([^)]+\))\1\s*$/);
        if (imageHeading) {
          issues.imageHeadings += 1;
          line = imageHeading[2];
        }
      }

      const heading = line.match(/^(#{1,6}[\t ]+)(.+)$/);
      if (heading && /\*/.test(heading[2])) {
        issues.headingEmphasis += 1;
        line = `${heading[1]}${heading[2].replace(/\*+/g, "").trim()}`;
      }

      const repeatedStrongMarkers = (line.match(/\*{4,}/g) ?? []).length;
      if (repeatedStrongMarkers > 0) {
        issues.repeatedStrongMarkers += repeatedStrongMarkers;
        line = line.replace(/\*{4,}/g, "");
      }

      if (line.includes("下文其他图片同理") && /\*/.test(line) && line !== "*点击查看高清大图，下文其他图片同理*") {
        issues.malformedImageNotes += 1;
        line = "*点击查看高清大图，下文其他图片同理*";
      }

      if (/^\*\*<video\b/i.test(line)) {
        issues.htmlMediaEmphasis += 1;
        line = line.slice(2);
      } else if (/^\s*\*\*\s*$/.test(line)) {
        issues.htmlMediaEmphasis += 1;
        line = "";
      }

      line = line.replace(/(\]\(\/assets\/[^)\s]+)\s+(\))/g, (_match, start, end) => {
        issues.assetPathWhitespace += 1;
        return `${start}${end}`;
      });
      line = line.replace(/((?:src|poster)=["']\/assets\/[^"']*?)[\t \u00a0]+(["'])/g, (_match, start, end) => {
        issues.assetPathWhitespace += 1;
        return `${start}${end}`;
      });
      if (/(?<!\\)\\[\t \u00a0]*$/.test(line)) {
        issues.trailingSlashes += 1;
        line = line.replace(/\\[\t \u00a0]*$/, "");
      }

      const escapedUrlSchemes = (line.match(/\bhttps?\\:\/\//g) ?? []).length;
      if (escapedUrlSchemes > 0) {
        issues.escapedUrlSchemes += escapedUrlSchemes;
        line = line.replaceAll("https\\://", "https://").replaceAll("http\\://", "http://");
      }

      const insecureTencentHost = "http://1251101074.vod2.myqcloud.com";
      const insecureTencentMedia = line.split(insecureTencentHost).length - 1;
      if (insecureTencentMedia > 0) {
        issues.insecureTencentMedia += insecureTencentMedia;
        line = line.replaceAll(insecureTencentHost, "https://1251101074.vod2.myqcloud.com");
      }
    }

    output.push(line);
  }

  let next = output.join(eol);
  if (hadFinalEol && !next.endsWith(eol)) next += eol;
  return next;
}

const summary = {
  mode: write ? "write" : "check",
  filesScanned: 0,
  changedFiles: 0,
  fixable: {
    standaloneSlashes: 0,
    nonBreakingSpaceLines: 0,
    emptyHeadings: 0,
    imageHeadings: 0,
    assetPathWhitespace: 0,
    trailingSlashes: 0,
    escapedUrlSchemes: 0,
    insecureTencentMedia: 0,
    generatedDescriptions: 0,
    headingEmphasis: 0,
    repeatedStrongMarkers: 0,
    malformedImageNotes: 0,
    htmlMediaEmphasis: 0,
  },
  warnings: {
    escapedUrls: 0,
    httpMedia: 0,
    nestedAnchors: 0,
    missingTitles: 0,
    missingDescriptions: 0,
  },
  assets: {
    references: 0,
    missing: [],
  },
};

const files = await walk(docsRoot);
summary.filesScanned = files.length;

for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  const issues = {
    standaloneSlashes: 0,
    nonBreakingSpaceLines: 0,
    emptyHeadings: 0,
    imageHeadings: 0,
    assetPathWhitespace: 0,
    trailingSlashes: 0,
    escapedUrlSchemes: 0,
    insecureTencentMedia: 0,
    generatedDescriptions: 0,
    headingEmphasis: 0,
    repeatedStrongMarkers: 0,
    malformedImageNotes: 0,
    htmlMediaEmphasis: 0,
  };
  const next = normalizeBody(addMissingDescription(source, file, issues), issues);

  for (const [key, value] of Object.entries(issues)) summary.fixable[key] += value;
  summary.warnings.escapedUrls += countMatches(source, /https?\\:\/\//g);
  summary.warnings.httpMedia += countMatches(source, /(?:src|poster)=["']http:\/\//g);
  summary.warnings.nestedAnchors += countMatches(source, /<a\b[^>]*>\s*<a\b/gi);

  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  if (!/^title:\s*.+$/m.test(frontmatter)) summary.warnings.missingTitles += 1;
  if (!/^description:\s*.+$/m.test(frontmatter)) summary.warnings.missingDescriptions += 1;

  const assetMatches = source.matchAll(/(?:!\[[^\]]*\]\(|(?:src|poster)=["'])(\/assets\/[^)\s"']+)/g);
  for (const match of assetMatches) {
    summary.assets.references += 1;
    const assetPath = path.join(root, ...match[1].slice(1).split("/"));
    try {
      await fs.access(assetPath);
    } catch {
      summary.assets.missing.push({
        document: `/${path.relative(root, file).replace(/\\/g, "/")}`,
        asset: match[1],
      });
    }
  }

  if (write && next !== source) {
    await fs.writeFile(file, next);
    summary.changedFiles += 1;
  }
}

console.log(JSON.stringify(summary, null, 2));

const fixableCount = Object.values(summary.fixable).reduce((total, value) => total + value, 0);
if ((!write && fixableCount > 0) || summary.assets.missing.length > 0 || summary.warnings.nestedAnchors > 0) {
  process.exitCode = 1;
}
