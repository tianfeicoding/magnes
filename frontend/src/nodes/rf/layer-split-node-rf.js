/**
 * LayerSplitNode - 拆分图层节点 (React Flow 版本)
 * 路径: src/nodes/rf/layer-split-node-rf.js
 * 
 * 功能：
 * 1. 接收来自 InputImageNode 的图片。
 * 2. 触发后端 Qwen-Image-Layered 接口进行拆解。
 * 3. 实时展示拆解后的图层列表。
 */

(function () {
    const { React } = window;
    const { useState, useCallback, useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow, useEdges, useNodes } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Maximize2: ScanIcon, Loader2, Layers: LayersIcon, Check, Eye, EyeOff, Download, Bot } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const LayerSplitNode = ({ id, data, selected }) => {
        const [isProcessing, setIsProcessing] = useState(false);
        const { setNodes } = useReactFlow();
        const rfNodes = (window.ReactFlow?.useNodes && window.ReactFlow.useNodes()) || [];
        const rfEdges = (window.ReactFlow?.useEdges && window.ReactFlow.useEdges()) || [];

        // 兼容性获取
        const nodes = rfNodes;
        const edges = rfEdges;

        const updateData = useCallback((newData) => {
            setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node)));
        }, [id, setNodes]);

        // 获取隐藏图层列表
        const hiddenLayers = data.hiddenLayers || [];

        // 导出功能 - 真实触发下载
        const handleExport = async (type) => {
            const allLayers = data.layers || [];
            if (allLayers.length === 0) return;

            // 过滤待下载的列表
            let targets = [];
            const visibleLayers = allLayers.filter((_, idx) => !hiddenLayers.includes(idx));

            if (type === 'all') {
                targets = allLayers;
            } else if (type === 'visible') {
                targets = visibleLayers;
            } else if (type === 'composed') {
                // 新增合体导出逻辑
                if (visibleLayers.length === 0) return alert("没有可见图层可供合成");

                const ImageUtils = window.MagnesComponents?.Utils?.Image;
                if (!ImageUtils?.composeImages) return alert("合成引擎未就绪");

                try {
                    console.log(`[Export] 正在合成 ${visibleLayers.length} 个图层...`);
                    const composedUrl = await ImageUtils.composeImages(visibleLayers.map(l => l.url));
                    if (composedUrl) {
                        const link = document.createElement('a');
                        link.href = composedUrl;
                        link.download = `composed_result_${Date.now()}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        console.log('[Export] 合成图导出成功');
                    }
                    return;
                } catch (err) {
                    console.error('[Export] 合成导出失败:', err);
                    return alert("合成导出失败，请检查图层资源");
                }
            }

            if (targets.length === 0) return alert("没有可导出的图层");

            // 循环触发下载
            targets.forEach((layer, index) => {
                const url = layer.url;
                if (!url) return;

                // 简单的提示
                console.log(`[Export] 正在准备下载: ${layer.role || index} -> ${url}`);

                // 创建隐藏下载链接
                const link = document.createElement('a');
                link.href = url;
                // 设置下载文件名，尽量保持语义化
                const fileName = `${layer.role || 'layer'}_${index}.webp`;
                link.setAttribute('download', fileName);
                link.setAttribute('target', '_blank'); // 如果 download 因为 CORS 失效，至少能打开新标签

                document.body.appendChild(link);

                // 为了防止浏览器拦截多个弹出窗口，稍作延迟
                setTimeout(() => {
                    link.click();
                    document.body.removeChild(link);
                }, index * 200);
            });
        };

        // 查找通过连线传进来的原始资产数据 (包含图片与可能的提示词)
        const sourceData = useMemo(() => {
            const edge = edges.find(e => e.target === id);
            if (!edge) return { url: null, prompt: null };
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return { url: null, prompt: null };

            return {
                url: sourceNode.data?.content || sourceNode.data?.image_url || null,
                dimensions: sourceNode.data?.dimensions || null,
                // 兼容不同节点的 prompt 存放位置
                prompt: sourceNode.data?.settings?.prompt || sourceNode.data?.prompt || sourceNode.data?.user_prompt || null
            };
        }, [id, nodes, edges]);

        const sourceImageUrl = sourceData.url;

        const toggleLayerVisibility = (e, idx) => {
            e.stopPropagation();
            const newHidden = hiddenLayers.includes(idx)
                ? hiddenLayers.filter(i => i !== idx)
                : [...hiddenLayers, idx];
            updateData({ hiddenLayers: newHidden });
        };

        // 检测下游是否连接了 Painter (GenImage) 节点
        const isPainterConnected = useMemo(() => {
            const downstreamEdges = edges.filter(e => e.source === id);
            return downstreamEdges.some(e => {
                const targetNode = nodes.find(n => n.id === e.target);
                return targetNode?.type === 'gen-image';
            });
        }, [id, nodes, edges]);

        // 检测下游是否连接了 Refiner (视觉分析) 节点 (通过 Composer 间接感知)
        const isRefinerNeeded = useMemo(() => {
            // 1. 找到连接当前节点的 Composer 节点
            const downstreamComposerEdges = edges.filter(e => e.source === id);
            const composerNodes = downstreamComposerEdges
                .map(e => nodes.find(n => n.id === e.target))
                .filter(n => n?.type === 'composer');

            // 2. 检查这些 Composer 节点是否有另一个来自 Refiner 的输入
            return composerNodes.some(composer => {
                const upstreamOfComposerEdges = edges.filter(e => e.target === composer.id);
                return upstreamOfComposerEdges.some(e => {
                    const sourceNode = nodes.find(n => n.id === e.source);
                    return sourceNode?.type === 'refiner';
                });
            });
        }, [id, nodes, edges]);

        // --- 核心联调函数：触发后端线性闭环 ---
        const handleSplit = async (e) => {
            e.stopPropagation();
            if (!sourceImageUrl) return alert("请先连接图片输入节点！");

            setIsProcessing(true);
            updateData({ layers: [], status: 'processing', hiddenLayers: [] });

            try {
                const API = window.MagnesComponents?.Utils?.API;
                console.log('[LayerSplit] Sending request. run_painter:', isPainterConnected, 'run_refiner:', isRefinerNeeded);
                const response = await API.magnesFetch('/design', {
                    method: 'POST',
                    body: JSON.stringify({
                        thread_id: data.thread_id || `thread_${Date.now()}`,
                        instruction: data.user_instruction || "请帮我拆分这张图片的图层",
                        image_url: sourceImageUrl,
                        num_layers: data.num_layers || 4,
                        user_prompt: sourceData.prompt || data.user_prompt,
                        canvas_width: sourceData.dimensions?.w,
                        canvas_height: sourceData.dimensions?.h,
                        run_painter: isPainterConnected, // 只有连了绘图节点才跑后端 Painter Node
                        run_refiner: isRefinerNeeded     // 只有连了分析节点才跑后端 Refiner Node
                    })
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // 只保留图片层，防止文字“走私”进该节点
                    const allLayers = result.output?.layers || [];
                    const imageLayers = allLayers.filter(l => l.type === 'image' || !l.type);

                    updateData({
                        layers: imageLayers,
                        status: 'completed',
                        layoutData: { ...result.output, layers: imageLayers },
                        style_learning: result.style_learning
                    });
                } else {
                    alert("后端分析失败: " + (result.message || "未知错误"));
                    updateData({ status: 'error' });
                }
            } catch (error) {
                console.error("联调请求异常:", error);
                alert("无法连接到后端");
                updateData({ status: 'error' });
            } finally {
                setIsProcessing(false);
            }
        };

        if (!BaseNode) return null;

        const layers = data.layers || [];
        // 仅保留 image 类型的图层资产进行展示，过滤掉 Refiner 产生的坐标数据层 (text)
        const visibleLayersList = useMemo(() => {
            return layers.filter(l => l.type === 'image' || !l.type);
        }, [layers]);

        const styleLearning = data.style_learning;

        // 图层角色中文映射
        const roleMap = {
            'subject': '主体',
            'background': '背景',
            'element': '元素',
            'decoration': '装饰'
        };

        return (
            <BaseNode
                id={id}
                title="AI 视觉排版"
                icon={LayersIcon}
                selected={selected}
                style={{ width: '320px' }}
                handles={{
                    target: [{ id: 'input', top: '50%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-3">
                    {/* 1. 分层控制参数 (NEW) */}
                    <div className="flex flex-col gap-3 py-2 border-y border-black/5">
                        {/* 指导提示词 */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">分层指导</label>
                            <textarea
                                className="w-full px-2 py-2 text-[12px] border border-black outline-none bg-zinc-50 focus:bg-white min-h-[60px] resize-none leading-relaxed nodrag"
                                placeholder="输入特殊的分层指令，例如：'背景产品分离，文字单独一层'..."
                                value={data.user_instruction || ''}
                                onChange={(e) => updateData({ user_instruction: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>

                        {/* 快速预设按钮组 */}
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { label: '分离文字', prompt: '识别并提取文字层，将其单独拆分为透明层' },
                                { label: '保留背景', prompt: '保留完整的背景图层，去除所有覆盖物' },
                                { label: '主体提取', prompt: '仅提取核心产品或人物主体，边缘平滑裁剪' }
                            ].map((preset, pIdx) => (
                                <button
                                    key={pIdx}
                                    onClick={(e) => { e.stopPropagation(); updateData({ user_instruction: preset.prompt }); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="px-2 py-1 text-[10px] bg-zinc-100 hover:bg-black hover:text-white border border-black/10 transition-colors uppercase font-bold nodrag"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* 图层数量选择 */}
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">导出图层数</span>
                            <div className="flex border border-black overflow-hidden h-7">
                                {[2, 3, 4, 6, 8].map(num => (
                                    <button
                                        key={num}
                                        onClick={(e) => { e.stopPropagation(); updateData({ num_layers: num }); }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className={`px-2.5 text-[11px] font-black transition-colors border-r last:border-r-0 border-black nodrag
                                                   ${(data.num_layers || 4) === num ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 执行按钮 */}
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={handleSplit}
                            disabled={isProcessing || !sourceImageUrl}
                            className={`w-full py-2.5 mt-1 border border-black font-black text-[12px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest nodrag
                                       ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' :
                                    !sourceImageUrl ? 'bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`}
                        >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <ScanIcon size={12} />}
                            {isProcessing ? '拆解中' : '执行全自动拆解'}
                        </button>
                    </div>
                    {/* 2. 风格学习区域 (AI 灵感笔记) */}
                    {styleLearning && (
                        <div className="bg-zinc-900 text-zinc-100 p-4 flex flex-col gap-2 relative overflow-hidden">
                            <div className="flex items-center gap-2 mb-1">
                                <Bot size={14} className="text-blue-400" />
                                <span className="text-[12px] font-black uppercase tracking-widest text-blue-400">AI 风格灵感笔记</span>
                            </div>
                            <p className="text-[12px] leading-relaxed opacity-95 italic font-medium">
                                "{styleLearning}"
                            </p>
                            <div className="absolute top-0 right-0 p-1 opacity-10">
                                <ScanIcon size={40} />
                            </div>
                        </div>
                    )}

                    {/* 3. 状态展示与预览 */}
                    {layers.length > 0 ? (
                        <div className="flex flex-col gap-3 border-t border-black/5 pt-3">
                            {/* Sandwich 叠加预览区 */}
                            {/* 动态比例适配：从 sourceData.dimensions 获取比例，防止变形 */}
                            <div
                                className="w-full border border-black bg-zinc-50 flex items-center justify-center overflow-hidden relative group"
                                style={{
                                    aspectRatio: (sourceData.dimensions?.w && sourceData.dimensions?.h)
                                        ? `${sourceData.dimensions.w} / ${sourceData.dimensions.h}`
                                        : '1 / 1'
                                }}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {visibleLayersList.map((layer, idx) => {
                                        if (hiddenLayers.includes(idx)) return null;
                                        return (
                                            <img
                                                key={idx}
                                                src={layer.url}
                                                className="absolute max-w-full max-h-full object-contain mix-blend-normal"
                                                style={{ zIndex: 10 + idx }}
                                                alt={`图层 ${idx}`}
                                                onError={(e) => {
                                                    console.warn(`[UI] 图层 ${idx} 主图加载失败:`, layer.url);
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="absolute top-2 left-2 bg-black text-white text-[12px] px-3 py-1 font-bold uppercase z-50">
                                    当前布局 ({visibleLayersList.length - hiddenLayers.length} 资产)
                                </div>
                            </div>

                            {/* 下方缩略图滚动列表 */}
                            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                {visibleLayersList.map((layer, idx) => {
                                    const isHidden = hiddenLayers.includes(idx);
                                    const chineseRole = roleMap[layer.role?.toLowerCase()] || layer.role || `图层 ${idx}`;

                                    return (
                                        <div
                                            key={idx}
                                            className={`shrink-0 w-16 h-16 border relative transition-all flex items-center justify-center bg-white overflow-hidden group/tile
                                                       ${isHidden ? 'opacity-40 grayscale border-black/5' : 'border-black opacity-100'}`}
                                        >
                                            {layer.url ? (
                                                <img
                                                    src={layer.url}
                                                    className="max-w-full max-h-full object-contain"
                                                    alt={`缩略图 ${idx}`}
                                                    onError={(e) => {
                                                        console.error(`[UI] 缩略图 ${idx} 加载失败`);
                                                        e.target.parentNode.classList.add('bg-zinc-100');
                                                        e.target.src = 'https://img.icons8.com/material-outlined/24/null/image-not-found.png'; // 兜底图标
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 opacity-20">
                                                    <Loader2 size={12} className="animate-spin" />
                                                </div>
                                            )}

                                            <button
                                                onClick={(e) => toggleLayerVisibility(e, idx)}
                                                className="absolute inset-0 bg-black/40 opacity-0 group-hover/tile:opacity-100 flex items-center justify-center text-white transition-opacity"
                                            >
                                                {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>

                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[12px] px-1 font-bold truncate text-center">
                                                {chineseRole}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 导出按钮组 */}
                            <div className="flex border border-black mt-1 divide-x divide-black nodrag">
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => handleExport('visible')}
                                    className="flex-1 py-2 bg-zinc-50 hover:bg-zinc-100 text-black font-bold text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors border-r border-black"
                                >
                                    <Download size={14} /> 分离下载
                                </button>
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => handleExport('composed')}
                                    className="flex-1 py-2 bg-black hover:bg-zinc-800 text-white font-bold text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Download size={14} /> 合体下载
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full aspect-square border border-black flex flex-col items-center justify-center gap-3 px-4 text-center">
                            {data.status === 'error' ? (
                                <span className="text-[12px] text-zinc-500 font-black uppercase tracking-widest">流程执行中断</span>
                            ) : (
                                <>
                                    <LayersIcon size={32} strokeWidth={1} className="text-zinc-500" />
                                    <span className="text-[12px] font-black uppercase tracking-widest text-zinc-500 leading-snug whitespace-pre-line">
                                        {sourceImageUrl ? 'AI 工作流就绪\n点击立即执行拆解' : '等待输入图片连接'}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    // 注册到全局组件库
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.LayerSplitNodeRF = LayerSplitNode;

    console.log('✅ LayerSplitNodeRF (JSX) 已加载并准备联调');
})();
