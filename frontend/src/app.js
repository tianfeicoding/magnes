(function () {
    const { React, ReactDOM } = window;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    // 依赖注入：从上下文获取全局状态
    const { MagnesProvider, useMagnesContext } = window.MagnesComponents.Context;
    const { ComponentLibrary } = window.MagnesComponents.UI;
    const { RagFlowNavigator } = window.MagnesComponents.Rag.Components;

    // 导入 Stage 2 拆分出的新组件与 Hooks
    const { AppHeader, AppModals, RightSidebar } = window.MagnesComponents.Layout;
    const { RagMiddleContent } = window.MagnesComponents;
    const { ButtonEdge } = window.MagnesComponents.Edges;
    const {
        useRagData,
        useWindowEvents,
        useNodeOperations,
        useGenerationService,
        useCreateNode
    } = window.MagnesComponents.Hooks;

    // --- 移除外部定义的 MagnesCanvas (已移入内部并重新稳定至顶层) ---
    const MagnesCanvas = ({
        nodes, edges, onNodesChange, onEdgesChange, onConnect,
        onInit, onDrop, onDragOver, nodeTypes, edgeTypes, fitView, theme
    }) => {
        const ReactFlowLib = window.ReactFlow || window.ReactFlowRenderer;
        if (!ReactFlowLib) return null;
        const { ReactFlow, Background, Controls, ReactFlowProvider } = ReactFlowLib;

        return (
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={onInit}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{ type: 'button-edge' }}
                    minZoom={0.2}
                    maxZoom={4}
                    defaultViewport={{ x: 140, y: 80, zoom: 0.75 }}
                >
                    <Background gap={20} size={1} color={theme === 'dark' ? '#333' : '#cbd5e1'} />
                    <Controls />
                </ReactFlow>
            </ReactFlowProvider>
        );
    };

    const MagnesStudioContent = () => {
        const h = React.createElement;
        // --- 1. 全局配置与历史上下文 ---
        const {
            theme, setTheme, registerStartGeneration, startGeneration,
            apiConfigs, setApiConfigs, apiKeys, setApiKeys,
            jimengUseLocalFile, setJimengUseLocalFile, setLightboxItem,
            // 用户认证相关
            user, isLoggedIn, loginModalOpen, setLoginModalOpen,
            handleLoginSuccess, handleLogout
        } = useMagnesContext();

        // 历史管理 (复用 V2 现有的 Hook)
        const useMagnesHistory = window.MagnesComponents.Hooks.useMagnesHistory;
        const { history: historyList, pushState: addToHistory, updateState: updateHistory, deleteState: deleteHistory } = useMagnesHistory([]);

        // --- 2. 基础 UI 状态 ---
        const [activeTab, setActiveTab] = useState('canvas');
        const [prevTab, setPrevTab] = useState('canvas'); // 记录上一个 Tab 用于返回
        const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
        const [sidebarContext, setSidebarContext] = useState(null); // { targetNodeId, targetLayerId }
        const [historyOpen, setHistoryOpen] = useState(false);
        const [settingsOpen, setSettingsOpen] = useState(false);
        const [messages, setMessages] = useState([]);
        const [conversationId, setConversationId] = useState(() =>
            localStorage.getItem('magnes_conversation_id') || `conv_${Date.now()}`
        );

        // 监听外部 Tab 切换请求 (主要用于精排节点跳转素材库)
        useEffect(() => {
            const handleSwitchTab = (e) => {
                const { tab, context } = e.detail;
                console.log('[Magnes] 📡 magnes:switch_ext_tab RECEIVED:', { tab, context });

                if (tab) {
                    // [REFACTOR] 使用直接设置而非嵌套在 updater 中，增强稳定性
                    setPrevTab(window.MagnesActiveTab || 'canvas');
                    setActiveTab(tab);
                    window.MagnesActiveTab = tab; // 同步全局标记以便追踪

                    if (context) {
                        setSidebarContext(context);
                        // 直接更新 ref，确保后续能立即使用
                        sidebarContextRef.current = context;
                        console.log('[Magnes] ✅ Context set:', context);
                    }

                    // [FORCE] 强制展开侧边栏
                    setSidebarCollapsed(false);
                    console.log('[Magnes] 🚀 Asset Library Invocation Forced');
                }
            };
            window.addEventListener('magnes:switch_ext_tab', handleSwitchTab);
            return () => window.removeEventListener('magnes:switch_ext_tab', handleSwitchTab);
        }, []);

        // 监听打开侧边栏请求 (精细编排节点使用)
        useEffect(() => {
            const handleOpenSidebar = (e) => {
                const { tab } = e.detail || {};
                console.log('[Magnes] 📡 magnes:openSidebar RECEIVED:', { tab });
                if (tab) {
                    setActiveTab(tab);
                    setSidebarCollapsed(false);
                    console.log('[Magnes] 🚀 Sidebar Opened from FineTune Node');
                }
            };
            window.addEventListener('magnes:openSidebar', handleOpenSidebar);
            return () => window.removeEventListener('magnes:openSidebar', handleOpenSidebar);
        }, []);

        // 处理侧边栏素材选中
        // 使用 ref 存储 sidebarContext 避免闭包问题
        const sidebarContextRef = React.useRef(sidebarContext);
        React.useEffect(() => {
            sidebarContextRef.current = sidebarContext;
        }, [sidebarContext]);

        const handleSidebarAssetSelect = useCallback((asset) => {
            const ctx = sidebarContextRef.current;
            console.log('[Magnes] 📁 Asset selected:', asset, 'Context:', ctx);

            if (!ctx?.targetNodeId) {
                console.warn('[Magnes] ⚠️ No target node ID, cannot apply asset');
                return;
            }

            setNodes(nds => {
                console.log('[Magnes] 🔄 Updating nodes, total:', nds.length, 'target:', ctx.targetNodeId, 'layer:', ctx.targetLayerId);
                let foundNode = false;
                let foundLayer = false;

                const updatedNodes = nds.map(node => {
                    if (node.id !== ctx.targetNodeId) return node;
                    foundNode = true;

                    // 假设目标是 FineTuneNode
                    const layerId = ctx.targetLayerId;
                    const nextData = { ...node.data, isDirty: true };
                    // 兼容 content 为空但图层在 layoutData 或 computedLayers 中的情况
                    const baseContent = node.data.content || node.data.layoutData || {};
                    const currentLayers = baseContent.layers || node.data.computedLayers || [];

                    console.log('[Magnes] 📋 Base content source:', node.data.content ? 'content' : (node.data.layoutData ? 'layoutData' : 'computedLayers'), 'layers count:', currentLayers.length);

                    if (layerId) {
                        // 如果指定了图层（通常是背景层）
                        const layers = currentLayers.map(l => {
                            if (l.id === layerId) {
                                foundLayer = true;
                                return { ...l, url: asset.url };
                            }
                            return l;
                        });
                        nextData.content = { ...baseContent, layers };
                        console.log('[Magnes] ✅ Updated layer:', layerId, 'found:', foundLayer, 'URL:', asset.url?.substring(0, 50));
                    } else {
                        // 如果没有指定图层，尝试找到背景层
                        const layers = currentLayers.map(l => {
                            if (l.type === 'background' || l.id?.includes('background') || l.role?.includes('background')) {
                                foundLayer = true;
                                return { ...l, url: asset.url };
                            }
                            return l;
                        });
                        nextData.content = { ...baseContent, layers };
                        console.log('[Magnes] ✅ Auto-detected background layer, found:', foundLayer);
                    }

                    return { ...node, data: nextData };
                });

                console.log('[Magnes] 📊 Node update result - foundNode:', foundNode, 'foundLayer:', foundLayer);
                return updatedNodes;
            });

            // 选中后自动切回上一个页签
            setActiveTab(prevTab);
            setSidebarContext(null);
            toast('✅ 已替换背景', 'success');
        }, [setNodes, prevTab]);

        // --- 3. 弹窗控制状态 (传给 AppModals) ---
        const [toastMsg, setToastMsg] = useState('');
        const [toastType, setToastType] = useState('');
        const [toastPersistent, setToastPersistent] = useState(false);
        const [draftModalOpen, setDraftModalOpen] = useState(false);
        const [isDraftReadOnly, setIsDraftReadOnly] = useState(false);
        const [draftContent, setDraftContent] = useState('');
        const [draftTemplateId, setDraftTemplateId] = useState(null); // 灵感助手选中的模版 ID
        const [currentDraftMsgId, setCurrentDraftMsgId] = useState(null); // 当前正在草稿箱编辑的消息 ID
        const [publishModalOpen, setPublishModalOpen] = useState(false);
        const [publishData, setPublishData] = useState(null);
        const [detailModalOpen, setDetailModalOpen] = useState(false);
        const [selectedDetailDoc, setSelectedDetailDoc] = useState(null);
        const [detailContentOverride, setDetailContentOverride] = useState('');
        const [sourceModalOpen, setSourceModalOpen] = useState(false);
        const [sourceDocIds, setSourceDocIds] = useState([]);
        const [activeSourceMap, setActiveSourceMap] = useState({});
        const [sourceContent, setSourceContent] = useState('');

        const toast = useCallback((msg, type = '', persistent = false) => {
            setToastMsg(msg); setToastType(type); setToastPersistent(persistent);
        }, []);

        // --- 4. React Flow 核心编排 ---
        const ReactFlowLib = window.ReactFlow || window.ReactFlowRenderer;
        if (!ReactFlowLib) {
            return (
                <div className="flex items-center justify-center h-full bg-white font-bold text-zinc-400">
                    React Flow 库尚未就绪，请刷新页面...
                </div>
            );
        }
        const { ReactFlow, useNodesState, useEdgesState, addEdge, Background, Controls } = ReactFlowLib;
        const [nodes, setNodes, onNodesChangeInternal] = useNodesState([]);
        const [edges, setEdges, onEdgesChange] = useEdgesState([]);
        const [reactFlowInstance, setReactFlowInstance] = useState(null);

        // --- 修复级联删除崩溃 (Cascading Deletion) ---
        // 当父节点被删除时，同步删除其子节点（如附属属性面板），防止 React Flow 因 Parent node not found 崩溃
        const onNodesChange = useCallback((changes) => {
            const removedIds = changes.filter(c => c.type === 'remove').map(c => c.id);
            if (removedIds.length > 0) {
                // 查找所有以这些节点为父节点的子节点
                const childChanges = nodes
                    .filter(n => n.parentNode && removedIds.includes(n.parentNode))
                    .map(n => ({ type: 'remove', id: n.id }));

                if (childChanges.length > 0) {
                    onNodesChangeInternal([...changes, ...childChanges]);
                    return;
                }
            }
            onNodesChangeInternal(changes);
        }, [onNodesChangeInternal, nodes]);

        // 类型映射
        const edgeTypes = useMemo(() => ({ 'button-edge': ButtonEdge }), []);

        // nodeTypes 使用 ref + 延迟 tick 更新策略：
        // useMemo([], []) 只在挂载时读取一次，此时部分节点脚本可能还未注册；
        // 改为在 mount 后延迟一帧重建，确保所有 IIFE 都已执行完毕。
        const buildNodeTypes = useCallback(() => {
            const Nodes = window.MagnesComponents.Nodes;
            return {
                'input-image': Nodes.InputImageNodeRF,
                'gen-image': Nodes.GenImageNodeRF,
                'layer-split': Nodes.LayerSplitNodeRF,
                'refiner': Nodes.RefinerNodeRF,
                'layout-analyzer': Nodes.LayoutAnalyzerNode,
                'style-analyzer': Nodes.StyleAnalyzerNode,
                'style-validator': Nodes.StyleValidatorNode,
                'composer': Nodes.ComposerNodeRF,
                'fine-tune': Nodes.FineTuneNodeRF,
                'fine-tune-props': Nodes.FineTunePropsNodeRF,
                'preview': Nodes.PreviewNodeRF,
                'text-node': Nodes.TextNode,
                'rednote-content': Nodes.RednoteContentNodeRF,
                'image-text-template': Nodes.ImageTextTemplateNodeRF,
                'rednote-stylelab': Nodes.RednoteStyleLabNodeRF,
                'rednote-preview': Nodes.RednotePreviewNodeRF,
                'version-gallery': Nodes.VersionGalleryNodeRF,
            };
        }, []);

        const [nodeTypes, setNodeTypes] = useState(() => buildNodeTypes());

        // Mount 后延迟一帧刷新，确保所有节点脚本 IIFE 已执行
        useEffect(() => {
            const timer = setTimeout(() => setNodeTypes(buildNodeTypes()), 100);
            return () => clearTimeout(timer);
        }, [buildNodeTypes]);

        // --- 5. 业务逻辑 Hooks 注入 ---
        // RAG 数据加载
        const rag = useRagData(activeTab, toast);

        // 画布基础操作
        const nodeOps = useNodeOperations({ nodes, setNodes, setEdges, reactFlowInstance, addEdge });

        // 生成服务对接
        useGenerationService({
            registerStartGeneration, apiConfigs, apiKeys,
            setNodes, setEdges, setMessages,
            addToHistory, updateHistory,
            conversationId // <-- 传给 Hook 用于持久化
        });

        // 智能节点合成
        const { handleCreateNodeRequest } = useCreateNode({ setNodes, setEdges, setActiveTab, toast, conversationId });

        // 全局事件总线监听
        useWindowEvents({
            setMessages, setPublishData, setPublishModalOpen,
            setDraftContent, setIsDraftReadOnly, setDraftModalOpen, setDraftTemplateId, setCurrentDraftMsgId,
            currentDraftMsgId,
            setNodes, setEdges, setActiveTab,
            handleCreateNodeRequest,
            setSourceDocIds, setSourceModalOpen, setActiveSourceMap, setSourceContent,
            setSelectedDetailDoc, setDetailModalOpen, // 来源中可能点击笔记详情
            toast, api: rag.api, conversationId,
            setSidebarCollapsed,
            loadStats: rag.loadStats, loadKb: rag.loadKb, loadXhs: rag.loadXhs, loadGallery: rag.loadGallery
        });

        // 监听打开设置弹窗事件（登录成功后自动弹出API设置）
        useEffect(() => {
            const handleOpenSettings = (e) => {
                setSettingsOpen(true);
                if (e.detail?.reason === 'api_key_required') {
                    toast('请配置 API Key 以继续使用', 'info');
                }
            };
            window.addEventListener('magnes:open_settings', handleOpenSettings);
            return () => window.removeEventListener('magnes:open_settings', handleOpenSettings);
        }, [toast]);

        // 定时同步会话 ID 到存储，并触发历史消息加载
        useEffect(() => {
            localStorage.setItem('magnes_conversation_id', conversationId);

            const loadDialogueHistory = async (id) => {
                if (!id) return;
                try {
                    console.log(`[Magnes] 🔄 正在加载会话历史: ${id}`);
                    const API = window.MagnesComponents.Utils.API;
                    const response = await API.magnesFetch(`/dialogue/history?conversationId=${id}`);
                    const data = await response.json();
                    if (data.status === 'success' && data.history) {
                        setMessages(data.history);
                    }
                } catch (e) {
                    console.error('[Magnes] ❌ 加载历史失败:', e);
                }
            };
            loadDialogueHistory(conversationId);
        }, [conversationId]);

        return (
            <div className={`w-full h-full flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
                {/* 顶部导航 */}
                <AppHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    loadStats={rag.loadStats}
                    setSettingsOpen={setSettingsOpen}
                    // 用户认证相关
                    user={user}
                    isLoggedIn={isLoggedIn}
                    setLoginModalOpen={setLoginModalOpen}
                    handleLogout={handleLogout}
                />

                <div className="flex-1 overflow-hidden relative flex">
                    {/* 左侧轨道：组件库或 RAG 导航 */}
                    {(activeTab === 'canvas' || activeTab === 'assets') && (
                        <ComponentLibrary
                            theme={theme}
                            onNodeDragStart={(e, t) => e.dataTransfer.setData('application/reactflow', t)}
                        />
                    )}
                    {activeTab === 'knowledge' && React.createElement(RagFlowNavigator, {
                        activeItem: rag.activeFlowItem,
                        onSelect: rag.setActiveFlowItem
                    })}

                    {/* 中间主内容区：React Flow 画布或 RAG 面板 */}
                    <div className="flex-1 h-full relative overflow-hidden flex flex-col min-w-0" style={{ backgroundColor: '#ffffff' }}>
                        {(activeTab === 'canvas' || activeTab === 'assets') ? (
                            <MagnesCanvas
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={nodeOps.onConnect}
                                onInit={setReactFlowInstance}
                                onDrop={nodeOps.onDrop}
                                onDragOver={nodeOps.onDragOver}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                fitView
                                theme={theme}
                            />
                        ) : (
                            React.createElement(RagMiddleContent, {
                                ...rag,
                                activeTab: activeTab,
                                toast: toast,
                                setSelectedDetailDoc: setSelectedDetailDoc,
                                setDetailModalOpen: setDetailModalOpen,
                                // 转发上传函数
                                doKbUpload: rag.doKbUpload
                            })
                        )}
                    </div>

                    {/* 右侧边栏：对话助手与历史记录 */}
                    <RightSidebar
                        {...rag}
                        activeTab={activeTab}
                        prevTab={prevTab}
                        theme={theme}
                        sidebarCollapsed={sidebarCollapsed}
                        setSidebarCollapsed={setSidebarCollapsed}
                        messages={messages}
                        setMessages={setMessages}
                        conversationId={conversationId}
                        setConversationId={setConversationId}
                        nodes={nodes}
                        setNodes={setNodes}
                        setEdges={setEdges}
                        setActiveTab={setActiveTab}
                        toast={toast}
                        historyOpen={historyOpen}
                        setHistoryOpen={setHistoryOpen}
                        historyList={historyList}
                        deleteHistory={deleteHistory}
                        setLightboxItem={setLightboxItem}
                        startGeneration={startGeneration}
                        onAssetSelect={handleSidebarAssetSelect}
                    />
                </div>

                {/* 全局模态窗 & Toast 管理 */}
                <AppModals
                    draftModalOpen={draftModalOpen}
                    setDraftModalOpen={setDraftModalOpen}
                    draftContent={draftContent}
                    setDraftContent={setDraftContent}
                    isDraftReadOnly={isDraftReadOnly}
                    draftTemplateId={draftTemplateId}
                    setDraftTemplateId={setDraftTemplateId}
                    publishModalOpen={publishModalOpen}
                    setPublishModalOpen={setPublishModalOpen}
                    publishData={publishData}
                    confirmPublish={() => {/* TODO: API Confirm Publish */ }}
                    isPublishing={false}
                    detailModalOpen={detailModalOpen}
                    setDetailModalOpen={setDetailModalOpen}
                    selectedDetailDoc={selectedDetailDoc}
                    detailContentOverride={detailContentOverride}
                    toast={toast}
                    sourceModalOpen={sourceModalOpen}
                    setSourceModalOpen={setSourceModalOpen}
                    sourceDocIds={sourceDocIds}
                    activeSourceMap={activeSourceMap}
                    sourceContent={sourceContent}
                    toastMsg={toastMsg}
                    toastType={toastType}
                    toastPersistent={toastPersistent}
                    setToastMsg={setToastMsg}
                    settingsOpen={settingsOpen}
                    setSettingsOpen={setSettingsOpen}
                    apiKeys={apiKeys}
                    setApiKeys={setApiKeys}
                    jimengUseLocalFile={jimengUseLocalFile}
                    setJimengUseLocalFile={setJimengUseLocalFile}
                    // 登录弹窗
                    loginModalOpen={loginModalOpen}
                    setLoginModalOpen={setLoginModalOpen}
                    onLoginSuccess={handleLoginSuccess}
                />
            </div>
        );
    };

    // 核心应用入口
    window.MagnesComponents.MagnesStudio = () => (
        <MagnesProvider>
            <MagnesStudioContent />
        </MagnesProvider>
    );

    // 等待加载屏幕结束后渲染
    const root = ReactDOM.createRoot(document.getElementById('root'));
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.style.display = 'none';
        root.render(<window.MagnesComponents.MagnesStudio />);
    }, 500);
})();
