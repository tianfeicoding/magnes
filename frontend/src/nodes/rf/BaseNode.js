/**
 * BaseNode - React Flow 基础节点组件
 * 统一为 JSX 语法并适配  UI 规范
 */

(function () {
    const { React } = window;
    const { useState, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const {
        Handle = window.ReactFlow?.Handle,
        Position = window.ReactFlow?.Position,
        NodeToolbar = window.ReactFlow?.NodeToolbar,
        useReactFlow = window.ReactFlow?.useReactFlow
    } = ReactFlow || {};

    if (!Handle || !NodeToolbar) {
        console.error("❌ BaseNode: ReactFlow Handle or NodeToolbar component 尚未加载！");
    }

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Copy, Trash2 } = Icons;

    const BaseNode = ({
        id, // React Flow 传入的节点 ID
        title,
        icon: IconComponent,
        selected,
        children,
        handles = {},
        style = {},
        headerExtra,
        unstyled = false,
        hideHeader = false
    }) => {
        const [showToolbar, setShowToolbar] = useState(false);
        const { removeNode, addNode } = (MAGNES.Context?.useMagnesContext && MAGNES.Context.useMagnesContext()) || {};
        const { getNode } = useReactFlow();

        // 当节点被取消选中时，关闭工具栏
        useEffect(() => {
            if (!selected) {
                setShowToolbar(false);
            }
        }, [selected]);
        // UI 规范样式：0px 圆角，单色边框
        const containerClass = unstyled
            ? "transition-all duration-200 flex flex-col"
            : `bg-white border border-black transition-all duration-200 flex flex-col ${selected ? '' : 'hover:border-black'}`;

        const finalStyle = { width: '320px', minHeight: 'auto', ...style };

        // Header 样式
        const headerClass = style.headerClass || 'bg-white text-black';

        if (!Handle) {
            console.warn(`[Magnes] Node ${id} skipping render: React Flow Handle component not found.`);
            return null;
        }

        return (
            <div
                className={containerClass}
                style={finalStyle}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setShowToolbar(true);
                }}
                onClick={(e) => {
                    // 支持 Ctrl+点击 呼出菜单 (适配 Mac Control 键)
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowToolbar(true);
                    } else if (showToolbar) {
                        setShowToolbar(false);
                    }
                }}
            >
                {/* 0. 手动实现受控工具栏 (代替漂移的 NodeToolbar) */}
                {showToolbar && (
                    <div
                        className="absolute left-1/2 -translate-x-1/2 flex items-center bg-white border border-black shadow-lg z-[100] nodrag"
                        style={{
                            top: '-8px',
                            transform: 'translateX(-50%) translateY(-100%)',
                            pointerEvents: 'auto'
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const NodeOps = window.MagnesComponents?.Utils?.NodeOperations;

                                // 优先使用桥接函数 (解决 React Flow 环境失效)
                                if (NodeOps?.duplicateNodeById) {
                                    NodeOps.duplicateNodeById(id);
                                } else if (getNode) {
                                    // 回退到 search by id + addNode (app.js 手绘 Canvas 环境)
                                    const currentNode = getNode(id);
                                    if (currentNode) {
                                        const NodeUtils = window.MagnesComponents?.Utils?.Node;
                                        const newNode = NodeUtils?.createNodeObject(
                                            currentNode.type,
                                            currentNode.position.x + 30,
                                            currentNode.position.y + 30,
                                            currentNode.data?.content,
                                            { w: currentNode.width, h: currentNode.height }
                                        );
                                        if (newNode && addNode) addNode(newNode);
                                    }
                                }
                                setShowToolbar(false);
                            }}
                            className="w-6 h-6 bg-white text-black hover:bg-zinc-100 transition-all border-r border-black flex items-center justify-center"
                            title="复制并克隆此节点"
                        >
                            {Copy ? <Copy size={14} strokeWidth={2} /> : '📋'}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const NodeOps = window.MagnesComponents?.Utils?.NodeOperations;

                                // 优先使用桥接函数
                                if (NodeOps?.deleteNodeById) {
                                    NodeOps.deleteNodeById(id);
                                } else if (removeNode) {
                                    // 回退到全局 Context 删除
                                    removeNode(id);
                                }
                                setShowToolbar(false);
                            }}
                            className="w-6 h-6 bg-white text-black hover:bg-zinc-100 transition-all flex items-center justify-center"
                            title="删除此节点"
                        >
                            {Trash2 ? <Trash2 size={14} strokeWidth={2} /> : '🗑️'}
                        </button>
                    </div>
                )}

                {/* 1. 标题栏 */}
                {!hideHeader && (
                    <div className={`flex items-center gap-2 px-3 py-2 border-b border-black ${headerClass}`}>
                        <div className="flex items-center justify-center w-5 h-5">
                            {IconComponent ? <IconComponent size={14} /> : '📦'}
                        </div>
                        <span className="font-bold text-[12px] mono-header-text tracking-wider flex-1">
                            {title}
                        </span>
                        {headerExtra || style.headerExtra || (
                            <button
                                className="flex items-center gap-[2px] opacity-40 hover:opacity-100 transition-all p-1 -mr-1 nodrag"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowToolbar(!showToolbar);
                                }}
                                title="更多操作"
                            >
                                {[1, 2, 3].map(i => <div key={i} className="w-[3px] h-[3px] bg-black"></div>)}
                            </button>
                        )}
                    </div>
                )}

                {/* 2. 内容区域 */}
                <div className={`${unstyled ? 'p-0' : 'p-2'} flex-1 overflow-hidden flex flex-col`}>
                    {children}
                </div>

                {/* 3. 输入 Handles (Target) - 左侧空心正方形 */}
                {handles.target && handles.target.map((h, idx) => (
                    <Handle
                        key={`target-${idx}`}
                        type="target"
                        position={Position.Left}
                        id={h.id}
                        className="!w-3 !h-3 !rounded-none !bg-white !border !border-black hover:!scale-110 transition-transform"
                        style={{ top: h.top }}
                    />
                ))}

                {/* 4. 输出 Handles (Source) - 右侧空心正方形 */}
                {handles.source && handles.source.map((h, idx) => (
                    <Handle
                        key={`source-${idx}`}
                        type="source"
                        position={Position.Right}
                        id={h.id}
                        className="!w-3 !h-3 !rounded-none !bg-white !border !border-black hover:!scale-110 transition-transform"
                        style={{ top: h.top }}
                    />
                ))}
            </div>
        );
    };

    // 注册到全局
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.BaseNode = BaseNode;

    console.log('✅ BaseNode (JSX) 已加载');
})();
