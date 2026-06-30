# Roleplay CSS 重构方案

> 目标：界面更优雅、交互更友好、文件更小更聚焦、废弃文件清理完毕。

## 一、现状诊断

| 文件 | 行数 | 问题 |
|------|------|------|
| `01-base.css` | 24 | ✅ OK，变量+重置 |
| `02-setup.css` | 97 | ✅ OK，创建界面 |
| `03-chat.css` | 243 | ❌ 太臃肿：消息气泡+快捷回复+输入区+头像全部混在一起 |
| `04-panel.css` | 86 | ❌ 侧边面板+角色卡片+统计+系统消息混在一起 |
| `05-extra.css` | 91 | ❌ 加载动画+图片放大+进度指示器+设置表单混在一起 |
| `06-twostage.css` | 116 | ✅ OK，两阶段控制栏独立成文件合理 |
| `roleplay.css` | 615 | ❌ **废弃文件，HTML 未引用，会误导智能体** |

**核心问题：**
1. `03-chat.css` 占总量 40%，消息气泡、输入区、快捷回复全堆在一起
2. `04-panel.css` 和 `05-extra.css` 职责不清
3. `roleplay.css` 是旧版单体文件，已废弃但仍在磁盘上
4. 缺少共享组件样式（按钮、表单控件跨文件重复定义）
5. 缺少动画/过渡效果（面板滑入、消息入场、按钮反馈）
6. 响应式只有 `≤600px` 一个断点

## 二、目标文件结构

```
web/static/css/roleplay/
├── 01-base.css            (24行)  ← 不变：CSS 变量 + 全局重置
├── 02-setup.css           (97行)  ← 不变：角色创建界面
├── 03-components.css      (新增)  ← 共享组件：按钮、表单控件、滚动条
├── 04-chat-layout.css     (新增)  ← 聊天布局：头部、消息区、输入区定位
├── 05-message-bubble.css  (新增)  ← 消息气泡：角色/用户/系统消息样式
├── 06-interaction.css     (新增)  ← 交互元素：快捷回复、头像、内心想法
├── 07-panel.css           (重组)  ← 侧边面板 + 角色卡片 + 统计组件
├── 08-overlay.css         (重组)  ← 遮罩层 + 图片放大 + 加载动画 + 进度指示器
├── 09-twostage.css        (重命名) ← 两阶段生成控制栏（原 06）
├── 10-responsive.css      (新增)  ← 响应式断点：手机/平板/桌面
└── [删除] roleplay.css    (615行) ← 废弃文件，立即删除
```

### 文件职责对照

| 文件 | 职责范围 | 目标行数 |
|------|---------|---------|
| `03-components.css` | `.btn`, `.btn-*`, `.form-group`, `.api-key-group`, 滚动条 | ~80 |
| `04-chat-layout.css` | `#chat-screen`, `.chat-header`, `.chat-messages`, `.chat-input-area`, `.scene-bg` | ~80 |
| `05-message-bubble.css` | `.msg`, `.bubble`, `.avatar`, 格式化片段(scene/action/speak/thought), 场景消息 | ~100 |
| `06-interaction.css` | `.reply-options`, `.reply-option-btn`, `.inline-replies`, `.thought-btn`, `.thought-content`, `.char-label` | ~80 |
| `07-panel.css` | `.side-panel`, `.overlay`, `.char-card`, `.char-card-*`, `.new-discovery`, `.stat-*`, `.sys-msg` | ~90 |
| `08-overlay.css` | `.img-overlay`, `.loading-overlay`, `.loading-spinner`, `.scene-gen-progress`, `.setting-*` | ~100 |
| `09-twostage.css` | `#gen-controls`, `.gen-phase`, `.phase-badge`, `.worldview-preview` | ~116 (不变) |
| `10-responsive.css` | `@media` 断点：≤480px, ≤600px, ≥768px, ≥1024px | ~60 |

## 三、交互增强计划

### 3.1 动画与过渡（整合到各文件中，不单独建文件）

| 元素 | 效果 | 实现 |
|------|------|------|
| 侧边面板 | 平滑滑入/滑出 | `transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1)` |
| 消息气泡 | 淡入+上移 | `@keyframes msgFadeIn` (opacity 0→1, translateY 8px→0, 0.3s) |
| 快捷回复按钮 | 缩放反馈 | `transform: scale(0.95)` on active |
| 头像 hover | 放大+光晕 | `transform: scale(1.1)` + `box-shadow: 0 0 0 2px var(--primary)` |
| 按钮点击 | 微缩+颜色过渡 | `transition: all 0.15s ease` |
| 面板关闭按钮 | 旋转退出 | `transition: transform 0.2s` on hover |
| 加载 spinner | 旋转 | 已有 `@keyframes spin` |
| 打字指示器 | 弹跳 | 已有 `@keyframes typing` |
| 生图进度条 | 流动动画 | 已有 `@keyframes progressAnim` |
| 遮罩层 | 淡入 | `transition: opacity 0.3s` |

### 3.2 视觉优化

| 项目 | 改动 |
|------|------|
| 消息气泡阴影 | 添加 `box-shadow: 0 2px 8px rgba(0,0,0,0.2)` |
| 气泡圆角 | 角色消息：左上角直角更自然（已有） |
| 输入区阴影 | 添加顶部阴影使悬浮感更强 |
| 滚动条美化 | 全局细滚动条 + 半透明 thumb |
| 焦点状态 | 所有输入框 focus 时添加 glow 效果 |
| 禁用态 | 按钮/输入框 disabled 时降低透明度 + 禁止光标 |
| 暗色主题一致性 | 确保所有 rgba 值与暗色背景协调 |

## 四、废弃文件清理

- **`roleplay.css`** — 615 行单体旧文件，HTML 模板未引用，直接删除
- 确认无任何 JS 代码通过 `<link>` 标签动态加载它
- 确认后端没有 serve 它作为 fallback

## 五、HTML 模板更新

更新 `roleplay.html` 的 `<link>` 引用顺序：

```html
<link rel="stylesheet" href="/static/css/roleplay/01-base.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/02-setup.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/03-components.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/04-chat-layout.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/05-message-bubble.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/06-interaction.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/07-panel.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/08-overlay.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/09-twostage.css?v={{ cb }}">
<link rel="stylesheet" href="/static/css/roleplay/10-responsive.css?v={{ cb }}">
```

## 六、执行步骤

1. 删除 `roleplay.css`
2. 创建 `03-components.css` — 提取按钮、表单、API key 清除按钮
3. 创建 `04-chat-layout.css` — 提取聊天布局定位
4. 创建 `05-message-bubble.css` — 提取消息气泡样式
5. 创建 `06-interaction.css` — 提取快捷回复、交互组件
6. 创建 `07-panel.css` — 重组侧边面板+角色卡片
7. 创建 `08-overlay.css` — 重组遮罩+加载+进度
8. 重命名 `06-twostage.css` → `09-twostage.css`（更新文件头注释）
9. 创建 `10-responsive.css` — 集中响应式断点
10. 更新 `roleplay.html` 的 `<link>` 引用
11. 验证所有类名无遗漏
