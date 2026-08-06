# CODEBUDDY.md — 八爪鱼采集器文档站点项目指南

> 本文档为 AI 编程智能体（Codex / Claude Code / Cursor 等）提供完整的项目上下文。
> 阅读本文后，你应该能理解项目结构、配置开发环境、编辑内容并完成部署。

---

## 1. 项目身份

| 项目 | 值 |
|------|-----|
| **名称** | 八爪鱼采集器 文档站点 |
| **类型** | Mintlify 文档站点（MDX 格式） |
| **语言** | 简体中文（`/zh/`） |
| **在线地址** | https://bazhuayu.mintlify.dev |
| **GitHub** | https://github.com/yyfyydshh/bazhuayu-docs |
| **本地路径** | `C:\Users\16934\.qclaw\workspace-54nuktoh8cd83kjj\my-docs` |

> **注意：** GitHub 用户名 `yyfyydshh`，Mintlify 用户名 `yyfyyds`，仓库已从 `my-docs` 更名为 `bazhuayu-docs`。

---

## 2. 技术栈

| 层面 | 技术 |
|------|------|
| 文档框架 | **Mintlify v4.2.572+** |
| 内容格式 | **MDX** (Markdown + JSX) |
| 配置 | `docs.json` (Mintlify v4 schema) |
| 运行时 | Node.js v22.16.0 |
| 部署 | GitHub Push → Mintlify 自动构建 |
| 版本控制 | Git (SSH) |
| 自定义样式 | `style.css` |

---

## 3. 环境配置

### 3.1 Node.js
```bash
node --version   # v22.16.0
```
Node 位于 `D:\workapp\QClaw\v0.2.27.560\resources\node\node.exe`（随 QClaw 分发，版本号随 QClaw 升级变化）。

### 3.2 安装依赖
```bash
cd C:\Users\16934\.qclaw\workspace-54nuktoh8cd83kjj\my-docs
npm install
```
仅一个依赖：`"mintlify": "^4.2.571"`（定义在 `package.json`）。

### 3.3 Git 配置
```bash
git --version                              # 已安装
git remote -v                              # origin  git@github.com:yyfyydshh/bazhuayu-docs.git
```
使用 **SSH**（非 HTTPS），SSH Key 已配置：
- 密钥位置：`~/.ssh/id_ed25519`
- 已在 GitHub 注册（yyfyydshh 账户）

### 3.4 本地预览
```bash
cd C:\Users\16934\.qclaw\workspace-54nuktoh8cd83kjj\my-docs
npx mintlify dev --port 3001
# 打开 http://localhost:3001
```

> **Windows 注意：** 如需直接调用 Node：
> ```
> D:\workapp\QClaw\v0.2.24.540\resources\node\node.exe "path\to\mintlify\index.js" dev --port 3001
> ```

---

## 4. 目录结构

```
my-docs/
├── CODEBUDDY.md           # 本文档
├── docs.json              # Mintlify 配置（导航、主题、API playground 等）
├── package.json           # 仅 mintlify 依赖
├── package-lock.json
├── style.css              # 自定义全局样式
├── .gitignore
├── .cursorrules           # Cursor IDE 规则参考（旧版）
├── scripts/               # 构建/迁移脚本（历史遗留）
│   ├── add-authorization-param.mjs
│   ├── apply-api-playground.mjs
│   ├── extract-feishu-coze.js
│   ├── extract-feishu-dify.js
│   └── extract-feishu-qclaw.js
├── snippets/              # 可复用的 MDX 代码片段
│   └── external-link-redirect.jsx
├── assets/                # 静态资源
│   ├── logo.png, logo-light.svg, logo-dark.svg
│   ├── favicon.ico, favicon.svg, favicon-32.png, favicon.png
│   ├── og-image.png
│   ├── mcp-icon.svg, site-icon.png
│   ├── favicons/          # 多尺寸 favicon
│   └── mcp/               # MCP 平台截图
│       ├── api-key/
│       ├── coze/
│       ├── dify/
│       ├── platforms/
│       └── qclaw/
├── favicons/              # 根级 favicon（历史遗留，保留）
└── zh/                    # 中文文档（唯一语言）
    ├── overview.mdx        # 首页：产品概述 + 下载客户端 + 联系我们
    ├── api-reference/      # OpenAPI 文档
    │   ├── intro.mdx       # API 综述
    │   ├── reference.mdx   # 参考（错误码等）
    │   ├── access-token/   # 认证相关 API
    │   ├── task/           # 任务管理 API
    │   ├── task-group/     # 任务组 API
    │   ├── cloud-extraction/ # 云采集 API
    │   ├── task-analytics/  # 任务分析 API
    │   └── data/           # 数据导出 API
    ├── mcp/                # MCP 服务文档
    │   ├── index.mdx       # MCP 总览
    │   ├── workflow.mdx
    │   ├── search-templates.mdx
    │   ├── search-tasks.mdx
    │   ├── execute-task.mdx
    │   ├── export-data.mdx
    │   ├── start-or-stop-task.mdx
    │   ├── redeem-coupon.mdx
    │   ├── rate-limits.mdx
    │   ├── troubleshooting.mdx
    │   ├── quick-start/    # API Key 获取指南
    │   ├── guides/         # 客户端配置指南
    │   └── integrations/   # 平台对接（Coze/Dify/QClaw/ChatGPT/Claude...）
    ├── cli/                # CLI 命令行工具文档（当前 v0.1.25）
    │   ├── index.mdx       # CLI 总览
    │   ├── quick-start/    # 安装、登录、首次运行
    │   ├── core-commands/  # detect、任务管理、运行、导出、诊断
    │   └── reference/      # 命令速查、退出码
    ├── academy/            # 教程学院（~35 篇网页采集教程）
    └── changelog/          # 更新日志
        ├── april-2026.mdx
        ├── may-2026.mdx
        └── june-2026.mdx
```

---

## 5. 配置文件说明

### 5.1 `docs.json`

这是 Mintlify 的核心配置文件，定义：

- **`name`**：站点名称 "八爪鱼文档"
- **`colors.primary`**：`#0D47A1`（深蓝主色调）
- **`logo`**：`/assets/logo.png`
- **`navigation.languages[0].tabs`**：顶部标签页
  - 首页（`zh/overview`）
  - MCP 服务（多组页面）
  - OpenAPI（多组页面，含 API playground）
  - CLI（多组页面）
  - 更新日志
- **`api`**：API playground 配置
  - `openapi` 指向 `zh/api-reference/task-analytics/openapi.json`
  - `server` 为 `https://openapi.bazhuayu.com`
  - `playground.display` = `"interactive"`（交互式）
  - 11 种语言代码示例自动生成
- **`redirects`**：旧路径重定向（`/en/` → `/zh/`，`/favicons/` → `/assets/favicons/` 等）
- **`styling.css`**：指向 `style.css`

### 5.2 `style.css`

自定义样式涵盖：
- **首页下载区** — `.dl-section` / `.dl-grid` / `.dl-card`：Windows/Mac 双栏下载卡片
- **MCP 平台名片网格** — `.mcp-platform-grid`：3 列紧凑平台图标网格
- **CLI 流程对比** — `.cli-compare-section`：客户端 vs CLI 操作对比表
- **CLI 功能矩阵** — `.cli-feature-matrix`：MCP/客户端/CLI 三栏功能对比表
- **CLI 适用人群卡片** — `.cli-audience-section`：双栏角色卡片
- **API 文档布局** — `#content-area:has([id^="api-playground"])`：MDX 正文在 API playground 上方
- **页脚隐藏** — `#footer { display: none !important; }`
- **"本页目录" 文本替换** — 将 "On this page" 替换为中文
- **响应式** — `@media` 断点适配移动端

---

## 6. MDX 内容编写规范

### 6.1 页面模板
每个 MDX 文件使用以下结构：

```mdx
---
title: 页面标题
description: 页面描述（用于 SEO）
---

## 第一个二级标题

正文内容...

<Card title="卡片标题">
  卡片内容
</Card>

<CardGroup cols={2}>
  <Card title="卡片一" icon="check">
    内容
  </Card>
  <Card title="卡片二" icon="x">
    内容
  </Card>
</CardGroup>

<Steps>
  <Step title="步骤一">说明</Step>
  <Step title="步骤二">说明</Step>
</Steps>
```

### 6.2 Frontmatter
- `title`：**必填**。页面标题
- `description`：**必填**，用于 SEO 和社交分享

### 6.3 可用 Mintlify 组件
| 组件 | 用途 |
|------|------|
| `<Card>` / `<CardGroup>` | 卡片布局 |
| `<Steps>` / `<Step>` | 步骤列表 |
| `<CodeGroup>` | 多语言代码示例 |
| `<Note>` | 提示框 |
| `<Warning>` | 警告框 |
| `<Tabs>` / `<Tab>` | 标签页切换 |
| `<Accordion>` / `<AccordionGroup>` | 折叠面板 |
| `<Frame>` | 嵌套外部页面 |

### 6.4 链接格式
- **内部链接**：`/zh/mcp/index`（不含 `.mdx` 扩展名）
- **外部链接**：`https://...` 或 `[text](https://...)`

### 6.5 代码块
````mdx
```json
{
  "key": "value"
}
```

```bash
curl -X GET "https://openapi.bazhuayu.com/..."
```
````

Mintlify 自动对代码块进行语法高亮。

### 6.6 内容风格
- 中文正文，技术术语保留原文
- 语气：专业、直接、操作导向
- 产品名："八爪鱼采集器"（非 "八爪鱼"）
- 公司名："深圳市数阔信息有限公司"
- 联系邮箱：`help@skieer.com`

### 6.7 Snippets
`snippets/external-link-redirect.jsx` 是一个可复用的 React 组件，用于在新标签页打开外部链接。

---

## 7. API 文档特殊说明

### 7.1 API 端点页面格式
每个 API 端点页面（`zh/api-reference/*/xxx.mdx`）遵循统一格式：

```mdx
---
title: "端点名称"
---
## 端点
GET /path/to/endpoint

## 描述
功能说明...

## 请求头
| 参数 | 必填 | 说明 |
|------|------|------|
| Authorization | 是 | Bearer {token} |

## 请求体
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

## 响应
成功响应...

## 错误响应
错误码说明...
```

### 7.2 API Playground
配置在 `docs.json` 的 `api` 字段：
- 指向 OpenAPI spec JSON 文件
- 自动生成交互式 API 调试面板
- 代理模式已启用

---

## 8. Git 工作流

### 8.1 分支结构
```
master              # 主分支 ← Mintlify 自动部署
├── yangyifan        # 个人工作分支（Yang Yifan）
└── skieer_yang_521  # 同事合作分支（已合并）
```

### 8.2 日常工作流
```bash
# 1. 拉取最新
git checkout master
git pull origin master

# 2. 在个人分支上工作
git checkout yangyifan
git merge master -m "sync master"

# 3. 编辑文件...

# 4. 提交
git add .
git commit -m "docs: your message"

# 5. 推送
git push origin yangyifan

# 6. 在 GitHub 上创建 PR (yangyifan → master)
# 7. 合并 PR → Mintlify 自动部署
```

### 8.3 Commit 规范
格式：`docs(<scope>): <description>`

示例：
- `docs(overview): update download links`
- `docs(cli): replace command intro label with 命令描述`
- `docs(mcp): add troubleshooting guide`

### 8.4 网络说明
⚠️ **关键**：使用 **SSH** 协议（`git@github.com:...`）。
HTTPS 在公司网络环境下不稳定（端口 443 间歇性阻断，拉取小数据量可成功，推送大数据量易超时）。
SSH（端口 22）稳定可用。

### 8.5 同步分支内容
```bash
# 将 master 最新内容合并到 yangyifan
git checkout yangyifan
git merge master -m "merge master into yangyifan"
git push origin yangyifan
```

---

## 9. 部署

### 9.1 自动部署
- **触发方式**：推送到 GitHub `master` 分支
- **部署目标**：Mintlify（在 Dashboard 连接了 GitHub 仓库）
- **默认域名**：https://bazhuayu.mintlify.dev（Mintlify 子域名，Dashboard 中需将 deployment 标识改为 `bazhuayu`）
- **备用域名**：https://bazhuayu.mintlify.app
- **自定义域名**：`www.bazhuayu.com` 或 `docs.bazhuayu.com`（CNAME 指向 Mintlify 提供的地址）

### 9.2 触发重建
```bash
git checkout master
git commit --allow-empty -m "trigger rebuild"
git push origin master
```

### 9.3 协作者
- GitHub 仓库已添加 `YANGskieer` 为 Write 权限协作者

---

## 10. 已完成的里程碑

1. ✅ 从 `https://openapi.bazhuayu.com/zh-CN/` 复刻全部 27 个 API 端点
2. ✅ 统一所有页面格式（frontmatter → 端点 → 描述 → 请求头 → 请求体 → 响应 → 错误响应）
3. ✅ 每个端点含 HTTP 方法 + 4 个代码示例 + 请求体参数表格
4. ✅ 站点迁移到纯中文（`/zh/` 目录）
5. ✅ 首页重新设计（产品介绍 + 下载 + 联系我们）
6. ✅ MCP 服务完整文档（工具参考、平台对接、故障排除）
7. ✅ CLI 完整文档（安装、登录、核心命令、参考）
8. ✅ API Playground 交互式调试面板
9. ✅ 自定义 CSS 样式（下载卡片、流程对比、功能矩阵等）
10. ✅ SSH 推送配置（解决公司网络 HTTPS 限制）
11. ✅ 仓库更名（`my-docs` → `bazhuayu-docs`）

---

## 11. 近期提交历史

```
4095077 docs(overview): link client downloads to bazhuayu download page
aa2c0f9 docs(cli): replace command intro label with 命令描述
3915538 docs: migrate site to zh locale and expand MCP/CLI documentation
be8945e docs(mcp): restore AI client guides
4fe2eb1 docs: restructure MCP and CLI modules, add May changelog
818191a docs: API playground, task analytics, and reference updates
3ed2505 Update overview: company name and download section styling
```

---

## 12. 常见任务速查

### 添加新页面
1. 在 `zh/` 下对应目录创建 `.mdx` 文件
2. 添加 frontmatter (`title` + `description`)
3. 在 `docs.json` 的 `navigation` 中添加页面路径
4. 本地预览：`npx mintlify dev --port 3001`
5. 提交并推送

### 修改导航
编辑 `docs.json` → `navigation.languages[0].tabs` → 对应的 `groups[].pages[]`

### 修改样式
编辑 `style.css`（Mintlify 会自动加载）

### 添加静态资源
放入 `assets/` 目录，在 MDX 中引用：`/assets/filename.png`

### 重定向旧路径
在 `docs.json` 的 `redirects` 数组中添加规则

---

## 13. 注意事项 / 踩坑记录

1. **语言设置**：站点只有 `zh` 语言，`docs.json` 中 `hidden: true`（因为是默认且唯一语言）
2. **文件编码**：所有 `.mdx` 文件使用 **UTF-8** 编码
3. **内部链接不带 `.mdx`**：`/zh/mcp/index` ✅，`/zh/mcp/index.mdx` ❌
4. **Mintlify dev 端口冲突**：如果 3001 被占，自动尝试 3002
5. **`en/` 目录**：已废弃，所有英文流量通过 redirects 重定向到 `/zh/`
6. **API Playground**：正文在 playground 上方显示（通过 CSS flex order 实现）
7. **页脚已隐藏**：`#footer { display: none !important }`
8. **仓库不要用 HTTPS remote**：公司网络下推送大文件时 HTTP 会断
9. **GitHub 仓库原名 `my-docs`**：已更名 `bazhuayu-docs`，旧 URL 自动重定向
10. **QClaw 版本目录变化**：QClaw 升级后版本号目录会变（如 `v0.2.26.557` → `v0.2.27.560`），Profile 中 PATH 需同步更新
