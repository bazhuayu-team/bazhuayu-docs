import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(root, "assets");
const docsRoot = path.join(root, "zh");
const minimumBytes = 1024 * 1024;
const write = process.argv.includes("--write");
const normalize = process.argv.includes("--normalize");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

async function walk(directory, predicate) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath, predicate));
    else if (predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

function assetUrl(file) {
  return `/${path.relative(root, file).replace(/\\/g, "/")}`;
}

function mediaPaths(gif) {
  const base = gif.slice(0, -path.extname(gif).length);
  return { mp4: `${base}.mp4`, poster: `${base}.webp` };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited with ${code}`)));
  });
}

function escapeAttribute(value = "") {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function videoEmbed(alt, mp4, poster) {
  return `\n\n<video className="tutorial-animation" controls preload="none" playsInline poster="${poster}" aria-label="${escapeAttribute(alt || "教程演示动画")}">\n  <source src="${mp4}" type="video/mp4" />\n  您的浏览器不支持视频播放，请更新浏览器后重试。\n</video>\n\n`;
}

function normalizeTutorialVideoBlocks(source) {
  // MDX requires a block-level JSX element to be separated from Markdown prose.
  let next = source.replace(/^.*?<video className="tutorial-animation"/gm, (line) => {
    const videoStart = line.indexOf("<video");
    const prefix = line.slice(0, videoStart);
    return `${prefix.trimEnd()}\n\n${line.slice(videoStart)}`;
  });
  next = next.replace(/<\/video>(?!\r?\n[\t ]*\r?\n)/g, "</video>\n\n");
  return next.replace(/(<\/video>)\r?\n(?:[\t ]*\r?\n)+$/, "$1\n");
}

const gifs = await walk(assetsRoot, (file) => path.extname(file).toLowerCase() === ".gif");
const candidates = [];
for (const gif of gifs) {
  const stat = await fs.stat(gif);
  if (stat.size >= minimumBytes) candidates.push({ gif, bytes: stat.size, ...mediaPaths(gif) });
}

const docs = await walk(docsRoot, (file) => /\.mdx?$/i.test(file));
const references = new Map(candidates.map((candidate) => [assetUrl(candidate.gif), []]));
for (const file of docs) {
  const source = await fs.readFile(file, "utf8");
  for (const url of references.keys()) if (source.includes(url)) references.get(url).push(file);
}

const used = candidates.filter((candidate) => references.get(assetUrl(candidate.gif)).length > 0);
const summary = {
  mode: write ? "write" : normalize ? "normalize" : "check",
  largeGifCount: candidates.length,
  referencedLargeGifCount: used.length,
  sourceMegabytes: Number((used.reduce((total, item) => total + item.bytes, 0) / 1024 / 1024).toFixed(2)),
  converted: [],
  updatedDocuments: 0,
};

if (write) {
  for (const candidate of used) {
    const mp4Tmp = `${candidate.mp4}.tmp.mp4`;
    const posterTmp = `${candidate.poster}.tmp.webp`;
    // H.264 requires even dimensions; preserve the aspect ratio while capping width.
    const scale = "scale=w='trunc(min(1280,iw)/2)*2':h=-2:flags=lanczos";
    await runFfmpeg(["-i", candidate.gif, "-vf", `${scale},fps=15`, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Tmp]);
    await runFfmpeg(["-i", candidate.gif, "-frames:v", "1", "-vf", scale, "-c:v", "libwebp", "-q:v", "72", posterTmp]);
    await fs.rename(mp4Tmp, candidate.mp4);
    await fs.rename(posterTmp, candidate.poster);
    const mp4Bytes = (await fs.stat(candidate.mp4)).size;
    const posterBytes = (await fs.stat(candidate.poster)).size;
    summary.converted.push({ asset: assetUrl(candidate.gif), sourceBytes: candidate.bytes, mp4Bytes, posterBytes });
  }

}

if (write || normalize) {
  for (const file of docs) {
    const source = await fs.readFile(file, "utf8");
    let next = source;
    if (write) {
      for (const candidate of used) {
        const gifUrl = assetUrl(candidate.gif).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(${gifUrl}(?:\\s+["'][^"']*["'])?\\)`, "g");
        next = next.replace(pattern, (_match, alt) => videoEmbed(alt, assetUrl(candidate.mp4), assetUrl(candidate.poster)));
        const imagePattern = new RegExp(`<img\\b([^>]*?)\\bsrc=(["'])${gifUrl}\\2([^>]*)\\/?>(?!<\\/img>)`, "gi");
        next = next.replace(imagePattern, (match) => {
          const alt = match.match(/\\balt=(["'])(.*?)\\1/i)?.[2] ?? "";
          return videoEmbed(alt, assetUrl(candidate.mp4), assetUrl(candidate.poster));
        });
      }
    }
    next = normalizeTutorialVideoBlocks(next);
    if (next !== source) {
      await fs.writeFile(file, next, "utf8");
      summary.updatedDocuments += 1;
    }
  }

}

if (write) {
  for (const candidate of used) await fs.unlink(candidate.gif);
}

console.log(JSON.stringify(summary, null, 2));
