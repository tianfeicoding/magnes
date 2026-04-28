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

    // --- 我的项目面板 ---
    const MyProjectsPanel = ({ projectList, loadProjectList, currentProjectId, onSwitchProject, onRenameProject, onDeleteProject, isLoggedIn, toast }) => {
        const [editingId, setEditingId] = useState(null);
        const [editingName, setEditingName] = useState('');

        useEffect(() => {
            if (isLoggedIn) loadProjectList();
        }, [isLoggedIn, loadProjectList]);

        const startRename = (project) => {
            setEditingId(project.id);
            setEditingName(project.name);
        };

        const confirmRename = (id) => {
            if (editingName.trim()) {
                onRenameProject(id, editingName.trim());
            }
            setEditingId(null);
        };

        const handleKeyDown = (e, id) => {
            if (e.key === 'Enter') confirmRename(id);
            if (e.key === 'Escape') setEditingId(null);
        };

        const handleSwitch = (project) => {
            onSwitchProject(project);
        };

        if (!isLoggedIn) {
            return (
                <div className="flex-1 flex items-center justify-center bg-white">
                    <div className="text-center">
                        <p className="text-zinc-400 font-bold text-lg mb-4">请先登录后查看项目</p>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('magnes:open_login'))}
                            className="px-6 py-2 bg-black text-white font-bold text-sm hover:bg-zinc-800 transition-all"
                        >
                            去登录
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex-1 overflow-auto bg-white p-8">
                <div className="max-w-[1400px] mx-auto">
                    <h2 className="text-xl font-bold text-black mb-6">我的项目</h2>
                    {projectList.length === 0 ? (
                        <div className="text-center py-20 border border-dashed border-zinc-300">
                            <p className="text-zinc-400 font-bold">暂无项目</p>
                            <p className="text-zinc-300 text-sm mt-2">新建一个项目开始创作吧</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 items-start">
                            {projectList.map(project => (
                                <div
                                    key={project.id}
                                    className={`group relative flex flex-col bg-white border transition-all cursor-pointer h-full ${
                                        currentProjectId === project.id
                                            ? 'border-[2px] border-black z-10 bg-zinc-50'
                                            : 'border-black -ml-px -mt-px hover:bg-zinc-50'
                                    }`}
                                    onClick={() => handleSwitch(project)}
                                >
                                    {/* A. 缩略图区域 */}
                                    <div className="w-full bg-zinc-100 border-b border-black overflow-hidden flex items-center justify-center relative shrink-0 aspect-[4/3]">
                                        {project.thumbnailUrl ? (
                                            <img
                                                src={project.thumbnailUrl}
                                                className="w-full h-full object-cover block transition-transform group-hover:scale-105"
                                                loading="lazy"
                                                onError={e => { e.target.style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-zinc-400">
                                                <span className="text-[10px] font-bold uppercase tracking-widest">无预览</span>
                                                <span className="text-[10px] mt-1">{project.nodeCount || 0} 节点</span>
                                            </div>
                                        )}
                                        {/* 当前标签 */}
                                        {currentProjectId === project.id && (
                                            <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black text-white text-[10px] font-bold">
                                                当前
                                            </span>
                                        )}
                                        {/* 右上角删除按钮 */}
                                        <button
                                            onClick={e => { e.stopPropagation(); onDeleteProject(project.id); }}
                                            className="absolute top-2 right-2 w-6 h-6 border border-black bg-white/80 backdrop-blur-sm text-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-20 hover:bg-black hover:text-white"
                                            title="删除"
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    {/* B. 信息区域 */}
                                    <div className="p-3 flex-1 flex flex-col min-h-[70px]">
                                        {editingId === project.id ? (
                                            <input
                                                autoFocus
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                onBlur={() => confirmRename(project.id)}
                                                onKeyDown={e => handleKeyDown(e, project.id)}
                                                className="w-full px-2 py-1 text-sm font-bold border border-black outline-none"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div className="text-[12px] font-bold leading-tight truncate mb-1" title={project.name}>
                                                {project.name}
                                            </div>
                                        )}
                                        <div className="text-[10px] text-zinc-400 font-bold">
                                            {project.nodeCount || 0} 节点 · {project.edgeCount || 0} 连线
                                        </div>
                                    </div>

                                    {/* C. 底部操作栏 */}
                                    <div className="px-3 pb-3 flex items-center justify-between">
                                        <button
                                            onClick={e => { e.stopPropagation(); startRename(project); }}
                                            className="px-2.5 py-1 border border-black bg-white text-black text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-all"
                                        >
                                            重命名
                                        </button>
                                        <span className="text-[10px] text-zinc-300 font-bold">
                                            {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

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
                    proOptions={{ hideAttribution: true }}
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

        // --- 2.1 项目持久化状态 ---
        const [currentProjectId, setCurrentProjectId] = useState(null);
        const [projectName, setProjectName] = useState('未命名项目');
        const [projectList, setProjectList] = useState([]);
        const [isSaving, setIsSaving] = useState(false);
        const saveTimeoutRef = useRef(null);
        const isLoadingProjectRef = useRef(false);
        const lastMemoryAnalysisRef = useRef(0); // 上次记忆分析时间戳

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
        const [xhsPrecheckModalOpen, setXhsPrecheckModalOpen] = useState(false);
        const [xhsPrecheckInfo, setXhsPrecheckInfo] = useState(null);

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
                'mask-fill': Nodes.MaskFillNodeRF,
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
        const nodeOps = useNodeOperations({ nodes, edges, setNodes, setEdges, reactFlowInstance, addEdge });

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

        useEffect(() => {
            const handleOpenXhsPrecheckModal = (e) => {
                setXhsPrecheckInfo(e.detail || null);
                setXhsPrecheckModalOpen(true);
            };
            window.addEventListener('magnes:open_xhs_precheck_modal', handleOpenXhsPrecheckModal);
            return () => window.removeEventListener('magnes:open_xhs_precheck_modal', handleOpenXhsPrecheckModal);
        }, []);

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

        // ── 项目持久化：页面刷新后自动恢复最后活跃项目 ──
        useEffect(() => {
            const loadLastProject = async () => {
                if (isLoadingProjectRef.current) return;
                isLoadingProjectRef.current = true;

                try {
                    const API = window.MagnesComponents.Utils.API;
                    const result = await API.Project.getLastActive();
                    if (result.status === 'success' && result.data) {
                        const project = result.data;
                        console.log('[Magnes] 📂 恢复项目:', project.name, project.id);
                        setCurrentProjectId(project.id);
                        setProjectName(project.name);
                        if (project.nodes && project.nodes.length > 0) {
                            setNodes(project.nodes);
                        }
                        if (project.edges && project.edges.length > 0) {
                            setEdges(project.edges);
                        }
                        if (project.conversationId) {
                            setConversationId(project.conversationId);
                        }
                        // 延迟恢复 viewport，确保 ReactFlow 已初始化
                        if (project.viewport && reactFlowInstance) {
                            setTimeout(() => {
                                reactFlowInstance.setViewport(project.viewport);
                            }, 300);
                        }
                    } else {
                        console.log('[Magnes] 📂 无历史项目，显示空画布');
                    }
                } catch (e) {
                    console.error('[Magnes] ❌ 加载项目失败:', e);
                } finally {
                    isLoadingProjectRef.current = false;
                }
            };

            // 仅在登录状态下恢复项目
            if (isLoggedIn) {
                loadLastProject();
            }
        }, [isLoggedIn]); // 登录状态变化时触发

        // ── 项目持久化：自动保存（debounce 2秒）──
        useEffect(() => {
            if (!isLoggedIn) return;
            if (isLoadingProjectRef.current) return; // 恢复过程中不保存

            // 清除上一次的定时器
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            // 2 秒后自动保存
            saveTimeoutRef.current = setTimeout(async () => {
                try {
                    const API = window.MagnesComponents.Utils.API;
                    const viewport = reactFlowInstance ? reactFlowInstance.getViewport() : { x: 0, y: 0, zoom: 1 };

                    // 如果没有项目ID但有内容，先创建新项目
                    if (!currentProjectId && nodes.length > 0) {
                        const result = await API.Project.create({
                            name: projectName,
                            nodes,
                            edges,
                            viewport,
                            conversationId
                        });
                        if (result.status === 'success' && result.data) {
                            setCurrentProjectId(result.data.id);
                            console.log('[Magnes] 🆕 新项目已创建并保存:', result.data.id);
                        }
                        return;
                    }

                    // 已有项目ID，执行更新
                    if (currentProjectId) {
                        await API.Project.update(currentProjectId, {
                            nodes,
                            edges,
                            viewport,
                            conversationId,
                            actionHint: 'auto_save'
                        });
                        console.log('[Magnes] 💾 项目自动保存成功:', currentProjectId);

                        // 每隔 5 分钟触发一次记忆分析（异步，不阻塞）
                        const now = Date.now();
                        if (now - lastMemoryAnalysisRef.current > 5 * 60 * 1000) {
                            lastMemoryAnalysisRef.current = now;
                            setTimeout(async () => {
                                try {
                                    const result = await API.Memory.analyze(100);
                                    if (result.status === 'success' && result.data?.extracted?.length > 0) {
                                        console.log('[Magnes] 🧠 记忆分析完成:', result.data.summary);
                                        console.log('[Magnes] 🧠 提取偏好:', result.data.extracted);
                                    }
                                } catch (err) {
                                    console.error('[Magnes] 🧠 记忆分析失败:', err);
                                }
                            }, 3000); // 延迟 3 秒执行，避免与保存冲突
                        }
                    }
                } catch (e) {
                    console.error('[Magnes] ❌ 项目自动保存失败:', e);
                }
            }, 2000);

            return () => {
                if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                }
            };
        }, [isLoggedIn, currentProjectId, nodes, edges, conversationId, reactFlowInstance, projectName]);

        // ── 重命名项目 ──
        const handleRenameProject = useCallback(async (projectId, newName) => {
            if (!projectId || !newName.trim()) return;
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.Project.update(projectId, { name: newName.trim(), actionHint: 'project_rename' });
                setProjectList(prev => prev.map(p => p.id === projectId ? { ...p, name: newName.trim() } : p));
                if (currentProjectId === projectId) {
                    setProjectName(newName.trim());
                }
                toast('✏️ 项目已重命名', 'success');
            } catch (e) {
                console.error('[Magnes] ❌ 重命名项目失败:', e);
                toast('重命名失败', 'error');
            }
        }, [currentProjectId, toast]);

        // ── 删除项目 ──
        const handleDeleteProject = useCallback(async (projectId) => {
            if (!projectId) return;
            if (!confirm('确定要删除该项目吗？此操作不可恢复。')) return;
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.Project.delete(projectId);
                setProjectList(prev => prev.filter(p => p.id !== projectId));
                if (currentProjectId === projectId) {
                    setCurrentProjectId(null);
                    setProjectName('未命名项目');
                    setNodes([]);
                    setEdges([]);
                }
                toast('🗑️ 项目已删除', 'success');
            } catch (e) {
                console.error('[Magnes] ❌ 删除项目失败:', e);
                toast('删除失败', 'error');
            }
        }, [currentProjectId, setNodes, setEdges, toast]);

        // ── 新建项目 ──
        const handleNewProject = useCallback(async () => {
            if (!isLoggedIn) {
                toast('请先登录后再创建项目', 'info');
                return;
            }
            setCurrentProjectId(null);
            setProjectName('未命名项目');
            setNodes([]);
            setEdges([]);
            setActiveTab('canvas');
            toast('✨ 新项目已创建', 'success');
        }, [isLoggedIn, setNodes, setEdges, toast]);

        // ── 加载项目列表 ──
        const loadProjectList = useCallback(async () => {
            if (!isLoggedIn) return;
            try {
                const API = window.MagnesComponents.Utils.API;
                const result = await API.Project.list();
                if (result.status === 'success' && result.data) {
                    setProjectList(result.data);
                }
            } catch (e) {
                console.error('[Magnes] ❌ 加载项目列表失败:', e);
            }
        }, [isLoggedIn]);

        // 登录后加载项目列表
        useEffect(() => {
            if (isLoggedIn) {
                loadProjectList();
            }
        }, [isLoggedIn, loadProjectList]);

        // ── 切换项目 ──
        const handleSwitchProject = useCallback(async (project) => {
            if (!project || !project.id) return;
            isLoadingProjectRef.current = true;
            try {
                const API = window.MagnesComponents.Utils.API;
                const result = await API.Project.get(project.id);
                if (result.status === 'success' && result.data) {
                    const data = result.data;
                    setCurrentProjectId(data.id);
                    setProjectName(data.name);
                    if (data.nodes) setNodes(data.nodes);
                    if (data.edges) setEdges(data.edges);
                    if (data.conversationId) setConversationId(data.conversationId);
                    if (data.viewport && reactFlowInstance) {
                        setTimeout(() => reactFlowInstance.setViewport(data.viewport), 300);
                    }
                    setActiveTab('canvas');
                    toast(`已切换到项目「${data.name}」`, 'success');
                }
            } catch (e) {
                console.error('[Magnes] ❌ 切换项目失败:', e);
                toast('切换项目失败', 'error');
            } finally {
                isLoadingProjectRef.current = false;
            }
        }, [setNodes, setEdges, setConversationId, setActiveTab, reactFlowInstance, toast]);

        return (
            <div className={`w-full h-full flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
                {/* 顶部导航 */}
                <AppHeader
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    loadStats={rag.loadStats}
                    setSettingsOpen={setSettingsOpen}
                    // 项目相关
                    projectName={projectName}
                    onNewProject={handleNewProject}
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
                        {activeTab === 'my-projects' ? (
                            <MyProjectsPanel
                                projectList={projectList}
                                loadProjectList={loadProjectList}
                                currentProjectId={currentProjectId}
                                onSwitchProject={handleSwitchProject}
                                onRenameProject={handleRenameProject}
                                onDeleteProject={handleDeleteProject}
                                isLoggedIn={isLoggedIn}
                                toast={toast}
                            />
                        ) : (activeTab === 'canvas' || activeTab === 'assets') ? (
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
                    xhsPrecheckModalOpen={xhsPrecheckModalOpen}
                    setXhsPrecheckModalOpen={setXhsPrecheckModalOpen}
                    xhsPrecheckInfo={xhsPrecheckInfo}
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
