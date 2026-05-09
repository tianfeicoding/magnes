/**
 * RednoteStyleLabNodeRF - React Flow 封装版本 (JSX)
 * 路径: src/nodes/rf/rednote-stylelab-rf.js
 */

(function () {
    const { React } = window;
    const { useMemo, useCallback } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow, useEdges, useNodes } = ReactFlow;

    // 依赖项
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Layout } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const RednoteStyleLabNodeRF = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const edges = useEdges();
        const nodes = useNodes();

        // 懒加载业务组件
        const StyleLabNode = window.RednoteLayoutNodeV2 ||
            (window.RednoteComponents && window.RednoteComponents.RednoteLayoutNode);

        // 1. 获取上游连接的数据
        const connectedImages = useMemo(() => {
            return edges
                .filter(e => e.target === id && e.targetHandle === 'image')
                .map(e => {
                    const sourceNode = nodes.find(n => n.id === e.source);
                    return sourceNode?.data?.content || sourceNode?.data?.images || [];
                })
                .flat()
                .filter(Boolean);
        }, [edges, nodes, id]);

        const connectedText = useMemo(() => {
            const edge = edges.find(e => e.target === id && e.targetHandle === 'text');
            if (!edge) return {};
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data || {};
        }, [edges, nodes, id]);

        // 适配回调
        const handleUpdate = useCallback((newData) => {
            setNodes((nds) =>
                nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node))
            );
        }, [id, setNodes]);

        if (!BaseNode) return null;

        return (
            <BaseNode
                title="风格实验室"
                icon={Layout}
                selected={selected}
                style={{
                    width: '320px', height: 'auto', minHeight: 'auto',
                    headerExtra: (
                        <button
                            onClick={(e) => { e.stopPropagation(); /* 逻辑由内部处理 */ }}
                            className="text-[12px] font-bold text-black underline underline-offset-2"
                        >
                            重置
                        </button>
                    )
                }}
                handles={{
                    target: [
                        { id: 'image', top: '30%' },
                        { id: 'text', top: '70%' }
                    ],
                    source: [{ id: 'layout', top: '50%' }]
                }}
            >
                {StyleLabNode ? (
                    <StyleLabNode
                        node={{ data }}
                        isSelected={selected}
                        connectedImages={connectedImages}
                        connectedText={connectedText}
                        updateNodeData={handleUpdate}
                        hideHeader={true}
                    />
                ) : (
                    <div className="p-4 text-slate-400 text-xs animate-pulse flex flex-col items-center gap-2">
                        <div className="w-4 h-4 border border-slate-200 border-t-slate-400 animate-spin rounded-full"></div>
                        正在加载风格实验室...
                    </div>
                )}
            </BaseNode>
        );
    };

    // 注册到全局
    window.MagnesComponents.Nodes.RednoteStyleLabNodeRF = RednoteStyleLabNodeRF;
    console.log('✅ RednoteStyleLabNodeRF (JSX) Registered');
})();
