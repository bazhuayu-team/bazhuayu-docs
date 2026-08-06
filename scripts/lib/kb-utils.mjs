import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "..", "..");

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(target, fallback) {
  if (!(await pathExists(target))) return fallback;
  return JSON.parse(await fs.readFile(target, "utf8"));
}

export async function writeJsonAtomic(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function walkFiles(directory, predicate = () => true) {
  const files = [];
  async function walk(current) {
    if (!(await pathExists(current))) return;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (predicate(full, entry)) files.push(full);
    }
  }
  await walk(directory);
  return files;
}

export function escapeYaml(value = "") {
  return String(value)
    .replace(/[\u0000-\u001f]/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFrontmatter(source = "") {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { attributes: {}, body: source };
  const attributes = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!item) continue;
    let value = item[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replaceAll('\\"', '"');
    }
    attributes[item[1]] = value;
  }
  return { attributes, body: match[2] };
}

export function stripMarkdown(source = "") {
  return String(source)
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}[#>*-]+\s?/gm, " ")
    .replace(/^\s*\d+[.、]\s?/gm, " ")
    .replace(/[\*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeText(source = "") {
  return stripMarkdown(source)
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:'"“”‘’()（）\[\]{}<>《》]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(source = "") {
  const normalized = normalizeText(source);
  const tokens = new Set();
  for (const word of normalized.match(/[a-z0-9][a-z0-9._/-]*/g) ?? []) {
    if (word.length > 1) tokens.add(word);
  }
  const chinese = normalized.replace(/[^\u4e00-\u9fff]/g, "");
  for (let index = 0; index < chinese.length; index += 1) {
    tokens.add(chinese[index]);
    if (index + 1 < chinese.length) tokens.add(chinese.slice(index, index + 2));
  }
  return [...tokens].filter((token) => token.trim());
}

export function extractSteps(markdown = "") {
  const steps = [];
  for (const line of String(markdown).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]|\d+[.、])\s+(.+)$/);
    if (!match) continue;
    const text = stripMarkdown(match[1]);
    if (text.length >= 4) steps.push(text.slice(0, 180));
    if (steps.length === 8) break;
  }
  return steps;
}

export function excerpt(markdown = "", maximum = 360) {
  const text = stripMarkdown(markdown);
  if (text.length <= maximum) return text;
  const boundary = text.slice(0, maximum).search(/[。！？；.!?;](?!.*[。！？；.!?;])/);
  return `${text.slice(0, boundary > 120 ? boundary + 1 : maximum).trim()}…`;
}

export function relativeRoute(file) {
  return `/${path.relative(root, file).replaceAll(path.sep, "/").replace(/\.mdx$/, "")}`;
}

export async function buildSourceRouteMap() {
  const map = new Map();
  const files = await walkFiles(path.join(root, "zh"), (file) => file.endsWith(".mdx"));
  for (const file of files) {
    const { attributes } = parseFrontmatter(await fs.readFile(file, "utf8"));
    if (!attributes.source) continue;
    const match = attributes.source.match(/helpcenter\/docs\/([^"?#/]+)/);
    if (match) map.set(match[1], relativeRoute(file));
  }
  return map;
}

export function sourceTypeForRoute(route = "") {
  if (route.startsWith("/zh/product") || route === "/zh/overview") return "product";
  if (route.startsWith("/zh/academy")) return "academy";
  if (route.startsWith("/zh/knowledge-base/faq")) return "faq";
  return "other";
}
