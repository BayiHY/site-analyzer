#!/usr/bin/env python3
"""
角色扮演结构化输出智能体 — 后端端点

替代原有的"LLM 输出纯文本 → 前端正则解析"管线，
改为"LLM 输出 JSON → 前端直接消费结构化数据"。

所有角色对话、场景、情感、建议回复等统一由后端 GLM-4-Flash 结构化输出。
"""

import os
import json
import time
import re
import urllib.request
import urllib.error
from flask import Flask, request, jsonify

app = Flask(__name__)

GLM_API_KEY = os.environ.get('GLM_API_KEY', '')
GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
STRUCTURED_OUTPUT_MAX_CHARS = 18000
STRUCTURED_OUTPUT_MAX_RETRIES = 3
STRUCTURED_OUTPUT_TIMEOUT = 120


# ============================================================
# 工具函数
# ============================================================

def _truncate_content(text, max_chars=STRUCTURED_OUTPUT_MAX_CHARS):
    """裁剪超长内容"""
    if len(text) <= max_chars:
        return text, False
    half = max_chars // 2
    truncated = text[:half] + '\n\n…（内容过长，已裁剪中间部分 …）\n\n' + text[-(max_chars - half):]
    return truncated, True


def _extract_json(text):
    """从 LLM 响应中提取 JSON"""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except json.JSONDecodeError:
            pass
    return None


def _call_glm(messages, temperature=0.1, max_tokens=4096):
    """调用 GLM API（通用，不特定于结构化输出）"""
    payload = {
        "model": "glm-4-flash",
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
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
        return {
            'success': True,
            'reply': reply,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens
        }


def _call_glm_with_retry(messages, temperature=0.1, max_tokens=4096, max_retries=STRUCTURED_OUTPUT_MAX_RETRIES):
    """带重试的 GLM 调用"""
    for attempt in range(max_retries):
        try:
            result = _call_glm(messages, temperature, max_tokens)
            if result['success']:
                return result
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))
    return {'success': False, 'error': f'重试 {max_retries} 次后仍失败'}


# ============================================================
# 角色回复结构化智能体
# ============================================================

ROLE_REPLY_SCHEMA_DESCRIPTION = """
- **scene** (string): 场景描述/旁白（纯文本，描述当前环境氛围和动态变化）
- **characters** (array): 角色回复列表，每个元素包含：
  - `name` (string): 角色名称
  - `action` (string): 动作/神态描写（不含括号标记）
  - `dialogue` (string): 对话内容（不含「」标记）
  - `thought` (string): 内心想法（不含[]标记）
- **suggestedReplies** (array): 3-4 条玩家可选回复建议（每条 ≤20 字，玩家视角）
- **emotionDelta** (object): 本轮对话的情感变化值（仅包含变化的字段）
  - `好感度` (number): ±5 以内
  - `亲密感` (number): ±5 以内
  - `信任度` (number): ±5 以内
  - `吸引力` (number): ±5 以内
  - `依赖感` (number): ±5 以内
- **dynamicAttrs** (object): 动态属性更新（仅包含变化的字段）
  - `perception` (string): 玩家印象变化，无变化则为空字符串
  - `secret` (string): 新秘密线索，无新线索则为空字符串
  - `currentMood` (string): 当前心情变化，无变化则为空字符串
- **revealedInfo** (object): 信息披露评估
  - `appearance` (boolean): 外貌是否被发现
  - `personality` (boolean): 性格是否被发现
  - `background` (boolean): 背景是否被发现
  - `relationship` (boolean): 关系是否被发现
"""


@app.route('/api/roleplay-reply', methods=['POST', 'OPTIONS'])
def roleplay_reply_api():
    """角色扮演回复结构化智能体端点
    
    前端传入对话上下文 + 系统提示 + 用户消息，
    后端 GLM-4-Flash 返回完整结构化 JSON。
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体必须是 JSON'}), 400

    system_prompt = data.get('systemPrompt', '')
    history_messages = data.get('historyMessages', [])
    user_message = data.get('userMessage', '').strip()
    characters = data.get('characters', [])
    emotions = data.get('emotions', {})
    dynamic_attrs = data.get('dynamicAttrs', {})
    revealed_info = data.get('revealedInfo', {})

    if not user_message:
        return jsonify({'error': 'userMessage 不能为空'}), 400

    # 裁剪超长内容
    full_content = system_prompt + '\n\n' + '\n'.join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in history_messages
    ) + '\n\n用户消息：' + user_message
    
    truncated_content, was_truncated = _truncate_content(full_content)
    truncate_notice = ''
    if was_truncated:
        truncate_notice = '\n\n⚠️ 注意：输入内容过长，已自动裁剪。'

    # 构建角色信息文本
    char_info = ''
    if characters:
        char_info = '\n【角色列表】\n'
        for c in characters:
            gender = c.get('gender', '未知')
            age = c.get('age', '?')
            personality = c.get('personality', '无')
            background = c.get('background', '无背景')
            name = c.get('name', '?')
            char_info += f'- {name}（{gender}，{age}岁）：{personality} | {background}\n'

    # 构建情感指标文本
    emotion_info = ''
    if emotions:
        emotion_info = '\n【情感指标】\n'
        for char_name, char_emotions in emotions.items():
            emotion_info += f'{char_name}:\n'
            for key, val in char_emotions.items():
                current = val.get('current', 50) if isinstance(val, dict) else val
                emotion_info += f'  {key}: {current}\n'

    # 构建动态属性文本
    attr_info = ''
    if dynamic_attrs:
        attr_info = '\n【动态属性】\n'
        for char_name, attrs in dynamic_attrs.items():
            attr_info += f'{char_name}:\n'
            for k, v in attrs.items():
                attr_info += f'  {k}: {v or "未设置"}\n'

    # 构建披露信息文本
    revealed_info_text = ''
    if revealed_info:
        revealed_info_text = '\n【已发现信息】\n'
        for char_name, fields in revealed_info.items():
            revealed_info_text += f'{char_name}:\n'
            for field, found in fields.items():
                status = '已发现' if found else '未发现'
                revealed_info_text += f'  {field}: {status}\n'

    # 构建最终 prompt
    final_prompt = f"""你是一个沉浸式角色扮演游戏的剧情生成引擎。请根据以下全部信息，生成标准化的结构化回复。{truncate_notice}

【输出要求】
1. 只输出合法的 JSON，不要输出任何其他文字
2. 不要包含 JSON 代码块标记（如 ```json）
3. 所有字符串字段的值必须是字符串类型，不要省略引号
4. 数组字段如果是空的，返回空数组 []
5. emotionDelta 和 dynamicAttrs 中未变化的字段返回空对象或空字符串

{ROLE_REPLY_SCHEMA_DESCRIPTION}

【角色列表】
{char_info}

【情感指标】
{emotion_info}

【动态属性】
{attr_info}

【已发现信息】
{revealed_info_text}

【对话历史】
{truncated_content}

请生成完整的结构化 JSON 回复。"""

    app.logger.info(f'🎭 角色扮演回复请求: user_msg_len={len(user_message)}, chars={len(characters)}')

    messages = [
        {"role": "user", "content": final_prompt}
    ]

    result = _call_glm_with_retry(messages, temperature=0.3, max_tokens=8192)

    if not result['success']:
        return jsonify({'error': result.get('error', 'GLM 调用失败')}), 500

    data = _extract_json(result['reply'])
    if data is None:
        return jsonify({'error': 'JSON 解析失败'}), 500

    # 校验必需字段
    required_top = {'scene', 'characters', 'suggestedReplies', 'emotionDelta', 'dynamicAttrs', 'revealedInfo'}
    missing = required_top - set(data.keys())
    if missing:
        app.logger.warning(f'⚠️ 缺少字段: {missing}')
        # 不直接拒绝，尝试补全

    return jsonify({
        'success': True,
        'structuredData': data,
        'truncated': was_truncated,
        'tokens': {
            'input': result.get('input_tokens', 0),
            'output': result.get('output_tokens', 0)
        }
    })


# ============================================================
# 快捷回复选项生成（独立端点，可在角色回复后异步调用）
# ============================================================

@app.route('/api/roleplay-reply-options', methods=['POST', 'OPTIONS'])
def roleplay_reply_options_api():
    """生成快捷回复选项
    
    前端传入上下文，后端返回 3-4 条建议回复。
    """
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'})

    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体必须是 JSON'}), 400

    recent_messages = data.get('recentMessages', [])
    active_char = data.get('activeChar', {})
    last_user_msg = data.get('lastUserMessage', '')
    last_char_response = data.get('lastCharResponse', '')

    system_prompt = f"""你是回复选项生成器，不是角色扮演角色。你的唯一任务是为用户生成3-4条可选回复按钮文案。

【绝对禁止】
- 不要输出任何角色对话、动作描写、内心独白
- 不要输出解释性文字、前言后语

【必须做的事】
- 生成 3-4 条简短回复选项（每条 ≤20 字）
- 只输出 JSON 数组，格式：["选项1", "选项2", "选项3"]

【当前上下文】
活跃角色：{active_char.get('name', '未知')}，{active_char.get('gender', '未知')}，{active_char.get('age', '未知')}岁
性格：{active_char.get('personality', '无')}
背景：{active_char.get('background', '无')}
与用户关系：{active_char.get('relationship', '普通认识')}

【最近对话】
用户：{last_user_msg}
{active_char.get('name', '对方')}：{last_char_response}"""

    messages = [
        {"role": "user", "content": system_prompt}
    ]

    result = _call_glm_with_retry(messages, temperature=0.7, max_tokens=512)

    if not result['success']:
        return jsonify({'error': result.get('error', 'GLM 调用失败')}), 500

    data = _extract_json(result['reply'])
    if data is None:
        return jsonify({'error': 'JSON 解析失败'}), 500

    # 确保是数组
    if isinstance(data, list):
        options = [str(o) for o in data[:4]]
    elif isinstance(data, dict) and 'options' in data:
        options = [str(o) for o in data['options'][:4]]
    else:
        # 尝试从字符串中提取
        text = result['reply']
        options = re.findall(r'"([^"]*)"', text)
        options = options[:4]

    return jsonify({
        'success': True,
        'options': options if len(options) >= 2 else []
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
