# 百度收录三件套 - 使用说明

## 1. sitemap.xml ✅ 已完成
- 位置: `ai_nav/sitemap.xml`
- URL: https://www.bayihy.cn/sitemap.xml
- 已从 2 → 11 个页面
- **维护**: 新增页面路由时,记得往 sitemap.xml 里补一条

## 2. 自动推送 JS ✅ 已完成
- 位置: `static/js/baidu-push.js`
- 已注入所有主要模板 `</body>` 前
- 用户访问页面即触发,配额不限
- **新增页面模板**: 记得复制这一行到 `</body>` 前:
  ```html
  <script src="/static/js/baidu-push.js" async></script>
  ```

## 3. 主动推送脚本 ✅ 已完成
- 位置: `scripts/baidu_push.py`
- Token: 存在 `/root/.baidu_push.env` (权限 600)
- Wrapper: `scripts/baidu_push_cron.sh`
- Cron: 每天 03:15 自动推送
  ```
  15 3 * * * /root/wbrain-project/auto-tools/site_analyzer/web/scripts/baidu_push_cron.sh >> /var/log/baidu_push.log 2>&1
  ```
- 日志: `/var/log/baidu_push.log`
- 手动运行:
  ```bash
  /root/wbrain-project/auto-tools/site_analyzer/web/scripts/baidu_push_cron.sh
  ```
- 指定 URL 推送:
  ```bash
  source /root/.baidu_push.env
  python3 scripts/baidu_push.py https://www.bayihy.cn/tools/xxx
  ```

## 4. 已埋点
- `<meta name="baidu-site-verification" content="codeva-IKkeCFbXYn" />` (index.html)
- `baidu_verify_codeva-IKkeCFbXYn.html` (根目录 HTML 验证文件)
- `bdunion.txt` (百度联盟)

## 首日推送记录 (2026-07-23)
- 新站首日配额: 10 条/天
- 已推: 10/10 (首页 x1 + 主要页 x9)
- 今日剩余: 0
- 收录周期: 推送后百度会在 1~7 天内爬取,未必直接收录

## 配额变化规律
- 新站起始 10/天
- 提交页面后 24h 内可能自动提升(百度看到有真实内容后放宽)
- 有稳定收录/流量后可涨到 100+/天

## 收录进度追踪
- site 查询: https://www.baidu.com/s?wd=site%3Awww.bayihy.cn
- 站长后台「索引量」数据
- 站长后台「链接提交」→ 查看历史推送情况
