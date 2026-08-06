import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanDecision,
  createRebuildQueue,
  legacyApprovedContent,
} from "../lib/kb-review-decision.mjs";

test("verified decisions preserve the complete Markdown answer", () => {
  const content = "## 结论\n\n请按以下步骤操作。\n\n1. 打开客户端\n2. 保存任务\n\n![示意图](/assets/example.png)";
  const decision = cleanDecision({ status: "verified", approvedContent: content, note: "已核对" }, () => "2026-07-15T00:00:00.000Z");
  assert.equal(decision.approvedContent, content);
  assert.equal(decision.status, "verified");
  assert.equal(decision.updatedAt, "2026-07-15T00:00:00.000Z");
});

test("verified decisions reject an empty answer and blocked decisions require a reason", () => {
  assert.throws(() => cleanDecision({ status: "verified", approvedContent: "空" }), /至少需要/);
  assert.throws(() => cleanDecision({ status: "blocked", blockReason: "" }), /必须选择原因/);
  assert.equal(cleanDecision({ status: "blocked", blockReason: "内容已过时" }).blockReason, "内容已过时");
});

test("legacy structured answers remain readable", () => {
  assert.equal(
    legacyApprovedContent({ approvedAnswer: "先确认页面可以打开。", approvedSteps: ["检查网络", "重新运行"] }),
    "先确认页面可以打开。\n\n- 检查网络\n- 重新运行",
  );
});

test("rebuild requests are coalesced and rerun once when requested during a build", async () => {
  let builds = 0;
  let release;
  const firstBuild = new Promise((resolve) => { release = resolve; });
  const queue = createRebuildQueue(async () => {
    builds += 1;
    if (builds === 1) await firstBuild;
  });
  queue.schedule();
  queue.schedule();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(builds, 1);
  queue.schedule();
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(builds, 2);
  assert.equal(queue.status().status, "ready");
});
