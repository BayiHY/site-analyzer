# math-problems 预览尺寸问题分析与改造思路

> 目标：让预览在任何设备上的宽高比例和视觉尺寸与手机端一致，内容随预览纸张等比缩放。

---

## 一、实测数据对比

### 日志采集结果（已优化，渲染后记录）

**手机（412×734）**：
```
[视口] 412×734 | 文档 412×734 | body 412×2102
[布局] .container 372×2042 → 内容区 332px (max-w=720)
[预览] #preview 372×510 (内边距 20×20, 内容区 332×470)
[纸张] .preview-page 332×470 (aspect=0.7064, 内容区 312×450, padding=10×5)
[页数] 共 1 页
[网格] .addsub-grid 322×129 | 题数:12 | gap:12px | cols:repeat(3, 1fr)
[网格] .mix-grid 322×176 | 题数:8 | row-gap:48px | cols:repeat(2, 1fr)
[样式] --font-size:12px --gap-addsub:12px --gap-mixed:48px --letter-spacing:1px --line-height-mixed:8px
[实测] .preview-problem font-size:12px line-height:19.2px padding:2×0
[UI] .card[2] 372×268
[响应] MOBILE(<600) 表单单列/按钮全宽
```

**PC（947×582）**：
```
[视口] 947×582 | 文档 934×582 | body 934×1786
[布局] .container 720×1726 → 内容区 680px (max-w=720)
[预览] #preview 720×1002 (内边距 20×20, 内容区 680×962)
[纸张] .preview-page 680×962 (aspect=0.7064, 内容区 670×942, padding=10×5)
[页数] 共 1 页
[网格] .addsub-grid 670×129 | 题数:12 | gap:12px | cols:repeat(3, 1fr)
[网格] .mix-grid 670×176 | 题数:8 | row-gap:48px | cols:repeat(2, 1fr)
[样式] --font-size:12px --gap-addsub:12px --gap-mixed:48px --letter-spacing:1px --line-height-mixed:8px
[实测] .preview-problem font-size:12px line-height:19.2px padding:2×0
[UI] .card[2] 720×94
[响应] DESKTOP(≥720) 容器居中最大720px
```

### 核心差异表

| 指标 | 手机 | PC | 倍数 |
|------|------|-----|------|
| `.container` 内容区 | 332px | 680px | **2.05×** |
| `.preview` 内容区 | 332×470 | 680×962 | **2.05×** |
| `.preview-page` | 332×470 | 680×962 | **2.05×** |
| `.addsub-grid` 宽 | 322px | 670px | **2.08×** |
| `.addsub-grid` 高 | 129px | 129px | **1.00×** |
| `.mix-grid` 宽 | 322px | 670px | **2.08×** |
| `.mix-grid` 高 | 176px | 176px | **1.00×** |
| 字体大小 | 12px | 12px | **1.00×** |
| line-height | 19.2px | 19.2px | **1.00×** |
| gap-addsub | 12px | 12px | **1.00×** |
| gap-mixed | 48px | 48px | **1.00×** |

---

## 二、问题诊断

### P0 — 预览页面宽度随容器拉伸

`.preview-page { width: 100%; aspect-ratio: 210/297 }` 导致页面宽度完全取决于父容器 `.preview` 的可用宽度：

- 手机：容器内容区 332px → 页面 332×470
- PC：容器内容区 680px → 页面 680×962

**页面高度也被 `aspect-ratio` 拉大了 2.05 倍。**

### P1 — 网格高度不变，说明行高/间距是固定 px

对比两个设备的网格数据：

| 网格 | 手机宽 | PC宽 | 手机高 | PC高 |
|------|--------|------|--------|------|
| .addsub-grid | 322 | 670 | 129 | 129 |
| .mix-grid | 322 | 670 | 176 | 176 |

**宽度差 2.08 倍，高度完全一样。** 这证明：
- 每道题的高度由 `line-height`（19.2px）+ `padding`（2px）决定，固定不变
- 行数也相同（加6+减6=12题，混合8题），所以总高度自然一样
- 但列数相同（3列/2列），所以题目是横向排列的，宽度被拉大
- **结果：PC 上题目被横向拉宽，但纵向没有变化，布局比例失调**

### P2 — 字体不跟随预览缩放

`.preview-problem` 在两个设备上都是 `font-size: 12px`。当页面宽度从 332px 变到 680px 时：
- 手机上文字占页面宽度的比例更大
- PC 上同样的 12px 文字在 680px 的页面上显得更小、更稀疏
- 用户看到的"视觉效果"完全不同

### P3 — PDF 截图与屏幕预览不一致

```js
const canvas = await html2canvas(pages[i], { scale: 2 });
// PC 上 pages[i] 实际约 680×962px → 截图 1360×1924px
// 手机 上 pages[i] 实际约 332×470px → 截图 664×940px
```

虽然 jsPDF 按 A4 比例放入，但**屏幕预览的大小不反映最终打印效果**。用户在 PC 上看到的是放大的预览，以为打印出来也是那么大，实际打印到 A4 纸上会缩小回去。

### P4 — 打印样式与屏幕预览不一致

```css
@media print {
    .preview { padding: 0 !important; }
    .preview-page { padding: 20px 40px; }
}
.preview { padding: 20px; }
.preview-page { padding: 10px 5px; }
```

屏幕预览 padding 是 `10px 5px`，打印时变成 `20px 40px`。如果用户按屏幕预览去调整布局，打印出来会不一样。

---

## 三、改造目标

1. **预览页尺寸全局统一**：无论 PC/手机/平板，`.preview-page` 的显示尺寸都等于手机端基准（宽≈332px，高≈470px）
2. **内容等比缩放**：题目文字、间距、二维码等所有内部元素跟随预览页面等比缩放
3. **PDF 输出正确**：截图时恢复真实 A4 尺寸，确保打印效果与预览一致
4. **打印样式统一**：屏幕预览和打印输出使用相同的内边距/排版

---

## 四、改造方案

### 推荐方案：固定预览基准尺寸 + CSS transform 缩放

#### 核心思路

把 `.preview` 当作一个固定 332×470 的"画布"，根据可用空间通过 `transform: scale()` 缩放到合适大小。

#### 具体步骤

**Step 1：固定预览页尺寸**

```css
.preview {
    width: 332px;  /* 手机端实际宽度 = container(372) - padding(40) */
    margin: 0 auto;
    transform-origin: top center;
}

.preview-page {
    width: 100%;       /* 相对于 332px 的 100% */
    aspect-ratio: 210/297;
}
```

**Step 2：JS 计算缩放比例**

```js
function updatePreviewScale() {
    const preview = document.getElementById('preview');
    const baseWidth = 332;
    const availableWidth = window.innerWidth - 40; // body padding
    const scale = Math.min(1, availableWidth / baseWidth);
    preview.style.transform = `scale(${scale})`;
    preview.style.marginBottom = `${(1 / scale - 1) * baseWidth}px`;
}
```

这样：
- 手机端（视口 412）：scale = min(1, 372/332) = 1 → 原尺寸
- PC 端（视口 947）：scale = min(1, 907/332) = 1 → 原尺寸（居中显示，两侧留白）
- 超大屏：始终维持 332×470 的视觉大小

**Step 3：内部元素自动跟随缩放**

由于整个 `.preview` 容器被 `scale()` 缩放，内部的字体、间距、网格会自动等比缩小/放大。不需要额外处理。

**Step 4：PDF 生成前恢复真实尺寸**

```js
async function downloadPDF() {
    const pages = preview.querySelectorAll('.preview-page');
    
    // 临时取消缩放，让 html2canvas 截到真实尺寸
    const originalTransform = preview.style.transform;
    preview.style.transform = 'none';
    
    for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2 });
        // ... 原有 PDF 逻辑不变
    }
    
    // 恢复缩放
    preview.style.transform = originalTransform;
}
```

此时 `.preview-page` 的实际宽度是 332px，html2canvas 以 2x 截图得到 664×940px 的画布。jsPDF 按 210mm 放入，输出比例正确。

**Step 5：统一打印样式**

```css
@media print {
    .preview {
        transform: none !important;
        width: 210mm;  /* 直接按 A4 物理宽度 */
        padding: 0;
    }
    .preview-page {
        padding: 10px 5px;  /* 与屏幕预览一致 */
        page-break-after: always;
    }
}
```

---

## 五、备选方案

### 方案 B：容器宽度限制 + 媒体查询

不固定尺寸，而是给 `.preview-page` 设置 `max-width`：

```css
.preview-page {
    max-width: 332px;
    width: 100%;
    margin: 0 auto;
}
```

优点：简单，不需要 JS。
缺点：PC 上预览仍然偏小（332px），两侧大量留白，不如 transform 方案灵活。

### 方案 C：完全重写为 SVG/Canvas 渲染

用 SVG 或 Canvas 直接绘制题目，精确控制每个元素的位置和尺寸。

优点：跨设备完全一致，PDF 生成最简单。
缺点：需要重写整个渲染逻辑，工作量大。

---

## 六、实施优先级

| 优先级 | 事项 | 影响 |
|--------|------|------|
| P0 | 固定预览基准尺寸 + transform 缩放 | 解决核心问题 |
| P1 | PDF 生成前恢复真实尺寸 | 保证打印质量 |
| P2 | 统一打印样式 | 预览与打印一致 |
| P3 | 日志中增加缩放比例记录 | 便于调试 |

---

## 七、验证标准

1. PC 和手机预览的 `.preview-page` 视觉尺寸一致（约 332×470px）
2. 题目文字在两种设备上可读性相同
3. PDF 输出在 A4 纸上排版正确，与屏幕预览内容一致
4. 日志中记录当前缩放比例，便于排查
5. 窗口 resize 时预览自动适配
