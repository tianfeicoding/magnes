/**
 * VersionGalleryNode - React Flow 版本
 * 路径: src/nodes/rf/version-gallery-rf.js
 *
 * 版本画廊节点：Manus 风格版本对比管理器
 * - 自动接收并展示每次生成产出的图片版本
 * - 支持版本切换主展示、版本操作（发送/再生/导出）
 * - 纯前端状态管理，无需后端接口
 */

(function () {
    const { React } = window;
    const { useState, useCallback, useMemo, useEffect, useRef } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow, useNodes, Handle, Position } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || UI.LucideIcons || {};
    const BaseNode = MAGNES.Nodes?.BaseNode;

    // ─── 版本卡片（主展示） ───────────────────────────────────────────────
    const MainVersionCard = ({ version, onDownload, onSendToChat, onSendToCanvas, onDelete, onEdit, onSaveToRAG }) => {
        const { Download, MessageSquare, ArrowRight, Trash2, Edit3, Bookmark } = Icons;
        if (!version) return null;

        const timeStr = new Date(version.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit'
        });

        const isVideoUrl = (url) => url && url.match(/\.(mp4|webm|ogg)$/i);
        const isVideo = isVideoUrl(version.url);
        const mjImages = version.mjImages || [];
        const showMjGrid = mjImages && mjImages.length > 1;

        return (
            <div className="relative border border-black overflow-hidden group">
                {/* 图片区域 */}
                <div
                    className="w-full aspect-square bg-zinc-50 flex items-center justify-center overflow-hidden relative cursor-pointer"
                    onClick={() => onDownload?.(version.url)}
                >
                    {showMjGrid ? (
                        <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-black">
                            {mjImages.slice(0, 4).map((img, i) => <img key={i} src={img} className="w-full h-full object-cover" alt="mj" />)}
                        </div>
                    ) : isVideo ? (
                        <video src={version.url} className="w-full h-full object-contain bg-black" />
                    ) : (
                        <img
                            src={version.url}
                            alt={`版本 ${version.label}`}
                            className="w-full h-full object-contain"
                        />
                    )}
                    {/* 悬停 Overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 flex items-end justify-end p-2">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-black/70 text-white px-2 py-1">
                            点击下载
                        </span>
                    </div>
                </div>

                {/* 版本信息条 */}
                <div className="flex items-center justify-between px-2 py-1.5 border-t border-black bg-white">
                    <div className="flex items-center gap-2">
                        <span className="bg-black text-white text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5">
                            {version.label}
                        </span>
                        {version.skill && (
                            <span className="text-[10px] text-zinc-500 font-mono">{version.skill}</span>
                        )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">{timeStr}</span>
                </div>

                {/* 操作按钮组 */}

                {/* 操作按钮组 */}
                <div className="flex -space-x-[1px] border-t border-black">
                    <button
                        onClick={() => onDownload?.(version.url)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1"
                        title="下载到本地"
                    >
                        {Download ? <Download size={12} /> : '⤓'}
                        <span className="text-[10px] font-black uppercase tracking-wider">下载</span>
                    </button>
                    <button
                        onClick={() => onSendToChat?.(version)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1"
                        title="发送到对话"
                    >
                        {MessageSquare ? <MessageSquare size={12} /> : '💬'}
                        <span className="text-[10px] font-black uppercase tracking-wider">反馈</span>
                    </button>
                    <button
                        onClick={() => onSendToCanvas?.(version)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 border-r border-black"
                        title="发送到画布"
                    >
                        {ArrowRight ? <ArrowRight size={12} /> : '→'}
                        <span className="text-[10px] font-black uppercase tracking-wider">入画</span>
                    </button>
                    <button
                        onClick={() => onSaveToRAG?.(version)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 border-r border-black"
                        title="收藏到 AI 生图库"
                    >
                        {Bookmark ? <Bookmark size={12} /> : '★'}
                        <span className="text-[10px] font-black uppercase tracking-wider">收藏</span>
                    </button>
                    {/* 暂时隐藏精细编辑按钮，之后启用 */}
                    {/* 
                    <button
                        onClick={() => onEdit?.(version)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1 border-r border-zinc-200"
                        title="进入精细编辑"
                    >
                        {Edit3 ? <Edit3 size={12} /> : '✎'}
                        <span className="text-[10px] font-black uppercase tracking-wider">编辑</span>
                    </button>
                    */}
                    <button
                        onClick={() => onDelete?.(version.id)}
                        className="flex-1 py-2 bg-white hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1"
                        title="删除这个版本"
                    >
                        {Trash2 ? <Trash2 size={12} /> : '🗑'}
                        <span className="text-[10px] font-black uppercase tracking-wider">删除</span>
                    </button>
                </div>
            </div>
        );
    };

    // ─── 版本缩略卡（历史） ─────────────────────────────────────────────
    const ThumbVersionCard = ({ version, isActive, onClick }) => {
        const timeStr = new Date(version.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit'
        });

        return (
            <div
                className={`border border-black cursor-pointer overflow-hidden transition-all group ${isActive ? 'bg-zinc-50' : 'bg-white hover:border-black'}`}
                onClick={() => onClick(version.id)}
            >
                <div className="aspect-square bg-zinc-50 overflow-hidden relative">
                    <img
                        src={version.url}
                        alt={version.label}
                        className="w-full h-full object-cover"
                    />
                    {isActive && (
                        <div className="absolute inset-0 border-2 border-black pointer-events-none" />
                    )}
                </div>
                <div className="px-1.5 py-1 bg-white border-t border-black">
                    <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase ${isActive ? 'text-black' : 'text-zinc-400'}`}>
                            {version.label}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-300">{timeStr}</span>
                    </div>
                    {version.skill && (
                        <p className="text-[9px] text-zinc-300 font-mono truncate">{version.skill}</p>
                    )}
                </div>
            </div>
        );
    };

    // ─── 版本画廊主节点 ─────────────────────────────────────────────────
    const VersionGalleryNode = ({ id, data, selected }) => {
        const { addNodes, setNodes, getNode } = useReactFlow();
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ setLightboxItem: () => { } }) };
        const { setLightboxItem } = useMagnesContext();

        const { LayoutGrid, GalleryVertical, Trash2, ChevronDown, ChevronUp, Images, ArrowRight, RefreshCw, Edit3, Download, MessageSquare, Bookmark } = Icons;

        // 布局模式：'main' (主图+缩略图) 或 'grid' (全平铺)
        const layoutMode = data.settings?.layout || 'main';

        // 版本列表：[{ id, url, label, timestamp, skill, conversationTurn }]
        const versions = data.versions || [];
        const [activeVersionId, setActiveVersionId] = useState(versions[0]?.id || null);

        const prevLengthRef = useRef(versions.length);
        useEffect(() => {
            if (versions.length > prevLengthRef.current) {
                // 有新版本产生，自动切换到 V[Latest] (数组第0位)
                setActiveVersionId(versions[0]?.id);
            }
            prevLengthRef.current = versions.length;
        }, [versions.length]);

        const activeVersion = useMemo(() =>
            versions.find(v => v.id === activeVersionId) || versions[0],
            [versions, activeVersionId]
        );

        const historyVersions = useMemo(() =>
            versions.filter(v => v.id !== activeVersionId),
            [versions, activeVersionId]
        );

        // ── 操作处理 ──────────────────────────────────────────────
        const handleDownload = async (url) => {
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `magnes-design-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error('Download failed:', e);
                window.open(url, '_blank');
            }
        };

        const handleSendToChat = (version) => {
            window.dispatchEvent(new CustomEvent('magnes:send-to-chat', {
                detail: { imageUrl: version.url }
            }));
            // 简单的反馈
            const btn = document.activeElement;
            if (btn && btn.lastChild) {
                const oldText = btn.lastChild.textContent;
                btn.lastChild.textContent = '已发送';
                setTimeout(() => { if (btn && btn.lastChild) btn.lastChild.textContent = oldText; }, 1500);
            }
        };

        const handleSendToCanvas = (version) => {
            const currentNode = getNode(id);
            if (!currentNode) return;
            addNodes({
                id: `input-image-${Date.now()}`,
                type: 'input-image',
                position: {
                    x: currentNode.position.x + 380,
                    y: currentNode.position.y
                },
                data: { content: version.url, dimensions: { w: 1024, h: 1024 } }
            });
        };

        const handleDeleteVersion = (versionId) => {
            if (!confirm('确认删除该版本？')) return;
            setNodes(nds => nds.map(n => {
                if (n.id === id) {
                    const newVersions = (n.data.versions || []).filter(v => v.id !== versionId);
                    return { ...n, data: { ...n.data, versions: newVersions } };
                }
                return n;
            }));
            if (activeVersionId === versionId) {
                setActiveVersionId(versions.find(v => v.id !== versionId)?.id || null);
            }
        };

        // [RAG] 收藏到 AI 生图库
        const handleSaveToRAG = async (version) => {
            const versionData = {
                version_id: version.id,
                image_url: version.url,
                rating: 'good',
                skill_name: version.skill || '',
                params: {},
                timestamp: version.timestamp
            };
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const resp = await API.magnesFetch('/rag/ingest/gallery', {
                    method: 'POST',
                    body: JSON.stringify({ version_data: versionData })
                });
                if (resp.ok) {
                    // 简单反馈
                    const el = document.activeElement;
                    if (el && el.lastChild) {
                        const old = el.lastChild.textContent;
                        el.style.background = '#000';
                        el.style.color = '#fff';
                        el.lastChild.textContent = '已收藏';
                        setTimeout(() => {
                            if (el) { el.style.background = ''; el.style.color = ''; }
                            if (el && el.lastChild) el.lastChild.textContent = old;
                        }, 1500);
                    }
                    console.log('[Gallery] ★ 收藏成功:', version.id);
                } else {
                    alert('收藏失败，请确认后端已启动');
                }
            } catch (e) {
                alert('收藏失败: ' + e.message);
            }
        };

        const handleEdit = (version) => {
            const currentNode = getNode(id);
            if (!currentNode) return;
            const editNodeId = `edit_${Date.now()}`;
            addNodes({
                id: editNodeId,
                type: 'rednote-stylelab',
                position: { x: currentNode.position.x + 380, y: currentNode.position.y },
                data: { templateImage: version.url, mode: 'template-edit', sourceGalleryId: id }
            });
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('magnes:create-edge', {
                    detail: { source: id, target: editNodeId, label: '编辑' }
                }));
            }, 50);
        };

        const updateSettings = useCallback((updates) => {
            setNodes((nds) => nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, settings: { ...node.data.settings, ...updates } } } : node
            ));
        }, [id, setNodes]);

        const handleClearAll = () => {
            if (!confirm(`确认清空全部 ${versions.length} 个版本？`)) return;
            setNodes(nds => nds.map(n =>
                n.id === id ? { ...n, data: { ...n.data, versions: [] } } : n
            ));
        };

        const toggleLayout = () => {
            updateSettings({ layout: layoutMode === 'main' ? 'grid' : 'main' });
        };

        // 空状态 UI
        if (versions.length === 0) {
            return (
                <div style={{ width: '300px' }}>
                    <div className="border border-black bg-white">
                        {/* Handle */}
                        <Handle type="target" position={Position.Left} id="version-input" style={{ top: '50%' }} />

                        <div className="flex items-center justify-between px-3 py-2 border-b border-black">
                            <div className="flex items-center gap-2">
                                <Images size={12} className="text-black" />
                                <span className="text-[12px] font-black uppercase tracking-widest">版本列表</span>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">[0]</span>
                        </div>

                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <Images size={28} strokeWidth={1} className="text-zinc-300" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 text-center leading-relaxed px-4">
                                等待生成结果
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div style={{ width: '300px' }}>
                <div className="border border-black bg-white flex flex-col">
                    {/* Handle */}
                    <Handle type="target" position={Position.Left} id="version-input" style={{ top: '50%' }} />

                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-black shrink-0">
                        <div className="flex items-center gap-2">
                            <Images size={12} className="text-black" />
                            <span className="text-[12px] font-black uppercase tracking-widest">版本列表</span>
                            <span className="text-[10px] font-mono text-zinc-400">[{versions.length}]</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={toggleLayout}
                                className="p-1 text-zinc-400 hover:text-black transition-colors"
                                title={layoutMode === 'main' ? '切换到平铺模式' : '切换到列表模式'}
                            >
                                {layoutMode === 'main'
                                    ? <LayoutGrid size={13} />
                                    : <GalleryVertical size={13} />}
                            </button>
                            <button
                                onClick={handleClearAll}
                                className="p-1 text-zinc-400 hover:text-black transition-colors"
                                title="清空历史"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-0 overflow-hidden">
                        {layoutMode === 'main' ? (
                            <>
                                {/* 最新版本：主展示 */}
                                <div className="p-2 border-b border-black">
                                    <MainVersionCard
                                        version={activeVersion}
                                        onDownload={handleDownload}
                                        onSendToChat={handleSendToChat}
                                        onSendToCanvas={handleSendToCanvas}
                                        onDelete={handleDeleteVersion}
                                        onEdit={handleEdit}
                                        onSaveToRAG={handleSaveToRAG}
                                    />
                                </div>

                                {/* 历史版本：2列网格 */}
                                {historyVersions.length > 0 && (
                                    <div className="p-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-300 mb-1.5 flex items-center gap-1.5">
                                            <div className="h-[1px] flex-1 bg-zinc-100" />
                                            历史记录
                                            <div className="h-[1px] flex-1 bg-zinc-100" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-1">
                                            {historyVersions.map(v => (
                                                <ThumbVersionCard
                                                    key={v.id}
                                                    version={v}
                                                    isActive={false}
                                                    onClick={setActiveVersionId}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            /* 全平铺网格模式*/
                            <div className="p-2 overflow-y-auto max-h-[400px]">
                                <div className="grid grid-cols-2 gap-2">
                                    {versions.map(v => (
                                        <div
                                            key={v.id}
                                            className="relative group border border-black hover:border-black transition-colors cursor-pointer"
                                            onClick={() => handleDownload(v.url)}
                                        >
                                            <div className="aspect-square bg-zinc-50 overflow-hidden">
                                                <img
                                                    src={v.url}
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                    alt={v.label}
                                                />
                                            </div>
                                            <div className="absolute top-0 left-0 bg-black text-white text-[9px] font-black px-1.5 py-0.5">
                                                {v.label}
                                            </div>
                                            {/* 悬停快捷操作 */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSendToCanvas(v); }}
                                                    className="p-1.5 bg-white text-black hover:bg-zinc-100"
                                                    title="入画"
                                                >
                                                    <ArrowRight size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleSendToChat(v); }}
                                                    className="p-1.5 bg-white text-black hover:bg-zinc-100"
                                                    title="反馈"
                                                >
                                                    <MessageSquare size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.id); }}
                                                    className="p-1.5 bg-white text-black hover:bg-zinc-100"
                                                    title="删除"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // 注册
    window.MagnesComponents.Nodes.VersionGalleryNodeRF = VersionGalleryNode;
    console.log('✅ VersionGalleryNodeRF Registered');
})();
