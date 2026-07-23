"""
分析报告持久化 + 分享
- SQLite 存 JSON 结果 + 元信息
- 生成短 id 作为分享 URL 后缀
- 提供 sitemap.xml 追加(去重)
"""
import os
import json
import hashlib
import sqlite3
import threading
import time
from datetime import datetime
from xml.etree import ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'reports.db')
SITEMAP_PATH = os.path.join(BASE_DIR, 'ai_nav', 'sitemap.xml')
SITE_BASE = 'https://www.bayihy.cn'
REPORT_PREFIX = '/tools/report'

_lock = threading.Lock()


def _init_db():
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                domain TEXT,
                title TEXT,
                score INTEGER,
                data_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                view_count INTEGER DEFAULT 0
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports(domain)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC)')
        conn.commit()
    finally:
        conn.close()


_init_db()


def make_report_id(url: str) -> str:
    """基于 URL + 日期 生成短 id (同一 URL 每天同一个,自然覆盖)"""
    day = datetime.now().strftime('%Y%m%d')
    key = f"{url.lower().rstrip('/')}::{day}"
    return hashlib.md5(key.encode()).hexdigest()[:10]


def save_report(url: str, data: dict) -> str:
    """保存分析结果,返回 report id"""
    rid = make_report_id(url)
    domain = data.get('domain', '')
    seo = data.get('seo') or {}
    title = (seo.get('title') if isinstance(seo, dict) else '') or ''
    if title == '未设置':
        title = ''
    score = int(data.get('score') or 0)
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    with _lock:
        conn = sqlite3.connect(DB_PATH)
        try:
            row = conn.execute('SELECT id FROM reports WHERE id=?', (rid,)).fetchone()
            data_json = json.dumps(data, ensure_ascii=False)
            if row:
                conn.execute(
                    'UPDATE reports SET url=?, domain=?, title=?, score=?, data_json=?, updated_at=? WHERE id=?',
                    (url, domain, title[:200], score, data_json, now, rid)
                )
            else:
                conn.execute(
                    'INSERT INTO reports (id, url, domain, title, score, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    (rid, url, domain, title[:200], score, data_json, now, now)
                )
            conn.commit()
        finally:
            conn.close()

    # 异步追加 sitemap(不阻塞响应)
    try:
        _append_sitemap(rid, now)
    except Exception:
        pass

    return rid


def get_report(rid: str):
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute('UPDATE reports SET view_count = view_count + 1 WHERE id=?', (rid,))
        conn.commit()
        row = conn.execute(
            'SELECT id, url, domain, title, score, data_json, created_at, updated_at, view_count FROM reports WHERE id=?',
            (rid,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {
        'id': row[0],
        'url': row[1],
        'domain': row[2],
        'title': row[3],
        'score': row[4],
        'data': json.loads(row[5]),
        'created_at': row[6],
        'updated_at': row[7],
        'view_count': row[8],
    }


def list_recent_reports(limit: int = 50):
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            'SELECT id, url, domain, title, score, created_at FROM reports ORDER BY created_at DESC LIMIT ?',
            (limit,)
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            'id': r[0], 'url': r[1], 'domain': r[2], 'title': r[3],
            'score': r[4], 'created_at': r[5],
            'share_url': f"{SITE_BASE}{REPORT_PREFIX}/{r[0]}",
        }
        for r in rows
    ]


def _append_sitemap(rid: str, updated_at: str):
    """将报告 URL 追加到 sitemap.xml,已存在则更新 lastmod"""
    if not os.path.exists(SITEMAP_PATH):
        return
    loc = f"{SITE_BASE}{REPORT_PREFIX}/{rid}"
    lastmod = updated_at.split(' ')[0]

    ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    ET.register_namespace('', ns)
    try:
        tree = ET.parse(SITEMAP_PATH)
        root = tree.getroot()
    except Exception:
        return

    for url_el in root.findall(f'{{{ns}}}url'):
        loc_el = url_el.find(f'{{{ns}}}loc')
        if loc_el is not None and loc_el.text == loc:
            lm = url_el.find(f'{{{ns}}}lastmod')
            if lm is not None:
                lm.text = lastmod
            else:
                new_lm = ET.SubElement(url_el, f'{{{ns}}}lastmod')
                new_lm.text = lastmod
            tree.write(SITEMAP_PATH, encoding='utf-8', xml_declaration=True)
            return

    url_el = ET.SubElement(root, f'{{{ns}}}url')
    ET.SubElement(url_el, f'{{{ns}}}loc').text = loc
    ET.SubElement(url_el, f'{{{ns}}}lastmod').text = lastmod
    ET.SubElement(url_el, f'{{{ns}}}priority').text = '0.6'
    ET.SubElement(url_el, f'{{{ns}}}changefreq').text = 'monthly'
    tree.write(SITEMAP_PATH, encoding='utf-8', xml_declaration=True)


def count_reports() -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        return conn.execute('SELECT COUNT(*) FROM reports').fetchone()[0]
    finally:
        conn.close()
