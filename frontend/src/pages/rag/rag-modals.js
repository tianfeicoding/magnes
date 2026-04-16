/**
 * rag-modals.js - RAG 交互弹窗 (完全修复版)
 */
(function () {
    'use strict';

    const { React } = window;
    const { useState, useEffect, useRef } = React;
    const h = React.createElement;
    const { getImageUrl, api } = window.MagnesComponents.Rag.Utils;
    const { useBatchDocuments } = window.MagnesComponents.Rag.Hooks;

    /**
     * cleanContent - 通用文案清理函数
     * 用于移除 RAG 原始输出中的引用、系统注释及特定标题，并剔除 Markdown 符号
     */
    function cleanContent(text) {
        if (!text) return '';
        return text
            .replace(/<!--\s*sources:[\s\S]*?-->/g, '') // 移除系统注释
            // 最广泛的引用标记清除（经过验证的正则）
            .replace(/\[\[[^\]]*?\]\[[^\]]*?\]\]/g, '') // [[A][B]] 双括号引用
            .replace(/\[\[[^\]]*?\]\]/g, '')            // [[A]] 单括号引用
            .replace(/【\d+】/g, '')                    // 【1】格式
            // 移除末尾引用列表块
            .replace(/(\n|^)\[?\s*引用列表\s*\]?[\s\S]*/i, '')
            .replace(/(\n|^)笔记\s*1\s*[::\uff1a][\s\S]*$/i, '')
            .replace(/(\n|^)\s*(\*\*|#)?\s*活动名称\s*(\*\*|:|\uff1a)?\s*/gi, '$1') // 移除标记名称
            .replace(/\*\*/g, '')      // 移除 Markdown 粗体符号
            .replace(/^[-*]\s+/gm, '• ')   // 将 Markdown 列表符统一为圆点符号
            .trim();
    }

    /**
     * MagnesUIModal - 内部通用弹窗外壳
     */
    function MagnesUIModal({ isOpen, onClose, title, children, footer, maxWidth = 'max-w-4xl', height = 'h-[80vh]', zIndex = 'z-[110]' }) {
        if (!isOpen) return null;
        return h('div', { className: `fixed inset-0 ${zIndex} flex items-center justify-center bg-black/60 backdrop-blur-sm p-6`, onClick: onClose },
            h('div', {
                className: `bg-white border border-black w-full ${maxWidth} ${height} flex flex-col shadow-2xl relative`,
                onClick: e => e.stopPropagation()
            },
                h('div', { className: 'px-4 py-3 border-b border-black flex justify-between items-center bg-zinc-100 shrink-0' },
                    h('span', { className: 'text-[12px] font-bold uppercase tracking-widest flex items-center gap-2' },
                        h('span', { className: 'w-2.5 h-2.5 bg-black shrink-0' }),
                        title
                    ),
                    h('button', { className: 'text-zinc-400 hover:text-black transition-colors p-1', onClick: onClose },
                        h(window.MagnesComponents?.UI?.LucideIcons?.X || 'span', { size: 18 }) || '✕'
                    )
                ),
                h('div', { className: 'flex-1 overflow-hidden relative' }, children),
                footer && h('div', { className: 'px-6 py-4 border-t border-black bg-zinc-50 flex justify-end gap-4 shrink-0' }, footer)
            )
        );
    }

    // --- XhsPublishModal ---
    function XhsPublishModal({ isOpen, onClose, data, onConfirm, loading }) {
        const [title, setTitle] = useState(data?.title || '');
        const [content, setContent] = useState(data?.content || '');
        useEffect(() => { if (data) { setTitle(data.title || ''); setContent(data.content || ''); } }, [data]);

        const footer = [
            h('button', { className: 'px-6 py-2 border border-black text-[12px] font-bold uppercase tracking-widest hover:bg-zinc-100 transition-colors', onClick: onClose }, '取消'),
            h('button', {
                className: 'px-10 py-2 bg-black text-white text-[12px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:bg-zinc-200',
                disabled: loading || !title.trim() || !content.trim(),
                onClick: () => onConfirm({ title, content })
            }, loading ? '正在发布...' : '确认发布到小红书')
        ];

        return h(MagnesUIModal, {
            isOpen, onClose, title: '发布确认 - 小红书', maxWidth: 'max-w-xl', height: 'h-auto', zIndex: 'z-[120]', footer
        },
            h('div', { className: 'overflow-y-auto p-6 space-y-6 max-h-[70vh]' },
                data?.imageUrl && h('div', { className: 'flex justify-center' },
                    h('img', { src: data.imageUrl, className: 'w-48 aspect-[3/4] object-cover border border-black shadow-sm' })
                ),
                h('div', { className: 'space-y-2' },
                    h('label', { className: 'text-[10px] font-bold uppercase text-zinc-400' }, '笔记标题'),
                    h('input', { className: 'w-full h-10 px-3 border border-black text-[12px] outline-none bg-white', value: title, onChange: e => setTitle(e.target.value), placeholder: '输入笔记标题...' })
                ),
                h('div', { className: 'space-y-2' },
                    h('label', { className: 'text-[10px] font-bold uppercase text-zinc-400' }, '笔记正文'),
                    h('textarea', { className: 'w-full h-48 p-4 border border-black text-[12px] leading-relaxed outline-none bg-white resize-none font-sans', value: content, onChange: e => setContent(e.target.value), placeholder: '输入笔记正文...' })
                )
            )
        );
    }

    // --- DraftModal (统一详情与草稿弹窗) ---
    function DraftModal({ isOpen, onClose, initialContent, isReadOnly, onSyncToCanvas, onConfirm, isEditMode, initialMsg }) {
        if (!isOpen) return null;
        const [content, setContent] = useState('');
        const [useEmoji, setUseEmoji] = useState(false);
        const [selectedText, setSelectedText] = useState('');
        const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
        const [aiInstructions, setAiInstructions] = useState('');
        const [isAiLoading, setIsAiLoading] = useState(false);
        const textAreaRef = useRef(null);
        const tooltipRef = useRef(null);

        // Emoji 映射表提取为可复用常量（支持中英双语及多种同义词）
        const EMOJI_MAP = {
            '时间': '⏰', '日期': '⏰', 'time': '⏰', 'date': '⏰',
            '地点': '📍', '场所': '📍', '场地': '📍', 'venue': '📍', 'location': '📍', 'address': '📍',
            '门票': '🎫', '价格': '🎫', '票价': '🎫', 'price': '🎫', 'ticket': '🎫', 'fee': '🎫',
            '亮点': '✨', '介绍': '✨', '卖点': '✨', 'highlights': '✨', 'description': '✨', 'content': '✨', 'intro': '✨'
        };
        const EMOJI_SET = Array.from(new Set(Object.values(EMOJI_MAP)));

        // 工具函数：语义化 Emoji 增强（支持前缀替换 + 模式探齐）
        const applyEmojiToText = (text, checked) => {
            if (!text) return text;

            const ROLE_MAP = {
                date: { emoji: '⏰', keywords: ['时间', '日期', '月份', 'date', 'time'] },
                venue: { emoji: '📍', keywords: ['地点', '场所', '场地', '地址', 'location', 'venue', 'address'] },
                price: { emoji: '🎫', keywords: ['门票', '价格', '票价', '费用', 'price', 'ticket', 'fee'] },
                desc: { emoji: '✨', keywords: ['亮点', '特色', '介绍', '简介', '内容', 'highlights', 'description'] }
            };

            const allKeywords = Object.values(ROLE_MAP).flatMap(r => r.keywords);
            const prefixRegex = new RegExp(`^(${allKeywords.join('|')})[:：\\s]*`, 'i');

            const lines = text.split('\n');
            let isFirstLineOfBlock = true;

            const updatedLines = lines.map((line, idx) => {
                const trimmed = line.trim();
                // 空行重置“首行”逻辑，用于多块内容的判断
                if (!trimmed) {
                    isFirstLineOfBlock = true;
                    return line;
                }

                const startsWithEmoji = EMOJI_SET.some(em => trimmed.startsWith(em));

                if (checked) {
                    // 1. 标题保护：如果是块的首行，且看起来像标题（不含明显的结构前缀），则不加 emoji
                    if (isFirstLineOfBlock) {
                        isFirstLineOfBlock = false;
                        // 如果首行就带了“时间：”之类的前缀，说明不是标题，继续往下走识别逻辑
                        if (!prefixRegex.test(trimmed)) return line;
                    }

                    if (startsWithEmoji) return line;

                    // 2. 精准前缀替换逻辑
                    for (const [role, config] of Object.entries(ROLE_MAP)) {
                        const specificPrefix = new RegExp(`^(${config.keywords.join('|')})[:：\\s]+`, 'i');
                        if (specificPrefix.test(trimmed)) {
                            return trimmed.replace(specificPrefix, `${config.emoji} `);
                        }
                    }

                    // 3. 语义模式探明（针对不带前缀的纯数据）

                    // 标题核心词屏蔽：如果这行看起来像活动主题，绝不处理
                    if (/(?:艺术节|展|季|集|大会|周年|博览会|嘉年华|Festival|Season|Expo)/i.test(trimmed)) return line;

                    // 价格/单位（优先级高）：包含数字且含价格相关单位/词汇
                    if (/(?:早鸟|现场|门票|票|元|单日|双日|套票|RMB|CNY|free|免费)/i.test(trimmed)) {
                        return `🎫 ${trimmed}`;
                    }

                    // 日期/时间：包含日期连接符，且不是纯价格
                    if (/\d{1,2}[.\-\/~～]\d{1,2}/.test(trimmed) || /\d+:\d{2}/.test(trimmed) || /[月日]/.test(trimmed)) {
                        if (!/[路号馆场公园中心广场]/.test(trimmed) && !/元/.test(trimmed)) return `⏰ ${trimmed}`;
                    }

                    // 地址
                    if (/[路街道号馆厅场苑园区中心广场博物馆展览]/.test(trimmed) || /[省市区县镇]/.test(trimmed)) {
                        // 排除超长描述（可能有地址词但本质是描述）
                        if (trimmed.length < 40) return `📍 ${trimmed}`;
                    }

                    // 亮点（收紧）：仅对带明确列表符号的行生效
                    if (trimmed.startsWith('+') || trimmed.startsWith('•') || trimmed.startsWith('-')) {
                        return `✨ ${trimmed}`;
                    }

                    return line;
                } else {
                    // 反向剥除：移除行首的 Emoji
                    if (!startsWithEmoji) return line;
                    let result = trimmed;
                    for (const emoji of EMOJI_SET) {
                        if (result.startsWith(emoji)) {
                            result = result.replace(new RegExp(`^${emoji}\\s*`), '');
                            break;
                        }
                    }
                    return result;
                }
            });

            return updatedLines.join('\n');
        };

        useEffect(() => {
            // [PATCH] 优先从 parameters.raw_draft_content 加载原始全量内容
            // 这样即便聊天泡泡里显示的是简洁的提示语，草稿箱里依然是完整的活动内容
            const rawContent = initialMsg?.parameters?.raw_draft_content || initialContent;
            const baseContent = cleanContent(rawContent);
            const shouldUseEmoji = !!initialMsg?.useEmoji;
            // 若上次已开启 Emoji，重新打开时立刻应用到预览内容
            setContent(shouldUseEmoji ? applyEmojiToText(baseContent, true) : baseContent);
            setSelectedText('');
            setSelectionRange({ start: 0, end: 0 });
            setAiInstructions('');
            setUseEmoji(shouldUseEmoji);
        }, [initialContent, initialMsg, isOpen]);

        useEffect(() => {
            if (!selectedText) return;
            const handleClickOutside = (e) => {
                if (textAreaRef.current?.contains(e.target)) return;
                if (tooltipRef.current?.contains(e.target)) return;
                setSelectedText('');
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, [selectedText]);

        const handleSelect = (e) => {
            const el = e.target;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            if (start !== end) {
                setSelectedText(el.value.substring(start, end));
                setSelectionRange({ start, end });
            }
        };

        const handleAIAction = async (actionType) => {
            if (!selectedText) return;
            setIsAiLoading(true);
            try {
                const actionMap = { '润色': 'polish', '缩写': 'shorten', '扩写': 'expand' };
                const res = await api.post('/rewrite', {
                    text: selectedText,
                    action: actionMap[actionType] || 'polish',
                    instructions: aiInstructions
                });
                if (res.status === 'success' && res.result) {
                    setContent(prev => prev.substring(0, selectionRange.start) + res.result + prev.substring(selectionRange.end));
                    setSelectedText('');
                    setAiInstructions('');
                }
            } catch (e) {
                console.error('[AI Action] error:', e);
            } finally {
                setIsAiLoading(false);
            }
        };

        const footer = isReadOnly ? (
            h('div', { className: 'w-full flex justify-between gap-4' },
                h('button', {
                    className: 'px-6 py-2 border border-black text-[12px] font-bold uppercase hover:bg-black hover:text-white transition-all bg-white mr-auto',
                    onClick: () => window.dispatchEvent(new CustomEvent('magnes:open_draft_modal', { detail: { content: initialContent, msg: initialMsg } }))
                }, '编辑草稿'),
                h('button', {
                    className: 'px-10 py-2 bg-black text-white text-[12px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all',
                    onClick: () => {
                        const finalContent = useEmoji ? applyEmojiToText(content, true) : content;
                        isEditMode ? onConfirm(finalContent) : onSyncToCanvas(finalContent, { useEmoji });
                    }
                }, isEditMode ? '确认修改' : '发布至画布')
            )
        ) : (
            h(React.Fragment, null,
                // h('button', {
                //     className: 'px-6 py-2 border border-black text-[12px] font-bold uppercase hover:bg-zinc-100 transition-colors bg-white',
                //     onClick: () => window.dispatchEvent(new CustomEvent('magnes:view_detail', { detail: initialMsg }))
                // }, '返回详情'),
                h('div', { className: 'flex items-center gap-2 mr-auto' },
                    h('input', {
                        type: 'checkbox',
                        id: 'use-emoji-toggle',
                        className: 'w-4 h-4 accent-black cursor-pointer',
                        checked: useEmoji,
                        onChange: e => {
                            const checked = e.target.checked;
                            setUseEmoji(checked);
                            // [PATCH] 实时转换文本中的 Emoji
                            const newContent = applyEmojiToText(content, checked);
                            console.log('[DraftModal] Emoji toggle:', checked, 'old:', content.substring(0, 60), 'new:', newContent.substring(0, 60));
                            setContent(newContent);
                        }
                    }),
                    h('label', {
                        htmlFor: 'use-emoji-toggle',
                        className: 'text-[12px] font-bold cursor-pointer select-none'
                    }, 'Emoji 模式(实时预览)')
                ),
                h('div', { className: 'flex gap-4' },
                    h('button', {
                        className: 'px-6 py-2 border border-black text-[12px] font-bold uppercase hover:bg-zinc-100 transition-colors',
                        onClick: () => {
                            //  为草稿提供“确认保存到对话”的能力
                            const finalContent = useEmoji ? applyEmojiToText(content, true) : content;
                            window.dispatchEvent(new CustomEvent('magnes:draft_modified', {
                                detail: { content: finalContent, useEmoji }
                            }));
                            onClose();
                        }
                    }, '确认保存'),
                    h('button', {
                        className: 'px-10 py-2 bg-black text-white text-[12px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all',
                        onClick: () => {
                            const finalContent = useEmoji ? applyEmojiToText(content, true) : content;
                            // 确保同步到画布的内容中，第一行（标题）绝不带 Emoji，保持与精细编排一致
                            const cleanLines = finalContent.split('\n');
                            if (cleanLines.length > 0 && /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]/u.test(cleanLines[0])) {
                                cleanLines[0] = cleanLines[0].replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]\s*/u, '');
                            }
                            const safeContent = cleanLines.join('\n');
                            isEditMode ? onConfirm(safeContent, { useEmoji }) : onSyncToCanvas(safeContent, { useEmoji });
                        }
                    }, isEditMode ? '确认修改' : '同步画布')
                )
            )
        );

        return h(MagnesUIModal, {
            isOpen, onClose, title: isReadOnly ? '内容详情 (只读预览)' : '内容详情 (草稿箱)', footer
        },
            h('div', { className: 'flex-1 p-4 relative bg-white overflow-hidden h-full' },
                isReadOnly ? h('div', { className: 'h-full overflow-y-auto custom-scrollbar' },
                    (function () {
                        const cleaned = cleanContent(content);
                        const lines = cleaned.split('\n');
                        return lines.map((line, li) => {
                            const trimmed = line.trim();
                            if (/^笔记\d+:\s*(?:《.*?》\s*)?\[(?:xhs_|kb_|gallery_)/.test(trimmed)) return null;
                            if (trimmed === '[引用列表]' || trimmed === '笔记来源:' || trimmed === '来源:') return null;
                            if (/^\s*(?:\*\*|#)?\s*活动名称\s*(?:\*\*|:|\uff1a)?\s*$/.test(trimmed)) return null;

                            // 物理空行 = 活动之间的分隔，赋予固定高度
                            if (!trimmed) return h('div', { key: li, className: 'h-4' });

                            const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
                            if (headerMatch) {
                                const level = headerMatch[1].length;
                                return h(`h${Math.min(level + 1, 6)}`, {
                                    key: li,
                                    className: `font-bold mt-4 mb-1 ${level === 3 ? 'text-[16px] border-l-4 border-black pl-3' : 'text-[14px]'}`
                                }, headerMatch[2]);
                            }

                            const isListItem = /^[•]\s*/.test(trimmed);
                            const cleanLineText = isListItem ? line.replace(/^[•]\s*/, '') : line;
                            const parts = cleanLineText.split(/(\*\*.*?\*\*)/g);

                            return h('div', {
                                key: li,
                                className: `mb-0 ${isListItem ? 'pl-5 relative text-[13px] leading-snug py-[1px] mt-2' : 'text-[13px] leading-snug font-medium text-zinc-800 py-[1px]'}`
                            },
                                isListItem && h('span', { className: 'absolute left-0 text-zinc-400 font-bold' }, '•'),
                                parts.map((part, i) => {
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                        return h('strong', { key: i, className: 'font-bold text-black' }, part.slice(2, -2));
                                    }
                                    return part;
                                })
                            );
                        });
                    })()
                ) : h(React.Fragment, null,
                    h('textarea', {
                        ref: textAreaRef,
                        className: 'w-full h-full p-4 border border-zinc-200 outline-none resize-none text-[12px] leading-relaxed bg-zinc-50/20 focus:bg-white focus:border-black transition-all font-medium font-sans',
                        value: content,
                        onChange: e => { setContent(e.target.value); setSelectedText(''); },
                        onSelect: handleSelect,
                        onMouseUp: handleSelect,
                        placeholder: '在这里自由编辑您的草稿文案...'
                    }),
                    selectedText && h('div', {
                        ref: tooltipRef,
                        className: 'absolute bottom-8 left-1/2 -translate-x-1/2 z-[120] flex flex-col bg-white text-black rounded shadow-2xl overflow-hidden border border-black min-w-[380px]'
                    },
                        h('div', { className: 'px-4 py-1.5 bg-zinc-100 border-b border-zinc-200 flex items-center gap-2' },
                            h('span', { className: 'text-[10px] text-zinc-400 font-black uppercase tracking-widest shrink-0' }, '选中'),
                            h('span', { className: 'text-[11px] text-zinc-600 font-medium truncate max-w-[280px] italic' }, `「${selectedText.length > 30 ? selectedText.slice(0, 30) + '...' : selectedText}」`)
                        ),
                        h('div', { className: 'px-4 py-3 border-b border-black flex items-center gap-3 bg-zinc-50' },
                            h('span', { className: 'text-[11px] text-zinc-400 font-black uppercase shrink-0' }, 'AI 指道'),
                            h('input', {
                                className: 'flex-1 bg-transparent border-none outline-none text-[12px] text-black placeholder:text-zinc-300 font-medium',
                                placeholder: '引导 AI 如何修改：更有趣、口语化...',
                                value: aiInstructions,
                                onChange: e => setAiInstructions(e.target.value),
                                onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); handleAIAction('润色'); } }
                            }),
                            h('button', { className: 'text-[12px] font-bold text-black hover:opacity-60 uppercase tracking-wider ml-2 shrink-0', onClick: () => handleAIAction('润色') }, '确认')
                        ),
                        h('div', { className: 'flex p-1 gap-1 items-center bg-white' },
                            h('span', { className: 'px-3 py-2 text-[10px] text-zinc-400 uppercase tracking-widest border-r border-zinc-100 flex items-center font-black shrink-0' }, isAiLoading ? 'AI...' : '划词 AI'),
                            !isAiLoading && h(React.Fragment, null,
                                ['润色', '缩写', '扩写'].map(btn => h('button', {
                                    key: btn,
                                    className: 'px-4 py-2 text-[12px] font-bold hover:bg-zinc-50 transition-colors rounded hover:text-black',
                                    onClick: () => handleAIAction(btn)
                                }, btn === '润色' ? '✨ ' + btn : btn))
                            )
                        )
                    )
                )
            )
        );
    }

    // --- SourceModal ---
    function SourceModal({ isOpen, onClose, docIds, sourceMap, content, toast }) {
        const { documents, loading } = useBatchDocuments(docIds);
        const { useMemo } = React;

        // 从原始内容解析 "笔记N: 《标题》 [xhs_id]" 格式，建立 noteNum → docId 映射
        const noteNumToDocId = useMemo(() => {
            const map = {};
            if (!content) return map;
            // 匹配末尾引用列表块的每一行: 笔记N: 《标题》 [xhs_xxx]
            const listRegex = /(?:^|\n)笔记(\d+)\s*[:：]\s*(?:《.*?》\s*)?\[((?:xhs_|kb_|gallery_)[a-zA-Z0-9_\-]+)\]/g;
            let m;
            while ((m = listRegex.exec(content)) !== null) {
                map[m[1]] = m[2]; // noteNum -> docId
            }
            return map;
        }, [content]);

        const sourceDetails = useMemo(() => {
            if (!content) return [];
            const results = [];
            const bodyContent = content
                .replace(/(\n|^)\[?\s*引用列表\s*\]?[\s\S]*/i, '')
                .replace(/(\n|^)笔记1\s*[:：][\s\S]*$/i, '');

            const lines = bodyContent.split('\n');
            let currentActivity = null;
            let currentResults = []; // [{ section, noteMap: { noteNum: Set(details) } }]

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;

                // 识别活动标题：不再排除数字 (解决 "搞事市集vol.7" 问题)
                // 逻辑：首行、加粗或较短行，且不含冒号（冒号通常引导详情）
                const isTitleCandidate = /^\s*(\*\*|#|•|-)?\s*.{2,30}?\s*(\*\*)?\s*$/.test(trimmed) &&
                    !trimmed.includes(':') && !trimmed.includes('：') &&
                    !trimmed.includes('[[') && !trimmed.includes('【');

                if (isTitleCandidate) {
                    currentActivity = trimmed
                        .replace(/^[#•\-\s*]+/, '')
                        .replace(/\*\*/g, '')
                        .replace(/^\s*活动名称\s*/, '')
                        .trim();

                    // [Compensate] 预先创建 section 确保即便是没带标签的活动也能显示
                    if (!currentResults.find(r => r.section === currentActivity)) {
                        currentResults.push({ section: currentActivity, noteMap: {} });
                    }
                    return;
                }

                // 提取引用
                const citeRegex = /\[\[([^\]]*?)(?:\]\[([^\]]*?))?\]\]/g;
                let match;
                let foundCitation = false;

                while ((match = citeRegex.exec(line)) !== null) {
                    foundCitation = true;
                    const rawNote = match[1];
                    const numMatch = rawNote.match(/\d+/);
                    if (!numMatch) continue;
                    const noteNum = numMatch[0];
                    const rawDetail = match[2] || '';

                    // 拆分复合详情：如 "图片1, 第5行" -> ["图片1", "第5行"]
                    const details = rawDetail.split(/[,，\s]+/).filter(d => d.trim());
                    if (details.length === 0) details.push('正文');

                    // 寻找或创建对应的 section
                    const sectionName = currentActivity || '参考信息';
                    let section = currentResults.find(r => r.section === sectionName);
                    if (!section) {
                        section = { section: sectionName, noteMap: {} };
                        currentResults.push(section);
                    }

                    if (!section.noteMap[noteNum]) section.noteMap[noteNum] = new Set();
                    details.forEach(d => section.noteMap[noteNum].add(d));
                }
            });

            // [Inheritance] 兜底处理：如果只有 1 个素材，且某些 activity 没有 noteMap，则自动归属给笔记 1
            if (docIds.length === 1) {
                currentResults.forEach(r => {
                    if (Object.keys(r.noteMap).length === 0) {
                        r.noteMap['1'] = new Set(['正文']);
                    }
                });
            }

            // 转化为组件所需的结构
            return currentResults.filter(r => r.section).map(r => ({
                section: r.section,
                citations: Object.entries(r.noteMap).map(([num, detailSet]) => ({
                    noteNum: num,
                    details: Array.from(detailSet)
                }))
            }));
        }, [content]);

        return h(MagnesUIModal, {
            isOpen, onClose, title: '灵感引用来源', maxWidth: 'max-w-3xl', height: 'h-[80vh]', zIndex: 'z-[120]'
        },
            h('div', { className: 'h-full flex flex-col bg-[#fafafa]' },
                loading ? h('div', { className: 'flex-1 flex flex-col items-center justify-center space-y-4' },
                    h('div', { className: 'w-10 h-10 border-4 border-black border-t-zinc-200 animate-spin' }),
                    h('span', { className: 'text-[10px] font-bold uppercase text-zinc-400' }, '正在溯源中...')
                ) : (documents.length === 0 ?
                    h('div', { className: 'flex-1 flex flex-col items-center justify-center text-zinc-300 gap-2' },
                        h('div', { className: 'text-[12px] font-bold uppercase text-zinc-200' }, '无引用来源数据'),
                        h('div', { className: 'text-[10px]' }, '当前反馈结果可能并非基于特定笔记生成的总结')
                    ) :
                    h('div', { className: 'flex-1 overflow-y-auto custom-scrollbar flex flex-col' },
                        // 第一部分：引用笔记库
                        h('div', { className: 'p-6 space-y-4 border-b border-zinc-100 bg-white' },
                            h('div', { className: 'text-[11px] font-black uppercase text-zinc-400 tracking-widest mb-4' }, '引用的参考笔记'),
                            h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
                                documents.map((doc, idx) => {
                                    let displayIdx = idx + 1;
                                    if (sourceMap) {
                                        for (const [num, info] of Object.entries(sourceMap)) {
                                            if (info.id === doc.id) { displayIdx = num; break; }
                                        }
                                    }
                                    return h('div', {
                                        key: doc.id,
                                        className: 'group flex border border-zinc-200 bg-white p-3 hover:border-black transition-all cursor-pointer items-center gap-4',
                                        onClick: () => window.dispatchEvent(new CustomEvent('magnes:open_note_detail', { detail: { docId: doc.id } }))
                                    },
                                        h('div', { className: 'w-8 h-8 flex items-center justify-center bg-black text-white text-[12px] font-black shrink-0' }, displayIdx),
                                        (doc.image_url || doc.cover_url) && h('img', {
                                            src: getImageUrl(doc.image_url || doc.cover_url),
                                            className: 'w-12 aspect-[3/4] object-cover border border-zinc-100 bg-zinc-50'
                                        }),
                                        h('div', { className: 'flex-1 min-w-0 flex flex-col' },
                                            h('div', { className: 'text-[12px] font-black line-clamp-1 leading-tight group-hover:text-blue-600' }, doc.title || doc.id),
                                            // h('div', { className: 'text-[9px] font-bold text-zinc-400 uppercase tracking-tighter' }, (doc.source_type || 'xhs_note').replace('_', ' '))
                                        )
                                    );
                                })
                            )
                        ),
                        // 第二部分：溯源详情
                        sourceDetails.length > 0 && h('div', { className: 'p-6' },
                            h('div', { className: 'text-[11px] font-black uppercase text-zinc-400 tracking-widest mb-6' }, '内容溯源详情'),
                            h('div', { className: 'space-y-6' },
                                sourceDetails.map((item, i) => h('div', { key: i, className: 'relative pl-5 border-l-2 border-black' },
                                    h('div', { className: 'absolute -left-[5px] top-1 w-2.5 h-2.5 bg-black' }),
                                    // 活动名称 + 来源笔记编号标识
                                    h('div', { className: 'flex items-center flex-wrap gap-2 mb-3' },
                                        h('div', { className: 'text-[13px] font-black text-black' }, item.section),
                                        // item.citations.map((cite, ci) => h('span', {
                                        //     key: ci,
                                        //     className: 'text-[10px] font-bold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-sm shrink-0'
                                        // }, `${cite.noteNum}`))
                                    ),
                                    // 引用明细
                                    h('div', { className: 'space-y-2' },
                                        item.citations.map((cite, ci) => {
                                            const targetId = noteNumToDocId[cite.noteNum] || (sourceMap && sourceMap[cite.noteNum]?.id);
                                            // 增加防御性检查：确保 documents 存在且为数组，防止 null[index] 错误
                                            const doc = (targetId && documents)
                                                ? documents.find(d => d.id === targetId)
                                                : (documents && documents[parseInt(cite.noteNum, 10) - 1]);

                                            // 将每个 detail 转换为标签
                                            const tags = cite.details.map(d => {
                                                const imgMatch = d.match(/图[片]?(\d+)/);
                                                if (imgMatch) return `笔记图片${imgMatch[1]}`;
                                                // 将“第N行”统一显示为“笔记正文”
                                                const lineMatch = d.match(/第?(\d+)行/);
                                                if (lineMatch) return '笔记正文';
                                                if (d.includes('OCR')) return '笔记图片';
                                                if (d === '正文') return '笔记正文';
                                                return d;
                                            });

                                            return h('div', {
                                                key: ci,
                                                className: 'bg-white border border-zinc-100 px-3 py-2.5'
                                            },
                                                h('div', { className: 'text-[11px] font-bold text-black leading-tight mb-2' },
                                                    doc?.title || `笔记${cite.noteNum}`
                                                ),
                                                h('div', { className: 'flex flex-wrap gap-1.5' },
                                                    tags.map((tag, ti) => h('span', {
                                                        key: ti,
                                                        className: 'border border-black bg-white text-black text-[10px] font-bold px-2 py-0.5'
                                                    }, tag))
                                                )
                                            );
                                        })
                                    )
                                ))
                            )
                        )
                    )
                )
            )
        );
    }

    // --- NoteDetailModal ---
    function NoteDetailModal({ doc, onClose, toast }) {
        const [detail, setDetail] = useState(null);
        const [loading, setLoading] = useState(false);
        const [favorites, setFavorites] = useState([]); // 存储已收藏图片的 ID 列表

        // --- AI 优化相关状态 ---
        const [content, setContent] = useState('');
        const [selectedText, setSelectedText] = useState('');
        const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
        const [aiInstructions, setAiInstructions] = useState('');
        const [isAiLoading, setIsAiLoading] = useState(false);
        const textAreaRef = useRef(null);
        const tooltipRef = useRef(null);

        // 加载收藏列表以更新 UI 状态
        const loadFavorites = async () => {
            try {
                const res = await api.getFavorites();
                if (res.status === 'success') {
                    setFavorites(res.images.map(img => img.id));
                }
            } catch (e) { console.error('Load favorites error:', e); }
        };

        useEffect(() => {
            const fetchDetail = async () => {
                const targetId = doc.doc_id || doc.id;
                if (!targetId) return;
                loadFavorites();

                // 初始化提示词内容
                if (doc.prompt) setContent(doc.prompt);

                // 如果 doc 已经包含正文，且是小红书类型，优先展示
                if (doc.content && doc.all_images && doc.all_images.length > 0) {
                    console.log('[NoteDetail] ⚡️ 使用传入的缓存数据');
                    setDetail({
                        note: {
                            title: doc.title,
                            desc: doc.content,
                            interactInfo: {
                                likedCount: doc.likes || 0,
                                collectedCount: doc.collected_count || 0,
                                commentCount: doc.comment_count || 0
                            },
                            user: { nickname: doc.author || '小红书用户' },
                            note_url: doc.url,
                            imageList: (doc.all_images || []).map(url => ({ urlDefault: url }))
                        }
                    });
                } else {
                    setLoading(true);
                    try {
                        // 如果是 gallery_ 开头的 ID，通常是本地生成的，不需要请求小红书详情接口
                        if (targetId.startsWith('gallery_')) {
                            setLoading(false);
                            return;
                        }
                        const noteId = targetId.replace('xhs_', '');
                        const res = await api.get(`/xhs/detail/${noteId}`);
                        if (res.status === 'success' && res.detail) {
                            setDetail(res.detail);
                        }
                    } catch (e) {
                        console.error('NoteDetail error:', e);
                        toast('详情加载失败', 'error');
                    } finally { setLoading(false); }
                }
            };
            fetchDetail();
        }, [doc]);

        // 划词优化逻辑复用
        const handleSelect = (e) => {
            const el = e.target;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            if (start !== end) {
                setSelectedText(el.value.substring(start, end));
                setSelectionRange({ start, end });
            }
        };

        const handleAIAction = async (actionType) => {
            if (!selectedText) return;
            setIsAiLoading(true);
            try {
                // 针对提示词场景的优化指令
                const res = await api.post('/rewrite', {
                    text: selectedText,
                    action: 'optimize_prompt', // 专门的提示词优化路由
                    instructions: aiInstructions,
                    context: content // 提供全量上下文
                });
                if (res.status === 'success' && res.result) {
                    setContent(prev => prev.substring(0, selectionRange.start) + res.result + prev.substring(selectionRange.end));
                    setSelectedText('');
                    setAiInstructions('');
                    toast('提示词已优化', 'success');
                }
            } catch (e) {
                toast('优化失败', 'error');
            } finally {
                setIsAiLoading(false);
            }
        };

        const toggleFavorite = async (e, imageUrl, note) => {
            e.stopPropagation();
            // 使用图片 URL 的哈希作为 ID，或者简单拼接
            const imgId = btoa(imageUrl).slice(-20);
            const isFav = favorites.includes(imgId);

            try {
                if (isFav) {
                    await api.removeFavorite(imgId);
                    setFavorites(prev => prev.filter(id => id !== imgId));
                    toast('已取消收藏', 'info');
                } else {
                    await api.addFavorite(imgId, {
                        image_url: imageUrl,
                        doc_id: doc.id,
                        title: note.title,
                        created_at: new Date().toISOString()
                    });
                    setFavorites(prev => [...prev, imgId]);
                    toast('图片已收藏', 'success');
                }
                // 触发全局刷新统计
                window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
            } catch (err) {
                toast('操作失败', 'error');
            }
        };

        const note = detail?.note_card || detail?.note || detail?.items?.[0] || detail || doc;
        const isImageGen = doc.skill_name?.includes('image-gen') || !!doc.prompt || (doc.id && doc.id.startsWith('gallery_'));

        if (!doc) return null;

        if (!note && loading) {
            return h(MagnesUIModal, {
                isOpen: !!doc, onClose, title: '加载中...', maxWidth: 'max-w-5xl', height: 'h-[85vh]', zIndex: 'z-[130]'
            }, h('div', { className: 'flex h-full items-center justify-center space-y-4 flex-col' },
                h('div', { className: 'w-10 h-10 border-4 border-black border-t-zinc-200 animate-spin' }),
                h('span', { className: 'text-[10px] font-bold uppercase text-zinc-400' }, '正在从灵感库同步详情...')
            ));
        }

        const images = note.image_list || note.imageList || note.images || [];
        const noteUrl = note.note_url || note.url || '';
        const interact = note.interactInfo || {};

        if (isImageGen) {
            return h(MagnesUIModal, {
                isOpen: !!doc, onClose, title: 'AI 生成详情', maxWidth: 'max-w-5xl', height: 'h-[85vh]', zIndex: 'z-[130]'
            },
                h('div', { className: 'flex h-full overflow-hidden' },
                    // 左侧：大图展示
                    h('div', { className: 'flex-1 bg-zinc-100 flex items-center justify-center p-6 border-r border-black shrink-0 relative' },
                        h('img', {
                            src: getImageUrl(doc.image_url),
                            className: 'max-w-full max-h-full object-contain bg-white border border-black shadow-lg',
                            loading: 'lazy'
                        }),
                        // 浮动收藏按钮
                        h('button', {
                            className: 'absolute top-4 right-4 w-6 h-6 bg-white border border-black flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-xl',
                            onClick: (e) => toggleFavorite(e, doc.image_url, doc)
                        }, h(window.MagnesComponents?.UI?.LucideIcons?.Heart || 'span', { size: 15, className: favorites.includes(btoa(doc.image_url).slice(-20)) ? 'fill-current' : '' }))
                    ),
                    // 右侧：提示词与描述 (带划词优化)
                    h('div', { className: 'w-[420px] flex flex-col bg-white overflow-hidden' },
                        h('div', { className: 'flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative' },
                            h('div', { className: 'space-y-6' },
                                h('div', { className: 'space-y-1 text-center border-b border-black pb-4' },
                                    // h('div', { className: 'text-[10px] uppercase font-black text-zinc-400 tracking-widest' }, 'Skill Source'),
                                    h('div', { className: 'text-[14px] font-black' }, doc.skill_name || 'AI 生成结果')
                                ),
                                doc.prompt && h('div', { className: 'space-y-2 relative' },
                                    h('div', { className: 'flex justify-between items-center' },
                                        h('div', { className: 'text-[10px] uppercase font-black text-zinc-400 tracking-widest' }, '提示词 (划词可优化)'),
                                        h('button', {
                                            className: 'text-[10px] font-bold underline hover:text-zinc-400',
                                            onClick: () => { navigator.clipboard.writeText(content); toast('已复制'); }
                                        }, '复制全文')
                                    ),
                                    h('textarea', {
                                        ref: textAreaRef,
                                        className: 'w-full h-48 p-4 bg-zinc-50 border border-black text-[13px] leading-relaxed font-medium outline-none resize-none focus:bg-white transition-colors',
                                        value: content,
                                        onChange: e => setContent(e.target.value),
                                        onSelect: handleSelect,
                                        onMouseUp: handleSelect
                                    }),
                                    // 划词优化浮层
                                    selectedText && h('div', {
                                        ref: tooltipRef,
                                        className: 'absolute top-10 left-0 right-0 z-[140] bg-white border border-black shadow-2xl overflow-hidden flex flex-col'
                                    },
                                        h('div', { className: 'px-3 py-2 bg-zinc-100 border-b border-black flex items-center gap-2' },
                                            h('input', {
                                                className: 'flex-1 bg-transparent border-none outline-none text-[12px] placeholder:text-zinc-400',
                                                placeholder: '优化方向：更具电影感、极简风格...',
                                                value: aiInstructions,
                                                onChange: e => setAiInstructions(e.target.value),
                                                onKeyDown: e => { if (e.key === 'Enter') handleAIAction('润色'); }
                                            }),
                                            h('button', {
                                                className: 'px-2 py-1 bg-black text-white text-[10px] font-bold uppercase',
                                                onClick: () => handleAIAction('润色')
                                            }, isAiLoading ? '...' : '确认')
                                        )
                                    )
                                ),
                                doc.visual_description && h('div', { className: 'space-y-2' },
                                    h('div', { className: 'text-[10px] uppercase font-black text-zinc-400 tracking-widest' }, '视觉描述'),
                                    h('div', { className: 'text-[12px] leading-relaxed text-zinc-600 font-medium p-4 bg-zinc-50 italic border-l-4 border-zinc-200' }, doc.visual_description)
                                )
                            )
                        ),
                        // 底部：操作按钮
                        h('div', { className: 'p-6 border-t border-black bg-zinc-50 flex flex-col gap-3' },
                            h('button', {
                                className: 'w-full py-4 bg-black text-white text-[12px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all flex items-center justify-center gap-2',
                                onClick: () => {
                                    window.dispatchEvent(new CustomEvent('magnes:sync_image_to_canvas', {
                                        detail: {
                                            imageUrl: doc.image_url,
                                            prompt: content,
                                            skillName: doc.skill_name
                                        }
                                    }));
                                    onClose();
                                    toast('已发送至画布', 'success');
                                }
                            }, [
                                h(window.MagnesComponents?.UI?.LucideIcons?.Layout || 'span', { size: 16 }),
                                '发送至画布'
                            ]),
                            h('div', { className: 'flex gap-3' },
                                h('button', {
                                    className: 'flex-1 py-3 border border-black text-[11px] font-bold uppercase hover:bg-zinc-100 transition-all',
                                    onClick: async () => {
                                        toast('正在保存提示词...', 'info');
                                        try {
                                            const res = await api.post('/prompts/save', {
                                                prompt: content,
                                                image_url: doc.image_url,
                                                skill_name: doc.skill_name
                                            });
                                            if (res.status === 'success') {
                                                toast('提示词已收藏到库', 'success');
                                                // 触发全局刷新统计与列表
                                                window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                                            }
                                        } catch (e) { toast('收藏失败', 'error'); }
                                    }
                                }, '收藏提示词'),
                                h('button', {
                                    className: 'flex-1 py-3 border border-black text-[11px] font-bold uppercase hover:bg-zinc-100 transition-all',
                                    onClick: () => {
                                        // 触发“以此再生”逻辑
                                        window.dispatchEvent(new CustomEvent('magnes:send_chat_command', {
                                            detail: {
                                                command: `帮我基于这个提示词重新生图：${content}`,
                                                imageUrl: doc.image_url,
                                                ratio: doc.generation_params?.ratio || 'auto'
                                            }
                                        }));
                                        // 额外触发侧边栏展开，确保用户能看到对话框进度
                                        window.dispatchEvent(new CustomEvent('magnes:expand_sidebar'));
                                        onClose();
                                    }
                                }, '以此再生')
                            )
                        )
                    )
                )
            );
        }

        return h(MagnesUIModal, {
            isOpen: !!doc, onClose, title: '笔记详情', maxWidth: 'max-w-6xl', height: 'h-[85vh]', zIndex: 'z-[130]'
        },
            h('div', { className: 'flex h-full overflow-hidden' },
                // 左侧：多图展示
                h('div', { className: 'w-[480px] border-r border-zinc-200 overflow-y-auto bg-zinc-50 custom-scrollbar shrink-0' },
                    images.map((img, i) => {
                        const rawUrl = typeof img === 'string' ? img : (img.url || img.url_default || img.urlDefault);
                        const displayUrl = getImageUrl(rawUrl);
                        const imgId = btoa(rawUrl).slice(-20);
                        const isFav = favorites.includes(imgId);

                        return h('div', { key: i, className: 'relative group border-b border-zinc-100 last:border-0 overflow-hidden' },
                            h('img', {
                                src: displayUrl,
                                className: 'w-full object-cover bg-white',
                                loading: 'lazy'
                            }),
                            // Hover 收藏图标
                            h('button', {
                                className: 'absolute top-4 right-4 w-6 h-6 bg-white border border-black flex items-center justify-center hover:bg-black hover:text-white transition-all shadow-xl',
                                onClick: (e) => toggleFavorite(e, rawUrl, note)
                            },
                                h(window.MagnesComponents?.UI?.LucideIcons?.Heart || 'span', {
                                    size: 15,
                                    className: isFav ? 'fill-current' : ''
                                })
                            )
                        );
                    })
                ),
                // 右侧：正文内容
                h('div', { className: 'flex-1 flex flex-col bg-white overflow-hidden' },
                    h('div', { className: 'flex-1 overflow-y-auto p-10 custom-scrollbar space-y-8' },
                        // 第一部分：元数据
                        h('div', { className: 'space-y-4' },
                            h('div', { className: 'space-y-1' },
                                h('div', { className: 'text-[12px] uppercase font-black text-zinc-400 tracking-widest' }, '标题'),
                                h('div', { className: 'text-[16px] font-black leading-tight border-black' }, note.title || '无标题')
                            ),
                            h('div', { className: 'grid grid-cols-2 gap-8' },
                                // h('div', { className: 'space-y-1' },
                                //     h('div', { className: 'text-[12px] uppercase font-black text-zinc-400 tracking-widest' }, '作者'),
                                //     h('div', { className: 'text-[12px] font-bold text-zinc-600' }, author)
                                // ),
                                noteUrl && h('div', { className: 'space-y-1' },
                                    h('div', { className: 'text-[12px] uppercase font-black text-zinc-400 tracking-widest' }, '笔记链接'),
                                    h('a', {
                                        href: noteUrl,
                                        target: '_blank',
                                        className: 'text-[12px] text-blue-600 hover:underline flex items-center gap-1 truncate'
                                    }, noteUrl)
                                )
                            )
                        ),
                        // 第二部分：正文
                        h('div', { className: 'space-y-2' },
                            h('div', { className: 'text-[12px] uppercase font-black text-zinc-400 tracking-widest' }, '笔记正文'),
                            h('pre', { className: 'whitespace-pre-wrap text-[14px] leading-relaxed font-medium text-zinc-800 font-sans' }, note.desc || note.content || '无正文内容')
                        )
                    ),
                    // 第三部分：底部互动数据
                    h('div', { className: 'h-20 shrink-0 border-t border-zinc-100 flex items-center px-10 gap-10 bg-zinc-50/50' },
                        [
                            { label: '赞', count: interact.likedCount || 0, icon: 'Heart' },
                            { label: '藏', count: interact.collectedCount || 0, icon: 'Star' },
                            { label: '评', count: interact.commentCount || 0, icon: 'MessageCircle' }
                        ].map(item => h('div', { key: item.label, className: 'flex items-center gap-2' },
                            h(window.MagnesComponents?.UI?.LucideIcons?.[item.icon] || 'span', { size: 16, className: 'text-zinc-400' }),
                            h('div', { className: 'flex flex-col' },
                                h('span', { className: 'text-[12px] font-bold text-black font-mono leading-none' }, item.count),
                                h('span', { className: 'text-[10px] uppercase font-black text-zinc-300 tracking-tighter' }, item.label)
                            )
                        ))
                    )
                )
            )
        );
    }

    // 导出到全局
    window.MagnesComponents.Rag.Modals = { XhsPublishModal, DraftModal, NoteDetailModal, SourceModal };
})();
