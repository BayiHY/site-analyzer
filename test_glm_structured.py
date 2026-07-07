#!/usr/bin/env python3
"""
GLM-4-Flash 结构化输出能力测试
测试维度：
1. 不同上下文长度下的指令遵循成功率
2. 输出速度（首 token 延迟、总耗时、tokens/s）
"""

import os
import json
import time
import urllib.request
import urllib.error
import random
import string

GLM_API_KEY = os.environ.get('GLM_API_KEY', '')
GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
MODEL = 'glm-4-flash'

# 测试场景：提取故事内容的结构化字段
FIELD_SCHEMA = """- **character** (string): 主角名字
- **scene** (string): 场景地点
- **emotion** (string): 当前情绪状态
- **thoughts** (array): 内心独白列表
- **actions** (array): 关键动作列表
- **dialogue** (array): 对话内容列表"""

SYSTEM_PROMPT = f"""你是一个严格的数据提取助手。请将用户提供的内容按照以下字段定义提取为结构化数据。

【字段定义】
{FIELD_SCHEMA}

【输出要求】
1. 只输出合法的 JSON，不要输出任何其他文字
2. 不要包含 JSON 代码块标记（如 ```json）
3. 所有字符串字段的值必须是字符串类型，不要省略引号
4. 数组字段如果是空的，返回空数组 []
5. 如果某个字段在原文中找不到对应内容，返回 null

【输出格式示例】
{{"character": "张三", "scene": "书房", "emotion": "焦虑", "thoughts": ["明天要交报告了"], "actions": ["翻找文件"], "dialogue": ["快点快点"]}}"""


def generate_long_text(length_chars):
    """生成指定长度的模拟故事内容"""
    base_text = (
        "阳光透过窗户洒在书桌上，房间里弥漫着淡淡的咖啡香。"
        "他坐在椅子上，目光凝视着远方，思绪万千。\n\n"
    )
    filler_sentences = [
        "窗外传来鸟儿清脆的鸣叫声，微风轻拂过树叶沙沙作响。",
        "时间仿佛在这一刻静止了，只有钟表滴答滴答的声音在空气中回荡。",
        "他轻轻叹了口气，拿起桌上的钢笔，在纸上写下了几个字。",
        "远处传来汽车的喇叭声，城市的喧嚣渐渐远去。",
        "夜色渐浓，路灯一盏盏亮起，照亮了回家的路。",
        "她站在窗前，看着天空中闪烁的星星，心中充满了希望。",
        "春天的花朵在微风中摇曳，散发出阵阵清香。",
        "海边的沙滩上留下了脚印，潮水慢慢将它们抹平。",
        "山间的雾气渐渐散去，露出了远处的山峰轮廓。",
        "古老的建筑在夕阳下显得格外庄严而神秘。",
    ]
    
    chars_generated = 0
    sentences = [base_text]
    while chars_generated < length_chars:
        sentence = random.choice(filler_sentences)
        sentences.append(sentence + "\n")
        chars_generated += len(sentence) + 1
    
    return ''.join(sentences)[:length_chars]


def call_glm(messages, temperature=0.1, max_tokens=2048):
    """调用 GLM API"""
    payload = {
        "model": MODEL,
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
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            elapsed = time.time() - start_time
            result = json.loads(resp.read().decode('utf-8'))
            
            reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            usage = result.get('usage', {})
            # GLM API 可能返回不同的字段名
            input_tokens = usage.get('prompt_tokens') or usage.get('input_tokens') or 0
            output_tokens = usage.get('completion_tokens') or usage.get('output_tokens') or 0
            
            return {
                'success': True,
                'reply': reply,
                'elapsed': elapsed,
                'usage': {'input_tokens': input_tokens, 'output_tokens': output_tokens},
                'raw': result
            }
    except Exception as e:
        elapsed = time.time() - start_time
        return {
            'success': False,
            'error': str(e),
            'elapsed': elapsed
        }


def extract_json(text):
    """从响应中提取 JSON"""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    import re
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


def check_structured_validity(data):
    """检查结构化输出是否符合预期字段"""
    required = {'character', 'scene', 'emotion', 'thoughts', 'actions', 'dialogue'}
    if not isinstance(data, dict):
        return False, "返回的不是对象"
    missing = required - set(data.keys())
    if missing:
        return False, f"缺少字段: {missing}"
    if not isinstance(data.get('thoughts'), list):
        return False, "thoughts 不是数组"
    if not isinstance(data.get('actions'), list):
        return False, "actions 不是数组"
    if not isinstance(data.get('dialogue'), list):
        return False, "dialogue 不是数组"
    return True, "OK"


def test_speed():
    """测试输出速度"""
    print("=" * 60)
    print("【速度测试】")
    print("=" * 60)
    
    test_content = "小明走在雨中的街道上，心里想着今天的工作。他感到有些疲惫，但还是很期待明天的会议。窗外的雨滴敲打着玻璃，发出清脆的声响。"
    
    for i in range(3):
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": test_content}
        ]
        
        result = call_glm(messages)
        if result['success']:
            print(f"  第{i+1}次: 耗时 {result['elapsed']:.2f}s, "
                  f"input_tokens={result['usage'].get('input_tokens', 'N/A')}, "
                  f"output_tokens={result['usage'].get('output_tokens', 'N/A')}")
        else:
            print(f"  第{i+1}次: 失败 - {result['error']}")
        time.sleep(0.5)


def test_context_lengths():
    """测试不同上下文长度下的指令遵循"""
    print("\n" + "=" * 60)
    print("【上下文长度测试】")
    print("=" * 60)
    
    # 测试 5 个梯度
    lengths = [100, 500, 1000, 3000, 5000, 8000, 12000, 16000, 20000]
    
    results = []
    for length in lengths:
        content = generate_long_text(length)
        actual_chars = len(content)
        
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content}
        ]
        
        start = time.time()
        result = call_glm(messages)
        elapsed = time.time() - start
        
        if not result['success']:
            results.append({
                'target_length': length,
                'actual_chars': actual_chars,
                'success': False,
                'error': result.get('error', 'unknown'),
                'elapsed': elapsed
            })
            continue
        
        data = extract_json(result['reply'])
        valid, reason = check_structured_validity(data) if data else (False, "JSON 解析失败")
        
        results.append({
            'target_length': length,
            'actual_chars': actual_chars,
            'success': True,
            'valid': valid,
            'reason': reason,
            'elapsed': elapsed,
            'input_tokens': result['usage'].get('input_tokens', 0),
            'output_tokens': result['usage'].get('output_tokens', 0)
        })
        
        status = "✅" if valid else "❌"
        print(f"  {status} {actual_chars:>6} chars ({result['usage'].get('input_tokens', 0):>5} tokens): "
              f"耗时 {elapsed:.2f}s, 结构化={'通过' if valid else '失败'}")
        
        time.sleep(0.3)
    
    # 总结
    print("\n" + "-" * 60)
    print("【总结】")
    print("-" * 60)
    
    valid_results = [r for r in results if r.get('success')]
    if valid_results:
        max_valid = max(valid_results, key=lambda x: x.get('actual_chars', 0))
        print(f"  最大有效上下文: {max_valid['actual_chars']} chars "
              f"({max_valid['input_tokens']} tokens)")
    
    success_count = sum(1 for r in results if r.get('success') and r.get('valid'))
    fail_count = sum(1 for r in results if r.get('success') and not r.get('valid'))
    error_count = sum(1 for r in results if not r.get('success'))
    print(f"  指令遵循成功: {success_count}/{len(results)}")
    print(f"  格式错误: {fail_count}/{len(results)}")
    print(f"  API 报错: {error_count}/{len(results)}")
    
    # 速度统计
    if valid_results:
        avg_elapsed = sum(r['elapsed'] for r in valid_results) / len(valid_results)
        print(f"  平均耗时: {avg_elapsed:.2f}s")
    
    return results


if __name__ == '__main__':
    if not GLM_API_KEY:
        print("❌ 请设置环境变量 GLM_API_KEY")
        exit(1)
    
    print(f"🧪 GLM-4-Flash 结构化输出能力测试")
    print(f"🔑 API Key: {GLM_API_KEY[:8]}...{GLM_API_KEY[-4:]}")
    print(f"🕐 测试时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 先跑速度测试
    test_speed()
    
    # 再跑上下文长度测试
    results = test_context_lengths()
    
    # 输出 JSON 结果供分析
    with open('/tmp/glm_test_results.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n📄 详细结果已保存到 /tmp/glm_test_results.json")
