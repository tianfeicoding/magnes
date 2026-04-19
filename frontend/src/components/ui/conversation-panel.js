/**
 * ConversationPanel - Manus 风格对话面板
 * 对话驱动设计操作
 * 
 * 功能：
 * - 自然语言对话触发画布操作
 * - SSE 实时推送 Planner 思维链
 * - 上传图片同步镜像到画布节点
 * - 可收起（最右侧 320px 固定栏）
 */
(function () {
    const { React } = window;
    const { useState, useRef, useEffect, useCallback, useId, useMemo } = React;

    const getIcons = () => window.MagnesComponents?.UI?.LucideIcons || window.MagnesComponents?.UI?.Icons || {};

    // ─── 时间格式化 ───────────────────────────────────────────────────────────
    const formatTime = (date) => {
        if (!date) return "";
        let d = date;
        // 如果是数字且长度为 13 位，视为毫秒戳；如果是 10 位，视为秒戳
        if (typeof date === 'number') {
            d = new Date(date < 10000000000 ? date * 1000 : date);
        } else if (typeof date === 'string') {
            // 处理后端可能返回的带有 Z 或不带时区的 ISO 串
            d = new Date(date.includes('T') ? date : date.replace(' ', 'T'));
        }

        if (!(d instanceof Date) || isNaN(d.getTime())) {
            d = new Date();
        }
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    // ─── ACTION 标签颜色映射 ──────────────────────────────────────────────────
    const ACTION_LABELS = {
        run_painter: { label: '触发生图', bg: 'bg-black text-white' },
        run_refiner: { label: '视觉分析', bg: 'bg-black text-white' },
        adjust_style: { label: '调整样式', bg: 'bg-black text-white' },
        create_content_node: { label: '导入列表', bg: 'bg-black text-white' },
        mirror_image: { label: '同步画布', bg: 'bg-zinc-700 text-white' },
        run_xhs_search: { label: '小红书搜索', bg: 'bg-black text-white' },
        run_xhs_publish: { label: '发布确认', bg: 'bg-black text-white' },
        summary_draft: { label: '文案草稿箱', bg: 'bg-black text-white' },
        create_rednote_node: { label: '生成编辑节点', bg: 'bg-black text-white' },
        chat: { label: '对话', bg: 'bg-zinc-200 text-black' },
    };

    // ─── 单条气泡 ──────────────────────────────────────────────────────────────
    const MessageBubble = ({ msg, apiEndpoint, onSendMessage, setMessages, messages, msgIndex }) => {
        const isUser = msg.role === 'user';
        const [thoughtOpen, setThoughtOpen] = useState(false);
        const [isExpanded, setIsExpanded] = useState(false);
        const contentRef = useRef(null);
        const [showMore, setShowMore] = useState(false);

        // 检测内容是否过长需要截断
        useEffect(() => {
            if (contentRef.current && !isUser) {
                // 如果实际高度超过了限制高度（180px），则显示“查看更多”
                const hasOverflow = contentRef.current.scrollHeight > 180;
                setShowMore(hasOverflow);
            }
        }, [msg.content, isUser]);

        // ---  统一预解析消息内容与引用地图 ---
        const { displayContent, messageSourceMap } = useMemo(() => {
            let text = '';
            if (typeof msg.content === 'string') {
                text = msg.content;
            } else if (Array.isArray(msg.content)) {
                // 处理多模态消息列表：提取 text 部分
                const textPart = msg.content.find(p => p.type === 'text');
                text = (textPart && textPart.text) ? textPart.text : '';
            }
            let rawDisplay = text;

            // 1. 处理 JSON 思考块过滤
            const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/^\{[\s\S]*\}$/);
            if (jsonMatch) {
                try {
                    const rawJson = jsonMatch[1] || jsonMatch[0];
                    const parsed = JSON.parse(rawJson);
                    if (parsed.reply) {
                        rawDisplay = parsed.reply;
                    } else if (parsed.thought && !msg.thought) {
                        rawDisplay = parsed.thought;
                    }
                } catch (e) {
                    const replyMatch = text.match(/"reply":\s*"([^"]+)"/);
                    if (replyMatch) rawDisplay = replyMatch[1];
                }
            }

            // 2. 处理换行符与系统标签清理
            const safe = rawDisplay.replace(/\\n/g, '\n');
            const map = {};
            // 增强的源映射提取：支持 [xhs_...], [kb_...], [gallery_...] 
            const mapMatches = safe.matchAll(/(?:笔记)?(\d+)[:：]\s*(?:《(.*?)》\s*)?\[((?:xhs_|kb_|gallery_)[a-zA-Z0-9_\-]+)\]/g);
            for (const m of mapMatches) {
                map[m[1]] = { id: m[3], title: m[2] || `笔记${m[1]}` };
            }

            // 移除冗余的源定义标记及系统提示标题
            const cleaned = safe
                .replace(/<!--\s*sources:[\s\S]*?-->/g, '') // 移除系统注释
                .replace(/【\d+】/g, '')                    // 【1】格式
                .replace(/\[(?:[\d一二三四五六七八九十百]+)R?\]/g, '') // [3] 或 [四R] 等引用标记
                .replace(/\[\[[\s\S]*?\]\]/g, '')           // [[笔记1]] 或 [[笔记1][图片1]] 格式
                .replace(/(\n|^)\[?\s*引用列表\s*\]?[:：\s]*(\n|$)/gi, '\n') // 仅移除引用列表标题
                .replace(/(\n|^)笔记\s*1\s*[::\uff1a][\s\S]*$/i, (match) => {
                    // 如果消息中包含模版，说明是灵感助手的后续引导，不应全部切除
                    if (msg.templates && msg.templates.length > 0) return match;
                    return '';
                })
                .replace(/(\n|^)\s*(\*\*|#)?\s*活动名称\s*(\*\*|:|\uff1a)?\s*(\n|$)/gi, '$1')
                .replace(/\*\*/g, '')
                .replace(/^[-*]\s+/gm, '• ')
                .trim();
            return { displayContent: cleaned, messageSourceMap: map };
        }, [msg.content, msg.thought]);
        const Icons = getIcons();
        const ChevronDown = Icons.ChevronDown;
        const ChevronUp = Icons.ChevronUp;
        const X = Icons.X;
        const Maximize2 = Icons.Maximize2 || Icons.Expand;

        // 从 Context 获取 Lightbox 支持
        const MAGNES = window.MagnesComponents || {};
        const { useMagnesContext } = MAGNES.Context || { useMagnesContext: () => ({ setLightboxItem: () => { } }) };
        const { setLightboxItem } = useMagnesContext();

        const [isModalOpen, setIsModalOpen] = useState(false);

        // 详情弹窗组件
        const MessageDetailModal = () => {
            if (!isModalOpen) return null;
            return (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => setIsModalOpen(false)}>
                    <div
                        className="bg-white border border-black w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-black shrink-0">
                            <span className="text-[12px] font-bold uppercase tracking-widest">对话内容详情</span>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-black transition-colors">
                                {X ? <X size={18} /> : '×'}
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 text-[14px] leading-relaxed text-black bg-zinc-50" style={{ whiteSpace: 'pre-wrap' }}>
                            {(function () {
                                const lines = displayContent.split('\n');
                                return lines.map((line, li) => {
                                    const isListItem = /^\d+\.\s/.test(line.trim());
                                    const parts = line.split(/(\*\*.*?\*\*)/g);
                                    return (
                                        <div key={li} className={isListItem ? 'mt-4 mb-2 pl-4 border-l-4 border-black ml-1' : 'mb-2'}>
                                            {parts.map((part, i) => {
                                                if (part.startsWith('**') && part.endsWith('**')) {
                                                    return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
                                                }
                                                return part;
                                            })}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end bg-white shrink-0">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2 bg-black text-white text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            );
        };

        return (
            <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                {/* 时间戳 */}
                <span className="text-[10px] text-zinc-400 px-1">{formatTime(msg.timestamp)}</span>

                {/* 图片预览（用户上传或 AI 生成） */}
                {msg.imageUrl && (
                    <div
                        className={`overflow-hidden cursor-pointer group relative rounded-sm flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        style={{ width: '100%', maxWidth: 240 }}
                        onClick={() => setLightboxItem?.({ url: msg.imageUrl, type: 'image' })}
                    >
                        <div className="relative" style={{ width: 140, height: 105 }}>
                            <img
                                src={msg.imageUrl}
                                alt="preview"
                                className={`w-full h-full transition-transform group-hover:scale-105 ${isUser ? 'object-right' : 'object-left'} object-contain`}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 text-[8px] bg-black text-white px-1 py-0.5 uppercase tracking-tighter">View</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 文字气泡 */}
                {msg.content && (
                    <div className="flex flex-col gap-2 items-start">
                        <div
                            ref={contentRef}
                            className={`max-w-[240px] px-3 py-2 text-[12px] rounded-sm transition-all duration-300
                                        ${isUser ? 'bg-black text-white' : 'bg-white text-black border border-black'}`}
                            style={{ wordBreak: 'break-word' }}>
                            {(function () {
                                const lines = displayContent.split('\n');
                                return lines.map((line, li) => {
                                    const trimmed = line.trim();
                                    // 过滤掉底部的引用列表定义行
                                    if (/^(?:笔记)?\d+[:：]\s*(?:《.*?》\s*)?\[(?:xhs_|kb_|gallery_)/.test(trimmed)) return null;
                                    if (trimmed === '[引用列表]' || trimmed === '笔记来源:' || trimmed === '来源:') return null;

                                    // 物理空行 = 活动之间的分隔
                                    if (!trimmed) return <div key={li} className="h-4" />;

                                    // 处理 Markdown 标题
                                    const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
                                    if (headerMatch) {
                                        const level = headerMatch[1].length;
                                        return (
                                            <div key={li} className={`font-bold mt-2 mb-1 ${level === 3 ? 'text-[14px] border-l-2 border-black pl-2' : 'text-[12px]'}`}>
                                                {headerMatch[2]}
                                            </div>
                                        );
                                    }

                                    const isListItem = /^[•]\s*/.test(trimmed) || /^\d+\.\s/.test(trimmed);
                                    const cleanLineText = isListItem ? line.replace(/^[•]\s*/, '').replace(/^\d+\.\s/, '') : line;

                                    const parts = cleanLineText.split(/(\*\*.*?\*\*|\[\[(?:笔记\d+(?:,\s*笔记\d+)*)(?:\]\[.*?\])?\]\]|\[\[\d+\]\]|【\d+】|\[.*?Skill\])/g);

                                    return (
                                        <div key={li} className={`mb-0 ${isListItem ? 'pl-4 relative text-[12px] leading-snug mt-1' : 'text-[12px] leading-snug font-medium py-[1px]'}`}>
                                            {isListItem && <span className="absolute left-0 text-zinc-400 font-bold">{trimmed.startsWith('•') ? '•' : ((trimmed.match(/^\d+\./) || [])[0] || '')}</span>}
                                            {parts.map((part, i) => {
                                                if (part.startsWith('**') && part.endsWith('**')) {
                                                    return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
                                                }
                                                // 渲染 Skill 标签为按钮
                                                if (part.startsWith('[') && part.endsWith('Skill]')) {
                                                    const skillLabel = part.slice(1, -1);
                                                    return (
                                                        <button
                                                            key={i}
                                                            onClick={() => window.dispatchEvent(new CustomEvent('magnes:activate_skill', {
                                                                detail: { label: skillLabel, id: 'ecommerce-image-gen' }
                                                            }))}
                                                            className="mx-1 px-3 py-1 bg-black text-white text-[11px] font-bold rounded-sm hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                                                        >
                                                            {skillLabel}
                                                        </button>
                                                    );
                                                }
                                                // 统一处理引用标注
                                                const citationMatch = part.match(/^\[\[(?:笔记)?([\d,\s]+)(?:\]\[.*?)?\]\]$/) || part.match(/^【(\d+)】$/) || part.match(/^\[\[(\d+)\]\]$/);
                                                if (citationMatch) {
                                                    const nums = citationMatch[1].split(',').map(n => n.trim());
                                                    return (
                                                        <span key={i} className="mx-0.5 inline-flex gap-0.5">
                                                            {nums.map((num, ni) => {
                                                                const source = messageSourceMap[num];
                                                                const docId = source?.id;
                                                                const title = source?.title;
                                                                return (
                                                                    <span
                                                                        key={ni}
                                                                        onClick={() => {
                                                                            if (docId) window.dispatchEvent(new CustomEvent('magnes:open_note_detail', { detail: { docId } }));
                                                                        }}
                                                                        className={`cursor-pointer text-blue-600 hover:underline font-bold bg-blue-50 px-0.5 rounded-sm ${!docId ? 'opacity-30' : ''}`}
                                                                        title={docId ? `查看: ${title}` : '未知引用'}
                                                                    >
                                                                        [{num}]{ni < nums.length - 1 ? ',' : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </span>
                                                    );
                                                }
                                                return part;
                                            })}
                                        </div>
                                    );
                                });
                            })()}
                            {/* 流式光标 */}
                            {msg.isGenerating && <span className="animate-pulse ml-1">▌</span>}
                        </div>

                        {/* 三按钮组 (由检索来源/总结触发) */}
                        {!isUser && !apiEndpoint.includes('rag') && !msg.isGenerating &&
                            !displayContent.includes('正在为您搜索') && msg.action !== 'run_xhs_search' &&
                            msg.action !== 'create_rednote_node' &&
                            (msg.action === 'summary_draft' || msg.action === 'analyze_inspiration' || msg.sourceIds?.length > 0 || Object.keys(messageSourceMap || {}).length > 0) && (
                                <div className="flex gap-2 mt-2">
                                    {/* summary_draft / analyze_inspiration 不再强制要求 results 字段，fast path 也能显示按钮 */}
                                    {((msg.final_decision?.results?.length > 0) || (msg.sourceIds?.length > 0) || msg.action === 'summary_draft' || msg.action === 'analyze_inspiration') && (
                                        <>
                                            {!apiEndpoint.includes('rag') && (
                                                <button
                                                    onClick={() => {
                                                        // [PATCH] 草稿箱里应放用户的原始输入，而不是AI回复
                                                        let draftContent = '';
                                                        if (messages && msgIndex != null) {
                                                            // 向前查找最近一条用户消息
                                                            const prevUserMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user');
                                                            draftContent = prevUserMsg?.content || '';
                                                        }
                                                        if (!draftContent) {
                                                            draftContent = msg.parameters?.raw_draft_content || msg.reply || msg.content || '';
                                                        }
                                                        draftContent = draftContent.replace(/\\n/g, '\n');
                                                        window.dispatchEvent(new CustomEvent('magnes:open_draft_modal', {
                                                            detail: {
                                                                content: draftContent,
                                                                msg: { ...msg, parameters: { ...(msg.parameters || {}), raw_draft_content: draftContent } },
                                                                templateId: msg.templateId,
                                                                msgId: msg.id
                                                            }
                                                        }));
                                                    }}
                                                    className="px-2 py-1 bg-white border border-black text-[11px] uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-sm"
                                                >
                                                    编辑草稿箱
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const ids = Object.values(messageSourceMap || {}).map(s => s.id).filter(Boolean);
                                                    window.dispatchEvent(new CustomEvent('magnes:view_sources', {
                                                        detail: {
                                                            docIds: ids.length > 0 ? ids : (msg.sourceIds || []),
                                                            sourceMap: messageSourceMap || {},
                                                            content: msg.reply || msg.content || ''
                                                        }
                                                    }));
                                                }}
                                                className="px-2 py-1 bg-white border border-black text-[11px] uppercase tracking-widest hover:bg-black hover:text-white transition-all shadow-sm"
                                            >
                                                来源
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                    </div>
                )}

                {/* 详情弹窗 */}
                <MessageDetailModal />

                {/* 思维链折叠（AI 消息专有） */}
                {!isUser && msg.thought && msg.action !== 'create_rednote_node' && (
                    <div className="max-w-[240px] border border-zinc-300 text-[11px]">
                        <button
                            className="w-full flex items-center justify-between px-2 py-1 text-zinc-500 hover:text-black transition-colors"
                            onClick={() => setThoughtOpen(v => !v)}
                        >
                            <span className="uppercase tracking-widest text-[10px]">思维链</span>
                            {thoughtOpen
                                ? (ChevronUp ? <ChevronUp size={10} /> : '▲')
                                : (ChevronDown ? <ChevronDown size={10} /> : '▼')
                            }
                        </button>
                        {thoughtOpen && (
                            <div className="px-2 py-1 text-zinc-500 border-t border-zinc-300 leading-relaxed"
                                style={{ whiteSpace: 'pre-wrap' }}>
                                {msg.thought}
                            </div>
                        )}
                    </div>
                )}

                {/* 渲染后续引导问句与模版列表 (完全仿照普通消息气泡样式) */}
                {!isUser && (msg.follow_up_reply || (msg.templates && msg.templates.length > 0)) && (
                    <div className="follow-up-container max-w-[240px] px-3 py-2 text-[12px] bg-white text-black border border-black rounded-sm" style={{ marginTop: '12px' }}>
                        {msg.follow_up_reply && (
                            <div style={{
                                color: 'inherit',
                                marginBottom: '10px',
                                fontWeight: '500',
                                leading: 'relaxed'
                            }}>
                                {msg.follow_up_reply}
                            </div>
                        )}
                        {msg.templates && msg.templates.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {msg.templates.map((tpl, idx) => (
                                    <div
                                        key={tpl.id}
                                        onClick={() => {
                                            const emojiHint = msg.useEmoji ? ' (优先使用 Emoji 代替时间地点等标题)' : '';
                                            const command = `[技能指令] 确认选择模版: ${tpl.name} (ID: ${tpl.id})${emojiHint}`;
                                            // 立即更新当前消息的 templateId 状态
                                            if (setMessages) {
                                                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, templateId: tpl.id } : m));
                                            }
                                            onSendMessage(command, null, { useEmoji: msg.useEmoji });
                                        }}

                                        style={{
                                            color: 'black', // 黑色字体
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '2px 0',
                                            transition: 'opacity 0.2s',
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.7'}
                                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                                    >
                                        <span style={{
                                            fontWeight: 'bold',
                                            backgroundColor: 'black', // 编号也用黑色
                                            color: 'white',
                                            width: '18px',
                                            height: '18px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '50%',
                                            fontSize: '10px',
                                            flexShrink: 0
                                        }}>{idx + 1}</span>
                                        <span style={{ textDecoration: 'underline' }}>{tpl.name}</span>
                                    </div>
                                ))}
                                <div style={{ fontSize: '10px', color: '#888888', marginTop: '4px', fontStyle: 'italic' }}>
                                    * 您也可以直接回复数字编号进行选择
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 原有的 Action 按钮 (编辑草稿等) */}
                {!isUser && msg.action && msg.action !== 'chat' && msg.action !== 'create_rednote_node' && !msg.follow_up_reply && ACTION_LABELS[msg.action] && (
                    <div className="flex items-center gap-1">
                        <span className={`text-[10px] px-2 py-0.5 uppercase tracking-widest ${ACTION_LABELS[msg.action].bg}`}>
                            {ACTION_LABELS[msg.action].label}
                        </span>
                        {msg.action === 'run_xhs_publish' && (
                            <button
                                className="text-[10px] px-2 py-0.5 bg-black text-white border border-red-600 hover:bg-red-600 transition-colors uppercase font-bold"
                                onClick={() => window.dispatchEvent(new CustomEvent('magnes:xhs_publish', { detail: msg }))}
                            >
                                立即预览并发布
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ─── 主面板 ────────────────────────────────────────────────────────────────
    const ConversationPanel = ({
        addNodes,          // ReactFlow addNodes 函数（用于画布镜像）
        getNodes,          // ReactFlow getNodes 函数
        setNodes,          // ReactFlow setNodes 函数
        onTriggerGeneration, // 触发生图的回调 (action, parameters) => void
        messages,          // 提升后的消息列表
        setMessages,       // 提升后的设置消息函数
        activeSkill,       // 当前激活的 Skill ID
        skillSummary,      // Skill 摘要
        theme,
        // 新增配置项
        apiEndpoint = '/api/v1/dialogue/run',
        title = '灵感助手',
        placeholder = '描述你想要的操作...',
        emptyState = null,
        showUpload = true,
        onRetrievalResults = null, // 检索结果回调
        onSearch = null,           // 直接搜索按钮回调
        onRewrittenQueries = null, // 问题改写结果回调
        noBorder = false,          // 是否移除左侧边框
        extraContext = null,       // 外部注入的上下文（摘要/标签等）
        conversationId,            // 外部传入 ID
        setConversationId,         // 外部修改 ID 回调
        allowCollapse = true,      // 是否允许收起面板
        widthClass = 'w-[320px]',  // 容器宽度类，默认为画布所需的 320px
        collapsed,                 // 外部传入受控状态
        setCollapsed,              // 外部传入切换函数
    }) => {
        const [localCollapsed, setLocalCollapsed] = useState(false);
        const isCollapsed = collapsed !== undefined ? collapsed : localCollapsed;
        const setIsCollapsed = setCollapsed !== undefined ? setCollapsed : setLocalCollapsed;

        const [inputText, setInputText] = useState('');
        const [isGenerating, setIsGenerating] = useState(false);
        const messagesRef = useRef(messages);

        // [Hamilton] 实时同步消息引用，用于在不触发重渲染的情况下在异步闭包中获取最新上下文
        useEffect(() => {
            messagesRef.current = messages;
        }, [messages]);

        const [pendingFileUpload, setPendingFileUpload] = useState(null); // 记录待分类上传的文件: { file, categoryPromptId }
        const [sessions, setSessions] = useState([]);
        const [sessionListOpen, setSessionListOpen] = useState(false);
        const messagesEndRef = useRef(null);
        const fileInputRef = useRef(null);
        const readerRef = useRef(null);  // 持有 SSE Reader，用于清理

        const Icons = getIcons();
        const Send = Icons.Send;
        const X = Icons.X;
        const Paperclip = Icons.Paperclip;
        const ChevronRight = Icons.ChevronRight;
        const MessageSquare = Icons.MessageSquare;
        const Plus = Icons.Plus;
        const Clock = Icons.Clock || Icons.History;
        const Trash2 = Icons.Trash2;
        const ChevronLeft = Icons.ChevronLeft;

        // 自动滚到底部
        useEffect(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, [messages]);

        // 获取会话列表
        const fetchSessions = useCallback(async () => {
            try {
                const API = window.MagnesComponents.Utils.API;
                const response = await API.magnesFetch('/dialogue/sessions');
                const data = await response.json();
                if (data.status === 'success') {
                    setSessions(data.sessions || []);
                }
            } catch (e) {
                console.error('[ConversationPanel] 无法获取会话列表:', e);
            }
        }, []);

        // 开启新对话
        const startNewConversation = useCallback(() => {
            const newId = `conv_${Date.now()}`;
            setConversationId(newId);
            setMessages([]);
            setSessionListOpen(false);
            console.log('[ConversationPanel] 🆕 开启新对话:', newId);
        }, [setMessages, setConversationId]);

        // 切换对话
        const switchConversation = useCallback(async (id) => {
            if (id === conversationId) {
                setSessionListOpen(false);
                return;
            }

            setConversationId(id);
            setSessionListOpen(false);
            setIsGenerating(false);
            readerRef.current?.cancel();
            console.log('[ConversationPanel] 🔄 切换会话 ID:', id);
        }, [conversationId, setConversationId]);

        // 删除对话
        const deleteConversation = useCallback(async (e, id) => {
            e.stopPropagation(); // 阻止触发 switchConversation
            if (!confirm('确定要彻底删除这条对话历史吗？此操作不可撤销。')) return;

            try {
                const API = window.MagnesComponents.Utils.API;
                const response = await API.magnesFetch(`/dialogue/sessions/${id}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    console.log('[ConversationPanel] 🗑️ 会话已删除:', id);
                    // 如果删除的是当前正在查看的会话，则开启新对话
                    if (id === conversationId) {
                        startNewConversation();
                    }
                    // 刷新列表
                    fetchSessions();
                } else {
                    alert('删除失败，请稍后重试');
                }
            } catch (err) {
                console.error('[ConversationPanel] 删除请求异常:', err);
            }
        }, [conversationId, startNewConversation, fetchSessions]);

        // ─── 处理画布镜像：上传图片 → 创建 input-image 节点 ─────────────
        const mirrorImageToCanvas = useCallback((imageUrl) => {
            if (!addNodes) return;
            const existingNodes = getNodes ? getNodes() : [];
            const x = existingNodes.length === 0 ? 80 : 200 + existingNodes.length * 30;
            const y = 150 + existingNodes.length * 20;

            addNodes([{
                id: `conv-img-${Date.now()}`,
                type: 'input-image',
                position: { x, y },
                data: {
                    content: imageUrl,
                    fromConversation: true,  // 标记来源，可做差异化样式
                    label: '对话上传'
                }
            }]);
            console.log('[ConversationPanel] 🖼️ 图片已镜像到画布');
        }, [addNodes, getNodes]);

        // ─── 手动记录消息到后端历史 (用于非 SSE 交互) ──────────────────────────
        const recordMessage = useCallback(async (role, content) => {
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.magnesFetch('/dialogue/message', {
                    method: 'POST',
                    body: JSON.stringify({ conversationId, role, content })
                });
            } catch (err) {
                console.error('[ConversationPanel] ❌ 记录历史失败:', err);
            }
        }, [conversationId]);

        // ─── 处理 Planner 返回的 action ──────────────────────────────────
        const handlePlannerAction = useCallback(async (event, msgId = null) => {
            console.log('[ConversationPanel] 🎯 Planner Action:', event);
            if (event.action === 'mirror_image' && event.parameters?.imageUrl) {
                const imageUrl = event.parameters.imageUrl;
                const nodes = getNodes ? getNodes() : [];
                // 查找最新的 fine-tune 节点，优先填充到模版中
                const targetNode = [...nodes].reverse().find(n => n.type === 'fine-tune');

                if (targetNode && setNodes) {
                    console.log('[ConversationPanel] 🎯 找到 fine-tune 节点，尝试填充占位图...');
                    const currentLayers = targetNode.data.content?.layers || [];
                    let filled = false;
                    const newLayers = currentLayers.map(l => {
                        const isPlaceholder = l.type === 'placeholder_image' || l.isPlaceholder || l.role === 'placeholder_image';
                        if (!filled && isPlaceholder && !l.url) {
                            filled = true;
                            console.log(`[ConversationPanel] ✅ 填充占位图图层: ${l.id}`);
                            return {
                                ...l,
                                type: 'image',
                                url: imageUrl,
                                isPlaceholder: false
                            };
                        }
                        return l;
                    });

                    if (filled) {
                        setNodes(nds => nds.map(n => n.id === targetNode.id ? {
                            ...n,
                            data: {
                                ...n.data,
                                isDirty: true,
                                content: { ...(targetNode.data.content || {}), layers: newLayers }
                            }
                        } : n));
                        // 使用 global toast 如果可用
                        if (window.MagnesComponents?.UI?.toast) window.MagnesComponents.UI.toast('✨ 已将图片同步到模版展示位', 'success');
                        return;
                    }
                }

                // Fallback: 如果没有 fine-tune 节点或没有空余占位符，则创建独立图片节点
                mirrorImageToCanvas(imageUrl);
            }

            // [导出画布图片] export_canvas_image：截取精细编辑节点并以图片消息发回对话框
            if (event.action === 'export_canvas_image') {
                console.log('[ConversationPanel] 📸 收到导出画布图片请求...');

                // 找到画面上的精细编辑节点 DOM
                const canvasEl = document.querySelector('[class*="fine-tune-canvas-"]');
                if (!canvasEl) {
                    setMessages(prev => [...prev, {
                        id: `ai_export_${Date.now()}`,
                        role: 'assistant',
                        content: '⚠️ 未找到精细编辑节点，请先生成活动编辑图。',
                        timestamp: new Date()
                    }]);
                    return;
                }

                // 添加正在截图的 AI 消息占位
                const exportMsgId = `ai_export_${Date.now()}`;
                setMessages(prev => [...prev, {
                    id: exportMsgId,
                    role: 'assistant',
                    content: '📸 正在生成图片...',
                    isGenerating: true,
                    timestamp: new Date()
                }]);

                try {
                    // 动态加载 html-to-image（若未已加载）
                    if (!window.htmlToImage) {
                        await new Promise((resolve, reject) => {
                            const s = document.createElement('script');
                            s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js';
                            s.onload = resolve; s.onerror = reject;
                            document.head.appendChild(s);
                        });
                    }

                    // 克隆 DOM 并将图片内联为 base64，避免 CORS/缓存问题影响原始页面
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointerEvents:none;zIndex:-9999;overflow:hidden;';
                    const clone = canvasEl.cloneNode(true);
                    clone.style.position = 'static';
                    clone.style.width = canvasEl.offsetWidth + 'px';
                    clone.style.height = canvasEl.offsetHeight + 'px';
                    wrapper.appendChild(clone);
                    document.body.appendChild(wrapper);

                    const originalImgs = Array.from(canvasEl.querySelectorAll('img'));
                    const clonedImgs = Array.from(clone.querySelectorAll('img'));
                    for (let i = 0; i < originalImgs.length && i < clonedImgs.length; i++) {
                        const origImg = originalImgs[i];
                        const clonedImg = clonedImgs[i];
                        try {
                            if (origImg.complete && origImg.naturalWidth > 0) {
                                const c = document.createElement('canvas');
                                c.width = origImg.naturalWidth;
                                c.height = origImg.naturalHeight;
                                c.getContext('2d').drawImage(origImg, 0, 0);
                                clonedImg.src = c.toDataURL('image/png');
                                clonedImg.crossOrigin = 'anonymous';
                            }
                        } catch (imgErr) {
                            console.warn('[ConversationPanel] Could not inline image:', imgErr);
                            clonedImg.crossOrigin = 'anonymous';
                        }
                    }

                    const dataUrl = await window.htmlToImage.toPng(clone, {
                        pixelRatio: 2,
                        backgroundColor: '#ffffff',
                        skipFonts: false
                    });
                    if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);

                    // 将截图以图片消息形式更新到对话框
                    setMessages(prev => prev.map(m => m.id === exportMsgId ? {
                        ...m,
                        content: '这是当前编辑图 ✨',
                        imageUrl: dataUrl,
                        isGenerating: false
                    } : m));

                    console.log('[ConversationPanel] ✅ 画布截图已发回对话框');
                } catch (err) {
                    console.error('[ConversationPanel] ❌ 截图失败:', err);
                    setMessages(prev => prev.map(m => m.id === exportMsgId ? {
                        ...m,
                        content: '❌ 截图失败：' + err.message,
                        isGenerating: false
                    } : m));
                }
                return;
            }


            // [专属处理] create_rednote_node：走标准的全局生成事件流，支持切换 Tab 和加载模版
            if (event.action === 'create_rednote_node') {
                const activityContent = event.parameters?.content || '';
                const templateId = event.parameters?.templateId || '';

                // 从当前 AI 消息中提取 useEmoji 标志（如果有）
                const targetId = msgId;
                const currentMsg = messagesRef.current.find(m => m.id === targetId);
                const useEmoji = event.parameters?.useEmoji !== undefined ? event.parameters.useEmoji : (currentMsg?.useEmoji || false);

                console.log('[ConversationPanel] 🏗️ create_rednote_node, 委托给 onTriggerGeneration', { templateId, useEmoji });

                if (onTriggerGeneration) {
                    onTriggerGeneration(event.action, {
                        ...event.parameters,
                        prompt: activityContent,
                        initialContent: activityContent,
                        useEmoji: useEmoji,
                        conversationId
                    });
                }
                return; // create_rednote_node 已处理完毕
            }

            if (onTriggerGeneration && ['run_painter', 'show_painter_result', 'run_refiner', 'adjust_style', 'create_content_node', 'run_xhs_search', 'run_xhs_publish'].includes(event.action)) {
                const paramsWithContext = {
                    ...(event.parameters || {}),
                    conversationId: conversationId
                };
                onTriggerGeneration(event.action, paramsWithContext);
            }
        }, [mirrorImageToCanvas, onTriggerGeneration, conversationId, addNodes, getNodes]);


        // ─── 处理知识库文件上传 (跳过 SSE，直接调用 upload 接口) ───────────
        const handleRAGUpload = useCallback(async (file, categoryIndex) => {
            const categories = ['通用资料', '品牌指南', '视觉规范', '文案库', '其它'];
            const category = categories[categoryIndex - 1];
            if (!category) return;

            const aiMsgId = `ai_upload_${Date.now()}`;
            setMessages(prev => [...prev, {
                id: aiMsgId,
                role: 'assistant',
                content: `正在将文档【${file.name}】上传至 [${category}] 分类...`,
                isGenerating: true,
                timestamp: new Date()
            }]);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', category);

            try {
                const API = window.MagnesComponents.Utils.API;
                const response = await API.magnesFetch('/rag/knowledge/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.status === 'success') {
                    const successMsg = `✓ 文档处理成功并已归档至 [${category}] 分类。\n文件：${file.name}\n大小：${(file.size / 1024).toFixed(1)} KB`;
                    setMessages(prev => prev.map(m =>
                        m.id === aiMsgId
                            ? { ...m, content: successMsg, isGenerating: false }
                            : m
                    ));
                    // 1. 记录历史
                    recordMessage('assistant', successMsg);
                    // 2. 触发刷新
                    window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                } else {
                    throw new Error(data.detail || '处理失败');
                }
            } catch (err) {
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                        ? { ...m, content: `❌ 上传失败: ${err.message}`, isGenerating: false }
                        : m
                ));
            } finally {
                setPendingFileUpload(null);
                setIsGenerating(false);
            }
        }, [setMessages, setIsGenerating]);

        // ─── 发送消息（核心 SSE 逻辑）────────────────────────────────────
        const sendMessage = useCallback(async (text, imageUrl = null, options = {}) => {
            if (!text.trim() && !imageUrl) return;
            if (isGenerating) return;

            // [拦截逻辑]：如果是知识库模式且有挂起文件
            if (apiEndpoint.includes('rag') && pendingFileUpload) {
                const choice = parseInt(text.trim());
                if (!isNaN(choice) && choice >= 1 && choice <= 5) {
                    // 用户选择了分类
                    setMessages(prev => [...prev, {
                        id: `user_${Date.now()}`,
                        role: 'user',
                        content: `${choice}`,
                        timestamp: new Date()
                    }]);
                    recordMessage('user', `${choice}`);
                    handleRAGUpload(pendingFileUpload.file, choice);
                    setInputText('');
                    return;
                } else if (text.trim() !== '') {
                    // 用户输入了非数字内容，视为放弃分类，继续普通对话
                    setPendingFileUpload(null);
                }
            }

            // [前端直接拦截] 保存图片 / 导出图片 - 无需 LLM，立即截图回传
            const EXPORT_KEYWORDS = ['保存图片', '导出图片', '生成图片', '发图', '发给我', '把图发', '截图'];
            if (!imageUrl && EXPORT_KEYWORDS.some(kw => text.trim().includes(kw))) {
                // 添加用户消息
                setMessages(prev => [...prev, {
                    id: `user_${Date.now()}`,
                    role: 'user',
                    content: text.trim(),
                    timestamp: new Date()
                }]);
                setInputText('');
                // 直接触发导出逻辑（复用 handlePlannerAction 中的实现）
                handlePlannerAction({ action: 'export_canvas_image', parameters: {} });
                return;
            }


            // 添加用户消息
            const userMsg = {
                id: `user_${Date.now()}`,
                role: 'user',
                content: text,
                imageUrl,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
            setIsGenerating(true);


            // 添加 AI 消息占位（流式更新）
            const aiMsgId = `ai_${Date.now()}`;
            const aiMsg = {
                id: aiMsgId,
                role: 'assistant',
                content: '',
                thought: '',
                action: null,
                isGenerating: true,
                useEmoji: !!options.useEmoji,
                timestamp: new Date(),
                sourceIds: extraContext?.selectedDocIds || []
            };
            setMessages(prev => [...prev, aiMsg]);

            // 构建历史（使用 Ref 避开依赖重排）
            const history = messagesRef.current.slice(-20).map(m => {
                let text = '';
                if (typeof m.content === 'string') {
                    text = m.content;
                } else if (Array.isArray(m.content)) {
                    // 处理多模态：仅保留文本部分用于上下文
                    const textPart = m.content.find(p => p.type === 'text');
                    text = (textPart && textPart.text) ? textPart.text : '';
                }
                return {
                    role: m.role,
                    content: text || ''
                };
            });

            // 获取当前画布快照（裁剪后）
            const nodes = getNodes ? getNodes() : [];
            const canvasContext = {
                nodes: nodes.slice(0, 10).map(n => ({
                    id: n.id,
                    type: n.type,
                    prompt: (n.data?.prompt || '').substring(0, 100),
                    imageUrl: n.data?.imageUrl || (n.data?.settings?.sourceImages?.[0]),
                    sourceImages: n.data?.settings?.sourceImages || []
                })),
                activeNodeId: null
            };

            console.log(`[ConversationPanel] 🚀 正式发起 SSE 请求: ${apiEndpoint}`);

            try {
                const API = window.MagnesComponents.Utils.API;
                const cleanEndpoint = apiEndpoint.replace('/api/v1', '');
                const response = await API.magnesFetch(cleanEndpoint, {
                    method: 'POST',
                    triggerLogin: true, // 用户主动发送消息时触发登录弹窗

                    body: JSON.stringify({
                        message: text,
                        conversationId,
                        history,
                        canvasContext,
                        activeSkill: activeSkill || null,
                        skillSummary: skillSummary || null,
                        imageUrl: imageUrl || null,
                        ratio: options.ratio || null,
                        extraContext: extraContext || null
                    })
                });

                if (!response.ok) {
                    // 处理认证错误：401/403 触发登录弹窗
                    if (response.status === 401 || response.status === 403) {
                        console.warn('[ConversationPanel] 🔒 认证失败，触发登录弹窗');
                        window.dispatchEvent(new CustomEvent('magnes:open_login', {
                            detail: { reason: 'auth_required', message: '请先登录后再使用对话功能' }
                        }));
                        throw new Error('请先登录');
                    }
                    throw new Error(`HTTP ${response.status}`);
                }

                const reader = response.body.getReader();
                readerRef.current = reader;
                const decoder = new TextDecoder();
                let buffer = '';
                let currentAiMsgId = aiMsgId; // 支持动态切换目标气泡

                // 定义内部解析辅助函数，确保循环内外逻辑一致
                const processBuffer = (targetBuffer) => {
                    const lines = targetBuffer.split('\n');
                    const remaining = lines.pop() || '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;
                        try {
                            const event = JSON.parse(jsonStr);
                            console.log('[ConversationPanel] 📥 Received Event:', event.type, event);

                            if (event.type === 'new_bubble') {
                                // 开启一个全新的 AI 回复气泡
                                const newId = `ai_${Date.now()}`;
                                const newMsg = {
                                    id: newId,
                                    role: 'assistant',
                                    content: '',
                                    thought: '',
                                    action: event.action || 'chat',
                                    isGenerating: true,
                                    timestamp: new Date(),
                                    sourceIds: event.sourceIds || []
                                };
                                setMessages(prev => [...prev, newMsg]);
                                currentAiMsgId = newId; // 切换后续内容的注入目标
                                continue;
                            }

                            if (event.type === 'thought_chunk') {
                                console.log('[ConversationPanel] 🧠 Adding thought chunk:', event.content);
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, thought: (m.thought || '') + event.content } : m
                                ));
                            } else if (event.type === 'thought') {
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, thought: event.content } : m
                                ));
                            } else if (event.type === 'action') {
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, action: event.action, parameters: event.parameters || m.parameters } : m
                                ));
                                handlePlannerAction(event, currentAiMsgId);
                            } else if (event.type === 'retrieval_results') {
                                if (onRetrievalResults) onRetrievalResults(event.results || []);
                                // 同时将 RAG 检索结果的 ID 同步到消息的 sourceIds，确保来源按钮可用
                                const ragIds = (event.results || []).map(r => r.chunk_id || r.id || r.doc_id).filter(Boolean);
                                if (ragIds.length > 0) {
                                    setMessages(prev => prev.map(m =>
                                        m.id === currentAiMsgId ? { ...m, sourceIds: ragIds } : m
                                    ));
                                }
                            } else if (event.type === 'rewritten_queries') {
                                if (onRewrittenQueries) onRewrittenQueries(event.queries || []);
                            } else if (event.type === 'reply') {
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? {
                                        ...m,
                                        content: event.content !== undefined ? (m.content + event.content) : m.content,
                                        action: event.action || m.action,
                                        parameters: event.parameters || m.parameters,
                                        templateId: event.templateId || event.parameters?.templateId || m.templateId,
                                        imageUrl: event.imageUrl || m.imageUrl,
                                        follow_up_reply: event.follow_up_reply || m.follow_up_reply,
                                        templates: event.templates || m.templates
                                    } : m
                                ));
                                if (event.action) handlePlannerAction(event, currentAiMsgId);
                            } else if (event.type === 'results') {
                                // 自动将分析结果的 ID 集合挂载到消息对象的 sourceIds
                                // 兼容多种 ID 命名：id, doc_id, xhs_id
                                const ids = (event.results || []).map(r => r.id || r.doc_id || r.xhs_id).filter(Boolean);
                                console.log('[ConversationPanel] 📥 Received results, mapped ids:', ids);
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, sourceIds: ids, results: event.results } : m
                                ));
                            } else if (event.type === 'refresh_rag') {
                                console.log('[ConversationPanel] 🔄 收到后端刷新 RAG 指令');
                                window.dispatchEvent(new CustomEvent('magnes:refresh_knowledge_base'));
                            } else if (event.type === 'done') {
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, isGenerating: false } : m
                                ));
                                setIsGenerating(false);
                            } else if (event.type === 'error') {
                                setMessages(prev => prev.map(m =>
                                    m.id === currentAiMsgId ? { ...m, content: `❌ ${event.message}`, isGenerating: false } : m
                                ));
                                setIsGenerating(false);
                            }
                        } catch (e) {
                            console.warn('[ConversationPanel] SSE parse error:', e, 'line:', jsonStr);
                        }
                    }
                    return remaining;
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    buffer = processBuffer(buffer);
                }

                // 处理最后可能残留在 buffer 中的信号（例如 done 信号处于流的末尾）
                if (buffer.trim()) {
                    processBuffer(buffer + '\n');
                }

            } catch (err) {
                console.error('[ConversationPanel] SSE error:', err);
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId
                        ? { ...m, content: `连接异常：${err.message}`, isGenerating: false }
                        : m
                ));
            } finally {
                // [Robust  兜底解锁机制：无论上面发生了什么，强制标识生成结束，解开输入框锁
                console.log('[ConversationPanel] 🛡️ SSE Finally Lock Release Triggered');
                setIsGenerating(false);
                setMessages(prev => prev.map(m =>
                    m.id === aiMsgId ? { ...m, isGenerating: false } : m
                ));
                readerRef.current = null;
            }
        }, [isGenerating, conversationId, activeSkill, skillSummary, getNodes, mirrorImageToCanvas, handlePlannerAction, apiEndpoint, onRetrievalResults, onRewrittenQueries]);

        // 清理 SSE 连接 & 处理 Skill 激活
        useEffect(() => {
            const handleSkillActivate = (e) => {
                const { id, label } = e.detail;
                console.log(`[ConversationPanel] 🚀 激活 Skill: ${label} (${id})`);

                // 自动发送一条带技能标记的消息，告知后端切换到此技能流程
                sendMessage(`[技能指令] 我选择了使用：${label}`);

                // 设置内部状态以影响后续 SSE 请求头（可选，也可直接靠消息内容驱动）
                // 这里的 sendMessage 已经携带了上下文，Planner 会基于 history 解析出 action
            };
            const handleDraftModified = (e) => {
                const { content, msgId } = e.detail;
                console.log(`[ConversationPanel] ✍️ 收到草稿回写: ${msgId}`);
                if (setMessages && msgId) {
                    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
                }
            };

            const handleChatCommand = (e) => {
                const command = e.detail;
                if (typeof command === 'string') {
                    console.log(`[ConversationPanel] 📥 收到外部指令: ${command}`);
                    sendMessage(command);
                } else if (command && typeof command === 'object') {
                    console.log(`[ConversationPanel] 📥 收到外部指令对象:`, command);
                    sendMessage(command.command, command.imageUrl, { ratio: command.ratio });
                }
            };

            window.addEventListener('magnes:activate_skill', handleSkillActivate);
            window.addEventListener('magnes:draft_modified', handleDraftModified);
            window.addEventListener('magnes:send_chat_command', handleChatCommand);

            return () => {
                readerRef.current?.cancel();
                window.removeEventListener('magnes:activate_skill', handleSkillActivate);
                window.removeEventListener('magnes:draft_modified', handleDraftModified);
                window.removeEventListener('magnes:send_chat_command', handleChatCommand);
            };
        }, []); // 仅在初始化和卸载时监听/清理

        // ─── 图片上传处理 ─────────────────────────────────────────────────
        const handleImageUpload = useCallback((e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // 识别文件类型
            const isImage = file.type.startsWith('image/');
            const ext = file.name.split('.').pop().toLowerCase();
            const isDoc = ['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext);

            // 如果是 RAG 模式且是文档（或图片作为知识库素材）
            if (apiEndpoint.includes('rag')) {
                const fileDesc = isImage ? '图片素材' : `${ext.toUpperCase()} 文档`;
                const promptMsg = `已收到文件：${file.name}\n文件类型：${fileDesc}\n\n请选择要存入的分类（回复数字编号）：\n1. 通用资料\n2. 品牌指南\n3. 视觉规范\n4. 文案库\n5. 其它`;
                setMessages(prev => [...prev, {
                    id: `sys_upload_${Date.now()}`,
                    role: 'assistant',
                    content: promptMsg,
                    timestamp: new Date()
                }]);
                recordMessage('assistant', promptMsg);
                setPendingFileUpload({ file, typeDesc: fileDesc });
                e.target.value = '';
                return;
            }

            // 原有图片对话逻辑
            if (isImage) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const imageUrl = ev.target.result; // base64 Data URL

                    // 全局持久化缓存：确保后续自动生图逻辑 (REUSE_CONTEXT_IMAGE) 能找回此图
                    localStorage.setItem('lastMagnesImageUrl', imageUrl);
                    window.cachedInputImage = imageUrl;

                    // 直接走标准路径：后端 dialogue_routes 会先推 mirror_image
                    // 再由 Planner 根据对话上下文决定动作（活动图 / 商品图 / 其他）
                    const userText = inputText.trim() || '我上传了一张图片';
                    // sendMessage 内部已经会处理 setMessages，这里不需要手动添加，防止重复
                    sendMessage(userText, imageUrl);
                };
                reader.readAsDataURL(file);
            }
            e.target.value = '';  // 清空 input，允许重复上传同一文件
        }, [inputText, sendMessage, apiEndpoint, setMessages]);

        // ─── 渲染（收起状态） ────────────────────────────────────────────
        if (isCollapsed) {
            return (
                <div
                    className={`w-8 h-full bg-white ${noBorder ? '' : 'border-l border-black'} flex flex-col items-center pt-4 cursor-pointer shrink-0`}
                    onClick={() => setIsCollapsed(false)}
                    title="展开对话面板"
                >
                    {MessageSquare ? <MessageSquare size={14} /> : '💬'}
                </div>
            );
        }

        // ─── 渲染（展开状态） ────────────────────────────────────────────
        return (
            <div className={`${widthClass} h-full bg-white ${noBorder ? '' : 'border-l border-black'} flex flex-col shrink-0`} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-black shrink-0">
                    <div className="flex items-center gap-2">
                        {sessionListOpen ? (
                            <button
                                onClick={() => setSessionListOpen(false)}
                                className="text-zinc-400 hover:text-black transition-colors"
                            >
                                {ChevronLeft ? <ChevronLeft size={14} /> : '‹'}
                            </button>
                        ) : (
                            MessageSquare ? <MessageSquare size={14} /> : null
                        )}
                        <span className="text-[12px] font-bold uppercase tracking-widest">
                            {sessionListOpen ? '历史对话' : title}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!sessionListOpen && (
                            <>
                                {/* 新对话 */}
                                <button
                                    className="text-zinc-400 hover:text-black transition-colors px-1"
                                    onClick={startNewConversation}
                                    title="开启新对话"
                                >
                                    {Plus ? <Plus size={14} /> : '+'}
                                </button>
                                {/* 历史列表切换 */}
                                <button
                                    className="text-zinc-400 hover:text-black transition-colors px-1"
                                    onClick={() => {
                                        setSessionListOpen(true);
                                        fetchSessions();
                                    }}
                                    title="查看历史对话"
                                >
                                    {Clock ? <Clock size={14} /> : 'H'}
                                </button>

                            </>
                        )}
                        {/* 收起 */}
                        {allowCollapse && (
                            <button
                                className="text-zinc-400 hover:text-black transition-colors"
                                onClick={() => setIsCollapsed(true)}
                                title="收起面板"
                            >
                                {ChevronRight ? <ChevronRight size={14} /> : '›'}
                            </button>
                        )}
                    </div>
                </div>

                {/* 会话列表视图 */}
                {sessionListOpen ? (
                    <div className="flex-1 overflow-y-auto bg-zinc-50 flex flex-col">
                        {sessions.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-zinc-400 text-[11px] uppercase tracking-widest">
                                暂无历史记录
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {sessions.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => switchConversation(s.id)}
                                        className={`group px-4 py-3 border-b border-zinc-200 cursor-pointer transition-all hover:bg-white relative
                                            ${s.id === conversationId ? 'bg-white border-l-2 border-l-black' : ''}`}
                                    >
                                        <div className={`text-[12px] font-bold mb-0.5 truncate pr-8 ${s.id === conversationId ? 'text-black' : 'text-zinc-600 group-hover:text-black'}`}>
                                            {s.title}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] text-zinc-400 font-mono truncate max-w-[120px]">
                                                {s.id}
                                            </div>
                                            {s.updated_at && (
                                                <div className="text-[10px] text-zinc-300 font-medium">
                                                    · {formatTime(s.updated_at)}
                                                </div>
                                            )}
                                        </div>
                                        {/* 删除按钮 */}
                                        <button
                                            onClick={(e) => deleteConversation(e, s.id)}
                                            className="absolute right-3 top-4 opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all p-1"
                                            title="删除此会话"
                                        >
                                            {Trash2 ? <Trash2 size={12} /> : '×'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="p-4 mt-auto">
                            <button
                                onClick={startNewConversation}
                                className="w-full py-2 bg-black text-white text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors"
                            >
                                开启全新对话
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* 消息列表 */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
                            {messages.length === 0 && (
                                emptyState || (
                                    <div className="text-center text-zinc-400 text-[12px] mt-8 leading-relaxed">
                                        <div className="mb-2 text-2xl">✦</div>
                                        <div>{apiEndpoint.includes('rag') ? '试试上传文件：' : '试试说：'}</div>
                                        <div className="mt-2 text-[11px] text-zinc-300 leading-loose">
                                            {apiEndpoint.includes('rag') ? (
                                                <>
                                                    「点击左下角上传品牌资料」<br />
                                                    「支持 PDF/Word/Excel/图片」<br />
                                                    「上传后请回复编号归档」
                                                </>
                                            ) : (
                                                <>
                                                    「帮我换成手绘风格」<br />
                                                    「把背景调暗，增加对比度」<br />
                                                    「分析这张图的视觉风格」
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            )}
                            {messages.map((msg, idx) => (
                                <MessageBubble key={msg.id} msg={msg} apiEndpoint={apiEndpoint} onSendMessage={sendMessage} setMessages={setMessages} messages={messages} msgIndex={idx} />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    </>
                )}

                {/* 输入区 */}
                <div className="border-t border-black shrink-0">
                    <div className="flex items-end gap-0">
                        {/* 图片上传按钮 */}
                        {showUpload && (
                            <button
                                className="px-3 py-3 text-zinc-400 hover:text-black transition-colors shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                                title="上传参考图（自动同步到画布）"
                            >
                                {Paperclip ? <Paperclip size={18} /> : (Icons.Upload ? <Icons.Upload size={18} /> : null)}
                            </button>
                        )}

                        {/* 灵感搜索按钮 - 已按需隐藏 */}
                        {/* {!apiEndpoint.includes('rag') && (
                            <button
                                className="px-3 py-3 text-zinc-400 hover:text-red-600 transition-colors shrink-0"
                                onClick={() => {
                                    const text = inputText.trim();
                                    if (onSearch) {
                                        onSearch(text || '最近最火的小红书爆款笔记灵感');
                                    } else {
                                        if (!text) {
                                            sendMessage('帮我搜搜最近最火的小红书爆款笔记灵感');
                                        } else {
                                            sendMessage(`帮我搜搜关于“${text}”的小红书灵感`);
                                        }
                                    }
                                }}
                                title="搜索小红书灵感"
                            >
                                {Icons.Search ? <Icons.Search size={18} /> : '🔍'}
                            </button>
                        )} */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                            className="hidden"
                            onChange={handleImageUpload}
                        />

                        {/* 文字输入 */}
                        <textarea
                            className="flex-1 px-3 py-3 text-[12px] resize-none outline-none bg-white placeholder-zinc-300"
                            style={{ minHeight: 80, maxHeight: 120 }}
                            placeholder={placeholder}
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage(inputText);
                                }
                            }}
                            disabled={isGenerating}
                        />

                        {/* 发送按钮 */}
                        <button
                            className={`px-3 py-3 shrink-0 transition-colors
                                        ${isGenerating || !inputText.trim()
                                    ? 'text-zinc-300 cursor-not-allowed'
                                    : 'text-zinc-400 hover:text-black'}`}
                            onClick={() => sendMessage(inputText)}
                            disabled={isGenerating || !inputText.trim()}
                        >
                            {Send ? <Send size={18} /> : (Icons.ArrowRight ? <Icons.ArrowRight size={18} /> : null)}
                        </button>
                    </div>

                    {/* 生成中提示 */}
                    {isGenerating && (
                        <div className="px-4 py-1 text-[10px] text-zinc-400 border-t border-zinc-100 uppercase tracking-widest">
                            {apiEndpoint.includes('rag') ? '正在检索知识库...' : 'Planner 正在分析...'}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 注册到全局
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};
    window.MagnesComponents.UI.ConversationPanel = ConversationPanel;

    console.log('✅ ConversationPanel 加载成功');
})();
