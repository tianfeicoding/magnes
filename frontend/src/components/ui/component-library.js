/**
 * Component Library Panel -  左侧组件库
 * UI规范：180px宽度、精度单色风格
 * 统一为 JSX 语法
 */

(function () {
    const { React } = window;

    // 获取命名空间下的组件
    const getMagnesUI = () => window.MagnesComponents?.UI || {};
    const getIcons = () => {
        const UI = getMagnesUI();
        return UI.LucideIcons || UI.Icons || {};
    };

    /**
     * 图标渲染器
     */
    const IconRenderer = ({ icon: IconComponent, fallback, size = 16 }) => {
        if (IconComponent) return <IconComponent size={size} />;
        return <span className="text-[12px]">{fallback}</span>;
    };

    const nodeLibrary = [
        {
            category: '输入与采集',
            nodes: [
                { type: 'rednote-content', label: '内容输入', icon: 'Edit3', fallback: 'TXT' },
                { type: 'input-image', label: '图片输入', icon: 'Image', fallback: 'IMG' }
                // { type: 'text-node', label: '文字节点', icon: 'FileText', fallback: 'T' }
            ]
        },
        {
            category: 'AI 智能处理',
            nodes: [
                { type: 'layout-analyzer', label: '排版分析', icon: 'Maximize2', fallback: 'LAY' },
                { type: 'style-analyzer', label: '风格分析', icon: 'Palette', fallback: 'STL' },
                { type: 'layer-split', label: '图层切片', icon: 'Layers', fallback: 'SLIT' },
                { type: 'composer', label: '布局融合', icon: 'Layout', fallback: 'COMP' },
                { type: 'image-text-template', label: '图文模版', icon: 'Layout', fallback: 'TMP' },
                { type: 'mask-fill', label: '遮罩合成', icon: 'Scissors', fallback: 'MASK' }
            ]
        },
        {
            category: '生成与创作',
            nodes: [
                { type: 'gen-image', label: 'AI 绘图', icon: 'Wand2', fallback: 'AI' },
                { type: 'fine-tune', label: '精细编辑', icon: 'Sliders', fallback: 'EDIT' }
            ]
        },
        {
            category: '预览与展示',
            nodes: [
                { type: 'preview', label: '预览窗口', icon: 'MonitorPlay', fallback: 'OUT' }
                // { type: 'rednote-preview', label: '预览发布', icon: 'MonitorPlay', fallback: 'PUB' }
            ]
        }
    ];

    const NodeCard = ({ node, onDragStart, isFirst, isLast }) => {
        const Icons = getIcons();
        const IconComponent = Icons[node.icon];

        return (
            <div
                draggable={true}
                onDragStart={(e) => onDragStart(e, node.type)}
                className={`w-full px-4 py-3 bg-white border-l border-r border-black cursor-grab 
                           hover:bg-black hover:text-white transition-all active:cursor-grabbing group
                           ${isFirst ? 'border-t' : ''} 
                           border-b overflow-hidden`}
            >
                <div className="flex items-center gap-4">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 group-hover:text-white">
                        <IconRenderer icon={IconComponent} fallback={node.fallback} />
                    </div>
                    <span className="text-[12px] font-bold flex-1 leading-none uppercase tracking-widest">
                        {node.label}
                    </span>
                </div>
            </div>
        );
    };

    const ComponentLibrary = ({ theme, onNodeDragStart }) => {
        return (
            <div className={`w-[180px] bg-white border-r border-black h-full overflow-y-auto p-4 flex flex-col shrink-0
                           ${theme === 'dark' ? 'dark:bg-black dark:border-white' : ''}`}>
                {false && (
                    <div className="mb-8">
                        <h2 className={`text-xl font-bold uppercase tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-black'}`}>
                            组件库
                        </h2>
                    </div>
                )}

                <div className="flex-1">
                    {nodeLibrary.map((category, idx) => (
                        <div key={idx} className="mb-8">
                            <h3 className="text-[12px] font-bold text-black/60 uppercase tracking-widest px-1 pb-2">
                                {category.category}
                            </h3>
                            <div className="flex flex-col">
                                {category.nodes.map((node, nodeIdx) => (
                                    <NodeCard
                                        key={nodeIdx}
                                        node={node}
                                        isFirst={nodeIdx === 0}
                                        isLast={nodeIdx === category.nodes.length - 1}
                                        onDragStart={onNodeDragStart}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // 注册到全局
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};
    window.MagnesComponents.UI.ComponentLibrary = ComponentLibrary;

    console.log('[ComponentLibrary] Loaded');
})();
