import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const targetDir = path.join(root, "zh", "academy", "case-studies");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.name.endsWith(".mdx")) {
      out.push(full);
    }
  }
  return out;
}

function unwrapWholeLink(text) {
  let current = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const match = current.match(/^\[(.*)\]\((https?:\/\/[^)]+|\/[^)]+)\)$/);
    if (match) {
      current = match[1].trim();
      changed = true;
    }
  }
  return current;
}

function cleanTitleText(text) {
  let value = unwrapWholeLink(text);
  value = value.replace(/\*+/g, "");
  value = value.replace(/\u200B/g, "");
  value = value.replace(/\s+/g, " ").trim();
  return value;
}

function shouldNormalizeBareBold(text) {
  return /^(采集场景|场景介绍|采集字段|主要采集字段|采集结果|教程说明|采集步骤|拓展阅读|补充说明|步骤[一二三四五六七八九十0-9])/u.test(
    text,
  );
}

let changedFiles = 0;
for (const file of walk(targetDir)) {
  const original = fs.readFileSync(file, "utf8");
  const lines = original.split(/\r?\n/);
  const next = lines.map((line) => {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const cleaned = cleanTitleText(heading[2]);
      return `${heading[1]} ${cleaned}`;
    }

    const bareBold = line.match(/^\*\*(.+)\*\*$/);
    if (bareBold) {
      const cleaned = cleanTitleText(bareBold[1]);
      if (shouldNormalizeBareBold(cleaned)) {
        return cleaned;
      }
    }

    return line;
  });

  const updated = next.join("\n");
  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    changedFiles += 1;
  }
}

console.log(`normalized ${changedFiles} files`);
