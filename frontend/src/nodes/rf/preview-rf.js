/**
 * PreviewNode - React Flow 版本 (JSX)
 * 路径: src/nodes/rf/preview-rf.js
 */

(function () {
    const { React } = window;
    const { useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow, useEdges, useNodes } = ReactFlow;

    // 依赖
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { MonitorPlay, Copy, ImagePlus, MessageSquare, Edit3 } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const isVideoUrl = (url) => url && url.match(/\.(mp4|webm|ogg)$/i);

    // ─── 工具函数：推送新版本到版本画廊节点 ──────────────────────────────
    const pushVersionToGallery = (currentNodeId, url, nodes, setNodes, addNodes, skill) => {
        const newVersion = {
            id: `v_${Date.now()}`,
            url,
            label: `V`,  // 将在 gallery 内部按 index 计算
            timestamp: Date.now(),
            skill: skill || null,
            conversationTurn: null,
        };

        // 1. 查找已有版本画廊节点
        const galleryNode = nodes.find(n => n.type === 'version-gallery');

        if (galleryNode) {
            // 更新现有版本画廊：新版本插入首位
            setNodes(nds => nds.map(n => {
                if (n.id !== galleryNode.id) return n;
                const prevVersions = n.data.versions || [];
                const updatedVersions = [
                    { ...newVersion, label: `V${prevVersions.length + 1}` },
                    ...prevVersions.map((v, i) => ({ ...v, label: `V${prevVersions.length - i}` }))
                ];
                return { ...n, data: { ...n.data, versions: updatedVersions } };
            }));
        } else {
            // 2. 没有版本画廊节点时，在预览节点右侧自动创建
            const previewNode = nodes.find(n => n.id === currentNodeId);
            const galleryX = previewNode ? previewNode.position.x + 380 : 800;
            const galleryY = previewNode ? previewNode.position.y : 200;

            addNodes({
                id: `version-gallery-${Date.now()}`,
                type: 'version-gallery',
                position: { x: galleryX, y: galleryY },
                data: {
                    versions: [{ ...newVersion, label: 'V1' }]
                }
            });
        }
    };

    const PreviewNode = ({ id, data, selected }) => {
        const { addNodes, setEdges, setNodes } = useReactFlow();

        const edges = useEdges();
        const nodes = useNodes();

        // 获取全局 Context
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ setLightboxItem: () => { }, theme: 'light' }) };
        const { setLightboxItem, theme = 'light' } = useMagnesContext();

        const sourceData = useMemo(() => {
            const connectedEdges = edges.filter(e => e.target === id);
            if (connectedEdges.length === 0) return null;
            return nodes.find(n => n.id === connectedEdges[0].source)?.data || null;
        }, [edges, nodes, id]);

        const content = sourceData?.content;
        const mjImages = sourceData?.previewMjImages;
        const showMjGrid = mjImages && mjImages.length > 1;
        const isVideo = isVideoUrl(content);

        // ─── 自动推送版本：每次生成出新图片时触发 ─────────────────────────
        const prevContentRef = React.useRef(null);
        React.useEffect(() => {
            const currentUrl = content || (mjImages && mjImages[0]);
            // 仅当出现新的、不同的、非视频 Url 时才推送
            if (
                currentUrl &&
                currentUrl !== prevContentRef.current &&
                !isVideoUrl(currentUrl)
            ) {
                prevContentRef.current = currentUrl;
                const skill = sourceData?.skill || null;
                pushVersionToGallery(id, currentUrl, nodes, setNodes, addNodes, skill);
            }
        }, [content, mjImages]);
        // ────────────────────────────────────────────────────────────────

        const handleCopyLink = async (e) => {
            e.stopPropagation();
            const url = content || (mjImages && mjImages[0]);
            if (url) {
                await navigator.clipboard.writeText(url);
                alert('链接已复制');
            }
        };

        const handleSendToCanvas = (e) => {
            e.stopPropagation();
            const url = content || (mjImages && mjImages[0]);
            if (!url) return;
            const currentNode = nodes.find(n => n.id === id);
            addNodes({
                id: `node_${Date.now()}`,
                type: 'input-image',
                position: { x: currentNode.position.x + 350, y: currentNode.position.y },
                data: { content: url, dimensions: { w: 1024, h: 1024 } }
            });
        };

        const handleCreateEditNode = (e) => {
            e.stopPropagation();
            const url = content || (mjImages && mjImages[0]);
            if (!url) return;
            const currentNode = nodes.find(n => n.id === id);
            const editNodeId = `edit_${Date.now()}`;
            addNodes({
                id: editNodeId,
                type: 'rednote-stylelab',
                position: { x: currentNode.position.x + 400, y: currentNode.position.y },
                data: { templateImage: url, mode: 'template-edit', sourcePreviewId: id }
            });
            setEdges((eds) => [...eds, { id: `edge_${id}_${editNodeId}`, source: id, target: editNodeId, targetHandle: 'image' }]);
        };

        if (!BaseNode) return null;

        return (
            <BaseNode
                id={id}
                title="预览窗口"
                icon={MonitorPlay}
                selected={selected}
                style={{ width: '320px', minHeight: '260px' }}
                handles={{ target: [{ id: 'input', top: '50%' }] }}
            >
                <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                    <div
                        className={`relative w-full aspect-square overflow-hidden flex items-center justify-center border border-black group
                                   ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white'}`}
                        onDoubleClick={() => setLightboxItem?.({ url: content || mjImages[0], type: isVideo ? 'video' : 'image' })}
                    >
                        {sourceData?.isGenerating && (
                            <div className="absolute inset-0 z-10 bg-white/90 flex flex-col items-center justify-center gap-2">
                                <div className="w-8 h-8 border border-zinc-200 border-t-black animate-spin" />
                                <span className="text-[12px] font-bold uppercase tracking-widest text-black">正在处理...</span>
                            </div>
                        )}

                        {content || showMjGrid ? (
                            showMjGrid ? (
                                <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-black">
                                    {mjImages.slice(0, 4).map((img, i) => <img key={i} src={img} className="w-full h-full object-cover" alt="mj" />)}
                                </div>
                            ) : isVideo ? (
                                <video src={content} className="w-full h-full object-contain bg-black" controls />
                            ) : (
                                <img src={content} className="w-full h-full object-contain" alt="preview" />
                            )
                        ) : !sourceData?.isGenerating && (
                            <div className="flex flex-col items-center p-4 text-center pointer-events-none gap-3">
                                <MonitorPlay size={32} strokeWidth={1} className="text-zinc-500" />
                                <span className="text-[12px] font-black text-zinc-500 uppercase tracking-widest leading-relaxed px-10 whitespace-pre-line">
                                    等待输入数据汇合
                                </span>
                            </div>
                        )}
                        {(content || showMjGrid) && (
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-[12px] px-2 py-1 backdrop-blur-sm">
                                双击全屏
                            </div>
                        )}
                    </div>

                    <div className="flex -space-x-[1px]">
                        <button onClick={handleCopyLink} className="flex-1 py-3 border border-black bg-white hover:bg-black hover:text-white transition-all">
                            <Copy size={16} className="mx-auto" />
                        </button>
                        <button onClick={handleSendToCanvas} className="flex-1 py-3 border border-black bg-white hover:bg-black hover:text-white transition-all">
                            <ImagePlus size={16} className="mx-auto" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); alert('Mock: Sent to Chat'); }} className="flex-1 py-3 border border-black bg-white hover:bg-black hover:text-white transition-all">
                            <MessageSquare size={16} className="mx-auto" />
                        </button>
                    </div>
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.PreviewNodeRF = PreviewNode;
    console.log('✅ PreviewNodeRF (JSX) Registered');
})();
