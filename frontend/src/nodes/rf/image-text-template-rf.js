/**
 * ImageTextTemplateNodeRF - 图文模版节点 (React Flow 版本)
 * 路径: src/nodes/rf/image-text-template-rf.js
 * 
 * 职责：
 * 1. 展示用户收藏的模版列表 (来自 localStorage.rednote_saved_styles)。
 * 2. 接收来自 RednoteContentNode 的图文输入。
 * 3. 将输入内容注入到所选模版的图层协议中，输出至精细编辑节点。
 */

(function () {
    const { React } = window;
    const { useState, useMemo, useCallback, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useEdges, useNodes, useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Layout, Check, BookTemplate, Layers, Trash2, Plus } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const ImageTextTemplateNodeRF = ({ id, data, selected, xPos, yPos }) => {
        const { setNodes, setEdges } = useReactFlow();
        const edges = useEdges();
        const nodes = useNodes();

        // --- 新增：快捷创建并连接微调节点 ---
        const handleAddFineTune = (e) => {
            e.stopPropagation();

            const newNodeId = `fine-tune-auto-${Date.now()}`;
            const newNode = {
                id: newNodeId,
                type: 'fine-tune',
                position: { x: xPos + 400, y: yPos }, // 在右侧 400px 处生成
                data: {
                    content: data.content,
                    isDirty: false
                }
            };

            const newEdge = {
                id: `edge-${id}-to-${newNodeId}`,
                source: id,
                target: newNodeId,
                sourceHandle: 'output',
                targetHandle: 'input' // FineTuneNode 默认处理所有输入
            };

            setNodes(nds => [...nds, newNode]);
            setEdges(eds => [...eds, newEdge]);

            console.log(`[Magnes] Auto-created FineTuneNode ${newNodeId} and connected.`);
        };

        // 1. 状态管理 (改为从后端获取)
        const [savedStyles, setSavedStyles] = useState([]);
        const [isLoading, setIsLoading] = useState(false);
        const { Constants } = window.MagnesComponents.Utils || {};
        const backendBaseUrl = Constants?.MAGNES_API_URL || (window.location.protocol === 'file:' ? 'http://localhost:8088/api/v1' : '/api/v1');

        const fetchTemplates = useCallback(async () => {
            setIsLoading(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                if (!API?.magnesFetch) {
                    throw new Error('API.magnesFetch not found');
                }
                const res = await API.magnesFetch('/templates');
                const data = await res.json();
                setSavedStyles(data);
            } catch (err) {
                console.error('[TemplateNode] Failed to fetch templates:', err);
            } finally {
                setIsLoading(false);
            }
        }, []);

        useEffect(() => {
            fetchTemplates();
        }, [fetchTemplates]);

        const selectedStyleId = data.selectedStyleId || null;

        // 2. 获取上游输入数据 (RednoteContentNode)
        const inputData = useMemo(() => {
            const edge = edges.find(e => e.target === id && e.targetHandle === 'input');
            if (!edge) return null;
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data || null;
        }, [edges, nodes, id]);

        // 3. 模版应用逻辑：合并输入内容与模版图层
        const applyTemplate = useCallback((style) => {
            if (!style || !style.layout) return;

            const mapContentToLayers = window.MagnesComponents?.Utils?.Layout?.mapContentToLayers;
            if (!mapContentToLayers) {
                console.warn('[TemplateNode] LayoutUtils.mapContentToLayers not found, using raw layout.');
                return;
            }

            // 检查应用模版时的输入数据
            console.log('[TemplateNode] Applying style:', style.name, 'with inputData:', inputData);

            // 使用通用工具函数进行语义填充
            const finalLayers = mapContentToLayers(style.layout, inputData);

            console.log(`[Magnes Pulse: Node 2 Mapping] Applied "${style.name}", inputTitle="${inputData?.items?.[0]?.title}"`, {
                layerCount: finalLayers?.length,
                inputItems: inputData?.items?.length
            });

            // 更新当前节点状态及输出
            setNodes((nds) => nds.map((node) => {
                if (node.id === id) {
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            selectedStyleId: style.id,
                            content: { layers: finalLayers }, // 核心输出：供 FineTuneNode 使用
                            rawData: inputData, // 透传原数据以支持分页和重绘
                            lastUpdated: Date.now() // 注入实时同步脉冲
                        }
                    };
                }
                return node;
            }));
        }, [id, inputData, setNodes]);

        // 4. 自动监听输入变化并重绘
        useEffect(() => {
            if (selectedStyleId && inputData) {
                const currentStyle = savedStyles.find(s => s.id === selectedStyleId);
                if (currentStyle) {
                    applyTemplate(currentStyle);
                }
            }
        }, [inputData, selectedStyleId, savedStyles]); // 去掉 applyTemplate 避免循环，或确保其 stable

        // 4. UI 交互
        const removeStyle = async (e, styleId) => {
            e.stopPropagation();
            if (!confirm('确定彻底删除此模版吗？')) return;

            try {
                const API = window.MagnesComponents?.Utils?.API;
                const res = await API.magnesFetch(`/templates/${styleId}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    fetchTemplates(); // 重新加载
                }
            } catch (err) {
                console.error('[TemplateNode] Delete failed:', err);
            }
        };

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="图文模版"
                icon={BookTemplate || Layout}
                selected={selected}
                style={{ width: '320px', minHeight: 'auto' }}
                handles={{
                    target: [{ id: 'input', top: '50%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                {/* 快捷扩展按钮 "+" */}
                <div
                    className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 group/plus"
                    style={{ pointerEvents: 'none' }}
                >
                    <button
                        onClick={handleAddFineTune}
                        className="w-6 h-6 bg-black border border-white/20 rounded-full flex items-center justify-center text-white 
                                   hover:scale-110 active:scale-95 transition-all cursor-pointer pointer-events-auto"
                        title="快捷添加并连接精细编辑节点"
                    >
                        <Plus size={14} strokeWidth={3} />
                    </button>
                </div>

                <div className="flex flex-col gap-4">
                    {/* 状态指示器隐藏 */}
                    {/* <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            {inputData ? '✅ 已连接图文输入' : '⚠️ 等待输入连接'}
                        </span>
                    </div> */}

                    {/* 模版列表列表 */}
                    <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                        {savedStyles.length > 0 ? (
                            savedStyles.map((style) => (
                                <div
                                    key={style.id}
                                    onClick={() => applyTemplate(style)}
                                    className={`p-3 border transition-all cursor-pointer group relative
                                        ${selectedStyleId === style.id
                                            ? 'border-black bg-zinc-50'
                                            : 'border-black hover:bg-zinc-50'}`}
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] font-black truncate max-w-[180px]">
                                                {style.name}
                                            </span>
                                            {selectedStyleId === style.id && <Check size={14} className="text-black" />}
                                        </div>
                                        {/* 隐藏 Refined 那一行 */}
                                        {/* <div className="flex items-center gap-2">
                                            <div className="flex -space-x-[1px]">
                                                {Object.values(style.atoms?.palette || {}).slice(0, 3).map((c, i) => (
                                                    <div key={i} className="w-3 h-3 border border-black/20" style={{ backgroundColor: c }}></div>
                                                ))}
                                            </div>
                                            <span className="text-[9px] font-bold text-zinc-400 uppercase">
                                                {style.metadata?.source === 'fine-tune-node' ? 'Refined' : 'Preset'}
                                            </span>
                                        </div> */}
                                    </div>

                                    {/* 悬浮删除 */}
                                    <button
                                        onClick={(e) => removeStyle(e, style.id)}
                                        className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-600"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center border border-black gap-2 opacity-30">
                                <Layers size={24} />
                                <span className="text-[10px] font-black uppercase tracking-widest">暂无收藏模版</span>
                            </div>
                        )}
                    </div>

                    {/* 底部提示 */}
                    {selectedStyleId && (
                        <div className="bg-black py-2 text-center">
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">模版已应用 - 请查看精细编辑节点</span>
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    // 注册到全局
    window.MagnesComponents.Nodes.ImageTextTemplateNodeRF = ImageTextTemplateNodeRF;
    console.log('✅ ImageTextTemplateNodeRF Loaded');
})();
