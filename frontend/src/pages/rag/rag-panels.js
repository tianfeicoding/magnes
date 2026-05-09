/**
 * rag-panels.js - RAG 业务面板
 */
(function () {
    'use strict';

    const { React } = window;
    const { useState, useEffect, useCallback } = React;
    const h = React.createElement;
    const Icons = window.MagnesComponents?.UI?.Icons || window.Lucide || {};
    const { api } = window.MagnesComponents.Rag.Utils;

    // --- KnowledgePanel ---
    function KnowledgePanel(props) {
        const {
            activeTab, category, docs, selectedDocId, selectedDocIds = [],
            onSelectDoc, loadChunks, deleteKb, deleteAll, setCategory, minimal,
            setSelectedDetailDoc, setDetailModalOpen,
            // 图库扩展属性
            galleryView, setGalleryView, activeGalleryTag, setActiveGalleryTag,
            groupedTimeline, groupedTags, updateGalleryTags, updateGalleryRating, renameGalleryFolder,
            promptDocs, // 提示词库数据
            deletePrompt, updatePromptTags, // 提示词操作
            // 增加 xhs 时间轴相关属性
            xhsView, setXhsView, xhsGroupedTimeline
        } = props;

        const [activePromptTag, setActivePromptTag] = useState('全部');

        const categories = activeTab === 'xhs' ? ['笔记灵感', '爆文参考', '创作模版', '话题趋势', '收藏图片'] :
            activeTab === 'gallery' ? ['素材图库', '商品图库', '提示词库'] :
                ['通用资料', '品牌指南', '视觉规范', '文案库', '其它'];

        const getDocCategory = (d) => {
            if (activeTab === 'gallery') {
                // 如果触发了电商技能，默认归入商品图库
                if (d.skill_name === 'ecommerce-image-gen') return '商品图库';
                // 默认都是素材图库
                return '素材图库';
            }
            return d.category || (activeTab === 'xhs' ? '笔记灵感' : '通用资料');
        };

        // --- 子渲染逻辑：网格内容 ---
        const renderGridContent = (displayDocs, isXhs = false) => {
            return h('div', { className: `grid gap-6 items-start ${isXhs ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}` },
                displayDocs.length === 0
                    ? h('div', { className: 'col-span-full py-20 text-center text-zinc-400 text-[11px] font-bold' }, '暂无文档')
                    : displayDocs.map(doc => {
                        const id = doc.doc_id || doc.id;
                        const isSelected = (selectedDocIds || []).includes(id);
                        const isViewing = selectedDocId === id;

                        let CardComponent = window.MagnesComponents.Rag.Components.KnowledgeCard;
                        let cardProps = {
                            key: id,
                            doc: doc,
                            selected: isSelected || isViewing,
                            onSelect: onSelectDoc ? (checked) => onSelectDoc(id, checked) : null,
                            onClick: () => {
                                const isKnowledgeDoc = activeTab === 'knowledge' || (id || '').startsWith('kb_');
                                if (isKnowledgeDoc) {
                                    if (onSelectDoc) onSelectDoc(id, !isSelected);
                                } else {
                                    if (setSelectedDetailDoc) setSelectedDetailDoc(doc);
                                    if (setDetailModalOpen) setDetailModalOpen(true);
                                }
                                if (loadChunks) loadChunks(id);
                            },
                            onDelete: deleteKb,
                            onRating: updateGalleryRating,
                            onUpdateTags: (tags) => updateGalleryTags(id, tags)
                        };

                        if (isXhs) CardComponent = window.MagnesComponents.Rag.Components.XhsCard;
                        return h(CardComponent, cardProps);
                    })
            );
        };

        // --- 子渲染逻辑：分组视图 (Timeline) ---
        const renderGroupedContent = (groups, isXhs = false) => {
            return h('div', { className: 'flex flex-col h-full' },
                h('div', { className: 'flex-1' },
                    groups.length === 0 ? h('div', { className: 'py-40 text-center text-zinc-400 text-[11px] font-bold uppercase tracking-widest' }, '空空如也') :
                        groups.map(group => h('div', { key: group.id, className: 'mb-8 last:mb-0' },
                            h('div', { className: 'flex items-center justify-between mb-4 group/title' },
                                h('div', { className: 'flex items-center gap-3' },
                                    h('div', { className: 'w-1 h-3 bg-black' }),
                                    h('span', { className: 'text-[12px] font-black uppercase tracking-widest' },
                                        group.name && /^\d{8}$/.test(group.name) ? `${group.name.slice(0, 4)}-${group.name.slice(4, 6)}-${group.name.slice(6, 8)}` : group.name
                                    )
                                )
                            ),
                            h('div', { className: `grid gap-6 items-start ${isXhs ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'}` },
                                group.docs.map(doc => {
                                    const id = doc.id || doc.doc_id;
                                    let CardComponent = isXhs ? window.MagnesComponents.Rag.Components.XhsCard : window.MagnesComponents.Rag.Components.GalleryCard;
                                    return h(CardComponent, {
                                        key: id,
                                        doc: doc,
                                        selected: selectedDocIds.includes(id),
                                        onSelect: (checked) => onSelectDoc(id, checked),
                                        onClick: () => {
                                            if (setSelectedDetailDoc) setSelectedDetailDoc(doc);
                                            if (setDetailModalOpen) setDetailModalOpen(true);
                                        },
                                        onDelete: deleteKb,
                                        onRating: updateGalleryRating,
                                        onUpdateTags: (tags) => updateGalleryTags(id, tags)
                                    });
                                })
                            )
                        ))
                )
            );
        };

        // --- 子渲染逻辑：图库视图 ---
        const renderGalleryContent = () => {
            if (galleryView === 'prompts') return renderPromptsContent();

            const isTimeline = galleryView === 'timeline';
            if (isTimeline) return renderGroupedContent(groupedTimeline, false);

            return h('div', { className: 'flex flex-col h-full' },
                h('div', { className: 'flex flex-wrap gap-2 mb-6' },
                    ['全部', ...new Set(groupedTags.map(g => g.name))].map(tag => h('div', {
                        key: tag,
                        className: `px-3 py-1.5 border border-black text-[10px] font-bold cursor-pointer transition-all ${activeGalleryTag === tag ? 'bg-black text-white' : 'bg-white hover:bg-zinc-100'}`,
                        onClick: () => setActiveGalleryTag(tag)
                    }, tag))
                ),
                h('div', { className: 'flex-1' },
                    groupedTags.length === 0 ? h('div', { className: 'py-40 text-center text-zinc-400 text-[11px] font-bold uppercase tracking-widest' }, '空空如也') :
                        groupedTags.filter(g => activeGalleryTag === '全部' || g.name === activeGalleryTag).map(group => h('div', { key: group.id, className: 'mb-8 last:mb-0' },
                            h('div', { className: 'flex items-center justify-between mb-4 group/title' },
                                h('div', { className: 'flex items-center gap-3' },
                                    h('div', { className: 'w-1 h-3 bg-black' }),
                                    h('span', { className: 'text-[12px] font-black uppercase tracking-widest' }, group.name)
                                )
                            ),
                            h('div', { className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 items-start' },
                                group.docs.map(doc => h(window.MagnesComponents.Rag.Components.GalleryCard, {
                                    key: doc.id,
                                    doc: doc,
                                    selected: selectedDocIds.includes(doc.id),
                                    onSelect: (checked) => onSelectDoc(doc.id, checked),
                                    onClick: () => {
                                        if (setSelectedDetailDoc) setSelectedDetailDoc(doc);
                                        if (setDetailModalOpen) setDetailModalOpen(true);
                                    },
                                    onDelete: deleteKb,
                                    onRating: updateGalleryRating,
                                    onUpdateTags: (tags) => updateGalleryTags(doc.id, tags)
                                }))
                            )
                        ))
                )
            );
        };

        const renderPromptsContent = () => {
            // 1. 提取所有唯一标签
            const allPromptTags = ['全部', ...new Set((promptDocs || []).flatMap(p => p.user_tags || []))];

            // 2. 准备分组数据
            let groups = [];
            if (activePromptTag === '全部') {
                const tagsOnly = allPromptTags.filter(t => t !== '全部');
                tagsOnly.forEach(tag => {
                    const docsInTag = (promptDocs || []).filter(p => (p.user_tags || []).includes(tag));
                    if (docsInTag.length > 0) {
                        groups.push({ name: tag, docs: docsInTag });
                    }
                });
                const untagged = (promptDocs || []).filter(p => !p.user_tags || p.user_tags.length === 0);
                if (untagged.length > 0) {
                    groups.push({ name: '未分类', docs: untagged });
                }
            } else {
                const filtered = (promptDocs || []).filter(p => (p.user_tags || []).includes(activePromptTag));
                groups.push({ name: activePromptTag, docs: filtered });
            }

            return h('div', { className: 'flex flex-col h-full' },
                // A. 标签过滤栏 (缩小尺寸与字体，对齐分类视图)
                h('div', { className: 'flex flex-wrap gap-2 mb-6' },
                    allPromptTags.map(tag => h('button', {
                        key: tag,
                        className: `px-3 py-1.5 border border-black text-[10px] font-bold uppercase transition-all ${activePromptTag === tag ? 'bg-black text-white' : 'bg-white hover:bg-zinc-100'}`,
                        onClick: () => setActivePromptTag(tag)
                    }, tag))
                ),

                // B. 分组内容渲染
                h('div', { className: 'flex-1' },
                    groups.length === 0 ? h('div', { className: 'py-40 text-center text-zinc-400 text-[11px] font-bold uppercase tracking-widest' }, '暂无符合条件的提示词') :
                        groups.map((group, idx) => h('div', { key: group.name, className: 'mb-8 last:mb-0 anim-fade-in' }, [
                            // 标题栏：完全对齐分类视图 (text-12px, h-3 bar)
                            h('div', { className: 'flex items-center gap-3 mb-4' }, [
                                h('div', { className: 'w-1 h-3 bg-black' }),
                                h('span', { className: 'text-[12px] font-black uppercase tracking-widest' }, group.name)
                            ]),
                            // 提示词列表 (5列)
                            h('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 items-start' },
                                group.docs.map(p => h(window.MagnesComponents.Rag.Components.PromptCard, {
                                    key: p.id,
                                    doc: p,
                                    selected: (selectedDocIds || []).includes(p.id),
                                    onSelect: (checked) => onSelectDoc(p.id, checked),
                                    onDelete: deletePrompt,
                                    onUpdateTags: (tags) => updatePromptTags(p.id, tags),
                                    onClick: () => {
                                        navigator.clipboard.writeText(p.prompt);
                                        if (window.MagnesComponents.UI.Toast) window.MagnesComponents.UI.Toast('✓ 已复制提示词');
                                    }
                                }))
                            )
                        ]))
                )
            );
        };

        if (minimal) {
            return h('div', { className: 'flex flex-col h-full overflow-hidden' },
                h('div', { className: 'px-4 pt-8 shrink-0 flex items-center justify-between' },
                    h('div', { className: 'flex border border-black w-fit bg-white' },
                        activeTab === 'gallery' ? [
                            h('div', {
                                key: 'timeline',
                                className: `h-10 px-8 flex items-center gap-2 cursor-pointer border-r border-black text-[11px] font-bold uppercase transition-all ${galleryView === 'timeline' ? 'bg-black text-white' : 'hover:bg-zinc-50'}`,
                                onClick: () => setGalleryView('timeline')
                            }, '时间轴'),
                            h('div', {
                                key: 'tags',
                                className: `h-10 px-8 flex items-center gap-2 cursor-pointer border-r border-black text-[11px] font-bold uppercase transition-all ${galleryView === 'tags' ? 'bg-black text-white' : 'hover:bg-zinc-50'}`,
                                onClick: () => setGalleryView('tags')
                            }, '分类视图'),
                            h('div', {
                                key: 'prompts',
                                className: `h-10 px-8 flex items-center gap-2 cursor-pointer text-[11px] font-bold uppercase transition-all ${galleryView === 'prompts' ? 'bg-black text-white' : 'hover:bg-zinc-50'}`,
                                onClick: () => setGalleryView('prompts')
                            }, '提示词库')
                        ] : activeTab === 'xhs' ? [
                            h('div', {
                                key: 'timeline',
                                className: `h-10 px-8 flex items-center gap-2 cursor-pointer border-r border-black text-[11px] font-bold uppercase transition-all ${xhsView === 'timeline' ? 'bg-black text-white' : 'hover:bg-zinc-50'}`,
                                onClick: () => setXhsView('timeline')
                            }, '时间轴'),
                            ...categories.map((cat, idx) => {
                                const count = docs.filter(d => getDocCategory(d) === cat).length;
                                const active = category === cat && xhsView === 'category';
                                return h('div', {
                                    key: cat,
                                    className: `h-10 px-6 flex items-center gap-4 cursor-pointer border-r border-black last:border-r-0 ${active ? 'bg-black text-white' : 'hover:bg-zinc-50'}`,
                                    onClick: () => {
                                        setXhsView('category');
                                        if (setCategory) setCategory(cat);
                                    }
                                },
                                    h('span', { className: 'text-[11px] font-bold' }, cat),
                                    h('span', { className: `text-[11px] font-mono ${active ? 'opacity-50' : 'text-black'}` }, count)
                                );
                            })
                        ] : categories.map(cat => {
                            const count = docs.filter(d => getDocCategory(d) === cat).length;
                            const active = category === cat;
                            return h('div', { key: cat, className: `h-10 px-6 flex items-center gap-4 cursor-pointer border-r border-black last:border-r-0 ${active ? 'bg-black text-white' : 'hover:bg-zinc-50'}`, onClick: () => setCategory && setCategory(cat) },
                                h('span', { className: 'text-[11px] font-bold' }, cat),
                                h('span', { className: `text-[11px] font-mono ${active ? 'opacity-50' : 'text-black'}` }, count)
                            );
                        })
                    ),
                    h('button', {
                        className: 'px-4 py-2 border border-black bg-white hover:bg-black hover:text-white text-[11px] font-bold uppercase transition-all',
                        onClick: () => deleteAll && deleteAll()
                    }, '全部清空')
                ),
                h('div', { className: 'flex-1 overflow-y-auto p-4 bg-zinc-50' },
                    activeTab === 'gallery' ? renderGalleryContent() :
                        (activeTab === 'xhs' && xhsView === 'timeline') ? renderGroupedContent(xhsGroupedTimeline, true) :
                            renderGridContent(docs.filter(d => getDocCategory(d) === category), activeTab === 'xhs')
                )
            );
        }
        return h('div', { className: 'flex flex-col h-full overflow-hidden p-6 bg-zinc-50' }, h('div', { className: 'text-center text-zinc-400' }, '请在侧边栏进行管理'));
    }

    // --- RagasDashboard ---
    function RagasDashboard({ toast }) {
        const [evaluating, setEvaluating] = useState(false);
        const [report, setReport] = useState(null);
        const [history, setHistory] = useState([]);

        const METRIC_LABELS = {
            'faithfulness': '忠实度',
            'answer_relevancy': '相关性',
            'context_precision': '精确度',
            'context_recall': '召回率'
        };

        const loadHistory = useCallback(async () => {
            try {
                const data = await api.get('/ragas/eval/history');
                setHistory(data.history || []);
            } catch (e) {
                console.error('Load History Failed:', e);
            }
        }, []);

        useEffect(() => {
            loadHistory();
        }, [loadHistory]);

        const startEval = async () => {
            setEvaluating(true);
            try {
                const res = await api.post('/ragas/eval/run');
                setReport(res.report);
                toast?.('✓ 评估完成');
                loadHistory();
            } catch (e) {
                toast?.(`评估失败: ${e.message}`, 'error');
            } finally {
                setEvaluating(false);
            }
        };

        return h('div', { className: 'flex flex-col h-full overflow-hidden' },
            h('div', { className: 'p-10 border-b border-black bg-white shrink-0' },
                h('div', { className: 'flex items-center justify-between mb-8' },
                    h('div', { className: 'flex flex-col gap-2' },
                        h('h2', { className: 'text-[24px] font-black uppercase tracking-tighter' }, 'RAGAS 对话质量评估'),
                        h('p', { className: 'text-[12px] opacity-40 font-bold max-w-md uppercase tracking-widest' }, '基于 Ragas 框架对检索精度与生成忠实度进行全自动评估')
                    ),
                    h('button', {
                        className: `px-10 py-4 border-2 border-black font-black uppercase text-[12px] tracking-widest transition-all ${evaluating ? 'opacity-50 cursor-wait' : 'hover:bg-black hover:text-white active:scale-95'}`,
                        onClick: startEval,
                        disabled: evaluating
                    }, evaluating ? '评估中...' : '开始基准测试')
                ),

                report && h('div', { className: 'grid grid-cols-4 gap-4' },
                    Object.entries(report.scores).map(([metric, score]) => h('div', { key: metric, className: 'p-4 border border-black bg-zinc-50' },
                        h('div', { className: 'text-[10px] uppercase font-black opacity-30 tracking-widest mb-1' }, METRIC_LABELS[metric] || metric),
                        h('div', { className: 'text-[24px] font-black font-mono' }, (score * 100).toFixed(1), '%')
                    ))
                )
            ),

            h('div', { className: 'flex-1 overflow-y-auto p-10 bg-zinc-50' },
                h('div', { className: 'space-y-6' },
                    h('h3', { className: 'text-[12px] font-black uppercase tracking-widest flex items-center gap-2' },
                        h('div', { className: 'w-1 h-3 bg-black' }),
                        '历史评估报告'
                    ),
                    history.length === 0 ? h('div', { className: 'py-20 text-center text-zinc-300 font-bold uppercase text-[10px]' }, '暂无历史记录') :
                        history.map((hitem, i) => h('div', { key: i, className: 'p-6 border border-black bg-white hover:shadow-xl transition-all' },
                            h('div', { className: 'flex items-center justify-between mb-4' },
                                h('div', { className: 'text-[10px] font-mono opacity-40' }, hitem.timestamp),
                                h('div', { className: 'px-2 py-1 bg-zinc-100 text-[9px] font-black tracking-widest uppercase' }, `Datasets: ${hitem.dataset_size}`)
                            ),
                            h('div', { className: 'grid grid-cols-4 gap-6' },
                                Object.entries(hitem.scores).map(([metric, score]) => h('div', { key: metric },
                                    h('div', { className: 'text-[9px] uppercase font-black opacity-20 tracking-tighter mb-1' }, METRIC_LABELS[metric] || metric),
                                    h('div', { className: 'text-[14px] font-black' }, (score * 100).toFixed(1), '%')
                                ))
                            )
                        ))
                )
            )
        );
    }

    window.MagnesComponents.Rag.Panels = {
        KnowledgePanel,
        RagasDashboard
    };
})();
