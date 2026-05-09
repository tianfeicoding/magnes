#!/bin/bash
# OpenClaw for Magnes 快捷调用脚本
# 可以在终端、Alfred、Raycast 等工具中调用

SKILL_DIR="/Users/Hamilton/Desktop/rednote/magnes/.agent/skills/openclaw-for-magnes"
DATA_DIR="/Users/Hamilton/.openclaw/workspace/data/xiaohongshu"

# 显示帮助
show_help() {
    echo "OpenClaw for Magnes 快捷调用"
    echo ""
    echo "用法:"
    echo "  $0 search <关键词>     - 搜索小红书"
    echo "  $0 extract [文件]      - 提取活动 (默认使用最新搜索文件)"
    echo "  $0 poster [文件]       - 生成海报 (默认使用最新活动文件)"
    echo "  $0 full <关键词>       - 完整流程: 搜索+提取+生成海报"
    echo ""
    echo "示例:"
    echo "  $0 search \"上海三月市集\""
    echo "  $0 full \"北京周末活动\""
}

# 搜索小红书
search_xhs() {
    local keyword="$1"
    echo "🔍 搜索小红书: $keyword"
    cd "$SKILL_DIR"
    python3 scripts/search_and_save.py "$keyword" 10
}

# 提取活动
extract_events() {
    local input_file="$1"
    if [ -z "$input_file" ]; then
        # 使用最新的搜索文件
        input_file=$(ls -t $DATA_DIR/search_results_*.json 2>/dev/null | head -1)
        if [ -z "$input_file" ]; then
            echo "❌ 未找到搜索文件，请先运行搜索"
            exit 1
        fi
    fi
    echo "📊 提取活动: $input_file"
    cd "$SKILL_DIR"
    python3 scripts/event_extractor.py "$input_file"
}

# 生成海报
generate_poster() {
    echo "🎨 生成海报..."
    cd "$SKILL_DIR"
    python3 scripts/generate_poster_precise.py
    
    # 打开生成的海报
    if [ -f "$SKILL_DIR/data/poster_precise_blocks.png" ]; then
        echo "✅ 海报已生成: $SKILL_DIR/data/poster_precise_blocks.png"
        open "$SKILL_DIR/data/poster_precise_blocks.png"
    fi
}

# 完整流程
full_workflow() {
    local keyword="$1"
    search_xhs "$keyword"
    extract_events
    generate_poster
}

# 主逻辑
case "$1" in
    search)
        if [ -z "$2" ]; then
            echo "❌ 请提供搜索关键词"
            show_help
            exit 1
        fi
        search_xhs "$2"
        ;;
    extract)
        extract_events "$2"
        ;;
    poster)
        generate_poster
        ;;
    full)
        if [ -z "$2" ]; then
            echo "❌ 请提供搜索关键词"
            show_help
            exit 1
        fi
        full_workflow "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
