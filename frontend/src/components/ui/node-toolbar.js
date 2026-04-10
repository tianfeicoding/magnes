/**
 * Node Toolbar Component Module (源码 - JSX 格式)
 * 节点工具栏组件
 * @module src/components/node-toolbar
 * @version 4.3.0
 * 
 * 注意: 此文件为开发源码,使用 JSX 语法
 * 编译后的版本位于: components-compiled/ui/node-toolbar.js
 */

(function () {
    'use strict';

    const { React } = window;

    // 确保命名空间存在
    if (!window.MagnesComponents) window.MagnesComponents = {};
    if (!window.MagnesComponents.UI) window.MagnesComponents.UI = {};

    /**
     * NodeToolbar 组件
     * 底部节点创建工具栏
     * @param {Object} props - 组件属性
     * @param {string} props.theme - 主题('dark' | 'light')
     */
    const NodeToolbar = ({ theme }) => {
        const {
            Type, Image, Film, Layers, Images,
            Clapperboard, GitCompare, MonitorPlay, Palette,
            Edit3, Bot, Layout, Sliders, Rocket, Plus
        } = window.MagnesComponents.UI.Icons;

        const onDragStart = (event, nodeType) => {
            event.dataTransfer.setData('application/reactflow', nodeType);
            event.dataTransfer.effectAllowed = 'move';
        };

        const tools = [
            { type: 'rednote-content', icon: Edit3, label: '内容输入', permission: 'public' },
            { type: 'input-image', icon: Image, label: '图片输入', permission: 'public' },
            { type: 'text-node', icon: Type, label: '文字节点', permission: 'public' },
            { type: 'separator', label: 'AI' },
            { type: 'refiner', icon: Bot, label: '视觉分析', permission: 'public' },
            { type: 'layer-split', icon: Layers, label: '图层切片', permission: 'public' },
            { type: 'composer', icon: Layout, label: '布局融合', permission: 'public' },
            { type: 'gen-image', icon: Palette, label: 'AI 绘图', permission: 'public' },
            { type: 'fine-tune', icon: Sliders, label: '精细编辑', permission: 'public' },
            { type: 'group-separator', label: '演示与发布', color: 'red' },
            { type: 'preview', icon: MonitorPlay, label: '预览窗口', permission: 'public' },
            { type: 'rednote-preview', icon: Rocket, label: '预览发布', permission: 'public' },
        ];

        return (
            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-2 py-2 rounded-2xl shadow-xl border flex items-center gap-1 z-50 transition-all duration-300 ${theme === 'dark' ? 'bg-[#18181b]/90 border-zinc-800 text-zinc-400' : 'bg-white/90 border-zinc-200 text-zinc-600'
                } backdrop-blur-md`}>
                {tools.map((tool, index) => (
                    tool.type === 'separator' ? (
                        <div key={`sep-${index}`} className="flex items-center gap-2 px-2">
                            <div className={`h-8 w-px ${theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300'}`}></div>
                            <span className={`text-[12px] font-bold ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{tool.label}</span>
                        </div>
                    ) : tool.type === 'group-separator' ? (
                        <div key={`group-sep-${index}`} className="flex items-center gap-2 px-2">
                            <div className={`h-8 w-px ${tool.color === 'red' ? 'bg-red-400' : 'bg-zinc-300'}`}></div>
                            <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${tool.color === 'red'
                                ? 'bg-red-50 border border-red-200'
                                : theme === 'dark' ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-100 border border-zinc-200'
                                }`}>
                                <span className="text-xs">📱</span>
                                <span className={`text-[12px] font-bold ${tool.color === 'red' ? 'text-red-600' : theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                    {tool.label}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div
                            key={tool.type}
                            className={`group relative p-3 rounded-xl cursor-grab active:cursor-grabbing hover:bg-blue-500/10 hover:text-blue-500 transition-all hover:scale-105`}
                            draggable
                            onDragStart={(e) => onDragStart(e, tool.type)}
                            title={tool.label}
                        >
                            <tool.icon size={22} strokeWidth={1.5} />
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-[12px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                {tool.label}
                            </span>
                        </div>
                    )
                ))}
            </div>
        );
    };

    window.MagnesComponents.UI.NodeToolbar = NodeToolbar;

    console.log('✅ NodeToolbar 组件已加载');
})();
