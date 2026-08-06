const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
const outDir = process.argv[3] || "assets/mcp/coze";

const IMAGE_NAMES = {
  "img-01": "step-1-1.png",
  "img-02": "step-1-2.png",
  "img-03": "step-2-1.png",
  "img-04": "step-2-2.png",
  "img-05": "step-2-3-a.png",
  "img-06": "step-2-3-b.png",
  "img-07": "step-2-3-c.png",
  "img-08": "step-2-3-d.png",
  "img-09": "step-2-4-a.png",
  "img-10": "step-2-4-b.png",
  "img-11": "step-3-create-a.png",
  "img-12": "step-3-create-b.png",
  "img-13": "step-4-params.png",
  "img-14": "step-5-1-model.png",
  "img-15": "step-5-2-1-a.png",
  "img-16": "step-5-2-1-b.png",
  "img-17": "step-5-2-1-c.png",
  "img-18": "step-5-2-1-d.png",
  "img-19": "step-5-2-1-e.png",
  "img-20": "step-5-2-2-a.png",
  "img-21": "step-5-2-2-b.png",
  "img-22": "step-5-2-2-c.png",
  "img-23": "step-5-4-knowledge.png",
  "img-24": "step-3-test.png",
  "img-25": "step-3-publish-a.png",
  "img-26": "step-3-publish-b.png",
  "img-27": "step-3-publish-c.png",
  "img-28": "step-3-publish-d.png",
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
