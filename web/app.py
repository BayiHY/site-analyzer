#!/usr/bin/env python3
"""
站长工具 H5 版 - Web API
含 IP + 设备唯一性频率限制
"""

import sys
import os
import re
import json
import time
import signal
import hashlib
import logging
import subprocess
from datetime import datetime
from logging.handlers import RotatingFileHandler
from collections import defaultdict, Counter
from threading import Lock
from functools import wraps

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
from analyzer import SiteAnalyzer
from concurrent.futures import ThreadPoolExecutor, TimeoutError

app = Flask(__name__, static_folder="static", static_url_path="/static")
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
    # 静态资源不缓存
    if '/static/' in request.path:
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    
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

@app.route('/releases/<filename>')
def serve_release(filename):
    return send_from_directory(os.path.join(app.root_path, 'static', 'releases'), filename)


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


@app.route('/audio-cutter')
def audio_cutter():
    """音频裁剪工具"""
    return render_template('audio-cutter.html')


@app.route('/hum-to-midi')
def hum_to_midi():
    """哼唱转MIDI工具 - 模块化版本"""
    return render_template('hum-to-midi-modular.html')


@app.route('/hum-to-midi-old')
def hum_to_midi_old():
    """哼唱转MIDI工具 - 原始单文件版本（备份）"""
    return render_template('hum-to-midi.html')


@app.route('/test-js-load')
def test_js_load():
    """JS模块加载测试"""
    return render_template('test-js-load.html')

@app.route('/test-piano-octaves')
def test_piano_octaves():
    """钢琴八度渲染测试"""
    return render_template('test-piano-octaves.html')

@app.route('/toolsbox')
def toolsbox():
    return render_template('toolsbox.html')


@app.route('/json-visualizer')
def json_visualizer():
    """JSON 可视化图谱工具"""
    return render_template('json-visualizer.html')


@app.route('/roleplay')
def roleplay():
    """角色扮演 Web 应用（静态资源带时间戳防缓存）"""
    import time
    ts = str(int(time.time()))
    resp = make_response(render_template('roleplay.html', cb=ts))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# ==================== WQB 队列实时看板 ====================
WQB_QUEUE_DIR = '/root/wbrain-project'
WQB_LOG_PATH = '/root/wbrain-project/wqb_auto_v2.log'
WQB_ENGINE_CMD = 'wqb_auto_submit_v3.py'

# 终态集合（按 status 字段）— 必须与 wqb_auto_submit_v3.py 的 _TERMINAL_STATUSES 同步
WQB_TERMINAL_STATUSES = {
    'SUCCESS', 'ACTIVE', 'PARAM_FAIL', 'SC_DEAD', 'SC_FAIL',
    'SUBMIT_FAIL', 'DUPLICATE', 'SCERR', 'SIM_ERR', 'SIM_FAIL',
    'EXPR_ERR', 'CHECK_FAIL', 'FAILED', 'ERROR', 'success', 'sim_error',
}

def _list_queue_files():
    """列出所有 queue_auto_*.json + queue_next.json"""
    files = []
    try:
        for fn in os.listdir(WQB_QUEUE_DIR):
            if fn.startswith('queue_auto_') and fn.endswith('.json'):
                files.append(os.path.join(WQB_QUEUE_DIR, fn))
            elif fn == 'queue_next.json':
                files.append(os.path.join(WQB_QUEUE_DIR, fn))
    except Exception as e:
        app.logger.error(f'列出队列文件失败: {e}')
    return sorted(files, key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0, reverse=True)

def _parse_queue_file(path):
    """读取单个 queue 文件，提取每条 item 关键信息"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            items = json.load(f)
    except Exception as e:
        return None, str(e)
    if not isinstance(items, list):
        return None, 'not a list'

    # 提取队列名（去掉路径和扩展名）
    name = os.path.basename(path).replace('.json', '')

    # 统计 + 列表
    status_counter = Counter()
    started_at = None  # 该队列最早非空时间
    items_out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        st = (it.get('status') or 'PENDING').upper()
        # 兼容新队列（无 status 字段）→ 视作 PENDING
        if not it.get('status'):
            st = 'PENDING'
        status_counter[st] += 1

        # 起始时间：看是否有 _sim_submitted_at 等时间字段，否则用文件 mtime
        ts = it.get('_sim_submitted_at') or it.get('started_at')
        if ts and (started_at is None or ts < started_at):
            started_at = ts

        # 处理 v3 引擎的 settings 嵌套结构 + dashboard 兼容字段名
        settings = it.get('settings') or {}
        items_out.append({
            'id': it.get('id') or it.get('track') or '',
            'status': st,
            'sim_id': it.get('sim_id'),
            'alpha_id': it.get('alpha_id'),
            'sharpe': it.get('sharpe'),
            'sc_max': it.get('sc_max'),
            # 优先读 v3 回写的顶层字段，回退到 settings 嵌套，最后到旧 key
            'universe': it.get('universe') or it.get('uni') or settings.get('universe'),
            'neutralization': it.get('neutralization') or it.get('neut') or settings.get('neutralization'),
            'decay': it.get('decay') if it.get('decay') is not None else settings.get('decay', 0),
            'truncation': it.get('truncation') if it.get('truncation') is not None else settings.get('truncation', 0.08),
            'language': settings.get('language', 'FASTEXPR'),
            'region': settings.get('region', 'USA'),
            'delay': settings.get('delay', 1),
            'expr_preview': (it.get('expr') or '')[:80],
            'notes': it.get('notes'),
            'failed_checks': it.get('failed_checks', []),
            'track': it.get('track'),
            'template': it.get('template'),
            'fields': it.get('fields', []),
            '_queue_has_status': bool(it.get('status')),
        })

    # total = 实际 item 数（包含无 status 的）
    total = len(items_out)
    # 终态数
    done = sum(c for s, c in status_counter.items() if s in WQB_TERMINAL_STATUSES)
    # pending = 非终态
    pending = total - done

    # 文件 mtime 作为兜底起始时间
    file_mtime = os.path.getmtime(path)

    # 合并引擎日志的时间线
    timeline = _get_log_timeline()
    for item in items_out:
        iid = item['id']
        tl = timeline.get(iid, {})
        # 时间字段
        item['post_ts'] = tl.get('post_ts')              # POST sim 时间
        item['push_ts'] = tl.get('push_ts')              # 推入 GET 池时间 (= 拿到 sim_id)
        item['sim_id_obtained'] = bool(item.get('sim_id') or tl.get('push_ts'))
        item['alpha_id_obtained'] = bool(item.get('alpha_id'))
        item['checks_complete_ts'] = tl.get('checks_complete_ts')
        item['sc_complete_ts'] = tl.get('sc_complete_ts')
        item['done_ts'] = tl.get('done_ts')
        # 耗时
        item['sim_obtain_sec'] = None
        if tl.get('post_ts') and tl.get('push_ts'):
            item['sim_obtain_sec'] = round(tl['push_ts'] - tl['post_ts'], 1)
        item['alpha_obtain_sec'] = None
        if tl.get('post_ts') and tl.get('checks_complete_ts'):
            # 从 POST 到 checks 完整的时间 ≈ 拿到 alpha_id
            item['alpha_obtain_sec'] = round(tl['checks_complete_ts'] - tl['post_ts'], 1)
        item['checks_obtain_sec'] = None
        if tl.get('push_ts') and tl.get('checks_complete_ts'):
            item['checks_obtain_sec'] = round(tl['checks_complete_ts'] - tl['push_ts'], 1)
        item['sc_obtain_sec'] = None
        if tl.get('checks_complete_ts') and tl.get('sc_complete_ts'):
            item['sc_obtain_sec'] = round(tl['sc_complete_ts'] - tl['checks_complete_ts'], 1)
        item['total_sec'] = None
        if tl.get('post_ts') and tl.get('done_ts'):
            item['total_sec'] = round(tl['done_ts'] - tl['post_ts'], 1)
        item['sim_poll_fail_count'] = tl.get('sim_poll_fail_count', 0)
        # 用日志得到的 done_status 覆盖（如果 queue 文件没存）
        if not item.get('_queue_has_status') and tl.get('done_status'):
            item['status'] = tl['done_status']

    return {
        'name': name,
        'path': path,
        'file_mtime': file_mtime,
        'started_at': started_at,
        'total': total,
        'done': done,
        'pending': pending,
        'status_dist': dict(status_counter),
        'items': items_out,
    }, None

def _engine_status():
    """读引擎 PID + CPU + uptime"""
    try:
        out = subprocess.run(['pgrep', '-f', WQB_ENGINE_CMD], capture_output=True, text=True, timeout=5)
        pids = [p for p in out.stdout.strip().split('\n') if p]
        app.logger.info(f'[engine] pgrep -f {WQB_ENGINE_CMD} → rc={out.returncode} pids={pids} stderr={out.stderr[:100]!r}')
    except Exception as e:
        app.logger.error(f'[engine] pgrep 异常: {e}')
        pids = []
    if not pids:
        return {'running': False, 'pids': [], 'cpu': 0.0, 'uptime_min': 0}

    pid = int(pids[0])
    try:
        # /proc/<pid>/stat 拿 CPU 时间
        with open(f'/proc/{pid}/stat') as f:
            parts = f.read().split()
        utime = int(parts[13]); stime = int(parts[14])
        # starttime in clock ticks since boot
        starttime = int(parts[21])
        clk_tck = os.sysconf('SC_CLK_TCK')
        with open('/proc/uptime') as f:
            boot_age = float(f.read().split()[0])  # 系统已运行秒
        uptime_sec = boot_age - (starttime / clk_tck)
        cpu_sec = (utime + stime) / clk_tck
        # 读 pcpu
        with open(f'/proc/{pid}/stat') as f:
            parts2 = f.read().split()
        # 用 ps 命令拿 pcpu 更准
        ps = subprocess.run(['ps', '-o', 'pcpu=', '-p', str(pid)], capture_output=True, text=True, timeout=5)
        cpu = float(ps.stdout.strip() or 0)
        return {
            'running': True,
            'pids': pids,
            'cpu': cpu,
            'uptime_min': int(uptime_sec / 60),
        }
    except Exception as e:
        return {'running': True, 'pids': pids, 'cpu': 0.0, 'uptime_min': 0, 'error': str(e)}

def _parse_engine_log():
    """从引擎日志解析每个 item_id 的时间线。

    返回 dict: {iid: {'post_ts': float, 'push_ts': float, 'done_ts': float, 'done_status': str,
                          'sim_post_to_done_sec': float, ...}}
    注意：sim_complete 关联复杂（GPW 池中不同 worker），暂只算 POST→DONE 总耗时。
    """
    try:
        with open(WQB_LOG_PATH, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        app.logger.error(f'读引擎日志失败: {e}')
        return {}

    lines = content.split('\n')

    # 模式
    POST_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?\[round \d+\] \[(\w+)\] POST sim')
    PUSH_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?📡 \[(\w+)\] sim_id=')
    DONE_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?✅ \[(\w+)\] -> (\w+)')
    SIM_ERR_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?❌.*?\[(\w+)\] 标记 SIM_ERR')
    CHECK_OK_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?✅ \[(\w+)\] 非SC checks全部通过')
    SC_DONE_RE = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?📊 \[(\w+)\] SC max')
    POLL_FAIL_RE = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.*?⚠️.*?\[(\w+)\] poll 失败')

    def parse_ts(s):
        return time.mktime(time.strptime(s, '%Y-%m-%d %H:%M:%S'))

    iid_data = defaultdict(lambda: {
        'post_ts': None, 'push_ts': None,
        'checks_complete_ts': None, 'sc_complete_ts': None,
        'done_ts': None, 'done_status': None,
        'sim_poll_fail_count': 0,
    })

    for line in lines:
        m = POST_RE.search(line)
        if m:
            ts, iid = parse_ts(m.group(1)), m.group(2)
            d = iid_data[iid]
            if d['post_ts'] is None or ts < d['post_ts']:
                d['post_ts'] = ts
            continue
        m = PUSH_RE.search(line)
        if m:
            ts, iid = parse_ts(m.group(1)), m.group(2)
            d = iid_data[iid]
            if d['push_ts'] is None or ts < d['push_ts']:
                d['push_ts'] = ts
            continue
        m = CHECK_OK_RE.search(line)
        if m:
            ts, iid = parse_ts(m.group(1)), m.group(2)
            d = iid_data[iid]
            if d['checks_complete_ts'] is None or ts < d['checks_complete_ts']:
                d['checks_complete_ts'] = ts
            continue
        m = SC_DONE_RE.search(line)
        if m:
            ts, iid = parse_ts(m.group(1)), m.group(2)
            d = iid_data[iid]
            if d['sc_complete_ts'] is None or ts < d['sc_complete_ts']:
                d['sc_complete_ts'] = ts
            continue
        m = DONE_RE.search(line)
        if m:
            ts, iid, status = parse_ts(m.group(1)), m.group(2), m.group(3)
            d = iid_data[iid]
            if d['done_ts'] is None or ts > d['done_ts']:
                d['done_ts'] = ts
                d['done_status'] = status
            continue
        m = SIM_ERR_RE.search(line)
        if m:
            ts, iid = parse_ts(m.group(1)), m.group(2)
            d = iid_data[iid]
            if d['done_ts'] is None or ts > d['done_ts']:
                d['done_ts'] = ts
                d['done_status'] = 'SIM_ERR'
            continue
        m = POLL_FAIL_RE.search(line)
        if m:
            iid_data[m.group(1)]['sim_poll_fail_count'] += 1

    return dict(iid_data)

# 缓存（10 秒有效）
_log_cache = {'data': None, 'ts': 0}
def _get_log_timeline():
    if _log_cache['data'] is None or time.time() - _log_cache['ts'] > 10:
        _log_cache['data'] = _parse_engine_log()
        _log_cache['ts'] = time.time()
    return _log_cache['data']


def _recent_engine_logs(n=20):
    """最近 n 条引擎日志（去重 + 简化）"""
    try:
        with open(WQB_LOG_PATH, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
    except Exception as e:
        return [f'(读日志失败: {e})']
    # 去重：相同内容只留最新
    seen = {}
    for line in lines:
        # 去掉时间戳前缀
        m = re.match(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}', line)
        if m:
            body = line[m.end():].strip()
        else:
            body = line.strip()
        seen[body] = line.strip()  # 后写覆盖

    out = list(seen.values())[-n:]
    return out

def wqb_dashboard():
    return render_template('wqb_dashboard.html')

app.add_url_rule('/wqb-dashboard', 'wqb_dashboard', wqb_dashboard)
app.add_url_rule('/wqb-dashboard/', 'wqb_dashboard_slash', wqb_dashboard)

def api_wqb_dashboard_view():
    """实时看板数据接口"""
    now = time.time()

    # 队列文件
    queue_files = _list_queue_files()
    queues = []
    for path in queue_files:
        info, err = _parse_queue_file(path)
        if err:
            continue
        if info is None or info['total'] == 0:
            continue
        # 全终态队列不显示（避免已完成队列污染 dashboard）
        # 监控显示是因为监控关心历史；dashboard 关心当前活跃
        if info['done'] >= info['total']:
            continue
        info['age_sec'] = int(now - info['file_mtime'])
        # 进度条
        info['progress_pct'] = round(info['done'] * 100 / info['total'], 1) if info['total'] else 0
        # 运行时长（分钟）
        start_ts = info['started_at'] or info['file_mtime']
        info['run_min'] = int((now - start_ts) / 60)
        queues.append(info)

    # 引擎状态
    engine = _engine_status()

    # 最近日志
    logs = _recent_engine_logs(15)

    # 汇总
    total_items = sum(q['total'] for q in queues)
    total_done = sum(q['done'] for q in queues)
    total_pending = sum(q['pending'] for q in queues)

    return jsonify({
        'ts': now,
        'engine': engine,
        'queues': queues,
        'summary': {
            'total_queues': len(queues),
            'total_items': total_items,
            'total_done': total_done,
            'total_pending': total_pending,
        },
        'recent_logs': logs,
    })


app.add_url_rule('/api/wqb/dashboard', 'api_wqb_dashboard', api_wqb_dashboard_view)
app.add_url_rule('/api/wqb/dashboard/', 'api_wqb_dashboard_slash', api_wqb_dashboard_view)


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

# ==================== 角色扮演 TTS API ====================

import io
import hashlib
import time

# 全局 TTS 缓存：{ md5(text+voice+rate+pitch+volume): mp3_bytes }
_tts_cache = {}
_TTS_CACHE_MAX_AGE = 86400  # 24 小时过期


def _generate_mp3(text, voice='zh-CN-XiaoxiaoNeural', rate='+0%', volume='+0%', pitch='+0Hz'):
    """调用 edge-tts 生成 MP3，结果缓存到内存"""
    import edge_tts
    cache_key = hashlib.md5(f"{text}|{voice}|{rate}|{pitch}|{volume}".encode()).hexdigest()
    if cache_key in _tts_cache:
        entry = _tts_cache[cache_key]
        if time.time() - entry['time'] < _TTS_CACHE_MAX_AGE:
            return entry['data']
        else:
            del _tts_cache[cache_key]

    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume, pitch=pitch)
    audio_chunks = []
    for chunk in communicate.stream_sync():
        if chunk['type'] == 'audio':
            audio_chunks.append(chunk['data'])
    audio_data = b''.join(audio_chunks)

    _tts_cache[cache_key] = {'data': audio_data, 'time': time.time()}
    return audio_data


@app.route('/api/tts', methods=['POST'])
def tts_api():
    """TTS 端点：接收文本+音色参数，返回 MP3 音频流"""
    data = request.get_json()
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400

    voice = data.get('voice', 'zh-CN-XiaoxiaoNeural')
    rate = data.get('rate', '+0%')
    volume = data.get('volume', '+0%')
    pitch = data.get('pitch', '+0Hz')
    
    # 兼容旧版前端传入的 ttsRate/ttsPitch/ttsVolume（基底参数）
    if 'ttsRate' in data: rate = data['ttsRate']
    if 'ttsPitch' in data: pitch = data['ttsPitch']
    if 'ttsVolume' in data: volume = data['ttsVolume']
    
    app.logger.info(f'[TTS REQUEST] voice={voice} pitch={pitch} rate={rate} vol={volume} text="{text[:50]}..."')

    try:
        mp3_bytes = _generate_mp3(text, voice, rate, volume, pitch)
        resp = make_response(mp3_bytes)
        resp.headers['Content-Type'] = 'audio/mpeg'
        resp.headers['Content-Disposition'] = f'attachment; filename=tts_{hashlib.md5(text.encode()).hexdigest()[:8]}.mp3'
        # 缓存 1 天（浏览器侧）
        resp.headers['Cache-Control'] = 'public, max-age=86400'
        return resp
    except Exception as e:
        app.logger.error(f'TTS error: {e}')
        return jsonify({'error': str(e)}), 500


# ==================== 结构化输出智能体 ====================

GLM_API_KEY = os.environ.get('GLM_API_KEY', '')
GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
STRUCTURED_OUTPUT_MAX_RETRIES = 3
STRUCTURED_OUTPUT_TIMEOUT = 120  # 秒
STRUCTURED_OUTPUT_MAX_CHARS = 18000  # 最大输入字符数（留 2K 余量，实测 20K 稳定）
STRUCTURED_OUTPUT_TRUNCATE_MSG = '输入内容过长（超过18000字符），已自动裁剪至前18000字符。部分内容未被分析。'


def _truncate_content(story_content, schema_fields):
    """裁剪超长内容，返回 (截断后内容, 是否被截断)"""
    if len(story_content) <= STRUCTURED_OUTPUT_MAX_CHARS:
        return story_content, False
    
    # 保留开头 + 末尾各一半，中间用省略号
    half = STRUCTURED_OUTPUT_MAX_CHARS // 2
    truncated = story_content[:half] + '\n\n…（内容过长，已裁剪中间部分 …）\n\n' + story_content[-(STRUCTURED_OUTPUT_MAX_CHARS - half):]
    return truncated, True


def _build_structured_prompt(schema_description, story_content, truncate_notice=None):
    """构建结构化输出 system prompt"""
    notice_section = f"\n\n⚠️ 注意：{truncate_notice}" if truncate_notice else ""
    return f"""你是一个严格的数据提取助手。请将用户提供的内容按照以下字段定义提取为结构化数据。{notice_section}

【字段定义】
{schema_description}

【输出要求】
1. 只输出合法的 JSON，不要输出任何其他文字
2. 不要包含 JSON 代码块标记（如 ```json）
3. 所有字符串字段的值必须是字符串类型，不要省略引号
4. 数组字段如果是空的，返回空数组 []
5. 如果某个字段在原文中找不到对应内容，返回 null

【用户内容】
{story_content}"""


def _fix_glm_json(text):
    """修复 GLM 输出中常见的 JSON 格式错误。"""
    import re
    text = text.strip()
    
    # 先尝试直接解析
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass
    
    # 策略1: 修复 "key", {} → "key": {}
    broken_kv = re.sub(r'"(\w+)"\s*,\s*\{', r'"\1": {', text)
    if broken_kv != text:
        try:
            json.loads(broken_kv)
            return broken_kv
        except json.JSONDecodeError:
            pass
    
    # 策略2: 修复 "key", [] → "key": []
    broken_kv2 = re.sub(r'"(\w+)"\s*,\s*\[', r'"\1": [', broken_kv)
    if broken_kv2 != broken_kv:
        try:
            json.loads(broken_kv2)
            return broken_kv2
        except json.JSONDecodeError:
            pass
    
    # 策略3: 终极方案 - 从两端向中间扫描
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = text[start:end+1]
        
        for attempt in range(3):
            if attempt == 0:
                repaired = candidate
            elif attempt == 1:
                repaired = re.sub(r'"(\w+)"\s*,\s*\{', r'"\1": {', candidate)
            else:
                repaired = re.sub(r'"(\w+)"\s*,\s*\[', r'"\1": [', candidate)
            
            try:
                result = json.loads(repaired)
                return repaired
            except json.JSONDecodeError:
                continue
    
    # 策略4: 结构重建——从损坏文本中提取已知字段
    result = {}
    
    # 提取 scene
    m = re.search(r'"scene"\s*:\s*"([^"]*)"', text)
    if m:
        result['scene'] = m.group(1)
    
    # 提取 characters 数组
    chars = re.findall(r'\{"name"\s*:\s*"([^"]*)"[^}]*"action"\s*:\s*"((?:[^"\\]|\\.)*)"[^}]*"dialogue"\s*:\s*"((?:[^"\\]|\\.)*)"[^}]*"thought"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}', text)
    if chars:
        result['characters'] = [{'name': c[0], 'action': c[1], 'dialogue': c[2], 'thought': c[3]} for c in chars]
    
    # 提取 suggestedReplies
    sr_start = text.find('"suggestedReplies"')
    if sr_start != -1:
        arr_open = text.find('[', sr_start)
        if arr_open != -1:
            ed_pos = text.find('"emotionDelta"', arr_open)
            first_close = text.find(']', arr_open)
            
            if first_close != -1 and first_close < ed_pos:
                array_content = text[arr_open+1:first_close]
            elif ed_pos != -1:
                array_content = text[arr_open+1:ed_pos]
            else:
                array_content = text[arr_open+1:]
            
            options = []
            i = 0
            while i < len(array_content):
                if array_content[i] == '"':
                    j = i + 1
                    s = ''
                    while j < len(array_content):
                        if array_content[j] == '\\' and j + 1 < len(array_content):
                            s += array_content[j:j+2]
                            j += 2
                        elif array_content[j] == '"':
                            break
                        else:
                            s += array_content[j]
                            j += 1
                    if s:
                        options.append(s)
                    i = j + 1
                else:
                    i += 1
            
            result['suggestedReplies'] = options[:5]
    
    # 提取 emotionDelta/dynamicAttrs/revealedInfo 等空对象
    for key in ['emotionDelta', 'dynamicAttrs', 'revealedInfo']:
        patterns = [
            rf'"{key}"\s*:\s*\{{\s*\}}',
            rf'"{key}"\s*,\s*\{{\s*\}}',
            rf'"{key}"\s*,\s*\{{\s*\}}\s*,',
        ]
        for pat in patterns:
            if re.search(pat, text):
                result[key] = {}
                break
    
    # 如果至少提取到了 scene 和 characters，就返回重建的 JSON
    if 'scene' in result and 'characters' in result:
        return json.dumps(result, ensure_ascii=False)
    
    return None


def _extract_json_from_response(text):
    """从 LLM 响应中提取 JSON（处理 ```json 包裹等情况）"""
    text = text.strip()
    
    # 先尝试修复常见的 GLM JSON 格式错误
    fixed = _fix_glm_json(text)
    if fixed is not None:
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass
    
    # 尝试直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # 尝试提取 ```json ... ``` 包裹的内容
    import re
    match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    # 尝试找到第一个 { 到最后一个 } 之间的内容
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError:
            pass
    return None


def _call_glm_for_structured_output(system_prompt, story_content, schema_fields, max_retries=STRUCTURED_OUTPUT_MAX_RETRIES):
    """调用 GLM API 进行结构化输出，带重试和 JSON 校验"""
    import urllib.request
    import urllib.error

    messages = [
        {"role": "user", "content": f"{system_prompt}\n\n请提取以下内容的结构化数据：\n\n{story_content}"}
    ]

    payload = {
        "model": "glm-4-flash",
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"}
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GLM_API_KEY}"
    }

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                GLM_API_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=STRUCTURED_OUTPUT_TIMEOUT) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                extracted = _extract_json_from_response(reply)
                if extracted is not None:
                    # 校验返回的 JSON 是否包含所有必需字段
                    required_keys = {f['name'] for f in schema_fields}
                    if required_keys.issubset(set(extracted.keys())):
                        app.logger.info(f'✅ 结构化输出成功 (attempt={attempt+1})')
                        return extracted
                    else:
                        missing = required_keys - set(extracted.keys())
                        app.logger.warning(f'⚠️ 缺少字段: {missing}, 重试...')
                else:
                    app.logger.warning(f'⚠️ JSON 解析失败 (attempt={attempt+1}), 重试...')
        except Exception as e:
            app.logger.error(f'❌ GLM 调用失败 (attempt={attempt+1}): {e}')

        # 如果不是最后一次，稍微等待后重试
        if attempt < max_retries - 1:
            time.sleep(0.5 * (attempt + 1))

    app.logger.error(f'❌ 结构化输出最终失败，已重试 {max_retries} 次')
    return None


@app.route('/api/structured-output', methods=['POST', 'OPTIONS'])
def structured_output_api():
    """统一的结构化输出智能体端点
    
    前端传入完整的输入输出配置，后端调用 GLM-4-Flash 提取结构化数据。
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体必须是 JSON'}), 400

    # 解析输入配置
    input_config = data.get('input', {})
    output_config = data.get('output', {})

    if not input_config or 'content' not in input_config:
        return jsonify({'error': 'input.content 不能为空'}), 400
    
    if not output_config or 'schema' not in output_config:
        return jsonify({'error': 'output.schema 不能为空'}), 400

    # 处理输入内容
    content = input_config['content'].strip()
    content_format = input_config.get('format', 'text/plain')
    context = input_config.get('context', {})
    
    if not content:
        return jsonify({'error': 'input.content 不能为空'}), 400

    # 解析输出配置
    schema = output_config['schema']
    output_format = output_config.get('format', 'application/json')
    rules = output_config.get('rules', {})

    # 裁剪超长内容
    truncated_content, was_truncated = _truncate_content(content, schema)
    truncate_notice = STRUCTURED_OUTPUT_TRUNCATE_MSG if was_truncated else None

    # 构建 schema 描述文本
    schema_desc_lines = []
    for f in schema:
        fname = f.get('name', '?')
        fdesc = f.get('desc', '')
        ftype = f.get('type', 'string')
        schema_desc_lines.append(f"- **{fname}** ({ftype}): {fdesc}")
    schema_description = '\n'.join(schema_desc_lines)

    # 构建 context 信息文本
    context_info = _build_context_info(context)

    # 构建 system prompt
    system_prompt = f"""你是一个专业的文本结构化专家。请根据提供的字段定义，将输入文本转换为结构化的 JSON 数据。

【输出要求】
1. 只输出合法的 JSON，不要输出任何其他文字
2. 不要包含 JSON 代码块标记（如 ```json）
3. 所有字符串字段的值必须是字符串类型，不要省略引号
4. 数组字段如果是空的，返回空数组 []
5. 对象字段如果是空的，返回空对象 {{}}
6. 严格按照字段定义的类型和结构输出

【字段定义】
{schema_description}

{context_info}

【输入文本】
{truncated_content}

请生成完整的结构化 JSON 数据。"""

    orig_len = len(content)
    trunc_len = len(truncated_content)
    status = f' (已裁剪 {orig_len}->{trunc_len} chars)' if was_truncated else ''
    app.logger.info(f'📦 统一结构化输出请求: schema={list(schema.keys()) if isinstance(schema, dict) else [f["name"] for f in schema]}, content_len={orig_len}{status}')

    # 调用 GLM
    result = _call_glm_for_structured_output(system_prompt, truncated_content, schema)

    if result is None:
        return jsonify({'error': '结构化输出失败，请重试'}), 500

    # 验证输出数据
    validated_data = _validate_output_data(result, schema, rules)
    if not validated_data['valid']:
        app.logger.error(f'❌ 输出数据验证失败: {validated_data["error"]}')
        return jsonify({'error': f'输出数据验证失败: {validated_data["error"]}'}), 500

    app.logger.info(f'✅ 统一结构化输出成功, schema={list(result.keys())}')
    
    response_data = {
        'success': True,
        'structuredData': result
    }
    if was_truncated:
        response_data['truncated'] = True
        response_data['originalLength'] = orig_len
        response_data['truncatedLength'] = trunc_len
        response_data['notice'] = STRUCTURED_OUTPUT_TRUNCATE_MSG

    return jsonify(response_data)


# ==================== 角色扮演结构化拆分智能体 ====================
# 职责：把对话智能体输出的原始文本拆成 JSON
# 不编故事，只拆分

ROLEPLAY_STRUCTURE_MAX_CHARS = 18000


@app.route('/api/roleplay-structure', methods=['POST', 'OPTIONS'])
def roleplay_structure_api():
    """结构化拆分端点
    
    接收对话智能体输出的原始文本，拆分为结构化 JSON：
    - scene: 场景描述
    - characters: [{name, action, dialogue, thought}]
    - suggestedReplies: ["选项1", "选项2", ...]
    - emotionDelta: {charName: {好感度: +2, ...}}
    - dynamicAttrs: {charName: {perception: "...", ...}}
    - revealedInfo: {charName: {appearance: true, ...}}
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体必须是 JSON'}), 400

    import urllib.request
    import urllib.error

    raw_text = data.get('rawText', '').strip()
    characters = data.get('characters', [])
    emotions = data.get('emotions', {})
    dynamic_attrs = data.get('dynamicAttrs', {})
    revealed_info = data.get('revealedInfo', {})

    if not raw_text:
        return jsonify({'error': 'rawText 不能为空'}), 400

    # 构建角色信息文本
    char_info_block = ''
    if characters:
        char_info_block = '\n【角色列表】\n'
        for c in characters:
            char_info_block += f"- {c.get('name', '?')}（{c.get('gender', '未知')}，{c.get('age', '?')}岁）：{c.get('personality', '无')} | {c.get('background', '无')}\n"

    # 构建情感指标
    emotion_info_block = ''
    if emotions:
        emotion_info_block = '\n【情感指标】\n'
        for char_name, char_emotions in emotions.items():
            emotion_info_block += f'{char_name}:\n'
            for key, val in char_emotions.items():
                current = val.get('current', 50) if isinstance(val, dict) else val
                emotion_info_block += f'  {key}: {current}\n'

    # 构建动态属性
    attr_info_block = ''
    if dynamic_attrs:
        attr_info_block = '\n【动态属性】\n'
        for char_name, attrs in dynamic_attrs.items():
            attr_info_block += f'{char_name}:\n'
            for k, v in attrs.items():
                attr_info_block += f'  {k}: {v or "未设置"}\n'

    # 构建披露信息
    revealed_block = ''
    if revealed_info:
        revealed_block = '\n【已发现信息】\n'
        for char_name, fields in revealed_info.items():
            revealed_block += f'{char_name}:\n'
            for field, found in fields.items():
                status = '已发现' if found else '未发现'
                revealed_block += f'  {field}: {status}\n'

    # 裁剪超长内容
    truncated_raw = raw_text
    was_truncated = False
    if len(raw_text) > ROLEPLAY_STRUCTURE_MAX_CHARS:
        half = ROLEPLAY_STRUCTURE_MAX_CHARS // 2
        truncated_raw = raw_text[:half] + '\n\n…（内容过长，已裁剪中间部分 …）\n\n' + raw_text[-(ROLEPLAY_STRUCTURE_MAX_CHARS - half):]
        was_truncated = True

    # 字段规则通过参数传入，不在提示词里硬编码
    field_schema = data.get('fieldSchema', '')
    context_info = data.get('contextInfo', '')

    # 通用结构化拆分提示词
    final_prompt = f"""你是一个严格的数据拆分助手。你的唯一任务是从对话智能体的标准化标签格式中提取结构化 JSON。

⚠️ 重要：对话智能体输出的是**标准化标签格式**，使用【标签名】独占一行的方式组织内容。
你必须按标签精确提取，不要启发式猜测或从散文文字中推断。
板块标签包括：【场景环境】【角色互动】【建议选项】
角色子标签包括：【角色名】【动作】【语言】【内心】

【字段规则】
{field_schema}

【输出要求】
1. 只输出合法的 JSON，不要输出任何其他文字
2. 不要包含 JSON 代码块标记（如 ```json）
3. 所有字符串字段必须是字符串类型
4. 数组字段如果没有内容，返回空数组 []
5. 对象字段如果没有变化，返回空对象 {{}}

{context_info}

【原始文本（请拆分）】
{truncated_raw}

请输出拆分后的 JSON。"""

    app.logger.info(f'📦 结构化拆分请求: rawText_len={len(raw_text)}')
    app.logger.info(f'📦 fieldSchema: {field_schema[:2000]}')
    app.logger.info(f'📦 contextInfo: {context_info}')

    messages = [{"role": "user", "content": final_prompt}]
    app.logger.info(f'📦 传给GLM的完整prompt (len={len(final_prompt)}): {final_prompt[:5000]}')

    for attempt in range(STRUCTURED_OUTPUT_MAX_RETRIES):
        try:
            payload = {
                "model": "glm-4-flash",
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 4096,
                "response_format": {"type": "json_object"}
            }
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GLM_API_KEY}"
            }
            req = urllib.request.Request(
                GLM_API_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=STRUCTURED_OUTPUT_TIMEOUT) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                usage = result.get('usage', {})
                input_tokens = usage.get('prompt_tokens') or usage.get('input_tokens') or 0
                output_tokens = usage.get('completion_tokens') or usage.get('output_tokens') or 0

                app.logger.info(f'📦 GLM 原始返回 (attempt={attempt+1}, len={len(reply)}): {reply[:3000]}')
                app.logger.info(f'📦 输入 rawText 长度: {len(raw_text)}, 裁剪: {was_truncated}')

                extracted = _extract_json_from_response(reply)
                if extracted is not None:
                    # 校验必需字段
                    required_top = {'scene', 'characters', 'suggestedReplies', 'emotionDelta', 'dynamicAttrs', 'revealedInfo'}
                    missing = required_top - set(extracted.keys())
                    if not missing:
                        chars_info = []
                        for c in extracted.get('characters', []):
                            chars_info.append({
                                'name': c.get('name', ''),
                                'action_len': len(c.get('action', '')),
                                'dialogue_len': len(c.get('dialogue', '')),
                                'thought_len': len(c.get('thought', '')),
                                'thought_preview': (c.get('thought', '') or '')[:80]
                            })
                        app.logger.info(f'✅ 结构化拆分成功 (attempt={attempt+1}), characters={chars_info}')
                        response_data = {
                            'success': True,
                            'structuredData': extracted,
                            'truncated': was_truncated
                        }
                        if was_truncated:
                            response_data['notice'] = STRUCTURED_OUTPUT_TRUNCATE_MSG
                        return jsonify(response_data)
                    else:
                        app.logger.warning(f'⚠️ 缺少字段: {missing}, 重试...')
                        # 重试时将缺失字段信息追加到 messages，让 GLM 知道缺了什么
                        messages.append({
                            'role': 'user',
                            'content': f'⚠️ 上一次返回的 JSON 缺少以下顶层字段：{list(missing)}。请重新输出完整 JSON，必须包含所有 6 个顶层字段：scene, characters, suggestedReplies, emotionDelta, dynamicAttrs, revealedInfo。即使字段为空也要返回（如 revealedInfo={{}}）。'
                        })
                else:
                    app.logger.warning(f'⚠️ JSON 解析失败 (attempt={attempt+1}), 重试...')
                    messages.append({
                        'role': 'user',
                        'content': f'⚠️ 上一次返回的内容不是合法 JSON，请重新输出合法的 JSON 对象。'
                    })
        except Exception as e:
            app.logger.error(f'❌ GLM 调用失败 (attempt={attempt+1}): {e}')
            messages.append({
                'role': 'user',
                'content': f'⚠️ 上一次请求出错：{str(e)[:200]}。请重新尝试。'
            })

        if attempt < STRUCTURED_OUTPUT_MAX_RETRIES - 1:
            time.sleep(0.5 * (attempt + 1))

    app.logger.error(f'❌ 结构化拆分最终失败，已重试 {STRUCTURED_OUTPUT_MAX_RETRIES} 次')
    return jsonify({'error': '结构化拆分失败，请重试'}), 500


# ==================== 角色小传生成智能体 ====================
# 职责：接收世界观 + 角色基本信息，并行调用 GLM-4-flash 生成每个角色的详细小传

CHAR_BIO_MAX_RETRIES = 3
CHAR_BIO_TIMEOUT = 60  # 秒


def _parse_standardized_text(text):
    """解析标准化文本格式（键值对），返回 bio dict
    
    支持格式：
    name: 林婉清
    gender: 女
    age: 24
    ...
    """
    if not text:
        return {}
    
    bio = {}
    lines = text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # 尝试 key: value 格式
        if ':' in line:
            key, _, value = line.partition(':')
            key = key.strip()
            value = value.strip()
            if key and value:
                bio[key] = value
        elif '|' in line:
            # 兼容 | 分隔格式
            key, _, value = line.partition('|')
            key = key.strip()
            value = value.strip()
            if key and value:
                bio[key] = value
    
    return bio


def _generate_single_bio(worldview, char_basic):
    """为单个角色生成人物内核小传（供 ThreadPoolExecutor 并行调用）
    
    注意：小传只生成人物内核（personality/background/motivation/secret/speechStyle），
    外貌、声线、生图字段已在 Step 1 角色设计阶段生成，直接透传。
    输出标准化文本格式（键值对），前端负责解析和合并。
    """
    import urllib.request
    import urllib.error

    system_prompt = (
        "你是资深角色编剧，擅长为虚构角色创作立体、有深度的背景故事。"
        "请根据世界观和角色基础信息，生成人物内核。"
        "\n\n【输出格式要求】"
        "请按以下标准化文本格式输出（每行一个字段，格式为 key: value）：\n"
        "name: 角色名\n"
        "gender: 性别\n"
        "age: 年龄\n"
        "personality: 性格特点（50 字以内，包含优点和缺点）\n"
        "background: 背景故事（100 字以内）\n"
        "motivation: 核心动机（20 字以内）\n"
        "secret: 秘密（30 字以内）\n"
        "speechStyle: 说话风格（20 字以内）\n"
        "relationships: 角色关系网（30 字以内）\n"
        "origin: 出身（50 字以内）\n"
        "abilities: 能力与短板（30 字以内）\n"
        "likes: 喜恶（20 字以内）\n"
        "habits: 习惯癖好（20 字以内）\n"
        "appearance: 外貌描述（直接从输入中复制，不要重新生成）\n"
        "voice: 声线（直接从输入中复制，不要重新生成）\n"
        "ttsPitch: TTS 音高参数（直接从输入中复制）\n"
        "ttsRate: TTS 语速参数（直接从输入中复制）\n"
        "imageFace: 面部生图描述（直接从输入中复制）\n"
        "imageHair: 发型生图描述（直接从输入中复制）\n"
        "imageBody: 身材生图描述（直接从输入中复制）\n"
        "imageClothes: 服装生图描述（直接从输入中复制）\n"
        "imageEnvironment: 场景环境生图描述（直接从输入中复制）\n"
        "\n⚠️ 注意：appearance/voice/ttsPitch/ttsRate/imageFace/imageHair/imageBody/imageClothes/imageEnvironment 字段必须直接复制输入中的值，不要重新生成！"
    )

    char_name = char_basic.get('name', '?')
    char_gender = char_basic.get('gender', '未知')
    char_age = char_basic.get('age', '?')
    char_relationship = char_basic.get('relationship', '与主角的关系待定')

    # 从 Step 1 拿到的基础信息（11 项 + 声线 + 生图）
    appearance = char_basic.get('appearance', '')
    voice = char_basic.get('voice', '')
    personality = char_basic.get('personality', '')
    relationships = char_basic.get('relationships', '')
    origin = char_basic.get('origin', '')
    motivation = char_basic.get('motivation', '')
    abilities = char_basic.get('abilities', '')
    likes = char_basic.get('likes', '')
    habits = char_basic.get('habits', '')
    tts_pitch = char_basic.get('ttsPitch', '')
    tts_rate = char_basic.get('ttsRate', '')
    image_face = char_basic.get('imageFace', '')
    image_hair = char_basic.get('imageHair', '')
    image_body = char_basic.get('imageBody', '')
    image_clothes = char_basic.get('imageClothes', '')
    image_env = char_basic.get('imageEnvironment', '')

    user_content = (
        f"【世界观概要】\n{worldview}\n\n"
        f"【角色基础信息】\n"
        f"- 姓名：{char_name}\n"
        f"- 性别：{char_gender}\n"
        f"- 年龄：{char_age}\n"
        f"- 外貌：{appearance or '待生成'}\n"
        f"- 声线：{voice or '未指定'}\n"
        f"- 性格：{personality or '待生成'}\n"
        f"- 关系网：{relationships or '待生成'}\n"
        f"- 出身：{origin or '待生成'}\n"
        f"- 核心动机：{motivation or '待生成'}\n"
        f"- 能力与短板：{abilities or '待生成'}\n"
        f"- 喜恶：{likes or '待生成'}\n"
        f"- 习惯癖好：{habits or '待生成'}\n"
        f"- TTS 音高：{tts_pitch or '未指定'}\n"
        f"- TTS 语速：{tts_rate or '未指定'}\n"
        f"- 面部生图：{image_face or '未指定'}\n"
        f"- 发型生图：{image_hair or '未指定'}\n"
        f"- 身材生图：{image_body or '未指定'}\n"
        f"- 服装生图：{image_clothes or '未指定'}\n"
        f"- 场景生图：{image_env or '未指定'}\n\n"
        f"请为该角色生成人物内核档案。注意：\n"
        f"1. personality/background/motivation/secret/speechStyle/relationships/origin/abilities/likes/habits 由你创作\n"
        f"2. appearance/voice/ttsPitch/ttsRate/imageFace/imageHair/imageBody/imageClothes/imageEnvironment 必须直接复制上面的值\n"
        f"3. 按标准化文本格式输出，每行一个字段，格式为 key: value\n"
        f"4. 不要使用 markdown 代码块包裹输出，直接输出文本"
    )

    payload = {
        "model": "glm-4-flash",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.8,
        "max_tokens": 2048
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {GLM_API_KEY}"
    }

    for attempt in range(CHAR_BIO_MAX_RETRIES):
        try:
            req = urllib.request.Request(
                GLM_API_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=CHAR_BIO_TIMEOUT) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')

                # 清理 markdown 包裹
                reply = reply.strip()
                reply = re.sub(r'^```(?:text|txt|markdown)?\s*\n', '', reply, flags=re.IGNORECASE)
                reply = re.sub(r'\n```\s*$', '', reply)

                # 解析标准化文本
                bio = _parse_standardized_text(reply)

                # 校验必要字段
                if not bio.get('name') or bio['name'] == '?':
                    app.logger.warning(f'⚠️ {char_name} 小传校验失败：name 字段为空或无效')
                    continue

                # 补全缺失字段（从 Step 1 透传）
                if 'appearance' not in bio and appearance:
                    bio['appearance'] = appearance
                if 'voice' not in bio and voice:
                    bio['voice'] = voice
                    bio['ttsPitch'] = tts_pitch
                    bio['ttsRate'] = tts_rate
                if 'imageFace' not in bio and image_face:
                    bio['imageFace'] = image_face
                if 'imageHair' not in bio and image_hair:
                    bio['imageHair'] = image_hair
                if 'imageBody' not in bio and image_body:
                    bio['imageBody'] = image_body
                if 'imageClothes' not in bio and image_clothes:
                    bio['imageClothes'] = image_clothes
                if 'imageEnvironment' not in bio and image_env:
                    bio['imageEnvironment'] = image_env

                # 设置默认值
                bio.setdefault('gender', char_gender)
                bio.setdefault('age', str(char_age))
                bio.setdefault('personality', personality or '')
                bio.setdefault('background', '')
                bio.setdefault('motivation', motivation or '')
                bio.setdefault('secret', '')
                bio.setdefault('speechStyle', '')
                bio.setdefault('relationships', relationships or '')
                bio.setdefault('origin', origin or '')
                bio.setdefault('abilities', abilities or '')
                bio.setdefault('likes', likes or '')
                bio.setdefault('habits', habits or '')

                app.logger.info(f'✅ {char_name} 小传生成成功 (attempt={attempt+1}), fields={len(bio)}')
                return {'name': char_name, 'bio': bio}

        except Exception as e:
            app.logger.error(f'❌ {char_name} 小传生成失败 (attempt={attempt+1}): {e}')

        if attempt < CHAR_BIO_MAX_RETRIES - 1:
            time.sleep(0.5 * (attempt + 1))

    app.logger.error(f'❌ {char_name} 小传生成最终失败，已重试 {CHAR_BIO_MAX_RETRIES} 次')
    return {'name': char_name, 'bio': None}


@app.route('/api/roleplay/char-bio', methods=['POST', 'OPTIONS'])
def char_bio_api():
    """角色小传生成端点
    
    接收世界观 + 角色基本信息数组，并行调用 GLM-4-flash 为每个角色生成详细小传。
    
    请求体：
    {
      "worldview": "世界观概要",
      "characters": [
        {"name": "林婉清", "gender": "女", "age": 24, "relationship": "拍卖行继承人"},
        ...
      ]
    }
    
    响应体：
    {
      "bios": [
        {
          "name": "林婉清",
          "bio": {
            "name": "林婉清",
            "age": 24,
            "gender": "女",
            "appearance": "...",
            "personality": "...",
            "background": "...",
            "relationship": "...",
            "motivation": "...",
            "secret": "...",
            "speechStyle": "...",
            "voice": "...",
            "ttsPitch": "...",
            "ttsRate": "...",
            "imageFace": "...",
            "imageHair": "...",
            "imageBody": "...",
            "imageClothes": "...",
            "imageEnvironment": "..."
          }
        },
        ...
      ]
    }
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体必须是 JSON'}), 400

    worldview = data.get('worldview', '').strip()
    characters = data.get('characters', [])

    if not worldview:
        return jsonify({'error': 'worldview 不能为空'}), 400
    if not characters:
        return jsonify({'error': 'characters 数组不能为空'}), 400

    app.logger.info(f'开始为 {len(characters)} 个角色生成小传')

    # 并行生成所有角色的小传
    with ThreadPoolExecutor(max_workers=min(len(characters), 5)) as executor:
        futures = [
            executor.submit(_generate_single_bio, worldview, char)
            for char in characters
        ]
        results = [f.result() for f in futures]

    # 过滤掉失败的
    success_bios = [r for r in results if r.get('bio')]
    failed_names = [r['name'] for r in results if not r.get('bio')]

    app.logger.info(f'小传生成完成: {len(success_bios)}/{len(characters)} 成功')
    if failed_names:
        app.logger.warning(f'失败角色: {", ".join(failed_names)}')

    return jsonify({
        'success': True,
        'total': len(characters),
        'success_count': len(success_bios),
        'failed_count': len(failed_names),
        'bios': success_bios,
        'failed': failed_names
    })


# ==================== 优雅关闭 ====================

def graceful_shutdown(signum, frame):
    """优雅关闭"""
    app.logger.info('收到关闭信号，正在优雅关闭...')
    sys.exit(0)

signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)

def _build_context_info(context):
    """构建上下文信息文本"""
    if not context:
        return ""
    
    context_lines = ["【上下文信息】"]
    for key, value in context.items():
        if isinstance(value, dict):
            context_lines.append(f"- {key}: {json.dumps(value, ensure_ascii=False)}")
        elif isinstance(value, list):
            context_lines.append(f"- {key}: {len(value)} 项")
        else:
            context_lines.append(f"- {key}: {value}")
    
    return '\n'.join(context_lines)

def _validate_output_data(data, schema, rules):
    """验证输出数据是否符合 schema 定义"""
    if not rules:
        return {'valid': True}
    
    # 检查必需字段
    required_fields = rules.get('requiredFields', [])
    if required_fields:
        missing_fields = []
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        if missing_fields:
            return {'valid': False, 'error': f'缺少必需字段: {missing_fields}'}
    
    # 检查字段类型
    field_types = rules.get('fieldTypes', {})
    if field_types:
        for field, expected_type in field_types.items():
            if field in data:
                actual_value = data[field]
                if expected_type == 'array' and not isinstance(actual_value, list):
                    return {'valid': False, 'error': f'字段 {field} 应该是数组类型'}
                elif expected_type == 'object' and not isinstance(actual_value, dict):
                    return {'valid': False, 'error': f'字段 {field} 应该是对象类型'}
                elif expected_type == 'string' and not isinstance(actual_value, str):
                    return {'valid': False, 'error': f'字段 {field} 应该是字符串类型'}
    
    # 检查不允许的额外字段
    allow_extra_fields = rules.get('allowExtraFields', True)
    if not allow_extra_fields:
        defined_fields = set()
        if isinstance(schema, list):
            defined_fields = {f.get('name') for f in schema}
        elif isinstance(schema, dict):
            defined_fields = set(schema.keys())
        
        extra_fields = set(data.keys()) - defined_fields
        if extra_fields:
            return {'valid': False, 'error': f'不允许的额外字段: {extra_fields}'}
    
    return {'valid': True}

if __name__ == '__main__':
    print(f"⚡ 频率限制: 每设备 {limiter.max_requests} 次/{limiter.window}秒")
    print(f"⏱️  分析超时: {ANALYZE_TIMEOUT}秒")
    print(f"📝 日志目录: {log_dir}")
    app.run(host='0.0.0.0', port=5000, debug=False)
