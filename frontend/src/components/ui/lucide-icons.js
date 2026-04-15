/**
 * Lucide Icons - React 封装层
 * 将 window.lucide 中的图标数据封装为 React 组件
 * @version 1.0.0
 * 修正：支持 Magnes 命名空间
 */

(function () {
    'use strict';

    const { React } = window;

    /**
     * 通用 Lucide 图标组件
     */
    const LucideIcon = ({ iconData, size = 24, color = "currentColor", strokeWidth = 2, ...props }) => {
        if (!iconData) return null;

        const paths = iconData.map(([tag, attrs], idx) =>
            React.createElement(tag, { key: idx, ...attrs })
        );

        return React.createElement('svg', {
            xmlns: "http://www.w3.org/2000/svg",
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: props.fill || "none",
            stroke: color,
            strokeWidth: strokeWidth,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: { display: 'inline-block', verticalAlign: 'middle' },
            ...props
        }, paths);
    };

    /**
     * 创建具名图标组件的工厂函数
     */
    const createIcon = (iconName) => {
        return (props) => {
            if (!window.lucide || !window.lucide[iconName]) return null;
            return React.createElement(LucideIcon, {
                iconData: window.lucide[iconName],
                ...props
            });
        };
    };

    const LucideIcons = {
        FileText: createIcon('FileText'),
        Type: createIcon('Type'),
        Edit3: createIcon('Edit3'),
        PenTool: createIcon('PenTool'),
        Image: createIcon('Image'),
        Video: createIcon('Video'),
        Camera: createIcon('Camera'),
        Film: createIcon('Film'),
        ImagePlus: createIcon('ImagePlus'),
        Wand2: createIcon('Wand2'),
        Sparkles: createIcon('Sparkles'),
        Monitor: createIcon('Monitor'),
        MonitorPlay: createIcon('MonitorPlay'),
        Smartphone: createIcon('Smartphone'),
        Tablet: createIcon('Tablet'),
        Maximize2: createIcon('Maximize2'),
        Play: createIcon('Play'),
        Pause: createIcon('Pause'),
        Square: createIcon('Square'),
        Settings: createIcon('Settings'),
        Sun: createIcon('Sun'),
        Moon: createIcon('Moon'),
        Layers: createIcon('Layers'),
        History: createIcon('History'),
        Trash2: createIcon('Trash2'),
        X: createIcon('X'),
        Plus: createIcon('Plus'),
        Minus: createIcon('Minus'),
        MousePointer2: createIcon('MousePointer2'),
        Rocket: createIcon('Rocket'),
        Upload: createIcon('Upload'),
        Download: createIcon('Download'),
        Palette: createIcon('Palette'),
        Layout: createIcon('Layout'),
        ChevronUp: createIcon('ChevronUp'),
        ArrowLeft: createIcon('ArrowLeft'),
        ChevronDown: createIcon('ChevronDown'),
        ChevronRight: createIcon('ChevronRight'),
        ArrowRight: createIcon('ArrowRight'),
        ArrowUp: createIcon('ArrowUp'),
        Copy: createIcon('Copy'),
        Loader2: createIcon('Loader2'),
        Eraser: createIcon('Eraser'),
        Check: createIcon('Check'),
        AlertCircle: createIcon('AlertCircle'),
        Info: createIcon('Info'),
        XCircle: createIcon('XCircle'),
        Users: createIcon('Users'),
        User: createIcon('User'),
        MessageSquare: createIcon('MessageSquare'),
        Bot: createIcon('Bot'),
        Search: createIcon('Search'),
        Save: createIcon('Save'),
        Folder: createIcon('Folder'),
        File: createIcon('File'),
        MoreVertical: createIcon('MoreVertical'),
        MoreHorizontal: createIcon('MoreHorizontal'),
        Eye: createIcon('Eye'),
        EyeOff: createIcon('EyeOff'),
        Settings2: createIcon('Settings2'),
        Sliders: createIcon('Sliders'),
        ExternalLink: createIcon('ExternalLink'),
        Images: createIcon('Images'),
        RefreshCw: createIcon('RefreshCw'),
        LayoutGrid: createIcon('LayoutGrid'),
        GalleryVertical: createIcon('GalleryVertical'),
        BookOpen: createIcon('BookOpen'),
        Bookmark: createIcon('Bookmark'),
        BookTemplate: createIcon('BookTemplate'),
        Heart: createIcon('Heart'),
        Zap: createIcon('Zap'),
        Award: createIcon('Award'),
        Tag: createIcon('Tag'),
        Star: createIcon('Star'),
        Lightbulb: createIcon('Lightbulb'),
        Beaker: createIcon('Beaker'),
        RotateCcw: createIcon('RotateCcw'),
        Move: createIcon('Move'),
        LogOut: createIcon('LogOut'),
    };

    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};
    window.MagnesComponents.UI.LucideIcons = LucideIcons;
    // Hamilton: 提前建立别名，确保顺序加载的 Node 脚本能立即读到 Icons
    window.MagnesComponents.UI.Icons = { ...LucideIcons };

    console.log('✅ Lucide Icons 加载成功');
})();
