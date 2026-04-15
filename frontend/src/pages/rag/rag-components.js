/**
 * rag-components.js - RAG 基础 UI 组件
 */
(function () {
    'use strict';

    const { React } = window;
    const { useEffect, useState } = React;
    const h = React.createElement;
    const { getImageUrl } = window.MagnesComponents.Rag.Utils;
    const Icons = window.MagnesComponents?.UI?.Icons || window.Lucide || {};

    // --- Toast ---
    function Toast({ message, type, persistent, onDone }) {
        useEffect(() => {
            if (!message || persistent) return;
            const t = setTimeout(onDone, 5000);
            return () => clearTimeout(t);
        }, [message, persistent]);

        if (!message) return null;
        const bg = type === 'error' ? 'bg-red-500 text-white' : 'bg-black text-white';
        return h('div', {
            className: `fixed top-3 right-3 z-[200] px-6 py-1.5 text-[11px] font-bold uppercase tracking-wider ${bg} shadow-lg`,
            style: { fontFamily: 'inherit' }
        },
            persistent
                ? h('span', { className: 'inline-flex items-center gap-2' },
                    h('span', { className: 'inline-block w-2 h-2 bg-white rounded-full animate-bounce', style: { animationDelay: '0ms' } }),
                    h('span', { className: 'inline-block w-2 h-2 bg-white rounded-full animate-bounce', style: { animationDelay: '150ms' } }),
                    h('span', { className: 'inline-block w-2 h-2 bg-white rounded-full animate-bounce', style: { animationDelay: '300ms' } }),
                    h('span', { className: 'ml-1' }, message)
                )
                : message
        );
    }

    // --- XhsCard ---
    function XhsCard({ doc, onDelete, onClick, selected, onSelect }) {
        return h('div', {
            className: `border-[1px] ${selected ? 'border-[2px] border-black z-10 bg-zinc-50' : 'border-black -ml-px -mt-px'} bg-white hover:bg-zinc-50 transition-all relative group cursor-pointer flex flex-col h-full`,
            onClick: () => onClick && onClick(doc)
        },
            // A. 删除按钮
            h('button', {
                className: 'absolute top-2 right-2 w-6 h-6 border border-black bg-white/80 backdrop-blur-sm text-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-20 hover:bg-black hover:text-white',
                onClick: e => { e.stopPropagation(); onDelete(doc.id); }
            }, '✕'),

            // B. 置顶图片 (根据图片原本比例全宽显示)
            doc.image_url
                ? h('img', {
                    className: 'w-full h-auto block border-b border-black bg-white',
                    src: getImageUrl(doc.image_url),
                    loading: 'lazy',
                    onError: e => e.target.style.display = 'none'
                })
                : h('div', { className: 'w-full aspect-[3/4] flex items-center justify-center bg-white border-b border-black text-[12px] text-black font-bold uppercase tracking-wider' }, '空图片'),

            // C. 文章信息 (紧缩布局)
            h('div', { className: 'p-3 flex-1 flex flex-col pb-4' },
                h('div', { className: 'text-[12px] font-bold line-clamp-2 leading-relaxed mb-2 pr-4' }, doc.title || doc.id),
                h('div', { className: 'flex flex-wrap gap-1.5 mb-2' },
                    (doc.style_tags || []).filter(t => !t.toLowerCase().startsWith('xsec_token:')).slice(0, 3).map((t, i) =>
                        h('span', { key: i, className: 'text-[10px] font-bold uppercase px-1.5 border border-black' }, t)
                    )
                )
            ),

            // D. 勾选框
            onSelect && h('input', {
                type: 'checkbox',
                className: 'absolute bottom-3 right-3 z-[60] w-4 h-4 cursor-pointer accent-black checkbox-btn',
                checked: selected || false,
                onClick: (e) => e.stopPropagation(),
                onChange: (e) => onSelect(e.target.checked)
            })
        );
    }

    // --- TagSelector ---
    function TagSelector({ tags = [], onUpdate, onClose, style = {} }) {
        const [inputValue, setInputValue] = useState('');
        const commonTags = ['素材', '商品', '参考图', '提示词库', '背景图', '模特图'];

        const addTag = (tag) => {
            if (!tag || tags.includes(tag)) return;
            onUpdate([...tags, tag]);
            setInputValue('');
        };

        const removeTag = (tag) => {
            onUpdate(tags.filter(t => t !== tag));
        };

        return h('div', {
            className: 'absolute bg-white border border-black shadow-2xl z-[100] p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 w-64 tag-selector',
            style: { bottom: '40px', left: '0', ...style },
            onClick: e => e.stopPropagation()
        },
            h('div', { className: 'flex items-center justify-between mb-3 pb-2 border-b border-black' },
                h('span', { className: 'text-[11px] font-bold uppercase text-black' }, '资产标签管理'),
                h('button', { className: 'text-[14px] font-bold hover:rotate-90 transition-transform bg-transparent border-none cursor-pointer', onClick: onClose }, '✕')
            ),
            h('div', { className: 'flex flex-wrap gap-1.5 mb-4' },
                tags.length === 0 ? h('span', { className: 'text-[10px] italic text-zinc-400' }, '暂无标签') :
                    tags.map(t => h('div', { key: t, className: 'flex items-center gap-1.5 bg-black text-white px-2 py-0.5 text-[10px] font-bold' },
                        h('span', null, t),
                        h('span', { className: 'cursor-pointer opacity-50 hover:opacity-100', onClick: (e) => { e.stopPropagation(); removeTag(t); } }, '✕')
                    ))
            ),
            h('div', { className: 'flex gap-2 mb-4' },
                h('input', {
                    className: 'flex-1 border border-black px-2 py-1 text-[11px] focus:bg-zinc-50 outline-none',
                    placeholder: '输入新标签...',
                    value: inputValue,
                    onClick: e => e.stopPropagation(),
                    onChange: e => setInputValue(e.target.value),
                    onKeyDown: e => {
                        if (e.key === 'Enter') { e.stopPropagation(); addTag(inputValue); }
                    }
                }),
                h('button', { className: 'px-3 py-1 bg-black text-white text-[10px] font-bold uppercase border-none cursor-pointer', onClick: (e) => { e.stopPropagation(); addTag(inputValue); } }, '添加')
            ),
            h('div', null,
                h('div', { className: 'text-[9px] font-bold text-zinc-400 uppercase mb-2 tracking-widest' }, '常用分类'),
                h('div', { className: 'flex flex-wrap gap-1.5' },
                    commonTags.filter(t => !tags.includes(t)).map(t => h('div', {
                        key: t,
                        className: 'px-2 py-0.5 border border-black text-[10px] font-bold cursor-pointer text-black transition-colors',
                        onClick: (e) => { e.stopPropagation(); addTag(t); }
                    }, t))
                )
            )
        );
    }

    // --- GalleryCard ---
    function GalleryCard({ doc, onClick, onRating, onDelete, selected, onSelect, onUpdateTags }) {
        const hasPrompt = !!doc.prompt;
        const skillName = doc.skill_name || 'AI 生成结果';
        const [showTagEditor, setShowTagEditor] = useState(false);

        return h('div', {
            className: `group relative flex flex-col bg-white border ${selected ? 'border-[2px] border-black z-10 bg-zinc-50' : 'border-black -ml-px -mt-px'} p-0 select-none transition-all hover:bg-zinc-50 cursor-pointer h-full`,
            onClick: (e) => {
                if (e.target.closest('.checkbox-btn') || e.target.closest('.tag-btn') || e.target.closest('.tag-selector')) return;
                onClick && onClick();
            }
        },
            // A. 置顶图片 (完全比例全宽显示)
            h('div', { className: 'w-full bg-zinc-100 border-b border-black overflow-hidden flex items-center justify-center relative shrink-0' },
                h('img', {
                    src: getImageUrl(doc.image_url),
                    className: 'w-full h-auto block transition-transform group-hover:scale-105',
                    loading: 'lazy',
                    onError: e => e.target.style.display = 'none'
                }),
                // 评分按钮
                h('button', {
                    className: `absolute top-2 left-2 w-6 h-6 border border-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 ${doc.rating === 'good' ? 'bg-black text-white' : 'bg-white/80 backdrop-blur-sm text-black hover:bg-black hover:text-white'} z-20`,
                    onClick: (e) => { e.stopPropagation(); onRating && onRating(doc.id, doc.rating === 'good' ? 'unrated' : 'good'); }
                }, h(Icons.Star || 'span', { size: 12, fill: doc.rating === 'good' ? 'white' : 'none' })),
                // [NEW] 右上角删除按钮
                onDelete && h('button', {
                    className: 'absolute top-2 right-2 w-6 h-6 border border-black bg-white/80 backdrop-blur-sm text-black flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-20 hover:bg-black hover:text-white',
                    onClick: (e) => { e.stopPropagation(); onDelete(doc.id); }
                }, '✕')
            ),

            // B. 信息区域
            h('div', { className: 'p-3 flex-1 flex flex-col pb-14 min-h-[80px]' },
                h('div', { className: 'flex justify-between items-start mb-2' },
                    h('div', { className: 'text-[12px] font-bold leading-tight flex-1 mr-2 truncate' }, skillName),
                    hasPrompt && h('div', { className: 'flex items-center gap-1.5 shrink-0 mt-0.5' },
                        h('div', { className: 'w-1.5 h-1.5 bg-zinc-500 rounded-full' }),
                        h('span', { className: 'text-[9px] font-bold tracking-widest text-zinc-500' }, 'PROMPT')
                    )
                ),

                // 标签展示
                h('div', { className: 'flex flex-wrap items-center gap-1.5 mb-3' },
                    (doc.user_tags || []).map(tag => h('span', {
                        key: tag,
                        className: 'px-2 py-0.5 bg-zinc-50 border border-black text-[10px] font-bold text-black'
                    }, `#${tag.trim()}`))
                )
            ),

            // C. 底部功能对齐: 打标(左) / 勾选(右)
            h('div', { className: 'absolute bottom-3 left-3 flex items-center gap-1' },
                h('div', {
                    className: 'tag-btn px-2.5 py-1 border border-black bg-white text-black text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-all flex items-center gap-1.5 relative',
                    onClick: (e) => { e.stopPropagation(); setShowTagEditor(!showTagEditor); }
                }, [
                    h(Icons.Tag || 'span', { size: 11 }),
                    h('span', null, '打标'),
                    // 浮窗编辑器
                    showTagEditor && h(TagSelector, {
                        tags: doc.user_tags || [],
                        onUpdate: (tags) => { onUpdateTags && onUpdateTags(tags); },
                        onClose: () => setShowTagEditor(false),
                        style: { left: '0', bottom: '30px' }
                    })
                ])
            ),

            onSelect && h('input', {
                type: 'checkbox',
                className: 'checkbox-btn absolute bottom-3 right-3 z-[60] w-4 h-4 cursor-pointer accent-black',
                checked: selected || false,
                onClick: (e) => e.stopPropagation(),
                onChange: (e) => onSelect(e.target.checked)
            })
        );
    }

    // --- KnowledgeCard ---
    function KnowledgeCard({ doc, onDelete, onClick, selected, onSelect }) {
        return h('div', {
            className: `border-[1px] ${selected ? 'border-[2px] border-black z-10 bg-zinc-50' : 'border-black -ml-px -mt-px'} bg-white hover:bg-zinc-50 transition-all relative group cursor-pointer p-4 flex flex-col justify-center min-h-[100px]`,
            onClick: onClick
        },
            h('div', { className: 'text-[10px] text-zinc-400 mb-1.5' }, (doc.file_type || '').toUpperCase()),
            h('div', { className: 'text-[13px] font-bold truncate mb-2' }, doc.filename || doc.doc_id),
            h('div', { className: 'flex flex-wrap gap-1.5 mb-2' },
                (doc.doc_tags ? doc.doc_tags.split(',').slice(0, 2) : []).map((tag, i) => h('span', {
                    key: i,
                    className: 'px-2 py-0.5 bg-zinc-50 border border-black text-[10px] font-bold text-black'
                }, `#${tag.trim()}`))
            ),
            h('div', { className: 'text-[11px] text-black pr-10' }, `共计 ${doc.total_chunks} 个分块`),

            // 勾选框位置一致 [60]
            onSelect && h('input', {
                type: 'checkbox',
                className: 'absolute bottom-3 right-3 z-[60] w-4 h-4 cursor-pointer accent-black checkbox-btn',
                checked: selected || false,
                onClick: (e) => e.stopPropagation(),
                onChange: (e) => onSelect(e.target.checked)
            }),

            h('button', {
                className: 'absolute top-1 right-1 w-8 h-8 text-black text-[18px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 border-none bg-transparent cursor-pointer',
                onClick: e => { e.stopPropagation(); onDelete && onDelete(doc.doc_id); }
            }, '✕')
        );
    }

    // --- PromptCard ---
    function PromptCard({ doc, onClick, selected, onSelect, onDelete, onUpdateTags }) {
        const [showTagEditor, setShowTagEditor] = useState(false);

        return h('div', {
            className: `border-[1px] ${selected ? 'border-[2px] border-black z-10 bg-zinc-50' : 'border-black -ml-px -mt-px'} bg-white hover:bg-zinc-50 transition-all relative group cursor-pointer p-4 flex flex-col min-h-[120px]`,
            onClick: (e) => {
                if (e.target.closest('.checkbox-btn') || e.target.closest('.tag-btn') || e.target.closest('.tag-selector') || e.target.closest('.action-btn')) return;
                onClick && onClick();
            }
        },
            h('div', { className: 'flex justify-start items-center mb-3 h-6' },
                h('div', { className: 'flex gap-1.5' },
                    h('button', {
                        className: 'action-btn w-6 h-6 border border-black bg-white flex items-center justify-center hover:bg-black hover:text-white transition-all',
                        title: '复制提示词',
                        onClick: (e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(doc.prompt);
                            if (window.MagnesComponents.UI.Toast) window.MagnesComponents.UI.Toast('✓ 已复制到剪贴板');
                        }
                    }, h(Icons.Copy || 'span', { size: 11 })),
                    h('button', {
                        className: 'action-btn w-6 h-6 border border-black bg-white flex items-center justify-center hover:bg-black hover:text-white transition-all',
                        title: '发送到画布',
                        onClick: (e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('magnes:sync_image_to_canvas', {
                                detail: { prompt: doc.prompt, skillName: doc.model_used, settings: doc.settings || {} }
                            }));
                        }
                    }, h(Icons.Send || Icons.Zap || 'span', { size: 11 }))
                )
            ),
            h('div', { className: 'text-[12px] font-bold leading-relaxed mb-4' }, doc.prompt || '未命名提示词'),

            h('div', { className: 'flex flex-wrap gap-1.5 mb-14' },
                h('span', { className: 'px-2 py-0.5 bg-zinc-100 border border-black text-[10px] font-bold text-black uppercase' }, `#${doc.model_used || 'AI'}`),
                (doc.user_tags || []).map(tag => h('span', {
                    key: tag,
                    className: 'px-2 py-0.5 bg-zinc-50 border border-black text-[10px] font-bold text-black'
                }, `#${tag.trim()}`)),
                (doc.user_tags || []).length === 0 && (doc.visual_features ? doc.visual_features.split(',').slice(0, 1) : []).map((tag, i) => h('span', {
                    key: i,
                    className: 'px-2 py-0.5 border border-zinc-200 text-[10px] font-bold text-zinc-400 uppercase italic'
                }, `#${tag.trim()}`))
            ),

            h('div', { className: 'absolute bottom-3 left-3 flex items-center gap-1' },
                h('div', {
                    className: 'tag-btn px-2.5 py-1 border border-black bg-white text-black text-[10px] font-bold uppercase hover:bg-black hover:text-white transition-all flex items-center gap-1.5 relative',
                    onClick: (e) => { e.stopPropagation(); setShowTagEditor(!showTagEditor); }
                }, [
                    h(Icons.Tag || 'span', { size: 11 }),
                    h('span', null, '打标'),
                    showTagEditor && h(TagSelector, {
                        tags: doc.user_tags || [],
                        onUpdate: (tags) => onUpdateTags && onUpdateTags(tags),
                        onClose: () => setShowTagEditor(false),
                        style: { left: '0', bottom: '30px' }
                    })
                ])
            ),

            // 勾选框
            onSelect && h('input', {
                type: 'checkbox',
                className: 'checkbox-btn absolute bottom-3 right-3 z-[60] w-4 h-4 cursor-pointer accent-black',
                checked: selected || false,
                onClick: (e) => e.stopPropagation(),
                onChange: (e) => onSelect(e.target.checked)
            }),

            // 删除按钮
            onDelete && h('button', {
                className: 'absolute top-1 right-1 w-8 h-8 text-black text-[18px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 border-none bg-transparent cursor-pointer',
                onClick: e => { e.stopPropagation(); onDelete(doc.id); }
            }, '✕')
        );
    }

    // --- ChunkGroup ---
    function ChunkGroup({ parent, children, index }) {
        const [expanded, setExpanded] = useState(false);

        const renderChunkContent = (c) => {
            const imgUrl = getImageUrl(c.image_path);
            const isImageParent = c.chunk_type === 'image_parent';
            const isImageChild = c.chunk_type === 'image_child';

            return h('div', { className: 'flex flex-col gap-3' },
                imgUrl && (isImageParent || !isImageChild) && h('div', { className: isImageParent ? 'mb-0' : 'mb-2' },
                    h('img', {
                        src: imgUrl,
                        className: 'max-w-full h-auto border border-black shadow-sm bg-white',
                        style: { maxHeight: '400px' },
                        loading: 'lazy'
                    })
                ),
                !isImageParent && h('div', {
                    className: 'leading-relaxed text-zinc-800 markdown-content',
                    dangerouslySetInnerHTML: { __html: c.content_preview || c.content }
                })
            );
        };

        const isImageGroup = parent.chunk_type === 'image_parent';

        return h('div', { className: 'mb-4 transition-all duration-300' },
            h('div', {
                className: `p-5 border border-black cursor-pointer shadow-sm transition-all group ${expanded ? 'bg-zinc-50 border-b-0' : 'bg-white hover:bg-zinc-50'}`,
                onClick: () => setExpanded(!expanded)
            },
                h('div', { className: 'flex items-center gap-2 mb-2' },
                    h('span', { className: 'px-1.5 py-0.5 bg-black text-white text-[9px] font-bold uppercase' }, (parent.chunk_type === 'image_desc' || isImageGroup) ? 'IMAGE' : 'PARENT'),
                    h('span', { className: 'text-[12px] font-bold uppercase tracking-tight' }, parent.heading_path || `Section ${parent.seq || index + 1}`),
                    h('span', { className: 'ml-auto text-[10px] opacity-40 font-mono' }, `P${parent.page_num || 1}`),
                    h('span', { className: `ml-2 text-[10px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}` }, '▼')
                ),
                renderChunkContent(parent),
                !expanded && children.length > 0 && h('div', { className: 'mt-3 text-[10px] text-zinc-400 font-bold italic flex items-center gap-2' },
                    h('span', { className: 'w-4 h-[1px] bg-zinc-200' }),
                    isImageGroup ? `包含 ${children.length} 个视觉描述 (点击展开)` : `包含 ${children.length} 个原子命题 (点击展开)`
                )
            ),
            expanded && h('div', { className: `px-6 ${isImageGroup ? 'pt-1 pb-4' : 'py-4'} space-y-3 border-x border-b border-black bg-white/50 ml-0 animate-in fade-in slide-in-from-top-2 duration-300` },
                children.length === 0
                    ? (!parent.image_path && h('div', { className: 'px-4 py-2 text-[10px] text-zinc-400 italic' }, 'No sub-chunks'))
                    : children.map((c, ci) => h('div', { key: c.chunk_id, className: 'p-4 bg-white border border-black shadow-sm text-[12px] hover:border-zinc-400 transition-all' },
                        h('div', { className: 'flex items-center justify-between mb-2 opacity-50' },
                            h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'w-1.5 h-1.5 bg-black rounded-full' }),
                                h('span', { className: 'text-[9px] font-bold uppercase tracking-widest' }, isImageGroup ? `VISION_DESC ${ci + 1}` : `SUB_CHUNK ${ci + 1}`)
                            ),
                            h('span', { className: 'text-[8px] font-mono' }, c.chunk_id?.slice(-6).toUpperCase())
                        ),
                        renderChunkContent(c)
                    ))
            )
        );
    }

    // --- RagFlowNavigator ---
    function RagFlowNavigator({ activeItem, onSelect }) {
        const items = [
            { id: 'docs', label: '文档列表', icon: 'FileText' },
            { id: 'chunks', label: '文档分块', icon: 'Layers' },
            { id: 'augment', label: '检索增强', icon: 'Zap' },
            { id: 'recall', label: '召回分块', icon: 'Search' },
            { id: 'ragas', label: 'RAGAS', icon: 'Award' }
        ];

        return h('div', { className: 'w-[180px] border-r border-black bg-zinc-50 flex flex-col shrink-0 overflow-y-auto' },
            h('div', { className: 'px-4 py-8 bg-white' },
                h('div', { className: 'text-[14px] font-bold text-black uppercase tracking-tighter' }, "检索增强流程")
            ),
            h('div', { className: 'flex-1 p-3 flex flex-col gap-0' },
                items.map((item, index) => h(React.Fragment, { key: item.id },
                    h('div', {
                        className: `group relative flex flex-col items-center justify-center gap-2 px-2 h-[80px] border border-black -mb-[1px] cursor-pointer transition-all ${activeItem === item.id ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'}`,
                        onClick: () => onSelect(item.id)
                    },
                        h('div', { className: 'flex-1 flex flex-col items-center justify-center' },
                            h(Icons[item.icon] || 'div', { size: 18, className: activeItem === item.id ? 'text-white' : 'text-black', strokeWidth: 2 }),
                            h('div', { className: 'flex flex-col items-center mt-2' },
                                h('span', { className: 'text-[11px] font-bold uppercase tracking-widest text-center' }, item.label),
                                h('span', { className: `text-[8px] font-bold uppercase ${activeItem === item.id ? 'text-white' : 'text-zinc-500 opacity-50'}` }, `STAGE 0${index + 1}`)
                            )
                        )
                    ),
                    index < items.length - 1 && h('div', { className: 'h-6 flex items-center justify-center -mb-[1px] relative z-10' },
                        h('div', { className: 'w-px h-full bg-black opacity-10' }),
                        h('div', { className: 'absolute bg-zinc-50 px-2 text-[10px] opacity-40' }, '↓')
                    )
                ))
            )
        );
    }

    // 导出
    window.MagnesComponents.Rag.Components = {
        Toast, XhsCard, GalleryCard, KnowledgeCard, PromptCard, ChunkGroup, RagFlowNavigator
    };
})();
