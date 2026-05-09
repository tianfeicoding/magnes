/**
 * RednotePreviewNodeRF - React Flow 封装版本 (JSX)
 * 路径: src/nodes/rf/rednote-preview-rf.js
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
    const { Eye } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const RednotePreviewNodeRF = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const edges = useEdges();
        const nodes = useNodes();

        // 懒加载业务组件
        const PreviewNode = window.RednotePreviewNode ||
            (window.RednoteComponents && window.RednoteComponents.RednotePreviewNode);

        // 1. 获取上游连接的 Layout 数据
        const connectedLayoutData = useMemo(() => {
            const edge = edges.find(e => e.target === id);
            if (!edge) return null;
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data || null;
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
                title="预览发布"
                icon={Eye}
                isSelected={selected}
                hideHeader={true}
                unstyled={true}
                handles={{
                    target: [{ id: 'layout', top: '50%' }]
                }}
            >
                <div className="p-0 border-0 bg-transparent flex items-center justify-center overflow-visible" style={{ width: 252, height: 522 }}>
                    {PreviewNode ? (
                        <PreviewNode
                            node={{ data }}
                            isSelected={selected}
                            connectedLayoutData={connectedLayoutData}
                        />
                    ) : (
                        <div className="p-4 text-slate-400 text-xs animate-pulse flex flex-col items-center gap-2">
                            <div className="w-4 h-4 border border-slate-200 border-t-slate-400 animate-spin rounded-full"></div>
                            正在加载预览组件...
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    // 注册到全局
    window.MagnesComponents.Nodes.RednotePreviewNodeRF = RednotePreviewNodeRF;
    console.log('✅ RednotePreviewNodeRF (JSX) Registered');
})();
