/**
 * StyleAnalyzerNode - 视觉风格专家节点 (Magnes Mono)
 * V1.1: 支持双评分标准（还原模式 vs 创作模式）
 */

(function () {
    const { React } = window;
    const { useMemo, useState, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useEdges, useNodes, useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || UI.LucideIcons || {};
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const StyleAnalyzerNode = ({ id, data, selected, nodesMap, connections: studioConnections }) => {
        const {
            Palette, Sparkles, Check, Copy, Zap,
            Sun, Move, Wand2, RefreshCw, Target, Heart
        } = Icons;
        // Use Palette for both icon usages
        const PaletteIcon = Palette;

        const rfNodes = (window.ReactFlow?.useNodes && window.ReactFlow.useNodes()) || [];
        const rfEdges = (window.ReactFlow?.useEdges && window.ReactFlow.useEdges()) || [];
        const { addNodes, getNode, setNodes } = useReactFlow();

        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ startGeneration: () => { }, apiConfigs: [] }) };
        const { startGeneration, apiConfigs = [] } = useMagnesContext();

        const [showGenome] = useState(true);
        const [copied, setCopied] = useState(false);
        // V1.0: 验证模式开关
        const [enableValidation, setEnableValidation] = useState(false);
        // V1.1: 评分模式选择（clone = 还原模式, evolution = 创作模式）
        const [evaluationMode, setEvaluationMode] = useState('evolution');
        // V1.1: 版本历史展开状态（默认折叠）
        // V1.2: 提示词编辑状态
        const [isEditingPrompt, setIsEditingPrompt] = useState(false);
        const [editedPrompt, setEditedPrompt] = useState('');
        // V1.3: 提示词收藏状态
        const [isPromptFavorited, setIsPromptFavorited] = useState(false);
        const [isSavingPrompt, setIsSavingPrompt] = useState(false);
        // 基础数据（必须在 hooks 之前定义）
        const isProcessing = data.isGenerating;
        const stylePrompt = data.style_prompt || '';
        const bgPrompt = stylePrompt;
        const styleGenome = data.style_genome || {};
        const macroType = data.macro_type || '';
        const styleEvolution = data.style_evolution || [];

        // Debug: Log data changes
        useEffect(() => {
            console.log('[StyleAnalyzer] Data updated:', {
                hasStyleEvolution: !!data.style_evolution,
                evolutionLength: styleEvolution.length,
                stylePrompt: data.style_prompt?.substring(0, 50)
            });
        }, [data.style_evolution, data.style_prompt]);

        // 状态定义
        const [showVersionHistory, setShowVersionHistory] = useState(false);
        const [selectedVersion, setSelectedVersion] = useState(null);
        const [prevEvolutionLength, setPrevEvolutionLength] = useState(styleEvolution.length);

        // 当新版本生成时，自动展开版本历史
        useEffect(() => {
            if (styleEvolution.length > prevEvolutionLength) {
                setShowVersionHistory(true);
                // 默认选中最新版本
                setSelectedVersion(styleEvolution[styleEvolution.length - 1]);
                setPrevEvolutionLength(styleEvolution.length);
            }
        }, [styleEvolution.length, prevEvolutionLength, styleEvolution]);

        // V1.0: 验证结果数据
        const validationMode = data.validation_mode;
        const generatedImage = data.generated_image;
        const criticReport = data.critic_report;

        // 查找上游图片 - 必须在 useEffect 之前定义
        const sourceImageUrl = useMemo(() => {
            const nodes = nodesMap ? Array.from(nodesMap.values()) : rfNodes;
            const edges = studioConnections ? studioConnections.map(c => ({ source: c.from, target: c.to })) : rfEdges;
            const edge = edges.find(e => e.target === id);
            if (!edge) return null;
            const sourceNode = nodes.find(n => n.id === edge.source);
            return sourceNode?.data?.content || sourceNode?.data?.image_url || null;
        }, [id, nodesMap, studioConnections, rfNodes, rfEdges]);

        // V1.0: 监听验证结果，自动创建验证节点
        // 使用节点数据中的长度记录，防止组件重新创建时 ref 重置
        useEffect(() => {
            if (validationMode && generatedImage && data.create_validator_node) {
                const currentNode = getNode(id);
                if (!currentNode) return;

                // 检查是否已存在关联的验证节点
                const existingValidator = rfNodes.find(n =>
                    n.type === 'style-validator' &&
                    n.data?.source_node_id === id
                );

                if (existingValidator) {
                    // 比较节点中记录的长度和当前长度，防止无限循环
                    const lastSyncedLength = existingValidator.data?._lastEvolutionLength || 0;
                    const validatorEvolutionLength = existingValidator.data?.style_evolution?.length || 0;
                    // 比较实际数据，而不仅仅是长度
                    const currentVersions = styleEvolution.map(e => e.version).join(',');
                    const validatorVersions = (existingValidator.data?.style_evolution || []).map(e => e.version).join(',');
                    const needsUpdate = styleEvolution.length > lastSyncedLength
                        || styleEvolution.length > validatorEvolutionLength
                        || currentVersions !== validatorVersions;

                    console.log('[StyleAnalyzer] Checking update:', {
                        currentLength: styleEvolution.length,
                        lastSyncedLength,
                        validatorEvolutionLength,
                        currentVersions,
                        validatorVersions,
                        needsUpdate
                    });

                    if (needsUpdate) {
                        console.log('[StyleAnalyzer] Updating validator:', {
                            evolutionLength: styleEvolution.length,
                            lastSyncedLength,
                            validatorEvolutionLength,
                            currentVersions,
                            validatorVersions
                        });
                        setNodes(nodes => nodes.map(n => {
                            if (n.id !== existingValidator.id) return n;
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    style_evolution: styleEvolution,
                                    critic_report: criticReport,  // 同时传递评分报告
                                    _lastEvolutionLength: styleEvolution.length  // 记录已同步的长度
                                }
                            };
                        }));
                    }
                    return;
                }

                // 创建新的验证节点
                const validatorId = `style-validator-${Date.now()}`;
                addNodes({
                    id: validatorId,
                    type: 'style-validator',
                    position: {
                        x: currentNode.position.x + 360, // 放在右侧
                        y: currentNode.position.y
                    },
                    data: {
                        source_node_id: id,
                        source_image: sourceImageUrl,
                        generated_image: generatedImage,
                        style_prompt: stylePrompt,
                        critic_report: criticReport,
                        style_evolution: styleEvolution,
                        original_prompt: styleEvolution?.find(v => v.strategy === 'extract')?.prompt || styleEvolution?.[0]?.prompt || '',
                        _lastEvolutionLength: styleEvolution.length  // 记录初始长度
                    }
                });

                // 可选：自动创建连线
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('magnes:create-edge', {
                        detail: {
                            source: id,
                            target: validatorId,
                            label: '验证'
                        }
                    }));
                }, 50);
            }
        }, [validationMode, generatedImage, id, getNode, addNodes, rfNodes, sourceImageUrl, stylePrompt, criticReport, styleEvolution, data.create_validator_node]);

        // 监听再次优化事件（来自 StyleValidatorNode）- 必须在 sourceImageUrl 定义后
        useEffect(() => {
            const handleRegenerate = (e) => {
                const { sourceNodeId, currentPrompt, strategy, styleEvolution: incomingStyleEvolution, sourceImage } = e.detail;
                console.log('[StyleAnalyzer] Received regenerate event:', {
                    sourceNodeId,
                    id,
                    currentPrompt,
                    isProcessing,
                    incomingStyleEvolutionLength: incomingStyleEvolution?.length,
                    incomingStyleEvolution: incomingStyleEvolution,  // [DEBUG]
                    sourceImage  // [DEBUG]
                });
                if (sourceNodeId === id && currentPrompt && !isProcessing) {
                    console.log('[StyleAnalyzer] Processing regenerate request:', strategy);
                    // 自动开启验证模式
                    setEnableValidation(true);
                    // 直接使用事件中的 currentPrompt，不依赖 bgPrompt
                    setTimeout(() => {
                        if (!isProcessing) {
                            // 使用事件中传递的 styleEvolution，如果没有则使用本地的
                            const evolutionToPass = incomingStyleEvolution && incomingStyleEvolution.length > 0
                                ? incomingStyleEvolution
                                : styleEvolution;
                            // 使用事件中传递的 sourceImage（原图），如果没有则使用自己的 sourceImageUrl
                            const imageToUse = sourceImage || sourceImageUrl;
                            console.log('[StyleAnalyzer] Passing style_evolution:', evolutionToPass?.length || 0, 'entries');
                            console.log('[StyleAnalyzer] Using source image:', imageToUse);
                            startGeneration({
                                type: 'style_evolve',
                                nodeId: id,
                                sourceImages: imageToUse ? [imageToUse] : [],  // 必须传递 sourceImages，后端需要它来获取原图 URL
                                options: {
                                    run_style_evolve: true,
                                    evolution_strategy: strategy,
                                    current_prompt: currentPrompt,  // 使用事件中的 prompt
                                    enable_validation: true,  // 再优化默认开启验证
                                    evaluation_mode: evaluationMode,
                                    source_image: imageToUse,
                                    style_evolution: evolutionToPass  // 使用验证节点传递的版本历史
                                },
                                apiConfigs
                            });
                        }
                    }, 100);
                }
            };

            window.addEventListener('magnes:style-regenerate', handleRegenerate);
            return () => window.removeEventListener('magnes:style-regenerate', handleRegenerate);
        }, [id, isProcessing, evaluationMode, sourceImageUrl, apiConfigs, styleEvolution]);

        // V1.2: 监听验证节点的提示词编辑事件
        useEffect(() => {
            const handleUpdateFromValidator = (e) => {
                const { sourceNodeId, newPrompt } = e.detail;
                if (sourceNodeId === id && newPrompt) {
                    console.log('[StyleAnalyzer] 从验证节点接收编辑后的提示词:', newPrompt.substring(0, 50) + '...');
                    // 更新当前提示词
                    setNodes(nodes => nodes.map(n => {
                        if (n.id !== id) return n;
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                style_prompt: newPrompt
                            }
                        };
                    }));
                }
            };

            window.addEventListener('magnes:update-validator-prompt', handleUpdateFromValidator);
            return () => window.removeEventListener('magnes:update-validator-prompt', handleUpdateFromValidator);
        }, [id, setNodes]);

        const handleAnalyze = (e) => {
            e.stopPropagation();
            if (!sourceImageUrl) return;

            startGeneration({
                type: 'style_analyze',
                sourceImages: [sourceImageUrl],
                nodeId: id,
                options: {
                    run_style_analyzer: true,
                    run_refiner: false
                },
                apiConfigs
            });
        };


        const handleCopyPrompt = (e) => {
            e.stopPropagation();
            // 复制选中版本的提示词，或当前提示词
            const promptToCopy = selectedVersion?.prompt || bgPrompt;
            if (!promptToCopy) return;
            navigator.clipboard.writeText(promptToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        // V1.2: 提示词编辑功能
        const handleStartEdit = (e) => {
            e.stopPropagation();
            const promptToEdit = selectedVersion?.prompt || bgPrompt;
            setEditedPrompt(promptToEdit);
            setIsEditingPrompt(true);
        };

        const handleCancelEdit = (e) => {
            e.stopPropagation();
            setIsEditingPrompt(false);
            setEditedPrompt('');
        };

        const handleSaveEdit = (e) => {
            e.stopPropagation();
            if (!editedPrompt.trim()) return;

            // 更新节点数据（应用编辑后的提示词）
            const event = new CustomEvent('magnes:update-node-data', {
                detail: {
                    nodeId: id,
                    data: {
                        style_prompt: editedPrompt.trim()
                    }
                }
            });
            window.dispatchEvent(event);

            setIsEditingPrompt(false);
            setEditedPrompt('');
        };

        // V1.3: 收藏提示词到灵感提示词库
        const handleFavoritePrompt = async () => {
            const promptToSave = selectedVersion?.prompt || bgPrompt;
            if (!promptToSave || isSavingPrompt) return;

            setIsSavingPrompt(true);
            console.log('[StyleAnalyzer] 收藏提示词:', promptToSave.substring(0, 50) + '...');

            try {
                // 触发收藏事件，由 use-window-events 处理 API 调用
                window.dispatchEvent(new CustomEvent('magnes:save-prompt-to-library', {
                    detail: {
                        prompt: promptToSave,
                        source: 'style_analyzer',
                        nodeId: id,
                        version: selectedVersion?.version,
                        strategy: selectedVersion?.strategy,
                        macroType: macroType,
                        timestamp: Date.now()
                    }
                }));

                setIsPromptFavorited(true);
                // 3秒后重置状态，允许再次收藏
                setTimeout(() => setIsPromptFavorited(false), 3000);
            } catch (err) {
                console.error('[StyleAnalyzer] 收藏提示词失败:', err);
            } finally {
                setIsSavingPrompt(false);
            }
        };

        // V1.2: 基于用户编辑后的提示词进行优化
        const handleOptimizeWithEdit = (strategy) => {
            const promptToUse = isEditingPrompt ? editedPrompt.trim() : (selectedVersion?.prompt || bgPrompt);
            if (!promptToUse || isProcessing) return;

            console.log('[StyleAnalyzer] Starting evolution with edited prompt:', { strategy, enableValidation, evaluationMode });

            startGeneration({
                type: 'style_evolve',
                nodeId: id,
                sourceImages: [sourceImageUrl],
                options: {
                    run_style_evolve: true,
                    evolution_strategy: strategy,
                    current_prompt: promptToUse,  // 使用用户编辑后的提示词
                    enable_validation: enableValidation,
                    evaluation_mode: evaluationMode,
                    source_image: sourceImageUrl,
                    style_evolution: styleEvolution,
                    is_user_edited: isEditingPrompt  // [NEW] 标记这是用户编辑后的优化
                },
                apiConfigs
            });

            // 如果正在编辑，退出编辑模式
            if (isEditingPrompt) {
                setIsEditingPrompt(false);
                setEditedPrompt('');
            }
        };

        // V1.1: 回滚到指定版本
        const handleRollback = (version) => {
            if (!version?.prompt) return;
            // 更新节点数据
            const event = new CustomEvent('magnes:update-node-data', {
                detail: {
                    nodeId: id,
                    data: {
                        style_prompt: version.prompt,
                        // 截断 evolution 数组到该版本
                        style_evolution: styleEvolution.slice(0, version.version)
                    }
                }
            });
            window.dispatchEvent(event);
            setSelectedVersion(null);
            setShowVersionHistory(false);
        };

        if (!BaseNode) return React.createElement('div', { className: 'p-4 bg-red-500 text-white' }, 'Error: BaseNode Missing');

        const monoStyle = {
            width: '320px',
            border: '1px solid #000',
            borderRadius: '0px',
            boxShadow: 'none',
            headerClass: 'bg-white text-black border-b border-black'
        };

        const strategyItems = [
            { icon: React.createElement(Zap, { size: 14 }), label: '追加风格', action: 'append' },
            { icon: React.createElement(Sun, { size: 14 }), label: '增强光影', action: 'lighting' },
            { icon: React.createElement(Move, { size: 14 }), label: '优化构图', action: 'composition' },
            { icon: React.createElement(Wand2, { size: 14 }), label: 'AI 进化', action: 'evolve' }
        ];

        const genomeLabels = {
            palette: '配色',
            typography: '字体',
            composition: '构图',
            era: '风格',
            vibe: '氛围',
            lighting: '光影',
            texture: '质感',
            geometry: '几何',
            rhythm: '节奏'
        };

        const getTranslatedLabel = (key) => {
            const lower = key.toLowerCase();
            const normalized = lower
                .replace(/^color_/, '')
                .replace(/_style$/, '')
                .replace(/^mood$/, 'vibe');
            return genomeLabels[normalized] || key;
        };

        // V1.1: 评分模式选项（使用 emoji 代替图标组件，避免 undefined）
        const evaluationModeOptions = [
            {
                value: 'evolution',
                label: '创作模式',
                icon: '🎨',
                desc: '评估风格传承和创意质量'
            },
            {
                value: 'clone',
                label: '还原模式',
                icon: '🎯',
                desc: '评估与原图的相似程度'
            }
        ];

        return React.createElement(BaseNode, {
            id: id,
            title: "风格分析",
            icon: Palette,
            selected: selected,
            style: monoStyle,
            handles: {
                target: [{ id: 'input', top: '50%' }],
                source: [{ id: 'output', top: '50%' }]
            },
            headerExtra: isProcessing && React.createElement(RefreshCw, { size: 16, className: "animate-spin" })
        },
            React.createElement('div', { className: "flex flex-col gap-4" },
                // 状态指示器
                React.createElement('div', { className: "flex items-center justify-between border-b border-black/10 pb-2" },
                    React.createElement('span', { className: "text-[11px] font-bold text-black uppercase" }, "风格分析状态"),
                    isProcessing
                        ? React.createElement('div', { className: "flex items-center gap-2" },
                            React.createElement('span', { className: "w-2 h-2 bg-black rounded-full animate-pulse" }),
                            React.createElement('span', { className: "text-[12px] font-black text-black uppercase" }, "分析中...")
                        )
                        : (bgPrompt || Object.keys(styleGenome).length > 0)
                            ? React.createElement('div', { className: "flex items-center gap-1" },
                                React.createElement(Sparkles, { size: 14, className: "text-black" }),
                                React.createElement('span', { className: "text-[12px] font-black text-black uppercase" }, "分析完成")
                            )
                            : React.createElement('span', { className: "text-[12px] font-bold text-black/40 uppercase" }, "等待资产")
                ),

                // 大类标识
                macroType && React.createElement('div', { className: "flex items-center gap-1.5 -mt-2" },
                    React.createElement('span', { className: "px-1.5 py-0.5 bg-black text-white text-[9px] font-black uppercase" }, "分析模式"),
                    React.createElement('span', { className: "text-[9px] font-black text-black" }, macroType)
                ),

                // 内容区域
                (bgPrompt || Object.keys(styleGenome).length > 0)
                    ? React.createElement(React.Fragment, null,
                        // Style Prompt
                        bgPrompt && React.createElement('div', { className: "flex flex-col gap-2 border border-black p-3 bg-zinc-50 relative group" },
                            React.createElement('div', { className: "flex items-center justify-between" },
                                React.createElement('div', { className: "flex items-center gap-2" },
                                    React.createElement('span', { className: "text-[10px] font-black text-black/40" },
                                        selectedVersion ? `${selectedVersion.displayLabel || 'V' + selectedVersion.displayVersion} 提示词` : "当前提示词"
                                    ),
                                    styleEvolution.length > 0 && React.createElement('button', {
                                        onClick: (e) => { e.stopPropagation(); setShowVersionHistory(!showVersionHistory); },
                                        className: "px-1 bg-black text-white text-[10px] font-white uppercase hover:bg-yellow-500 transition-colors"
                                    }, `V${styleEvolution.length} ▼`)
                                ),
                                React.createElement('div', { className: "flex items-center gap-1" },
                                    // V1.2: 编辑按钮
                                    !isEditingPrompt && React.createElement('button', {
                                        onClick: handleStartEdit,
                                        className: "px-1.5 py-0.5 bg-zinc-200 text-black text-[9px] font-bold hover:bg-zinc-300 transition-colors"
                                    }, "编辑"),
                                    // V1.3: 收藏提示词按钮
                                    !isEditingPrompt && React.createElement('button', {
                                        onClick: handleFavoritePrompt,
                                        disabled: isSavingPrompt,
                                        className: `hover:scale-110 transition-transform ${isPromptFavorited ? 'text-red-500' : 'text-black/60 hover:text-red-500'}`
                                    },
                                        Heart ? React.createElement(Heart, { size: 14, fill: isPromptFavorited ? 'currentColor' : 'none' }) : '♥'
                                    ),
                                    React.createElement('button', { onClick: handleCopyPrompt, className: "hover:scale-110 transition-transform" },
                                        copied
                                            ? React.createElement(Check, { size: 14, className: "text-green-600" })
                                            : React.createElement(Copy, { size: 14 })
                                    )
                                )
                            ),
                            // V1.2: 编辑模式显示 textarea，否则显示只读文本
                            isEditingPrompt
                                ? React.createElement('div', { className: "flex flex-col gap-2" },
                                    React.createElement('textarea', {
                                        value: editedPrompt,
                                        onChange: (e) => setEditedPrompt(e.target.value),
                                        className: "w-full min-h-[80px] p-2 text-[12px] font-bold text-black border border-black resize-none focus:outline-none focus:ring-1 focus:ring-black",
                                        placeholder: "在此编辑提示词..."
                                    }),
                                    React.createElement('div', { className: "flex items-center justify-end gap-1" },
                                        React.createElement('button', {
                                            onClick: handleCancelEdit,
                                            className: "px-2 py-1 bg-zinc-200 text-black text-[9px] font-bold hover:bg-zinc-300 transition-colors"
                                        }, "取消"),
                                        React.createElement('button', {
                                            onClick: handleSaveEdit,
                                            className: "px-2 py-1 bg-black text-white text-[9px] font-bold hover:bg-zinc-800 transition-colors"
                                        }, "保存")
                                    )
                                )
                                : React.createElement('p', { className: "text-[12px] font-bold leading-tight italic text-black break-words" },
                                    selectedVersion?.prompt || bgPrompt
                                ),
                            // 当前版本的优化说明
                            selectedVersion?.critique && React.createElement('div', { className: "mt-2 pt-2 border-t border-black/10" },
                                React.createElement('div', { className: "text-[9px] font-bold text-black/60 mb-1" }, "优化说明:"),
                                React.createElement('p', { className: "text-[10px] text-black/80" }, selectedVersion.critique),
                                selectedVersion.changes?.length > 0 && React.createElement('div', { className: "mt-1 flex flex-wrap gap-1" },
                                    selectedVersion.changes.map((change, i) =>
                                        React.createElement('span', { key: i, className: "text-[8px] bg-black/10 px-1 py-0.5" }, change)
                                    )
                                )
                            )
                        ),

                        // V1.1: 版本历史列表
                        showVersionHistory && styleEvolution.length > 0 && React.createElement('div', { className: "border border-black p-2 bg-white" },
                            React.createElement('div', { className: "flex items-center justify-between mb-2" },
                                React.createElement('span', { className: "text-[10px] font-black text-black" }, "版本历史"),
                                React.createElement('button', {
                                    onClick: () => setShowVersionHistory(false),
                                    className: "text-[9px] text-black/60 hover:text-black"
                                }, "[收起]")
                            ),
                            React.createElement('div', { className: "flex flex-col gap-1" },
                                (() => {
                                    // 统一版本显示逻辑：与风格验证节点一致
                                    // V0: extract 版本（原图/原始提取）
                                    // V1, V2, V3...: 优化版本
                                    const versions = [];

                                    // 添加 V0（extract 版本）
                                    const v0Entry = styleEvolution.find(v => v.strategy === 'extract');
                                    if (v0Entry) {
                                        versions.push({
                                            ...v0Entry,
                                            displayVersion: 0,
                                            displayLabel: 'V0 原始提取'
                                        });
                                    }

                                    // 添加 V1, V2, V3...（优化版本）
                                    const optimizedVersions = styleEvolution.filter(v => v.strategy !== 'extract');
                                    optimizedVersions.forEach((v, idx) => {
                                        versions.push({
                                            ...v,
                                            displayVersion: idx + 1, // V1, V2, V3...
                                            displayLabel: `V${idx + 1} ${v.strategy === 'evolve' ? 'AI进化' : v.strategy === 'lighting' ? '增强光影' : v.strategy === 'composition' ? '优化构图' : v.strategy === 'append' ? '追加风格' : '优化'}`
                                        });
                                    });

                                    // 倒序显示（最新的在前）
                                    return [...versions].reverse().map((version, idx) => {
                                        const isLatest = idx === 0;
                                        const isSelected = selectedVersion?.version === version.version;

                                        return React.createElement('button', {
                                            key: version.version,
                                            onClick: () => setSelectedVersion(version),
                                            className: `text-left p-2 border text-[10px] transition-colors ${isSelected
                                                    ? 'bg-white border-black'
                                                    : 'bg-zinc-50 text-black border-black/20 hover:border-black'
                                                }`
                                        },
                                            React.createElement('div', { className: "flex items-center justify-between" },
                                                React.createElement('span', { className: "font-bold" }, `${version.displayLabel}${isLatest ? ' (当前)' : ''}`),
                                                React.createElement('span', { className: "opacity-70 text-[8px]" },
                                                    version.strategy === 'extract' ? '原始提取' : '优化版本'
                                                )
                                            ),
                                            React.createElement('p', { className: "mt-1 truncate opacity-80" }, version.prompt?.substring(0, 40) + "..."),
                                            // 回滚按钮（仅非当前版本显示）
                                            !isLatest && isSelected && React.createElement('button', {
                                                onClick: (e) => { e.stopPropagation(); handleRollback(version); },
                                                className: "mt-1 px-2 py-1 bg-white text-black text-[8px] font-bold border border-black hover:bg-zinc-100"
                                            }, "回滚到此版本")
                                        );
                                    });
                                })()
                            )
                        ),

                        // Style Genome
                        Object.entries(styleGenome).filter(([_, tags]) => (Array.isArray(tags) ? tags.length > 0 : !!tags)).length > 0 &&
                        React.createElement('div', { className: "flex flex-col gap-2" },
                            React.createElement('div', { className: "text-[10px] font-black text-black" }, "美学基因组"),
                            React.createElement('div', { className: "grid grid-cols-2 gap-px bg-white border border-black" },
                                Object.entries(styleGenome)
                                    .filter(([_, tags]) => (Array.isArray(tags) ? tags.length > 0 : !!tags))
                                    .map(([key, tags]) =>
                                        React.createElement('div', { key: key, className: "bg-white p-1 flex flex-col gap-1" },
                                            React.createElement('span', { className: "text-[8px] font-black text-black/40" }, getTranslatedLabel(key)),
                                            React.createElement('div', { className: "flex flex-wrap gap-1" },
                                                (Array.isArray(tags) ? tags : [tags]).slice(0, 3).map((tag, i) =>
                                                    React.createElement('span', { key: i, className: "text-[9px] font-bold border border-black p-1 leading-tight text-black" }, tag)
                                                )
                                            )
                                        )
                                    )
                            )
                        ),

                        // 执行模式选择（V1.2: 简洁勾选设计）
                        React.createElement('div', { className: "border border-black p-2 bg-zinc-50" },
                            React.createElement('div', { className: "text-[10px] font-black text-black mb-2" }, "执行模式"),
                            React.createElement('div', { className: "flex flex-col gap-2" },
                                // 选项1: 优化模式（默认）
                                React.createElement('button', {
                                    onClick: () => setEnableValidation(false),
                                    className: "flex items-start gap-2 p-2 border border-black bg-white text-left hover:bg-zinc-50 transition-colors"
                                },
                                    React.createElement('div', { className: "mt-0.5 text-[12px]" }, !enableValidation ? '✓' : '○'),
                                    React.createElement('div', { className: "flex-1" },
                                        React.createElement('div', { className: "text-[11px] font-bold" }, "优化模式"),
                                        React.createElement('div', { className: "text-[9px] text-zinc-500 mt-0.5" }, "仅优化提示词，不生成图片（约2-3秒）")
                                    )
                                ),
                                // 选项2: 验证模式
                                React.createElement('button', {
                                    onClick: () => setEnableValidation(true),
                                    className: "flex items-start gap-2 p-2 border border-black bg-white text-left hover:bg-zinc-50 transition-colors"
                                },
                                    React.createElement('div', { className: "mt-0.5 text-[12px]" }, enableValidation ? '✓' : '○'),
                                    React.createElement('div', { className: "flex-1" },
                                        React.createElement('div', { className: "text-[11px] font-bold" }, "验证模式"),
                                        React.createElement('div', { className: "text-[9px] text-zinc-500 mt-0.5" }, "生成测试图并评分（约8-12秒）")
                                    )
                                )
                            )
                        ),

                        // 评分标准选择（仅在验证模式下显示）
                        enableValidation && React.createElement('div', { className: "border border-black p-2 bg-zinc-50" },
                            React.createElement('div', { className: "text-[10px] font-black text-black mb-2" }, "评分标准"),
                            React.createElement('div', { className: "flex gap-2" },
                                evaluationModeOptions.map(option =>
                                    React.createElement('button', {
                                        key: option.value,
                                        onClick: () => setEvaluationMode(option.value),
                                        className: `flex-1 flex flex-col items-center gap-1 p-2 border transition-colors ${evaluationMode === option.value
                                                ? 'bg-black text-white border-black'
                                                : 'bg-white text-black border-black hover:bg-zinc-100'
                                            }`
                                    },
                                        React.createElement('span', { className: "text-[12px]" }, option.icon),
                                        React.createElement('span', { className: "text-[9px] font-black" }, option.label),
                                        React.createElement('span', { className: "text-[8px] opacity-70" }, option.desc)
                                    )
                                )
                            )
                        ),

                        // V1.2: 提示编辑时的操作按钮
                        isEditingPrompt && React.createElement('div', { className: "flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200" },
                            React.createElement('span', { className: "text-[10px] font-bold text-yellow-700" }, "💡 提示词已编辑，选择优化策略应用:"),
                            React.createElement('button', {
                                onClick: (e) => { e.stopPropagation(); handleCancelEdit(e); },
                                className: "px-2 py-1 bg-zinc-200 text-black text-[9px] font-bold hover:bg-zinc-300 transition-colors ml-auto"
                            }, "取消")
                        ),

                        // 策略按钮
                        React.createElement('div', { className: "mt-2 border-t border-black flex bg-white -mx-2 -mb-2" },
                            strategyItems.map((item, i) =>
                                React.createElement('button', {
                                    key: i,
                                    onClick: (e) => { e.stopPropagation(); handleOptimizeWithEdit(item.action); },
                                    disabled: isProcessing || (!bgPrompt && !isEditingPrompt),
                                    className: `flex-1 flex flex-col items-center justify-center py-3 gap-1 border-r border-black last:border-r-0 transition-colors group
                                        ${isProcessing || (!bgPrompt && !isEditingPrompt) ? 'opacity-50 cursor-not-allowed bg-zinc-50' : 'hover:bg-black hover:text-white bg-white'}`
                                },
                                    React.createElement('div', { className: "group-hover:scale-110 transition-transform" }, item.icon),
                                    React.createElement('span', { className: "text-[8px] font-black" }, item.label)
                                )
                            )
                        )
                    )
                    : !isProcessing && React.createElement('div', { className: "py-10 flex flex-col items-center justify-center border border-black gap-3 text-center bg-white" },
                        React.createElement(Palette, { size: 30, strokeWidth: 1, className: "text-zinc-500" }),
                        React.createElement('span', { className: "text-[12px] font-black uppercase tracking-widest px-6 text-zinc-500" }, "正在等待输入图片以分析风格")
                    ),

                // 分析按钮
                React.createElement('div', { className: "pt-1" },
                    React.createElement('button', {
                        onClick: handleAnalyze,
                        disabled: isProcessing || !sourceImageUrl,
                        className: `w-full py-2.5 mt-1 border border-black font-black text-[12px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest nodrag
                            ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' :
                                !sourceImageUrl ? 'bg-zinc-200 text-zinc-500 border-zinc-200 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`
                    },
                        isProcessing
                            ? React.createElement(React.Fragment, null, React.createElement(RefreshCw, { size: 14, className: "animate-spin" }), '分析中')
                            : React.createElement(React.Fragment, null, React.createElement(Sparkles, { size: 14 }), '提取美学基因')
                    )
                )
            )
        );
    };

    if (window.MagnesComponents) {
        window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
        window.MagnesComponents.Nodes.StyleAnalyzerNode = StyleAnalyzerNode;
    }
})();
