# 角色对话系统需求与待执行清单

> 最后更新: 2026-07-19

---

## 一、已完成改动

### 1. 后端接口移除 → 前端直调 Agnes LLM

| 已移除后端接口 | 替代方案 |
|---------------|---------|
| `POST /api/roleplay-structure` | 前端 `roleplay-structured-agent.js` 调 `App.agnesChat` |
| `POST /api/structured-output` | 前端 `structured-output.js` 调 `App.agnesChat` |
| `POST /api/unified-structured` | 前端 `unified-structured-output.js` 调 `App.agnesChat` |
| `POST /api/roleplay/char-bio` | 前端 `char-gen.js` 调 `App.agnesChat`（温度 0.8） |

**关键文件：**
- `/web/static/js/roleplay/roleplay-structured-agent.js` — 结构化拆分
- `/web/static/js/roleplay/structured-output.js` — 通用结构化输出
- `/web/static/js/roleplay/unified-structured-output.js` — 统一结构化输出
- `/web/static/js/roleplay/char-gen.js` — 角色小传生成
- `/web/static/js/roleplay/json-parser.js` — LLM JSON 格式解析工具
- `/web/templates/roleplay.html` — 引入 json-parser.js

### 2. API Key 统一

- 设置面板只保留一个 "API Key" 输入框
- `state.apiKeys.chat` 同时用于对话和生图
- 移除所有 `state.apiKeys.image` 引用

### 3. 消息时序修复

- `structuredToMessages()` 同批消息共享同一个时间戳，避免排序交错
- 消息内容保留 `【角色名】【动作】【语言】【内心】` 标签结构，不扁平化拼接

### 4. 风格识别并行化

- 风格识别与故事初始化并行执行（`Promise.all`）
- 风格识别完成后立即启动锚点校准（不依赖场景描述）

---

## 二、生图依赖关系（核心规则）

```
角色头图 → 角色基本信息 + 画面风格
角色图   → 角色头图(参考图) + 角色基本信息 + 画面风格  
背景图   → 角色图(参考图) + 场景描述 + 角色动作 + 画面风格
```

**关键约束：**
- 画面风格不依赖场景描述
- 只有背景图生成同时依赖场景描述
- 所有生图统一追加 `state.story.styleAnchor`（精准画面风格提示词）

---

## 三、待执行事项

### [P0] 生图依赖链修正

当前 `generateCharacterFaceSilent()` 和 `generatePlayerAvatar()` 的实现需要确认是否严格遵循上述依赖链。

**检查项：**
- [ ] 角色头图 prompt 是否只包含 `角色基本信息 + 画面风格`？
- [ ] 角色图 prompt 是否使用 `角色头图作为参考图 + 角色基本信息 + 画面风格`？
- [ ] 背景图 prompt 是否使用 `角色图作为参考图 + 场景描述 + 角色动作 + 画面风格`？

**相关文件：**
- `/web/static/js/roleplay/two-stage.js` — 头像/场景图生成流程
- `/web/static/js/roleplay/image-api.js` — 生图 API 封装
- `/web/static/js/roleplay/scene-images.js` — 场景图生成

### [P1] 风格校准优化

当前 `startStyleCalibrationBg()` 在风格识别完成后立即启动，但 `calibrateStoryStyle()` 内部仍需要场景描述来构建锚点图的上下文。

**待讨论：**
- 用空字符串 `''` 作为 sceneDesc 时，`buildAnchorPrompt()` fallback 到 `'a peaceful ambient environment'`，是否足够？
- 是否需要等序章生成后重新校准一次？

### [P2] 代码清理

以下文件不再被引用，建议删除：
- `/web/roleplay_structured.py` — 后端结构化接口（已移除）
- `/web/test.html` — 临时测试页面

---

## 四、技术细节备忘

### 结构化拆分调用方式

```javascript
// 前端直调 Agnes LLM（温度 0.1）
const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...historyMessages,
    { role: 'user', content: rawText }
];
const response = await App.agnesChat(messages, { temperature: 0.1 });
```

### 角色小传生成

```javascript
// 顺序生成，每个角色温度 0.8
for (const char of chars) {
    const bio = await App.agnesChat(messages, { temperature: 0.8 });
}
```

### 消息格式规范

历史消息中必须保留标签结构：
```
【角色名】霜璃 【动作】她微微一怔... 【语言】"……也好。" 【内心】他竟想与我独处...
```

禁止扁平化为：
```
她微微一怔...，"……也好。"，霜璃心想他竟想与我独处...
```
