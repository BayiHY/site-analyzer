# 🌐 站长工具 - AI时代的SEO分析平台

> **首个支持AI可信度分析的开源SEO工具** — 帮助网站优化在ChatGPT、Perplexity、Google SGE等AI搜索引擎中的表现

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.7+](https://img.shields.io/badge/Python-3.7+-green.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-Web%20Framework-orange.svg)](https://flask.palletsprojects.com/)

📦 **源码仓库：** [Gitee](https://gitee.com/BayiHY/site-analyzer) ｜ [GitCode](https://gitcode.com/BayiHY/site-analyzer) ｜ [GitHub](https://github.com/BayiHY/site-analyzer)

## 🎯 为什么选择这个工具？

在AI搜索引擎时代，传统SEO已不够用。**AI信任度（AI Trust）** 决定了你的内容是否会被ChatGPT、Perplexity等AI引用。

这个工具是**首个**将AI信任度检测与传统SEO分析结合的开源项目：

| 功能 | 本工具 | 传统SEO工具 |
|------|--------|-------------|
| AI信任度检测 | ✅ | ❌ |
| JSON-LD分析 | ✅ | 部分 |
| Open Graph检测 | ✅ | 部分 |
| 语义化HTML分析 | ✅ | ❌ |
| AI引用优化建议 | ✅ | ❌ |
| 免费开源 | ✅ | ❌ |

## ✨ 核心功能

### 🔍 SEO分析
- 页面标题与Meta描述
- 关键词分析
- H标签层级结构
- 图片alt属性检测
- Canonical标签
- Robots.txt分析
- 内部/外部链接统计

### 🤖 AI信任度检测（AI Trust Score）
专为AI搜索引擎优化设计：
- **JSON-LD结构化数据** — AI优先解析，用于生成摘要和知识图谱
- **Open Graph标签** — 社交媒体和AI引用时的首选数据源
- **Canonical权威声明** — 帮助AI识别内容的权威版本
- **作者/发布者信息** — E-E-A-T信号，影响AI引用决策
- **发布日期** — AI优先引用有明确时间的内容
- **语义化HTML** — 帮助AI理解页面结构
- **H标签层级** — 内容组织清晰度
- **图片alt属性** — 多模态AI的内容理解
- **页面语言声明** — 多语言AI的匹配依据

### 🚀 AI可发现性指数（AI Discoverability Index）
**面向AI/SEO综合可发现性评估（满分125）：**
- **结构化数据 (30分)** — JSON-LD、Open Graph、robots.txt、llms.txt、sitemap.xml
- **内容可引用性 (25分)** — 标题、描述、长度、作者、日期
- **AI爬虫导航 (10分)** — robots.txt/llms.txt/sitemap.xml存在、AI爬虫显式放行
- **API友好性 (15分)** — OpenAPI文档、认证方式明确
- **可访问性 (15分)** — 页面可访问、移动端友好、响应速度
- **媒体适配 (15分)** — 图片、视频、音频可访问
- **权威性信号 (15分)** — HTTPS、ICP备案号

### 🔒 SSL证书检测
- 证书有效期
- 颁发机构
- 剩余天数预警

### 📱 移动端适配检测
- 响应式设计检测
- 移动子域名检测
- UA自适应检测（解决百度等站点误判）

### ⚡ 性能检测
- Gzip压缩
- 缓存控制
- Keep-Alive
- ETag

## 🚀 快速开始

### 在线使用

访问 **https://www.bayihy.cn/tools** 即可免费使用

支持：
- 📊 单个网站深度分析
- 📦 批量网站分析（最多10个）
- ⚡ 快捷测试常用网站（百度、知乎、B站、掘金、GitHub）
- 📋 完整优化建议报告

### 本地部署

```bash
# 克隆项目
git clone https://gitcode.com/BayiHY/site-analyzer.git

# 进入目录
cd site-analyzer/web

# 安装依赖
pip install flask requests beautifulsoup4

# 启动服务
python3 app.py

# 访问 http://localhost:5000
```

### 命令行使用

```bash
# 单个网站分析
python3 analyzer.py https://example.com

# 批量分析（文件）
python3 analyzer.py --file urls.txt

# 生成HTML报告
python3 analyzer.py https://example.com --report -o my-report.html

# 批量生成报告
python3 analyzer.py --file urls.txt --report --workers 10
```

## 📊 输出示例

### AI信任度报告
```
AI信任度得分: 85/100
├── JSON-LD: ✓ 2个 (WebApplication, Organization)
├── Open Graph: ✓ 完整
├── Canonical: ✓ 已设置
├── 作者/发布者: ✓ 有
├── 发布日期: ✓ 2025-05-09
├── 语义化HTML: ✓ 5种 (header, main, section, article, footer)
├── H标签层级: ✓ 结构清晰
├── 图片alt: ⚠️ 75%完整
└── 页面语言: ✓ zh-CN
```

## 🆚 与其他工具对比

| 特性 | 本工具 | Screaming Frog | Ahrefs | SEMrush |
|------|--------|----------------|--------|---------|
| AI信任度检测 | ✅ | ❌ | ❌ | ❌ |
| 免费使用 | ✅ | 有限 | ❌ | ❌ |
| 开源 | ✅ | ❌ | ❌ | ❌ |
| 自部署 | ✅ | ❌ | ❌ | ❌ |
| 移动端支持 | ✅ | ❌ | ✅ | ✅ |
| 批量分析 | ✅ | ✅ | ✅ | ✅ |

## 🛠️ 技术栈

- **后端**: Python, Flask
- **前端**: HTML5, CSS3, JavaScript (原生)
- **分析**: BeautifulSoup4, Requests
- **部署**: Nginx反向代理

## 📁 项目结构

```
site_analyzer/
├── analyzer.py          # 核心分析引擎
├── web/
│   ├── app.py           # Flask Web应用
│   ├── ai_nav/          # AI导航文件（robots.txt, llms.txt, sitemap.xml）
│   ├── static/
│   │   └── images/      # 静态资源
│   └── templates/
│       ├── index.html   # H5前端（响应式）
│       ├── about.html   # 关于页面
│       └── api_docs.html # API文档页
├── README.md
└── LICENSE
```

## 🔑 关键词

SEO分析工具, AI信任度检测, AI SEO优化, 网站SEO检测, 
JSON-LD检测, Open Graph检测, 移动端适配检测, SSL证书检测, 
站长工具, 网站健康度检测, AI搜索引擎优化, ChatGPT SEO, 
Perplexity优化, Google SGE, 结构化数据检测, 开源SEO工具

## 📄 许可证

MIT License - 免费使用，商业友好

## 👨‍💻 作者

**巴依浩爷(BayiHY)**

📦 **源码仓库：**
- Gitee: [https://gitee.com/BayiHY/site-analyzer](https://gitee.com/BayiHY/site-analyzer)
- GitCode: [https://gitcode.com/BayiHY/site-analyzer](https://gitcode.com/BayiHY/site-analyzer)
- GitHub: [https://github.com/BayiHY/site-analyzer](https://github.com/BayiHY/site-analyzer)

🔗 **在线体验：** [https://www.bayihy.cn/tools](https://www.bayihy.cn/tools)

## 🤝 贡献

欢迎提交Issue和Pull Request！

## ⭐ 支持

如果这个工具对你有帮助，请给个Star⭐
