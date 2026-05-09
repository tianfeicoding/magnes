/**
 * PainterNode - 背景生成专家节点 (React Flow 版本)
 * 路径: src/nodes/rf/painter-node-rf.js
 */

(function () {
    const { React } = window;
    const { useState, useCallback } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Wand2, Loader2, Sparkles, Image: ImageIcon } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const PainterNode = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const [isProcessing, setIsProcessing] = useState(false);

        const updateData = useCallback((newData) => {
            setNodes((nds) =>
                nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node))
            );
        }, [id, setNodes]);

        const handleGenerate = async (e) => {
            e.stopPropagation();
            if (!data.user_prompt) return alert("请输入背景描述提示词！");

            setIsProcessing(true);
            updateData({ status: 'processing', background_url: null });

            try {
                const API = window.MagnesComponents?.Utils?.API;
                const response = await API.magnesFetch('/design', {
                    method: 'POST',
                    body: JSON.stringify({
                        thread_id: data.thread_id || `thread_${Date.now()}`,
                        instruction: "请按照描述生成一张排版专用的背景图",
                        user_prompt: data.user_prompt,
                        run_painter: true // Painter 节点被手动点击时，后端必须运行 Painter Node
                    })
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // 后端 Painter 执行后会将 background_url 存入 state
                    // 我们这里预留逻辑，具体的同步可能需要通过 Context 或共享 State
                    // 暂时假设 API 直接返回了结果
                }
            } catch (error) {
                console.error("Painter Linkage Error:", error);
            } finally {
                setIsProcessing(false);
                // 模拟结果 (演示用)
                // updateData({ status: 'completed', background_url: '...' });
            }
        };

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="背景生成 (Painter)"
                icon={Wand2}
                selected={selected}
                style={{ width: '320px' }}
                handles={{
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-3">
                    {/* 背景描述区域 */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold opacity-30 uppercase tracking-tighter">背景描述</span>
                            <div className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                <span className="text-[12px] font-bold opacity-50 uppercase tracking-tighter">NANO-BANANA 2 就绪</span>
                            </div>
                        </div>
                        <textarea
                            className="w-full h-24 bg-zinc-50 border border-black p-2 text-[12px] font-medium focus:border-black outline-none resize-none placeholder:opacity-40 leading-relaxed nodrag"
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="描述你想要的纯净背景 (如: Minimalist grey wall with soft shadow...)"
                            value={data.user_prompt || ''}
                            onChange={(e) => updateData({ user_prompt: e.target.value })}
                        />
                    </div>

                    {/* 操作按钮 */}
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={handleGenerate}
                        disabled={isProcessing || !data.user_prompt}
                        className={`w-full py-3 border border-black font-bold text-[12px] transition-all flex items-center justify-center gap-2 nodrag
                                   ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' :
                                !data.user_prompt ? 'bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`}
                    >
                        {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {isProcessing ? 'AI 正在绘制...' : '生成优化背景'}
                    </button>

                    {/* 结果预览区 */}
                    {data.background_url && (
                        <div className="mt-2 w-full aspect-video border border-black/10 bg-zinc-50 flex items-center justify-center overflow-hidden">
                            <img src={data.background_url} className="w-full h-full object-cover" alt="bg" />
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.PainterNodeRF = PainterNode;
    console.log('✅ PainterNodeRF (JSX) Registered');
})();
