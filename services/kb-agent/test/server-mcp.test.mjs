import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("测试 Agent 未能启动。");
}

test("MCP answers are double checked and an invalid review never leaks the draft", async (context) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "kb-agent-mcp-"));
  const agentIndexPath = path.join(temporary, "agent-index.json");
  const intentIndexPath = path.join(temporary, "intent-index.json");
  await fs.writeFile(agentIndexPath, JSON.stringify({
    protocolBaseline: { version: "2025-11-25", status: "stable" },
    chunks: [
      { id: "protocol", route: "https://modelcontextprotocol.io/specification/2025-11-25/server/tools", title: "MCP Tools", heading: "工具语义", content: "协议定义工具发现和调用，具体工具取决于服务端实现。", sourceType: "MCP 协议", tokens: ["mcp", "协议", "工具", "服务端"] },
      { id: "product", route: "/zh/mcp/overview", title: "八爪鱼 MCP 服务", heading: "工具能力", content: "产品资料列出了搜索和运行采集任务的工具，没有声明删除任务工具。", sourceType: "MCP 服务", tokens: ["八爪鱼", "mcp", "删除", "任务", "工具"] },
    ],
  }), "utf8");
  await fs.writeFile(intentIndexPath, JSON.stringify({ intents: [] }), "utf8");

  let upstreamCalls = 0;
  const upstream = http.createServer(async (request, response) => {
    let raw = "";
    for await (const part of request) raw += part;
    const payload = JSON.parse(raw);
    upstreamCalls += 1;
    const validationCall = payload.messages.some((message) => String(message.content).includes("事实复核器"));
    const invalidReview = payload.messages.some((message) => String(message.content).includes("复核失败"));
    const content = validationCall
      ? invalidReview
        ? "not-json"
        : JSON.stringify({ passed: true, issues: ["已修正产品能力表述"], answer: "MCP 协议只定义工具调用语义；八爪鱼产品资料未声明支持删除任务。", steps: [], cautions: ["协议能力不等于产品实现"], followUps: [], needsHumanReview: false })
      : JSON.stringify({ answer: "所有 MCP 都能删除任务，这是绝不能直接展示的初稿。", steps: [], cautions: [], followUps: [], needsHumanReview: false });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  const upstreamPort = await listen(upstream);
  const agentPort = await freePort();
  const serverPath = path.resolve("services/kb-agent/server.mjs");
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "test-only-key",
      DEEPSEEK_API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      KB_AGENT_PORT: String(agentPort),
      KB_AGENT_INDEX_PATH: agentIndexPath,
      KB_AGENT_INTENT_INDEX_PATH: intentIndexPath,
      KB_AGENT_ALLOWED_ORIGINS: "http://localhost:3999",
    },
    stdio: "ignore",
  });
  context.after(async () => {
    child.kill();
    await new Promise((resolve) => upstream.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  await waitForHealth(agentPort);

  const ask = async (question) => {
    const response = await fetch(`http://127.0.0.1:${agentPort}/v1/ask`, {
      method: "POST",
      headers: { origin: "http://localhost:3999", "content-type": "application/json" },
      body: JSON.stringify({ question, messages: [] }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  const checked = await ask("八爪鱼 MCP 能删除任务吗？");
  assert.equal(checked.validation.passed, true);
  assert.equal(checked.validation.protocolVersion, "2025-11-25");
  assert.match(checked.answer, /未声明支持删除任务/);
  assert.doesNotMatch(checked.answer, /所有 MCP 都能/);
  assert.equal(upstreamCalls, 2);

  const failed = await ask("复核失败时，八爪鱼 MCP 能删除任务吗？");
  assert.equal(failed.validation.passed, false);
  assert.equal(failed.needsHumanReview, true);
  assert.doesNotMatch(failed.answer, /绝不能直接展示的初稿/);
  assert.equal(upstreamCalls, 4);
});
