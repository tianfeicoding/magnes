#!/bin/bash
# 安装 Playwright 依赖脚本

echo "🔧 安装 Playwright..."

# 检查 Python 环境
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "❌ 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

echo "使用 Python: $PYTHON"

# 安装 Playwright
echo "📦 安装 playwright 包..."
$PYTHON -m pip install playwright

# 安装 Chromium 浏览器
echo "🌐 安装 Chromium 浏览器..."
$PYTHON -m playwright install chromium

echo "✅ Playwright 安装完成！"
echo ""
echo "测试命令:"
echo "  python3 -c \"from playwright.sync_api import sync_playwright; print('OK')\""
