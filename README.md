# 🌐 多功能站长工具箱

一站式网站分析工具，支持SEO分析、AI信任度检测、SSL证书检查、移动端适配检测等，提供Web版在线使用和命令行两种方式。

## ✨ 功能

### 核心检测
- **SEO分析**：标题、描述、关键词、H标签、图片alt属性、Canonical标签
- **AI信任度检测**：JSON-LD、Open Graph、Twitter Card、语义化HTML、发布日期等
- **SSL证书检查**：证书有效期、颁发机构、剩余天数
- **移动端适配**：响应式设计、移动子域名、JS跳转检测
- **性能检测**：Gzip压缩、缓存控制、Keep-Alive、ETag

### AI信任度指标
帮助网站提升在AI搜索引擎（ChatGPT、Perplexity、Google SGE等）中的引用率：
- JSON-LD结构化数据
- Open Graph标签完整性
- Canonical权威版本声明
- 作者/发布者信息
- 发布/修改日期
- 语义化HTML标签
- H标签层级结构
- 图片alt属性完整性
- 页面语言声明

## 🚀 使用方式

### Web版（在线）

访问 http://111.228.14.153/tools 即可在线使用，支持：
- 单个网站分析
- 批量网站分析（最多10个）
- 快捷测试常用网站
- 完整的优化建议

### 命令行版

```bash
# 单个网站分析
python3 analyzer.py https://example.com

# 批量分析（从文件读取）
python3 analyzer.py --file urls.txt

# 生成HTML报告
python3 analyzer.py https://example.com --report

# 批量分析并生成报告
python3 analyzer.py --file urls.txt --report --output report.html
```

## 📦 依赖

```bash
pip install requests beautifulsoup4 flask
```

## 🏗️ 项目结构

```
site-analyzer/
├── analyzer.py          # 核心分析引擎
├── web/
│   ├── app.py          # Flask Web应用
│   └── templates/
│       └── index.html  # H5前端页面
├── README.md
└── LICENSE
```

## 📱 移动端支持

Web版采用响应式设计，手机、平板、电脑均可使用。

## 🔧 本地部署

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

## 📊 输出示例

### AI信任度检测
```
AI信任度得分: 100/100
├── JSON-LD: ✓ 1个 (WebApplication)
├── Open Graph: ✓ 完整
├── Canonical: ✓ 已设置
├── 作者/发布者: ✓ 有
├── 发布日期: ✓ 有
├── 语义化HTML: ✓ 4种
├── H标签层级: ✓ 结构清晰
└── 页面语言: ✓ zh-CN
```

### HTML报告
生成美观的HTML报告，包含：
- 总体评分
- SEO详细分析
- AI信任度评分
- 性能指标
- 移动端适配检测
- 优化建议

## 👨‍💻 作者

**巴依浩爷(BayiHY)**
- GitCode: https://gitcode.com/BayiHY

## 📄 许可证

MIT License
