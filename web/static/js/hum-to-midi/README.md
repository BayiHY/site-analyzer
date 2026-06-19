# Hum-to-MIDI 代码拆分文档

## 📁 文件结构

```
web/
├── templates/
│   ├── hum-to-midi-modular.html    # 新的模块化HTML（主入口）
│   └── hum-to-midi.html            # 原始单文件版本（备份）
│
├── static/
│   ├── css/
│   │   └── hum-to-midi.css         # 所有样式（338行）
│   │
│   └── js/
│       └── hum-to-midi/
│           ├── core/               # 核心类
│           │   ├── pitch-detector.js    # 音高检测类（59行）
│           │   └── midi-writer.js       # MIDI文件生成类（75行）
│           │
│           ├── audio/              # 音频处理
│           │   ├── recording.js         # 录音控制（221行）
│           │   └── detection.js         # 音高检测循环（84行）
│           │
│           ├── midi/               # MIDI设备
│           │   ├── web-midi.js          # Web MIDI API（68行）
│           │   └── midi-handler.js      # MIDI消息处理（57行）
│           │
│           ├── piano/              # 虚拟钢琴
│           │   └── virtual-piano.js     # 虚拟钢琴键盘（479行）
│           │
│           ├── ui/                 # 用户界面
│           │   ├── display.js           # 音符显示（34行）
│           │   ├── visualization.js     # 波形可视化（26行）
│           │   └── input-mode.js        # 输入模式管理（33行）
│           │
│           ├── export/             # 导出功能
│           │   └── export-play.js       # 导出和播放（96行）
│           │
│           └── main.js             # 主程序和全局变量（64行）
```

## 📊 代码统计

| 模块 | 文件数 | 总行数 | 说明 |
|------|--------|--------|------|
| **CSS** | 1 | 338 | 所有样式 |
| **Core** | 2 | 134 | 核心算法类 |
| **Audio** | 2 | 305 | 音频处理 |
| **MIDI** | 2 | 125 | MIDI设备交互 |
| **Piano** | 1 | 479 | 虚拟钢琴 |
| **UI** | 3 | 93 | 用户界面 |
| **Export** | 1 | 96 | 导出播放 |
| **Main** | 1 | 64 | 主程序 |
| **总计** | 13 | 1,296 | JS代码 |

原始单文件：**1,765 行**（HTML+CSS+JS）
拆分后：**1,296 行**（纯JS）+ 338 行（CSS）+ ~200 行（HTML）

## 🎯 拆分优势

### 1. **问题定位更快**
- 音高检测问题 → `core/pitch-detector.js`
- 录音问题 → `audio/recording.js`
- MIDI设备问题 → `midi/web-midi.js`
- 虚拟钢琴问题 → `piano/virtual-piano.js`
- 显示问题 → `ui/display.js`

### 2. **维护更简单**
- 每个文件职责单一，平均 50-100 行
- 修改某个功能只需编辑对应文件
- 不需要在 1700+ 行代码中搜索

### 3. **协作更方便**
- 不同开发者可以同时编辑不同模块
- 减少代码冲突
- 代码审查更聚焦

### 4. **性能优化空间**
- 可按需加载模块（未来可改为动态 import）
- 浏览器缓存更细粒度
- 压缩和优化更灵活

## 🔧 JS 模块加载顺序

```html
<!-- 1. 全局变量（必须最先） -->
<script src="/static/js/hum-to-midi/main.js"></script>

<!-- 2. 核心类 -->
<script src="/static/js/hum-to-midi/core/pitch-detector.js"></script>
<script src="/static/js/hum-to-midi/core/midi-writer.js"></script>

<!-- 3. UI 模块 -->
<script src="/static/js/hum-to-midi/ui/input-mode.js"></script>

<!-- 4. MIDI 模块 -->
<script src="/static/js/hum-to-midi/midi/web-midi.js"></script>
<script src="/static/js/hum-to-midi/midi/midi-handler.js"></script>

<!-- 5. 音频处理 -->
<script src="/static/js/hum-to-midi/audio/recording.js"></script>
<script src="/static/js/hum-to-midi/audio/detection.js"></script>

<!-- 6. UI 显示 -->
<script src="/static/js/hum-to-midi/ui/visualization.js"></script>
<script src="/static/js/hum-to-midi/ui/display.js"></script>

<!-- 7. 导出功能 -->
<script src="/static/js/hum-to-midi/export/export-play.js"></script>

<!-- 8. 虚拟钢琴（包含初始化代码） -->
<script src="/static/js/hum-to-midi/piano/virtual-piano.js"></script>
```

## 🚀 访问地址

- **新版本（模块化）**: https://www.bayihy.cn/tools/hum-to-midi
- **旧版本（单文件）**: https://www.bayihy.cn/tools/hum-to-midi-old

## 📝 未来改进建议

1. **ES6 模块化**
   - 将 `<script>` 改为 `<script type="module">`
   - 使用 `import/export` 语法
   - 真正的模块依赖管理

2. **按需加载**
   - 虚拟钢琴模块可以懒加载（只有选择 MIDI 模式时才加载）
   - 导出功能可以按需加载

3. **代码压缩**
   - 生产环境使用压缩版 JS
   - 合并多个小文件减少 HTTP 请求

4. **TypeScript**
   - 添加类型定义
   - 更好的 IDE 支持和错误检查

## ✅ 测试验证

所有静态文件已通过 HTTP 访问测试：
- ✅ CSS 文件：`/static/css/hum-to-midi.css` (10.7KB)
- ✅ JS 主文件：`/static/js/hum-to-midi/main.js` (2.4KB)
- ✅ 所有 JS 模块：13 个文件，共 1,296 行

---

**创建时间**: 2026-06-10
**维护者**: Hermes Agent
