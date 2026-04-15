(function () {
    const { React } = window;
    const { MessageSquare } = window.MagnesComponents.UI.Icons;
    const { ChunkGroup } = window.MagnesComponents.Rag.Components;
    const { KnowledgePanel, RagasDashboard } = window.MagnesComponents.Rag.Panels;

    /**
     * RAG 中间内容展示区域组件
     * 对应 app.js 中的 renderRAGMiddleContent 逻辑
     * 接收所有必要的 state 和加载函数作为 props
     */
    const RagMiddleContent = ({
        activeFlowItem,
        kbDocs,
        xhsDocs,
        galleryDocs,
        activeTab,
        kbCategory,
        allDocChunks,
        selectedDocId,
        selectedDocIds,
        handleSelectDoc,
        loadChunks,
        doKbUpload,
        deleteKb,
        deleteAll,
        setKbCategory,
        rewrittenQueries,
        searchResults,
        toast,
        setDetailModalOpen,
        setSelectedDetailDoc,
        // 增加图库扩展属性接收
        galleryView,
        setGalleryView,
        activeGalleryTag,
        setActiveGalleryTag,
        groupedTimeline,
        groupedTags,
        updateGalleryTags,
        updateGalleryRating,
        renameGalleryFolder,
        // 转发 XHS 时间轴相关属性
        xhsView,
        setXhsView,
        xhsGroupedTimeline,
        promptDocs, // 增加接收提示词数据
        deletePrompt, // 提示词删除
        updatePromptTags // 提示词打标
    }) => {
        const h = React.createElement;

        switch (activeFlowItem) {
            case 'docs':
                const currentDocs = activeTab === 'xhs' ? xhsDocs : (activeTab === 'gallery' ? galleryDocs : kbDocs);
                return h(KnowledgePanel, {
                    activeTab: activeTab,
                    docs: currentDocs,
                    category: kbCategory,
                    allDocChunks,
                    selectedDocId,
                    selectedDocIds,
                    onSelectDoc: handleSelectDoc,
                    loadChunks,
                    doUpload: doKbUpload,
                    deleteKb,
                    deleteAll,
                    setCategory: setKbCategory,
                    minimal: true,
                    setDetailModalOpen,
                    setSelectedDetailDoc,
                    // 转发图库扩展属性
                    galleryView,
                    setGalleryView,
                    activeGalleryTag,
                    setActiveGalleryTag,
                    groupedTimeline,
                    groupedTags,
                    updateGalleryTags,
                    updateGalleryRating,
                    renameGalleryFolder,
                    // 转发 XHS 时间轴属性
                    xhsView,
                    setXhsView,
                    xhsGroupedTimeline,
                    promptDocs, // 转发提示词数据至子面板
                    deletePrompt,
                    updatePromptTags
                });
            case 'chunks':
                return h('div', { className: 'flex-1 flex flex-col bg-white h-full' },
                    h('div', { className: 'px-6 py-4 border-b border-black shrink-0 font-bold' }, '分块详情'),
                    h('div', { className: 'flex-1 overflow-y-auto p-6 bg-zinc-50' }, allDocChunks
                        .filter(p => !p.parent_chunk_id)
                        .map((p, idx) => h(ChunkGroup, {
                            key: p.chunk_id,
                            parent: p,
                            children: allDocChunks.filter(c => c.parent_chunk_id === p.chunk_id),
                            index: idx
                        })))
                );
            case 'augment': {
                const selectedDoc = kbDocs.find(d => d.doc_id === selectedDocId);
                const hasRewritten = rewrittenQueries.length > 0;

                return h('div', { className: 'flex-1 flex flex-col bg-zinc-50 h-full overflow-hidden' },
                    h('div', { className: 'px-6 py-4 border-b border-black bg-white shrink-0 flex items-center justify-between' },
                        h('div', { className: 'text-[12px] font-bold uppercase tracking-widest' }, hasRewritten ? "检索增强流程" : "文档知识快照")
                    ),
                    h('div', { className: 'flex-1 overflow-y-auto p-6' },
                        (selectedDoc || hasRewritten) ? (
                            <div className="mx-auto w-full space-y-6 animate-in fade-in duration-500">
                                {/* 核心摘要模块 */}
                                {selectedDoc && (
                                    <div className="p-5 border border-black bg-white shadow-sm transition-all">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase">SUMMARY</span>
                                            <span className="text-[12px] font-bold uppercase tracking-tight">文档核心摘要</span>
                                        </div>
                                        <div className="leading-relaxed text-[12px] markdown-content">
                                            {selectedDoc.doc_summary || "暂无文档摘要，请确保文档已完成深度解析。"}
                                        </div>
                                    </div>
                                )}

                                {/* 语义标签云模块 */}
                                {selectedDoc && (
                                    <div className="p-5 border border-black bg-white shadow-sm transition-all">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase">TAGS</span>
                                            <span className="text-[12px] font-bold uppercase tracking-tight">语义知识标签</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(selectedDoc.doc_tags ? selectedDoc.doc_tags.split(',') : []).map((tag, i) => (
                                                <span key={i} className="px-2 py-1 bg-zinc-50 border border-black text-[10px] font-bold hover:bg-black hover:text-white transition-all cursor-default uppercase">
                                                    #{tag.trim()}
                                                </span>
                                            ))}
                                            {(!selectedDoc.doc_tags) && <div className="eading-relaxed text-[12px] text-zinc-400 markdown-content">暂无标签</div>}
                                        </div>
                                    </div>
                                )}

                                {/* 问题改写结果模块 - 提问后追加 */}
                                {hasRewritten && (
                                    <div className="p-5 border border-black bg-white shadow-sm transition-all animate-in slide-in-from-bottom-4 duration-500">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase">REWRITE</span>
                                            <span className="text-[12px] font-bold uppercase tracking-tight">问题改写与搜索关键词</span>
                                        </div>
                                        <div className="space-y-1">
                                            {rewrittenQueries.map((q, i) => (
                                                <div key={i} className={`flex items-center gap-3 p-3 border transition-all ${i === 0 ? 'bg-zinc-50 border-black/10' : 'border-transparent hover:border-black'}`}>
                                                    <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-zinc-400 text-white' : 'bg-black text-white'}`}>
                                                        {i === 0 ? 'Q' : i}
                                                    </span>
                                                    <div className="flex-1 flex items-center justify-between gap-4">
                                                        <span className={`text-[12px] ${i === 0 ? 'font-bold' : 'font-medium'}`}>{q}</span>
                                                        {i === 0 && (
                                                            <span className="shrink-0 px-1.5 py-0.5 border border-black text-[9px] font-bold uppercase">ORIGINAL</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-40">
                                <div className="w-12 h-12 flex items-center justify-center mb-4">
                                    <MessageSquare size={20} />
                                </div>
                                <div className="text-[12px] uppercase tracking-[0.3em]">等待提问...</div>
                            </div>
                        )
                    )
                );
            }
            case 'recall':
                return h('div', { className: 'flex-1 flex flex-col bg-zinc-50 h-full overflow-hidden' },
                    h('div', { className: 'px-6 py-4 border-b border-black bg-white shrink-0 flex items-center justify-between' },
                        h('div', { className: 'text-[12px] font-bold uppercase tracking-widest' }, '召回语义分块')
                    ),
                    h('div', { className: 'flex-1 overflow-y-auto p-8' },
                        h('div', { className: 'mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500' },
                            searchResults.map((r, i) => h('div', { key: i, className: 'p-5 border border-black bg-white shadow-sm hover:shadow-md transition-all' },
                                h('div', { className: 'flex items-center gap-2 mb-2' },
                                    h('span', { className: 'px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase' }, i + 1),
                                    h('span', { className: 'text-[12px] font-bold uppercase tracking-tight truncate flex-1' }, r.metadata?.heading_path || r.metadata?.filename || "知识库分块"),
                                    h('div', { className: 'flex items-center gap-1.5' },
                                        h('span', { className: 'text-[9px] font-bold text-zinc-400 uppercase' }, 'Score:'),
                                        h('span', { className: 'text-[11px] font-mono font-bold text-black' }, (r.score * 100).toFixed(1) + '%')
                                    )
                                ),
                                h('div', {
                                    className: 'leading-relaxed text-[12px] text-zinc-800 markdown-content',
                                    dangerouslySetInnerHTML: { __html: r.visual_description || r.content }
                                }),
                                h('div', { className: 'mt-3 pt-2 border-t border-zinc-50 flex items-center gap-4 text-[9px] text-zinc-400 font-medium' },
                                    h('span', {}, `SOURCE: ${r.metadata?.source_type || 'KNOWLEDGE'}`),
                                    h('span', {}, `DOC: ${r.metadata?.filename || 'UNKNOWN'}`)
                                )
                            ))
                        )
                    )
                );
            case 'ragas':
                return h(RagasDashboard, { toast });
            default:
                return null;
        }
    };

    window.MagnesComponents.RagMiddleContent = RagMiddleContent;
})();
