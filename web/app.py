#!/usr/bin/env python3
"""
站长工具 H5 版 - Web API
含 IP + 设备指纹频率限制
"""

import sys
import os
import time
import hashlib
from collections import defaultdict
from threading import Lock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template, request, jsonify
from analyzer import SiteAnalyzer
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)

# ==================== 频率限制 ====================

class RateLimiter:
    """基于 IP + 设备指纹的频率限制器"""

    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests      # 窗口内最大请求数
        self.window = window_seconds           # 时间窗口（秒）
        self._records = defaultdict(list)      # {fingerprint: [timestamps]}
        self._lock = Lock()

    def _get_fingerprint(self):
        """生成设备指纹：IP + User-Agent"""
        ip = request.headers.get('X-Real-IP', request.remote_addr)
        ua = request.headers.get('User-Agent', 'unknown')
        raw = f"{ip}|{ua}"
        return hashlib.md5(raw.encode()).hexdigest()[:16]

    def is_allowed(self):
        """检查请求是否允许，返回 (allowed, info_dict)"""
        fp = self._get_fingerprint()
        now = time.time()

        with self._lock:
            # 清理过期记录
            self._records[fp] = [
                t for t in self._records[fp]
                if now - t < self.window
            ]

            if len(self._records[fp]) >= self.max_requests:
                # 计算需要等待的时间
                oldest = self._records[fp][0]
                retry_after = int(self.window - (now - oldest)) + 1
                return False, {
                    'retry_after': retry_after,
                    'limit': self.max_requests,
                    'window': self.window,
                }

            self._records[fp].append(now)
            remaining = self.max_requests - len(self._records[fp])
            return True, {
                'remaining': remaining,
                'limit': self.max_requests,
            }

    def get_client_ip(self):
        return request.headers.get('X-Real-IP', request.remote_addr)


# 全局限流器：每 IP/设备 每分钟 10 次
limiter = RateLimiter(max_requests=10, window_seconds=60)


def check_rate_limit():
    """限流检查装饰器逻辑"""
    allowed, info = limiter.is_allowed()
    if not allowed:
        return jsonify({
            'error': f'请求太频繁，请 {info["retry_after"]} 秒后重试',
            'retry_after': info['retry_after'],
            'limit': info['limit'],
            'window': info['window'],
        }), 429
    return None

# ==================== 路由 ====================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/health')
def health():
    """健康检查 - 供其他AI智能体探测服务状态"""
    return jsonify({
        'status': 'ok',
        'service': 'site-analyzer',
        'version': '1.0.0',
        'endpoints': {
            'POST /api/analyze': '分析单个网站',
            'POST /api/batch': '批量分析（最多10个）',
            'POST /api/dns': 'DNS解析检测',
            'POST /api/test-ip': 'IP可达性测试',
            'GET /api/docs': 'API详细文档'
        },
        'rate_limit': {
            'max_requests': limiter.max_requests,
            'window_seconds': limiter.window
        }
    })


@app.route('/api/docs')
def api_docs():
    """API完整文档 - JSON格式，方便AI智能体理解接口用法"""
    return jsonify({
        'service': '站长工具 - 网站分析API',
        'base_url': 'http://111.228.14.153/tools',
        'endpoints': [
            {
                'method': 'POST',
                'path': '/api/analyze',
                'description': '分析单个网站的SEO、性能、安全性、AI可信度等',
                'content_type': 'application/json',
                'request_body': {'url': 'string (必填，支持裸域名或完整URL)'},
                'response_fields': {
                    'score': 'int 综合评分 0-100',
                    'seo': {
                        'title': 'string 页面标题',
                        'title_length': 'int 标题长度',
                        'meta_description': 'string 描述',
                        'meta_keywords': 'string 关键词',
                        'h1_count': 'int H1标签数量',
                        'img_without_alt': 'int 缺少alt的图片数',
                        'internal_links': 'int 内部链接数',
                        'external_links': 'int 外部链接数',
                        'has_sitemap': 'bool 是否有sitemap',
                        'has_robots': 'bool 是否有robots.txt',
                        'structured_data': 'list 结构化数据类型',
                        'open_graph': 'dict Open Graph标签'
                    },
                    'performance': {
                        'response_time': 'float 响应时间(秒)',
                        'content_size_kb': 'float 页面大小(KB)',
                        'compressed': 'bool 是否启用压缩'
                    },
                    'security': {
                        'ssl': 'bool 是否HTTPS',
                        'ssl_issuer': 'string SSL颁发机构',
                        'ssl_expires': 'string SSL过期时间',
                        'headers_security': 'dict 安全相关HTTP头'
                    },
                    'ai_trust': {
                        'score': 'int AI可信度评分 0-100',
                        'has_structured_data': 'bool',
                        'has_open_graph': 'bool',
                        'has_meta_description': 'bool',
                        'content_quality': 'string 内容质量评估'
                    },
                    'icp_filing': {
                        'has_icp': 'bool 是否检测到ICP备案',
                        'icp_number': 'string 备案号',
                        'confidence': 'int 置信度 0-8'
                    }
                },
                'example_request': {'url': 'baidu.com'},
                'example_curl': 'curl -X POST http://111.228.14.153/tools/api/analyze -H "Content-Type: application/json" -d \'{"url":"baidu.com"}\'',
                'errors': {
                    '400': '缺少url参数',
                    '429': '频率限制（10次/60秒）',
                    '500': '分析失败'
                }
            },
            {
                'method': 'POST',
                'path': '/api/batch',
                'description': '批量分析多个网站（最多10个，并发5线程）',
                'request_body': {'urls': 'string[] 网址数组'},
                'example_request': {'urls': ['baidu.com', 'github.com', 'juejin.cn']},
                'example_curl': 'curl -X POST http://111.228.14.153/tools/api/batch -H "Content-Type: application/json" -d \'{"urls":["baidu.com","github.com"]}\''
            },
            {
                'method': 'POST',
                'path': '/api/dns',
                'description': '检测域名DNS解析结果',
                'request_body': {'domain': 'string 域名'},
                'response_fields': {
                    'domain': 'string',
                    'resolved': 'bool 是否解析成功',
                    'ipv4': 'string[] IPv4地址列表',
                    'ipv6': 'string[] IPv6地址列表',
                    'count': 'int 总IP数'
                },
                'example_curl': 'curl -X POST http://111.228.14.153/tools/api/dns -H "Content-Type: application/json" -d \'{"domain":"baidu.com"}\''
            },
            {
                'method': 'POST',
                'path': '/api/test-ip',
                'description': '测试IP地址的443端口可达性',
                'request_body': {'ip': 'string IP地址', 'host': 'string (可选) SNI主机名'},
                'example_curl': 'curl -X POST http://111.228.14.153/tools/api/test-ip -H "Content-Type: application/json" -d \'{"ip":"110.242.68.66","host":"baidu.com"}\''
            }
        ]
    })

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """分析单个网站"""
    # 频率检查
    rate_resp = check_rate_limit()
    if rate_resp:
        return rate_resp

    data = request.get_json()
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': '请输入网址'}), 400

    try:
        analyzer = SiteAnalyzer(url)
        results = analyzer.analyze()
        resp = jsonify(results)
        # 响应头里带上限流信息
        return resp
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch', methods=['POST'])
def batch_analyze():
    """批量分析网站"""
    rate_resp = check_rate_limit()
    if rate_resp:
        return rate_resp

    data = request.get_json()
    urls = data.get('urls', [])
    if not urls:
        return jsonify({'error': '请输入网址'}), 400

    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(SiteAnalyzer(u).analyze): u for u in urls[:10]}
        for future in futures:
            try:
                results.append(future.result())
            except Exception as e:
                results.append({'url': futures[future], 'error': str(e), 'score': 0})

    return jsonify(results)

@app.route('/api/dns', methods=['POST'])
def check_dns():
    """检测域名DNS解析"""
    import socket
    
    data = request.get_json()
    domain = data.get('domain', '').strip()
    if not domain:
        return jsonify({'error': '请输入域名'}), 400
    
    # 去掉协议前缀
    if '://' in domain:
        domain = domain.split('://')[1].split('/')[0]
    
    try:
        # 获取所有IP地址
        ips = socket.getaddrinfo(domain, None)
        ip_list = list(set([ip[4][0] for ip in ips]))
        
        # 区分IPv4和IPv6
        ipv4 = [ip for ip in ip_list if ':' not in ip]
        ipv6 = [ip for ip in ip_list if ':' in ip]
        
        return jsonify({
            'domain': domain,
            'resolved': True,
            'ipv4': ipv4,
            'ipv6': ipv6,
            'all_ips': ip_list,
            'count': len(ip_list)
        })
    except socket.gaierror as e:
        return jsonify({
            'domain': domain,
            'resolved': False,
            'error': f'DNS解析失败: {str(e)}',
            'ipv4': [],
            'ipv6': [],
            'all_ips': [],
            'count': 0
        })
    except Exception as e:
        return jsonify({
            'domain': domain,
            'resolved': False,
            'error': str(e),
            'ipv4': [],
            'ipv6': [],
            'all_ips': [],
            'count': 0
        })

@app.route('/api/test-ip', methods=['POST'])
def test_ip():
    """测试IP可达性"""
    import socket
    import ssl
    
    data = request.get_json()
    ip = data.get('ip', '').strip()
    host = data.get('host', '').strip()
    
    if not ip:
        return jsonify({'error': '请输入IP地址'}), 400
    
    try:
        # 测试TCP连接（443端口）
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        start_time = time.time()
        with socket.create_connection((ip, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=host or ip) as ssock:
                response_time = time.time() - start_time
                return jsonify({
                    'ip': ip,
                    'accessible': True,
                    'response_time': round(response_time, 3),
                    'port': 443
                })
    except socket.timeout:
        return jsonify({
            'ip': ip,
            'accessible': False,
            'error': '连接超时',
            'response_time': 5.0
        })
    except Exception as e:
        return jsonify({
            'ip': ip,
            'accessible': False,
            'error': str(e),
            'response_time': 0
        })

if __name__ == '__main__':
    print(f"⚡ 频率限制: 每设备 {limiter.max_requests} 次/{limiter.window}秒")
    app.run(host='0.0.0.0', port=5000, debug=False)
