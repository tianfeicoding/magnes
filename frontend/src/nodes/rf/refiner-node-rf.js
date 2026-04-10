/**
 * RefinerNode - 视觉分析专家节点 (React Flow 版本)
 * 路径: src/nodes/rf/refiner-node-rf.js
 * 
 * 职责：
 * 1. 展示来自后端 Vision Refiner 的分析成果。
 * 2. 呈现 AI 风格灵感笔记 (Style Learning)。
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

    const RefinerNode = ({ id, data, selected, nodesMap, connections: studioConnections }) => {
        const { Bot, Maximize2: Scan, Sparkles, Loader2, Copy, Check } = Icons;
        // 兼容性获取：优先使用 props (MagnesStudio)，其次使用 hooks (React Flow)
        const rfNodes = (window.ReactFlow?.useNodes && window.ReactFlow.useNodes()) || [];
        const rfEdges = (window.ReactFlow?.useEdges && window.ReactFlow.useEdges()) || [];

        // 获取全局 Context 触发器
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ startGeneration: () => { }, apiConfigs: [] }) };
        const { startGeneration, apiConfigs = [] } = useMagnesContext();

        const [showNotes, setShowNotes] = React.useState(false); // 明确默认收起分析报告
        const [copiedField, setCopiedField] = React.useState(null);
        const isProcessing = data.isGenerating;

        // 监听数据接收
        React.useEffect(() => {
            if (data.layoutData || data.style_learning) {
                console.log(`[Refiner Reception] Node ${id} received data updates:`, {
                    hasLayoutData: !!data.layoutData,
                    layersCount: data.layoutData?.layers?.length,
                    hasStyleLearning: !!data.style_learning
                });
            }
        }, [data.layoutData, data.style_learning, id]);

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

            // 强制解耦前端静态提示词。
            // 之前由于此节点会通过 POST 发送陈旧的 window.PromptTemplates，导致后端更新无法生效。
            // 现在传入 null，驱动后端读取 prompts.py 中的最新分块协议。
            const fullPrompt = null;

            console.log('[RefinerNode] Starting analysis...');

            startGeneration({
                prompt: fullPrompt,
                type: 'refine',
                sourceImages: [sourceImageUrl],
                nodeId: id,
                options: {
                    model: visionModel.modelName || visionModel.id,
                    conversationId: data.settings?.conversationId,
                },
                apiConfigs,
                callbacks: {
                    onNodeUpdate: (nodeId, updateData) => {
                        console.log(`[RefinerNode ${id}] onNodeUpdate received:`, updateData);

                        if (updateData.content && !updateData.isGenerating) {
                            const content = updateData.content;
                            // 字段兼容性修复：后端 refiner.py 返回的是 layout_schema
                            const layers = content.layers ||
                                content.layout_schema?.layers ||
                                updateData.layoutData?.layers || [];

                            console.log(`%c[Data Flow: Refiner -> Output] Node ${id}`, 'background: #2563eb; color: #fff; padding: 2px 4px; border-radius: 2px;', {
                                fullContent: content,
                                layers: layers,
                                placeholderCount: layers.filter(l => l.type === 'placeholder_image' || l.role?.includes('placeholder')).length
                            });

                            updateData.layoutData = updateData.layoutData || { layers: layers };

                        }
                    }
                }
            });
        };

        const handleCopy = (e, text, field) => {
            e.stopPropagation();
            if (!text) return;
            navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        };

        const extractedContent = useMemo(() => {
            // 结构化解析器：严格复刻下游 LayoutUtils 提取逻辑
            const parseKIE = (raw) => {
                if (!raw || typeof raw !== 'object') return null;

                // 1. 自动解包：多数据源累加 (不再排他)
                let fieldMap = { ...(raw || {}) };
                if (raw.content && typeof raw.content === 'object') {
                    Object.assign(fieldMap, raw.content);
                }
                if (raw.extractedContent && typeof raw.extractedContent === 'object') {
                    Object.assign(fieldMap, raw.extractedContent);
                }
                if (raw.layout && raw.layout.extractedContent) {
                    Object.assign(fieldMap, raw.layout.extractedContent);
                }

                // 2. 多项支持：若存在 items 数组，并行处理，确保同一活动信息聚拢
                let finalItems = [];
                if (fieldMap.items && Array.isArray(fieldMap.items)) {
                    finalItems = fieldMap.items.map(it => {
                        return {
                            title: it.title || '',
                            venue: it.venue || '',
                            date: it.date || '',
                            price: it.price || '',
                            description: it.description || ''
                        };
                    });
                }

                // 3. 字段映射 (兼容旧协议及单项展示)
                const base = finalItems.length > 0 ? { ...fieldMap, ...finalItems[0] } : fieldMap;
                const mapping = {
                    venue: (base.venue && base.address)
                        ? `${base.venue}（${base.address}）`
                        : (base.venue || base.location || base.subtitle || base.address || ''),
                    date: base.date || base.time || base.schedule || '',
                    price: base.price || base.cost || base.ticket || '',
                    description: base.description || base.intro || base.content || '',
                    title: base.title || base.name || '',
                    calendar_info: base.calendar_info || '',
                    time_indicator: base.time_indicator || '',
                    highlights: base.highlights || base.features || base.points || base.tips || ''
                };

                // 判解逻辑：增强去重规则
                // 1. 如果亮点内容与全局描述完全一致，置空
                if (mapping.highlights === mapping.description) mapping.highlights = '';

                // 2. 深度查重：如果亮点内容已经包含在任何 items 的描述中，也置空
                if (mapping.highlights && mapping.items && mapping.items.length > 0) {
                    const allItemTexts = mapping.items.map(it => (it.description || '') + (it.title || '')).join(' ');
                    if (allItemTexts.includes(mapping.highlights)) {
                        mapping.highlights = '';
                    }
                }

                if (mapping.highlights && typeof mapping.highlights === 'object') {
                    const h = mapping.highlights;
                    mapping.highlights = Array.isArray(h)
                        ? h.join('\n')
                        : Object.entries(h).map(([k, v]) => `${k}：${v}`).join('\n');
                }

                // 确保所有字段强制转为字符串，防止下游渲染报错
                Object.keys(mapping).forEach(k => {
                    if (mapping[k] && typeof mapping[k] !== 'string') mapping[k] = String(mapping[k]);
                });

                const hasVisible = Object.values(mapping).some(v => v && String(v).trim().length > 0) || finalItems.length > 0;
                return hasVisible ? { ...base, ...mapping, items: finalItems } : null;
            };

            // 深度补全截断的 JSON：平衡括号算法
            const fixTruncatedJson = (str) => {
                let depth = 0;
                let inString = false;
                let escape = false;

                // 1. 语法预判：如果结尾是 " 则补一个 "，如果是 , 则删掉
                let s = str.trim();
                if (s.endsWith(',')) s = s.slice(0, -1);

                // 2. 括号平衡计数
                for (let i = 0; i < s.length; i++) {
                    const char = s[i];
                    if (char === '"' && !escape) inString = !inString;
                    if (!inString) {
                        if (char === '{' || char === '[') depth++;
                        if (char === '}' || char === ']') depth--;
                    }
                    escape = (char === '\\' && !escape);
                }

                // 3. 递归补全缺失的括号
                if (inString) s += '"';

                // 找到最后一个完整的对象/数组闭合点（可选逻辑：这里先简单补齐）
                // 更激进的补全：如果是截断在键值对中间，JSON.parse 依然会报错。
                // 我们通过循环尝试减少结尾字符直到解析成功或深度归零
                let attempt = s;
                while (depth > 0) {
                    // 优先尝试闭合数组元素或对象
                    // 简单的全量补全：逆向深度决定补全内容
                    // 这里采用简单的堆栈逆推：我们需要知道每一层是 { 还是 [
                    // 为了简单有效，我们从原始字符串重新扫描堆栈
                    const stack = [];
                    let inS = false;
                    for (let c of attempt) {
                        if (c === '"') inS = !inS;
                        if (!inS) {
                            if (c === '{') stack.push('}');
                            if (c === '[') stack.push(']');
                            if (c === '}' || c === ']') stack.pop();
                        }
                    }
                    attempt += stack.reverse().join('');
                    depth = 0;
                }
                return attempt;
            };

            // 实时匹配逻辑：多块聚合解析 (Multi-Block Aggregation)
            if (data.style_learning) {
                const text = data.style_learning;
                const jsonRegex = /```(?:json)?\s*([\s\S]*?)(?:```|$)/g;
                let match;
                let aggregatedData = {};
                let foundAny = false;

                while ((match = jsonRegex.exec(text)) !== null) {
                    let raw = match[1].trim();
                    if (!raw) continue;

                    try {
                        // 尝试直接解析
                        const parsed = JSON.parse(raw);
                        Object.assign(aggregatedData, parsed);
                        foundAny = true;
                    } catch (e) {
                        // 如果失败，尝试补全修复
                        try {
                            const fixed = fixTruncatedJson(raw);
                            const parsed = JSON.parse(fixed);
                            // 特殊处理元素数组：如果 layout.elements 存在，执行合并而非覆盖
                            if (parsed.layout?.elements && aggregatedData.layout?.elements) {
                                aggregatedData.layout.elements = [...aggregatedData.layout.elements, ...parsed.layout.elements];
                                delete parsed.layout.elements;
                            }
                            Object.assign(aggregatedData, parsed);
                            foundAny = true;
                        } catch (innerE) {
                            // 极度截断场景：如果补全也失败，尝试硬性分段保护，丢弃最后一个不完整项
                            try {
                                const lastValidIndex = raw.lastIndexOf('},');
                                if (lastValidIndex !== -1) {
                                    const chopped = fixTruncatedJson(raw.substring(0, lastValidIndex + 1));
                                    const parsed = JSON.parse(chopped);
                                    Object.assign(aggregatedData, parsed);
                                    foundAny = true;
                                }
                            } catch (finalE) { /* 彻底损坏 */ }
                        }
                    }
                }

                if (foundAny) {
                    const resolved = parseKIE(aggregatedData);
                    if (resolved) return resolved;
                }

                // C. 兜底正则扫描：针对侧边栏关键字段
                const quickMatch = {
                    title: text.match(/"title":\s*"([^"]+)"/)?.[1],
                    venue: text.match(/"venue":\s*"([^"]+)"/)?.[1],
                    date: text.match(/"date":\s*"([^"]+)"/)?.[1],
                    highlights: text.match(/"highlights":\s*"([^"]+)"/)?.[1]
                };
                if (quickMatch.title || quickMatch.highlights) {
                    return parseKIE(quickMatch);
                }
            }
            return parseKIE(data.content);
        }, [data.content, data.style_learning]);

        // 报告出来了，或者以前有内容，就展示标题，内部根据状态显示 loading 或数据
        const hasExtractedModule = (!!data.style_learning) || (!!data.content && Object.keys(data.content).length > 2);

        if (!BaseNode) return null;

        const styleLearning = data.style_learning;

        return (
            <BaseNode
                id={id}
                title="视觉分析"
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
                        <span className="text-[12px] font-bold text-black uppercase">AI 分析状态</span>
                        {isProcessing ? (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-black rounded-full animate-pulse"></span>
                                <span className="text-[12px] font-black text-black uppercase">分析中...</span>
                            </div>
                        ) : styleLearning ? (
                            <div className="flex items-center gap-1">
                                {Sparkles && <Sparkles size={14} className="text-black" />}
                                <span className="text-[12px] font-black text-black uppercase">分析就绪</span>
                            </div>
                        ) : (
                            <span className="text-[12px] font-bold text-black/40 uppercase">等待资产</span>
                        )}
                    </div>

                    {/* 2. 核心：风格分析报告 (收纳模式) */}
                    {styleLearning && (
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setShowNotes(!showNotes)}
                                className="w-full py-2 border border-black text-[12px] font-black uppercase flex items-center justify-center gap-2 hover:bg-zinc-50 transition-colors"
                            >
                                <Scan size={14} />
                                {showNotes ? '收起分析报告' : '查看风格分析报告'}
                            </button>

                            {showNotes && (
                                <div className="bg-white border border-black p-4 flex flex-col gap-3 relative overflow-hidden group max-h-[400px] overflow-y-auto custom-scrollbar">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Bot size={16} className="text-black" />
                                            <span className="text-[12px] font-black uppercase tracking-[0.2em] text-black">AI 风格灵感笔记</span>
                                        </div>
                                        <button
                                            onClick={(e) => handleCopy(e, styleLearning.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim(), 'style_notes')}
                                            className="p-1 hover:bg-zinc-100 transition-colors rounded-sm"
                                            title="复制全部分析内容"
                                        >
                                            {copiedField === 'style_notes' ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-black opacity-40 hover:opacity-100" />}
                                        </button>
                                    </div>

                                    {/* 高级建议：如果 styleLearning 包含多个 JSON，提示用户这可能包含布局信息 */}
                                    <div className="p-3 bg-zinc-50 border border-black/5 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">视觉提示词建议</span>
                                            {(() => {
                                                // 粗暴提取背景提示词作为“纯净 Prompt”
                                                const promptMatch = styleLearning.match(/"backgroundPrompt":\s*"([^"]+)"/);
                                                const purePrompt = promptMatch ? promptMatch[1] : null;
                                                if (purePrompt) {
                                                    return (
                                                        <button
                                                            onClick={(e) => handleCopy(e, purePrompt, 'pure_prompt')}
                                                            className="flex items-center gap-1 px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase hover:bg-zinc-800 transition-colors"
                                                        >
                                                            {copiedField === 'pure_prompt' ? <Check size={10} /> : <Sparkles size={10} />}
                                                            {copiedField === 'pure_prompt' ? '已复制' : '复制风格词'}
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                        <p className="text-[12px] leading-relaxed text-black italic font-medium whitespace-pre-wrap">
                                            {(() => {
                                                // 剥离所有 ```json ... ``` 块，仅展示人类可读的分析文本
                                                return styleLearning.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
                                            })()}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. “重点信息”分组展示 (KIE 展示) - 基于用户反馈优化：只要有报告就显示框架，解决显示残留 Bug */}
                    {(hasExtractedModule && !isProcessing) && (
                        <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                            <div className="flex items-center gap-2 px-1">
                                <span className="text-[12px] font-black uppercase tracking-widest text-black">重点信息</span>
                            </div>

                            <div className="flex flex-col border border-black bg-white max-h-[350px] overflow-y-auto custom-scrollbar">
                                {extractedContent ? (() => {
                                    const resolved = extractedContent;
                                    return (
                                        <div className="flex flex-col">
                                            {/* A. 核心信息块 - 分组展示所有活动项 */}
                                            {(() => {
                                                const itemsToRender = resolved.items && resolved.items.length > 0
                                                    ? resolved.items
                                                    : [resolved];

                                                return itemsToRender.map((item, groupIdx) => {
                                                    // 合并基础字段和亮点
                                                    const fields = ['title', 'venue', 'date', 'price', 'description'];
                                                    const baseContent = fields
                                                        .map(f => item[f])
                                                        .filter(v => v && String(v).trim())
                                                        .map(v => String(v).trim());

                                                    // 获取亮点 (支持 item 级或全局兜底)
                                                    const itemHighlights = item.highlights
                                                        ? String(item.highlights).split('\n').filter(l => l.trim())
                                                        : (itemsToRender.length === 1 && resolved.highlights ? String(resolved.highlights).split('\n').filter(l => l.trim()) : []);

                                                    const groupContent = [...baseContent, ...itemHighlights];

                                                    if (groupContent.length === 0) return null;

                                                    return (
                                                        <div key={groupIdx} className="flex flex-col border-b border-black last:border-b-0">
                                                            <div className="flex items-center justify-between px-2 py-1 bg-zinc-50 border-b border-black">
                                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">
                                                                    {itemsToRender.length > 1 ? `项目 ${groupIdx + 1}` : '重点内容'}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => handleCopy(e, groupContent.join('\n'), `copy_group_${groupIdx}`)}
                                                                    className="p-1 hover:scale-110 transition-transform"
                                                                >
                                                                    {copiedField === `copy_group_${groupIdx}` ? <Check size={10} className="text-green-600" /> : <Copy size={10} />}
                                                                </button>
                                                            </div>
                                                            <div className="p-3 flex flex-col gap-2.5">
                                                                {groupContent.map((text, idx) => (
                                                                    <div key={idx} className="flex gap-2.5 text-[12px] leading-snug">
                                                                        <span className="font-bold text-black shrink-0">•</span>
                                                                        <span className="text-black font-bold break-words">{text}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}

                                            {(!resolved.items || resolved.items.length === 0) && !resolved.highlights && !resolved.title && (
                                                <div className="p-6 flex flex-col items-center justify-center gap-2 opacity-40">
                                                    <Bot size={16} className="text-zinc-400" />
                                                    <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">无有效结构化内容</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })() : isProcessing ? (
                                    <div className="p-6 flex flex-col items-center justify-center gap-2 opacity-50">
                                        <Loader2 size={16} className="animate-spin text-zinc-400" />
                                        <span className="text-[11px] italic text-zinc-400">正在实时抓取报告中的关键信息...</span>
                                    </div>
                                ) : (
                                    <div className="p-6 flex flex-col items-center justify-center gap-2 opacity-40">
                                        <Bot size={16} className="text-zinc-400" />
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">暂未识别到结构化信息</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!styleLearning && !isProcessing && (
                        <div className="py-10 flex flex-col items-center justify-center border border-black gap-3 text-zinc-500">
                            {Scan && <Scan size={30} strokeWidth={1} />}
                            <span className="text-[12px] font-black uppercase tracking-widest text-center px-6 leading-relaxed">
                                请将图层资产连入此节点进行视觉分析
                            </span>
                        </div>
                    )}

                    {/* 3. 执行按钮 (精简版) */}
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
                            {isProcessing ? '分析中' : '启动分析'}
                        </button>
                    </div>
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.RefinerNodeRF = RefinerNode;
    console.log('✅ RefinerNodeRF (Enhanced) Loaded');
})();
