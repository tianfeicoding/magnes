/**
 * Rednote Content Node (Batch/Multi-Item Mode)
 * 路径: src/nodes/rednote/content-node.js
 */

(function () {
    'use strict';

    const { React } = window;
    const { useState, useEffect, useCallback } = React;
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    // 移除快照式引用，改由函数内动态获取
    const {
        Image: ImageIcon = () => null,
        RefreshCw = () => null,
        Wand2 = () => null,
        Copy = () => null,
        Trash2 = () => null,
        ArrowRight = () => null,
        Sparkles = () => null,
        Plus = () => null,
        History = () => null
    } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;
    const MagicIcon = Sparkles || Wand2;
    const SyncIcon = RefreshCw || History;
    const AddIcon = Plus || Copy;

    const API_BASE = window.MAGNES_API_BASE || 'http://localhost:8088/api/v1';

    // 辅助函数: 归一化活动项的键名
    const normalizeItem = (item) => {
        if (!item || typeof item !== 'object') return item;
        const Helpers = window.MagnesComponents?.Utils?.ParseHelpers;
        if (!Helpers || !Helpers.normalizeRole) return item;

        const normalized = {};
        Object.keys(item).forEach(key => {
            const val = item[key];
            const normalizedKey = Helpers.normalizeRole(key);
            // 防覆盖逻辑：只有当新值更有效时才录入
            if (val && (!normalized[normalizedKey] || String(val).length > String(normalized[normalizedKey]).length)) {
                normalized[normalizedKey] = val;
            }
        });

        // 极致贪婪探测逻辑：如果核心字段为空，翻遍所有 Key 找可能的备选
        const findInAllKeys = (keywords) => {
            return Object.entries(item).find(([k, v]) =>
                keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())) && v && typeof v === 'string'
            )?.[1] || '';
        };

        if (!normalized.title) normalized.title = findInAllKeys(['标题', '主题', '名称', '活动', 'title', 'header']);
        if (!normalized.venue) normalized.venue = findInAllKeys(['地点', '场所', '场地', '地址', 'location', 'venue', 'address', 'subtitle']);
        if (!normalized.date) normalized.date = findInAllKeys(['日期', '时间', '月份', 'date', 'time', 'calendar']);
        if (!normalized.price) normalized.price = findInAllKeys(['门票', '价格', '票价', '费用', 'price', 'ticket', 'fee']);

        // 确保必要的字段存在且格式正确，同时保留 item 原有字段作为极致兜底
        return {
            ...item, // 先解开原始数据，保留所有原始 Key
            id: item.id || Date.now() + Math.random(),
            title: normalized.title || item.title || '',
            venue: normalized.venue || item.venue || '',
            date: normalized.date || item.date || '',
            year: normalized.year || item.year || '2026',
            price: normalized.price || item.price || '',
            description: normalized.description || item.description || '',
            images: normalized.images || item.images || [],
            rawBlock: item.rawBlock || '' // 极致追溯：将原始解析块保留在节点数据中
        };
    };

    // 辅助函数: 为物品列表补全 Emoji (统一增强版)
    const applyEmojiToItems = (items) => {
        const iconMap = {
            date: '⏰', time: '⏰', 时间: '⏰', 日期: '⏰', Date: '⏰', Time: '⏰',
            subtitle: '📍', venue: '📍', location: '📍', 地点: '📍', 场所: '📍', 场地: '📍', 地址: '📍', Location: '📍', Address: '📍', address: '📍', Venue: '📍',
            price: '🎫', 门票: '🎫', 价格: '🎫', 费用: '🎫', Price: '🎫', Fee: '🎫',
            description: '✨', highlights: '✨', 亮点: '✨', 特色: '✨', 简介: '✨', 内容: '✨', Description: '✨', Highlights: '✨', Content: '✨'
        };
        return items.map(item => {
            const newItem = { ...item };
            const Helpers = window.MagnesComponents?.Utils?.ParseHelpers;
            for (const [key, icon] of Object.entries(iconMap)) {
                // 同时检查原始 Key 和归一化后的 Key
                const targetKey = newItem[key] ? key : (Helpers?.normalizeRole ? Helpers.normalizeRole(key) : key);
                if (newItem[targetKey] && typeof newItem[targetKey] === 'string') {
                    let val = newItem[targetKey].trim();
                    //移除所有可能的中文标题和符号前缀
                    val = val.replace(/^(时间|日期|地点|场所|场地|地址|价格|门票|票价|费用|亮点|特色|简介|介绍|文案|内容|标题)[:：\-—]\s*/, '');

                    // 检查是否已经有了任何 Emoji（防止重复叠加）
                    const alreadyHasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]/u.test(val.slice(0, 4));

                    if (val && !alreadyHasEmoji) {
                        newItem[targetKey] = `${icon} ${val}`;
                    } else {
                        newItem[targetKey] = val;
                    }
                }
            }
            return newItem;
        });
    };

    // 业务组件: 只负责内容，不带 BaseNode 标题栏
    const RednoteContentNode = ({ node, isSelected, updateNodeData, isInBulkMode: externalBulkMode, setIsBulkMode }) => {
        // 数据结构重构: 使用 items 数组存储多个活动内容
        const [items, setItems] = useState(node?.data?.items || [{
            id: Date.now(),
            title: '', venue: '', date: '', year: '2026', price: '', description: '', images: []
        }]);
        const [mainTitle, setMainTitle] = useState(node?.data?.mainTitle || '');
        const [activeIndex, setActiveIndex] = useState(0);
        const [isSyncing, setIsSyncing] = useState(false);
        const [isAnalyzing, setIsAnalyzing] = useState(false);
        const [isBulkMode, setInternalIsBulkMode] = useState(false);
        const [bulkText, setBulkText] = useState(node?.data?.bulkText || '');


        // 监听外部数据变更，确保从 Hook 传入的 items 能同步到本地 state
        useEffect(() => {
            if (node?.data?.items) {
                setItems(node.data.items);
            }
            if (node?.data?.bulkText !== undefined) {
                setBulkText(node.data.bulkText);
            }
            if (node?.data?.mainTitle !== undefined) {
                setMainTitle(node.data.mainTitle);
            }
        }, [node?.data?.lastUpdated, node?.data?.items]);

        // 自动导入逻辑：如果由对话触发且有内容，立即执行解析
        useEffect(() => {
            if (node?.data?.autoImport && bulkText.trim() && !isAnalyzing) {
                console.log('[ContentNode] 🚀 触发自动导入解析...');
                handleImport();
                // 清理标志，防止重复触发
                updateNodeData && updateNodeData({ autoImport: false });
            }
        }, [node?.data?.autoImport, bulkText]);

        // 允许外部受控
        const effectiveIsBulkMode = setIsBulkMode ? externalBulkMode : isBulkMode;
        const setMode = setIsBulkMode || setInternalIsBulkMode;

        const currentItem = items[activeIndex] || {};

        const updateItems = (newItems, currentActiveIdx, newMainTitle) => {
            const finalMainTitle = newMainTitle !== undefined ? newMainTitle : mainTitle;

            setItems(newItems);
            // 注入链路日志 (Node 1)
            console.log(`[Magnes Pulse: Node 1 -> Node 2] Updating items, mainTitle="${finalMainTitle}", firstItemTitle="${newItems[0]?.title}"`, {
                itemCount: newItems.length,
                ts: Date.now()
            });

            updateNodeData && updateNodeData({
                items: newItems,
                mainTitle: finalMainTitle,
                lastUpdated: Date.now()
            });
        };

        const updateCurrentItem = (newData) => {
            const newItems = [...items];
            newItems[activeIndex] = { ...newItems[activeIndex], ...newData };
            updateItems(newItems);
        };

        const handleGlobalAISplit = async () => {
            const allText = items.map(it => it.description || it.title).join('\n\n');
            if (!allText.trim()) return;
            const semanticService = window.MagnesComponents.Services.SemanticService;
            if (!semanticService) { console.error('SemanticService not found'); return; }

            setIsAnalyzing(true);
            try {
                let extractedItems = await semanticService.extractItems(allText);
                if (extractedItems.length === 0 && ParseHelpers) {
                    extractedItems = ParseHelpers.parseActivities(allText);
                }

                if (extractedItems.length > 0) {
                    let processedItems = extractedItems.map(it => normalizeItem(it));
                    if (node?.data?.useEmoji) {
                        processedItems = applyEmojiToItems(processedItems);
                    }
                    updateItems(processedItems);
                    setActiveIndex(0);
                    setMode(false);
                }
            } catch (err) {
                console.error('AI Split Error:', err);
            } finally {
                setIsAnalyzing(false);
            }
        };

        const itemsToText = (itemsList) => {
            return itemsList.filter(it => it.title || it.description).map(it => {
                let text = `${it.title || ''}\n`;
                if (it.venue) text += `地点: ${it.venue}\n`;
                if (it.date) text += `时间: ${it.date}\n`;
                if (it.price) text += `门票: ${it.price}\n`;
                if (it.description) text += `${it.description}\n`;
                return text;
            }).join('\n');
        };

        const handleAIItemOptimize = async () => {
            const contentToEdit = itemsToText(items);
            window.dispatchEvent(new CustomEvent('magnes:open_draft_for_edit', {
                detail: {
                    content: contentToEdit,
                    onConfirm: async (newContent, options) => {
                        setIsAnalyzing(true);
                        const semanticService = window.MagnesComponents.Services.SemanticService;
                        if (semanticService) {
                            try {
                                let extractedItems = await semanticService.extractItems(newContent);
                                if (extractedItems.length === 0 && ParseHelpers) {
                                    extractedItems = ParseHelpers.parseActivities(newContent);
                                }
                                if (extractedItems.length > 0) {
                                    const processedItems = extractedItems.map(it => normalizeItem(it));
                                    updateItems(processedItems);
                                    setActiveIndex(0);
                                }
                            } catch (err) {
                                console.error('AI Re-Extract Error:', err);
                                alert('优化失败，请检查网络');
                            } finally {
                                setIsAnalyzing(false);
                            }
                        }
                    }
                }
            }));
        };

        const performFeishuSync = async (url) => {
            const appTokenMatch = url.match(/bitable\/([^/?]+)/);
            const tableIdMatch = url.match(/table=([^&]+)/);
            if (!appTokenMatch || !tableIdMatch) {
                alert('请粘贴正确的飞书多维表格链接');
                return;
            }

            setIsSyncing(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const response = await API.magnesFetch('/mcp/call', {
                    method: 'POST',
                    body: JSON.stringify({
                        tool_name: 'mcp__lark-mcp__bitable_v1_appTableRecord_list',
                        arguments: {
                            path: { app_token: appTokenMatch[1], table_id: tableIdMatch[1] },
                            params: { page_size: 10 }
                        }
                    })
                });

                const data = await response.json();
                if (data.status === 'success' && data.result?.content) {
                    const newItems = data.result.content.map(c => {
                        const fields = JSON.parse(c.text).fields || {};
                        return {
                            id: Date.now() + Math.random(),
                            title: fields['标题'] || fields['Title'] || '',
                            venue: fields['地点'] || fields['场所'] || fields['Location'] || fields['Subtitle'] || fields['Venue'] || '',
                            date: fields['日期'] || fields['Date'] || '',
                            year: fields['年份'] || fields['Year'] || '2026',
                            price: fields['价格'] || fields['Price'] || '',
                            description: fields['简介'] || fields['Description'] || '',
                            images: []
                        };
                    });
                    if (newItems.length > 0) {
                        updateItems(newItems);
                        setActiveIndex(0);
                        setMode(false);
                        setBulkText('');
                    }
                }
            } catch (err) {
                console.error('Feishu Batch Sync Error:', err);
                alert('同步失败，请检查网络或链接权限');
            } finally {
                setIsSyncing(false);
            }
        };


        const handleImport = async () => {
            if (!bulkText.trim()) return;
            const isFeishuLink = bulkText.includes('feishu.cn') || bulkText.includes('bitable');
            if (isFeishuLink) {
                await performFeishuSync(bulkText.trim());
            } else {
                setIsAnalyzing(true);
                const semanticService = window.MagnesComponents.Services.SemanticService;
                if (semanticService) {
                    try {
                        let extractedItems = await semanticService.extractItems(bulkText);

                        // 兜底：如果语义提取失败，退回到正则解析
                        if ((!extractedItems || extractedItems.length === 0) && ParseHelpers) {
                            console.log('[ContentNode] ⚠️ AI 提取失败，退回到正则解析');
                            extractedItems = ParseHelpers.parseActivities(bulkText);
                        }

                        if (extractedItems && extractedItems.length > 0) {
                            let processedItems = extractedItems.map(it => normalizeItem(it));
                            if (node?.data?.useEmoji) {
                                processedItems = applyEmojiToItems(processedItems);
                            }
                            updateItems(processedItems);
                            setActiveIndex(0);
                            setMode(false);
                            setBulkText('');
                        }
                    } catch (err) {
                        console.error('AI Split Error:', err);
                    } finally {
                        setIsAnalyzing(false);
                    }
                }
            }
        };

        const addItem = () => {
            const newItem = {
                id: Date.now(),
                title: '', venue: '', date: '', year: '2026', price: '', description: '', images: []
            };
            updateItems([...items, newItem]);
            setActiveIndex(items.length);
            setMode(false);
        };

        const removeItem = (idx) => {
            if (items.length <= 1) return;
            const newItems = items.filter((_, i) => i !== idx);
            updateItems(newItems);
            setActiveIndex(Math.max(0, activeIndex - 1));
        };

        const handleImageUpload = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    // 使用函数式 setItems 确保始终基于最新 state，避免多文件异步闭包覆盖
                    setItems(prev => {
                        const newItems = [...prev];
                        const item = { ...newItems[activeIndex] };
                        item.images = [...(item.images || []), dataUrl];
                        newItems[activeIndex] = item;
                        // 同步上游数据
                        updateNodeData && updateNodeData({ items: newItems, mainTitle });
                        return newItems;
                    });
                };
                reader.readAsDataURL(file);
            });
        };

        return (
            <div className="flex flex-1 flex-col overflow-hidden relative">
                {!effectiveIsBulkMode && (
                    <div className="flex w-full items-center py-2 gap-2 bg-zinc-50 overflow-x-auto shrink-0 no-scrollbar">
                        <div className="flex gap-1.5 items-center">
                            {items.map((item, idx) => (
                                <div key={item.id}
                                    onClick={() => { setActiveIndex(idx); updateItems(items, idx); }}
                                    className={`w-8 h-8 border flex items-center justify-center cursor-pointer transition-all text-[11px] font-bold
                                            ${activeIndex === idx ? 'bg-black text-white border-black' : 'bg-white text-black border-zinc-200 hover:border-black'}`}>
                                    {idx + 1}
                                </div>
                            ))}
                            <button onClick={addItem} className="w-8 h-8 border border-zinc-200 flex items-center justify-center text-zinc-400 hover:border-black hover:text-black shrink-0" title="添加新项">
                                <AddIcon size={14} />
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col overflow-y-auto relative custom-scrollbar">
                    {isAnalyzing && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                            <div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin mb-4"></div>
                            <div className="text-[12px] font-black uppercase tracking-widest text-black mb-1">AI 正在解析活动列表</div>
                            <div className="text-[10px] text-zinc-400 font-bold">请稍候，正在提取标题、日期与地点...</div>
                        </div>
                    )}
                    {effectiveIsBulkMode ? (
                        <div className="flex flex-col flex-1">
                            <textarea
                                className="flex-1 w-full text-[12px] border border-black focus:outline-none bg-white leading-relaxed font-medium transition-all p-2 resize-none"
                                placeholder="在此粘贴包含多个活动的完整列表文案，或飞书多维表格链接..."
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                            />
                            <button
                                onClick={handleImport}
                                disabled={isAnalyzing || isSyncing || !bulkText.trim()}
                                className="w-full bg-black text-white py-3 text-[12px] font-black uppercase tracking-widest hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                            >
                                {isAnalyzing || isSyncing ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <SyncIcon size={14} className="animate-spin" />
                                        <span>处理中...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <Sparkles size={14} />
                                        <span>确认识别并导入</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-300">
                            {/* 文案编辑 */}
                            <div className="space-y-4">
                                <div className="space-y-1 mt-2">
                                    <label className="text-[12px] font-black uppercase tracking-tighter text-black">总标题</label>
                                    <input
                                        value={mainTitle}
                                        placeholder="例如：上海十一月市集..."
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setMainTitle(val);
                                            updateItems(items, activeIndex, val);
                                        }}
                                        className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none focus:bg-zinc-50 font-black bg-zinc-50"
                                    />
                                </div>

                                <div className="flex items-end mt-2 pt-2 border-t border-zinc-100">
                                    <label className="text-[12px] font-black uppercase tracking-tighter text-black">项信息 ({activeIndex + 1}/{items.length})</label>
                                </div>
                                <div className="space-y-1">
                                    <input value={currentItem.title} placeholder="活动标题..."
                                        onChange={(e) => updateCurrentItem({ title: e.target.value })}
                                        className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none focus:bg-zinc-50 font-bold" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <input
                                            value={currentItem.venue || currentItem.location || currentItem.address || currentItem.subtitle || currentItem['地点'] || currentItem['场所'] || currentItem['地址'] || currentItem['场地'] || currentItem['地点:'] || currentItem['地点：'] || ''}
                                            placeholder="活动地点..."
                                            onChange={(e) => updateCurrentItem({ venue: e.target.value })}
                                            className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none focus:bg-zinc-50" />
                                    </div>
                                    <div className="space-y-1">
                                        <input
                                            value={currentItem.date || currentItem.time || currentItem['时间'] || currentItem['日期'] || currentItem['时间:'] || currentItem['时间：'] || ''}
                                            placeholder="日期 (MM.DD)" onChange={(e) => updateCurrentItem({ date: e.target.value })}
                                            className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <input value={currentItem.year || '2026'} placeholder="年份 (如 2025)" onChange={(e) => updateCurrentItem({ year: e.target.value })}
                                            className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <input
                                            value={currentItem.price || currentItem.ticket || currentItem.fee || currentItem.cost || currentItem['门票'] || currentItem['价格'] || currentItem['票价'] || currentItem['费用'] || currentItem['门票:'] || currentItem['门票：'] || ''}
                                            placeholder="价格 (如 40元)" onChange={(e) => updateCurrentItem({ price: e.target.value })}
                                            className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <textarea value={currentItem.description} placeholder="活动详情简介..."
                                        onChange={(e) => updateCurrentItem({ description: e.target.value })}
                                        className="w-full px-2 py-3 text-[12px] border border-black focus:outline-none h-32 leading-relaxed" />
                                </div>

                                {/* 诊断级调试面板: 揭示解析过程真相 */}
                                <div className="mt-4 p-3 bg-zinc-900 text-zinc-300 rounded-lg overflow-hidden border border-zinc-700 shadow-xl">
                                    <div className="text-[10px] font-bold text-indigo-400 mb-2 flex items-center gap-2 border-b border-zinc-800 pb-1">
                                        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                                        <span>DIAGNOSTIC ENGINE v2.1 ({currentItem.rawBlock && !currentItem.rawBlock.includes('AI') ? 'Regex-First' : 'Hybrid-Mode'})</span>
                                    </div>

                                    <div className="mb-3">
                                        <div className="text-[8px] uppercase text-zinc-500 mb-1">Raw Extraction Material (此项对应的原始素材)</div>
                                        <div className="bg-zinc-800 p-2 text-[10px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto rounded text-white leading-tight">
                                            {currentItem.rawBlock || "⚠️ No raw source linked. Fallback mode active."}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <div className="text-[8px] uppercase text-zinc-500 mb-1">Venue State</div>
                                            <div className={`text-[10px] font-black ${currentItem.venue ? 'text-green-400' : 'text-rose-500 underline'}`}>
                                                {currentItem.venue || "[MISSING: 没读到地点]"}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[8px] uppercase text-zinc-500 mb-1">Price State</div>
                                            <div className={`text-[10px] font-black ${currentItem.price ? 'text-green-400' : 'text-rose-500 underline'}`}>
                                                {currentItem.price || "[FREE or MISSING]"}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-[8px] text-zinc-600 mt-2 italic flex justify-between">
                                        <span>If source looks wrong, check the original text feed.</span>
                                        <span>Index: {activeIndex + 1}/{items.length}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 图片管理 */}
                            <div className="space-y-1 my-4">
                                <label className="text-[12px] font-black uppercase tracking-tighter text-black">活动图片</label>
                                <div className="grid grid-cols-3 gap-4">
                                    <label className="aspect-square border border-black flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-zinc-50 transition-all group">
                                        <input type="file" multiple className="hidden" onChange={handleImageUpload} />
                                        <ImageIcon size={32} strokeWidth={1} className="text-black transition-colors" />
                                        <span className="text-[12px] text-black font-black uppercase tracking-tighter">上传图片</span>
                                    </label>
                                    {(currentItem.images || []).map((img, i) => (
                                        <div key={i} className="aspect-square border border-black relative group overflow-hidden">
                                            <img src={img} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <button onClick={() => {
                                                    const newImgs = currentItem.images.filter((_, idx) => idx !== i);
                                                    updateCurrentItem({ images: newImgs });
                                                }} className="bg-white p-2 hover:bg-red-500 hover:text-white transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {!effectiveIsBulkMode && (
                    <div className="flex -space-x-[1px] mt-auto shrink-0 animate-in slide-in-from-bottom duration-300">
                        <button onClick={handleAIItemOptimize}
                            className="flex-1 flex items-center justify-center gap-2 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white active:scale-[0.98]">
                            <MagicIcon size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
                            <span>AI 智能优化</span>
                        </button>
                        <button onClick={() => removeItem(activeIndex)}
                            className="flex-1 flex items-center justify-center gap-2 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white active:scale-[0.98]">
                            <Trash2 size={14} />
                            <span>删除此项</span>
                        </button>
                    </div>
                )
                }
            </div >
        );
    };


    window.MagnesComponents.Nodes.Rednote = window.MagnesComponents.Nodes.Rednote || {};
    window.MagnesComponents.Nodes.Rednote.ContentNode = RednoteContentNode;
    window.RednoteContentNode = RednoteContentNode;
    console.log('✅ Batch Content Node (JSX) Registered');
})();
