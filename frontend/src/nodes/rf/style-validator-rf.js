/**
 * StyleValidatorNode - 风格验证结果节点 (V1.3)
 * 优化版本：右侧版本 panel，点击切换显示
 */

(function () {
    const { React } = window;
    const { useState, useMemo, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || UI.LucideIcons || {};
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const StyleValidatorNode = ({ id, data, selected }) => {
        const { Download, ArrowRight, RefreshCw, Trash2, Sparkles, Copy, Check, Image, Heart } = Icons;
        const { addNodes, getNode, setNodes } = useReactFlow();

        const {
            source_node_id,
            source_image,
            generated_image,
            style_prompt,
            critic_report,
            style_evolution
        } = data;

        // 调试日志
        useEffect(() => {
            console.log('[StyleValidator] 接收数据:', {
                hasCriticReport: !!critic_report,
                score: critic_report?.score,
                evaluationMode: critic_report?.evaluation_mode,
                hasGeneratedImage: !!generated_image,
                hasSourceImage: !!source_image,
                styleEvolutionLength: style_evolution?.length,
                styleEvolutionVersions: style_evolution?.map(e => e.version),
                styleEvolution: style_evolution?.map(e => ({  // [DEBUG] 简化输出，只显示关键字段
                    version: e.version,
                    strategy: e.strategy,
                    hasGeneratedImage: !!e.generated_image,
                    criticReportScore: e.critic_report?.score,
                    score: e.score
                })),
                rawCriticReport: critic_report
            });
        }, [critic_report, generated_image, source_image, style_evolution]);

        // 当前选中的版本号（0=V0原图, 1=V1, 2=V2...）- [FIX] 默认选中最后一个（最新版本）
        const [selectedVersionId, setSelectedVersionId] = useState(null);
        const [copied, setCopied] = useState(false);
        const [isRegenerating, setIsRegenerating] = useState(false);
        // V1.4: 提示词编辑状态
        const [isEditingPrompt, setIsEditingPrompt] = useState(false);
        const [editedPrompt, setEditedPrompt] = useState('');
        // V1.5: 收藏状态
        const [isFavorited, setIsFavorited] = useState(false);
        // V1.6: 提示词收藏状态
        const [isPromptFavorited, setIsPromptFavorited] = useState(false);
        const [isSavingPrompt, setIsSavingPrompt] = useState(false);

        // 获取版本列表（包含原图V0和验证版本）
        const versions = useMemo(() => {
            const list = [];
            console.log('[StyleValidator] Building versions:', { style_evolution_length: style_evolution?.length, style_evolution });

            // V0 - 原图版本
            if (source_image) {
                // [FIX] 查找 style_evolution 中的 extract 版本作为 V0
                // extract 版本是原始提取的提示词
                const v0Entry = style_evolution?.find(v => v.strategy === 'extract');

                // V0 显示原始提示词（从 extract 条目或节点数据获取）
                // 注意：不要和 V1 混淆，V1 才是第一次优化的提示词
                const v0Prompt = v0Entry?.prompt
                    || data.original_prompt  // 从节点数据获取原始提示词
                    || '原始提示词（未记录）';

                list.push({
                    version: 0,
                    label: 'V0 原图',
                    image: source_image,
                    prompt: v0Prompt,
                    isOriginal: true,
                    changes: v0Entry?.changes || ['原始提取']
                });
            }

            // V1, V2, V3... 验证版本（显示为 V1, V2...，对应 style_evolution 中的非 extract 条目）
            if (style_evolution && style_evolution.length > 0) {
                // 过滤出非 extract 的版本（即优化后的版本）
                const optimizedVersions = style_evolution.filter(v => v.strategy !== 'extract');

                optimizedVersions.forEach((v, idx) => {
                    // [FIX] 显示版本号从 V1 开始（原图是 V0）
                    const displayVersion = idx + 1; // V1, V2, V3...
                    const isLatest = v.version === style_evolution[style_evolution.length - 1]?.version;

                    list.push({
                        version: displayVersion,
                        label: `V${displayVersion} ${v.strategy === 'evolve' ? 'AI进化' : v.strategy === 'lighting' ? '增强光影' : v.strategy === 'composition' ? '优化构图' : v.strategy === 'append' ? '追加风格' : '优化'}`,
                        image: v.generated_image || generated_image,
                        prompt: v.prompt,
                        isValidated: true,
                        changes: v.changes || [],
                        critique: v.critique,
                        score: v.critic_report?.score !== undefined ? v.critic_report.score : v.score,
                        critic_report: v.critic_report,  // [NEW] 保存完整的 critic_report
                        _debugSource: v.critic_report?.score !== undefined ? 'critic_report.score' : 'v.score' // [DEBUG]
                    });
                });
            }

            console.log('[StyleValidator] Versions built:', list.map(v => ({ version: v.version, label: v.label, hasImage: !!v.image, score: v.score, scoreSource: v._debugSource, hasCriticReport: !!v.critic_report })));
            return list;
        }, [source_image, generated_image, style_evolution, critic_report]);

        // [FIX] 当前显示的内容 - 直接从选中的版本获取
        const currentDisplay = useMemo(() => {
            // 如果没有选中版本，默认选中最后一个（最新）
            const targetVersionId = selectedVersionId !== null ? selectedVersionId : (versions.length > 0 ? versions[versions.length - 1].version : null);
            const v = versions.find(v => v.version === targetVersionId);

            console.log('[StyleValidator] currentDisplay:', { selectedVersionId, targetVersionId, versionsLength: versions.length, labels: versions.map(v => v.label), selectedVersionScore: v?.score, selectedVersionCriticReport: !!v?.critic_report });

            if (!v) {
                // 没有版本数据时的兜底
                return {
                    image: generated_image,
                    prompt: style_prompt,
                    label: '验证版',
                    score: critic_report?.score,
                    improvementSuggestion: critic_report?.improvement_suggestion,
                    isLatest: true
                };
            }

            return {
                image: v.image,
                prompt: v.prompt,
                label: v.label,
                score: v.score,
                changes: v.changes,
                critique: v.critique,
                improvementSuggestion: v.critic_report?.improvement_suggestion,
                isLatest: v.version === versions[versions.length - 1]?.version
            };
        }, [selectedVersionId, versions, generated_image, style_prompt, critic_report]);

        // 评分等级
        const scoreLevel = useMemo(() => {
            const score = currentDisplay.score;
            const hasScore = score !== null && score !== undefined && !isNaN(score);
            console.log('[StyleValidator] 评分计算:', { score, type: typeof score, hasScore, currentDisplayLabel: currentDisplay.label });
            if (!hasScore) return null;
            if (score >= 90) return { label: '优秀', color: 'bg-green-500' };
            if (score >= 80) return { label: '良好', color: 'bg-blue-500' };
            if (score >= 60) return { label: '一般', color: 'bg-yellow-500' };
            return { label: '较差', color: 'bg-red-500' };
        }, [currentDisplay.score, currentDisplay.label]);

        // 复制提示词
        const handleCopyPrompt = () => {
            if (!currentDisplay.prompt) return;
            navigator.clipboard.writeText(currentDisplay.prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        // V1.5: 收藏功能
        const handleFavorite = () => {
            const newFavoritedState = !isFavorited;
            setIsFavorited(newFavoritedState);

            if (newFavoritedState && currentDisplay.image) {
                // 触发收藏事件，通知应用添加到收藏列表
                window.dispatchEvent(new CustomEvent('magnes:add-to-favorites', {
                    detail: {
                        imageUrl: currentDisplay.image,
                        prompt: currentDisplay.prompt,
                        label: currentDisplay.label,
                        score: currentDisplay.score,
                        sourceNodeId: id,
                        timestamp: Date.now()
                    }
                }));
                console.log('[StyleValidator] 已添加到收藏:', currentDisplay.label);
            } else {
                // 取消收藏
                window.dispatchEvent(new CustomEvent('magnes:remove-from-favorites', {
                    detail: {
                        imageUrl: currentDisplay.image,
                        sourceNodeId: id
                    }
                }));
                console.log('[StyleValidator] 已从收藏移除:', currentDisplay.label);
            }
        };

        // V1.6: 收藏提示词到灵感提示词库
        const handleFavoritePrompt = async () => {
            const promptToSave = currentDisplay.prompt;
            if (!promptToSave || isSavingPrompt) return;

            setIsSavingPrompt(true);
            console.log('[StyleValidator] 收藏提示词:', promptToSave.substring(0, 50) + '...');

            try {
                // 触发收藏事件
                window.dispatchEvent(new CustomEvent('magnes:save-prompt-to-library', {
                    detail: {
                        prompt: promptToSave,
                        source: 'style_validator',
                        nodeId: id,
                        sourceNodeId: source_node_id,
                        version: currentDisplay.label,
                        score: currentDisplay.score,
                        evaluationMode: critic_report?.evaluation_mode,
                        timestamp: Date.now()
                    }
                }));

                setIsPromptFavorited(true);
                setTimeout(() => setIsPromptFavorited(false), 3000);
            } catch (err) {
                console.error('[StyleValidator] 收藏提示词失败:', err);
            } finally {
                setIsSavingPrompt(false);
            }
        };

        // V1.4: 提示词编辑功能
        const handleStartEdit = () => {
            setEditedPrompt(currentDisplay.prompt || '');
            setIsEditingPrompt(true);
        };

        const handleCancelEdit = () => {
            setIsEditingPrompt(false);
            setEditedPrompt('');
        };

        const handleSaveEdit = () => {
            if (!editedPrompt.trim()) return;
            // 通过事件通知父节点更新提示词
            window.dispatchEvent(new CustomEvent('magnes:update-validator-prompt', {
                detail: {
                    validatorId: id,
                    sourceNodeId: source_node_id,
                    newPrompt: editedPrompt.trim()
                }
            }));
            setIsEditingPrompt(false);
            setEditedPrompt('');
        };

        // V1.4: 基于编辑后的提示词进行再优化
        const handleRegenerateWithEdit = () => {
            const promptToUse = isEditingPrompt ? editedPrompt.trim() : currentDisplay.prompt;
            if (!source_node_id || isRegenerating || !promptToUse) return;
            setIsRegenerating(true);

            console.log('[StyleValidator] 再优化 - 使用提示词:', promptToUse.substring(0, 50) + '...');

            window.dispatchEvent(new CustomEvent('magnes:style-regenerate', {
                detail: {
                    sourceNodeId: source_node_id,
                    currentPrompt: promptToUse,  // 使用当前（或编辑后）的提示词
                    strategy: 'evolve',
                    styleEvolution: style_evolution,
                    sourceImage: source_image
                }
            }));

            // 退出编辑模式
            if (isEditingPrompt) {
                setIsEditingPrompt(false);
                setEditedPrompt('');
            }

            setTimeout(() => setIsRegenerating(false), 3000);
        };

        // 下载图片
        const handleDownload = async () => {
            if (!currentDisplay.image) return;
            try {
                const response = await fetch(currentDisplay.image);
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `magnes-v${selectedVersionId === null ? 'latest' : 'v' + selectedVersionId}-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
            } catch (e) {
                window.open(currentDisplay.image, '_blank');
            }
        };

        // 发送到画布
        const handleSendToCanvas = () => {
            if (!currentDisplay.image) return;
            const currentNode = getNode(id);
            if (!currentNode) return;

            addNodes({
                id: `input-image-${Date.now()}`,
                type: 'input-image',
                position: {
                    x: currentNode.position.x + 400,
                    y: currentNode.position.y
                },
                data: {
                    content: currentDisplay.image,
                    dimensions: { w: 1024, h: 1024 }
                }
            });
        };

        // 触发再次优化
        const handleRegenerate = () => {
            if (!source_node_id || isRegenerating) return;
            setIsRegenerating(true);

            console.log('[StyleValidator] 再优化 - 当前 style_evolution:', style_evolution?.length, '条');
            console.log('[StyleValidator] 再优化 - 版本详情:', style_evolution?.map(v => ({
                version: v.version,
                strategy: v.strategy,
                hasCriticReport: !!v.critic_report,
                score: v.critic_report?.score
            })));

            window.dispatchEvent(new CustomEvent('magnes:style-regenerate', {
                detail: {
                    sourceNodeId: source_node_id,
                    currentPrompt: style_prompt,
                    strategy: 'evolve',
                    styleEvolution: style_evolution,  // [FIX] 传递版本历史（包含 critic_report）
                    sourceImage: source_image  // [FIX] 传递原图 URL，用于再优化时对比
                }
            }));

            setTimeout(() => setIsRegenerating(false), 3000);
        };

        // 删除节点
        const handleDelete = () => {
            window.dispatchEvent(new CustomEvent('magnes:delete-node', {
                detail: { nodeId: id }
            }));
        };

        // 监听版本更新 - [FIX] 新版本生成时，选中最后一个（最新版本）
        useEffect(() => {
            const handleVersionUpdate = (e) => {
                if (e.detail?.validatorId === id) {
                    // 新版本生成，重置到最新版（最后一个）
                    setSelectedVersionId(versions[versions.length - 1]?.version || null);
                }
            };
            window.addEventListener('magnes:validator-version-update', handleVersionUpdate);
            return () => window.removeEventListener('magnes:validator-version-update', handleVersionUpdate);
        }, [id, versions.length]);

        if (!BaseNode) return null;

        return React.createElement(BaseNode, {
            id: id,
            title: "风格验证",
            icon: Sparkles,
            selected: selected,
            style: {
                width: '360px',
                border: '1px solid #000',
                borderRadius: '0px',
                boxShadow: 'none'
            },
            handles: {
                target: [{ id: 'input', top: '50%' }],
                source: [{ id: 'output', top: '50%' }]
            }
        },
            React.createElement('div', { className: "flex flex-col gap-3" },
                // 主图展示区
                React.createElement('div', { className: "border border-black overflow-hidden" },
                    React.createElement('div', { className: "relative aspect-square bg-zinc-50" },
                        currentDisplay.image
                            ? React.createElement('img', {
                                key: currentDisplay.image, // [FIX] 强制重新渲染
                                src: currentDisplay.image,
                                alt: currentDisplay.label,
                                className: "w-full h-full object-contain"
                            })
                            : React.createElement('div', { className: "w-full h-full flex items-center justify-center text-zinc-400" },
                                React.createElement(Image, { size: 48 })
                            ),

                        // 版本标签
                        React.createElement('div', { className: "absolute top-2 left-2 bg-black text-white text-[9px] font-black px-1.5 py-0.5" },
                            currentDisplay.label
                        ),

                        // V1.5: 收藏按钮（右上角）
                        currentDisplay.image && React.createElement('button', {
                            onClick: handleFavorite,
                            className: `absolute top-2 right-2 w-8 h-8 flex items-center justify-center transition-all ${
                                isFavorited
                                    ? 'bg-red-500 text-white'
                                    : 'bg-white/90 text-black/60 hover:text-red-500 hover:bg-white'
                            }`
                        },
                            Heart ? React.createElement(Heart, { size: 16, fill: isFavorited ? 'currentColor' : 'none' }) : '♥'
                        )
                    ),

                    // 评分信息
                    scoreLevel && React.createElement('div', { className: `px-3 py-2 border-t border-black ${scoreLevel.color} bg-opacity-10` },
                        React.createElement('div', { className: "flex items-center justify-between" },
                            React.createElement('div', { className: "flex items-center gap-2" },
                                React.createElement('span', { className: "text-[11px] font-bold text-black" }, scoreLevel.label),
                                // V1.5: 评分徽章移到模式标签旁边
                                React.createElement('span', { className: `text-[10px] font-black text-white px-1.5 py-0.5 ${scoreLevel.color}` },
                                    `⭐ ${currentDisplay.score}/100`
                                )
                            ),
                            React.createElement('span', { className: "text-[9px] text-black/60" },
                                critic_report?.evaluation_mode === 'clone' ? '🎯 还原模式' : '🎨 创作模式'
                            )
                        )
                    )
                ),

                // 提示词展示
                React.createElement('div', { className: "border border-black p-3 bg-zinc-50" },
                    React.createElement('div', { className: "flex items-center justify-between mb-2" },
                        React.createElement('span', { className: "text-[9px] font-black text-black/40 uppercase" },
                            `${currentDisplay.label || '当前'} 提示词`
                        ),
                        React.createElement('div', { className: "flex items-center gap-2" },
                            // V1.4: 编辑按钮
                            !isEditingPrompt && React.createElement('button', {
                                onClick: handleStartEdit,
                                className: "px-1.5 py-0.5 bg-zinc-200 text-black text-[8px] font-bold hover:bg-zinc-300 transition-colors"
                            }, "编辑"),
                            // V1.6: 收藏提示词按钮
                            !isEditingPrompt && React.createElement('button', {
                                onClick: handleFavoritePrompt,
                                disabled: isSavingPrompt,
                                className: `transition-colors ${isPromptFavorited ? 'text-red-500' : 'text-black/60 hover:text-red-500'}`
                            },
                                Heart ? React.createElement(Heart, { size: 12, fill: isPromptFavorited ? 'currentColor' : 'none' }) : '♥'
                            ),
                            React.createElement('button', {
                                onClick: handleCopyPrompt,
                                className: "text-black/60 hover:text-black transition-colors"
                            }, copied ? React.createElement(Check, { size: 12, className: "text-green-600" }) : React.createElement(Copy, { size: 12 }))
                        )
                    ),
                    // V1.4: 编辑模式显示 textarea
                    isEditingPrompt
                        ? React.createElement('div', { className: "flex flex-col gap-2" },
                            React.createElement('textarea', {
                                value: editedPrompt,
                                onChange: (e) => setEditedPrompt(e.target.value),
                                className: "w-full min-h-[80px] p-2 text-[10px] text-black border border-black resize-none focus:outline-none focus:ring-1 focus:ring-black",
                                placeholder: "在此编辑提示词..."
                            }),
                            React.createElement('div', { className: "flex items-center justify-end gap-1" },
                                React.createElement('button', {
                                    onClick: handleCancelEdit,
                                    className: "px-2 py-1 bg-zinc-200 text-black text-[8px] font-bold hover:bg-zinc-300 transition-colors"
                                }, "取消"),
                                React.createElement('button', {
                                    onClick: handleSaveEdit,
                                    className: "px-2 py-1 bg-black text-white text-[8px] font-bold hover:bg-zinc-800 transition-colors"
                                }, "保存")
                            )
                        )
                        : React.createElement('p', { className: "text-[10px] text-black leading-snug" },
                            currentDisplay.prompt || '无提示词'
                        ),
                    // [FIX] 优化建议（从 critic_report 获取）
                    !isEditingPrompt && (currentDisplay.improvementSuggestion || currentDisplay.critique) && React.createElement('div', { className: "mt-2 pt-2 border-t border-black/10" },
                        React.createElement('div', { className: "text-[8px] font-bold text-black/60 mb-1" }, "优化建议:"),
                        React.createElement('p', { className: "text-[9px] text-black/80 leading-snug" },
                            currentDisplay.improvementSuggestion || currentDisplay.critique
                        )
                    )
                ),

                // V1.4: 编辑提示
                isEditingPrompt && React.createElement('div', { className: "flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200" },
                    React.createElement('span', { className: "text-[10px] font-bold text-yellow-700" }, "💡 提示词已编辑，点击「优化已编辑」应用更改")
                ),

                // 版本 panel（内置）- [FIX] 与风格分析节点一致，直接显示 V0, V1, V2
                versions.length > 0 && React.createElement('div', { className: "border border-black p-2 bg-white" },
                    React.createElement('div', { className: "text-[10px] font-bold text-black mb-2" }, `版本历史 (${versions.length})`),
                    React.createElement('div', { className: "flex flex-col gap-1" },
                        // [FIX] 倒序显示所有版本 V2, V1, V0...（最新的在前）
                        [...versions].reverse().map((v) => {
                            return React.createElement('button', {
                                key: v.version,
                                onClick: () => setSelectedVersionId(v.version),
                                className: `flex items-center gap-2 p-2 border text-left transition-colors ${
                                    selectedVersionId === v.version
                                        ? 'bg-white border-black'
                                        : 'bg-zinc-50 border-black/20 hover:border-black'
                                }`
                            },
                                React.createElement('div', { className: "w-10 h-10 bg-zinc-100 flex-shrink-0 border border-black/20 overflow-hidden" },
                                    v.image
                                        ? React.createElement('img', { src: v.image, className: "w-full h-full object-cover" })
                                        : React.createElement('div', { className: "w-full h-full flex items-center justify-center text-[8px] text-zinc-400" }, v.isOriginal ? "原图" : "无图")
                                ),
                                React.createElement('div', { className: "flex-1 min-w-0" },
                                    React.createElement('div', { className: "text-[10px] font-bold" }, v.label),
                                    React.createElement('div', { className: "text-[8px] opacity-80 break-words whitespace-normal leading-tight" }, v.prompt || '')
                                )
                            );
                        })
                    )
                ),

                // 操作按钮
                React.createElement('div', { className: "flex border border-black" },
                    React.createElement('button', {
                        onClick: handleDownload,
                        className: "flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 border-r border-black"
                    }, Download ? React.createElement(Download, { size: 12 }) : null, React.createElement('span', { className: "text-[9px] font-black" }, "保存图片")),
                    React.createElement('button', {
                        onClick: handleSendToCanvas,
                        className: "flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 border-r border-black"
                    }, ArrowRight ? React.createElement(ArrowRight, { size: 12 }) : '→', React.createElement('span', { className: "text-[9px] font-black" }, "添加到画布")),
                    React.createElement('button', {
                        onClick: handleRegenerateWithEdit,
                        disabled: isRegenerating,
                        className: `flex-1 py-2 transition-all flex items-center justify-center gap-1 border-r border-black ${isRegenerating ? 'bg-zinc-100 text-zinc-400' : isEditingPrompt ? 'bg-yellow-100 hover:bg-yellow-200 text-black' : 'bg-white hover:bg-black hover:text-white'}`
                    }, isRegenerating ? React.createElement('span', { className: "text-[9px]" }, "优化中...") : React.createElement(React.Fragment, null, RefreshCw ? React.createElement(RefreshCw, { size: 12 }) : '↻', React.createElement('span', { className: "text-[9px] font-black" }, isEditingPrompt ? "优化已编辑" : "再优化"))),
                    React.createElement('button', {
                        onClick: handleDelete,
                        className: "flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center"
                    }, Trash2 ? React.createElement(Trash2, { size: 12 }) : '🗑')
                )
            )
        );
    };

    if (window.MagnesComponents) {
        window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
        window.MagnesComponents.Nodes.StyleValidatorNode = StyleValidatorNode;
    }
})();
