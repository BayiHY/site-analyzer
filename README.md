# 🌐 多功能站长工具箱

一站式网站分析工具，支持SEO分析、可用性检测、SSL证书检查，批量检测并生成HTML报告。

## ✨ 功能

- **SEO分析**：标题、描述、关键词、H标签、图片alt属性
- **可用性检测**：HTTP状态码、响应时间、重定向链
- **SSL证书检查**：证书有效期、颁发机构、剩余天数
- **批量检测**：一次分析多个网站
- **HTML报告**：生成可视化分析报告

## 🚀 快速使用

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
pip install requests beautifulsoup4
```

## 📄 输出示例

### 命令行输出
```
========== 网站分析报告 ==========
URL: https://example.com
状态码: 200
响应时间: 0.35s
SSL证书: 有效 (剩余 245 天)

--- SEO信息 ---
标题: Example Domain
描述: This is an example domain
关键词: 未设置
H1标签: 1 个
H2标签: 2 个
图片总数: 3
缺少alt的图片: 1
================================
```

### HTML报告
生成美观的HTML报告，包含：
- 总体评分
- SEO详细分析
- 性能指标
- 优化建议

## 📝 许可证

MIT License
