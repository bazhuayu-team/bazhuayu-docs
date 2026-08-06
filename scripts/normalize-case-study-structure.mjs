import fs from "fs";
import path from "path";

const rootDir = path.join(process.cwd(), "zh", "academy", "case-studies");

const topLevelSections = new Set([
  "采集场景",
  "采集字段",
  "采集结果",
  "教程说明",
  "采集步骤",
  "实战场景",
  "案例说明",
  "采集教程",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (entry.name.endsWith(".mdx")) {
      out.push(fullPath);
    }
  }
  return out;
}

function countAlphaMarkers(text) {
  return (text.match(/(?:^|\s)([a-z])\.\s*/gi) || []).length;
}

function splitAlphaItems(text) {
  const matches = [...text.matchAll(/(?:^|\s)([a-z])\.\s*/gi)];
  if (matches.length <= 1) {
    return [text.trim()];
  }

  const parts = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index + matches[i][0].search(/[a-z]\./i);
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    parts.push(text.slice(start, end).trim());
  }
  return parts.filter(Boolean);
}

function isAlphaItem(text) {
  return /^[a-z]\.\s*/i.test(text.trim());
}

function normalizeSpecialBlock(lines, startIndex) {
  const headerLine = lines[startIndex];
  const isQuote = /^\s*>\s*/.test(headerLine);
  const prefix = isQuote ? "> " : "";
  const headerText = headerLine.replace(/^\s*>\s*/, "").trim();
  const normalized = [];
  let endIndex = startIndex;
  let contentSeen = false;

  const inlineText = headerText.replace(/^\**(特别说明|注意事项)[:：]\**\s*/u, "").trim();
  normalized.push(`${prefix}${headerText.match(/注意事项/u) ? "注意事项：" : "特别说明："}`);
  normalized.push(prefix.trimEnd());

  if (inlineText) {
    for (const part of splitAlphaItems(inlineText)) {
      normalized.push(`${prefix}${isAlphaItem(part) ? `- ${part}` : part}`);
      contentSeen = true;
    }
  }

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const plainLine = rawLine.replace(/^\s*>\s*/, "").trim();
    const nextNonEmpty = (() => {
      for (let j = i + 1; j < lines.length; j += 1) {
        const candidate = lines[j].replace(/^\s*>\s*/, "").trim();
        if (candidate) {
          return candidate;
        }
      }
      return "";
    })();

    if (!line) {
      if (!contentSeen) {
        continue;
      }
      if (isAlphaItem(nextNonEmpty)) {
        continue;
      }
      normalized.push(rawLine);
      endIndex = i;
      break;
    }

    if (/^#{1,6}\s/.test(line) || /^<[^>]+>/.test(line) || /^!\[/.test(line)) {
      endIndex = i - 1;
      break;
    }

    if (!isQuote && /^\s*>/.test(rawLine)) {
      endIndex = i - 1;
      break;
    }

    if (isQuote && !/^\s*>/.test(rawLine)) {
      endIndex = i - 1;
      break;
    }

    if (/^(特别说明|注意事项)[:：]/u.test(plainLine)) {
      endIndex = i - 1;
      break;
    }

    if (/^步骤[一二三四五六七八九十0-9]+[、：]/u.test(plainLine) || topLevelSections.has(plainLine.replace(/\*+/g, "").trim())) {
      endIndex = i - 1;
      break;
    }

    if (countAlphaMarkers(plainLine) > 1) {
      for (const part of splitAlphaItems(plainLine)) {
        normalized.push(`${prefix}${isAlphaItem(part) ? `- ${part}` : part}`);
        contentSeen = true;
      }
    } else {
      normalized.push(`${prefix}${isAlphaItem(plainLine) ? `- ${plainLine}` : plainLine}`);
      contentSeen = true;
    }
    endIndex = i;
  }

  return { normalized, endIndex };
}

function normalizeFile(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let inDetailedSteps = false;
  let inFrontmatter = false;
  let frontmatterFenceCount = 0;
  let frontmatterTitle = "";
  let firstContentLineHandled = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const noQuote = rawLine.replace(/^\s*>\s*/, "").trim();
    const normalizedNoQuote = noQuote.replace(/\*+/g, "").trim();

    if (trimmed === "---" && (i === 0 || inFrontmatter)) {
      frontmatterFenceCount += 1;
      inFrontmatter = frontmatterFenceCount === 1;
      out.push(rawLine);
      continue;
    }

    if (inFrontmatter) {
      const titleMatch = rawLine.match(/^title:\s*"(.+)"\s*$/);
      if (titleMatch) {
        frontmatterTitle = titleMatch[1];
        out.push(rawLine);
        continue;
      }
      if (/^description:\s*/.test(rawLine)) {
        continue;
      }
      out.push(rawLine);
      continue;
    }

    if (!firstContentLineHandled) {
      if (!trimmed) {
        continue;
      }
      if (frontmatterTitle && trimmed === `# ${frontmatterTitle}`) {
        firstContentLineHandled = true;
        continue;
      }
      firstContentLineHandled = true;
    }

    if (normalizedNoQuote === "以下为具体步骤：") {
      inDetailedSteps = true;
      out.push("**以下为具体步骤：**");
      continue;
    }

    if (topLevelSections.has(normalizedNoQuote) && !/^#{1,6}\s/.test(trimmed)) {
      out.push(`**${normalizedNoQuote}**`);
      continue;
    }

    if (topLevelSections.has(normalizedNoQuote) && /^#{1,6}\s/.test(trimmed)) {
      out.push(`**${normalizedNoQuote}**`);
      continue;
    }

    if (/^(特别说明|注意事项)[:：]/u.test(normalizedNoQuote) && !/^#{1,6}\s/.test(trimmed)) {
      const { normalized, endIndex } = normalizeSpecialBlock(lines, i);
      out.push(...normalized);
      i = endIndex;
      continue;
    }

    if (
      inDetailedSteps &&
      /^步骤[一二三四五六七八九十0-9]+[、：]/u.test(normalizedNoQuote) &&
      !/^#{1,6}\s/.test(trimmed)
    ) {
      out.push(`## ${normalizedNoQuote.replace(/：/u, "、")}`);
      continue;
    }

    if (/^#{1,6}\s+以下为具体步骤/.test(trimmed)) {
      inDetailedSteps = true;
      out.push("**以下为具体步骤：**");
      continue;
    }

    if (/^#{1,6}\s+采集教程/.test(trimmed)) {
      out.push("**采集教程**");
      continue;
    }

    if (/^#{1,6}\s+(采集场景|采集字段|采集结果|教程说明|采集步骤|实战场景|案例说明)$/u.test(trimmed)) {
      out.push(`**${trimmed.replace(/^#{1,6}\s+/u, "")}**`);
      continue;
    }

    if (/^#{2,6}\s+/.test(trimmed) && !/^#{2,6}\s+步骤[一二三四五六七八九十0-9]+[、：]/u.test(trimmed)) {
      out.push(`**${trimmed.replace(/^#{2,6}\s+/u, "")}**`);
      continue;
    }

    out.push(rawLine);
  }

  let result = out.join("\n");

  result = result
    .split("\n")
    .map((line) => {
      if (
        line.includes("](") ||
        line.includes("<video") ||
        line.includes("<img") ||
        line.includes("source:") ||
        line.includes("src=\"http")
      ) {
        return line;
      }

      return line.replace(
        /https?\\?:\/\/[^\s<>()\[\]{}"'，。；、]+/g,
        (rawUrl) => {
          const normalizedUrl = rawUrl.replace(/\\([:/.?=&_%-])/g, "$1");
          return `[${normalizedUrl}](${normalizedUrl})`;
        }
      );
    })
    .join("\n");

  result = result
    .replace(/【<上一页】/g, "【&lt;上一页】")
    .replace(/【下一页>】/g, "【下一页&gt;】");

  return result.endsWith("\n") ? result : `${result}\n`;
}

for (const filePath of walk(rootDir)) {
  const before = fs.readFileSync(filePath, "utf8");
  const after = normalizeFile(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after, "utf8");
    console.log(`updated ${path.relative(process.cwd(), filePath)}`);
  }
}
