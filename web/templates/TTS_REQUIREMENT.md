# 角色扮演语音生成需求

> 2026-07-01 创建

## 目标

在 `site_analyzer/web/templates/roleplay.html` 及其前端 JS 模块中集成 TTS 语音生成能力，实现角色对话气泡内的语音播放。

## 技术方案

- **TTS Provider**: Edge TTS（已验证可用，免费，中文音色丰富）
- **实现方式**: 纯前端调用 Edge TTS API（通过后端代理 `/api/tts`）
- **音色池**: Edge Neural 中文语音共 15 种（见下方完整列表）

## 中文 Edge TTS 音色表

### 普通话（推荐默认）
# 角色扮演语音生成需求

> 2026-07-01 创建 | 2026-07-01 实现

## 目标

在 `site_analyzer/web/templates/roleplay.html` 及其前端 JS 模块中集成 TTS 语音生成能力，实现角色对话气泡内的语音播放。

## 实现状态

✅ **已完成**（2026-07-01）

## 技术方案

- **TTS Provider**: Edge TTS（微软免费，中文音色丰富）
- **后端**: Flask 代理端点 `/api/tts`，接收 JSON 返回 MP3 字节流
- **前端**: `tts-engine.js` 模块，使用 Cache API + Blob URL 缓存和播放
- **音色池**: Edge Neural 中文语音共 15 种
- **全局开关**: 聊天界面顶部 🔊 按钮，可一键开启/关闭语音

## 文件变更

### 后端
- `web/app.py` — 新增 `/api/tts` 端点 + `_generate_mp3()` 函数 + 内存缓存

### 前端
- `web/static/js/roleplay/tts-engine.js` — **新建**，TTS 核心模块
- `web/static/js/roleplay/message-renderer.js` — 消息渲染后异步调用 TTS
- `web/static/js/roleplay/char-gen.js` — TSV 表头新增 `voice` 字段，角色生成时自动匹配音色
- `web/templates/roleplay.html` — 新增 TTS 模块 script 标签 + 顶部 🔊 按钮
- `web/static/css/roleplay/05-message-bubble.css` — 新增 `.tts-audio-player` 样式

## 工作流程

```
1. 角色生成 → LLM 返回 voice 字段（如 zh-CN-XiaoxiaoNeural）
2. 消息渲染 → message-renderer.js 渲染气泡
3. 异步 TTS → tts-engine.js 生成语音
4. Cache API → 相同文本+音色缓存到浏览器
5. Blob URL → 创建 <audio> 控件嵌入气泡
```

## 音色表

（完整列表见 tts-engine.js 中的 TTS_VOICES 常量）
