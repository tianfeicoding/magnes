/**
 * RednoteContentNodeRF - React Flow 封装版本 (JSX)
 * 路径: src/nodes/rf/rednote-content-rf.js
 */

(function () {
    const { React } = window;
    const { useCallback } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    // 依赖项
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Edit3, Plus } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const RednoteContentNodeRF = ({ id, data, selected, xPos, yPos }) => {
        const { setNodes, setEdges } = useReactFlow();
        const [isBulkMode, setIsBulkMode] = React.useState(data?.initialBulkMode !== undefined ? data.initialBulkMode : true);

        // --- 快捷创建并连接图文模版节点 ---
        const handleAddTemplate = (e) => {
            e.stopPropagation();

            const newNodeId = `image-text-template-auto-${Date.now()}`;
            const newNode = {
                id: newNodeId,
                type: 'image-text-template',
                position: { x: xPos + 400, y: yPos }, // 在右侧 400px 处生成
                data: {
                    label: '图文模版'
                }
            };

            const newEdge = {
                id: `edge-${id}-to-${newNodeId}`,
                source: id,
                target: newNodeId,
                sourceHandle: 'output',
                targetHandle: 'input' // ImageTextTemplateNode 默认处理所有输入
            };

            setNodes(nds => [...nds, newNode]);
            setEdges(eds => [...eds, newEdge]);

            console.log(`[Magnes] Auto-created ImageTextTemplateNode ${newNodeId} and connected.`);
        };

        // 懒加载业务组件 (由 rednote-modules-new.js 加载)
        const ContentNode = window.RednoteContentNode ||
            (window.RednoteComponents && window.RednoteComponents.RednoteContentNode);

        const MagicIcon = UI.Icons?.Sparkles || UI.Icons?.Wand2 || (() => null);

        // 适配 RednoteContentNode 的 updateNodeData 回调
        const handleUpdate = useCallback((newData) => {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === id) {
                        return {
                            ...node,
                            data: { ...node.data, ...newData },
                        };
                    }
                    return node;
                })
            );
        }, [id, setNodes]);

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="内容输入"
                icon={Edit3}
                selected={selected}
                style={{ width: '320px', minHeight: '520px' }}
                headerExtra={
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsBulkMode(!isBulkMode); }}
                        className={`flex items-center gap-1 px-2 py-0.5 text-[12px] font-black transition-all
                            ${isBulkMode ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white'}`}
                    >
                        <MagicIcon size={10} />
                        {isBulkMode ? '退出批量' : '批量模式'}
                    </button>
                }
                handles={{
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                {/* 快捷扩展按钮 "+" */}
                <div
                    className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 group/plus"
                    style={{ pointerEvents: 'none' }}
                >
                    <button
                        onClick={handleAddTemplate}
                        className="w-6 h-6 bg-black border border-white/20 rounded-full flex items-center justify-center text-white 
                                   hover:scale-110 active:scale-95 transition-all cursor-pointer pointer-events-auto"
                        title="快捷添加并连接图文模版节点"
                    >
                        <Plus size={14} strokeWidth={3} />
                    </button>
                </div>
                {ContentNode ? (
                    <ContentNode
                        node={{ data }}
                        isSelected={selected}
                        updateNodeData={handleUpdate}
                        isInBulkMode={isBulkMode}
                        setIsBulkMode={setIsBulkMode}
                    />
                ) : (
                    <div className="p-4 text-slate-400 text-xs animate-pulse flex flex-col items-center gap-2">
                        <div className="w-4 h-4 border border-slate-200 border-t-slate-400 animate-spin rounded-full"></div>
                        正在加载小红书组件...
                    </div>
                )}
            </BaseNode>
        );
    };

    // 注册到全局
    window.MagnesComponents.Nodes.RednoteContentNodeRF = RednoteContentNodeRF;
    console.log('✅ RednoteContentNodeRF (JSX) Registered');
})();
