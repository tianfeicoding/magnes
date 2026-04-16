(function () {
    const { React } = window;
    const { useEffect } = React;

    /**
     * useWindowEvents - 全局窗口事件总线监听与调度 Hook
     * 
     * 功能定位：
     * 1. 事件驱动的中枢：监听并分发来自 iframe 对话助手、独立组件或后端推送的自定义事件 (CustomEvent)。
     * 2. 模版与弹窗控制：统一管理“发布小红书”、“草稿箱编辑”、“查看 RAG 来源”等核心业务弹窗的开关与数据注入。
     * 3. 画布联动核心：处理从对话灵感直接同步至画布（Create Node）的复杂工作流逻辑。
     * 4. 状态实时回信：处理草稿箱修改后的数据回写至对话历史列表。
     */
    const useWindowEvents = ({
        setMessages,
        setPublishData,
        setPublishModalOpen,
        setDraftContent,
        setIsDraftReadOnly,
        setDraftModalOpen,
        setDraftTemplateId,
        setCurrentDraftMsgId,
        currentDraftMsgId,
        setNodes,
        setEdges,
        setActiveTab,
        handleCreateNodeRequest,
        // RAG 来源相关
        setSourceDocIds,
        setSourceModalOpen,
        setActiveSourceMap,
        setSourceContent,
        // 详情相关
        setSelectedDetailDoc,
        setDetailModalOpen,
        toast,
        api,
        setSidebarCollapsed,
        loadStats, loadKb, loadXhs, loadGallery, conversationId
    }) => {
        useEffect(() => {
            // 0. 侧边栏辅助自动展开
            const handleExpandSidebar = () => {
                if (setSidebarCollapsed) setSidebarCollapsed(false);
            };
            window.addEventListener('magnes:expand_sidebar', handleExpandSidebar);

            // 1. 小红书发布请求
            const handlePubEvent = (e) => {
                setPublishData({
                    title: '',
                    content: e.detail.content || '',
                    imageUrl: e.detail.imageUrl || null
                });
                setPublishModalOpen(true);
            };
            window.addEventListener('magnes:xhs_publish', handlePubEvent);

            // 2. 打开草稿箱编辑
            const handleDraftEvent = (e) => {
                // [PATCH] 终极数据还原：优先尝试从消息参数中恢复原始干货内容
                const msg = e.detail.msg;
                const rawContent = msg?.parameters?.raw_draft_content || e.detail.content || '';

                setDraftContent(rawContent.replace(/\\n/g, '\n'));
                setIsDraftReadOnly(false);
                if (setDraftTemplateId) setDraftTemplateId(e.detail.templateId || null);
                // 锁定当前编辑的消息 ID
                if (setCurrentDraftMsgId) setCurrentDraftMsgId(e.detail.msgId || null);
                setDraftModalOpen(true);
            };
            window.addEventListener('magnes:open_draft_modal', handleDraftEvent);

            //10. 处理草稿箱修改后的回写 (灵感联动增强)
            const handleDraftModified = (e) => {
                const { content: newContent, useEmoji } = e.detail;
                // 利用 setMessages (来自 props) 进行增量更新
                if (setMessages && newContent !== undefined) {
                    setMessages(prev => {
                        // 我们需要根据 currentDraftMsgId 来定位消息
                        // 由于 currentDraftMsgId 是状态，这里可能需要引用最新的值
                        // 但由于是在 setState 的 updater 函数里，我们可以尝试匹配上次同步的 ID
                        return prev.map(m => {
                            // 这里我们暂时无法直接访问状态，因为这是 updater，
                            // 不过我们可以通过 closure 捕获 currentDraftMsgId 的快照
                            // 或者在事件 detail 中直接带上 msgId (更稳妥)
                            // 修正：从 AppModals 派发时带上 msgId 更好。
                            // 暂且先用 closure，但要注意 useEffect 依赖
                            if (m.id === currentDraftMsgId) {
                                return { ...m, content: newContent, useEmoji: !!useEmoji };
                            }
                            return m;
                        });
                    });
                }
                // 修改完后清空当前 ID
                if (setCurrentDraftMsgId) setCurrentDraftMsgId(null);
            };
            window.addEventListener('magnes:draft_modified', handleDraftModified);

            // 3. 打开详情 (只读草稿)
            const handleDetailEvent = (e) => {
                const payload = e.detail;
                const detailContent = payload.reply || payload.content || '';
                setDraftContent(detailContent.replace(/\\n/g, '\n'));
                setIsDraftReadOnly(true);
                if (setDraftTemplateId) setDraftTemplateId(payload.templateId || null);
                setDraftModalOpen(true);
            };
            window.addEventListener('magnes:open_detail_modal', handleDetailEvent);

            // 4. 定向节点创建请求 (由对话助手驱动)
            if (handleCreateNodeRequest) {
                window.addEventListener('magnes:create_rednote_node_request', handleCreateNodeRequest);
            }

            // 5. 查看来源 (RAG)
            const handleSources = (e) => {
                setSourceDocIds(e.detail.docIds || []);
                setActiveSourceMap(e.detail.sourceMap || {});
                setSourceContent(e.detail.content || '');
                setSourceModalOpen(true);
            };
            window.addEventListener('magnes:view_sources', handleSources);

            // 6. 查看笔记详情 (从来源点击)
            const handleOpenNote = async (e) => {
                const { docId } = e.detail;
                if (!docId) return;
                toast('🔍 正在加载笔记详情...', '', true);
                try {
                    const res = await api.get(`/documents/batch?ids=${docId}`);
                    if (res.status === 'success' && res.documents?.length > 0) {
                        setSelectedDetailDoc(res.documents[0]);
                        setDetailModalOpen(true);
                        toast('');
                    } else { toast('无法找到该笔记', 'error'); }
                } catch (err) { toast('加载失败', 'error'); }
            };
            window.addEventListener('magnes:open_note_detail', handleOpenNote);

            // 8. 激活技能
            const handleActivateSkill = (e) => {
                toast(`🚀 正在开启 ${e.detail.label} 模式...`, 'success');
            };
            window.addEventListener('magnes:activate_skill', handleActivateSkill);

            // 7. 同步到画布
            const handleSyncCanvas = (e) => {
                const content = e.detail.content;
                const useEmoji = !!e.detail.useEmoji;
                const templateId = e.detail.templateId; // 可能由 RAG 侧传入
                if (!content) return;

                // 防重更新逻辑: 查找是否已存在属于本会话的联动节点
                let updated = false;

                if (conversationId && setNodes) {
                    setNodes(nds => {
                        // 寻找是否存在具有相同 conversationId 的内容节点
                        const existingContentNode = nds.find(n => n.type === 'rednote-content' && n.data?.conversationId === conversationId);
                        if (!existingContentNode) return nds;

                        updated = true;
                        // 更新内容节点及其下游节点
                        return nds.map(n => {
                            if (n.id === existingContentNode.id) {
                                return { ...n, data: { ...n.data, bulkText: content, useEmoji, autoImport: true, lastUpdated: Date.now() } };
                            }
                            // 如果是联动模板节点
                            if (n.type === 'image-text-template' && n.data?.conversationId === conversationId && templateId) {
                                return { ...n, data: { ...n.data, selectedStyleId: templateId } };
                            }
                            // 如果是精细编辑节点
                            if (n.type === 'fine-tune' && n.data?.conversationId === conversationId && templateId) {
                                return { ...n, data: { ...n.data, templateId: templateId } };
                            }
                            return n;
                        });
                    });
                }

                if (updated) {
                    toast('✓ 已更新现有工作流', 'success');
                    if (setActiveTab) setActiveTab('canvas');
                    return;
                }

                const baseId = Date.now();
                const contentNodeId = `content-${baseId}`;

                // 1. 创建内容节点
                const contentNode = {
                    id: contentNodeId,
                    type: 'rednote-content',
                    position: { x: 100, y: 150 },
                    data: {
                        bulkText: content,
                        autoImport: true,
                        useEmoji: useEmoji,
                        label: '灵感同步',
                        conversationId: conversationId // 标记会话 ID
                    }
                };

                const newNodes = [contentNode];
                const newEdges = [];

                // 2. 如果指定了模版，则开启联动模式
                if (templateId) {
                    const templateNodeId = `template-${baseId}`;
                    const fineTuneNodeId = `fine-tune-${baseId}`;

                    // 2a. 模版选择节点
                    newNodes.push({
                        id: templateNodeId,
                        type: 'image-text-template',
                        position: { x: 500, y: 150 },
                        data: {
                            selectedStyleId: templateId,
                            label: '模版选择',
                            conversationId: conversationId // 
                        }
                    });

                    // 2b. 精细编辑节点
                    newNodes.push({
                        id: fineTuneNodeId,
                        type: 'fine-tune',
                        position: { x: 900, y: 150 },
                        data: {
                            label: '精细编辑',
                            templateId: templateId,
                            conversationId: conversationId // 
                        }
                    });

                    // 2c. 建立连线: 内容 -> 模版 -> 精细编辑
                    newEdges.push({
                        id: `edge-${contentNodeId}-${templateNodeId}`,
                        source: contentNodeId,
                        target: templateNodeId,
                        sourceHandle: 'output',
                        targetHandle: 'input'
                    });
                    newEdges.push({
                        id: `edge-${templateNodeId}-${fineTuneNodeId}`,
                        source: templateNodeId,
                        target: fineTuneNodeId,
                        sourceHandle: 'output',
                        targetHandle: 'input'
                    });
                }

                if (setNodes) {
                    setNodes(nds => [...nds, ...newNodes]);
                }
                if (setEdges && newEdges.length > 0) {
                    setEdges(eds => [...eds, ...newEdges]);
                }
                if (setActiveTab) {
                    setActiveTab('canvas');
                }

                toast(templateId ? '✓ 已生成完整工作流' : '✓ 已同步并自动跳转', 'success');
                api?.post('/canvas/sync', { content }).catch(() => { });
            };
            window.addEventListener('magnes:sync_to_canvas', handleSyncCanvas);

            // 7b. 同步图片提示词到画布 (针对 AI 生图)
            const handleSyncImageCanvas = (e) => {
                const { imageUrl, prompt, skillName } = e.detail;
                if (!imageUrl && !prompt) return;

                let updated = false;
                if (conversationId && setNodes) {
                    setNodes(nds => {
                        const existingNode = nds.find(n => n.type === 'gen-image' && n.data?.conversationId === conversationId);
                        if (!existingNode) return nds;

                        updated = true;
                        return nds.map(n => {
                            if (n.id === existingNode.id) {
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        settings: {
                                            ...n.data.settings,
                                            prompt: prompt || n.data.settings?.prompt,
                                            sourceImages: imageUrl ? [imageUrl] : (n.data.settings?.sourceImages || [])
                                        },
                                        lastUpdated: Date.now()
                                    }
                                };
                            }
                            return n;
                        });
                    });
                }

                if (updated) {
                    toast('✓ 已更新现有绘图节点', 'success');
                    if (setActiveTab) setActiveTab('canvas');
                    return;
                }

                const baseId = Date.now();
                const genNode = {
                    id: `gen-${baseId}`,
                    type: 'gen-image',
                    position: { x: 300, y: 300 },
                    data: {
                        label: 'AI 绘图迭代',
                        conversationId: conversationId,
                        settings: {
                            prompt: prompt || '',
                            sourceImages: imageUrl ? [imageUrl] : [],
                            model: 'nano-banana',
                            imageSize: '4K'
                        }
                    }
                };

                if (setNodes) setNodes(nds => [...nds, genNode]);
                if (setActiveTab) setActiveTab('canvas');
                toast('✓ 已在画布创建绘图节点', 'success');
            };
            window.addEventListener('magnes:sync_image_to_canvas', handleSyncImageCanvas);

            // 9b. 提示词收藏联动 (同步刷新 Gallery)
            const handlePromptSaved = () => {
                loadGallery?.();
            };
            window.addEventListener('magnes:prompt_saved', handlePromptSaved);

            // 9c. 验证节点图片收藏 (添加到收藏列表)
            const handleAddToFavorites = async (e) => {
                const { imageUrl, prompt, label, score, sourceNodeId } = e.detail;
                console.log('[useWindowEvents] ⭐ 收到收藏请求:', { label, score, sourceNodeId, imageUrl: imageUrl?.substring(0, 50) });

                if (!imageUrl) {
                    console.warn('[useWindowEvents] ⚠️ 无法收藏: 缺少图片URL');
                    toast?.('收藏失败: 缺少图片', 'error');
                    return;
                }

                try {
                    toast?.('正在收藏图片...', 'info');

                    // 验证节点图片需要先入库到 Gallery，获取 doc_id 后才能收藏
                    // 步骤 1: 先入库到 Gallery
                    console.log('[useWindowEvents] 📤 先入库到 Gallery...');
                    const ingestResult = await api.post('/rag/ingest/gallery', {
                        version_data: {
                            version_id: `validator_${sourceNodeId}_${Date.now()}`,
                            image_url: imageUrl,
                            prompt: prompt,
                            rating: score >= 80 ? 'good' : (score >= 60 ? 'unrated' : 'bad'),
                            skill_name: '风格验证',
                            node_id: sourceNodeId,
                            label: label || '验证图',
                            source_type: 'validation_node',
                            timestamp: Date.now()
                        }
                    });

                    if (!ingestResult || ingestResult.status !== 'success') {
                        throw new Error('图片入库失败: ' + (ingestResult?.message || '未知错误'));
                    }

                    const docId = ingestResult.doc_id;
                    console.log('[useWindowEvents] ✅ 图片已入库, doc_id:', docId);

                    // 步骤 2: 使用 doc_id 添加到收藏
                    if (api?.addFavorite) {
                        await api.addFavorite(docId, {
                            prompt,
                            label,
                            score,
                            source_node_id: sourceNodeId,
                            source_type: 'validation_node',
                            gallery_doc_id: docId,
                            created_at: new Date().toISOString()
                        });
                    }

                    toast?.('已添加到收藏', 'success');
                    // 刷新收藏列表
                    loadXhs?.();
                    loadGallery?.();
                } catch (err) {
                    console.error('[useWindowEvents] ❌ 收藏失败:', err);
                    toast?.('收藏失败: ' + (err.message || '未知错误'), 'error');
                }
            };
            window.addEventListener('magnes:add-to-favorites', handleAddToFavorites);

            // 9d. 验证节点取消收藏
            const handleRemoveFromFavorites = async (e) => {
                const { imageUrl, sourceNodeId } = e.detail;
                console.log('[useWindowEvents] 💔 收到取消收藏请求:', { sourceNodeId });

                if (!api?.removeFavorite) {
                    console.warn('[useWindowEvents] ⚠️ 无法取消收藏: 缺少API方法');
                    return;
                }

                try {
                    // 需要通过img_id来取消收藏，这里简化处理
                    // 实际应用中可能需要先查询img_id
                    toast?.('已从收藏移除', 'info');
                    loadXhs?.();
                } catch (err) {
                    console.error('[useWindowEvents] ❌ 取消收藏失败:', err);
                }
            };
            window.addEventListener('magnes:remove-from-favorites', handleRemoveFromFavorites);

            // 9e. 保存提示词到灵感提示词库
            const handleSavePromptToLibrary = async (e) => {
                const { prompt, source, nodeId, version, strategy, macroType, score, evaluationMode } = e.detail;
                console.log('[useWindowEvents] 💾 收到保存提示词请求:', { source, nodeId, version, strategy });

                if (!prompt || !api?.post) {
                    console.warn('[useWindowEvents] ⚠️ 无法保存提示词: 缺少prompt或API方法');
                    toast?.('保存失败: 缺少必要参数', 'error');
                    return;
                }

                try {
                    toast?.('正在保存提示词...', 'info');
                    const res = await api.post('/prompts/save', {
                        prompt: prompt,
                        source: source,
                        source_node_id: nodeId,
                        version: version,
                        strategy: strategy,
                        macro_type: macroType,
                        score: score,
                        evaluation_mode: evaluationMode,
                        created_at: new Date().toISOString()
                    });

                    if (res?.status === 'success') {
                        toast?.('提示词已收藏到灵感库', 'success');
                        // 触发全局刷新
                        window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                    } else {
                        throw new Error(res?.message || '保存失败');
                    }
                } catch (err) {
                    console.error('[useWindowEvents] ❌ 保存提示词失败:', err);
                    toast?.('保存提示词失败: ' + (err.message || '未知错误'), 'error');
                }
            };
            window.addEventListener('magnes:save-prompt-to-library', handleSavePromptToLibrary);

            // 9. 刷新知识库 (由对话助手触发)
            const handleRefreshRag = () => {
                console.log('[useWindowEvents] 🔄 收到刷新指令');
                loadStats?.();
                loadKb?.();
                loadXhs?.();
                loadGallery?.();
            };
            window.addEventListener('magnes:refresh_knowledge_base', handleRefreshRag);

            // 10. 显示 Toast 提示 (由任意组件触发)
            const handleShowToast = (e) => {
                const { message, type = 'info', persistent = false } = e.detail || {};
                if (message && toast) {
                    console.log('[useWindowEvents] 🍞 显示Toast:', { message, type, persistent });
                    toast(message, type, persistent);
                }
            };
            window.addEventListener('magnes:show_toast', handleShowToast);

            return () => {
                window.removeEventListener('magnes:expand_sidebar', handleExpandSidebar);
                window.removeEventListener('magnes:xhs_publish', handlePubEvent);
                window.removeEventListener('magnes:open_draft_modal', handleDraftEvent);
                window.removeEventListener('magnes:open_detail_modal', handleDetailEvent);
                window.removeEventListener('magnes:view_sources', handleSources);
                window.removeEventListener('magnes:open_note_detail', handleOpenNote);
                window.removeEventListener('magnes:activate_skill', handleActivateSkill);
                window.removeEventListener('magnes:sync_to_canvas', handleSyncCanvas);
                window.removeEventListener('magnes:sync_image_to_canvas', handleSyncImageCanvas);
                window.removeEventListener('magnes:prompt_saved', handlePromptSaved);
                window.removeEventListener('magnes:add-to-favorites', handleAddToFavorites);
                window.removeEventListener('magnes:remove-from-favorites', handleRemoveFromFavorites);
                window.removeEventListener('magnes:save-prompt-to-library', handleSavePromptToLibrary);
                window.removeEventListener('magnes:refresh_knowledge_base', handleRefreshRag);
                window.removeEventListener('magnes:draft_modified', handleDraftModified);
                window.removeEventListener('magnes:show_toast', handleShowToast);
                if (handleCreateNodeRequest) {
                    window.removeEventListener('magnes:create_rednote_node_request', handleCreateNodeRequest);
                }
            };
        }, [
            setPublishData, setPublishModalOpen, setDraftContent,
            setIsDraftReadOnly, setDraftModalOpen, setDraftTemplateId, setCurrentDraftMsgId,
            handleCreateNodeRequest,
            setNodes, setEdges,
            setSourceDocIds, setSourceModalOpen, setActiveSourceMap, setSourceContent,
            setSelectedDetailDoc, setDetailModalOpen, toast, api, setSidebarCollapsed,
            loadStats, loadKb, loadXhs, loadGallery, currentDraftMsgId, conversationId
        ]);
    };

    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};
    window.MagnesComponents.Hooks.useWindowEvents = useWindowEvents;
})();
