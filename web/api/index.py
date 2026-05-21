from flask import Flask, render_template, request, jsonify
import sys
import os
from datetime import datetime

app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static'))

app.config['JSON_AS_ASCII'] = False

@app.route('/')
def index():
    published_time = "2026-05-09T00:00:00+08:00"
    modified_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')
    return render_template('index.html', published_time=published_time, modified_time=modified_time)

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/api/docs.html')
def api_docs_html():
    return render_template('api_docs.html')

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'site-analyzer', 'version': '1.0.0'})

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    if request.method == 'OPTIONS':
        resp = jsonify({})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp
    
    data = request.get_json(silent=True) or {}
    url = data.get('url', '')
    if not url:
        return jsonify({'error': '请输入网址'}), 400
    
    return jsonify({
        'url': url,
        'score': 80,
        'note': 'Vercel demo - full analysis requires the origin server'
    })
