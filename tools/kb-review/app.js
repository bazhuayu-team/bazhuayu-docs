const app = document.querySelector("#app");
const session = window.__KB_SESSION__;
const state = {
  stats: null,
  list: null,
  selected: null,
  selectedSlug: "",
  filters: JSON.parse(localStorage.getItem("kb-review-filters") || "{}"),
  saving: false,
  preview: false,
  indexStatus: { status: "ready", requestedAt: "", completedAt: "", error: "" },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-kb-session": session,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function statusLabel(status) {
  return ({
    unverified: "未审核",
    linked: "已确认",
    verified: "已确认",
    blocked: "已停用",
    deferred: "稍后处理",
  })[status] || status;
}

function indexLabel(indexStatus = state.indexStatus) {
  if (indexStatus.status === "queued" || indexStatus.status === "running") return "索引更新中";
  if (indexStatus.status === "failed") return "更新失败";
  if (indexStatus.completedAt) return "已生效";
  return "索引已就绪";
}

function setFilters(patch) {
  state.filters = { ...state.filters, ...patch, page: patch.page ?? 1 };
  localStorage.setItem("kb-review-filters", JSON.stringify(state.filters));
  loadList();
}

function editorData() {
  const item = state.selected || {};
  const draft = item.draft || {};
  const override = item.override || {};
  const approvedContent = Object.hasOwn(draft, "approvedContent")
    ? draft.approvedContent
    : item.approvedContent || override.approvedContent || item.body || "";
  return {
    approvedContent,
    blockReason: draft.blockReason ?? override.blockReason ?? "",
    note: draft.note ?? override.note ?? "",
  };
}

function currentDraft() {
  return {
    approvedContent: document.querySelector("#approved-content")?.value ?? editorData().approvedContent,
    blockReason: document.querySelector("#block-reason")?.value ?? editorData().blockReason,
    note: document.querySelector("#note")?.value ?? editorData().note,
  };
}

function safeHref(value) {
  const decoded = value.replace(/&amp;/g, "&");
  return /^(?:https?:\/\/|\/|#)/i.test(decoded) ? value : "#";
}

function renderMarkdown(value = "") {
  const lines = escapeHtml(value).split(/\r?\n/);
  const rendered = lines.map((line) => {
    let html = line
      .replace(/!\[([^\]]*)\]\((\/assets\/[^)\s]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${safeHref(href)}" target="_blank" rel="noreferrer">${label}</a>`)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const heading = html.match(/^(#{1,4})\s+(.+)$/);
    if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
    if (/^[-*]\s+/.test(html)) return `<div class="md-list">${html.replace(/^[-*]\s+/, "")}</div>`;
    if (/^\d+[.、]\s*/.test(html)) return `<div class="md-step">${html}</div>`;
    return html ? `<p>${html}</p>` : '<div class="md-gap"></div>';
  });
  return rendered.join("");
}

function render() {
  const stats = state.stats || { total: 0, counts: {} };
  const list = state.list || { items: [], categories: [], total: 0, page: 1, pageSize: 30 };
  app.innerHTML = `
    <main class="app">
      <header class="toolbar">
        <div class="toolbar-title"><h1>知识审核台</h1><span>直接确认或修订 FAQ 答案</span></div>
        <div class="stats">
          <span class="stat">总计 <b>${stats.total}</b></span>
          ${Object.entries(stats.counts || {}).map(([key, value]) => `<span class="stat">${statusLabel(key)} <b>${value}</b></span>`).join("")}
          <span class="stat">高风险 <b>${stats.highRisk || 0}</b></span>
        </div>
        <div class="filters">
          <button class="drawer-toggle" data-action="drawer">队列</button>
          <input id="search" placeholder="搜索标题或 slug" value="${escapeHtml(state.filters.search || "")}">
          <select id="category"><option value="">全部分类</option>${list.categories.map((item) => `<option value="${item.slug}" ${state.filters.category === item.slug ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select>
          <select id="status"><option value="">全部状态</option>${["unverified", "verified", "blocked", "deferred"].map((item) => `<option value="${item}" ${state.filters.status === item ? "selected" : ""}>${statusLabel(item)}</option>`).join("")}</select>
          <label class="switch"><input id="high-risk" type="checkbox" ${state.filters.highRisk ? "checked" : ""}>高风险</label>
          <label class="switch"><input id="no-answer" type="checkbox" ${state.filters.noAnswer ? "checked" : ""}>无可信答案</label>
        </div>
      </header>
      <section class="workspace">
        <aside class="queue">
          <div class="queue-header">审核队列 · ${list.total}</div>
          <div class="queue-list">${list.items.map((item) => `
            <button class="queue-item ${state.selectedSlug === item.sourceSlug ? "selected" : ""}" data-slug="${item.sourceSlug}">
              <span class="queue-title">${escapeHtml(item.title)}</span>
              <span class="queue-meta"><span class="badge ${item.status}">${statusLabel(item.status)}</span>${item.riskLabels.length ? '<span class="badge high">风险</span>' : ""}</span>
            </button>`).join("") || '<p class="panel-empty">没有匹配的内容</p>'}</div>
          <div class="pager"><button data-action="previous-page" ${list.page <= 1 ? "disabled" : ""}>上一页</button><span>${list.page} / ${Math.max(1, Math.ceil(list.total / list.pageSize))}</span><button data-action="next-page" ${list.page * list.pageSize >= list.total ? "disabled" : ""}>下一页</button></div>
        </aside>
        <section class="source">${sourceHtml()}</section>
        <aside class="decision">${decisionHtml()}</aside>
      </section>
      <footer class="footer">
        <div class="footer-actions"><button data-action="previous-item">上一篇</button><button data-action="defer">稍后处理</button><button data-action="undo">撤销</button></div>
        <div class="footer-actions"><span class="save-state ${state.indexStatus.status}" id="save-state">${state.saving ? "正在保存…" : indexLabel()}</span><button class="action-primary" data-action="verify" ${state.saving ? "disabled" : ""}>保存为可信答案</button></div>
      </footer>
    </main>`;
  bind();
  alignSelectedQueueItem();
}

function sourceHtml() {
  const item = state.selected;
  if (!item) return '<div class="source-empty">从左侧队列选择一篇问题开始审核</div>';
  return `
    <div class="source-meta"><span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.updatedAt || "未提供更新时间")}</span><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">查看来源</a></div>
    <h2>${escapeHtml(item.title)}</h2>
    <div class="risk-row">${item.riskLabels.map((risk) => `<span class="risk">${escapeHtml(risk)}</span>`).join("") || '<span class="badge">未发现自动风险</span>'}</div>
    <div class="source-label">原问题与旧答案</div>
    <div class="source-body">${renderMarkdown(item.body)}</div>`;
}

function decisionHtml() {
  const item = state.selected;
  if (!item) return '<div class="panel-empty">审核操作会显示在这里</div>';
  const data = editorData();
  return `
    <div class="decision-heading"><div><h2>可信答案编辑器</h2><p>完整答案确认后才会进入 Agent 可信索引。</p></div><span class="badge ${item.override?.status || "unverified"}">${statusLabel(item.override?.status || "unverified")}</span></div>
    <div class="editor-tabs"><button class="${state.preview ? "" : "active"}" data-action="edit">编辑</button><button class="${state.preview ? "active" : ""}" data-action="preview">预览</button><button class="restore" data-action="restore">恢复原答案</button></div>
    ${state.preview
      ? `<div class="answer-preview">${renderMarkdown(data.approvedContent)}</div>`
      : `<div class="field editor-field"><label for="approved-content">完整答案（Markdown）</label><textarea id="approved-content" maxlength="50000" spellcheck="false">${escapeHtml(data.approvedContent)}</textarea><small><span id="content-count">${data.approvedContent.length}</span> / 50,000 字符；图片请使用仓库内的 /assets/... 路径。</small></div>`}
    <div class="field"><label for="block-reason">停用原因</label><select id="block-reason"><option value="">选择原因</option>${["内容已过时", "信息不准确", "重复问题", "缺少有效答案", "不适合对外回答"].map((reason) => `<option ${data.blockReason === reason ? "selected" : ""}>${reason}</option>`).join("")}</select></div>
    <div class="field"><label for="note">审核备注</label><textarea id="note" class="note" placeholder="仅供内部审核参考。">${escapeHtml(data.note)}</textarea></div>
    <div class="decision-actions"><button class="action-primary" data-action="verify">保存为可信答案</button><button class="action-block" data-action="block">停用答案</button><button data-action="defer">稍后处理</button></div>`;
}

function bind() {
  document.querySelectorAll("[data-slug]").forEach((button) => { button.onclick = () => selectItem(button.dataset.slug); });
  document.querySelector("#search")?.addEventListener("change", (event) => setFilters({ search: event.target.value }));
  document.querySelector("#category")?.addEventListener("change", (event) => setFilters({ category: event.target.value }));
  document.querySelector("#status")?.addEventListener("change", (event) => setFilters({ status: event.target.value }));
  document.querySelector("#high-risk")?.addEventListener("change", (event) => setFilters({ highRisk: event.target.checked }));
  document.querySelector("#no-answer")?.addEventListener("change", (event) => setFilters({ noAnswer: event.target.checked }));
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => action(button.dataset.action)));
  ["approved-content", "note", "block-reason"].forEach((id) => document.querySelector(`#${id}`)?.addEventListener("input", scheduleDraft));
  document.querySelector("#approved-content")?.addEventListener("input", (event) => {
    const count = document.querySelector("#content-count");
    if (count) count.textContent = event.target.value.length;
  });
}

let draftTimer;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    if (!state.selectedSlug) return;
    const payload = currentDraft();
    state.selected.draft = payload;
    try {
      await api(`/api/items/${encodeURIComponent(state.selectedSlug)}/draft`, { method: "PUT", body: JSON.stringify(payload) });
    } catch {}
  }, 500);
}

async function loadList() {
  state.list = await api(`/api/items?${new URLSearchParams(state.filters)}`);
  render();
  if (!state.selectedSlug && state.list.items[0]) await selectItem(state.list.items[0].sourceSlug);
}

async function selectItem(slug) {
  state.selectedSlug = slug;
  state.selected = await api(`/api/items/${encodeURIComponent(slug)}`);
  state.preview = false;
  localStorage.setItem("kb-review-last", slug);
  render();
}

function alignSelectedQueueItem() {
  const list = document.querySelector(".queue-list");
  const selected = list?.querySelector(".queue-item.selected");
  if (!list || !selected) return;
  const tailSpace = Math.max(0, list.clientHeight - selected.offsetHeight);
  list.style.setProperty("--queue-tail-space", `${tailSpace}px`);
  const listTop = list.getBoundingClientRect().top;
  const selectedTop = selected.getBoundingClientRect().top;
  list.scrollTop += selectedTop - listTop;
}

function neighborSlug(direction) {
  const index = state.list.items.findIndex((item) => item.sourceSlug === state.selectedSlug);
  return state.list.items[index + direction]?.sourceSlug || state.list.items[index - direction]?.sourceSlug || "";
}

async function decide(status) {
  if (!state.selectedSlug || state.saving) return;
  const next = neighborSlug(1);
  const payload = { ...currentDraft(), status };
  state.selected.draft = payload;
  state.saving = true;
  render();
  try {
    const result = await api(`/api/items/${encodeURIComponent(state.selectedSlug)}/decision`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.indexStatus = result.indexStatus || state.indexStatus;
    state.stats = await api("/api/stats");
    state.list = await api(`/api/items?${new URLSearchParams(state.filters)}`);
    if (next && state.list.items.some((item) => item.sourceSlug === next)) await selectItem(next);
    else if (state.list.items[0]) await selectItem(state.list.items[0].sourceSlug);
    else { state.selected = null; state.selectedSlug = ""; render(); }
  } catch (error) {
    alert(error.message);
  } finally {
    state.saving = false;
    render();
  }
}

async function action(name) {
  if (name === "drawer") document.querySelector(".queue")?.classList.toggle("open");
  if (name === "previous-page") setFilters({ page: (state.list.page || 1) - 1 });
  if (name === "next-page") setFilters({ page: (state.list.page || 1) + 1 });
  if (name === "previous-item") { const slug = neighborSlug(-1); if (slug) selectItem(slug); }
  if (name === "defer") await decide("deferred");
  if (name === "verify") await decide("verified");
  if (name === "block") await decide("blocked");
  if (name === "edit" || name === "preview") {
    state.selected.draft = currentDraft();
    state.preview = name === "preview";
    render();
  }
  if (name === "restore") {
    state.selected.draft = { ...currentDraft(), approvedContent: state.selected.body || "" };
    state.preview = false;
    scheduleDraft();
    render();
  }
  if (name === "undo") {
    try {
      const result = await api("/api/undo", { method: "POST", body: "{}" });
      state.indexStatus = result.indexStatus || state.indexStatus;
      state.stats = await api("/api/stats");
      state.list = await api(`/api/items?${new URLSearchParams(state.filters)}`);
      await selectItem(result.slug);
    } catch (error) { alert(error.message); }
  }
}

async function pollIndexStatus() {
  try {
    state.indexStatus = await api("/api/index-status");
    const label = document.querySelector("#save-state");
    if (label && !state.saving) {
      label.className = `save-state ${state.indexStatus.status}`;
      label.textContent = indexLabel();
      label.title = state.indexStatus.error || "";
    }
  } catch {}
}

(async () => {
  try {
    [state.stats, state.indexStatus] = await Promise.all([api("/api/stats"), api("/api/index-status")]);
    await loadList();
    const last = localStorage.getItem("kb-review-last");
    if (last && state.list.items.some((item) => item.sourceSlug === last)) await selectItem(last);
    setInterval(pollIndexStatus, 1500);
  } catch (error) {
    app.innerHTML = `<main class="panel-empty"><h1>知识审核台尚未就绪</h1><p>${escapeHtml(error.message)}</p></main>`;
  }
})();
