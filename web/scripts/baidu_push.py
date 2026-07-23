#!/usr/bin/env python3
"""
百度主动推送脚本
- 从 sitemap.xml 读取所有 URL
- 通过百度普通收录 API 推送
- 建议加到 cron 每天跑一次

用法:
  export BAIDU_PUSH_TOKEN=你的token
  python3 baidu_push.py                    # 推送所有sitemap URL
  python3 baidu_push.py https://xxx https://yyy   # 推送指定URL

获取 token:
  1. 登录 https://ziyuan.baidu.com/
  2. 添加站点 www.bayihy.cn 并验证(已经埋了 verification meta)
  3. "普通收录" -> "资源提交" -> "API提交" 里复制接口调用地址中的 token
"""
import os
import sys
import re
import json
import urllib.request
import urllib.error

SITE_DOMAIN = "www.bayihy.cn"       # 推送 API 用的 site 参数(不带协议)
SITE_BASE = f"https://{SITE_DOMAIN}"  # 抓取 sitemap 用的完整地址
SITEMAP_URL = f"{SITE_BASE}/sitemap.xml"
TOKEN = os.environ.get("BAIDU_PUSH_TOKEN", "").strip()


def read_sitemap_urls():
    """从 sitemap.xml 抓取 <loc> 列表"""
    try:
        with urllib.request.urlopen(SITEMAP_URL, timeout=10) as r:
            xml = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[ERR] 读取 sitemap 失败: {e}")
        return []
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def push_to_baidu(urls, token):
    """调用百度普通收录 API"""
    if not urls:
        print("[WARN] 无 URL 需要推送")
        return

    api = f"http://data.zz.baidu.com/urls?site={SITE_DOMAIN}&token={token}"
    body = "\n".join(urls).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=body,
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"[ERR] HTTP {e.code}: {body}")
        return
    except Exception as e:
        print(f"[ERR] 请求失败: {e}")
        return

    print(f"[OK] 推送响应: {json.dumps(resp, ensure_ascii=False)}")
    if "success" in resp:
        print(f"  ✓ 成功推送: {resp.get('success')} 条")
    if "remain" in resp:
        print(f"  ✓ 当日剩余配额: {resp.get('remain')}")
    if "not_same_site" in resp and resp["not_same_site"]:
        print(f"  ! 非本站 URL: {resp['not_same_site']}")
    if "not_valid" in resp and resp["not_valid"]:
        print(f"  ! 无效 URL: {resp['not_valid']}")


def main():
    if not TOKEN:
        print("[ERR] 未设置 BAIDU_PUSH_TOKEN 环境变量")
        print("      export BAIDU_PUSH_TOKEN=你的token")
        sys.exit(1)

    if len(sys.argv) > 1:
        urls = sys.argv[1:]
        print(f"[INFO] 使用命令行传入的 {len(urls)} 条 URL")
    else:
        urls = read_sitemap_urls()
        print(f"[INFO] 从 sitemap 读取 {len(urls)} 条 URL")

    for u in urls:
        print(f"  - {u}")
    push_to_baidu(urls, TOKEN)


if __name__ == "__main__":
    main()
