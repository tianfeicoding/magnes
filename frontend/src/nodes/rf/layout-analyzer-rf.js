/**
 * LayoutAnalyzerNode - 排版分析专家节点 (React Flow 版本)
 * 路径: src/nodes/rf/layout-analyzer-rf.js
 *
 * 职责：
 * 1. 展示来自后端 Layout Analyzer 的排版分析成果。
 * 2. 提取图层坐标和语义信息。
 */

(function () {
    const { React } = window;
    const { useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useEdges, useNodes } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || UI.LucideIcons || {};
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const LayoutAnalyzerNode = ({ id, data, selected, nodesMap, connections: studioConnections }) => {
        const { Bot, Maximize2: Scan, Sparkles, Loader2 } = Icons;
        // 兼容性获取：优先使用 props (MagnesStudio)，其次使用 hooks (React Flow)
        const rfNodes = (window.ReactFlow?.useNodes && window.ReactFlow.useNodes()) || [];
        const rfEdges = (window.ReactFlow?.useEdges && window.ReactFlow.useEdges()) || [];

        // 获取全局 Context 触发器
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ startGeneration: () => { }, apiConfigs: [] }) };
        const { startGeneration, apiConfigs = [] } = useMagnesContext();

        const isProcessing = data.isGenerating;

        // 监听数据接收
        // 监听数据接收
        React.useEffect(() => {
            // 静默监控
        }, [data, id]);

        // 查找上游传进来的数据
        const sourceImageUrl = useMemo(() => {
            const nodes = nodesMap ? Array.from(nodesMap.values()) : rfNodes;
            const edges = studioConnections ? studioConnections.map(c => ({ source: c.from, target: c.to })) : rfEdges;

            const edge = edges.find(e => e.target === id);
            if (!edge) return null;
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data?.content || sourceNode?.data?.image_url || null;
        }, [id, nodesMap, studioConnections, rfNodes, rfEdges]);

        const handleAnalyze = (e) => {
            e.stopPropagation();
            if (!sourceImageUrl) return;

            const visionModel = apiConfigs.find(c => c.id === 'gemini-3-pro') || { id: 'gemini-3-pro' };

            // 强制解耦前端静态提示词
            const fullPrompt = null;


            startGeneration({
                prompt: fullPrompt,
                type: 'layout_analyze',
                sourceImages: [sourceImageUrl],
                nodeId: id,
                options: {
                    model: visionModel.modelName || visionModel.id,
                    conversationId: data.settings?.conversationId,
                },
                apiConfigs,
                callbacks: {
                    onNodeUpdate: (nodeId, updateData) => {

                        if (updateData.layoutData && !updateData.isGenerating) {
                            const layers = updateData.layoutData.layers || [];

                        }
                    }
                }
            });
        };

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="排版分析"
                icon={Bot}
                selected={selected}
                style={{ width: '320px' }}
                handles={{
                    target: [{ id: 'input', top: '50%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-4">
                    {/* 1. 状态指示器 */}
                    <div className="flex items-center justify-between border-b border-black/10 pb-2">
                        <span className="text-[11px] font-bold text-black uppercase">排版分析状态</span>
                        {isProcessing ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-black rounded-full animate-pulse"></span>
                                <span className="text-[12px] font-black text-black uppercase">分析中...</span>
                            </div>
                        ) : (data.layoutData?.layers?.length > 0 || data.content) ? (
                            <div className="flex items-center gap-1">
                                {Sparkles && <Sparkles size={14} className="text-black" />}
                                <span className="text-[12px] font-black text-black uppercase">分析完成</span>
                            </div>
                        ) : (
                            <span className="text-[12px] font-bold text-black/40 uppercase">等待资产</span>
                        )}
                    </div>

                    {/* 2. 重点信息分组展示 */}
                    {(() => {
                        // 简单的 JSON 修复和解析
                        const robustParse = (str) => {
                            const tryParse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
                            let result = tryParse(str);
                            if (result) return result;
                            // 修复属性名前的空格/引号问题
                            let repaired = str.replace(/" "(\w+)"/g, '"$1"');
                            result = tryParse(repaired);
                            if (result) return result;
                            // 处理截断
                            const lastBrace = repaired.lastIndexOf('}');
                            if (lastBrace > 0) {
                                result = tryParse(repaired.substring(0, lastBrace + 1));
                                if (result) return result;
                            }
                            return null;
                        };

                        // 从 content 中解析 extractedContent
                        let items = [];
                        try {
                            const content = data.content || '';
                            // 提取 markdown 代码块
                            const mdMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                            const jsonStr = mdMatch ? mdMatch[1].trim() : content;
                            const parsed = robustParse(jsonStr);
                            items = parsed?.extractedContent?.items || [];
                        } catch (e) {
                            // 解析失败
                        }

                        if (items.length === 0) return null;

                        // 角色标签映射
                        const ROLE_LABELS = {
                            title: '标题',
                            venue: '地点',
                            date: '日期',
                            price: '价格',
                            description: '描述',
                            highlights: '亮点',
                            time_indicator: '时间',
                            other: '其他'
                        };

                        // 要显示的字段
                        const FIELDS = ['title', 'venue', 'date', 'price', 'description', 'highlights'];

                        return (
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-black/40">
                                    重点信息 ({items.length} 组)
                                </span>
                                <div className="flex flex-col border border-black max-h-[300px] overflow-y-auto custom-scrollbar">
                                    {items.map((item, idx) => {
                                        // 收集该 item 的所有非空字段
                                        const content = [];
                                        FIELDS.forEach(field => {
                                            const val = item[field];
                                            if (val && String(val).trim()) {
                                                content.push({ field, value: String(val).trim() });
                                            }
                                        });

                                        if (content.length === 0) return null;

                                        return (
                                            <div key={idx} className="flex flex-col border-b border-black last:border-b-0">
                                                <div className="flex items-center px-2 py-1 bg-zinc-50 border-b border-black/10">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-black/60">
                                                        {items.length > 1 ? `活动 ${idx + 1}` : '重点内容'}
                                                    </span>
                                                </div>
                                                <div className="p-3 flex flex-col gap-2.5">
                                                    {content.map(({ field, value }) => (
                                                        <div key={field} className="flex gap-2.5 text-[12px] leading-snug">
                                                            <span className="font-bold text-black/40 shrink-0 min-w-[50px]">
                                                                {ROLE_LABELS[field] || field}
                                                            </span>
                                                            <span className="text-black font-bold break-words">
                                                                {value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {!data.layoutData?.layers?.length && !isProcessing && (
                        <div className="py-10 flex flex-col items-center justify-center border border-black gap-3 text-zinc-500">
                            {Scan && <Scan size={30} strokeWidth={1} />}
                            <span className="text-[12px] font-black uppercase tracking-widest text-center px-6 leading-relaxed">
                                请将图片连入此节点进行排版分析
                            </span>
                        </div>
                    )}

                    {/* 3. 执行按钮 */}
                    <div className="pt-1">
                        <button
                            onClick={handleAnalyze}
                            disabled={isProcessing || !sourceImageUrl}
                            className={`w-full py-2.5 mt-1 border border-black font-black text-[12px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest nodrag
                                   ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' :
                                    !sourceImageUrl ? 'bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`}
                        >
                            {isProcessing ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                Bot && <Bot size={14} />
                            )}
                            {isProcessing ? '分析中' : '启动排版分析'}
                        </button>
                    </div>
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.LayoutAnalyzerNode = LayoutAnalyzerNode;
    console.log('✅ LayoutAnalyzerNode Loaded');
})();
