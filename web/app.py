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
