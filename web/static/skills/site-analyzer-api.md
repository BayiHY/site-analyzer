---
name: site-analyzer-api
description: 站长工具网站分析API — 供其他AI智能体调用，分析任意网站的SEO、性能、安全性、AI可信度
triggers:
  - 分析网站
  - SEO分析
  - 网站检测
  - site analysis
---

# 站长工具 - 网站分析 API

**Base URL:** `https://www.bayihy.cn/tools`

> 注意：所有 URL 已统一使用域名 `https://www.bayihy.cn/tools`，IP `111.228.14.153` 已废弃。

## 快速开始

```bash
# 健康检查
curl https://www.bayihy.cn/tools/api/health

# 分析单个网站
curl -X POST https://www.bayihy.cn/tools/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"baidu.com"}'

# 查看完整API文档 (JSON)
curl https://www.bayihy.cn/tools/api/docs

# 查看可视化API文档 (HTML)
# 浏览器打开: https://www.bayihy.cn/tools/api/docs.html
```

## API 端点

### 1. GET /api/health — 健康检查

探测服务是否在线，返回服务状态和端点列表。

**响应示例：**
```json
{
  "status": "ok",
  "service": "site-analyzer",
  "version": "1.0.0",
  "endpoints": { ... },
  "rate_limit": {"max_requests": 10, "window_seconds": 60}
}
```

### 2. POST /api/analyze — 分析单个网站（核心接口）

**请求：**
```json
{"url": "baidu.com"}
```

- `url` 必填，支持裸域名（`baidu.com`）或完整URL（`https://www.baidu.com`）

**响应字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `score` | int | 综合评分 0-100 |
| `seo.title` | string | 页面标题 |
| `seo.meta_description` | string | Meta描述 |
| `seo.h1_count` | int | H1标签数量 |
| `seo.has_sitemap` | bool | 是否有sitemap.xml |
| `seo.has_robots` | bool | 是否有robots.txt |
| `seo.structured_data` | list | JSON-LD等结构化数据类型 |
| `seo.open_graph` | dict | Open Graph标签 |
| `performance.response_time` | float | 响应时间(秒) |
| `performance.content_size_kb` | float | 页面大小(KB) |
| `performance.compressed` | bool | 是否gzip/br压缩 |
| `security.ssl` | bool | 是否HTTPS |
| `security.ssl_issuer` | string | SSL颁发机构 |
| `ai_trust.score` | int | AI可信度评分 0-100 |
| `ai_trust.max_score` | int | 满分（100） |
| `ai_trust.json_ld` | object | `{exists, count, types[], importance}` JSON-LD结构化数据 |
| `ai_trust.open_graph` | object | `{exists, complete}` Open Graph完整度 |
| `ai_trust.canonical` | object | `{exists}` canonical标签 |
| `ai_trust.authorship` | object | `{has_author, platform}` 作者/平台信息 |
| `ai_trust.dates` | object | `{has_published, has_modified}` 发布/更新时间 |
| `ai_trust.semantic_html` | object | `{count}` 语义化HTML标签数 |
| `ai_trust.heading_structure` | object | `{proper_hierarchy}` 标题层级是否正确 |
| `ai_trust.language` | object | `{declared, matches_content}` 页面语言声明 |
| `ai_discoverability.total_score` | float | AI可发现性总分，各子项合计（满分125，A+≥100）|
| `ai_discoverability.structured_data.score` | int | 结构化数据包分（满分30：JSON-LD 8 + OG 12 + AI导航文件 10）|
| `ai_discoverability.structured_data.max` | int | 结构化数据满分（30，含AI爬虫导航文件检测）|
| `ai_discoverability.structured_data.items` | list | 检测项详情，含 icon/text/score/tip；**新增AI爬虫导航检测项**：robots.txt(+3)、llms.txt(+3)、sitemap.xml(+2)、AI爬虫显式放行(+2)，共10分 |
| `ai_crawler_access` | object | AI爬虫导航文件检测结果（详见下方）|
| `ai_discoverability.grade` | string | 评级 A+/A/B/C/D，对应125分制阈值 |

**`ai_crawler_access` 字段详情：**

| 子字段 | 类型 | 说明 |
|--------|------|------|
| `robots_txt.exists` | bool | robots.txt 是否存在 |
| `robots_txt.status` | int | HTTP 状态码（不存在时为 404）|
| `robots_txt.content` | string | robots.txt 原始内容 |
| `robots_txt.ai_bots` | dict | 解析后的 User-agent → Allow/Disallow 规则 |
| `llms_txt.exists` | bool | llms.txt 是否存在 |
| `llms_txt.status` | int | HTTP 状态码 |
| `sitemap_xml.exists` | bool | sitemap.xml 或 sitemap-index.xml 是否存在 |
| `sitemap_xml.status` | int | HTTP 状态码 |
| `sitemap_xml.url` | string | 实际存在的 sitemap 地址 |

> **AI爬虫导航文件检测**：2026-05-19 新增。检测 robots.txt / llms.txt / sitemap.xml 三个文件是否存在，并解析 robots.txt 中 GPTBot / ClaudeBot / PerplexityBot / GeminiBot / GoogleExtended / Diffbot 的显式放行规则。评分融入 `structured_data` 分类（满分从 20 → 30，总分从 115 → 125）。

> **检测逻辑要点：** 已知API路径优先探测CORS（`api_endpoints[0]`提取base）+ 子路径优先探测（`/tools/api`先于`/api`）+ 重定向跟随（根域名重定向到子路径时探测目标域名）+ 宽松JSON判断（405+JSON也算入口）。检测细节见 `references/api-friendly-detection.md`

> **Cloudflare JS 挑战 + SPA 处理**：部分站点（典型：beian.miit.gov.cn）返回 HTTP 521 + `__jsluid_s` cookie + JS 重定向。检测逻辑、`is_spa`/`spa_final_url` 字段含义、hash 路由探测限制，见 `references/beian-miit-handling.md`

> **ICP备案检测**：检测优先级（SEO项 → 源码正则 → JSON-LD → 已知域名兜底）、公安网备逻辑、IPv6→IPv4回退，见 `references/icp-gongan-detection.md`

> **AI 导航文件（llms.txt）规范**：llms.txt / llms-full.txt 格式、放置规则、125分制评分中的 AI 爬虫导航检测项说明，见 `references/ai-llms-txt-spec.md`

| `icp_filing.has_icp` | bool | 是否检测到ICP备案（检测失败时不存在） |
| `icp_filing.icp_number` | string | 备案号（可能为 None） |
| `is_spa` | bool | 是否检测到 Cloudflare JS 挑战页（521+hash路由，见 references/beian-miit-handling.md） |
| `spa_final_url` | string | SPA hash 路由探测后的实际 URL（若有） |
| `ipv6.supported` | bool | 目标域名是否有AAAA记录（IPv6） |
| `ipv6.ipv6_count` | int | IPv6地址数量 |
| `ipv6.ipv4_count` | int | IPv4地址数量 |
| `ipv6.ipv6_addresses` | list | IPv6地址列表 |
| `ipv6.ipv4_addresses` | list | IPv4地址列表 |
| `ipv6.all_ips` | list | 所有IP地址 |
| `ip_intel` | object | IP归属地/运营商/备案合规判定（见下方详情） |
| `accessible` | bool | 网站是否可访问 |
| `status_code` | int | HTTP状态码 |

**`ip_intel` 字段详情：**

| 子字段 | 类型 | 说明 |
|--------|------|------|
| `ip` | string | 解析到的主IP |
| `country` | string | 国家 |
| `country_code` | string | ISO国别码（如 CN、US） |
| `region` | string | 省份/州 |
| `city` | string | 城市 |
| `isp` | string | 运营商 |
| `org` | string | 组织（公司名） |
| `asn` | string | ASN编号 |
| `is_china` | bool | 是否中国IP |
| `compliance.is_domestic` | bool | 是否国内IP |
| `compliance.has_icp` | bool | 是否检测到ICP备案 |
| `compliance.has_gongan` | bool | 是否检测到公网安备 |

> 注意：`compliance` 已移除 `status` / `messages` / `suspicious_abroad` / `suspicious_abroad_list` — 用户决定只保留布尔值（2026-05-18）。
> 注意：`ip_intel` 已移除 `network_type` / `is_residential` — 用户决定简化布局（2026-05-18）。前端 `ip_intel` 卡片只展示：IP 地址、所在地区、国家/地区、运营商/组织、ICP 备案 ✅/❌、公网安备 ✅/❌，已移除网络类型标签、合规状态标签、提示消息。

**curl 示例：**
```bash
curl https://www.bayihy.cn/tools/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"github.com"}'
```

### 3. POST /api/batch — 批量分析

**请求：**
```json
{"urls": ["baidu.com", "github.com", "juejin.cn"]}
```

- 最多10个URL，并发5线程
- 返回数组，每个元素结构同 `/api/analyze`

### 4. POST /api/dns — DNS解析检测

**请求：**
```json
{"domain": "baidu.com"}
```

**响应：**
```json
{
  "domain": "baidu.com",
  "resolved": true,
  "ipv4": ["110.242.68.66", "39.156.66.10"],
  "ipv6": [],       // ← 始终是空数组（DNS端点仅做IPv4解析）
  "count": 2
}
```

### 5. POST /api/test-ip — IP可达性测试

**请求：**
```json
{"ip": "110.242.68.66", "host": "baidu.com"}
```

- `host` 可选，用于SNI握手

## 频率限制

- 每设备（IP+UA指纹）**10次/60秒**
- 超限返回 HTTP 429，响应体含 `retry_after`（秒）
- 建议调用方实现指数退避重试

**响应头（每个 /api/ 响应都包含）：**
| 头部 | 示例 | 说明 |
|------|------|------|
| `X-RateLimit-Limit` | `10` | 窗口内最大请求数 |
| `X-RateLimit-Remaining` | `7` | 剩余可用次数 |
| `X-RateLimit-Window` | `60` | 窗口秒数 |

**受限端点**：`/api/analyze`、`/api/batch`、`/api/dns`、`/api/test-ip`
**不受限端点**（轻量只读）：`/api/health`、`/api/docs`、`/api/docs.html`

## Python 调用示例

```python
import requests

BASE = "https://www.bayihy.cn/tools/api"

# 分析单个网站（POST，不是 GET）
resp = requests.post(f"{BASE}/analyze", json={"url": "baidu.com"})
data = resp.json()
print(f"评分: {data['score']}, 标题: {data['seo']['title']}")

# 批量分析
resp = requests.post(f"{BASE}/batch", json={"urls": ["baidu.com", "github.com"]})
for site in resp.json():
    print(f"{site.get('url', '?')}: {site.get('score', 0)}分")
```

## 运维注意事项

### nginx CORS 配置（关键）

Flask 在 `/tools/` 反代后，OPTIONS 预检请求被 nginx catch-all `location /` 截断返回404。**必须在 `location /` 之前加 `location /api`** 块处理 CORS。

配置示例与完整逻辑见 `references/api-friendly-detection.md`。

**关键教训**：nginx location 匹配按配置顺序，**必须在 catch-all `location /` 之前**定义 `location /api`，否则 OPTIONS 被截断。

### nginx location 精确匹配顺序（AI导航文件 404 踩坑）

部署 robots.txt / llms.txt / sitemap.xml 等根路径静态文件时，**必须放在 `location = /` 之前**，否则会被 `return 301 /tools/` 重定向截获导致 404。详见 `site-analyzer-dev` skill → `references/nginx-flask-static-files.md`。

**bayihy.cn 当前正确配置**：`location = /robots.txt` 等精确匹配放在最前面，`location = /` 放最后（仅处理空路径 `/`）。

### Flask 重启流程（完整版）
Flask 不会热加载代码修改，必须手动重启。**流程错了会导致旧进程占端口，新进程起不来。**

**正确步骤：**
1. `ps aux | grep app.py | grep -v grep` 找到旧 PID
2. `kill -9 <PID>` 杀进程（普通 `kill` 不够，systemd 等监护进程会拉起新的）
3. `lsof -ti:5000 | xargs kill -9` 清理占用 5000 端口的残留进程
4. `sleep 1` 等端口释放
5. `terminal(background=true)` 启动新进程
6. `curl -s http://127.0.0.1:5000/ | grep '要改的内容'` 验证新代码已生效

**常见错误：** 用 `nohup ... &` 会报 Hermes TUI 错误。用 `background=true` 启动后在新命令里验证。

**验证模板改动：** `curl -s http://127.0.0.1:5000/ | grep '要改的内容'` — 能 grep 到才算数。

### 快捷按钮
首页快捷按钮在 `templates/index.html` 的 `<span class="quick-link" onclick="quickAnalyze(...)">` 区域。
当前6个：百度 / GitHub / 知乎 / B站 / 掘金 / 本工具。

### 跳转提示与目标站重分析
`redirect_count > 0` 时前端自动显示橙色提示条，展示跳转链并提供「分析目标站」按钮。
- 实现：`renderResult()` 中插提示条 + `reAnalyze(url)` 函数填框并触发分析
- 相关字段：`redirect_chain`（完整跳转链）、`final_url`（最终 URL）

## 注意事项

1. **输入清洗**：`url` 支持裸域名，会自动补 `https://`
2. **超时**：单个网站分析约需 3-10 秒，批量最多 30 秒
3. **无认证**：当前接口无需 API Key，靠频率限制防滥用
4. **数据不存储**：分析结果不持久化，每次请求独立
5. **子路径部署**：所有API在 `/tools/` 子路径下（nginx反代）
6. **国外站点限制**：Google、YouTube 等站点从京东云服务器（`111.228.14.153`）无法访问（TCP 443 被 GFW 阻断），分析会超时

## 错误码

| HTTP | 含义 |
|------|------|
| 200 | 成功 |
| 400 | 参数错误（缺少url等） |
| 429 | 频率限制 |
| 500 | 分析失败（网站不可达等） |
