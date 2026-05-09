/**
 * TextNode - React Flow 版本 (JSX)
 * 路径: src/nodes/rf/text-node-rf.js
 */

(function () {
    const { React } = window;
    const { useCallback, useRef, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    // 依赖
    const MAGNES = window.MagnesComponents || {};
    const Icons = MAGNES.UI?.Icons || {};
    const { Type } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const TextNode = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const textRef = useRef(data.settings?.text || data.content || '');

        const updateData = useCallback((text) => {
            setNodes((nds) =>
                nds.map((node) => (node.id === id ? {
                    ...node,
                    data: {
                        ...node.data,
                        content: text,
                        settings: { ...node.data.settings, text }
                    }
                } : node))
            );
        }, [id, setNodes]);

        // 同步外部传入的数据
        useEffect(() => {
            const currentText = data.settings?.text || data.content || '';
            if (currentText !== textRef.current) {
                textRef.current = currentText;
            }
        }, [data.settings?.text, data.content]);

        if (!BaseNode) return <div className="p-4 bg-red-500 text-white">Error: BaseNode Missing</div>;

        return (
            <BaseNode
                id={id}
                title="文字节点"
                icon={Type}
                selected={selected}
                style={{ width: '320px', height: 'auto' }}
                handles={{
                    target: [{ id: 'in', top: '50%' }],
                    source: [{ id: 'out', top: '50%' }]
                }}
            >
                <div className="flex-1 flex flex-col h-full nodrag aspect-square">
                    <textarea
                        ref={textRef}
                        defaultValue={textRef.current}
                        className="w-full flex-1 bg-white border border-black p-3 text-[13px] outline-none resize-none leading-relaxed font-mono focus:bg-zinc-50 transition-colors"
                        placeholder="在此输入文本内容..."
                        onChange={(e) => { textRef.current = e.target.value; }}
                        onBlur={() => updateData(textRef.current)}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.TextNode = TextNode;
    console.log('✅ TextNode (JSX) Registered with Magnes UI Spec');
})();
