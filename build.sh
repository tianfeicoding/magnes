#!/bin/bash

# Magnes JSX构建脚本
# 用于预先转译所有JSX文件

set -e  # 遇到错误立即退出

echo "=================================="
echo "🔨 开始构建Magnes JSX文件"
echo "=================================="

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ npm未安装，请先安装Node.js"
    exit 1
fi

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 首次构建，正在安装依赖..."
    npm install
fi

# 清理旧的编译文件
echo "🧹 清理旧的编译文件..."
npm run clean || true

# 构建
echo "⚙️  开始转译JSX文件..."
npm run build

echo ""
echo "✅ 构建完成！"
echo ""
echo "编译输出："
echo "  - js/compiled/ui/"
echo "  - js/compiled/services/"
echo "  - js/compiled/context/"
echo "  - js/compiled/utils/"
echo "  - js/compiled/nodes/"
echo ""
echo "下一步："
echo "  1. 查看编译后的文件"
echo "  2. 更新HTML引用编译后的文件"
echo "  3. 测试页面是否正常工作"
echo ""
