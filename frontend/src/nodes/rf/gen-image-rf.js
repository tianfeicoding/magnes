/**
 * GenImageNode - React Flow 版本 (JSX)
 * 路径: src/nodes/rf/gen-image-rf.js
 */

(function () {
    const { React } = window;
    const { useState, useMemo, useCallback, useEffect, useRef } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    // 依赖
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Wand2, Loader2, ArrowRight, ChevronDown, Image: ImageIcon, Sparkles, Palette, Layout, Lightbulb, Beaker, RotateCcw } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    // 比例计算辅助函数
    const calculateBestRatio = (w, h) => {
        if (!w || !h) return '1:1';
        const ratio = w / h;
        const presets = [
            { name: '1:1', value: 1 / 1 },
            { name: '3:4', value: 3 / 4 },
            { name: '4:3', value: 4 / 3 },
            { name: '9:16', value: 9 / 16 },
            { name: '16:9', value: 16 / 9 }
        ];

        let bestMatch = presets[0];
        let minDiff = Math.abs(ratio - bestMatch.value);

        presets.forEach(p => {
            const diff = Math.abs(ratio - p.value);
            if (diff < minDiff) {
                minDiff = diff;
                bestMatch = p;
            }
        });

        return bestMatch.name;
    };

    const FeedbackBadges = ({ onAction, disabled }) => {
        const badges = [
            { id: 'append_style', label: '追加风格', icon: Palette, color: 'text-purple-600' },
            { id: 'refine_layout', label: '微调构图', icon: Layout, color: 'text-blue-600' },
            { id: 'enhance_light', label: '补全光影', icon: Lightbulb, color: 'text-amber-500' },
            { id: 'auto_lab', label: '一键实验室', icon: Beaker, color: 'text-emerald-600' },
            { id: 'undo', label: '上一步', icon: RotateCcw, color: 'text-zinc-500' },
        ];

        return (
            <div className="grid grid-cols-3 gap-1.5 mt-2 mb-1">
                {badges.map(b => (
                    <button
                        key={b.id}
                        disabled={disabled}
                        onClick={(e) => { e.stopPropagation(); onAction(b.id, b.label); }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 border border-black/5 bg-zinc-50/50 hover:bg-zinc-100 transition-all group rounded-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
                    >
                        <b.icon size={12} className={`${b.color} group-hover:scale-110 transition-transform`} />
                        <span className="text-[10px] font-bold text-black/70 whitespace-nowrap">{b.label}</span>
                    </button>
                ))}
            </div>
        );
    };

    const GenImageNode = ({ id, data, selected }) => {
        const { setNodes, getNodes, getEdges } = useReactFlow();
        const [activeDropdown, setActiveDropdown] = useState(null);

        // 极度稳定性：使用 Ref 存储 Prompt 和 Denoising
        // 彻底切断 React 渲染循环
        const promptRef = useRef(data.settings?.prompt || '');

        // 获取全局 Context (用于 API 配置和启动生成)
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ apiConfigs: [], startGeneration: () => { } }) };
        const { apiConfigs = [], startGeneration } = useMagnesContext();

        const updateSettings = useCallback((updates) => {
            setNodes((nds) => nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, settings: { ...node.data.settings, ...updates } } } : node
            ));
        }, [id, setNodes]);

        const currentModelConfig = useMemo(() => {
            return apiConfigs.find(c => c.id === data.settings?.model) || {};
        }, [apiConfigs, data.settings?.model]);

        // 仅在挂载时同步一次初始选择
        useEffect(() => {
            if (!data.settings?.model && apiConfigs.length > 0) {
                // 优先级 1: 显式匹配 nano-banana
                let targetModel = apiConfigs.find(c => c.id === 'nano-banana');
                // 优先级 2: 显式匹配 nano-banana-2
                if (!targetModel) targetModel = apiConfigs.find(c => c.id === 'nano-banana-2');
                // 优先级 3: 模糊匹配提供商名称
                if (!targetModel) targetModel = apiConfigs.find(c => c.provider?.toLowerCase().includes('nano banana'));
                
                if (targetModel) updateSettings({ model: targetModel.id });
            }
        }, []);

        const getGroupedImages = useCallback(async () => {
            const edges = getEdges();
            const nodes = getNodes();
            // 【核心加固】Store-First：直接从全局 Store 查找最新数据，彻底解决 Stale Closure
            const latestNode = nodes.find(n => n.id === id);
            const latestData = latestNode?.data || data || {};

            const ImageUtils = window.MagnesComponents?.Utils?.Image;
            const finalImages = [];

            // A. 添加来源于 data.settings.sourceImages 的显式参考图 (由 AI 注入)
            if (latestData.settings?.sourceImages && Array.isArray(latestData.settings.sourceImages)) {
                finalImages.push(...latestData.settings.sourceImages);
            }

            // B. 添加来自连线的图片 (按源节点 ID 归组)
            const sourceMap = new Map();
            edges
                .filter(e => e.target === id)
                .forEach(e => {
                    if (!sourceMap.has(e.source)) sourceMap.set(e.source, []);
                });

            for (const sourceId of sourceMap.keys()) {
                const sourceNode = nodes.find(n => n.id === sourceId);
                if (!sourceNode) continue;

                if (sourceNode.type === 'layer-split') {
                    // 场景 A: 来自图层拆分节点 -> 执行合并 (保持三明治特性)
                    const layers = sourceNode.data?.layers || [];
                    const hiddenIdx = sourceNode.data?.hiddenLayers || [];
                    const visibleUrls = layers
                        .filter((l, idx) => !hiddenIdx.includes(idx) && l.url)
                        .map(l => l.url);

                    if (visibleUrls.length > 1 && ImageUtils?.composeImages) {
                        try {
                            const composed = await ImageUtils.composeImages(visibleUrls);
                            if (composed) finalImages.push(composed);
                        } catch (err) {
                            console.error('[GenImage] Composition error:', err);
                            finalImages.push(...visibleUrls); // 回退方案
                        }
                    } else {
                        finalImages.push(...visibleUrls);
                    }
                } else if (sourceNode.data?.content) {
                    // 场景 B: 独立图片节点或其他带 content 的节点 -> 保持独立
                    finalImages.push(sourceNode.data.content);
                }
            }
            return finalImages;
        }, [getEdges, getNodes, id]); // 移除 data 依赖，利用 getNodes 获取最新态

        const getConnectedImages = useCallback(() => {
            // 仅用于 UI 预览的同步逻辑
            const edges = getEdges();
            const nodes = getNodes();
            const previewImages = [];

            // A. 添加来源于 data.settings.sourceImages 的显式参考图 (由 AI 注入)
            if (data.settings?.sourceImages && Array.isArray(data.settings.sourceImages)) {
                previewImages.push(...data.settings.sourceImages);
            }

            // B. 添加来自连线的图片
            const sourceMap = new Map();
            edges.filter(e => e.target === id).forEach(e => sourceMap.set(e.source, true));

            for (const sourceId of sourceMap.keys()) {
                const sourceNode = nodes.find(n => n.id === sourceId);
                if (!sourceNode) continue;
                if (sourceNode.type === 'layer-split') {
                    const layers = sourceNode.data?.layers || [];
                    const activeLayer = layers.find((l, idx) => !(sourceNode.data?.hiddenLayers || []).includes(idx) && l.url);
                    if (activeLayer) previewImages.push(activeLayer.url);
                } else if (sourceNode.data?.content) {
                    previewImages.push(sourceNode.data.content);
                }
            }
            return previewImages;
        }, [getEdges, getNodes, id, data.settings?.sourceImages]);

        // 极度鲁棒监听：结合 React Flow Hook 和 Data 变化双重保证
        const edges = ReactFlow.useEdges ? ReactFlow.useEdges() : [];
        const [connectedImages, setConnectedImages] = useState([]);

        useEffect(() => {
            const imgs = getConnectedImages();
            setConnectedImages(imgs);
        }, [edges, data, getConnectedImages]);

        // 自动适配比例逻辑
        const lastAutoRatioImageUrl = useRef(null);
        useEffect(() => {
            if (connectedImages.length > 0) {
                const firstImageUrl = connectedImages[0];

                // 仅当首张图片发生物理性变更时触发自动适配
                if (firstImageUrl !== lastAutoRatioImageUrl.current) {
                    lastAutoRatioImageUrl.current = firstImageUrl;

                    console.log(`[GenImage ${id}] 📸 检测到新输入图片，准备自动适配比例...`);

                    const img = new Image();
                    img.onload = () => {
                        const bestRatio = calculateBestRatio(img.width, img.height);
                        console.log(`[GenImage ${id}] 自动匹配比例: ${img.width}x${img.height} -> ${bestRatio}`);
                        updateSettings({ ratio: bestRatio });
                    };
                    img.src = firstImageUrl;
                }
            }
        }, [connectedImages, updateSettings, id]);

        const handleGenerate = useCallback(async (e, feedback = null) => {
            if (e) e.stopPropagation();

            // 【加固】如果已经正在生成，且不是手动点击，则跳过
            // 如果 e 存在说明是手动点击，允许
            const latestNodeCheck = getNodes().find(n => n.id === id);
            if (!e && !feedback && latestNodeCheck?.data?.isTaskDispatched) return;

            console.log(`[GenImage ${id}] 🚀 Starting generation sequence... feedback:`, feedback);

            try {
                // 【核心加固】Store-First：从 Store 获取最新 data 状态
                const latestNode = getNodes().find(n => n.id === id);
                const latestData = latestNode?.data || data || {};

                updateSettings({ isGenerating: true, isTaskDispatched: true });

                // 执行真实的异步图片合并/整理逻辑
                const finalImages = await getGroupedImages();
                console.log(`[GenImage ${id}] Grouped images ready:`, finalImages.length);

                startGeneration({
                    prompt: promptRef.current,
                    type: 'image',
                    sourceImages: finalImages,
                    nodeId: id,
                    options: {
                        model: latestData.settings?.model,
                        active_skill: latestData.settings?.activeSkill,
                        conversationId: latestData.settings?.conversationId,
                        ratio: latestData.settings?.ratio || '1:1',
                        feedback: feedback // 透传反馈指令
                    },
                    apiConfigs
                });
            } catch (err) {
                console.error(`[GenImage ${id}] ❌ Generation launch failed:`, err);
                updateSettings({ isGenerating: false, isTaskDispatched: false });
            }
        }, [id, updateSettings, getGroupedImages, startGeneration, apiConfigs, getNodes]); // 移除稳定，利用最新 Store 数据

        // 监听 AI 传来的指令 (pendingPrompt)
        const textareaRef = useRef(null);
        const lastAutoTriggerPrompt = useRef(null);

        useEffect(() => {
            // 1. 同步 Prompt
            if (data.pendingPrompt && data.pendingPrompt !== promptRef.current) {
                console.log(`[GenImage ${id}] 收到 AI 指令:`, data.pendingPrompt);
                promptRef.current = data.pendingPrompt;
                if (textareaRef.current) {
                    textareaRef.current.value = data.pendingPrompt;
                }

                // 同步完立即清除标识，防止循环
                updateSettings({ pendingPrompt: null });
            }

            // 2. 同步 ImageUrls (AI 透传的参考图)
            if (data.pendingImageUrls && Array.isArray(data.pendingImageUrls)) {
                console.log(`[GenImage ${id}] 收到 AI 透传参考图:`, data.pendingImageUrls.length);
                updateSettings({
                    sourceImages: data.pendingImageUrls,
                    pendingImageUrls: null
                });
            }
        }, [data.pendingPrompt, data.pendingImageUrls, id]);

        /* 
         * [REFACTORED] 移除自动触发逻辑。
         * 在多智能体架构中，生图任务由后端 executor_agent 统一驱动执行。
         * 画布节点仅作为“任务展示位”和“参数配置位”，不再在 prompt 到达时自动竞争触发。
         * 这样可以有效防止重复扣费、重复请求以及 SSE 状态写回时的 ID 冲突。
         */
        /*
        const autoTriggerTimerRef = useRef(null);
        useEffect(() => {
            if (promptRef.current &&
                lastAutoTriggerPrompt.current !== promptRef.current) {

                console.log(`[GenImage ${id}] ⚡️ Auto-trigger condition met.`, {
                    currentPrompt: promptRef.current,
                    lastPrompt: lastAutoTriggerPrompt.current,
                    isGenerating: data.isGenerating
                });

                lastAutoTriggerPrompt.current = promptRef.current;

                if (autoTriggerTimerRef.current) clearTimeout(autoTriggerTimerRef.current);

                autoTriggerTimerRef.current = setTimeout(() => {
                    console.log(`[GenImage ${id}] 执行延时触发...`);
                    handleGenerate();
                    autoTriggerTimerRef.current = null;
                }, 300);
            }
        }, [data.pendingPrompt, connectedImages.length, handleGenerate, id]);
        */

        /*
        // 组件卸载时安全清理
        useEffect(() => {
            return () => {
                if (autoTriggerTimerRef.current) clearTimeout(autoTriggerTimerRef.current);
            };
        }, []);
        */

        // 监听版本画廊的“再生”请求
        useEffect(() => {
            const handleRegenFromVersion = (e) => {
                const { sourceImageUrl, fromVersionGallery } = e.detail;
                console.log(`[GenImage ${id}] 收到再生请求: 来自 ${fromVersionGallery}`, sourceImageUrl);

                // 1. 更新内部数据状态
                updateSettings({ sourceImage: sourceImageUrl });

                // 2. 触发生成过程
                setTimeout(() => {
                    handleGenerate();
                }, 100);
            };

            window.addEventListener('magnes:regenerate-from-version', handleRegenFromVersion);
            return () => window.removeEventListener('magnes:regenerate-from-version', handleRegenFromVersion);
        }, [id, updateSettings, handleGenerate]);


        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="AI 绘图"
                icon={Wand2}
                selected={selected}
                style={{ width: '320px', height: 'auto' }}
                handles={{
                    target: [{ id: 'style', top: '25%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-3 h-full overflow-hidden">
                    <div className="flex-1 flex flex-col min-h-0 nodrag">
                        {/* 引用图片显示区 - 移至顶部 */}
                        {connectedImages.length > 0 && (
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar items-center">
                                {connectedImages.map((url, idx) => (
                                    <div key={idx} className="relative w-[48px] h-[48px] border border-black flex-shrink-0 bg-zinc-50 overflow-hidden">
                                        <img src={url} className="w-full h-full object-cover" alt="ref" />
                                        <div className="absolute top-0 right-0 bg-black text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-bl-md font-bold">
                                            {idx + 1}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="aspect-square border border-black p-2 mb-1">
                            <textarea
                                ref={textareaRef}
                                className="w-full h-full bg-transparent text-[12px] p-0 outline-none resize-none leading-relaxed"
                                placeholder="输入描述或按 '/' 呼出指令..."
                                defaultValue={promptRef.current}
                                onChange={(e) => { promptRef.current = e.target.value; }}
                                onBlur={() => updateSettings({ prompt: promptRef.current })}
                                onMouseDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {/* 反馈勋章系统 */}
                    {(data.image_url || data.settings?.prompt) && (
                        <FeedbackBadges 
                            disabled={data.isGenerating} 
                            onAction={(actionId, label) => {
                                console.log(`[GenImage ${id}] Feedback triggered: ${actionId} (${label})`);
                                // 触发带反馈特征的重新生成
                                handleGenerate(null, { feedbackAction: actionId, feedbackLabel: label });
                            }} 
                        />
                    )}

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'model' ? null : 'model'); }}
                                className="flex items-center gap-2 py-1 border-b border-black font-bold text-[12px] uppercase"
                            >
                                {currentModelConfig.provider?.toUpperCase() || 'SELECT MODEL'}
                                <ChevronDown size={14} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio'); }}
                                className="flex items-center gap-2 py-1 border-b border-black font-bold text-[12px]"
                            >
                                {data.settings?.ratio || '1:1'}
                                <ChevronDown size={14} />
                            </button>


                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={data.isGenerating}
                            className={`w-8 h-8 flex items-center justify-center border border-black                                        ${data.isGenerating ? 'bg-zinc-100 text-zinc-300' : 'bg-black text-white hover:bg-zinc-800'}
                                       ${data.isGenerating ? '' : (!connectedImages.length && !data.settings?.prompt ? 'bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed' : '')}`}
                        >
                            {data.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={20} />}
                        </button>
                    </div>

                    {activeDropdown && (
                        <div className="absolute left-0 right-0 bg-white border border-black z-50 p-2 flex flex-col gap-1 nodrag" style={{ bottom: '50px', margin: '0 12px' }}>
                            {activeDropdown === 'model' && apiConfigs.map(cfg => (
                                <button key={cfg.id} onClick={(e) => { e.stopPropagation(); updateSettings({ model: cfg.id }); setActiveDropdown(null); }} className={`text-left px-2 py-1 text-[11px] font-bold hover:bg-black hover:text-white transition-colors ${data.settings?.model === cfg.id ? 'bg-zinc-100' : ''}`}>
                                    {cfg.provider?.toUpperCase()}
                                </button>
                            ))}
                            {activeDropdown === 'ratio' && ['1:1', '3:4', '4:3', '9:16', '16:9'].map(r => (
                                <button key={r} onClick={(e) => { e.stopPropagation(); updateSettings({ ratio: r }); setActiveDropdown(null); }} className="text-left px-2 py-1 text-[11px] font-bold hover:bg-black hover:text-white transition-colors">
                                    {r}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.GenImageNodeRF = GenImageNode;
    console.log('✅ GenImageNodeRF (JSX) Registered with Ultimate Ref-based Stability');
})();
