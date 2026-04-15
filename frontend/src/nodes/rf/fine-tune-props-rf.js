/**
 * FineTunePropsNode - 精细编辑属性面板 (附属节点)
 * 路径: src/nodes/rf/fine-tune-props-rf.js
 */

(function () {
    const { React } = window;
    const { useState, useCallback, useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow, useNodes } = ReactFlow;

    const FineTunePropsNode = ({ id, data, selected }) => {
        const MAGNES = window.MagnesComponents || {};
        const UI = MAGNES.UI || {};
        const Icons = UI.Icons || UI.LucideIcons || {};
        const BaseNode = MAGNES.Nodes?.BaseNode;

        // 所有 Hooks 必须在任何条件之前调用
        const { setNodes } = useReactFlow();
        const nodes = useNodes();
        const fileInputRef = React.useRef(null);

        // 状态 Hooks
        const [mode, setMode] = useState('global');
        const [showGenPanel, setShowGenPanel] = useState(false);
        const [genPrompt, setGenPrompt] = useState('');
        const [isGenerating, setIsGenerating] = useState(false);
        const [useReferenceImage, setUseReferenceImage] = useState(false);

        const parentId = data.parentId;
        const parentNode = useMemo(() => nodes.find(n => n.id === parentId), [nodes, parentId]);

        // 条件渲染放在所有 Hooks 之后
        if (!BaseNode || !parentNode) {
            return null;
        }

        const parentData = parentNode.data || {};
        const currentPage = parentData.currentPage || 0;
        const activeLayerIdx = parentData.activeLayerIdx || 0;

        // --- 数据鲁棒性优化：多优先级获取图层 ---
        const layers = useMemo(() => {
            const rawLayers = parentData.computedLayers || parentData.content?.layers || parentData.layoutData?.layers || [];
            return rawLayers.map(l => ({ ...l }));
        }, [parentData.computedLayers, parentData.content?.layers, parentData.layoutData?.layers]);

        const activeLayer = layers[activeLayerIdx];

        // 历史记录管理 (撤销/重做)
        const historyStackRef = React.useRef([]);
        const historyIndexRef = React.useRef(-1);
        const MAX_HISTORY_SIZE = 50;
        const isUndoingRef = React.useRef(false);

        // 保存当前状态到历史栈
        const saveToHistory = React.useCallback(() => {
            if (isUndoingRef.current) return;
            if (!layers || layers.length === 0) return;

            const currentState = {
                layers: JSON.parse(JSON.stringify(layers)),
                timestamp: Date.now()
            };

            if (historyIndexRef.current < historyStackRef.current.length - 1) {
                historyStackRef.current = historyStackRef.current.slice(0, historyIndexRef.current + 1);
            }

            historyStackRef.current.push(currentState);
            historyIndexRef.current++;

            if (historyStackRef.current.length > MAX_HISTORY_SIZE) {
                historyStackRef.current.shift();
                historyIndexRef.current--;
            }
        }, [layers]);

        // 撤销操作
        const undo = React.useCallback(() => {
            if (historyIndexRef.current <= 0) {
                console.log('[FineTuneProps] 没有可撤销的历史');
                return;
            }

            isUndoingRef.current = true;
            historyIndexRef.current--;
            const previousState = historyStackRef.current[historyIndexRef.current];

            setNodes(nds => nds.map(n => {
                if (n.id !== parentId) return n;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        isDirty: true,
                        content: { ...n.data.content, layers: previousState.layers }
                    }
                };
            }));

            setTimeout(() => {
                isUndoingRef.current = false;
            }, 0);
        }, [parentId, setNodes]);

        // 重做操作
        const redo = React.useCallback(() => {
            if (historyIndexRef.current >= historyStackRef.current.length - 1) {
                console.log('[FineTuneProps] 没有可重做的历史');
                return;
            }

            isUndoingRef.current = true;
            historyIndexRef.current++;
            const nextState = historyStackRef.current[historyIndexRef.current];

            setNodes(nds => nds.map(n => {
                if (n.id !== parentId) return n;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        isDirty: true,
                        content: { ...n.data.content, layers: nextState.layers }
                    }
                };
            }));

            setTimeout(() => {
                isUndoingRef.current = false;
            }, 0);
        }, [parentId, setNodes]);

        // 初始化历史记录
        React.useEffect(() => {
            if (layers.length > 0 && historyStackRef.current.length === 0) {
                historyStackRef.current = [{
                    layers: JSON.parse(JSON.stringify(layers)),
                    timestamp: Date.now()
                }];
                historyIndexRef.current = 0;
            }
        }, [layers]);

        // 键盘事件监听
        React.useEffect(() => {
            const handleKeyDown = (e) => {
                const isPanelSelected = nodes.some(n => n.id === id && n.selected);
                if (!isPanelSelected) return;

                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }

                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' || e.key === 'Z') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            redo();
                        } else {
                            undo();
                        }
                    } else if (e.key === 'y' || e.key === 'Y') {
                        e.preventDefault();
                        redo();
                    }
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [id, nodes, undo, redo]);

        if (!parentNode) {
            return React.createElement(BaseNode, { id, title: '属性面板', icon: Icons.Settings, style: { width: '280px' } },
                React.createElement('div', { className: 'p-4 text-center text-zinc-400 text-[10px]' }, '未找到关联的编辑节点')
            );
        }

        const { LayoutGrid, Layers, Type, ImageIcon, Palette, RefreshCw, Save, Wand2, Trash2, ChevronLeft, ChevronRight, Check, Copy, Upload } = Icons;

        // --- 数据更新逻辑 ---
        const updateParentData = useCallback((updates) => {
            // 保存历史记录（排除仅更新 overrides 的操作，避免过多历史记录）
            if (updates.layerUpdate || updates.content) {
                saveToHistory();
            }

            setNodes(nds => nds.map(n => {
                if (n.id !== parentId) return n;

                let nextData = { ...n.data, ...updates };

                // 如果是修改了图层属性，需要根据当前模式决定是覆盖全局还是写入单页
                if (updates.layerUpdate) {
                    const { layerId, changes } = updates.layerUpdate;

                    if (mode === 'global') {
                        // 全局模式：直接修改 data.content.layers
                        const nextLayers = (n.data.content?.layers || []).map(l =>
                            l.id === layerId ? { ...l, ...changes } : l
                        );
                        nextData.content = { ...n.data.content, layers: nextLayers };
                        nextData.isDirty = true;
                    } else {
                        // 仅本页模式：写入 data.pageOverrides[currentPage]
                        const overrides = n.data.pageOverrides || {};
                        const pageData = overrides[currentPage] || { layers: [] };
                        const pageLayers = [...pageData.layers];

                        const existingIdx = pageLayers.findIndex(l => l.id === layerId);
                        if (existingIdx >= 0) {
                            pageLayers[existingIdx] = { ...pageLayers[existingIdx], ...changes };
                        } else {
                            // 如果该页还没覆写过该图层，从全局图层中拿基础属性再合并
                            const baseLayer = (n.data.content?.layers || []).find(l => l.id === layerId);
                            pageLayers.push({ id: layerId, ...(baseLayer || {}), ...changes });
                        }

                        nextData.pageOverrides = {
                            ...overrides,
                            [currentPage]: { ...pageData, layers: pageLayers }
                        };
                    }
                }

                return { ...n, data: nextData };
            }));
        }, [parentId, setNodes, mode, currentPage]);



        // --- 本地上传背景图 ---
        const handleLocalUpload = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                const bgLayer = layers.find(l =>
                    l.role?.includes('background') ||
                    l.role?.includes('reference') ||
                    l.id?.includes('background') ||
                    l.type === 'background' ||
                    l.isPlaceholder
                );
                if (bgLayer) {
                    updateParentData({
                        layerUpdate: {
                            layerId: bgLayer.id,
                            changes: { url: dataUrl }
                        }
                    });
                }
            };
            reader.readAsDataURL(file);
        };

        // --- 切换到侧边栏素材库 ---
        const openSidebarAssets = useCallback(() => {
            console.log('[FineProps] 📁 素材库按钮点击');
            const bgLayer = layers.find(l =>
                l.role?.includes('background') ||
                l.role?.includes('reference') ||
                l.id?.includes('background') ||
                l.type === 'background' ||
                l.isPlaceholder
            );

            if (!bgLayer) {
                console.warn('[FineProps] ⚠️ 未检测到背景图层，无法打开素材库');
                // 可选：显示一个提示告诉用户需要先添加背景图层
                window.dispatchEvent(new CustomEvent('magnes:show_toast', {
                    detail: { message: '请先添加背景图层', type: 'warning' }
                }));
                return;
            }

            console.log('[FineProps] ✅ 找到背景图层:', bgLayer.id);

            window.dispatchEvent(new CustomEvent('magnes:switch_ext_tab', {
                detail: {
                    tab: 'assets',
                    context: {
                        targetNodeId: parentId,
                        targetLayerId: bgLayer.id
                    }
                }
            }));
        }, [parentId, layers]);

        // 获取当前背景图URL
        const currentBgUrl = layers.find(l =>
            l.role?.includes('background') ||
            l.role?.includes('reference') ||
            l.id?.includes('background') ||
            l.type === 'background' ||
            l.isPlaceholder
        )?.url || '';

        // --- AI 背景生成 ---
        const handleAIBackground = async () => {
            if (!genPrompt) return;
            setIsGenerating(true);
            try {
                const API = window.MagnesComponents.Utils.API;
                const payload = {
                    prompt: genPrompt,
                    aspect_ratio: '3:4',
                    reference_image: useReferenceImage ? currentBgUrl : null, // 传递参考图
                    reference_mode: useReferenceImage ? 'img2img' : 'txt2img'  // 生成模式
                };
                const resp = await API.magnesFetch('/painter/generate/background', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (resp.ok) {
                    const result = await resp.json();
                    const bgUrl = result.url;

                    // 使用函数式更新确保获取最新的图层数据
                    setNodes(nds => {
                        const parentNode = nds.find(n => n.id === parentId);
                        if (!parentNode) return nds;

                        const currentLayers = parentNode.data?.content?.layers || [];
                        const bgLayer = currentLayers.find(l =>
                            l.type === 'background' ||
                            l.id?.includes('background') ||
                            l.role?.includes('background')
                        );

                        if (!bgLayer) {
                            console.warn('[FineTuneProps] ⚠️ 未找到背景图层');
                            return nds;
                        }

                        console.log('[FineTuneProps] ✅ 更新背景图层:', bgLayer.id, 'URL:', bgUrl);

                        const nextLayers = currentLayers.map(l =>
                            l.id === bgLayer.id ? { ...l, url: bgUrl } : l
                        );

                        return nds.map(n => {
                            if (n.id !== parentId) return n;
                            return {
                                ...n,
                                data: {
                                    ...n.data,
                                    isDirty: true,
                                    content: { ...n.data.content, layers: nextLayers }
                                }
                            };
                        });
                    });
                    setGenPrompt('');
                }
            } catch (e) {
                console.error('[FineTuneProps] AI Gen failed:', e);
            } finally {
                setIsGenerating(false);
            }
        };

        const updateActiveLayerStyle = (changes) => {
            if (!activeLayer) return;
            updateParentData({
                layerUpdate: {
                    layerId: activeLayer.id,
                    changes: { style: { ...(activeLayer.style || {}), ...changes } }
                }
            });
        };

        const textLayerForPanel = (activeLayer?.type === 'text' || activeLayer?.role === 'text')
            ? activeLayer
            : layers.find(l => l.type === 'text' || l.role === 'text');

        const updateTextStyle = (changes) => {
            if (!textLayerForPanel) return;
            updateParentData({
                layerUpdate: {
                    layerId: textLayerForPanel.id,
                    changes: { style: { ...(textLayerForPanel.style || {}), ...changes } }
                }
            });
        };

        // --- 渲染 UI ---
        return React.createElement(BaseNode, {
            id,
            title: "排版属性",
            icon: Palette,
            selected,
            style: { width: '280px' },
            headerExtra: React.createElement('div', { className: 'flex gap-1' }, [
                React.createElement('button', {
                    key: 'global',
                    onClick: () => setMode('global'),
                    className: `px-2 py-0.5 text-[12px] font-black border border-black ${mode === 'global' ? 'bg-black text-white' : 'bg-white text-zinc-400'}`
                }, '全局'),
                React.createElement('button', {
                    key: 'page',
                    onClick: () => setMode('page'),
                    className: `px-2 py-0.5 text-[12px] font-black border border-black ${mode === 'page' ? 'bg-black text-white' : 'bg-white text-zinc-400'}`
                }, '仅当页')
            ])
        }, [
            React.createElement('div', { className: 'flex flex-col gap-5 p-1', key: 'content' }, [

                // 1. 状态提示
                React.createElement('div', { className: 'flex items-center justify-between text-[10px] font-bold uppercase tracking-widest', key: 'status' }, [
                    React.createElement('span', { className: 'text-zinc-500' }, `第 ${currentPage + 1} 页`),
                    mode === 'page' && React.createElement('span', { className: 'text-black flex items-center gap-1' }, [
                        (Wand2 || (() => null)) && React.createElement(Wand2 || 'span', { size: 10 }),
                        '局部覆写模式'
                    ]),
                ]),

                // 2. 背景图区块
                React.createElement('div', { className: 'flex flex-col gap-2', key: 'bg-section' }, [
                    React.createElement('div', { className: 'flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-100 pb-1' }, [
                        (ImageIcon || (() => null)) && React.createElement(ImageIcon || 'span', { size: 12 }),
                        '背景设置'
                    ]),
                    React.createElement('div', {
                        className: 'aspect-video bg-zinc-50 border border-zinc-100 overflow-hidden relative group cursor-pointer',
                        onClick: () => fileInputRef.current?.click()
                    }, [
                        layers.find(l => l.role?.includes('background') || l.role?.includes('reference') || l.id?.includes('background') || l.type === 'background' || l.isPlaceholder)?.url ?
                            React.createElement('img', { src: layers.find(l => l.role?.includes('background') || l.role?.includes('reference') || l.id?.includes('background') || l.type === 'background' || l.isPlaceholder).url, className: 'w-full h-full object-contain' }) :
                            React.createElement('div', { className: 'w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-1' }, [
                                (Upload || (() => null)) && React.createElement(Upload || 'span', { size: 24, strokeWidth: 1 }),
                                React.createElement('span', { className: 'text-[9px] uppercase' }, '暂无背景')
                            ]),
                        React.createElement('div', { className: 'absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center' },
                            React.createElement('span', { className: 'text-white text-[10px] font-black opacity-0 group-hover:opacity-100' }, '本地上传背景图')
                        ),
                        React.createElement('input', {
                            type: 'file',
                            ref: fileInputRef,
                            className: 'hidden',
                            accept: 'image/*',
                            onChange: handleLocalUpload
                        })
                    ]),
                    React.createElement('div', { className: 'flex gap-2' }, [
                        React.createElement('button', {
                            onClick: openSidebarAssets,
                            className: 'flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase'
                        }, [
                            (Save || (() => null)) && React.createElement(Save || 'span', { size: 12 }),
                            '素材库'
                        ]),
                        React.createElement('button', {
                            onClick: () => { setShowGenPanel(!showGenPanel); if (!showGenPanel) setGenPrompt(''); },
                            className: 'flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase'
                        }, [
                            (Wand2 || (() => null)) && React.createElement(Wand2 || 'span', { size: 12 }),
                            showGenPanel ? '收起>' : 'AI 生成'
                        ])
                    ]),
                    showGenPanel && React.createElement('div', { className: 'flex flex-col gap-2 bg-zinc-50 border border-zinc-100 mt-1 p-2' }, [
                        // 参考图选择区域
                        currentBgUrl && React.createElement('div', { className: 'flex flex-col gap-1.5' }, [
                            React.createElement('div', { className: 'flex items-center justify-between' }, [
                                React.createElement('span', { className: 'text-[9px] text-zinc-400 font-black uppercase' }, '优化模式'),
                                React.createElement('button', {
                                    onClick: () => setUseReferenceImage(!useReferenceImage),
                                    className: `flex items-center gap-1.5 px-2 py-1 text-[9px] font-black border transition-all ${useReferenceImage ? 'bg-black text-white border-black' : 'bg-white text-zinc-500 border-zinc-200'}`
                                }, [
                                    useReferenceImage ? '✓ 基于背景图优化' : '☐ 基于背景图优化'
                                ])
                            ]),
                        ]),
                        // 提示词输入
                        React.createElement('textarea', {
                            value: genPrompt,
                            onChange: (e) => setGenPrompt(e.target.value),
                            placeholder: useReferenceImage ? '描述想要如何修改背景...' : '输入背景生成描述词...',
                            className: 'w-full h-16 p-2 text-[11px] bg-white border border-zinc-200 outline-none focus:border-black'
                        }),
                        // 生成按钮
                        React.createElement('button', {
                            onClick: handleAIBackground,
                            disabled: isGenerating,
                            className: `py-1.5 bg-black text-white text-[10px] font-black uppercase tracking-widest ${isGenerating ? 'opacity-50' : 'hover:bg-zinc-800'}`
                        }, isGenerating ? '正在生成背景中...' : (useReferenceImage ? '基于背景图生成' : '开始生成'))
                    ])
                ]),

                // 3. 文字样式区
                textLayerForPanel && React.createElement('div', { className: 'flex flex-col gap-3', key: 'text-section' }, [
                    React.createElement('div', { className: 'flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-100 pb-1' }, [
                        (Type || (() => null)) && React.createElement(Type || 'span', { size: 12 }),
                        '文字设置'
                    ]),
                    // A. 字体选择
                    React.createElement('div', { className: 'flex flex-col gap-1.5' }, [
                        React.createElement('span', { className: 'text-[9px] text-zinc-400 font-black uppercase' }, '字体库'),
                        React.createElement('select', {
                            className: 'w-full h-8 px-2 border-b border-black text-[10px] font-bold outline-none bg-white',
                            value: textLayerForPanel.style?.fontFamily || 'PingFang SC',
                            onChange: (e) => updateTextStyle({ fontFamily: e.target.value })
                        }, [
                            React.createElement('option', { value: 'PingFang SC' }, '苹方 (PingFang)'),
                            React.createElement('option', { value: 'JetBrains Mono' }, '代码 (JetBrains)'),
                            React.createElement('option', { value: 'Outfit' }, '潮流 (Outfit)'),
                            React.createElement('option', { value: 'system-ui' }, '系统默认')
                        ])
                    ]),
                    // B. 字体样式：字号、加粗、斜体、下划线（一行显示）
                    React.createElement('div', { className: 'flex flex-col gap-1.5' }, [
                        React.createElement('span', { className: 'text-[9px] text-zinc-400 font-black uppercase' }, '字体样式'),
                        React.createElement('div', { className: 'flex items-center gap-2' }, [
                            // 字号
                            React.createElement('div', { className: 'flex items-center border border-black', style: { width: '90px' } }, [
                                React.createElement('button', {
                                    onClick: () => updateTextStyle({ fontSize: (parseInt(textLayerForPanel.style?.fontSize) || 40) - 2 }),
                                    className: 'w-6 h-7 hover:bg-zinc-100 text-[11px] font-bold outline-none'
                                }, '-'),
                                React.createElement('span', { className: 'flex-1 text-center text-[10px] font-black' }, textLayerForPanel.style?.fontSize || 40),
                                React.createElement('button', {
                                    onClick: () => updateTextStyle({ fontSize: (parseInt(textLayerForPanel.style?.fontSize) || 40) + 2 }),
                                    className: 'w-6 h-7 hover:bg-zinc-100 text-[11px] font-bold outline-none'
                                }, '+')
                            ]),
                            // 加粗
                            React.createElement('button', {
                                onClick: () => {
                                    const currentWeight = textLayerForPanel.style?.fontWeight || 'bold';
                                    const nextWeight = (currentWeight === 'bold' || currentWeight === 'black') ? 'normal' : 'bold';
                                    updateTextStyle({ fontWeight: nextWeight });
                                },
                                className: `w-7 h-7 border border-black text-[12px] font-black transition-colors flex items-center justify-center ${(textLayerForPanel.style?.fontWeight === 'bold' || textLayerForPanel.style?.fontWeight === 'black') ? 'bg-black text-white' : 'bg-white text-black'}`
                            }, 'B'),
                            // 斜体
                            React.createElement('button', {
                                onClick: () => {
                                    const currentStyle = textLayerForPanel.style?.fontStyle || 'normal';
                                    const nextStyle = currentStyle === 'italic' ? 'normal' : 'italic';
                                    updateTextStyle({ fontStyle: nextStyle });
                                },
                                className: `w-7 h-7 border border-black text-[12px] font-black italic transition-colors flex items-center justify-center ${textLayerForPanel.style?.fontStyle === 'italic' ? 'bg-black text-white' : 'bg-white text-black'}`
                            }, 'I'),
                            // 下划线
                            React.createElement('button', {
                                onClick: () => {
                                    const currentDecoration = textLayerForPanel.style?.textDecoration || 'none';
                                    const nextDecoration = currentDecoration === 'underline' ? 'none' : 'underline';
                                    updateTextStyle({ textDecoration: nextDecoration });
                                },
                                className: `w-7 h-7 border border-black text-[12px] font-black transition-colors flex items-center justify-center ${textLayerForPanel.style?.textDecoration === 'underline' ? 'bg-black text-white' : 'bg-white text-black'}`,
                                style: { textDecoration: textLayerForPanel.style?.textDecoration === 'underline' ? 'underline' : 'none' }
                            }, 'U')
                        ])
                    ]),
                    // C. 颜色选择器：图上已有颜色 + 常用色 + 自定义
                    React.createElement('div', { className: 'flex flex-col gap-2' }, [
                        React.createElement('span', { className: 'text-[9px] text-zinc-400 font-black uppercase' }, '文本颜色'),
                        // 颜色方块区域
                        React.createElement('div', { className: 'flex items-center gap-2 flex-wrap' }, [
                            // 图上已有的颜色（从所有文字图层提取）
                            React.createElement('div', { className: 'flex items-center gap-1' },
                                layers
                                    .filter(l => l.type === 'text' && l.style?.color)
                                    .map(l => l.style.color)
                                    .filter((c, i, arr) => arr.indexOf(c) === i) // 去重
                                    .slice(0, 4) // 最多显示4个
                                    .map((color, idx) => React.createElement('button', {
                                        key: `existing-${idx}`,
                                        onClick: () => updateTextStyle({ color }),
                                        className: `w-6 h-6 border ${textLayerForPanel.style?.color === color ? 'border-black ring-1 ring-black' : 'border-zinc-300'}`,
                                        style: { backgroundColor: color },
                                        title: `图上颜色: ${color}`
                                    }))
                            ),
                            // 分隔线（如果已有图上颜色）
                            layers.some(l => l.type === 'text' && l.style?.color) && React.createElement('div', {
                                className: 'w-px h-6 bg-zinc-200 mx-1'
                            }),
                            // 常用颜色：黑、白、红
                            React.createElement('button', {
                                onClick: () => updateTextStyle({ color: '#000000' }),
                                className: `w-6 h-6 border ${textLayerForPanel.style?.color === '#000000' ? 'border-black ring-1 ring-black' : 'border-zinc-300'}`,
                                style: { backgroundColor: '#000000' },
                                title: '黑色'
                            }),
                            React.createElement('button', {
                                onClick: () => updateTextStyle({ color: '#FFFFFF' }),
                                className: `w-6 h-6 border ${textLayerForPanel.style?.color === '#FFFFFF' ? 'border-black ring-1 ring-black' : 'border-zinc-300'}`,
                                style: { backgroundColor: '#FFFFFF' },
                                title: '白色'
                            }),
                            React.createElement('button', {
                                onClick: () => updateTextStyle({ color: '#FF2442' }),
                                className: `w-6 h-6 border ${textLayerForPanel.style?.color === '#FF2442' ? 'border-black ring-1 ring-black' : 'border-zinc-300'}`,
                                style: { backgroundColor: '#FF2442' },
                                title: '红色'
                            }),
                            // 七彩任意色选择器
                            React.createElement('div', { className: 'relative w-6 h-6 overflow-hidden border border-zinc-300 cursor-pointer', title: '自定义颜色' }, [
                                // 七彩背景
                                React.createElement('div', {
                                    className: 'absolute inset-0',
                                    style: {
                                        background: 'linear-gradient(135deg, #ff0000 0%, #ff7f00 14%, #ffff00 28%, #00ff00 42%, #0000ff 56%, #4b0082 70%, #9400d3 84%, #ff1493 100%)'
                                    }
                                }),
                                React.createElement('input', {
                                    type: 'color',

                                    value: textLayerForPanel.style?.color || '#000000',
                                    onChange: (e) => updateTextStyle({ color: e.target.value }),
                                    className: 'absolute inset-0 opacity-0 cursor-pointer w-full h-full'
                                })
                            ])
                        ])
                    ]),
                    // D. 图层操作：复制 + 删除
                    React.createElement('div', { className: 'flex gap-2 mt-2 pt-2 border-t border-zinc-100' }, [
                        // 复制图层按钮
                        React.createElement('button', {
                            onClick: () => {
                                if (!textLayerForPanel) return;
                                const newLayer = {
                                    ...textLayerForPanel,
                                    id: `${textLayerForPanel.id}-copy-${Date.now()}`,
                                    content: `${textLayerForPanel.content || textLayerForPanel.text || ''} (复制)`,
                                    text: `${textLayerForPanel.text || textLayerForPanel.content || ''} (复制)`,
                                    bbox: [
                                        (textLayerForPanel.bbox?.[0] || 0) + 20,
                                        (textLayerForPanel.bbox?.[1] || 0) + 20,
                                        textLayerForPanel.bbox?.[2] || 200,
                                        textLayerForPanel.bbox?.[3] || 100
                                    ]
                                };
                                const newLayers = [...layers, newLayer];
                                updateParentData({
                                    content: { ...parentData.content, layers: newLayers }
                                });
                            },
                            className: 'flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase'
                        }, [
                            (Copy || (() => null)) && React.createElement(Copy || 'span', { size: 10 }),
                            '复制图层'
                        ]),
                        // 删除图层按钮
                        React.createElement('button', {
                            onClick: () => {
                                if (!confirm('确定要删除这个文字图层吗？')) return;
                                const newLayers = layers.filter(l => l.id !== textLayerForPanel.id);
                                updateParentData({
                                    content: { ...parentData.content, layers: newLayers },
                                    activeLayerIdx: 0 // 重置选中到背景
                                });
                            },
                            className: 'flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase'
                        }, [
                            (Trash2 || (() => null)) && React.createElement(Trash2 || 'span', { size: 10 }),
                            '删除图层'
                        ])
                    ])
                ]),

                // 4. 图层列表
                /*
                React.createElement('div', { className: 'flex flex-col gap-2', key: 'layer-section' }, [
                    React.createElement('div', { className: 'flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-100 pb-1' }, [
                        (Layers || (() => null)) && React.createElement(Layers || 'span', { size: 12 }),
                        '图层控制'
                    ]),
                    React.createElement('div', { className: 'max-h-[120px] overflow-y-auto pr-1' },
                        layers.map((l, i) => React.createElement('div', {
                            key: l.id,
                            className: `flex items-center justify-between px-2 py-1.5 mb-1 text-[10px] font-bold border ${activeLayerIdx === i ? 'bg-black text-white border-black' : 'bg-zinc-50 text-zinc-500 border-zinc-100'}`
                        }, [
                            React.createElement('div', { className: 'flex flex-col' }, [
                                React.createElement('span', { className: 'truncate max-w-[140px]' }, l.semanticRole || l.id),
                                React.createElement('span', { className: 'text-[8px] opacity-50 font-mono mt-0.5' }, `POS: {${Math.round(l.x || 0)}, ${Math.round(l.y || 0)}}`)
                            ]),
                            React.createElement('button', {
                                onClick: (e) => {
                                    e.stopPropagation();
                                    updateParentData({ layerUpdate: { layerId: l.id, changes: { isHidden: !l.isHidden } } });
                                },
                                className: 'hover:text-zinc-300'
                            }, l.isHidden ? '隐藏' : '显示')
                        ]))
                    )
                ]),
                */


            ])
        ]);
    };

    window.MagnesComponents.Nodes.FineTunePropsNodeRF = FineTunePropsNode;
    console.log('✅ FineTunePropsNodeRF (Enhanced) Loaded');
})();
