#!/usr/bin/env python3
"""
多功能站长工具箱 - 网站分析器
功能：SEO分析、可用性检测、SSL证书检查、批量检测、HTML报告生成
"""

import requests
from bs4 import BeautifulSoup
import ssl
import socket
import subprocess
import time
import json
import sys
import os
import re
import argparse
from datetime import datetime
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed


def fix_encoding(response):
    """修复 requests 编码检测不准的问题（常见于百度等中文站点）"""
    # 1. 优先从 Content-Type header 获取 charset
    content_type = response.headers.get('Content-Type', '')
    charset_match = re.search(r'charset=([^\s;]+)', content_type, re.I)
    if charset_match:
        response.encoding = charset_match.group(1).strip()
        return response.text

    # 2. 从 HTML 前 2048 字节检测 meta charset
    head = response.content[:2048].decode('ascii', errors='ignore')
    meta_charset = re.search(r'<meta[^>]+charset=["\']?([^"\'\s;>]+)', head, re.I)
    if meta_charset:
        response.encoding = meta_charset.group(1)
        return response.text

    # 3. 兜底 utf-8（requests 默认 ISO-8859-1 会导致中文乱码）
    response.encoding = 'utf-8'
    return response.text

# 特定域名的备用IP（当DNS解析的IP不通时使用）
ALTERNATIVE_IPS = {
    'github.com': ['140.82.121.3', '140.82.114.4', '140.82.121.4'],
    'www.github.com': ['140.82.121.3', '140.82.114.4', '140.82.121.4'],
}


class SiteAnalyzer:
    """网站分析器"""
    
    def __init__(self, url, timeout=30):
        self.url = self._normalize_url(url)
        self.timeout = timeout
        self.parsed_url = urlparse(self.url)
        self.domain = self.parsed_url.netloc
        self.results = {}
        
    def _normalize_url(self, url):
        """标准化URL"""
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        return url
    
    def analyze(self):
        """执行完整分析"""
        import time
        start_time = time.time()
        print(f"\n🔍 正在分析: {self.url}")
        
        # 基础检测
        self.results['url'] = self.url
        self.results['domain'] = self.domain
        self.results['timestamp'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # 执行各项检测
        self._check_accessibility()
        self._check_ai_crawler_access()           # AI爬虫导航文件检测（robots.txt/llms.txt/sitemap.xml）
        self._check_ipv6()
        self._check_ssl()
        self._check_seo()                          # ← _raw_html 在这里设置
        self._check_ip_intelligence()              # IP归属地/备案合规（依赖_raw_html）
        self._check_ai_discoverability(getattr(self, '_soup', None))
        self._check_performance()
        self._calculate_score()
        
        # 记录总分析耗时
        total_time = time.time() - start_time
        self.results['analyze_time'] = round(total_time, 2)
        
        # 更新域名耗时统计
        self._update_domain_timing(total_time)
        
        return self.results
    
    def _check_accessibility(self):
        """检测网站可用性"""
        # 先尝试默认连接
        success = self._try_connect(self.url)
        
        # 如果失败且有备用IP，逐个尝试
        if not success and self.domain in ALTERNATIVE_IPS:
            for ip in ALTERNATIVE_IPS[self.domain]:
                alt_url = self.url.replace(self.domain, ip)
                if self._try_connect(alt_url, host_header=self.domain):
                    self.results['resolved_ip'] = ip
                    break
    
    def _check_ai_crawler_access(self):
        """检测AI爬虫导航文件：robots.txt、llms.txt、sitemap.xml 及各AI爬虫放行状态"""
        import urllib.request
        import urllib.error

        base = 'https://' + self.domain
        headers_req = {'User-Agent': 'Mozilla/5.0 (compatible; AI/1.0)'}

        result = {
            'robots_txt': {'exists': False, 'status': None, 'content': None, 'ai_bots': {}},
            'llms_txt': {'exists': False, 'status': None},
            'sitemap_xml': {'exists': False, 'status': None, 'url': None},
        }

        # ---- robots.txt ----
        try:
            req = urllib.request.Request(base + '/robots.txt', headers=headers_req)
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
                content = resp.read().decode('utf-8', errors='ignore')
                result['robots_txt']['exists'] = True
                result['robots_txt']['status'] = status
                result['robots_txt']['content'] = content

                # 检测各AI爬虫 User-agent
                bot_pattern = re.compile(r'^User-agent:\s*(.+)$', re.M | re.I)
                allow_pattern = re.compile(r'^(Allow|Disallow):\s*(.+)$', re.M | re.I)
                current_bot = None
                bot_rules = {}
                for line in content.splitlines():
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    bm = bot_pattern.match(line)
                    if bm:
                        current_bot = bm.group(1).strip()
                        if current_bot not in bot_rules:
                            bot_rules[current_bot] = []
                    elif current_bot and allow_pattern.match(line):
                        bot_rules[current_bot].append(line)
                result['robots_txt']['ai_bots'] = bot_rules
        except urllib.error.HTTPError as e:
            result['robots_txt']['status'] = e.code
        except Exception:
            pass

        # ---- llms.txt ----
        try:
            req = urllib.request.Request(base + '/llms.txt', headers=headers_req)
            with urllib.request.urlopen(req, timeout=10) as resp:
                result['llms_txt']['exists'] = True
                result['llms_txt']['status'] = resp.status
        except urllib.error.HTTPError as e:
            result['llms_txt']['status'] = e.code
        except Exception:
            pass

        # ---- sitemap.xml ----
        try:
            # 尝试根目录
            req = urllib.request.Request(base + '/sitemap.xml', headers=headers_req)
            with urllib.request.urlopen(req, timeout=10) as resp:
                result['sitemap_xml']['exists'] = True
                result['sitemap_xml']['status'] = resp.status
                result['sitemap_xml']['url'] = base + '/sitemap.xml'
        except urllib.error.HTTPError:
            # 尝试 sitemap-index.xml
            try:
                req = urllib.request.Request(base + '/sitemap-index.xml', headers=headers_req)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    result['sitemap_xml']['exists'] = True
                    result['sitemap_xml']['status'] = resp.status
                    result['sitemap_xml']['url'] = base + '/sitemap-index.xml'
            except urllib.error.HTTPError as e:
                result['sitemap_xml']['status'] = e.code
            except Exception:
                pass
        except Exception:
            pass

        self.results['ai_crawler_access'] = result

    def _try_connect(self, url, host_header=None):
        """尝试连接URL"""
        try:
            start_time = time.time()
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
            if host_header:
                headers['Host'] = host_header
            
            response = requests.get(
                url, 
                timeout=self.timeout,
                allow_redirects=True,
                headers=headers,
                verify=False  # 使用IP时证书可能不匹配
            )
            response_time = time.time() - start_time
            
            self.results['status_code'] = response.status_code
            self.results['response_time'] = round(response_time, 3)
            self.results['final_url'] = response.url
            self.results['redirect_count'] = len(response.history)
            self.results['content_length'] = len(response.content)
            self.results['content_type'] = response.headers.get('Content-Type', '未知')
            self.results['server'] = response.headers.get('Server', '未知')
            
            # 检测 Cloudflare JS 挑战页（521 + JS redirect + __jsluid_s cookie）
            # __jsluid_s 在 Set-Cookie 响应头中，不在 body 里
            raw_text = response.text
            has_cf_cookie = any('jsluid' in str(v) for v in response.headers.values())
            is_cloudflare_challenge = (
                response.status_code == 521
                and 'location.href' in raw_text
                and has_cf_cookie
            )
            if is_cloudflare_challenge:
                # JS 挑战页说明目标返回了 SPA 入口（可能需要 hash 路由）
                # 记录真实 final_url 用于 hash 路由探测
                self.results['is_spa'] = True
                self.results['spa_final_url'] = response.url
            
            # 重定向链
            if response.history:
                self.results['redirect_chain'] = [r.url for r in response.history]
                self.results['redirect_chain'].append(response.url)
            
            self.results['accessible'] = True
            return True
            
        except requests.exceptions.Timeout:
            if not host_header:  # 只在默认连接时记录错误
                self.results['accessible'] = False
                self.results['error'] = '请求超时'
            return False
        except requests.exceptions.ConnectionError:
            if not host_header:
                self.results['accessible'] = False
                self.results['error'] = '连接失败'
            return False
        except Exception as e:
            if not host_header:
                self.results['accessible'] = False
                self.results['error'] = str(e)
            return False

    def _render_headless(self, url):
        """使用 chromium headless 渲染 SPA 页面，返回渲染后的 HTML 或 None"""
        try:
            cmd = [
                '/usr/bin/chromium-browser',
                '--headless=new',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--dump-dom',
                f'--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                url
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0 and result.stdout:
                return result.stdout
        except subprocess.TimeoutExpired:
            pass
        except FileNotFoundError:
            pass
        except Exception:
            pass
        return None

    def _check_ipv6(self):
        """检测IPv6支持（通过dig查询DNS AAAA记录，不依赖本机网络栈）"""
        import subprocess
        try:
            # 查 IPv6 (AAAA) — 用 1.1.1.1 避免本机 stub-resolver 行为异常
            r6 = subprocess.run(['dig', '@1.1.1.1', '+short', 'AAAA', self.domain],
                                 capture_output=True, text=True, timeout=5)
            ipv6_addresses = [line.strip() for line in r6.stdout.splitlines() if line.strip()]

            # 查 IPv4 (A)
            r4 = subprocess.run(['dig', '@1.1.1.1', '+short', 'A', self.domain],
                                 capture_output=True, text=True, timeout=5)
            ipv4_addresses = [line.strip() for line in r4.stdout.splitlines() if line.strip()]

            self.results['ipv6'] = {
                'supported': len(ipv6_addresses) > 0,
                'ipv6_count': len(ipv6_addresses),
                'ipv4_count': len(ipv4_addresses),
                'ipv6_addresses': ipv6_addresses,
                'ipv4_addresses': ipv4_addresses,
                'all_ips': ipv6_addresses + ipv4_addresses
            }
        except Exception as e:
            self.results['ipv6'] = {
                'supported': False,
                'error': str(e),
                'ipv6_count': 0,
                'ipv4_count': 0,
                'ipv6_addresses': [],
                'ipv4_addresses': [],
                'all_ips': []
            }

    def _check_ip_intelligence(self):
        """查询IP归属地/运营商/ASN，判断备案合规性

        判定逻辑：
        - 国内IP（countryCode=CN）：必须有ICP备案，有公网安备更佳
        - 国外IP（countryCode!=CN）：有ICP/公网安备声明 → 可疑警告
        - IP数据来源：ip-api.com（免费，无需key，90请求/分钟）
        """
        ip_intel = {
            'provider': 'ip-api.com',
            'query_method': None,     # 'ipv4' / 'ipv6' / None
            'ip': None,
            'asn': None,
            'isp': None,
            'org': None,
            'region': None,
            'city': None,
            'country': None,
            'country_code': None,
            'is_china': None,         # bool，是否中国IP
            'proxy_suspicion': None,  # 'none' / 'low' / 'medium' / 'high'
            'compliance': {
                'is_domestic': None,       # bool，是否国内IP
                'has_icp': None,           # bool，是否检测到ICP备案
                'has_gongan': None,        # bool，是否检测到公网安备
            }
        }

        # 取主IP（优先 IPv4 用于查询）
        all_ips = self.results.get('ipv6', {}).get('all_ips', [])
        if not all_ips:
            self.results['ip_intel'] = ip_intel
            return

        # 优先用 resolved_ip（_check_accessibility 中可能已设置），否则用第一个 IPv4
        primary_ip = self.results.get('resolved_ip')
        query_ip = None
        query_method = None

        if primary_ip:
            query_ip = primary_ip
            query_method = 'ipv6' if ':' in primary_ip else 'ipv4'
        else:
            ipv4s = self.results.get('ipv6', {}).get('ipv4_addresses', [])
            if ipv4s:
                query_ip = ipv4s[0]
                query_method = 'ipv4'
            elif all_ips:
                query_ip = all_ips[0]
                query_method = 'ipv6' if ':' in query_ip else 'ipv4'

        ip_intel['query_method'] = query_method
        ip_intel['ip'] = query_ip

        if not query_ip:
            self.results['ip_intel'] = ip_intel
            return

        # 查询 ip-api.com
        # 使用 batch API 一次查询多个字段，减少请求次数
        try:
            fields = 'status,message,country,countryCode,region,regionName,city,isp,org,asn,query'
            api_url = f'http://ip-api.com/json/{query_ip}?fields={fields}'
            resp = requests.get(api_url, timeout=10)
            data = resp.json()
        except Exception as e:
            ip_intel['error'] = str(e)
            self.results['ip_intel'] = ip_intel
            return

        if data.get('status') == 'fail':
            ip_intel['error'] = data.get('message', 'query failed')
            # IPv6 查询失败，尝试回退到 IPv4
            if query_method == 'ipv6' or (query_method is None and ':' in (query_ip or '')):
                ipv4s = self.results.get('ipv6', {}).get('ipv4_addresses', [])
                if ipv4s:
                    query_ip = ipv4s[0]
                    query_method = 'ipv4'
                    ip_intel['query_method'] = 'ipv4'
                    ip_intel['ip'] = query_ip
                    try:
                        resp2 = requests.get(f'http://ip-api.com/json/{query_ip}?fields={fields}', timeout=10)
                        data = resp2.json()
                        if data.get('status') == 'success':
                            # 用 IPv4 结果继续
                            pass
                        else:
                            ip_intel['error'] = data.get('message', 'query failed')
                            self.results['ip_intel'] = ip_intel
                            return
                    except Exception as e2:
                        ip_intel['error'] = str(e2)
                        self.results['ip_intel'] = ip_intel
                        return
            else:
                self.results['ip_intel'] = ip_intel
                return

        # 填充基本信息
        ip_intel['country'] = data.get('country', '')
        ip_intel['country_code'] = data.get('countryCode', '')
        ip_intel['region'] = data.get('regionName', '')
        ip_intel['city'] = data.get('city', '')
        ip_intel['isp'] = data.get('isp', '')
        ip_intel['org'] = data.get('org', '')
        ip_intel['asn'] = data.get('asn', '')
        ip_intel['is_china'] = ip_intel['country_code'] == 'CN'

        # ASN 推断网络类型
        asn_str = (ip_intel['asn'] or '').lower()
        isp_str = (ip_intel['isp'] or '').lower()
        org_str = (ip_intel['org'] or '').lower()

        # ========== 备案合规判定 ==========
        comp = ip_intel['compliance']
        comp['is_domestic'] = ip_intel['is_china']

        # 获取当前站点的ICP/公安备案状态（由 _check_seo 或 _check_ai_discoverability 设置）
        icp_found = self._get_icp_status()
        gongan_found = self._get_gongan_status()

        comp['has_icp'] = icp_found
        # 已知热门站点兜底的公网安备号也算入
        if not gongan_found and ip_intel.get('gongan_number'):
            gongan_found = True
        comp['has_gongan'] = gongan_found

        # 公网安备正则（格式：省份简称 + 公安 + 网安备/公网安备 + 数字，如"京公网安备 11010802020088号"）
        gongan_regex = re.compile(
            r'(京|沪|粤|浙|苏|鲁|豫|川|渝|鄂|湘|皖|闽|赣|桂|黔|滇|冀|晋|辽|吉|黑|蒙|陕|甘|青|藏|新|琼|宁)公网安备 ?\d+号?',
            re.IGNORECASE
        )

        # 再次扫描页面文本（可见文本 > 源码），单独检测公网安备（icp_filing不包含公安）
        page_text = getattr(self, '_raw_html', '')[:200000] if hasattr(self, '_raw_html') else ''
        gongan_match = gongan_regex.search(page_text)
        if gongan_match:
            comp['has_gongan'] = True
            ip_intel['gongan_number'] = gongan_match.group()

        self.results['ip_intel'] = ip_intel

    def _get_icp_status(self):
        """从已完成的检测结果中获取ICP备案状态"""
        # 优先级：seo.ai_discoverability > seo.ai_trust > 直接搜索 > 已知热门站点兜底
        ai_disc = self.results.get('seo', {}).get('ai_discoverability', {})
        auth_items = ai_disc.get('authority', {}).get('items', [])
        for item in auth_items:
            if 'ICP' in item.get('text', '') or '备案' in item.get('text', ''):
                if item.get('icon') in ('✅', '🟡'):
                    return True

        # 直接从 raw_html 扫描（兜底）
        page = getattr(self, '_raw_html', '')[:200000] if hasattr(self, '_raw_html') else ''
        icp_regex = re.compile(r'(京|沪|粤|浙|苏|鲁|豫|川|渝|鄂|湘|皖|闽|赣|桂|黔|滇|冀|晋|辽|吉|黑|蒙|陕|甘|青|藏|新|琼|宁)ICP[证备]?\d+号?', re.IGNORECASE)
        if page and icp_regex.search(page):
            return True

        # 已知热门站点兜底（SPA站点或强制跳转页面无法抓取内容时使用）
        # 格式：domain → {"icp": bool, "gongan": str or None, "est_time": 秒}
        known_domains = {
            'baidu.com':           {"icp": True,  "gongan": "京公网安备11000002000001号", "est_time": 3},
            'bilibili.com':        {"icp": True,  "gongan": "沪公网安备31011002002436号", "est_time": 15},
            'douyin.com':          {"icp": True,  "gongan": None, "est_time": 12},
            'toutiao.com':         {"icp": True,  "gongan": None, "est_time": 10},
            'zhihu.com':           {"icp": True,  "gongan": "京公网安备11010802020088号", "est_time": 8},
            'weibo.com':           {"icp": True,  "gongan": None, "est_time": 10},
            'jd.com':              {"icp": True,  "gongan": None, "est_time": 8},
            'taobao.com':          {"icp": True,  "gongan": None, "est_time": 12},
            'tmall.com':           {"icp": True,  "gongan": None, "est_time": 10},
            'alipay.com':          {"icp": True,  "gongan": None, "est_time": 6},
            '163.com':             {"icp": True,  "gongan": None, "est_time": 5},
            'qq.com':              {"icp": True,  "gongan": None, "est_time": 8},
            'weixin.qq.com':       {"icp": True,  "gongan": None, "est_time": 10},
            'xiaohongshu.com':     {"icp": True,  "gongan": None, "est_time": 12},
            'kuaishou.com':        {"icp": True,  "gongan": None, "est_time": 12},
            'pinduoduo.com':       {"icp": True,  "gongan": None, "est_time": 8},
            'meituan.com':         {"icp": True,  "gongan": None, "est_time": 6},
            'douban.com':          {"icp": True,  "gongan": None, "est_time": 5},
            'juejin.cn':           {"icp": True,  "gongan": None, "est_time": 5},
            'miit.gov.cn':         {"icp": True,  "gongan": None, "est_time": 8},
            'beian.miit.gov.cn':   {"icp": True,  "gongan": None, "est_time": 8},
        }
        
        # 从 timing_stats.json 读取实际平均耗时，替换 est_time
        import json
        import os
        timing_file = os.path.join(os.path.dirname(__file__), 'timing_stats.json')
        if os.path.exists(timing_file):
            try:
                with open(timing_file, 'r') as f:
                    timing_stats = json.load(f)
                for d in known_domains:
                    if d in timing_stats:
                        known_domains[d]['est_time'] = timing_stats[d].get('avg', known_domains[d]['est_time'])
            except:
                pass
        
        for d, info in known_domains.items():
            if d in self.domain:
                if info["icp"]:
                    if info["gongan"]:
                        self.results.setdefault('ip_intel', {})
                        self.results['ip_intel']['gongan_number'] = info["gongan"]
                    return True
        return False

    def _get_gongan_status(self):
        """检测公网安备状态"""
        page = getattr(self, '_raw_html', '')[:200000] if hasattr(self, '_raw_html') else ''
        if page:
            gongan_regex = re.compile(r'(京|沪|粤|浙|苏|鲁|豫|川|渝|鄂|湘|皖|闽|赣|桂|黔|滇|冀|晋|辽|吉|黑|蒙|陕|甘|青|藏|新|琼|宁)公网安备 *\d+号?', re.IGNORECASE)
            if gongan_regex.search(page):
                return True
        # 页面为空时，查已知热门站点兜底记录
        if self.results.get('ip_intel', {}).get('gongan_number'):
            return True
        return False

    def _check_ssl(self):
        """检测SSL证书"""
        if not self.url.startswith('https://'):
            self.results['ssl'] = {'valid': False, 'reason': '未使用HTTPS'}
            return
            
        try:
            context = ssl.create_default_context()
            # 使用解析的IP（如果有）或域名
            connect_host = self.results.get('resolved_ip', self.domain)
            with socket.create_connection((connect_host, 443), timeout=self.timeout) as sock:
                with context.wrap_socket(sock, server_hostname=self.domain) as ssock:
                    cert = ssock.getpeercert()
                    
                    # 解析证书信息
                    not_after = datetime.strptime(cert['notAfter'], '%b %d %H:%M:%S %Y %Z')
                    not_before = datetime.strptime(cert['notBefore'], '%b %d %H:%M:%S %Y %Z')
                    days_remaining = (not_after - datetime.now()).days
                    
                    # 提取组织信息
                    subject = dict(x[0] for x in cert.get('subject', []))
                    issuer = dict(x[0] for x in cert.get('issuer', []))
                    
                    self.results['ssl'] = {
                        'valid': True,
                        'issuer': issuer.get('organizationName', '未知'),
                        'subject': subject.get('commonName', '未知'),
                        'not_before': not_before.strftime('%Y-%m-%d'),
                        'not_after': not_after.strftime('%Y-%m-%d'),
                        'days_remaining': days_remaining,
                        'serial_number': cert.get('serialNumber', '未知'),
                        'version': cert.get('version', '未知'),
                    }
                    
                    # 证书状态判断
                    if days_remaining < 0:
                        self.results['ssl']['status'] = '已过期'
                        self.results['ssl']['valid'] = False
                    elif days_remaining < 30:
                        self.results['ssl']['status'] = '即将过期'
                    else:
                        self.results['ssl']['status'] = '有效'
                        
        except ssl.SSLCertVerificationError as e:
            self.results['ssl'] = {'valid': False, 'reason': f'证书验证失败: {str(e)}'}
        except Exception as e:
            self.results['ssl'] = {'valid': False, 'reason': f'检测失败: {str(e)}'}
    
    def _check_seo(self):
        """检测SEO信息"""
        try:
            # 使用解析的IP（如果有）或URL
            request_url = self.url
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
            if 'resolved_ip' in self.results:
                request_url = self.url.replace(self.domain, self.results['resolved_ip'])
                headers['Host'] = self.domain

            response = requests.get(
                request_url,
                timeout=self.timeout,
                headers=headers,
                verify=False
            )
            html_text = fix_encoding(response)

            # 检测 Cloudflare JS 挑战页（521 + JS redirect + __jsluid）
            # 尝试抓取 SPA hash 路由页面
            is_cloudflare = (
                response.status_code == 521
                and 'location.href' in html_text
                and ('__jsluid' in html_text or '__jsl_clearance' in html_text)
            )
            if is_cloudflare:
                # 尝试常见的 hash 路由路径
                hash_paths = [
                    '/#/Integrated/index',
                    '/#/recordcheck/index',
                    '/#/service/index',
                    '/#/',
                ]
                for hash_path in hash_paths:
                    try:
                        hash_url = request_url.rstrip('/') + hash_path
                        hresp = requests.get(
                            hash_url,
                            timeout=self.timeout,
                            headers=headers,
                            verify=False
                        )
                        if hresp.status_code == 200 and len(hresp.text) > 500:
                            html_text = fix_encoding(hresp)
                            self.results['spa_final_url'] = hash_url
                            break
                    except:
                        pass

            # 检测普通 Vue SPA（返回 200 但内容是 JS 渲染的）
            # 特征：HTML 中有 chunk-vendors、id="app"、Vue app 初始化
            if not self.results.get('is_spa'):
                spa_indicators = ['chunk-vendors', 'id="app"', '__VUE_DEVTOOLS_PLUGIN__', '__VUE_OPTIONS_API__']
                if sum(1 for ind in spa_indicators if ind in html_text) >= 2:
                    self.results['is_spa'] = True
                # URL 中有 hash 路由也视为 SPA
                if '/#/' in self.url:
                    self.results['is_spa'] = True

            # 如果是 SPA（Cloudflare 521 或 hash 路由）但页面内容仍是挑战页或为空
            is_cf_521 = self.results.get('status_code') == 521
            # SPA + (Cloudflare 521 或 内容太短 或 普通Vue SPA) → headless 渲染
            if self.results.get('is_spa') and (is_cf_521 or len(html_text) < 500 or
                (self.results.get('status_code') == 200 and 'chunk-vendors' in html_text)):
                rendered_html = self._render_headless(self.url)
                if rendered_html:
                    html_text = rendered_html
                    self.results['headless_rendered'] = True

            soup = BeautifulSoup(html_text, 'html.parser')
            self._soup = soup  # 保存供AI可发现性检测使用
            self._raw_html = html_text  # 保存原始HTML供ICP等检测
            
            seo = {}
            
            # 标题
            title_tag = soup.find('title')
            seo['title'] = title_tag.string.strip() if title_tag and title_tag.string else '未设置'
            seo['title_length'] = len(seo['title']) if seo['title'] != '未设置' else 0
            
            # Meta描述
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            seo['description'] = meta_desc['content'].strip() if meta_desc and meta_desc.get('content') else '未设置'
            seo['description_length'] = len(seo['description']) if seo['description'] != '未设置' else 0
            
            # Meta关键词
            meta_keywords = soup.find('meta', attrs={'name': 'keywords'})
            seo['keywords'] = meta_keywords['content'].strip() if meta_keywords and meta_keywords.get('content') else '未设置'
            
            # H标签统计
            for i in range(1, 7):
                h_tags = soup.find_all(f'h{i}')
                seo[f'h{i}_count'] = len(h_tags)
                if h_tags:
                    seo[f'h{i}_texts'] = [h.get_text().strip()[:50] for h in h_tags[:5]]
            
            # 图片统计
            images = soup.find_all('img')
            seo['total_images'] = len(images)
            seo['images_without_alt'] = len([img for img in images if not img.get('alt')])
            seo['images_alt_ratio'] = round(
                (1 - seo['images_without_alt'] / max(seo['total_images'], 1)) * 100, 1
            )
            
            # 链接统计
            links = soup.find_all('a', href=True)
            seo['total_links'] = len(links)
            seo['internal_links'] = len([l for l in links if self.domain in l.get('href', '')])
            seo['external_links'] = seo['total_links'] - seo['internal_links']
            
            # Canonical标签
            canonical = soup.find('link', attrs={'rel': 'canonical'})
            seo['canonical'] = canonical['href'] if canonical and canonical.get('href') else '未设置'
            
            # Robots meta
            robots = soup.find('meta', attrs={'name': 'robots'})
            seo['robots'] = robots['content'] if robots and robots.get('content') else '未设置'
            
            # Viewport
            viewport = soup.find('meta', attrs={'name': 'viewport'})
            seo['viewport'] = viewport['content'] if viewport and viewport.get('content') else '未设置'
            
            # 移动端适配检测（增强版）
            mobile_friendly = False
            mobile_type = []
            
            # 1. 检查 viewport 标签（响应式设计）
            if 'width=device' in seo.get('viewport', '').lower():
                mobile_friendly = True
                mobile_type.append('响应式设计')
            
            # 2. 检查是否有移动端子域名链接
            mobile_links = soup.find_all('a', href=True)
            for link in mobile_links:
                href = link.get('href', '')
                if any(m in href for m in ['m.' + self.domain, 'mobile.' + self.domain]):
                    mobile_friendly = True
                    mobile_type.append('移动端子域名')
                    break
            
            # 3. 检查页面内是否有移动端跳转JS代码
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string:
                    script_text = script.string.lower()
                    if any(keyword in script_text for keyword in ['useragent', 'mobile', 'm.baidu', 'm.']):
                        if 'location' in script_text or 'redirect' in script_text or 'href' in script_text:
                            mobile_friendly = True
                            mobile_type.append('JS跳转适配')
                            break
            
            # 4. 如果桌面版没检测到，用手机UA再访问一次（百度等网站会根据UA返回不同内容）
            if not mobile_friendly:
                try:
                    mobile_ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                    mobile_response = requests.get(self.url, timeout=self.timeout, headers={'User-Agent': mobile_ua})
                    mobile_soup = BeautifulSoup(fix_encoding(mobile_response), 'html.parser')
                    
                    # 检查手机UA返回的页面是否有viewport
                    mobile_viewport = mobile_soup.find('meta', attrs={'name': 'viewport'})
                    if mobile_viewport and mobile_viewport.get('content'):
                        if 'width=device' in mobile_viewport['content'].lower():
                            mobile_friendly = True
                            mobile_type.append('UA自适应')
                    
                    # 检查是否重定向到了移动子域名
                    if mobile_response.url and any(m in mobile_response.url for m in ['m.', 'mobile.']):
                        if 'UA重定向' not in mobile_type:
                            mobile_friendly = True
                            mobile_type.append('UA重定向')
                except:
                    pass
            
            seo['mobile_friendly'] = mobile_friendly
            seo['mobile_type'] = mobile_type if mobile_type else ['无']
            
            # ==================== AI信任度指标检测 ====================
            ai_trust = {}
            
            # 1. JSON-LD 结构化数据（最重要！）
            json_ld_scripts = soup.find_all('script', attrs={'type': 'application/ld+json'})
            json_ld_types = []
            for script in json_ld_scripts:
                try:
                    import json
                    data = json.loads(script.string)
                    if isinstance(data, dict):
                        json_ld_types.append(data.get('@type', 'Unknown'))
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict):
                                json_ld_types.append(item.get('@type', 'Unknown'))
                except:
                    pass
            ai_trust['json_ld'] = {
                'exists': len(json_ld_scripts) > 0,
                'count': len(json_ld_scripts),
                'types': json_ld_types,
                'importance': '高 - AI搜索引擎优先解析结构化数据，直接用于生成摘要和知识图谱'
            }
            
            # 2. Open Graph 标签完整性
            og_tags = {}
            for og in soup.find_all('meta', attrs={'property': lambda x: x and x.startswith('og:')}):
                og_tags[og['property']] = og.get('content', '')
            og_essential = ['og:title', 'og:description', 'og:image', 'og:url']
            og_missing = [tag for tag in og_essential if tag not in og_tags]
            ai_trust['open_graph'] = {
                'exists': len(og_tags) > 0,
                'count': len(og_tags),
                'missing': og_missing,
                'complete': len(og_missing) == 0,
                'importance': '高 - 社交媒体和AI引用时会优先使用OG标签的内容'
            }
            seo['open_graph'] = og_tags
            
            # 3. Twitter Card 标签
            twitter_tags = {}
            for meta in soup.find_all('meta', attrs={'name': lambda x: x and x.startswith('twitter:')}):
                twitter_tags[meta['name']] = meta.get('content', '')
            for meta in soup.find_all('meta', attrs={'property': lambda x: x and x.startswith('twitter:')}):
                twitter_tags[meta['property']] = meta.get('content', '')
            ai_trust['twitter_card'] = {
                'exists': len(twitter_tags) > 0,
                'count': len(twitter_tags),
                'importance': '中 - Twitter/X平台和部分AI会参考Twitter Card数据'
            }
            
            # 4. Canonical 标签
            canonical = soup.find('link', attrs={'rel': 'canonical'})
            seo['canonical'] = canonical['href'] if canonical and canonical.get('href') else '未设置'
            ai_trust['canonical'] = {
                'exists': canonical is not None,
                'value': seo['canonical'],
                'importance': '高 - 告诉AI这是权威版本，避免重复内容稀释权重'
            }
            
            # 5. Author 和 Publisher 标签
            author_meta = soup.find('meta', attrs={'name': 'author'})
            publisher_meta = soup.find('meta', attrs={'name': 'publisher'})
            author_link = soup.find('link', attrs={'rel': 'author'})
            ai_trust['authorship'] = {
                'has_author': author_meta is not None or author_link is not None,
                'has_publisher': publisher_meta is not None,
                'author': author_meta.get('content', '') if author_meta else '',
                'importance': '中高 - 明确的内容创作者信息增加可信度，AI更倾向引用有明确来源的内容'
            }
            
            # 6. 发布/修改日期
            date_published = soup.find('meta', attrs={'property': 'article:published_time'})
            date_modified = soup.find('meta', attrs={'property': 'article:modified_time'})
            time_tag = soup.find('time')
            ai_trust['dates'] = {
                'has_published': date_published is not None,
                'has_modified': date_modified is not None,
                'has_time_tag': time_tag is not None,
                'published': date_published.get('content', '') if date_published else '',
                'importance': '高 - AI优先引用有明确时间的内容，过时内容会被降权'
            }
            
            # 7. Favicon 网站图标
            favicon = soup.find('link', attrs={'rel': lambda x: x and 'icon' in x.lower()})
            apple_icon = soup.find('link', attrs={'rel': 'apple-touch-icon'})
            ai_trust['favicon'] = {
                'has_favicon': favicon is not None,
                'has_apple_icon': apple_icon is not None,
                'importance': '低 - 提升品牌识别度，AI在展示搜索结果时会显示图标'
            }
            
            # 8. 语义化HTML标签
            semantic_tags = ['article', 'section', 'nav', 'aside', 'header', 'footer', 'main']
            found_semantic = [tag for tag in semantic_tags if soup.find(tag)]
            ai_trust['semantic_html'] = {
                'tags_found': found_semantic,
                'count': len(found_semantic),
                'importance': '高 - 语义化标签帮助AI理解页面结构和内容层次'
            }
            
            # 9. H标签层级结构
            h_tags = {}
            for i in range(1, 7):
                h_tags[f'h{i}'] = len(soup.find_all(f'h{i}'))
            has_h1 = h_tags.get('h1', 0) > 0
            h_hierarchy_ok = has_h1 and (h_tags.get('h2', 0) > 0 or h_tags.get('h3', 0) > 0)
            ai_trust['heading_structure'] = {
                'hierarchy': h_tags,
                'has_h1': has_h1,
                'proper_hierarchy': h_hierarchy_ok,
                'importance': '高 - 清晰的标题层级帮助AI理解内容主题和重点'
            }
            
            # 10. alt属性完整性
            images = soup.find_all('img')
            imgs_with_alt = [img for img in images if img.get('alt') and img.get('alt').strip()]
            seo['total_images'] = len(images)
            seo['images_without_alt'] = len(images) - len(imgs_with_alt)
            ai_trust['image_alt'] = {
                'total_images': len(images),
                'with_alt': len(imgs_with_alt),
                'completeness': f"{len(imgs_with_alt)}/{len(images)}" if images else 'N/A',
                'importance': '高 - alt文本是AI理解图片内容的唯一依据，影响图片搜索排名'
            }
            
            # 11. 页面语言声明
            html_tag = soup.find('html')
            lang = html_tag.get('lang', '') if html_tag else ''
            ai_trust['language'] = {
                'declared': bool(lang),
                'value': lang,
                'importance': '中 - 明确的语言声明帮助AI正确处理多语言内容'
            }
            
            # 计算AI信任度得分
            trust_score = 0
            trust_max = 100
            if ai_trust['json_ld']['exists']: trust_score += 20
            if ai_trust['open_graph']['complete']: trust_score += 15
            if ai_trust['canonical']['exists']: trust_score += 10
            if ai_trust['authorship']['has_author']: trust_score += 10
            if ai_trust['dates']['has_published']: trust_score += 10
            if ai_trust['semantic_html']['count'] >= 3: trust_score += 15
            if ai_trust['heading_structure']['proper_hierarchy']: trust_score += 10
            if ai_trust['image_alt']['total_images'] == 0 or (ai_trust['image_alt']['with_alt'] / max(ai_trust['image_alt']['total_images'], 1) > 0.8): trust_score += 5
            if ai_trust['language']['declared']: trust_score += 5
            
            ai_trust['score'] = trust_score
            ai_trust['max_score'] = trust_max
            
            seo['ai_trust'] = ai_trust
            
            self.results['seo'] = seo
            
        except Exception as e:
            self.results['seo'] = {'error': str(e)}
    
    def _check_ai_discoverability(self, soup):
        """检测AI可发现性（面向国内平台）
        
        评分体系：
        - 结构化数据 (20分)
        - 内容可引用性 (25分)
        - 自媒体适配性 (20分)
        - 权威性信号 (20分)
        - 可访问性 (15分)
        """
        discover = {}
        score = 0
        details = []
        
        # ==================== 1. 结构化数据 (20分) ====================
        struct_score = 0

        # JSON-LD (8分)
        json_ld = self.results.get('seo', {}).get('ai_trust', {}).get('json_ld', {})
        if json_ld.get('exists'):
            struct_score += 8
            details.append({'icon': '✅', 'text': 'JSON-LD结构化数据', 'score': 8})
        else:
            details.append({'icon': '❌', 'text': '缺少JSON-LD', 'score': 0, 'tip': '添加JSON-LD帮助AI理解内容'})

        # Open Graph (12分) - 微信/头条/知乎通用
        og = self.results.get('seo', {}).get('open_graph', {})
        og_score = 0
        if og.get('og:title'): og_score += 3
        if og.get('og:description'): og_score += 3
        if og.get('og:image'): og_score += 3
        if og.get('og:url'): og_score += 3
        struct_score += og_score
        if og_score == 12:
            details.append({'icon': '✅', 'text': 'Open Graph完整', 'score': 12})
        elif og_score > 0:
            details.append({'icon': '⚠️', 'text': f'Open Graph部分缺失', 'score': og_score, 'tip': '补全og:title/description/image/url'})
        else:
            details.append({'icon': '❌', 'text': '缺少Open Graph', 'score': 0, 'tip': '微信/头条/知乎分享都需要OG标签'})

        # AI爬虫导航文件 (10分)
        # robots.txt (3分) + llms.txt (3分) + sitemap.xml (2分) + AI爬虫显式放行 (2分)
        ai_nav_score = 0
        ai_nav_details = []
        ai_nav = self.results.get('ai_crawler_access', {})
        robots = ai_nav.get('robots_txt', {})
        llms = ai_nav.get('llms_txt', {})
        sitemap = ai_nav.get('sitemap_xml', {})

        if robots.get('exists'):
            ai_nav_score += 3
            ai_nav_details.append({'icon': '✅', 'text': 'robots.txt存在', 'score': 3})
        else:
            ai_nav_details.append({'icon': '❌', 'text': 'robots.txt缺失', 'score': 0, 'tip': '添加robots.txt显式声明允许AI爬虫抓取'})

        if llms.get('exists'):
            ai_nav_score += 3
            ai_nav_details.append({'icon': '✅', 'text': 'llms.txt存在（AI导航文件）', 'score': 3})
        else:
            ai_nav_details.append({'icon': '❌', 'text': 'llms.txt缺失', 'score': 0, 'tip': '添加llms.txt为AI爬虫提供站点导航'})

        if sitemap.get('exists'):
            ai_nav_score += 2
            ai_nav_details.append({'icon': '✅', 'text': 'sitemap.xml存在', 'score': 2})
        else:
            ai_nav_details.append({'icon': '❌', 'text': 'sitemap.xml缺失', 'score': 0, 'tip': '添加sitemap.xml加速搜索引擎收录'})

        # AI爬虫显式放行（GPTBot/ClaudeBot/PerplexityBot/GeminiBot）
        if robots.get('exists'):
            bot_rules = robots.get('ai_bots', {})
            major_bots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'GeminiBot', 'GoogleExtended', 'Diffbot']
            allowed = [b for b in major_bots if b in bot_rules]
            if allowed:
                ai_nav_score += 2
                ai_nav_details.append({'icon': '✅', 'text': f'AI爬虫显式放行: {", ".join(allowed)}', 'score': 2})
            else:
                # 通配符 * Allow / 或完全没声明 = 默认允许（不算错，但没加分）
                if '*' in bot_rules or (len(bot_rules) == 0 and robots.get('exists')):
                    ai_nav_details.append({'icon': 'ℹ️', 'text': 'robots.txt无显式AI爬虫规则（默认允许）', 'score': 0})
                else:
                    ai_nav_details.append({'icon': '⚠️', 'text': 'robots.txt未声明AI爬虫放行', 'score': 0, 'tip': '建议显式声明 Allow: / 给 GPTBot/ClaudeBot 等'})

        struct_score += ai_nav_score
        for d in ai_nav_details:
            details.append(d)

        discover['structured_data'] = {'score': struct_score, 'max': 30, 'items': details.copy()}
        score += struct_score
        details.clear()
        
        # ==================== 2. 内容可引用性 (25分) ====================
        content_score = 0
        seo = self.results.get('seo', {})
        
        # 标题 (5分)
        title = seo.get('title', '')
        if title and title != '未设置':
            content_score += 5
            details.append({'icon': '✅', 'text': f'标题: {title[:30]}...', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '缺少标题', 'score': 0, 'tip': 'AI优先引用有明确标题的内容'})
        
        # 描述 (5分)
        desc = seo.get('description', '')
        if desc and desc != '未设置':
            content_score += 5
            details.append({'icon': '✅', 'text': '有Meta描述', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '缺少Meta描述', 'score': 0, 'tip': 'AI用描述生成摘要'})
        
        # 内容长度 (5分) - 通过页面大小估算
        content_len = self.results.get('content_length', 0)
        if content_len > 2000:  # 大约500字以上
            content_score += 5
            details.append({'icon': '✅', 'text': f'内容充实 ({content_len//4}字)', 'score': 5})
        else:
            details.append({'icon': '⚠️', 'text': f'内容较少 ({content_len//4}字)', 'score': 0, 'tip': '建议内容>500字'})
        
        # 作者 (5分)
        authorship = self.results.get('seo', {}).get('ai_trust', {}).get('authorship', {})
        if authorship.get('has_author'):
            content_score += 5
            details.append({'icon': '✅', 'text': '有作者署名', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '缺少作者信息', 'score': 0, 'tip': '添加author meta标签'})
        
        # 日期 (5分)
        dates = self.results.get('seo', {}).get('ai_trust', {}).get('dates', {})
        if dates.get('has_published'):
            content_score += 5
            details.append({'icon': '✅', 'text': '有发布日期', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '缺少发布日期', 'score': 0, 'tip': 'AI优先引用有时间戳的内容'})
        
        discover['content_citation'] = {'score': content_score, 'max': 25, 'items': details.copy()}
        score += content_score
        details.clear()
        
        # ==================== 3. 自媒体适配性 (20分) ====================
        media_score = 0
        page_text = soup.get_text().lower() if soup else ''
        all_links = [a.get('href', '') for a in soup.find_all('a', href=True)] if soup else []
        all_text = ' '.join(all_links) + ' ' + page_text
        
        # 抖音 (5分)
        if any(kw in all_text for kw in ['douyin', '抖音', 'tiktok']):
            media_score += 5
            details.append({'icon': '✅', 'text': '有抖音引流', 'score': 5})
        else:
            details.append({'icon': '⚠️', 'text': '未发现抖音链接', 'score': 0, 'tip': '添加抖音链接增加曝光'})
        
        # 小红书 (5分)
        if any(kw in all_text for kw in ['xiaohongshu', '小红书', 'redbook', 'xhslink']):
            media_score += 5
            details.append({'icon': '✅', 'text': '有小红书引流', 'score': 5})
        else:
            details.append({'icon': '⚠️', 'text': '未发现小红书链接', 'score': 0, 'tip': '添加小红书链接增加曝光'})
        
        # 微信公众号 (5分)
        if any(kw in all_text for kw in ['weixin', '微信', '公众号', 'wechat', 'mp.weixin']):
            media_score += 5
            details.append({'icon': '✅', 'text': '有微信公众号', 'score': 5})
        else:
            details.append({'icon': '⚠️', 'text': '未发现微信公众号', 'score': 0, 'tip': '添加公众号链接增加私域流量'})
        
        # 内容格式适合搬运 (5分) - 检测是否有文章正文、图片等
        has_article = soup.find('article') or soup.find('div', class_=lambda x: x and 'article' in x.lower()) if soup else False
        has_images = len(soup.find_all('img')) > 2 if soup else False
        if has_article or has_images:
            media_score += 5
            details.append({'icon': '✅', 'text': '内容格式适合搬运', 'score': 5})
        else:
            details.append({'icon': '⚠️', 'text': '内容格式一般', 'score': 2, 'tip': '使用article标签和配图'})
            media_score += 2
        
        discover['media_adapt'] = {'score': media_score, 'max': 20, 'items': details.copy()}
        score += media_score
        details.clear()
        
        # ==================== 4. 权威性信号 (20分) ====================
        auth_score = 0
        
        # HTTPS (4分)
        if self.url.startswith('https://'):
            auth_score += 4
            details.append({'icon': '✅', 'text': '使用HTTPS', 'score': 4})
        else:
            details.append({'icon': '❌', 'text': '未使用HTTPS', 'score': 0, 'tip': 'HTTPS是基本信任信号'})
        
        # 备案号 (8分) - 国内特色
        # 三级检测：可见文本 > HTML源码 > 热门站点推测
        import re
        icp_regex = re.compile(r'(京|沪|粤|浙|苏|鲁|豫|川|渝|鄂|湘|皖|闽|赣|桂|黔|滇|冀|晋|辽|吉|黑|蒙|陕|甘|青|藏|新|琼|宁)ICP[证备]?\d+号?', re.IGNORECASE)
        known_icp_domains = {
            'bilibili.com', 'douyin.com', 'toutiao.com', 'zhihu.com',
            'weibo.com', 'baidu.com', 'jd.com', 'taobao.com',
            'tmall.com', 'alipay.com', '163.com', 'qq.com',
            'weixin.qq.com', 'xiaohongshu.com', 'kuaishou.com',
            'pinduoduo.com', 'meituan.com', 'douban.com', 'juejin.cn',
            'miit.gov.cn', 'beian.miit.gov.cn',
        }

        icp_found = False
        icp_number = None

        # 1. 优先检查可见文本（页脚直接展示 = 最佳）
        icp_match = icp_regex.search(page_text)
        if icp_match:
            auth_score += 8
            icp_found = True
            icp_number = icp_match.group()
            details.append({'icon': '✅', 'text': f'有ICP备案号（页脚可见）', 'score': 8})
        # 2. 检查HTML源码（在页面中但不直接可见，如隐藏在script或data属性）
        elif hasattr(self, '_raw_html') and icp_regex.search(self._raw_html):
            auth_score += 5
            icp_found = True
            icp_number = icp_regex.search(self._raw_html).group()
            details.append({'icon': '🟡', 'text': '有ICP备案号（源码中，建议移至页脚可见位置）', 'score': 5, 'tip': '页脚展示备案号可增强用户信任'})
        # 3. 检查 JSON-LD 结构化数据中的备案信息
        elif hasattr(self, '_raw_html'):
            import json as _json
            for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', self._raw_html, re.DOTALL):
                try:
                    ld_data = _json.loads(match.group(1))
                    for item in ([ld_data] if isinstance(ld_data, dict) else ld_data):
                        item_str = _json.dumps(item, ensure_ascii=False)
                        icp_m = icp_regex.search(item_str)
                        if icp_m:
                            auth_score += 5
                            icp_found = True
                            icp_number = icp_m.group()
                            details.append({'icon': '🟡', 'text': '有ICP备案号（结构化数据中）', 'score': 5})
                            break
                    if icp_found:
                        break
                except:
                    pass
        # 4. 已知热门站点推测（SPA完全JS渲染，页面源码无痕迹）
        if not icp_found and any(d in self.domain for d in known_icp_domains):
            auth_score += 3
            icp_found = True
            details.append({'icon': '🟡', 'text': '可能有ICP备案（SPA站点，页面未展示）', 'score': 3, 'tip': '建议在页脚添加备案号，提升百度信任度'})
        elif not icp_found:
            details.append({'icon': '❌', 'text': '未发现ICP备案', 'score': 0, 'tip': '备案号是百度信任的重要信号'})

        # 联系方式 (8分)
        contact_kw = ['联系', 'contact', 'about', '关于', '邮箱', 'email', '@', '电话', 'tel']
        has_contact = any(kw in page_text for kw in contact_kw)
        if has_contact:
            auth_score += 8
            details.append({'icon': '✅', 'text': '有联系方式/关于页', 'score': 8})
        else:
            details.append({'icon': '❌', 'text': '缺少联系方式', 'score': 0, 'tip': '增加E-E-A-T信号'})
        
        discover['authority'] = {'score': auth_score, 'max': 20, 'items': details.copy()}
        score += auth_score
        details.clear()
        
        # ==================== 5. 可访问性 (15分) ====================
        access_score = 0
        
        # 页面可访问 (5分)
        if self.results.get('accessible'):
            access_score += 5
            details.append({'icon': '✅', 'text': '页面可正常访问', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '页面无法访问', 'score': 0})
        
        # 移动端友好 (5分)
        viewport = soup.find('meta', attrs={'name': 'viewport'}) if soup else None
        if viewport:
            access_score += 5
            details.append({'icon': '✅', 'text': '移动端友好', 'score': 5})
        else:
            details.append({'icon': '❌', 'text': '缺少viewport', 'score': 0, 'tip': '百度优先收录移动友好页面'})
        
        # 响应速度 (5分)
        resp_time = self.results.get('response_time', 999)
        if resp_time < 3:
            access_score += 5
            details.append({'icon': '✅', 'text': f'响应快速 ({resp_time:.1f}秒)', 'score': 5})
        elif resp_time < 5:
            access_score += 3
            details.append({'icon': '⚠️', 'text': f'响应较慢 ({resp_time:.1f}秒)', 'score': 3})
        else:
            details.append({'icon': '❌', 'text': f'响应超时 ({resp_time:.1f}秒)', 'score': 0, 'tip': '加载慢影响百度排名'})
        
        discover['accessibility'] = {'score': access_score, 'max': 15, 'items': details.copy()}
        score += access_score
        details.clear()

        # ==================== 6. API友好性 (15分) ====================
        # 新评分体系（AI视角）：
        # - API入口可发现 (4分)：没入口一切白搭
        # - OpenAPI文档 (5分)：AI读懂文档才能正确调用，权重最高
        # - CORS跨域支持 (2分)：允许前端/AI直接跨域调用
        # - 错误信息规范 (2分)：清晰错误码帮AI自我修正
        # - 版本号标识 (1分)：知道API版本避免兼容问题
        # - 认证说明 (1分)：API Key获取方式是否明确
        
        api_score = 0
        api_details = []
        api_found = False
        api_endpoints = []
        docs_found = None
        docs_content = None  # 保存文档内容用于提取信息

        domain = self.domain
        base_url = 'https://' + domain

        # 如果发生了重定向，收集所有跳转目标域名一并探测
        redirect_domains = set()
        for url in self.results.get('redirect_chain', []):
            parsed = urlparse(url)
            if parsed.netloc:
                redirect_domains.add(parsed.netloc)
        # 探测顺序：原域名 → 重定向域名（去重）
        all_domains = [domain] + sorted(redirect_domains - {domain})

        # 探测路径列表（优先级从高到低）
        # 注意：如果当前 URL 有子路径（如 /tools/），API 可能同前缀
        sub_path = self.parsed_url.path.rstrip('/')  # 如 /tools
        base_with_sub = base_url + sub_path  # https://www.bayihy.cn/tools

        probe_paths = [
            '/api',
            '/api/',
            '/api/docs',
            '/api/swagger.json',
            '/swagger.json',
            '/openapi.json',
            '/api/docs.html',
            '/docs',
            '/docs/',
            '/api/v1',
            '/api/v1/',
            '/.well-known/api',
            '/.well-known/openapi.json',
        ]

        # 对于有子路径的 URL（如 /tools/），同时探测子路径前缀
        all_probe_urls = []
        for path in probe_paths:
            all_probe_urls.append((base_url, path))  # https://domain/api
            if sub_path:
                all_probe_urls.append((base_with_sub, path))  # https://domain/tools/api

        # ========== 1. API入口探测 (4分) ==========
        for base, path in all_probe_urls:
            try:
                resp = requests.get(
                    base + path,
                    timeout=8,
                    allow_redirects=False,
                    headers={'User-Agent': 'Mozilla/5.0 SiteAnalyzer/1.0'}
                )
                ct = resp.headers.get('Content-Type', '')
                is_json = 'application/json' in ct or 'openapi' in ct.lower() or 'swagger' in ct.lower()

                # 找到了API入口（返回200 JSON，或返回JSON格式错误说明路由存在）
                if (resp.status_code == 200 and is_json) or \
                   (resp.status_code in (200, 401, 403, 404, 405) and 'application/json' in ct):
                    api_found = True
                    api_endpoints.append(base.replace('https://', '') + path)
                    api_score += 4
                    api_details.append({'icon': '✅', 'text': f'发现API入口 {base.replace("https://","")}{path}', 'score': 4})
                    break
            except:
                pass

        # 未发现 /api 入口，尝试跟随重定向探测
        if not api_found:
            for probe_base in ([base_with_sub] if sub_path else []) + [base_url]:
                try:
                    root_resp = requests.get(probe_base + '/api', timeout=8, allow_redirects=True)
                    ct = root_resp.headers.get('Content-Type', '')
                    if 'application/json' in ct and root_resp.status_code == 200:
                        try:
                            data = root_resp.json()
                            if isinstance(data, dict):
                                api_found = True
                                api_endpoints.append(probe_base.replace('https://', '') + '/api')
                                api_score += 4
                                api_details.append({'icon': '✅', 'text': f'发现API入口 {probe_base.replace("https://","")}/api', 'score': 4})
                                break
                        except:
                            pass
                except:
                    pass

        # 如果原域名没找到，自动探测重定向目标域名
        if not api_found and redirect_domains:
            for redir_domain in sorted(redirect_domains):
                redir_base = 'https://' + redir_domain
                redir_probe_bases = [redir_base + '/tools', redir_base]
                for probe_base in redir_probe_bases:
                    try:
                        test_resp = requests.get(probe_base + '/api', timeout=8, allow_redirects=False)
                        ct = test_resp.headers.get('Content-Type', '')
                        if 'application/json' in ct and test_resp.status_code == 200:
                            try:
                                data = test_resp.json()
                                if isinstance(data, dict):
                                    api_found = True
                                    relative_path = probe_base.replace('https://' + redir_domain, '') + '/api'
                                    api_endpoints.append(redir_domain + relative_path)
                                    api_score += 4
                                    api_details.append({'icon': '✅', 'text': f'发现API入口 {redir_domain}{relative_path}（跟随重定向）', 'score': 4})
                                    break
                            except:
                                pass
                    except:
                        pass
                if api_found:
                    break

        if not api_found:
            api_details.append({'icon': '❌', 'text': '未发现API入口', 'score': 0, 'tip': '提供GET /api返回JSON，让AI能发现你的API'})

        # ========== 2. OpenAPI文档探测 (5分) ==========
        docs_paths = [
            '/openapi.json',
            '/swagger.json',
            '/api/swagger.json',
            '/api/docs',
            '/api/docs.html',
            '/api/v1/docs',
            '/.well-known/openapi.json',
        ]
        doc_bases = ([base_with_sub] if sub_path else []) + \
                     [base_url] + \
                     ['https://' + d for d in sorted(redirect_domains)] + \
                     ['https://' + d + '/tools' for d in sorted(redirect_domains)]
        
        for doc_path in docs_paths:
            for doc_base in doc_bases:
                try:
                    doc_resp = requests.get(doc_base + doc_path, timeout=8, allow_redirects=False)
                    if doc_resp.status_code == 200:
                        ct = doc_resp.headers.get('Content-Type', '')
                        # JSON 文档或 HTML 文档页面
                        is_doc = ('application/json' in ct) or ('text/html' in ct and 'docs' in doc_path)
                        if is_doc:
                            docs_found = doc_base + doc_path
                            api_score += 5
                            api_details.append({'icon': '✅', 'text': f'发现API文档 {docs_found}', 'score': 5})
                            # 尝试解析文档内容
                            if 'application/json' in ct:
                                try:
                                    docs_content = doc_resp.json()
                                except:
                                    pass
                            break
                except:
                    pass
            if docs_found:
                break
        
        if not docs_found:
            api_details.append({'icon': '❌', 'text': '未发现OpenAPI文档', 'score': 0, 'tip': '添加/openapi.json，AI才能读懂你的API结构'})
        else:
            # 如果找到了文档但没找到入口，把文档路径视为入口
            if not api_found:
                api_found = True
                api_score += 4
                api_details.insert(-1, {'icon': '✅', 'text': f'通过文档发现API {docs_found}', 'score': 4})

        # ========== 3. CORS跨域支持 (2分) ==========
        known_api_paths = []
        if api_endpoints:
            first_ep = api_endpoints[0]
            if first_ep:
                api_base = 'https://' + first_ep.split('/')[0]
                known_api_paths = [api_base]

        opt_bases = known_api_paths + \
                    ([base_with_sub] if sub_path else []) + \
                    [base_url] + \
                    ['https://' + d for d in sorted(redirect_domains)] + \
                    ['https://' + d + '/tools' for d in sorted(redirect_domains)]
        
        cors_found = False
        for opt_base in opt_bases:
            try:
                opts_resp = requests.options(
                    opt_base + '/api',
                    timeout=5,
                    headers={'Origin': 'https://example.com', 'Access-Control-Request-Method': 'GET'}
                )
                cors_headers = [
                    'access-control-allow-origin',
                    'access-control-allow-methods',
                ]
                if any(h in opts_resp.headers for h in cors_headers):
                    cors_found = True
                    api_score += 2
                    api_details.append({'icon': '✅', 'text': f'支持CORS跨域调用', 'score': 2})
                    break
            except:
                continue
        
        if not cors_found and api_found:
            api_details.append({'icon': '⚠️', 'text': '不支持CORS跨域', 'score': 0, 'tip': '添加Access-Control-Allow-Origin头，方便AI跨域调用'})

        # ========== 4. 错误信息规范性 (2分) ==========
        # 检查文档中是否定义了错误码，或测试一个错误请求看返回格式
        error_format_found = False
        if docs_content and isinstance(docs_content, dict):
            # 检查 OpenAPI 文档中是否有错误响应定义
            responses = docs_content.get('components', {}).get('responses', {})
            paths = docs_content.get('paths', {})
            # 检查是否有 4xx/5xx 响应定义
            for path_item in paths.values():
                for method_item in path_item.values() if isinstance(path_item, dict) else []:
                    if isinstance(method_item, dict):
                        for code in ['400', '401', '403', '404', '500']:
                            if code in method_item.get('responses', {}):
                                error_format_found = True
                                break
            if not error_format_found:
                for key in responses:
                    if key.startswith('4') or key.startswith('5') or 'error' in key.lower():
                        error_format_found = True
                        break
        
        # 如果文档没有定义，尝试实际测试一个错误请求
        if not error_format_found and api_found:
            try:
                api_base = 'https://' + api_endpoints[0].split('/')[0] if api_endpoints else base_url
                err_resp = requests.get(api_base + '/api/__nonexistent_endpoint_test__', timeout=5)
                if err_resp.status_code >= 400:
                    ct = err_resp.headers.get('Content-Type', '')
                    if 'application/json' in ct:
                        try:
                            err_data = err_resp.json()
                            # 检查是否有规范的错误结构（code/message/error 等字段）
                            if isinstance(err_data, dict):
                                error_fields = ['code', 'message', 'error', 'msg', 'detail', 'reason']
                                if any(f in err_data for f in error_fields):
                                    error_format_found = True
                        except:
                            pass
            except:
                pass
        
        if error_format_found:
            api_score += 2
            api_details.append({'icon': '✅', 'text': '错误信息结构规范', 'score': 2})
        elif api_found:
            api_details.append({'icon': '⚠️', 'text': '错误信息格式待规范', 'score': 0, 'tip': '返回 {code, message} 结构的错误，帮AI理解失败原因'})

        # ========== 5. 版本号标识 (1分) ==========
        version_found = False
        # 从文档中提取版本
        if docs_content and isinstance(docs_content, dict):
            info = docs_content.get('info', {})
            if info.get('version'):
                version_found = True
        
        # 从 API 入口 URL 或响应中检查
        if not version_found and api_endpoints:
            for ep in api_endpoints:
                if '/v1' in ep or '/v2' in ep or '/v3' in ep:
                    version_found = True
                    break
        
        # 尝试从 /api 响应中检查版本字段
        if not version_found and api_found:
            try:
                api_base = 'https://' + api_endpoints[0].split('/')[0] if api_endpoints else base_url
                api_resp = requests.get(api_base + '/api', timeout=5)
                if api_resp.status_code == 200 and 'application/json' in api_resp.headers.get('Content-Type', ''):
                    data = api_resp.json()
                    if isinstance(data, dict):
                        version_fields = ['version', 'api_version', 'v', 'apiVersion']
                        if any(f in data for f in version_fields):
                            version_found = True
            except:
                pass
        
        if version_found:
            api_score += 1
            api_details.append({'icon': '✅', 'text': 'API版本号明确', 'score': 1})
        elif api_found:
            api_details.append({'icon': '⚠️', 'text': '未标明API版本', 'score': 0, 'tip': '在响应或URL中加入版本号（如/v1/或version字段）'})

        # ========== 6. 认证说明 (1分) ==========
        auth_found = False
        # 从文档中检查认证定义
        if docs_content and isinstance(docs_content, dict):
            # OpenAPI 3.0 的 security 定义
            security = docs_content.get('security', [])
            components = docs_content.get('components', {}).get('securitySchemes', {})
            if security or components:
                auth_found = True
            # 检查描述中是否提到认证
            info = docs_content.get('info', {})
            desc = info.get('description', '') or info.get('title', '')
            auth_keywords = ['api key', 'apikey', 'token', 'auth', 'bearer', 'oauth', '认证', '密钥']
            if any(kw in desc.lower() for kw in auth_keywords):
                auth_found = True
        
        # 从 API 响应检查
        if not auth_found and api_found:
            try:
                api_base = 'https://' + api_endpoints[0].split('/')[0] if api_endpoints else base_url
                # 测试一个需要认证的端点
                auth_resp = requests.get(api_base + '/api', timeout=5)
                # 401 说明需要认证
                if auth_resp.status_code == 401:
                    auth_found = True
                # 或者响应中有 auth 相关字段
                elif auth_resp.status_code == 200:
                    ct = auth_resp.headers.get('Content-Type', '')
                    if 'application/json' in ct:
                        data = auth_resp.json()
                        if isinstance(data, dict):
                            auth_fields = ['auth', 'authentication', 'api_key', 'token']
                            if any(f in str(data).lower() for f in auth_fields):
                                auth_found = True
            except:
                pass
        
        if auth_found:
            api_score += 1
            api_details.append({'icon': '✅', 'text': '认证方式明确', 'score': 1})
        elif api_found:
            api_details.append({'icon': '⚠️', 'text': '未说明认证方式', 'score': 0, 'tip': '在文档中说明API Key获取方式'})

        # 无API（纯前端工具站等）给引导性提示
        if not api_found and not docs_found:
            # 清除之前的扣分项，替换为友好提示
            api_details = [{'icon': 'ℹ️', 'text': '未发现HTTP API', 'score': 0, 'tip': '如需AI调用，建议提供RESTful API'}]

        discover['api_friendly'] = {'score': api_score, 'max': 15, 'items': api_details}
        score += api_score

        # ==================== 总分 ====================
        discover['total_score'] = round(score, 1)
        discover['max_score'] = 125
        discover['grade'] = 'A+' if score >= 100 else 'A' if score >= 90 else 'B' if score >= 75 else 'C' if score >= 60 else 'D'

        self.results['ai_discoverability'] = discover

        # 写入 icp_filing 字段（供 API 响应）
        has_icp = any(d['icon'] in ('✅', '🟡') and 'ICP' in d['text'] for d in details + discover.get('authority', {}).get('items', []))
        self.results['icp_filing'] = {
            'has_icp': icp_found,
            'icp_number': icp_number,
        }
    
    def _check_performance(self):
        """检测性能指标"""
        performance = {}
        
        # 检查常见性能头
        try:
            # 使用解析的IP（如果有）或URL
            request_url = self.url
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
            if 'resolved_ip' in self.results:
                request_url = self.url.replace(self.domain, self.results['resolved_ip'])
                headers['Host'] = self.domain
            
            response = requests.get(
                request_url,
                timeout=self.timeout,
                headers=headers,
                verify=False
            )
            headers = response.headers
            
            # 缓存控制
            performance['cache_control'] = headers.get('Cache-Control', '未设置')
            performance['etag'] = headers.get('ETag', '未设置')
            performance['last_modified'] = headers.get('Last-Modified', '未设置')
            
            # 压缩
            performance['content_encoding'] = headers.get('Content-Encoding', '未压缩')
            performance['compressed'] = 'gzip' in performance['content_encoding'] or 'br' in performance['content_encoding']
            
            # Keep-Alive
            performance['connection'] = headers.get('Connection', '未知')
            performance['keep_alive'] = 'keep-alive' in performance['connection'].lower()
            
            # 内容大小
            performance['content_size_kb'] = round(len(response.content) / 1024, 2)
            
        except Exception as e:
            performance['error'] = str(e)
        
        self.results['performance'] = performance
    
    def _calculate_score(self):
        """计算总体评分"""
        score = 100
        issues = []
        suggestions = []

        # 可用性检查
        if not self.results.get('accessible'):
            score -= 50
            issues.append({
                'text': '❌ 网站无法访问',
                'impact': '用户完全无法打开网站，搜索引擎会降低排名甚至移除收录，直接损失全部流量和潜在客户'
            })

        # SSL检查
        ssl_info = self.results.get('ssl', {})
        if not ssl_info.get('valid'):
            score -= 20
            issues.append({
                'text': '❌ SSL证书无效或未使用HTTPS',
                'impact': '浏览器会标记为"不安全"，用户看到警告后大概率直接离开；Chrome等浏览器会阻止表单提交；搜索引擎优先展示HTTPS站点'
            })
            suggestions.append({
                'text': '配置SSL证书启用HTTPS',
                'effect': '消除浏览器安全警告，提升用户信任度，搜索引擎排名提升，数据传输加密保护用户隐私'
            })
        elif ssl_info.get('days_remaining', 999) < 30:
            score -= 10
            issues.append({
                'text': '⚠️ SSL证书即将过期',
                'impact': '证书过期后网站将无法正常访问，浏览器会显示全屏安全警告，用户无法绕过'
            })
            suggestions.append({
                'text': '尽快续期SSL证书',
                'effect': '避免证书过期导致网站瘫痪，保障服务连续性'
            })

        # SEO检查
        seo = self.results.get('seo', {})
        if seo.get('title') == '未设置':
            score -= 15
            issues.append({
                'text': '❌ 缺少页面标题',
                'impact': '搜索引擎无法正确理解页面内容，搜索结果中显示为URL或空白，用户点击率极低；社交分享时也无法正确显示标题'
            })
            suggestions.append({
                'text': '添加页面标题(title标签)',
                'effect': '搜索结果中展示有吸引力的标题，点击率可提升30%-50%，帮助搜索引擎准确索引页面'
            })
        elif seo.get('title_length', 0) > 60:
            score -= 5
            issues.append({
                'text': '⚠️ 标题过长(建议30-60字符)',
                'impact': '搜索结果中标题会被截断显示，关键信息丢失，影响用户判断和点击意愿'
            })

        if seo.get('description') == '未设置':
            score -= 10
            issues.append({
                'text': '❌ 缺少Meta描述',
                'impact': '搜索引擎会自动截取页面内容作为描述，往往不准确且缺乏吸引力，搜索结果的点击率会明显偏低'
            })
            suggestions.append({
                'text': '添加Meta描述(description标签)',
                'effect': '搜索结果中展示精准且有吸引力的描述文案，点击率可提升20%-40%'
            })
        elif seo.get('description_length', 0) > 160:
            score -= 5
            issues.append({
                'text': '⚠️ 描述过长(建议120-160字符)',
                'impact': '超出部分会被搜索引擎截断，核心卖点可能被截掉'
            })

        if seo.get('h1_count', 0) == 0:
            score -= 10
            issues.append({
                'text': '❌ 缺少H1标签',
                'impact': 'H1是搜索引擎判断页面主题的核心依据，缺少H1会导致页面主题不明确，关键词排名困难'
            })
            suggestions.append({
                'text': '添加H1标题标签',
                'effect': '明确页面主题，提升目标关键词的相关性和排名权重'
            })
        elif seo.get('h1_count', 0) > 1:
            score -= 5
            issues.append({
                'text': '⚠️ H1标签过多(建议只用1个)',
                'impact': '多个H1会分散页面主题权重，搜索引擎难以判断哪个是核心主题，降低关键词排名效果'
            })

        if seo.get('images_without_alt', 0) > 0:
            score -= 5
            issues.append({
                'text': f'⚠️ {seo["images_without_alt"]}张图片缺少alt属性',
                'impact': '搜索引擎无法理解图片内容，图片搜索流量为零；屏幕阅读器无法为视障用户朗读图片，无障碍性差'
            })
            suggestions.append({
                'text': '为所有图片添加alt描述',
                'effect': '获得图片搜索引擎流量，提升页面整体SEO得分，符合无障碍标准'
            })

        if not seo.get('mobile_friendly'):
            score -= 10
            issues.append({
                'text': '❌ 未适配移动端',
                'impact': '超过60%的流量来自手机端，未适配的页面在手机上文字太小、排版错乱，用户会直接关闭；Google已全面推行移动优先索引，直接影响搜索排名'
            })
            suggestions.append({
                'text': '添加viewport meta标签并做响应式布局',
                'effect': '手机端浏览体验大幅提升，跳出率降低，移动搜索排名提升，覆盖更多用户群体'
            })

        # 性能检查
        perf = self.results.get('performance', {})
        if not perf.get('compressed'):
            score -= 5
            issues.append({
                'text': '⚠️ 未启用Gzip压缩',
                'impact': '传输数据量偏大，页面加载时间增加，尤其是移动端和弱网环境下体验明显变差'
            })
            suggestions.append({
                'text': '启用服务器Gzip/Brotli压缩',
                'effect': '传输体积减少60%-80%，页面加载速度显著提升，节省用户流量'
            })

        if perf.get('content_size_kb', 0) > 5120:
            score -= 5
            issues.append({
                'text': '⚠️ 页面体积过大(>5MB)',
                'impact': '加载时间长，用户等待耐心有限，跳出率大幅上升；移动设备内存和流量消耗大'
            })
            suggestions.append({
                'text': '压缩图片、合并CSS/JS、使用CDN加速',
                'effect': '页面加载时间缩短50%以上，用户体验和留存率明显改善'
            })

        # IPv6检查
        ipv6_info = self.results.get('ipv6', {})
        if not ipv6_info.get('supported'):
            score -= 5
            issues.append({
                'text': '⚠️ 不支持IPv6',
                'impact': 'IPv6是下一代互联网协议，国内外运营商正在逐步推广，不支持会导致部分用户访问不畅'
            })
            suggestions.append({
                'text': '联系域名商/服务器商添加AAAA记录',
                'effect': '覆盖IPv6用户，提升全球访问覆盖率'
            })

        # 响应时间
        response_time = self.results.get('response_time', 0)
        if response_time > 3:
            score -= 10
            issues.append({
                'text': '❌ 响应时间过长(>3s)',
                'impact': '研究表明超过3秒加载的页面会流失53%的访问者；搜索引擎将加载速度作为排名因素，慢站会被降权'
            })
            suggestions.append({
                'text': '优化服务器响应速度，启用缓存和CDN',
                'effect': '首屏加载时间控制在2秒内，用户留存率提升，搜索排名改善'
            })
        elif response_time > 1:
            score -= 5
            issues.append({
                'text': '⚠️ 响应时间偏慢(>1s)',
                'impact': '虽然不至于大量流失用户，但与竞品相比体验有差距，影响用户满意度和转化率'
            })

        self.results['score'] = max(0, score)
        self.results['issues'] = issues
        self.results['suggestions'] = suggestions

    def _update_domain_timing(self, elapsed_seconds):
        """更新域名分析耗时统计（按域名区分）"""
        import json
        import os
        
        # 限制最大耗时为 90 秒，超过的不计入统计（可能是超时）
        MAX_TIME = 90
        if elapsed_seconds > MAX_TIME:
            return
        
        timing_file = os.path.join(os.path.dirname(__file__), 'timing_stats.json')
        
        try:
            # 读取现有统计
            if os.path.exists(timing_file):
                with open(timing_file, 'r') as f:
                    stats = json.load(f)
            else:
                stats = {}
            
            domain = self.domain
            current = stats.get(domain, {'latest': 0, 'avg': 0, 'count': 0})
            
            # 更新统计：latest=最新耗时, avg=平均耗时, count=记录次数
            count = current['count'] + 1
            avg = ((current['avg'] * current['count']) + elapsed_seconds) / count
            
            stats[domain] = {
                'latest': round(elapsed_seconds, 2),
                'avg': round(avg, 2),
                'count': count
            }
            
            # 写回文件
            with open(timing_file, 'w') as f:
                json.dump(stats, f, indent=2, ensure_ascii=False)
        except Exception as e:
            # 统计更新失败不影响主流程
            print(f"⚠️ 更新耗时统计失败: {e}")


def generate_console_report(results):
    """生成控制台报告"""
    print("\n" + "=" * 50)
    print(f"📊 网站分析报告")
    print("=" * 50)
    print(f"URL: {results.get('url')}")
    print(f"分析时间: {results.get('timestamp')}")
    print(f"总体评分: {results.get('score', 0)}/100 {'🟢' if results.get('score', 0) >= 80 else '🟡' if results.get('score', 0) >= 60 else '🔴'}")
    
    # 可用性
    print("\n--- 🌐 可用性 ---")
    if results.get('accessible'):
        print(f"状态码: {results.get('status_code')}")
        print(f"响应时间: {results.get('response_time')}s")
        print(f"服务器: {results.get('server', '未知')}")
        if results.get('redirect_count', 0) > 0:
            print(f"重定向次数: {results.get('redirect_count')}")
    else:
        print(f"❌ 无法访问: {results.get('error')}")
    
    # SSL
    print("\n--- 🔒 SSL证书 ---")
    ssl_info = results.get('ssl', {})
    if ssl_info.get('valid'):
        print(f"状态: {ssl_info.get('status')}")
        print(f"颁发机构: {ssl_info.get('issuer')}")
        print(f"有效期至: {ssl_info.get('not_after')}")
        print(f"剩余天数: {ssl_info.get('days_remaining')}天")
    else:
        print(f"状态: {ssl_info.get('reason', '无效')}")
    
    # SEO
    print("\n--- 📈 SEO信息 ---")
    seo = results.get('seo', {})
    if not seo.get('error'):
        print(f"标题: {seo.get('title', '未设置')[:60]}")
        print(f"描述: {seo.get('description', '未设置')[:80]}...")
        print(f"关键词: {seo.get('keywords', '未设置')[:60]}")
        print(f"H1标签: {seo.get('h1_count', 0)}个")
        print(f"H2标签: {seo.get('h2_count', 0)}个")
        print(f"图片: {seo.get('total_images', 0)}个 (缺少alt: {seo.get('images_without_alt', 0)})")
        print(f"移动端适配: {'✅ 是' if seo.get('mobile_friendly') else '❌ 否'}")
        print(f"内部链接: {seo.get('internal_links', 0)} / 外部链接: {seo.get('external_links', 0)}")
    else:
        print(f"SEO检测失败: {seo.get('error')}")
    
    # 问题和建议
    if results.get('issues'):
        print("\n--- ⚠️ 发现的问题 ---")
        for issue in results['issues']:
            print(f"  {issue}")
    
    if results.get('suggestions'):
        print("\n--- 💡 优化建议 ---")
        for suggestion in results['suggestions']:
            print(f"  • {suggestion}")
    
    print("\n" + "=" * 50)


def generate_html_report(all_results, output_file='report.html'):
    """生成HTML报告"""
    html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>网站分析报告</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; color: #2c3e50; margin: 30px 0; }
        .summary { display: flex; justify-content: space-around; flex-wrap: wrap; margin: 20px 0; }
        .summary-card { background: white; border-radius: 10px; padding: 20px; margin: 10px; min-width: 200px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .summary-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; }
        .summary-card .value { font-size: 36px; font-weight: bold; }
        .score-good { color: #27ae60; }
        .score-medium { color: #f39c12; }
        .score-bad { color: #e74c3c; }
        .site-card { background: white; border-radius: 10px; padding: 25px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .site-card h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }
        .score-badge { display: inline-block; padding: 8px 20px; border-radius: 20px; color: white; font-size: 18px; font-weight: bold; }
        .section { margin: 20px 0; }
        .section h3 { color: #34495e; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .info-item { background: #f8f9fa; padding: 12px; border-radius: 6px; }
        .info-item label { font-size: 12px; color: #666; display: block; margin-bottom: 5px; }
        .info-item span { font-weight: 500; }
        .issues { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .suggestions { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin: 2px; }
        .tag-valid { background: #d4edda; color: #155724; }
        .tag-warning { background: #fff3cd; color: #856404; }
        .tag-error { background: #f8d7da; color: #721c24; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .footer { text-align: center; padding: 30px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 网站分析报告</h1>
        <p style="text-align: center; color: #666;">生成时间: ''' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '''</p>
        
        <div class="summary">
            <div class="summary-card">
                <h3>分析网站数</h3>
                <div class="value">''' + str(len(all_results)) + '''</div>
            </div>
            <div class="summary-card">
                <h3>平均评分</h3>
                <div class="value ''' + ('score-good' if sum(r.get('score', 0) for r in all_results) / max(len(all_results), 1) >= 80 else 'score-medium' if sum(r.get('score', 0) for r in all_results) / max(len(all_results), 1) >= 60 else 'score-bad') + '''">''' + str(round(sum(r.get('score', 0) for r in all_results) / max(len(all_results), 1))) + '''</div>
            </div>
            <div class="summary-card">
                <h3>可访问</h3>
                <div class="value score-good">''' + str(sum(1 for r in all_results if r.get('accessible'))) + '''</div>
            </div>
            <div class="summary-card">
                <h3>需优化</h3>
                <div class="value score-bad">''' + str(sum(1 for r in all_results if r.get('score', 0) < 80)) + '''</div>
            </div>
        </div>
'''
    
    # 汇总表格
    html += '''
        <div class="site-card">
            <h2>📋 汇总一览</h2>
            <table>
                <tr>
                    <th>网站</th>
                    <th>评分</th>
                    <th>状态码</th>
                    <th>响应时间</th>
                    <th>SSL</th>
                    <th>问题数</th>
                </tr>
'''
    
    for r in all_results:
        score = r.get('score', 0)
        score_class = 'score-good' if score >= 80 else 'score-medium' if score >= 60 else 'score-bad'
        ssl_status = '✅' if r.get('ssl', {}).get('valid') else '❌'
        
        html += f'''
                <tr>
                    <td><a href="{r.get('url')}" target="_blank">{r.get('domain')}</a></td>
                    <td><span class="{score_class}">{score}</span></td>
                    <td>{r.get('status_code', '-')}</td>
                    <td>{r.get('response_time', '-')}s</td>
                    <td>{ssl_status}</td>
                    <td>{len(r.get('issues', []))}</td>
                </tr>
'''
    
    html += '''
            </table>
        </div>
'''
    
    # 每个网站的详细报告
    for r in all_results:
        score = r.get('score', 0)
        score_bg = '#27ae60' if score >= 80 else '#f39c12' if score >= 60 else '#e74c3c'
        seo = r.get('seo', {})
        ssl_info = r.get('ssl', {})
        perf = r.get('performance', {})
        
        html += f'''
        <div class="site-card">
            <h2>{r.get('domain')} <span class="score-badge" style="background: {score_bg};">{score}分</span></h2>
'''
        
        # 基础信息
        html += '''
            <div class="section">
                <h3>🌐 基础信息</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>URL</label>
                        <span>''' + str(r.get('url', '-')) + '''</span>
                    </div>
                    <div class="info-item">
                        <label>状态码</label>
                        <span>''' + str(r.get('status_code', '-')) + '''</span>
                    </div>
                    <div class="info-item">
                        <label>响应时间</label>
                        <span>''' + str(r.get('response_time', '-')) + '''s</span>
                    </div>
                    <div class="info-item">
                        <label>服务器</label>
                        <span>''' + str(r.get('server', '-')) + '''</span>
                    </div>
                    <div class="info-item">
                        <label>内容大小</label>
                        <span>''' + str(round(r.get('content_length', 0) / 1024, 1)) + '''KB</span>
                    </div>
                    <div class="info-item">
                        <label>重定向</label>
                        <span>''' + str(r.get('redirect_count', 0)) + '''次</span>
                    </div>
                </div>
            </div>
'''
        
        # SSL信息
        html += '''
            <div class="section">
                <h3>🔒 SSL证书</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <label>状态</label>
                        <span class="tag ''' + ('tag-valid' if ssl_info.get('valid') else 'tag-error') + '''">''' + (ssl_info.get('status', '无效') if ssl_info.get('valid') else ssl_info.get('reason', '无效')) + '''</span>
                    </div>
'''
        if ssl_info.get('valid'):
            html += f'''
                    <div class="info-item">
                        <label>颁发机构</label>
                        <span>{ssl_info.get('issuer', '-')}</span>
                    </div>
                    <div class="info-item">
                        <label>有效期至</label>
                        <span>{ssl_info.get('not_after', '-')}</span>
                    </div>
                    <div class="info-item">
                        <label>剩余天数</label>
                        <span>{ssl_info.get('days_remaining', '-')}天</span>
                    </div>
'''
        html += '''
                </div>
            </div>
'''
        
        # SEO信息
        if not seo.get('error'):
            html += f'''
            <div class="section">
                <h3>📈 SEO分析</h3>
                <div class="info-grid">
                    <div class="info-item" style="grid-column: span 2;">
                        <label>标题 ({seo.get('title_length', 0)}字符)</label>
                        <span>{seo.get('title', '-')[:80]}</span>
                    </div>
                    <div class="info-item" style="grid-column: span 2;">
                        <label>描述 ({seo.get('description_length', 0)}字符)</label>
                        <span>{seo.get('description', '-')[:120]}</span>
                    </div>
                    <div class="info-item">
                        <label>关键词</label>
                        <span>{seo.get('keywords', '-')[:60]}</span>
                    </div>
                    <div class="info-item">
                        <label>移动端适配</label>
                        <span class="tag {'tag-valid' if seo.get('mobile_friendly') else 'tag-error'}">{'是' if seo.get('mobile_friendly') else '否'}</span>
                    </div>
                    <div class="info-item">
                        <label>H标签分布</label>
                        <span>H1:{seo.get('h1_count', 0)} H2:{seo.get('h2_count', 0)} H3:{seo.get('h3_count', 0)}</span>
                    </div>
                    <div class="info-item">
                        <label>图片</label>
                        <span>{seo.get('total_images', 0)}个 (缺alt: {seo.get('images_without_alt', 0)})</span>
                    </div>
                    <div class="info-item">
                        <label>链接</label>
                        <span>内部:{seo.get('internal_links', 0)} 外部:{seo.get('external_links', 0)}</span>
                    </div>
                </div>
            </div>
'''
        
        # 问题和建议
        if r.get('issues'):
            html += '''
            <div class="section">
                <div class="issues">
                    <strong>⚠️ 发现的问题：</strong><br>
'''
            for issue in r['issues']:
                html += f'                    {issue}<br>\n'
            html += '''
                </div>
            </div>
'''
        
        if r.get('suggestions'):
            html += '''
            <div class="section">
                <div class="suggestions">
                    <strong>💡 优化建议：</strong><br>
'''
            for suggestion in r['suggestions']:
                html += f'                    • {suggestion}<br>\n'
            html += '''
                </div>
            </div>
'''
        
        html += '''
        </div>
'''
    
    html += '''
        <div class="footer">
            <p>报告由 <strong>多功能站长工具箱</strong> 生成</p>
            <p>''' + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + '''</p>
        </div>
    </div>
</body>
</html>'''
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"\n✅ HTML报告已生成: {output_file}")


def analyze_batch(urls, output_file=None, max_workers=5):
    """批量分析"""
    all_results = []
    
    print(f"\n🚀 开始批量分析 {len(urls)} 个网站...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {}
        for url in urls:
            url = url.strip()
            if url:
                analyzer = SiteAnalyzer(url)
                future_to_url[executor.submit(analyzer.analyze)] = url
        
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                result = future.result()
                all_results.append(result)
                generate_console_report(result)
            except Exception as e:
                print(f"\n❌ 分析失败 {url}: {e}")
    
    # 生成汇总报告
    if output_file:
        generate_html_report(all_results, output_file)
    
    # 打印汇总
    print("\n" + "=" * 50)
    print("📊 批量分析汇总")
    print("=" * 50)
    print(f"总计分析: {len(all_results)} 个网站")
    print(f"平均评分: {round(sum(r.get('score', 0) for r in all_results) / max(len(all_results), 1))}")
    print(f"可访问: {sum(1 for r in all_results if r.get('accessible'))} 个")
    print(f"需优化: {sum(1 for r in all_results if r.get('score', 0) < 80)} 个")
    print("=" * 50)
    
    return all_results


def main():
    parser = argparse.ArgumentParser(description='多功能站长工具箱 - 网站分析器')
    parser.add_argument('url', nargs='?', help='要分析的网站URL')
    parser.add_argument('--file', '-f', help='包含URL的文件（每行一个）')
    parser.add_argument('--report', '-r', action='store_true', help='生成HTML报告')
    parser.add_argument('--output', '-o', default='report.html', help='HTML报告输出文件名')
    parser.add_argument('--workers', '-w', type=int, default=5, help='并发线程数')
    
    args = parser.parse_args()
    
    if args.file:
        # 批量分析
        with open(args.file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
        
        output_file = args.output if args.report else None
        analyze_batch(urls, output_file, args.workers)
        
    elif args.url:
        # 单个分析
        analyzer = SiteAnalyzer(args.url)
        result = analyzer.analyze()
        generate_console_report(result)
        
        if args.report:
            generate_html_report([result], args.output)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
