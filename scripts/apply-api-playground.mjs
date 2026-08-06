import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.join(__dirname, "..", "en", "api-reference");
const SKIP = new Set(["intro.mdx", "authentication.mdx"]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (name.endsWith(".mdx")) files.push(full);
  }
  return files;
}

function parseEndpoint(content) {
  const m = content.match(/## 端点\s*\r?\n+```[^\n]*\r?\n([\s\S]*?)```/);
  if (!m) return null;
  const line = m[1].trim().split("\n")[0].trim();
  const mm = line.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(https:\S+)/i);
  if (mm) return { method: mm[1].toUpperCase(), url: mm[2] };
  if (/^https?:\/\//i.test(line))
    return { method: "POST", url: line.replace(/\/$/, "") };
  return null;
}

function parseTableParams(content, sectionName) {
  const re = new RegExp(
    `## ${sectionName}\\s*\\n+\\|[^\\n]+\\|\\s*\\n\\|[^\\n]+\\|\\s*\\n([\\s\\S]*?)(?=\\n## |\\n\\*\\*|$)`,
  );
  const m = content.match(re);
  if (!m) return [];
  const rows = m[1].trim().split("\n");
  const params = [];
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;
    const name = cells[0].replace(/`/g, "");
    const type = cells[1];
    const required = cells[2] === "是";
    if (!name || name === "参数") continue;
    params.push({ name, type, required });
  }
  return params;
}

function mapType(t) {
  const x = (t || "").toLowerCase();
  if (x.includes("bool")) return "boolean";
  if (x.includes("int") || x.includes("number")) return "number";
  return "string";
}

function buildParamFields(content, method) {
  const lines = [];
  const seen = new Set();

  const add = (location, p) => {
    const key = `${location}:${p.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const type = mapType(p.type);
    const req = p.required ? " required" : "";
    const def =
      p.name === "Content-Type"
        ? ' default="application/json"'
        : "";
    if (location === "header") {
      lines.push(
        `<ParamField header="${p.name}" type="${type}"${def}${req} hidden>\n</ParamField>`,
      );
    } else if (location === "query") {
      lines.push(
        `<ParamField query="${p.name}" type="${type}"${req} hidden>\n</ParamField>`,
      );
    } else {
      lines.push(
        `<ParamField body="${p.name}" type="${type}"${req} hidden>\n</ParamField>`,
      );
    }
  };

  for (const p of parseTableParams(content, "请求头")) {
    add("header", p);
  }

  const bodyParams = parseTableParams(content, "请求体");
  const queryParams = parseTableParams(content, "查询参数");
  const bodyIsQuery =
    method === "GET" ||
    /## 请求体[\s\S]*?```\nhttps?:\/\/[^\n]*\?/.test(content);

  for (const p of queryParams) add("query", p);
  for (const p of bodyParams) add(bodyIsQuery ? "query" : "body", p);

  return lines.join("\n");
}

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  if (/\napi:\s/.test(content)) {
    return { file: filePath, status: "skip" };
  }

  const endpoint = parseEndpoint(content);
  if (!endpoint) {
    return { file: filePath, status: "no-endpoint" };
  }

  const rel = path.relative(API_ROOT, filePath).replace(/\\/g, "/");
  const auth =
    rel.startsWith("access-token/") ? "none" : "bearer";

  const apiLine = `api: ${endpoint.method} ${endpoint.url}`;
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { file: filePath, status: "no-frontmatter" };

  const newFm = `---\n${fm[1].trim()}\n${apiLine}\nplayground: interactive\nauthMethod: ${auth}\n---`;
  content = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, newFm);

  const paramBlock = buildParamFields(content, endpoint.method);
  if (paramBlock) {
    content = content.trimEnd() + "\n\n" + paramBlock + "\n";
  }

  if (rel === "cloud-extraction/get-statuses.mdx") {
    content = content.replace(
      /```\nhttps:\/\/openapi\.bazhuayu\.com\/cloudextraction\/statuses\n```/,
      "```\nPOST https://openapi.bazhuayu.com/cloudextraction/statuses\n```",
    );
  }

  fs.writeFileSync(filePath, content, "utf8");
  return { file: rel, status: "ok", api: apiLine };
}

const results = [];
for (const file of walk(API_ROOT)) {
  if (SKIP.has(path.basename(file))) continue;
  results.push(patchFile(file));
}

console.log(JSON.stringify(results, null, 2));
