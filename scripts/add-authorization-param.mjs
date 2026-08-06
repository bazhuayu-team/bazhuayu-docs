import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.join(__dirname, "..", "en", "api-reference");
const SKIP = new Set(["intro.mdx", "authentication.mdx"]);

const AUTH_FIELD = `<ParamField header="Authorization" type="string" required hidden>
</ParamField>`;

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else if (name.endsWith(".mdx")) files.push(full);
  }
  return files;
}

function needsAuthorization(content) {
  if (!/\napi:\s/.test(content)) return false;
  return /## 请求头[\s\S]*?`Authorization`/.test(content);
}

function hasAuthorizationParam(content) {
  return /ParamField header="Authorization"/.test(content);
}

function addAuthorization(content) {
  if (content.includes("<ParamField")) {
    return content.replace(/(\r?\n)(<ParamField)/, `$1${AUTH_FIELD}$1$2`);
  }
  return `${content.trimEnd()}\r\n\r\n${AUTH_FIELD}\r\n`;
}

const updated = [];
for (const file of walk(API_ROOT)) {
  if (SKIP.has(path.basename(file))) continue;
  let content = fs.readFileSync(file, "utf8");
  if (!needsAuthorization(content) || hasAuthorizationParam(content)) continue;
  content = addAuthorization(content);
  fs.writeFileSync(file, content, "utf8");
  updated.push(path.relative(API_ROOT, file).replace(/\\/g, "/"));
}

console.log(`Updated ${updated.length} files:\n${updated.join("\n")}`);
