#!/usr/bin/env python3
"""
简单测试 - 站长工具分析器
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzer import SiteAnalyzer


def test_analyzer_init():
    """测试分析器初始化"""
    a = SiteAnalyzer('https://example.com')
    assert a.domain == 'example.com'
    assert a.url == 'https://example.com'
    print("✅ 测试通过: 分析器初始化")


def test_normalize_url():
    """测试URL标准化"""
    a = SiteAnalyzer('example.com')
    assert a.url == 'https://example.com'
    
    a2 = SiteAnalyzer('http://example.com')
    assert a2.url == 'http://example.com'
    
    a3 = SiteAnalyzer('https://example.com')
    assert a3.url == 'https://example.com'
    print("✅ 测试通过: URL标准化")


def test_analyze_baidu():
    """测试分析百度"""
    try:
        a = SiteAnalyzer('https://baidu.com')
        result = a.analyze()
        
        # 检查基本字段
        assert 'url' in result
        assert 'domain' in result
        assert 'timestamp' in result
        
        # 检查AI可发现性
        if 'ai_discoverability' in result:
            assert 'total_score' in result['ai_discoverability']
            assert 'grade' in result['ai_discoverability']
            print(f"✅ 测试通过: 百度分析 (AI可发现性: {result['ai_discoverability']['total_score']}分)")
        else:
            print("⚠️ 警告: AI可发现性字段缺失")
    except Exception as e:
        print(f"❌ 测试失败: {e}")


def test_analyze_zhihu():
    """测试分析知乎"""
    try:
        a = SiteAnalyzer('https://zhihu.com')
        result = a.analyze()
        
        if 'ai_discoverability' in result:
            score = result['ai_discoverability']['total_score']
            grade = result['ai_discoverability']['grade']
            print(f"✅ 测试通过: 知乎分析 (AI可发现性: {score}分, 等级: {grade})")
        else:
            print("⚠️ 警告: AI可发现性字段缺失")
    except Exception as e:
        print(f"❌ 测试失败: {e}")


if __name__ == '__main__':
    print("🧪 运行站长工具测试...\n")
    
    test_analyzer_init()
    test_normalize_url()
    test_analyze_baidu()
    test_analyze_zhihu()
    
    print("\n✅ 所有测试完成!")
