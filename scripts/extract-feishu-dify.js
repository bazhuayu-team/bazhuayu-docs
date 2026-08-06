const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
const outDir = process.argv[3] || "assets/mcp/dify";

const IMAGE_NAMES = {
  "img-01": "step-1-1-tools.png",
  "img-02": "step-1-2-search.png",
  "img-03": "step-1-3-oauth.png",
  "img-04": "step-1-4-apikey.png",
  "img-05": "step-2-1-tools.png",
  "img-06": "step-2-2-mcp.png",
  "img-07": "step-2-3-add-mcp.png",
  "img-08": "step-2-4-config.png",
  "img-09": "step-2-5-auth.png",
  "img-10": "step-2-6-success.png",
  "img-11": "step-3-create-a.png",
  "img-12": "step-3-create-b.png",
  "img-13": "step-3-1-model.png",
  "img-14": "step-3-2-tools.png",
  "img-15": "step-3-4-knowledge-a.png",
  "img-16": "step-3-4-knowledge-b.png",
  "img-17": "step-3-test.png",
  "img-18": "step-3-publish-a.png",
  "img-19": "step-3-publish-b.png",
};

const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const content = parsed.result?.value?.content || [];

fs.mkdirSync(outDir, { recursive: true });

let saved = 0;
for (const item of content) {
  if (item.kind !== "image" || !item.data) continue;
  const fileName = IMAGE_NAMES[item.imgName] || `${item.imgName}.png`;
  const file = path.join(outDir, fileName);
  const b64 = item.data.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log("wrote", file, fs.statSync(file).size, `${item.w}x${item.h}`);
  saved++;
}

console.log(`\nSaved ${saved} images to ${outDir}`);
