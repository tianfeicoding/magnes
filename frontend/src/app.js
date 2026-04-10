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
            jimengUseLocalFile, setJimengUseLocalFile, setLightboxItem
        } = useMagnesContext();

        // 历史管理 (复用 V2 现有的 Hook)
        const useMagnesHistory = window.MagnesComponents.Hooks.useMagnesHistory;
        const { history: historyList, pushState: addToHistory, updateState: updateHistory, deleteState: deleteHistory } = useMagnesHistory([]);

        // --- 2. 基础 UI 状态 ---
        const [activeTab, setActiveTab] = useState('canvas');
        const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
        const [historyOpen, setHistoryOpen] = useState(false);
        const [settingsOpen, setSettingsOpen] = useState(false);
        const [messages, setMessages] = useState([]);
        const [conversationId, setConversationId] = useState(() =>
            localStorage.getItem('magnes_conversation_id') || `conv_${Date.now()}`
        );

        // --- 3. 弹窗控制状态 (传给 AppModals) ---
        const [toastMsg, setToastMsg] = useState('');
        const [toastType, setToastType] = useState('');
        const [toastPersistent, setToastPersistent] = useState(false);
        const [draftModalOpen, setDraftModalOpen] = useState(false);
        const [isDraftReadOnly, setIsDraftReadOnly] = useState(false);
        const [draftContent, setDraftContent] = useState('');
        const [draftTemplateId, setDraftTemplateId] = useState(null); // [NEW] 灵感助手选中的模版 ID
        const [currentDraftMsgId, setCurrentDraftMsgId] = useState(null); // [NEW] 当前正在草稿箱编辑的消息 ID
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
        const [nodes, setNodes, onNodesChange] = useNodesState([]);
        const [edges, setEdges, onEdgesChange] = useEdgesState([]);
        const [reactFlowInstance, setReactFlowInstance] = useState(null);

        // 类型映射
        const edgeTypes = useMemo(() => ({ 'button-edge': ButtonEdge }), []);
        const nodeTypes = useMemo(() => {
            const Nodes = window.MagnesComponents.Nodes;
            return {
                'input-image': Nodes.InputImageNodeRF,
                'gen-image': Nodes.GenImageNodeRF,
                'layer-split': Nodes.LayerSplitNodeRF,
                'refiner': Nodes.RefinerNodeRF, // Legacy
                'layout-analyzer': Nodes.LayoutAnalyzerNode,
                'style-analyzer': Nodes.StyleAnalyzerNode,
                'style-validator': Nodes.StyleValidatorNode,  // V1.0: 风格验证结果节点
                'composer': Nodes.ComposerNodeRF,
                'fine-tune': Nodes.FineTuneNodeRF,
                'preview': Nodes.PreviewNodeRF,
                'text-node': Nodes.TextNode,
                'rednote-content': Nodes.RednoteContentNodeRF,
                'image-text-template': Nodes.ImageTextTemplateNodeRF,
                'rednote-stylelab': Nodes.RednoteStyleLabNodeRF,
                'rednote-preview': Nodes.RednotePreviewNodeRF,
                'version-gallery': Nodes.VersionGalleryNodeRF,
            };
        }, []);

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
                    historyOpen={historyOpen}
                    setHistoryOpen={setHistoryOpen}
                    historyCount={historyList.length}
                    loadStats={rag.loadStats}
                    setSettingsOpen={setSettingsOpen}
                />

                <div className="flex-1 overflow-hidden relative flex">
                    {/* 左侧轨道：组件库或 RAG 导航 */}
                    {activeTab === 'canvas' && (
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
                        {activeTab === 'canvas' ? (
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
