#!/bin/bash
# 多功能站长工具箱 - 快速启动脚本

echo "🌐 多功能站长工具箱"
echo "===================="

# 检查Python版本
python3 --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ 错误: 未找到Python3，请先安装Python3"
    exit 1
fi

# 安装依赖
echo "📦 检查依赖..."
pip3 install -q requests beautifulsoup4 2>/dev/null

# 显示帮助
if [ -z "$1" ]; then
    echo ""
    echo "使用方法:"
    echo "  ./start.sh <URL>                    # 分析单个网站"
    echo "  ./start.sh <URL> --report           # 分析并生成HTML报告"
    echo "  ./start.sh --file urls.txt          # 批量分析"
    echo "  ./start.sh --file urls.txt --report # 批量分析并生成报告"
    echo ""
    echo "示例:"
    echo "  ./start.sh https://example.com"
    echo "  ./start.sh https://example.com --report"
    echo "  ./start.sh --file urls.txt --report --output report.html"
    echo ""
    exit 0
fi

# 运行分析器
python3 analyzer.py "$@"
