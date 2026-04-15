(function () {
    const { React } = window;
    const { ConversationPanel } = window.MagnesComponents.UI;
    // 安全获取图标函数，与 ConversationPanel 保持一致
    const getIcons = () => window.MagnesComponents?.UI?.LucideIcons || window.MagnesComponents?.UI?.Icons || {};

    /**
     * AssetPicker 渲染器 - 作为独立组件避免 IIFE 在 JSX 中的问题
     */
    const AssetPickerRenderer = ({ getAssetPicker, assetPickerReady, onAssetSelect }) => {
        const AP = getAssetPicker();
        console.log('[RightSidebar] Rendering AssetPicker:', { assetPickerReady, APExists: !!AP, APType: typeof AP });

        if (!assetPickerReady) {
            return React.createElement('div', { className: 'p-8 text-center text-zinc-400 text-[10px]' }, 'AssetPicker Not Ready...');
        }
        if (!AP) {
            return React.createElement('div', { className: 'p-8 text-center text-zinc-400 text-[10px]' }, 'AssetPicker Not Found...');
        }
        if (typeof AP !== 'function') {
            console.error('[RightSidebar] ❌ AssetPicker is not a function:', AP);
            return React.createElement('div', { className: 'p-8 text-center text-red-400 text-[10px]' }, 'AssetPicker Invalid Type');
        }

        console.log('[RightSidebar] ✅ Creating AssetPicker element');
        return React.createElement(AP, {
            isSidebar: true,
            onSelect: onAssetSelect
        });
    };

    /**
     * 右侧统一侧边栏组件
     * 同时也包含了生成历史的覆盖层逻辑
     */
    const RightSidebar = ({
        activeTab,
        theme,
        sidebarCollapsed,
        setSidebarCollapsed,
        messages,
        setMessages,
        conversationId,
        setConversationId,
        nodes,
        setNodes,
        setEdges,
        setActiveTab,
        toast,
        // 历史相关
        historyOpen,
        setHistoryOpen,
        historyList,
        deleteHistory,
        setLightboxItem,
        // RAG 相关
        api,
        loadXhs,
        loadStats,
        setSearchResults,
        setRewrittenQueries,
        setActiveFlowItem,
        setRetrievalStats,
        selectedDocIds,
        startGeneration,
        // 侧边栏资产相关
        prevTab,
        onAssetSelect
    }) => {
        const h = React.createElement;
        const MAGNES = window.MagnesComponents || {};
        const UI = MAGNES.UI || {};
        // 安全获取图标，与 ConversationPanel 保持一致
        const Icons = getIcons();
        // 注意：Lucide 图标库中只有 ArrowLeft，没有 ChevronLeft
        const ArrowLeft = Icons.ArrowLeft;
        const X = Icons.X;
        const Trash2 = Icons.Trash2;

        // [FIX] 动态获取 AssetPicker，确保在组件渲染时获取最新引用
        const getAssetPicker = () => window.MagnesComponents?.UI?.AssetPicker;
        const [assetPickerReady, setAssetPickerReady] = React.useState(false);

        // [DEBUG] 追踪侧边栏状态切换
        React.useEffect(() => {
            console.log('[RightSidebar] 🔄 侧边栏状态更新:', { activeTab, sidebarCollapsed });
        }, [activeTab, sidebarCollapsed]);

        // 等待 AssetPicker 加载完成 - 增加重试次数和延迟
        React.useEffect(() => {
            let attempts = 0;
            const maxAttempts = 50; // 最多等待 5 秒

            const checkAssetPicker = () => {
                attempts++;
                const AP = getAssetPicker();
                console.log(`[RightSidebar] ⏳ Check attempt ${attempts}, AP:`, typeof AP);

                if (AP && typeof AP === 'function') {
                    setAssetPickerReady(true);
                    console.log('[RightSidebar] ✅ AssetPicker Ready');
                } else if (attempts < maxAttempts) {
                    setTimeout(checkAssetPicker, 100);
                } else {
                    console.error('[RightSidebar] ❌ AssetPicker failed to load after max attempts');
                }
            };
            // 延迟开始检查，确保其他脚本先执行
            setTimeout(checkAssetPicker, 100);
        }, []);

        // 规范化比较
        const isAssetsTab = String(activeTab).toLowerCase() === 'assets';

        return (
            <div className={`${sidebarCollapsed ? 'w-8' : 'w-[320px]'} border-l border-black flex flex-col bg-white shrink-0 relative overflow-hidden transition-all duration-300`}>
                {isAssetsTab ? (
                    <div className="flex flex-col h-full bg-white">
                        {/* Assets Header */}
                        <div className="px-4 py-3 border-b border-black flex items-center gap-2 bg-white shrink-0">
                            <button
                                onClick={() => setActiveTab(prevTab || 'canvas')}
                                className="hover:bg-zinc-100 transition-colors flex items-center justify-center w-7 h-7"
                            >
                                {ArrowLeft
                                    ? React.createElement(ArrowLeft, { size: 14 })
                                    : '←'
                                }
                            </button>
                            <span className="font-black text-[12px] uppercase tracking-widest text-black">选择背景素材</span>
                        </div>
                        {/* AssetPicker Sidebar Mode */}
                        <div className="flex-1 overflow-hidden">
                            {React.createElement(AssetPickerRenderer, {
                                getAssetPicker: getAssetPicker,
                                assetPickerReady: assetPickerReady,
                                onAssetSelect: onAssetSelect
                            })}
                        </div>
                    </div>
                ) : activeTab === 'canvas' ? (
                    <React.Fragment>
                        <ConversationPanel
                            messages={messages}
                            setMessages={setMessages}
                            theme={theme}
                            noBorder={true}
                            collapsed={sidebarCollapsed}
                            setCollapsed={setSidebarCollapsed}
                            conversationId={conversationId}
                            setConversationId={setConversationId}
                            key={`${activeTab}_${conversationId}`}
                            getNodes={() => nodes}
                            setNodes={setNodes}
                            addNodes={(newNodes) => setNodes(nds => [...nds, ...newNodes])}
                            onTriggerGeneration={async (action, params) => {
                                console.log(`[Magnes] 🧭 onTriggerGeneration (Canvas): action=${action}, params:`, params);
                                if (action === 'run_painter') {
                                    const nodeId = `gen-${Date.now()}`;
                                    let lastUrl = localStorage.getItem('lastMagnesImageUrl') || '';
                                    if (!lastUrl && nodes) {
                                        const imgNode = nodes.find(n => n.type === 'input-image');
                                        if (imgNode?.data?.content) lastUrl = imgNode.data.content;
                                    }
                                    const image_urls = (params.image_urls || (params.imageUrl ? [params.imageUrl] : [])).map(u => u === 'REUSE_CONTEXT_IMAGE' ? lastUrl : u);

                                    if (params.prompt) localStorage.setItem('lastShortPrompt', params.prompt);

                                    const newNode = {
                                        id: nodeId,
                                        type: 'gen-image',
                                        position: { x: 450, y: 150 },
                                        data: {
                                            label: 'AI 绘图',
                                            pendingPrompt: params.prompt,
                                            pendingImageUrls: image_urls,
                                            isGenerating: !!params.prompt,
                                            settings: {
                                                activeSkill: params.active_skill,
                                                conversationId,
                                                denoising: params.var ?? 0.75,
                                                ratio: params.ratio || '1:1',
                                                prompt: params.prompt
                                            }
                                        }
                                    };
                                    setNodes(nds => [...nds, newNode]);

                                    if (lastUrl && nodes) {
                                        const sourceNode = nodes.find(n => n.type === 'input-image' && n.data.content === lastUrl);
                                        if (sourceNode) {
                                            setEdges(eds => [...eds, {
                                                id: `e-${sourceNode.id}-${nodeId}`,
                                                source: sourceNode.id,
                                                target: nodeId,
                                                sourceHandle: 'output',
                                                targetHandle: 'style'
                                            }]);
                                        }
                                    }

                                    toast('✨ 识别成功，已同步至画布', 'success');
                                } else if (action === 'show_painter_result') {
                                    const imageUrl = params.imageUrl || params.image_url;
                                    if (!imageUrl) return;

                                    setNodes(nds => {
                                        // 寻找最近的一个 AI 绘图节点 (gen-image)
                                        const sourceNode = [...nds].reverse().find(n => n.type === 'gen-image');
                                        if (!sourceNode) return nds;

                                        const galleryId = sourceNode.data.galleryId || `gallery-${Date.now()}`;
                                        const existingGallery = nds.find(n => n.id === galleryId);
                                        if (existingGallery) {
                                            const newVersion = { id: Date.now(), url: imageUrl, timestamp: Date.now(), label: `V${existingGallery.data.versions.length + 1}` };
                                            return nds.map(n => {
                                                if (n.id === sourceNode.id) return { ...n, data: { ...n.data, isGenerating: false } };
                                                if (n.id === galleryId) return { ...n, data: { ...n.data, versions: [...n.data.versions, newVersion] } };
                                                return n;
                                            });
                                        }

                                        const galleryNode = {
                                            id: galleryId,
                                            type: 'version-gallery',
                                            position: { x: sourceNode.position.x + 400, y: sourceNode.position.y },
                                            data: {
                                                label: '版本预览',
                                                versions: [{ id: Date.now(), url: imageUrl, timestamp: Date.now(), label: 'V1' }]
                                            }
                                        };

                                        // 建立连线
                                        setEdges(eds => [...eds, {
                                            id: `e-${sourceNode.id}-${galleryId}`,
                                            source: sourceNode.id,
                                            target: galleryId,
                                            sourceHandle: 'output',
                                            targetHandle: 'version-input'
                                        }]);

                                        // 解锁生图按钮状态
                                        return nds.map(n => n.id === sourceNode.id ? { ...n, data: { ...n.data, isGenerating: false, galleryId } } : n).concat(galleryNode);
                                    });

                                    toast('✅ 生图已完成并挂载至画布', 'success');
                                } else if (action === 'create_rednote_node') {
                                    window.dispatchEvent(new CustomEvent('magnes:create_rednote_node_request', { detail: params }));
                                } else if (action === 'mirror_image') {
                                    const nodeId = `input-${Date.now()}`;
                                    localStorage.setItem('lastMagnesImageUrl', params.imageUrl);
                                    setNodes(nds => [...nds, { id: nodeId, type: 'input-image', position: { x: 100, y: 150 }, data: { content: params.imageUrl, label: '灵感同步' } }]);
                                    toast('🖼️ 图片已同步到画布', 'success');
                                }
                            }}
                        />
                        {historyOpen && (
                            <div className="absolute inset-0 bg-white z-40 flex flex-col">
                                <div className="px-6 py-4 border-b-2 border-black flex justify-between items-center bg-white">
                                    <span className="font-bold text-[12px] uppercase text-black">生成历史 [{historyList.length}]</span>
                                    <button onClick={() => setHistoryOpen(false)}>{X ? React.createElement(X, { size: 18 }) : '×'}</button>
                                </div>
                                <div className="flex-1 overflow-y-auto bg-zinc-50 p-4 space-y-4">
                                    {historyList.map(item => (
                                        <div key={item.id} className="p-4 bg-white border border-black group">
                                            <div className="flex justify-between mb-2">
                                                <span className="text-[10px] font-bold border border-black px-1 uppercase">{item.status}</span>
                                                <button onClick={() => deleteHistory(item.id)} className="opacity-0 group-hover:opacity-100">{Trash2 ? React.createElement(Trash2, { size: 12 }) : '🗑'}</button>
                                            </div>
                                            {item.url && <img src={item.url} className="w-full mb-2 border border-black/5 cursor-pointer" onClick={() => setLightboxItem({ url: item.url, prompt: item.prompt })} />}
                                            <p className="text-[11px] text-zinc-500 line-clamp-2 font-medium">{item.prompt}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </React.Fragment>
                ) : (
                    <ConversationPanel
                        messages={messages}
                        setMessages={setMessages}
                        theme={theme}
                        widthClass="w-full"
                        apiEndpoint={activeTab === 'knowledge' ? '/api/v1/rag/chat/run' : '/api/v1/dialogue/run'}
                        title={activeTab === 'knowledge' ? '知识库助手' : '灵感助手'}
                        placeholder="描述你想要的操作..."
                        showUpload={true}
                        noBorder={true}
                        collapsed={sidebarCollapsed}
                        setCollapsed={setSidebarCollapsed}
                        addNodes={(newNodes) => setNodes(nds => [...nds, ...newNodes])}
                        onTriggerGeneration={async (action, params) => {
                            console.log(`[Magnes] 🧭 onTriggerGeneration (RAG/Insp): action=${action}, params:`, params);
                            if (action === 'run_painter') {
                                const isGalleryOnly = activeTab === 'knowledge' || activeTab === 'gallery';
                                const nodeId = isGalleryOnly ? 'GALLERY_ONLY_TASK' : `gen-${Date.now()}`;

                                let lastUrl = localStorage.getItem('lastMagnesImageUrl') || '';
                                if (!lastUrl && nodes) {
                                    const imgNode = nodes.find(n => n.type === 'input-image');
                                    if (imgNode?.data?.content) lastUrl = imgNode.data.content;
                                }
                                let image_urls = (params.image_urls || (params.imageUrl ? [params.imageUrl] : [])).map(u => u === 'REUSE_CONTEXT_IMAGE' ? lastUrl : u);
                                image_urls = image_urls.filter(u => u && u.trim() !== '');

                                if (params.prompt) localStorage.setItem('lastShortPrompt', params.prompt);
                                if (params.imageUrl) localStorage.setItem('lastMagnesImageUrl', params.imageUrl);

                                if (!isGalleryOnly) {
                                    const newNode = {
                                        id: nodeId,
                                        type: 'gen-image',
                                        position: { x: 500, y: 150 },
                                        data: {
                                            label: 'AI 绘图',
                                            pendingPrompt: params.prompt,
                                            pendingImageUrls: image_urls,
                                            isGenerating: !!params.prompt,
                                            settings: {
                                                activeSkill: params.active_skill,
                                                conversationId,
                                                sourceImages: image_urls,
                                                denoising: params.var ?? 0.75,
                                                ratio: params.ratio || '1:1',
                                                prompt: params.prompt
                                            }
                                        }
                                    };
                                    setNodes(nds => [...nds, newNode]);

                                    if (lastUrl && nodes) {
                                        const sourceNode = nodes.find(n => n.type === 'input-image' && n.data.content === lastUrl);
                                        if (sourceNode) {
                                            setEdges(eds => [...eds, {
                                                id: `e-${sourceNode.id}-${nodeId}`,
                                                source: sourceNode.id,
                                                target: nodeId,
                                                sourceHandle: 'output',
                                                targetHandle: 'style'
                                            }]);
                                        }
                                    }
                                    setActiveTab('canvas');
                                    toast('⚡️ 已连线并同步到画布启动生图', 'success');
                                }
                            } else if (action === 'show_painter_result') {
                                const imageUrl = params.imageUrl || params.image_url;
                                if (!imageUrl) return;
                                setNodes(nds => {
                                    const sourceNode = [...nds].reverse().find(n => n.type === 'gen-image');
                                    if (!sourceNode) return nds;
                                    const galleryId = sourceNode.data.galleryId || `gallery-${Date.now()}`;
                                    const existingGallery = nds.find(n => n.id === galleryId);
                                    if (existingGallery) {
                                        const newVersion = { id: Date.now(), url: imageUrl, timestamp: Date.now(), label: `V${existingGallery.data.versions.length + 1}` };
                                        return nds.map(n => {
                                            if (n.id === sourceNode.id) return { ...n, data: { ...n.data, isGenerating: false } };
                                            if (n.id === galleryId) return { ...n, data: { ...n.data, versions: [...n.data.versions, newVersion] } };
                                            return n;
                                        });
                                    }

                                    const galleryNode = {
                                        id: galleryId,
                                        type: 'version-gallery',
                                        position: { x: sourceNode.position.x + 400, y: sourceNode.position.y },
                                        data: {
                                            label: '版本预览',
                                            versions: [{ id: Date.now(), url: imageUrl, timestamp: Date.now(), label: 'V1' }]
                                        }
                                    };
                                    setEdges(eds => [...eds, {
                                        id: `e-${sourceNode.id}-${galleryId}`,
                                        source: sourceNode.id,
                                        target: galleryId,
                                        sourceHandle: 'output',
                                        targetHandle: 'version-input'
                                    }]);
                                    // 关键修复：生图完成后，解锁“AI绘图”节点状态，允许再次点击
                                    return nds.map(n => n.id === sourceNode.id ? { ...n, data: { ...n.data, isGenerating: false, galleryId } } : n).concat(galleryNode);
                                });

                                // 新增：无论画布上是否存在节点，都静默将生图结果写入 RAG 图库
                                try {
                                    const token = window.MagnesComponents.Utils.Constants.MAGNES_API_TOKEN;
                                    const galleryApiUrl = (window.MagnesComponents.Utils.Constants.MAGNES_API_URL || '/api/v1') + '/rag/ingest/gallery';

                                    // 仅用于拿取技能和节点关联（如果存在）
                                    const sourceNode = [...(nodes || [])].reverse().find(n => n.type === 'gen-image');
                                    const skill = params.active_skill || params.skill || sourceNode?.data?.settings?.activeSkill || '';

                                    fetch(galleryApiUrl, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({
                                            version_data: {
                                                image_url: imageUrl,
                                                node_id: sourceNode ? sourceNode.id : 'chat_regenerate',
                                                prompt: params.prompt || '',
                                                skill: skill,
                                                timestamp: Date.now(),
                                                params: {
                                                    ratio: params.ratio || sourceNode?.data?.settings?.ratio || '1:1',
                                                    var: params.var ?? sourceNode?.data?.settings?.denoising ?? 0.75
                                                }
                                            }
                                        })
                                    }).then(res => res.json()).then(data => {
                                        if (data.status === 'success') {
                                            window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                                        }
                                    });
                                } catch (e) { console.error('Gallery sync failed', e); }

                                setNodes(nds => {
                                    // 仅当画布有节点时才切回画布并提示
                                    const sourceNode = [...nds].reverse().find(n => n.type === 'gen-image');
                                    if (sourceNode) {
                                        // setActiveTab('canvas'); // 取消强制切页，让用户留在当前页签，因为图库已自动刷新
                                        toast('✅ 生图已完成并挂载至画布', 'success');
                                    } else {
                                        toast('✅ 生图已完成并入库', 'success');
                                    }
                                    return nds;
                                });
                            } else if (action === 'run_xhs_search') {
                                toast('正在搜索最新灵感...', '', true);
                            } else if (action === 'run_xhs_publish') {
                                window.dispatchEvent(new CustomEvent('magnes:xhs_publish', { detail: { content: params.content, imageUrl: params.imageUrl } }));
                            } else if (action === 'create_rednote_node') {
                                window.dispatchEvent(new CustomEvent('magnes:create_rednote_node_request', { detail: params }));
                            } else if (action === 'mirror_image') {
                                const nodeId = `input-${Date.now()}`;
                                setNodes(nds => [...nds, { id: nodeId, type: 'input-image', position: { x: 100, y: 100 }, data: { content: params.imageUrl, label: '灵感同步' } }]);
                                setActiveTab('canvas');
                                toast('🖼️ 图片已同步到画布', 'success');
                            }
                        }}
                        onRetrievalResults={setSearchResults}
                        onRewrittenQueries={qs => { setRewrittenQueries(qs); setActiveFlowItem('augment'); }}
                        onRetrievalStats={setRetrievalStats}
                        extraContext={{ selectedDocIds, activeTab }}
                        conversationId={conversationId}
                        setConversationId={setConversationId}
                        key={`${activeTab}_${conversationId}`}
                    />
                )}
            </div>
        );
    };

    window.MagnesComponents.Layout = window.MagnesComponents.Layout || {};
    window.MagnesComponents.Layout.RightSidebar = RightSidebar;
})();
