(function () {
    const { React } = window;
    const { useEffect } = React;

    /**
     * useGenerationService - AI 生成服务集成与自动化调度 Hook
     * 
     * 功能定位：
     * 1. 核心桥梁：负责将画布（Canvas）上的生成请求对接至后端的 GenerationService。
     * 2. 状态追踪：实时监听生成任务的进度（onNodeUpdate），并回显至画布节点。
     * 3. 自动化动作：在生图成功后，自动执行 RAG 入库、对话消息推送、以及“版本预览”节点的创建。
     * 4. 架构一致性：确保消息持久化由后端统一处理，前端仅负责实时 UI 反馈，避免数据重复。
     */
    const useGenerationService = ({
        registerStartGeneration,
        apiConfigs,
        apiKeys,
        setNodes,
        setEdges,
        setMessages,
        addToHistory,
        updateHistory,
        conversationId
    }) => {
        useEffect(() => {
            const Service = window.MagnesComponents.Services.GenerationService;
            if (!Service || !registerStartGeneration) return;

            registerStartGeneration((first, ...args) => {
                let config = typeof first === 'object' && first !== null && !Array.isArray(first) ? { ...first } : {
                    prompt: first,
                    type: args[0],
                    sourceImages: args[1],
                    nodeId: args[2],
                    options: args[3] || {}
                };

                // 基础配置补全
                config.prompt = String(config.prompt || '');
                config.type = config.type || 'image';
                config.apiConfigs = config.apiConfigs || apiConfigs;
                config.apiKeys = config.apiKeys || apiKeys;

                // ─── Helper: 统一处理生图完成后的 RAG 入库 ────────────────────
                const syncToGallery = ({ imageUrl, nodeId, sourceNode }) => {
                    const token = window.MagnesComponents.Utils.Constants.MAGNES_API_TOKEN;
                    const galleryApiUrl = (window.MagnesComponents.Utils.Constants.MAGNES_API_URL || '/api/v1') + '/rag/ingest/gallery';
                    const finalPrompt = config.prompt || sourceNode?.data?.settings?.prompt || '';
                    console.log(`[Magnes] 📤 Syncing to Gallery: prompt=${finalPrompt.substring(0, 30)}...`);

                    fetch(galleryApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            version_data: {
                                image_url: imageUrl,
                                node_id: nodeId,
                                prompt: finalPrompt,
                                skill: sourceNode?.data?.settings?.activeSkill || config.options?.active_skill || '',
                                model: sourceNode?.data?.settings?.model || config.options?.model || '',
                                timestamp: Date.now()
                            }
                        })
                    })
                        .then(res => res.json())
                        .then(data => {
                            if (data.status === 'success') {
                                console.log('[Magnes] ✅ Gallery Sync Success, triggering refresh...');
                                window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                            }
                        })
                        .catch(err => console.error('[Magnes] Gallery Sync Failed:', err));
                };

                // ─── Helper: 统一处理生图完成后的 UI 消息推送 ─────────────────
                // 注意：不再调用 /dialogue/message 持久化，后端 task_routes.py 已通过
                // add_planner_history 统一回填，前端重复写入会导致刷新后显示两条消息。
                const notifyGenerationDone = (imageUrl) => {
                    setMessages(prev => [...prev, {
                        id: `ai_gen_${Date.now()}`,
                        role: 'assistant',
                        content: '生图完成',
                        imageUrl: imageUrl,
                        timestamp: new Date()
                    }]);
                };

                // ─── 回调逻辑 ──────────────────────────────────────────────
                config.callbacks = {
                    onNodeUpdate: (nid, updates) => {
                        const isGalleryOnly = nid === 'GALLERY_ONLY_TASK';
                        const isFinished = updates.isGenerating === false
                            && typeof updates.content === 'string'
                            && updates.content?.startsWith('http');

                        // 分支 A：纯图库再生任务（虚拟节点，无需更新画布）
                        if (isGalleryOnly && isFinished) {
                            notifyGenerationDone(updates.content);
                            syncToGallery({ imageUrl: updates.content, nodeId: nid, sourceNode: null });
                            return;
                        }

                        // 分支 B：普通画布节点任务
                        setNodes(nds => {
                            // B1. 同步节点状态
                            const nextNodes = nds.map(n => {
                                if (n.id !== nid) return n;
                                const isStarting = updates.isGenerating === true;
                                const automationHandled = isStarting ? false : n.data.automationHandled;
                                
                                // [PRO-LOGIC] 自动尝试解包 JSON 内容并合并到 Data
                                let unpackedData = {};
                                if (updates.content && typeof updates.content === 'string' && updates.content.startsWith('{')) {
                                    try {
                                        const parsed = JSON.parse(updates.content);
                                        if (parsed && typeof parsed === 'object') {
                                            unpackedData = parsed;
                                        }
                                    } catch (e) { /* 不是合法的 JSON 或截断了 */ }
                                }

                                // [FIX] 避免 unpackedData 中的 style_evolution 覆盖 updates 中的
                                // updates 包含服务器返回的最新数据，优先级应该最高
                                if (unpackedData.style_evolution && updates.style_evolution) {
                                    console.log('[useGenerationService] 跳过 unpackedData.style_evolution，使用 updates.style_evolution:', {
                                        unpackedLength: unpackedData.style_evolution.length,
                                        updatesLength: updates.style_evolution.length
                                    });
                                    delete unpackedData.style_evolution;
                                }

                                const result = {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        ...unpackedData, // 将解包后的字段（如 style_prompt）直接合入
                                        ...updates,      // 服务器返回的最新数据优先级最高
                                        automationHandled
                                    }
                                };

                                // [AUTOMATION] 生图完成后向对话框推送 UI 消息（仅触发一次）
                                if (!result.data.automationHandled && isFinished) {
                                    result.data.automationHandled = true;
                                    notifyGenerationDone(updates.content);
                                }
                                return result;
                            });

                            // B2. [AUTO-VERSION-GALLERY] 自动挂载版本预览节点 + RAG 入库
                            if (isFinished) {
                                const sourceNode = nds.find(n => n.id === nid);
                                const galleryId = sourceNode?.data?.galleryId || `gallery-${Date.now()}`;
                                const existingGallery = nextNodes.find(n => n.id === galleryId);

                                syncToGallery({ imageUrl: updates.content, nodeId: nid, sourceNode });

                                if (!existingGallery && sourceNode) {
                                    console.log(`[Magnes] 🖼️ Creating auto-gallery for ${nid}`);
                                    const galleryNode = {
                                        id: galleryId,
                                        type: 'version-gallery',
                                        position: { x: sourceNode.position.x + 400, y: sourceNode.position.y },
                                        data: {
                                            label: '版本预览',
                                            versions: [{ id: Date.now(), url: updates.content, timestamp: Date.now(), label: 'V1' }]
                                        }
                                    };
                                    setEdges(eds => [...eds, {
                                        id: `e-${nid}-${galleryId}`,
                                        source: nid,
                                        target: galleryId,
                                        targetHandle: 'version-input'
                                    }]);
                                    // 记录 galleryId 到 sourceNode 保证后续原生与工作流双链路状态统一
                                    return nextNodes.map(n => n.id === nid ? { ...n, data: { ...n.data, galleryId } } : n).concat(galleryNode);
                                } else if (existingGallery) {
                                    // 更新已有预览节点的历史记录，与 RightSidebar.js 对齐，最新追加在后面
                                    return nextNodes.map(gn => gn.id === galleryId ? {
                                        ...gn,
                                        data: {
                                            ...gn.data,
                                            versions: [
                                                ...(gn.data.versions || []),
                                                { id: Date.now(), url: updates.content, timestamp: Date.now(), label: `V${(gn.data.versions || []).length + 1}` }
                                            ]
                                        }
                                    } : gn);
                                }
                            }
                            return nextNodes;
                        });
                    },
                    onHistoryUpdate: (item, action) => {
                        if (action === 'push') addToHistory(item);
                        else if (action === 'update') updateHistory(item.id, item);
                    }
                };

                console.log(`[Generation] Dispatching -> Type: ${config.type}, Node: ${config.nodeId}`);
                Service.startGeneration(config);
            });
        }, [registerStartGeneration, apiConfigs, apiKeys, setNodes, setEdges, setMessages, addToHistory, updateHistory]);
    };

    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};
    window.MagnesComponents.Hooks.useGenerationService = useGenerationService;
})();
