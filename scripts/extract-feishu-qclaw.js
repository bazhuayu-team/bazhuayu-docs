const fs = require("fs");
const path = require("path");

const jsonPath = process.argv[2];
const outDir = process.argv[3] || "assets/mcp/qclaw";

const IMAGE_NAMES = {
  "img-01": "step-1-1-download.png",
  "img-02": "step-1-2-login.png",
  "img-03": "step-2-1-add-mcp.png",
  "img-04": "step-2-2-dialogue.png",
  "img-05": "step-2-3-connected.png",
  "img-06": "step-2-4-model-default.png",
  "img-07": "step-2-5-model-custom.png",
  "img-08": "step-2-6-persona.png",
  "img-09": "step-2-7-channel.png",
  "img-10": "step-2-8-app.png",
  "img-11": "step-2-9-tasks.png",
  "img-12": "step-2-10-skills.png",
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
