/**
 * Emoji Icons Component Module
 * Emoji 图标组件(简化版,用于 )
 * @module src/components/emojiicons
 * @version 4.3.0
 */

(function () {
    'use strict';

    const { React } = window;

    /**
     * 简单的 Emoji 图标组件
     * @param {Object} props - 组件属性
     * @param {string} props.emoji - Emoji 字符
     * @param {number} props.size - 图标大小(像素)
     * @param {string} props.className - 额外的 CSS 类名
     */
    const Icon = ({ emoji, size = 24, className = '', ...props }) => {
        return React.createElement('span', {
            className,
            style: { fontSize: `${size}px`, lineHeight: 1, display: 'inline-block' },
            ...props
        }, emoji);
    };

    /**
     * 创建图标组件
     * @param {string} emoji - Emoji 字符
     * @returns {Function} 图标组件
     */
    const createIcon = (emoji) => (props) => Icon({ emoji, ...props });

    /**
     * Emoji 图标集合
     */
    const EmojiIcons = {
        Plus: createIcon('➕'),
        Image: createIcon('🖼️'),
        Video: createIcon('🎬'),
        Type: createIcon('📝'),
        Palette: createIcon('🎨'),
        MonitorPlay: createIcon('📺'),
        Layers: createIcon('📚'),
        Sun: createIcon('☀️'),
        Moon: createIcon('🌙'),
        Settings: createIcon('⚙️'),
        MousePointer2: createIcon('👆'),
        History: createIcon('🕐'),
        Layout: createIcon('📐'),
        Users: createIcon('👥'),
        MessageSquare: createIcon('💬'),
        Bot: createIcon('🤖'),
        Trash2: createIcon('🗑️'),
        X: createIcon('❌'),
        Play: createIcon('▶️'),
        Wand2: createIcon('✨'),
        Film: createIcon('🎬'),
        Clapperboard: createIcon('🎬'),
        GitCompare: createIcon('🔀'),
        GripHorizontal: createIcon('☰'),
        Copy: createIcon('📋'),
        Maximize2: createIcon('⛶'),
        Check: createIcon('✓'),
        RefreshCw: createIcon('🔄'),
        Sliders: createIcon('🎚️'),
        ArrowRight: createIcon('→')
    };

    // 初始化命名空间
    if (!window.MagnesComponents) {
        window.MagnesComponents = {};
    }
    if (!window.MagnesComponents.UI) {
        window.MagnesComponents.UI = {};
    }

    // 导出到全局命名空间
    window.MagnesComponents.UI.EmojiIcons = EmojiIcons;

    console.log('✅ EmojiIcons 组件已加载');
})();
