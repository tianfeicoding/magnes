/**
 * ComposerNode - 布局融合专家节点 (React Flow 版本)
 * 路径: src/nodes/rf/composer-node-rf.js
 * 
 * 职责：
 * 1. 接收来自 Refiner 的坐标和来自 Painter 的背景。
 * 2. 汇聚物理图层素材。
 * 3. 产出可供 Preview 和 Fine-tune 使用的全量协议。
 */

(function () {
    const { React } = window;
    const { useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useEdges, useNodes, useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Layout, GitMerge, Check, Layers: Box, Plus, Image: ImageIcon } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const ComposerNode = ({ id, data, selected, nodesMap, connections: studioConnections }) => {
        const { setNodes, setEdges, getNode } = useReactFlow();

        // 日志降噪锁：记录上一次关键日志的指纹
        const lastLogFingerprintRef = React.useRef(null);
        // 获取全局 Context 操作

        // 兼容性获取：优先使用 props (MagnesStudio)，其次使用 hooks (React Flow)
        const rfNodes = (window.ReactFlow?.useNodes && window.ReactFlow.useNodes()) || [];
        const rfEdges = (window.ReactFlow?.useEdges && window.ReactFlow.useEdges()) || [];

        // 监控依赖变化
        React.useEffect(() => {
            // 静默监控
        }, [id, nodesMap, studioConnections, rfNodes, rfEdges]);

        // 汇集来自不同上游的数据
        const compositeData = useMemo(() => {
            
            // 归一化 nodes 和 edges 数据源
            const nodes = nodesMap ? Array.from(nodesMap.values()) : rfNodes;
            const edges = studioConnections ? studioConnections.map(c => ({ source: c.from, target: c.to, id: c.id })) : rfEdges;

            const connectedEdges = edges.filter(e => e.target === id);
            

            const allLayers = [];
            const results = {
                hasBackground: false,
                hasCoordinates: false,
                hasAssets: false,
                finalSchema: null
            };

            connectedEdges.forEach(edge => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                
                if (!sourceNode) return;

                const nodeData = sourceNode.data || {};

                // 1. 物理资产源: 仅限 AI 视觉排版 (layer-split)
                if (sourceNode.type === 'layer-split') {
                    results.hasAssets = true;
                    // 同步物理图层，并尊重隐藏状态 + 强制类型过滤 (仅图片)
                    if (nodeData.layers) {
                        const hiddenIdx = nodeData.hiddenLayers || [];
                        const visibleLayers = nodeData.layers
                            .map((l, idx) => ({ ...l, originalIdx: idx }))
                            .filter((l, idx) => !hiddenIdx.includes(idx) && (l.type === 'image' || !l.type));
                        allLayers.push(...visibleLayers);
                    }
                }

                // 2. 视觉语义源: 支持 视觉分析(refiner) 和 排版分析(layout-analyzer)
                if (sourceNode.type === 'refiner' || sourceNode.type === 'layout-analyzer') {
                    results.hasCoordinates = true;
                    //放行图层限制：不再仅提取文字，同时放行 placeholder_image 和 background 占位层
                    if (nodeData.layoutData?.layers) {
                        const refinedLayers = nodeData.layoutData.layers.filter(l =>
                            l.type === 'text' ||
                            l.type === 'placeholder_image' ||
                            l.type === 'background' ||
                            l.role?.includes('placeholder')
                        );
                        allLayers.push(...refinedLayers.map(l => ({
                            ...l,
                            isLayoutAnalyst: sourceNode.type === 'layout-analyzer'
                        })));
                    }
                }

                // 3. 背景源 (注入为图层)
                if (sourceNode.type === 'gen-image' || sourceNode.type === 'input-image') {
                    results.hasBackground = true;
                    if (nodeData.content) {
                        allLayers.push({
                            id: `bg_${sourceNode.id}`,
                            type: 'image',
                            url: nodeData.content,
                            z_index: 0, // 强制背景置底
                            role: 'background'
                        });
                    }
                }
            });

            if (allLayers.length > 0) {
                const LayoutUtils = window.MagnesComponents?.Utils?.Layout;
                let processedLayers = allLayers;
                if (LayoutUtils) {
                    // 确保合并逻辑不破坏 groupId 路由
                    processedLayers = LayoutUtils.mergeTextLayers(allLayers.map(l => ({
                        ...l,
                        // 确保 groupId 能进入合并上下文
                        groupId: l.groupId || (l.role?.includes('_') ? `group_${l.role.split('_')[1]}` : null)
                    })));
                }

                // 按 z_index 排序确保层级正确
                processedLayers.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));
                results.finalSchema = { layers: processedLayers };
            }

            return results;
        }, [id, nodesMap, studioConnections, rfNodes, rfEdges]);

        // 监控 compositeData 结果
        React.useEffect(() => {
            // 静默监控，避免日志刷屏
        }, [id, compositeData]);

        // 将处理好的布局数据写入自身 data，供下游节点使用
        React.useEffect(() => {
            if (!compositeData.finalSchema) return;
            setNodes(nds => nds.map(n => {
                if (n.id !== id) return n;
                // 只有当 content 真正变化时才更新，避免无限循环
                const currentLayers = n.data?.content?.layers?.length || 0;
                const newLayers = compositeData.finalSchema.layers?.length || 0;
                if (currentLayers !== newLayers) {
                    return { ...n, data: { ...n.data, content: compositeData.finalSchema } };
                }
                return n;
            }));
        }, [id, compositeData.finalSchema, setNodes]);

        // 统一异步日志管理器：仅在数据实质变化时输出
        React.useEffect(() => {
            if (!compositeData.finalSchema) return;

            const layers = compositeData.finalSchema.layers || [];
            // 生成指纹：节点ID + 图层总数 + 第一个图层ID
            const fingerprint = `${id}_${layers.length}_${layers[0]?.id || 'none'}`;

            if (lastLogFingerprintRef.current !== fingerprint) {
                lastLogFingerprintRef.current = fingerprint;
            }
        }, [compositeData.finalSchema, id]);

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="布局融合"
                icon={Layout}
                selected={selected}
                style={{ width: '320px' }}
                handles={{
                    target: [
                        { id: 'assets', top: '30%' },
                        { id: 'coord', top: '50%' },
                        { id: 'bg', top: '70%' }
                    ],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-3">
                    {/* 1. 汇合状态检查清单 */}
                    <div className="flex flex-col gap-2 border-b border-black/10 pb-3">
                        <span className="text-[10px] font-black text-black uppercase tracking-[0.2em] whitespace-nowrap">视觉分析反馈</span>
                        <div className="space-y-2">
                            {[
                                { status: compositeData.hasAssets, label: '物理切片资产到位' },
                                { status: compositeData.hasCoordinates, label: '视觉语义坐标对齐' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <div className={`w-4 h-4 border ${item.status ? 'bg-black border-black' : 'bg-transparent border-black'} flex items-center justify-center`}>
                                        {item.status && Check && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className={`text-[12px] font-bold uppercase ${item.status ? 'text-black' : 'text-black/40'}`}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. 状态反馈区 (增强预览) */}
                    {compositeData.finalSchema ? (
                        <div className="flex flex-col gap-2">
                            <div className="w-full aspect-square border border-black bg-zinc-50 relative overflow-hidden flex items-center justify-center">
                                {/* 引入 3:4 图片比例盾，确保文字坐标锚定在有效图片区域内 */}
                                <div style={{ width: '75%', height: '100%', position: 'relative', pointerEvents: 'none' }}>
                                    {compositeData.finalSchema.layers?.map((layer, idx) => {
                                        // 支持普通图片和占位图片类型
                                        const isImage = layer.type === 'image' || layer.type === 'placeholder_image';
                                        if (isImage) {
                                            const isBg = layer.role === 'background' || layer.z_index === 0;
                                            const rawUrl = layer.url || layer.content || '';
                                            const hasValidUrl = typeof rawUrl === 'string' && (rawUrl.startsWith('http') || rawUrl.startsWith('/') || rawUrl.startsWith('data:'));
                                            const isPlaceholder = layer.isPlaceholder || layer.role === 'placeholder_image' || layer.type === 'placeholder_image' || !hasValidUrl;

                                            if (isPlaceholder && !hasValidUrl) {
                                                const pScale = 0.28; // 与文字预览基数对齐，确保 40px 图标在预览中比例自然

                                                return (
                                                    <div
                                                        key={idx}
                                                        className="absolute flex flex-col items-center justify-center border border-dashed border-black/20 bg-zinc-50/50 overflow-hidden"
                                                        style={{
                                                            left: `${(layer.bbox?.[0] || 0) / 10}%`,
                                                            top: `${(layer.bbox?.[1] || 0) / 10}%`,
                                                            width: `${(layer.bbox?.[2] || 100) / 10}%`,
                                                            height: `${(layer.bbox?.[3] || 100) / 10}%`,
                                                            zIndex: layer.z_index || idx,
                                                            display: (layer.isHidden || layer.opacity === 0) ? 'none' : 'flex'
                                                        }}
                                                    >
                                                        <div style={{
                                                            transform: `scale(${pScale})`,
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            <ImageIcon size={40} className="text-zinc-300" />
                                                            <span className="text-[12px] font-black text-zinc-400 mt-1 uppercase tracking-widest">展示位</span>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <img
                                                    key={idx}
                                                    src={layer.url || layer.content}
                                                    className="absolute w-full h-full"
                                                    style={{
                                                        left: `${(layer.bbox?.[0] || 0) / 10}%`,
                                                        top: `${(layer.bbox?.[1] || 0) / 10}%`,
                                                        width: `${(layer.bbox?.[2] || 100) / 10}%`,
                                                        height: `${(layer.bbox?.[3] || 100) / 10}%`,
                                                        zIndex: layer.z_index || idx,
                                                        //占位图或业务图层强制使用 contain 保护比例
                                                        objectFit: (isBg && !isPlaceholder) ? 'cover' : 'contain',
                                                        display: (layer.isHidden || layer.opacity === 0) ? 'none' : 'block'
                                                    }}
                                                />
                                            );
                                        } else if (layer.type === 'text') {
                                            // 增强版文字预览 (适配 0-1000 归一化坐标)
                                            const style = layer.style || {};
                                            // 字体大小换算：AI 返回通常基于 1000 归一化高度
                                            let fs = parseInt(style.fontSize) || 40;

                                            // 核心：利用 transform 绕过浏览器 12px 限制
                                            // 我们固定使用 40px 作为渲染基数，然后按比例缩放
                                            const targetPx = (fs * 280) / 1000;
                                            const scale = targetPx / 40;


                                            return (
                                                <div
                                                    key={idx}
                                                    className="absolute pointer-events-none transition-all"
                                                    style={{
                                                        zIndex: (layer.z_index || 200) + idx,
                                                        left: `${(layer.bbox?.[0] || 0) / 10}%`,
                                                        top: `${(layer.bbox?.[1] || 0) / 10}%`,
                                                        width: `${((layer.bbox?.[2] || 0) / 10) * (layer.isLayoutAnalyst ? 1.2 : 1)}%`,
                                                        height: `${(layer.bbox?.[3] || 0) / 10}%`,
                                                        overflow: 'visible',
                                                        display: (layer.isHidden || layer.opacity === 0) ? 'none' : 'block'
                                                        // 外层容器不再承担文字装饰，仅负责占位和裁剪边界
                                                    }}
                                                >
                                                    <div style={{
                                                        width: `${100 / scale}%`,
                                                        transform: `scale(${scale})`,
                                                        transformOrigin: 'top left',
                                                        overflow: 'visible',
                                                        fontSize: '40px',
                                                        color: style.color || '#000000',
                                                        fontWeight: style.fontWeight || 'bold',
                                                        textAlign: style.textAlign || 'center',
                                                        fontFamily: 'PingFang SC, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
                                                        lineHeight: '1.4',
                                                        whiteSpace: 'pre-wrap',
                                                        wordBreak: 'break-word',
                                                        // 暂时移除 shadow 以防止某些环境下透明度或偏移问题
                                                        textShadow: 'none'
                                                    }}>
                                                        {layer.content || layer.text}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center justify-center py-2 bg-black uppercase">
                                <span className="text-[12px] font-black text-white tracking-widest">布局架构已就绪</span>
                            </div>
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center border border-black gap-3 text-center">
                            {GitMerge ? <GitMerge size={32} strokeWidth={1} className="text-zinc-500" /> : <Layout size={32} strokeWidth={1} className="text-zinc-500" />}
                            <span className="text-[12px] font-black uppercase tracking-widest px-6 text-zinc-500 leading-relaxed whitespace-pre-line">
                                正在等待多智能体并流汇合
                            </span>
                        </div>
                    )}

                    {/* 3. 关键指标 */}
                    {compositeData.finalSchema && (
                        <div className="flex items-center justify-between px-1">
                            <span className="text-[12px] font-black text-black">
                                {compositeData.finalSchema.layers?.filter(l => l.type === 'image' || l.type === 'placeholder_image').length || 0} 图 / {compositeData.finalSchema.layers?.filter(l => l.type === 'text').length || 0} 文
                            </span>
                        </div>
                    )}

                    {/* 4. 连线处快捷按钮 (快捷添加并连接微调节点) */}
                    <div
                        className="absolute -right-3 top-1/2 -translate-y-1/2 z-50 group/plus"
                        style={{ pointerEvents: 'none' }}
                    >
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                console.log('[Composer] Spawning FineTuneNode...');

                                // 兼容性获取当前位置 (支持 React Flow 与自定义坐标系)
                                const currentNode = (getNode && getNode(id)) || { position: { x: 0, y: 0 }, x: 0, y: 0 };
                                const curX = currentNode.x !== undefined ? currentNode.x : (currentNode.position?.x || 0);
                                const curY = currentNode.y !== undefined ? currentNode.y : (currentNode.position?.y || 0);

                                const newX = curX + 380; // 间距
                                const newY = curY;

                                const newNode = {
                                    id: `fine-tune-${Date.now()}`,
                                    type: 'fine-tune',
                                    x: newX,
                                    y: newY,
                                    position: { x: newX, y: newY },
                                    w: 380,
                                    h: 600,
                                    data: {
                                        isDirty: false,
                                        content: compositeData.finalSchema || { layers: [] }
                                    },
                                };

                                // 同时触发 React Flow 与自定义 Context 的更新 (如果存在)
                                if (setNodes) {
                                    setNodes((nds) => [...nds, newNode]);
                                }
                                if (setEdges) {
                                    setEdges((eds) => [...eds, {
                                        id: `e-${id}-${newNode.id}-${Date.now()}`,
                                        source: id,
                                        target: newNode.id,
                                        sourceHandle: 'output',
                                        targetHandle: 'input'
                                    }]);
                                }
                            }}
                            className="w-6 h-6 bg-black flex items-center justify-center border border-white/20 hover:scale-110 active:scale-95 transition-all group/plus nodrag cursor-pointer pointer-events-auto"
                            title="快捷添加并连接精细编辑节点"
                        >
                            <Plus size={14} strokeWidth={3} className="text-white group-hover/plus:rotate-90 transition-transform" />
                        </button>
                    </div>
                </div>
            </BaseNode >
        );
    };

    window.MagnesComponents.Nodes.ComposerNodeRF = ComposerNode;
    console.log('✅ ComposerNodeRF (Safe) Loaded');
})();
