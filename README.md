# Paper Reading Assistant

在主流学术期刊页面调用 AI 进行总结与对话，记录阅读历史的浏览器扩展。

兼容 **Chrome / Microsoft Edge** 及其他 Chromium 内核浏览器。

## 更新日志

### v0.3.1 (2026-05-07)

四轮 subagent 深度审查后的硬化与修复（综合得分 66 → 93/100）：

- 🔒 **Prompt injection 加固**：sanitizer 现覆盖带属性标签 `<article-memory foo="bar">`、全角 `＜...＞`、ChatML/Llama/Mistral 分隔符（`<|system|>`/`[INST]`/`<im_start>`/`</s>`）、控制字符 + DEL、双向覆盖 / 零宽 / BOM；写入与发射两端均消毒（防止旧版本残留数据继续注入）。
- 🐛 **跨文章记忆死路修复**：`memory.ts` 中 cross-ref memory 此前被错误绑到来源文章并被自身 ID 排除，从未在任何地方出现。改为全局存储（`articleId=undefined`），现在能在主题相关的新文章中正确召回。
- 🐛 **Turn-1 记忆与笔记修复**：`App.tsx` 在文章加载时立即 `upsertArticle`，否则首轮对话和首次写笔记会因 article row 不存在而静默失败。
- 🐛 **Obsidian `firstRead` 不再被覆盖**：重新导出会读取 vault 中已存在文件的 frontmatter，保留真实首次导出时间；frontmatter 扫描自适应增长 16K → 64K → 全文，长 memory index 不再因截断而漏匹配。
- 🐛 **备份合并模式数据隔离**：自增 ID 被剥离并通过 old→new 映射重建 `conversationId`；孤儿消息会被丢弃而非附到无关的对话上（防跨文章泄漏）。Replace 模式同时清空 kv（保留 vault 句柄）。
- 🐛 **Service Worker 端口路由**：新连接的 sidepanel 不再劫持其他 panel 正在进行的流。
- 🐛 **deleteArticle 级联**：删除文章时同步清理其 `memories` 行，避免孤儿。
- 🐛 **取消信号贯通**：用户中止对话也会取消后台的记忆抽取 LLM 调用，不再静默烧 token。
- 🐛 **YAML 标签兼容**：tags 仅在必要时引号，避免 Obsidian 标签面板因引号而漏识别；同时校验为 Obsidian 合法 tag 形式。
- 🐛 **CJK 标题去重**：中文标题改用字符 bigram 比较；之前因没有空白分词永远不会被判重。

### v0.3.0 (2026-05-07)

- 🧠 **文章级长期记忆系统**：仿 Claude Code memory 的类型化结构（finding / interpretation / question / user-note / cross-ref），每轮对话后 LLM 自动抽取新记忆并去重；累计 6 轮对话重建 markdown 索引。
- 🔗 **跨文章记忆召回**：读相关主题新论文时，按 tag 召回其他文章的 cross-ref 条目并注入 system prompt。
- 📝 **当前文章页"记忆 & 笔记"折叠面板**：可视化记忆条目（含逐条删除）+ 用户手写笔记 textarea（自动保存，注入 prompt）。
- 📥 **Obsidian 幂等导出**：frontmatter 写入 `article_id`，重复导出按 ID 在子文件夹中匹配并覆盖原文件，不再生成 `-1` / `-2` 重复；导出内容含 `## Memory Index` + 按类型分组的 `## Memories` + `## My Notes`。
- 💾 **数据备份/恢复**：设置页新增"数据备份与恢复"区块，可导出/导入全量 JSON（articles / conversations / messages / summaries / memories / kv）。强烈建议**移除扩展前先备份**——Chrome 扩展 IndexedDB 与 extension ID 绑定，重装会换 ID 导致数据失联。
- 🗂 **DB schema 升级 v4**：新增 `memories` 表 + `ArticleRow.memoryIndex` / `userNotes` 字段。Dexie 自动迁移，旧数据无需手工处理。

### v0.2.0 (2026-05-07)

- 🌐 **Microsoft Edge 支持**：同一份 zip 在 Edge 中加载即用。
- 📚 README 增加多浏览器兼容矩阵。

### v0.1.0 (2026-05-07)

- 初始公开版本：DeepSeek / OpenAI / Anthropic / 自定义 OpenAI 兼容 provider；Nature / Cell / Science / 等主流期刊抽取；本地 PDF + Adobe Acrobat 扩展 PDF 支持；Obsidian 导出。

## 特性

- 支持 Nature、Cell、Science、ScienceDirect、Wiley、Springer、PNAS、PLOS、bioRxiv、medRxiv 等主流期刊
- 支持本地 PDF 与 Adobe Acrobat 扩展打开的 PDF
- Chat-first 侧边栏交互，自动给出文章首条结构化总结
- 多家 AI 提供商：DeepSeek / OpenAI / Anthropic Claude / 自定义 OpenAI 兼容服务
- 阅读历史持久化（IndexedDB / Dexie）
- **类 Claude memory 的文章级长期记忆**：每轮对话后自动抽取 finding / interpretation / question / cross-ref 类型记忆，跨会话注入 prompt
- **跨文章记忆召回**：读相关主题新论文时自动带出旧文的 cross-ref 条目
- **手动笔记**：在侧边栏写下关注点 / TODO，与 AI 记忆一同注入
- **Obsidian 幂等导出**：同一篇文章重复导出会按 `article_id` 覆盖原文件，不再产生 `xxx-1.md` 重复
- **数据备份/恢复**：在设置页一键导出/导入 JSON，防误删扩展导致 IndexedDB 丢失

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Google Chrome 114+ | ✅ 完全支持 | 主要测试目标 |
| Microsoft Edge 114+ | ✅ 完全支持 | 同一份 zip 直接加载，所有功能可用 |
| Brave / Arc / Opera / Vivaldi | ✅ 理论兼容 | 均为 Chromium 内核，未做深度测试 |
| Safari | ⏸ 暂未支持 | 需 Xcode 重打包并改造侧边栏 UI，欢迎 PR |
| Adobe Acrobat Reader/Pro 桌面软件 | ❌ 不支持 | 桌面 Acrobat 不是浏览器，扩展无法接入；但**已支持** Adobe Acrobat **Chrome 扩展**打开的 PDF |

## 安装方式

### 方式一：普通用户（推荐）

1. 前往 [Releases 页面](https://github.com/AuroraSxh/chrome_paper_reading_assistant/releases) 下载最新版本的 `paper-reading-assistant-vX.X.X.zip`
2. 解压到任意目录

#### 在 Chrome 中安装

3. 打开 `chrome://extensions`，开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」，选择刚才解压出的文件夹
5. 打开扩展选项页，填入对应服务商的 API Key

#### 在 Microsoft Edge 中安装

3. 打开 `edge://extensions`，开启左下角的「开发人员模式」
4. 点击「加载解压缩的扩展」，选择刚才解压出的文件夹
5. 打开扩展选项页，填入对应服务商的 API Key

> 💡 加载本地 PDF 时，需要在扩展详情里额外开启「**允许访问文件 URL** / Allow access to file URLs」。

### 方式二：开发者从源码构建

需要 Node.js 18+。

```bash
git clone https://github.com/AuroraSxh/chrome_paper_reading_assistant.git
cd chrome_paper_reading_assistant
npm install
npm run build
```

构建产物位于 `dist/`，按方式一对应步骤加载即可。

开发模式：

```bash
npm run dev
```

## 自定义提供商

在选项页选择「自定义 (OpenAI 兼容)」，填入：

- **Base URL**：服务商提供的 OpenAI 兼容端点（一般以 `/v1` 结尾）
- **API Key**：服务商分发的密钥
- **默认模型**：服务商文档中的模型 ID

支持智谱 GLM、Moonshot、阶跃、通义千问、火山方舟、SiliconFlow、OpenRouter、Groq、Together、本地 Ollama 等。

### 用「自定义」接入 OpenRouter（一个 key 调 100+ 模型）

如果你不想为每家厂商单独买 API，推荐用 [OpenRouter](https://openrouter.ai)：一个 key 即可调用 Claude / GPT / Gemini / Llama / DeepSeek / Qwen 等 100+ 模型，按 token 计费、无月费门槛。

在选项页选「自定义 (OpenAI 兼容)」，填入：

- **Base URL**：`https://openrouter.ai/api/v1`
- **API Key**：在 https://openrouter.ai/keys 创建，形如 `sk-or-v1-...`
- **默认模型**：任选一个 OpenRouter 模型 ID，例如：
  - `anthropic/claude-sonnet-4.5`
  - `openai/gpt-4o`
  - `openai/gpt-4o-mini`
  - `google/gemini-2.5-pro`
  - `deepseek/deepseek-chat`
  - `meta-llama/llama-3.3-70b-instruct`

完整模型列表见 https://openrouter.ai/models 。

> ℹ️ **关于 ChatGPT Plus / Claude Pro 订阅**：这两种月费订阅**不包含 API 调用额度**，是 OpenAI / Anthropic 的产品决策，第三方扩展无法绕过。Codex CLI / Claude Code CLI 之所以能用订阅账号调用模型，是因为它们是官方第一方工具、走的是未对外开放的内部端点。如果想"少花钱用大模型"，推荐 OpenRouter（按量计费）或 DeepSeek（极低单价）。

## License

MIT
