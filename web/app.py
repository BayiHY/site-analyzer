#!/usr/bin/env python3
"""
站长工具 H5 版 - Web API
含 IP + 设备唯一性频率限制
"""

import sys
import os
import time
import signal
import hashlib
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler
from collections import defaultdict
from threading import Lock
from functools import wraps

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template, request, jsonify, send_from_directory
from analyzer import SiteAnalyzer
from concurrent.futures import ThreadPoolExecutor, TimeoutError

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False

# ==================== 日志配置 ====================

# 创建日志目录
log_dir = '/var/log/site-analyzer'
os.makedirs(log_dir, exist_ok=True)

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# 文件日志（轮转，最大 10MB，保留 5 个备份）
file_handler = RotatingFileHandler(
    f'{log_dir}/app.log',
    maxBytes=10*1024*1024,
    backupCount=5,
    encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)

# 错误日志单独文件
error_handler = RotatingFileHandler(
    f'{log_dir}/error.log',
    maxBytes=10*1024*1024,
    backupCount=5,
    encoding='utf-8'
)
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(logging.Formatter(
    '%(asctime)s [%(levelname)s] %(pathname)s:%(lineno)d\n%(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
))
app.logger.addHandler(error_handler)

app.logger.info('🚀 站长工具服务启动')

# ==================== 超时控制 ====================

ANALYZE_TIMEOUT = 90  # 分析超时时间（秒）

def timeout_handler(signum, frame):
    """超时信号处理"""
    raise TimeoutError("分析超时")

# ==================== 频率限制 ====================

class RateLimiter:
    """基于 IP + 设备特征的频率限制器"""

    def __init__(self, max_requests=10, window_seconds=60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._records = defaultdict(list)
        self._lock = Lock()

    def _get_fingerprint(self):
        """生成设备特征：IP + User-Agent"""
        ip = request.headers.get('X-Real-IP', request.remote_addr)
        ua = request.headers.get('User-Agent', 'unknown')
        raw = f"{ip}|{ua}"
        return hashlib.md5(raw.encode()).hexdigest()[:16]

    def is_allowed(self):
        """检查请求是否允许，返回 (allowed, info_dict)"""
        fp = self._get_fingerprint()
        now = time.time()

        with self._lock:
            self._records[fp] = [
                t for t in self._records[fp]
                if now - t < self.window
            ]

            if len(self._records[fp]) >= self.max_requests:
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


# ==================== 全局错误处理 ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'code': 404,
        'message': '页面不存在',
        'error': 'NotFound'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'500 错误: {error}')
    return jsonify({
        'code': 500,
        'message': '服务器内部错误',
        'error': 'InternalServerError'
    }), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """捕获所有未处理的异常"""
    app.logger.error(f'未处理的异常: {type(e).__name__}: {e}', exc_info=True)
    return jsonify({
        'code': 500,
        'message': '服务器错误，请稍后重试',
        'error': type(e).__name__
    }), 500


# ==================== 响应头注入速率限制信息 ====================

@app.after_request
def add_rate_limit_headers(response):
    """给所有 /api/ 响应加上标准速率限制头和CORS头"""
    if request.path.startswith('/api') or request.path in ['/openapi.json', '/swagger.json']:
        fp = limiter._get_fingerprint()
        now = time.time()
        with limiter._lock:
            active = [t for t in limiter._records.get(fp, []) if now - t < limiter.window]
            remaining = limiter.max_requests - len(active)
        response.headers['X-RateLimit-Limit'] = str(limiter.max_requests)
        response.headers['X-RateLimit-Remaining'] = str(max(0, remaining))
        response.headers['X-RateLimit-Window'] = str(limiter.window)
        
        # CORS 支持 - 允许跨域调用
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


# ==================== 路由 ====================

@app.route('/')
def index():
    # 站点实际发布日期：2026-05-09
    published_time = "2026-05-09T00:00:00+08:00"
    modified_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
    return render_template('index.html', published_time=published_time, modified_time=modified_time)


# ==================== AI/SEO 导航文件 ====================
@app.route('/robots.txt')
def robots_txt():
    return send_from_directory(os.path.join(app.root_path, 'ai_nav'), 'robots.txt'), 200, {'Content-Type': 'text/plain'}

@app.route('/llms.txt')
def llms_txt():
    return send_from_directory(os.path.join(app.root_path, 'ai_nav'), 'llms.txt'), 200, {'Content-Type': 'text/markdown'}

@app.route('/sitemap.xml')
def sitemap_xml():
    return send_from_directory(os.path.join(app.root_path, 'ai_nav'), 'sitemap.xml'), 200, {'Content-Type': 'application/xml'}

@app.route('/baidu_verify_codeva-IKkeCFbXYn.html')
def baidu_verify():
    return send_from_directory(app.root_path, 'baidu_verify_codeva-IKkeCFbXYn.html'), 200, {'Content-Type': 'text/html'}

@app.route('/bdunion.txt')
def bdunion_verify():
    return send_from_directory(app.root_path, 'bdunion.txt'), 200, {'Content-Type': 'text/plain'}


@app.route('/api', methods=['GET', 'OPTIONS'])
def api_root():
    """API根路径 - 返回服务基本信息，方便AI智能体快速了解"""
    if request.method == 'OPTIONS':
        return '', 200
    return jsonify({
        'service': '站长工具 - 网站分析API',
        'version': '1.0.0',
        'status': 'ok',
        'description': '免费在线网站分析工具，检测SEO、性能、安全性、AI可信度等',
        'base_url': 'https://www.bayihy.cn/tools',
        'endpoints': {
            'GET /api': 'API基本信息（本端点）',
            'POST /api/analyze': '分析单个网站',
            'POST /api/batch': '批量分析（最多10个）',
            'POST /api/dns': 'DNS解析检测',
            'POST /api/test-ip': 'IP可达性测试',
            'GET /api/docs': 'API详细文档(JSON)',
            'GET /api/docs.html': 'API详细文档(HTML)',
            'GET /openapi.json': 'OpenAPI 3.0 规范文档'
        },
        'auth': '公开API，无需认证，但有频率限制',
        'rate_limit': {
            'limit': limiter.max_requests,
            'window': f'{limiter.window}秒',
            'remaining': limiter.max_requests
        }
    })


@app.route('/openapi.json')
def openapi_spec():
    """OpenAPI 3.0 规范文档 - 标准格式，方便AI智能体解析"""
    import json
    from pathlib import Path
    spec_file = Path(__file__).parent / 'static' / 'openapi.json'
    if spec_file.exists():
        return spec_file.read_text(encoding='utf-8'), 200, {'Content-Type': 'application/json'}
    return jsonify({'error': 'OpenAPI文档未找到'}), 404


@app.route('/swagger.json')
def swagger_spec():
    """Swagger 2.0 别名 - 重定向到 OpenAPI"""
    return openapi_spec()


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
            'GET /api/est-time': '获取域名预计分析耗时',
            'GET /api/docs': 'API详细文档(JSON)',
            'GET /api/docs.html': 'API详细文档(HTML)'
        },
        'rate_limit': {
            'max_requests': limiter.max_requests,
            'window_seconds': limiter.window
        }
    })


@app.route('/api/est-time')
def get_est_time():
    """获取域名预计分析耗时 - 从历史统计中读取平均耗时"""
    from urllib.parse import urlparse
    import json
    import os
    
    url = request.args.get('url', '')
    if not url:
        return jsonify({'avg': 15, 'count': 0})  # 默认15秒
    
    # 提取域名
    if not url.startswith('http'):
        url = 'https://' + url
    domain = urlparse(url).netloc.lower()
    domain = domain.replace('www.', '')  # 去掉www前缀
    
    # 已知慢站点兜底配置（无历史记录时使用）
    slow_sites = {
        'github.com': 60,
        'github.io': 45,
        'google.com': 20,
        'youtube.com': 20,
        'twitter.com': 25,
        'x.com': 25,
        'facebook.com': 25,
        'instagram.com': 25,
        'reddit.com': 30,
        'medium.com': 30,
        'stackoverflow.com': 20,
        'npmjs.com': 25,
        'pypi.org': 20,
    }
    
    # 从 timing_stats.json 读取
    timing_file = os.path.join(os.path.dirname(__file__), '..', 'timing_stats.json')
    if os.path.exists(timing_file):
        try:
            with open(timing_file, 'r') as f:
                stats = json.load(f)
            if domain in stats:
                return jsonify({
                    'avg': round(stats[domain].get('avg', 15), 1),
                    'count': stats[domain].get('count', 0)
                })
        except:
            pass
    
    # 检查是否是已知慢站点
    for slow_domain, est_time in slow_sites.items():
        if slow_domain in domain:
            return jsonify({'avg': est_time, 'count': 0})
    
    return jsonify({'avg': 15, 'count': 0})  # 默认15秒


@app.route('/about')
def about():
    """关于页面"""
    return render_template('about.html')


@app.route('/api/docs.html')
def api_docs_html():
    """API文档 - HTML格式，对人类和AI智能体都友好"""
    return render_template('api_docs.html')


@app.route('/api/docs')
def api_docs():
    """API完整文档 - JSON格式，方便AI智能体理解接口用法"""
    return jsonify({
        'service': '站长工具 - 网站分析API',
        'base_url': 'https://www.bayihy.cn/tools',
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
                        'max_score': 'int 满分',
                        'json_ld': '{exists, count, types[]} JSON-LD结构化数据',
                        'open_graph': '{exists, complete} Open Graph完整度',
                        'canonical': '{exists} canonical标签',
                        'authorship': '{has_author, platform} 作者信息',
                        'dates': '{has_published, has_modified} 发布/更新时间',
                        'semantic_html': '{count} 语义化HTML标签数',
                        'heading_structure': '{proper_hierarchy} 标题层级',
                        'language': '{declared, matches_content} 语言声明'
                    },
                    'icp_filing': {
                        'has_icp': 'bool 是否检测到ICP备案',
                        'icp_number': 'string 备案号',
                        'confidence': 'int 置信度 0-8'
                    }
                },
                'example_request': {'url': 'baidu.com'},
                'example_curl': 'curl -X POST https://www.bayihy.cn/tools/api/analyze -H "Content-Type: application/json" -d \'{"url":"baidu.com"}\'',
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
                'example_curl': 'curl -X POST https://www.bayihy.cn/tools/api/batch -H "Content-Type: application/json" -d \'{"urls":["baidu.com","github.com"]}\''
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
                'example_curl': 'curl -X POST https://www.bayihy.cn/tools/api/dns -H "Content-Type: application/json" -d \'{"domain":"baidu.com"}\''
            },
            {
                'method': 'POST',
                'path': '/api/test-ip',
                'description': '测试IP地址的443端口可达性',
                'request_body': {'ip': 'string IP地址', 'host': 'string (可选) SNI主机名'},
                'example_curl': 'curl -X POST https://www.bayihy.cn/tools/api/test-ip -H "Content-Type: application/json" -d \'{"ip":"110.242.68.66","host":"baidu.com"}\''
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

    client_ip = request.headers.get('X-Real-IP', request.remote_addr)
    app.logger.info(f'分析请求: {url} (来自 {client_ip})')

    try:
        analyzer = SiteAnalyzer(url)
        
        # 设置超时
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(analyzer.analyze)
            try:
                results = future.result(timeout=ANALYZE_TIMEOUT)
            except TimeoutError:
                app.logger.warning(f'分析超时: {url} (超过 {ANALYZE_TIMEOUT} 秒)')
                return jsonify({'error': f'分析超时（超过{ANALYZE_TIMEOUT}秒），请稍后重试'}), 504
        
        app.logger.info(f'分析完成: {url} (评分: {results.get("score", "N/A")})')
        # 将 seo.ai_trust 提升到顶级 ai_trust 字段
        if 'seo' in results and 'ai_trust' in results['seo']:
            results['ai_trust'] = results['seo']['ai_trust']
        resp = jsonify(results)
        return resp
    except Exception as e:
        app.logger.error(f'分析失败: {url} - {type(e).__name__}: {e}', exc_info=True)
        return jsonify({'error': f'分析失败: {str(e)}'}), 500

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

    client_ip = request.headers.get('X-Real-IP', request.remote_addr)
    app.logger.info(f'批量分析: {len(urls)} 个网站 (来自 {client_ip})')

    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(SiteAnalyzer(u).analyze): u for u in urls[:10]}
        for future in futures:
            try:
                results.append(future.result(timeout=ANALYZE_TIMEOUT))
            except TimeoutError:
                results.append({'url': futures[future], 'error': '分析超时', 'score': 0})
            except Exception as e:
                results.append({'url': futures[future], 'error': str(e), 'score': 0})

    app.logger.info(f'批量分析完成: {len(results)} 个结果')
    return jsonify(results)

@app.route('/api/dns', methods=['POST'])
def check_dns():
    """检测域名DNS解析"""
    rate_resp = check_rate_limit()
    if rate_resp:
        return rate_resp

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
    rate_resp = check_rate_limit()
    if rate_resp:
        return rate_resp

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

# ==================== 优雅关闭 ====================

def graceful_shutdown(signum, frame):
    """优雅关闭"""
    app.logger.info('收到关闭信号，正在优雅关闭...')
    sys.exit(0)

signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)

if __name__ == '__main__':
    print(f"⚡ 频率限制: 每设备 {limiter.max_requests} 次/{limiter.window}秒")
    print(f"⏱️  分析超时: {ANALYZE_TIMEOUT}秒")
    print(f"📝 日志目录: {log_dir}")
    app.run(host='0.0.0.0', port=5000, debug=False)
