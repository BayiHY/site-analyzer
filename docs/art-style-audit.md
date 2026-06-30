# 画面风格逻辑审计报告

## 现状总览

画面风格（imageStyle）在系统中涉及 **7 个文件**、**约 15 处**引用点。

---

## 一、画面风格来源链路

### 1. 用户灵感检测（app-init.js L5-33）
`detectVisualStyleFromInspiration(inspiration)` 从用户输入的灵感文本中通过关键词匹配检测风格。

### 2. 开始冒险界面（roleplay.html L39-50）
- 已有 `#setup-art-style` 下拉选择框 + `#setup-style-group` 容器
- 容器默认 `display:none`，生图 key 存在时显示
- `onSetupImageKeyChange()` 监听生图 key 变化，显示/隐藏 + 自动预选
- 灵感输入框 `oninput` 实时检测并更新预选

### 3. 创建角色流程（create-flow.js L38-43）
```js
const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
const imageStyle = detectedStyle || 'anime';
```
**问题 1：这里完全忽略了用户在 `#setup-art-style` 中手动选择的值！**
- 用户选了 "watercolor"，但灵感中没有关键词 → 最终用 'anime'
- 用户选了 "watercolor"，灵感中有"水彩" → 检测到 watercolor，一致 ✅
- 用户选了 "anime"（默认），灵感中有"油画" → 覆盖为 oil painting，用户无法保持默认
- **结论：创建流程的 `imageStyle` 优先级为 `检测 > 硬编码'anime'`，完全绕过了用户手动选择**

### 4. 世界观生成（story-gen.js L23-30）
```js
const detectedStyle = App.detectVisualStyleFromInspiration(userInspiration || '');
const visualStyle = detectedStyle || state.story?.imageStyle || 'anime';
```
**问题 2：世界观生成中又做了一次灵感检测，但回退了 `state.story.imageStyle`**
- 如果 `state.story.imageStyle` 已在 create-flow 中设好，这里会优先用它
- 但 create-flow 设的是 `检测值 || 'anime'`，不是用户手动选择的值
- **优先级链：灵感检测 > state.story.imageStyle > 'anime'**

### 5. 角色生成（char-gen.js L18）
```js
const visualStyle = state.story?.imageStyle || 'anime';
```
- 直接从 state 读取，没问题 ✅

### 6. 生图 API（image-api.js L15-17）
```js
const style = state.story?.imageStyle || state.story?.artStyle || 'anime';
```
- 兼容旧字段 `artStyle` ✅

### 7. 设置面板（side-panel.js L159-168）
- 下拉框读取 `state.story?.imageStyle || state.story?.artStyle || 'anime'`
- 保存时写入 `state.story.imageStyle = artStyleEl.value`
- **问题 3：设置面板只在"故事进行中"才能改，无法在创建前影响生成**

---

## 二、发现的问题

### 🔴 严重：创建流程未读取用户手动选择

**create-flow.js L38-40：**
```js
const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
const imageStyle = detectedStyle || 'anime';
```

**应该改为：**
```js
const setupSelect = document.getElementById('setup-art-style');
const userSelectedStyle = setupSelect && setupSelect.value ? setupSelect.value : null;
const detectedStyle = App.detectVisualStyleFromInspiration(storyPrompt);
const imageStyle = userSelectedStyle || detectedStyle || 'anime';
```

这样优先级变为：**用户手动选择 > 灵感检测 > 默认'anime'**

### 🟡 中等：story-gen.js 的灵感检测冗余

story-gen.js L23-25 再次调用 `detectVisualStyleFromInspiration`，但此时 `state.story.imageStyle` 已经在 create-flow 中设好了。这次检测的结果只在 systemPrompt/userPrompt 中注入给 LLM，不影响 `state.story.imageStyle`。

**问题：** 如果用户在 setup 界面选了 "watercolor"，但灵感里有"写实"，会出现：
- `state.story.imageStyle` = "watercolor"（生图用）
- prompt 里的 visualStyle = "写实"（LLM 看到的内容）

**这会导致 LLM 生成的角色 imageStyle 字段（char-gen.js L54）与用户选择矛盾。**

**建议：** story-gen.js 直接使用 `state.story.imageStyle`，不再做灵感检测。

### 🟢 轻微：state.story.artStyle 兼容字段

多处使用了 `state.story?.artStyle` 作为 fallback，这是旧字段名。建议统一为 `imageStyle`，但保留兼容读取。

---

## 三、修复方案

### 修复 1：create-flow.js — 读取用户手动选择

优先级：用户手动 > 灵感检测 > 默认

### 修复 2：story-gen.js — 直接使用 state.story.imageStyle

不再重复检测灵感中的风格关键词，避免与生图风格矛盾。

### 修复 3：设置面板显示逻辑检查

设置面板的画面风格下拉框目前无条件显示。考虑是否也应该受生图 key 控制（可选优化，非阻塞）。

---

## 四、优先级排序

1. **修复 create-flow.js** — 读取用户手动选择（阻塞性 bug）
2. **修复 story-gen.js** — 统一使用 state.story.imageStyle（避免 LLM 矛盾）
3. **设置面板** — 确认逻辑一致（非阻塞）
