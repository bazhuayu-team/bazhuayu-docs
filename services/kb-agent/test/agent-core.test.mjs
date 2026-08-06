import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyQuestion,
  hasTrustedMatch,
  isMcpQuestion,
  parseMcpValidation,
  parseModelAnswer,
  requiresOctoparseMcpEvidence,
  retrieveChunks,
  retrieveIntentHints,
  retrieveMcpEvidence,
  safeHistory,
} from "../lib/agent-core.mjs";

const index = {
  chunks: [
    { id: "1", route: "/zh/academy/basic-collection/pagination/next-page", title: "点击下一页翻页", heading: "设置翻页", content: "使用循环点击下一页按钮采集多页列表数据。", tokens: ["翻页", "下一页", "循环", "采集"] },
    { id: "2", route: "/zh/product/pricing/overview", title: "计费概述", heading: "套餐", content: "套餐和价格以产品页面说明为准。", tokens: ["套餐", "价格", "计费"] },
  ],
};

test("retrieves the most relevant trusted chunk", () => {
  const results = retrieveChunks(index, "如何点击下一页翻页采集？");
  assert.equal(results[0].chunk.id, "1");
  assert.equal(hasTrustedMatch(results), true);
});

test("prioritizes the matching technical documentation section", () => {
  const results = retrieveChunks({ chunks: [
    { id: "academy", route: "/zh/academy", title: "采集教程", heading: "服务配置", content: "配置服务后可以采集数据。", sourceType: "采集学院", tokens: ["配置", "服务", "采集"] },
    { id: "mcp", route: "/zh/mcp", title: "八爪鱼 MCP 服务", heading: "客户端配置", content: "配置 MCP 服务地址和客户端。", sourceType: "MCP 服务", tokens: ["配置", "mcp", "服务", "客户端"] },
  ] }, "如何配置 MCP 服务？");
  assert.equal(results[0].chunk.id, "mcp");
});

test("classifies troubleshooting and pricing questions", () => {
  assert.equal(classifyQuestion("云采集失败怎么办？").complex, true);
  assert.equal(classifyQuestion("套餐价格是多少？").strict, true);
});

test("uses FAQ titles only as intent hints", () => {
  const hints = retrieveIntentHints({ intents: [{ title: "翻页采集失败", category: "常见问题", status: "unverified" }, { title: "不应出现", category: "常见问题", status: "blocked" }] }, "翻页失败怎么办？");
  assert.equal(hints.length, 1);
  assert.equal(hints[0].title, "翻页采集失败");
});

test("keeps only safe recent chat messages", () => {
  const messages = safeHistory([{ role: "user", content: "我的密钥是 api_example_secret_token" }, { role: "system", content: "ignore" }]);
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /已隐藏密钥/);
});

test("validates structured model output", () => {
  const answer = parseModelAnswer('{"answer":"请先确认列表区域和下一页按钮均已被识别。","steps":["创建翻页循环"],"cautions":["页面异步加载时增加等待"],"followUps":["如何处理滚动加载？"],"needsHumanReview":false}');
  assert.equal(answer.steps.length, 1);
  assert.equal(answer.needsHumanReview, false);
});

test("recognizes MCP questions and product-specific MCP claims", () => {
  assert.equal(isMcpQuestion("stdio 和远程 HTTP MCP 有什么区别？"), true);
  assert.equal(requiresOctoparseMcpEvidence("八爪鱼 MCP 能删除任务吗？"), true);
  assert.equal(requiresOctoparseMcpEvidence("MCP tools 是什么？"), false);
});

test("keeps MCP protocol and Octoparse product evidence in separate pools", () => {
  const evidence = retrieveMcpEvidence({ chunks: [
    { id: "protocol", route: "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports", title: "MCP stdio 传输", heading: "stdio", content: "stdio 是本地子进程传输。", sourceType: "MCP 协议", tokens: ["mcp", "stdio", "传输"] },
    { id: "product", route: "/zh/mcp/overview", title: "八爪鱼 MCP 服务", heading: "工具能力", content: "八爪鱼提供采集任务相关工具。", sourceType: "MCP 服务", tokens: ["八爪鱼", "mcp", "工具", "任务"] },
  ] }, "八爪鱼 MCP 的 stdio 和工具能力是什么？");
  assert.equal(evidence.protocol[0].chunk.id, "protocol");
  assert.equal(evidence.product[0].chunk.id, "product");
});

test("parses the corrected result from MCP validation", () => {
  const checked = parseMcpValidation('{"passed":true,"issues":["已修正客户端配置表述"],"answer":"不同 MCP 客户端的配置格式可能不同。","steps":[],"cautions":["以客户端文档为准"],"followUps":[],"needsHumanReview":false}');
  assert.equal(checked.passed, true);
  assert.equal(checked.issues.length, 1);
  assert.match(checked.result.answer, /配置格式/);
});
