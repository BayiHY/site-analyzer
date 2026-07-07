#!/usr/bin/env python3
"""
GLM-4-Flash 结构化输出 — 极限压力测试
继续从 20000 chars 往上测，找到指令遵循失效的临界点
"""

import os
import json
import time
import random
import urllib.request

GLM_API_KEY = os.environ.get('GLM_API_KEY', '')
GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
MODEL = 'glm-4-flash'

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
5. 如果某个字段在原文中找不到对应内容，返回 null"""

def generate_long_text(length_chars):
    base_text = "阳光透过窗户洒在书桌上，房间里弥漫着淡淡的咖啡香。他坐在椅子上，目光凝视着远方，思绪万千。\n\n"
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
        "月光如水般洒在湖面上，波光粼粼，美不胜收。",
        "风吹过麦田，金黄色的波浪翻滚着涌向远方。",
        "孩子们在广场上追逐嬉戏，欢声笑语此起彼伏。",
        "图书馆里安静极了，只有翻书的沙沙声。",
        "雨后的空气清新甜润，泥土散发着芬芳的气息。",
    ]
    
    chars_generated = 0
    sentences = [base_text]
    while chars_generated < length_chars:
        sentence = random.choice(filler_sentences)
        sentences.append(sentence + "\n")
        chars_generated += len(sentence) + 1
    
    return ''.join(sentences)[:length_chars]


def call_glm(messages, temperature=0.1, max_tokens=8192):
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
        with urllib.request.urlopen(req, timeout=180) as resp:
            elapsed = time.time() - start_time
            result = json.loads(resp.read().decode('utf-8'))
            
            reply = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            usage = result.get('usage', {})
            input_tokens = usage.get('prompt_tokens') or usage.get('input_tokens') or 0
            output_tokens = usage.get('completion_tokens') or usage.get('output_tokens') or 0
            
            return {
                'success': True,
                'reply': reply,
                'elapsed': elapsed,
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
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


def main():
    print("=" * 60)
    print("【极限上下文测试 — 从 20K 往上】")
    print("=" * 60)
    
    # 测试梯度：20K, 30K, 40K, 50K, 60K, 80K, 100K
    lengths = [20000, 30000, 40000, 50000, 60000, 80000, 100000]
    
    results = []
    for length in lengths:
        content = generate_long_text(length)
        actual_chars = len(content)
        
        # 估算 token 数（中文约 1 char = 1 token）
        estimated_tokens = actual_chars
        
        print(f"\n--- 目标: {length:,} chars ({estimated_tokens:,} est. tokens) ---")
        
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content}
        ]
        
        # 跑 3 次取平均，排除网络波动
        elapses = []
        valid_count = 0
        for trial in range(3):
            result = call_glm(messages)
            if not result['success']:
                print(f"  ❌ 第{trial+1}次: API 失败 - {result['error']}")
                break
            
            data = extract_json(result['reply'])
            valid, reason = check_structured_validity(data) if data else (False, "JSON 解析失败")
            
            elapses.append(result['elapsed'])
            if valid:
                valid_count += 1
            
            status = "✅" if valid else "❌"
            print(f"  {status} 第{trial+1}次: {result['elapsed']:.2f}s, "
                  f"input={result['input_tokens']}, output={result['output_tokens']}, "
                  f"reason={reason}")
            
            time.sleep(0.3)
        
        if len(elapses) == 3:
            avg_elapsed = sum(elapses) / len(elapses)
            results.append({
                'target_chars': length,
                'actual_chars': actual_chars,
                'avg_elapsed': avg_elapsed,
                'valid_3of3': valid_count == 3,
                'valid_count': valid_count
            })
            print(f"  📊 平均耗时: {avg_elapsed:.2f}s, 3/3 通过={valid_count==3}")
        else:
            results.append({
                'target_chars': length,
                'actual_chars': actual_chars,
                'avg_elapsed': None,
                'valid_3of3': False,
                'valid_count': valid_count
            })
            print(f"  📊 未跑完 3 次")
        
        # 如果连续两次都失败了，可以提前退出
        if len(results) >= 3 and all(not r['valid_3of3'] for r in results[-3:]):
            print("\n  ⚠️ 连续 3 组全部失败，提前结束测试")
            break
    
    # 总结
    print("\n" + "=" * 60)
    print("【总结】")
    print("=" * 60)
    
    passed = [r for r in results if r['valid_3of3']]
    if passed:
        max_passed = max(passed, key=lambda x: x['actual_chars'])
        print(f"  ✅ 最大稳定上下文: {max_passed['actual_chars']:,} chars")
        print(f"  📈 稳定区间: {[r['actual_chars'] for r in passed]}")
    else:
        print(f"  ❌ 所有梯度都未能 3/3 通过")
    
    failed = [r for r in results if not r['valid_3of3']]
    if failed:
        min_failed = min(failed, key=lambda x: x['actual_chars'])
        print(f"  ❌ 首次失败点: {min_failed['actual_chars']:,} chars")
    
    if passed:
        avg_speeds = [r['avg_elapsed'] for r in passed if r['avg_elapsed']]
        if avg_speeds:
            print(f"  ⚡ 平均耗时范围: {min(avg_speeds):.2f}s ~ {max(avg_speeds):.2f}s")
            # 估算 tokens/s
            print(f"     (不含 input token 处理，仅输出速度)")


if __name__ == '__main__':
    if not GLM_API_KEY:
        print("❌ 请设置环境变量 GLM_API_KEY")
        exit(1)
    
    main()
