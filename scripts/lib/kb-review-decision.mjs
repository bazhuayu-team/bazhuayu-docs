import { normalizeText } from "./kb-utils.mjs";

export const allowedBlockReasons = [
  "内容已过时",
  "信息不准确",
  "重复问题",
  "缺少有效答案",
  "不适合对外回答",
];

export function legacyApprovedContent(record = {}) {
  if (typeof record.approvedContent === "string") return record.approvedContent;

  const answer = String(record.approvedAnswer ?? "").trim();
  const steps = Array.isArray(record.approvedSteps) ? record.approvedSteps.filter(Boolean) : [];
  return [answer, steps.length ? steps.map((step) => `- ${step}`).join("\n") : ""]
    .filter(Boolean)
    .join("\n\n");
}

export function cleanDecision(input, now = () => new Date().toISOString()) {
  const status = input.status;
  if (!new Set(["linked", "verified", "blocked", "deferred"]).has(status)) {
    throw new Error("无效的审核状态。");
  }

  const result = {
    status,
    approvedContent: "",
    linkedRoute: "",
    approvedAnswer: "",
    approvedSteps: [],
    relatedRoute: "",
    blockReason: "",
    note: normalizeText(input.note),
    updatedAt: now(),
  };

  if (status === "linked") {
    result.linkedRoute = String(input.linkedRoute ?? "").trim();
    if (!result.linkedRoute.startsWith("/zh/")) {
      throw new Error("旧版关联记录必须指向站内文档。");
    }
  }

  if (status === "verified") {
    result.approvedContent = String(input.approvedContent ?? "").trim();
    if (result.approvedContent.length < 8) throw new Error("可信答案至少需要 8 个字符。");
    if (result.approvedContent.length > 50_000) {
      throw new Error("可信答案不能超过 50,000 个字符。");
    }
  }

  if (status === "blocked") {
    if (!allowedBlockReasons.includes(input.blockReason)) {
      throw new Error("停用时必须选择原因。");
    }
    result.blockReason = input.blockReason;
  }

  return result;
}

export function createRebuildQueue(runBuild, now = () => new Date().toISOString()) {
  let running = false;
  let pending = false;
  let state = { status: "ready", requestedAt: "", completedAt: "", error: "" };

  const drain = async () => {
    if (running) return;
    running = true;
    while (pending) {
      pending = false;
      state = { ...state, status: "running", error: "" };
      try {
        await runBuild();
        state = { ...state, status: "ready", completedAt: now(), error: "" };
      } catch (error) {
        state = {
          ...state,
          status: "failed",
          completedAt: now(),
          error: error.message || "索引更新失败。",
        };
      }
    }
    running = false;
  };

  return {
    schedule() {
      pending = true;
      state = {
        ...state,
        status: running ? "running" : "queued",
        requestedAt: now(),
        error: "",
      };
      queueMicrotask(drain);
      return this.status();
    },
    status() {
      return { ...state, pending, running };
    },
  };
}
