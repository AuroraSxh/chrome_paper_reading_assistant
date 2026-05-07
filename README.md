# Paper Reading Assistant

在主流学术期刊页面调用 AI 进行总结与对话，记录阅读历史的浏览器扩展。

兼容 **Chrome / Microsoft Edge** 及其他 Chromium 内核浏览器。

## 特性

- 支持 Nature、Cell、Science、ScienceDirect、Wiley、Springer、PNAS、PLOS、bioRxiv、medRxiv 等主流期刊
- 支持本地 PDF 与 Adobe Acrobat 扩展打开的 PDF
- Chat-first 侧边栏交互，自动给出文章首条结构化总结
- 多家 AI 提供商：DeepSeek / OpenAI / Anthropic Claude / 自定义 OpenAI 兼容服务
- 阅读历史持久化（IndexedDB / Dexie）
- 可选导出对话至 Obsidian 库

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

## License

MIT
