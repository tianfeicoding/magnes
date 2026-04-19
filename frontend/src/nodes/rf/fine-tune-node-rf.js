(function () {
    const { React } = window;
    const { useMemo } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useEdges, useNodes, useReactFlow } = ReactFlow;

    const FineTuneNode = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();

        // 动态获取依赖，防止闭包捕获旧的或未加载的对象
        const MAGNES = window.MagnesComponents || {};
        const UI = MAGNES.UI || {};
        const Icons = UI.Icons || UI.LucideIcons || {};
        const { MousePointer2, ExternalLink, Sliders, Trash2: Trash, Check, ChevronDown, Copy, Plus, Type, Image: ImageIcon } = Icons;
        const BaseNode = MAGNES.Nodes?.BaseNode;

        // 统一解析图片 URL：相对路径补全为后端绝对路径
        const resolveImageUrl = (url) => {
            if (!url) return '';
            if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
            if (url.startsWith('/')) {
                const apiBase = MAGNES.Utils?.Constants?.MAGNES_API_URL || '';
                const host = apiBase ? apiBase.replace('/api/v1', '') : (window.location.protocol === 'file:' ? 'http://localhost:8088' : `http://${window.location.host}`);
                return `${host}${url}`;
            }
            return url;
        };

        // 辅助函数：克隆画布并将图片内联为 base64，避免 html-to-image 的 CORS/缓存问题影响原始 DOM
        const cloneCanvasForExport = (canvasElement) => {
            const wrapper = document.createElement('div');
            // 把隐藏样式放在 wrapper 上，避免 html-to-image 序列化时把 off-screen 样式带入 SVG
            wrapper.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointerEvents:none;zIndex:-9999;overflow:hidden;';

            const clone = canvasElement.cloneNode(true);
            clone.style.position = 'static';
            clone.style.width = canvasElement.offsetWidth + 'px';
            clone.style.height = canvasElement.offsetHeight + 'px';
            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            // [Purification] 移除克隆节点中的选中样式和辅助 UI
            // 1. 移除选中边框 (boxShadow)
            const layerElements = clone.querySelectorAll('[style*="box-shadow"]');
            layerElements.forEach(el => {
                if (el.style.boxShadow.includes('0 0 0 1px')) {
                    el.style.boxShadow = 'none';
                }
            });

            // 2. 移除所有的 ResizeHandles (那些 8x8 的白色小块)
            const handles = clone.querySelectorAll('div[style*="width: 8px"][style*="height: 8px"]');
            handles.forEach(h => h.remove());

            // 3. 移除”复制/删除”按钮容器
            const actionButtons = clone.querySelectorAll('div[style*="z-index: 2005"]');
            actionButtons.forEach(b => b.remove());

            // 4. 移除辅助线 SVG
            const svgOverlay = clone.querySelector('svg.pointer-events-none.z-\\[2000\\]');
            if (svgOverlay) svgOverlay.remove();

            // 5. [Alignment Fix] 深度清除文字图层的 padding 和边框位移，强制像素级同步
            const textLayers = clone.querySelectorAll('.text-black');
            textLayers.forEach(el => {
                el.style.padding = '0';
                el.style.margin = '0';
                el.style.border = 'none';
                el.style.boxSizing = 'content-box';
                el.style.display = 'block';
                el.style.verticalAlign = 'top';
                // 确保行高在导出环境中维持一致，防止部分浏览器默认行为差异
                el.style.lineHeight = '1.4';
                el.style.whiteSpace = 'pre-wrap';
                el.style.wordBreak = 'break-word';
            });

            const originalImgs = Array.from(canvasElement.querySelectorAll('img'));
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
                        clonedImg.src = c.toDataURL('image/png', 1.0); // 使用最大质量
                        clonedImg.crossOrigin = 'anonymous';
                    }
                } catch (err) {
                    console.warn('[FineTune] Could not inline image for export:', err);
                    // 回退：保持原始 resolved URL，让 html-to-image 自己尝试
                    clonedImg.crossOrigin = 'anonymous';
                }
            }
            return { clone, wrapper };
        };

        if (!BaseNode) {
            console.warn(`[FineTuneNode] BaseNode not found during render of ${id}`);
            return null;
        }
        // 从 data 中读取持久化状态，如果不存在则使用默认值
        const [localActiveLayerIdx, setLocalActiveLayerIdx] = React.useState(data.activeLayerIdx || 0);
        const [localCurrentPage, setLocalCurrentPage] = React.useState(data.currentPage || 0);

        // 同步本地状态与 node data
        React.useEffect(() => {
            if (data.activeLayerIdx !== undefined && data.activeLayerIdx !== localActiveLayerIdx) {
                setLocalActiveLayerIdx(data.activeLayerIdx);
            }
        }, [data.activeLayerIdx]);

        React.useEffect(() => {
            if (data.currentPage !== undefined && data.currentPage !== localCurrentPage) {
                setLocalCurrentPage(data.currentPage);
            }
        }, [data.currentPage]);

        const activeLayerIdx = localActiveLayerIdx;
        const currentPage = localCurrentPage;
        const itemsPerPage = data.itemsPerPage || 3;

        // 辅助更新函数：统一更新 node.data 以触发所有联动节点的重绘
        const updateNodeData = React.useCallback((updates) => {
            setNodes((nds) => nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
            ));
        }, [id, setNodes]);

        const setLayer = (idx) => {
            // 立即更新本地 state 以触发重新渲染
            setLocalActiveLayerIdx(idx);
            // 同时更新 node data 以持久化状态
            setNodes((nds) => nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, activeLayerIdx: idx } } : node
            ));
        };
        const setPage = (page) => {
            const newPage = typeof page === 'function' ? page(currentPage) : page;
            setLocalCurrentPage(newPage);
            updateNodeData({ currentPage: newPage });
        };

        const [dragState, setDragState] = React.useState(null);
        const [resizingState, setResizingState] = React.useState(null);
        const [guideLines, setGuideLines] = React.useState({ x: [], y: [] });
        const [openDropdown, setOpenDropdown] = React.useState(null);
        const [isExporting, setIsExporting] = React.useState(false);
        const [editMode, setEditMode] = React.useState('page'); // 'global' | 'page' - 编辑范围模式

        // 历史记录管理 (撤销/重做)
        const historyStackRef = React.useRef([]);
        const historyIndexRef = React.useRef(-1);
        const MAX_HISTORY_SIZE = 50;
        const isUndoingRef = React.useRef(false); // 防止撤销操作本身被记录
        const layersRef = React.useRef([]); // 跟踪最新图层状态，初始为空数组

        // 同步 layersRef 与 layers (在 layers 定义后通过 effect 更新)



        const nodes = useNodes();
        const edges = useEdges();

        // --- 恢复核心数据流逻辑 ---
        const upstreamId = useMemo(() => edges.find(e => e.target === id)?.source, [edges, id]);
        const upstreamNode = useMemo(() => nodes.find(n => n.id === upstreamId), [nodes, upstreamId]);
        const upstreamStyleId = upstreamNode?.data?.selectedStyleId;

        // 监听上游变化，如果是切换了模版，重置 Dirty 状态以便同步新模版内容
        React.useEffect(() => {
            if (upstreamStyleId) {
                console.log('[FineTune] Upstream template changed, syncing new layout...');
                setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isDirty: false } } : n));
            }
        }, [upstreamStyleId, id, setNodes]);

        // 获取上游输入数据
        const upstreamContent = upstreamNode?.data?.content;
        const upstreamRawData = upstreamNode?.data?.rawData || upstreamNode?.data; // 原始数据源（包含 items）


        // 数据流处理：注入页面偏移映射逻辑
        const processedSchema = useMemo(() => {
            let baseSchema = { layers: [] };
            let source = 'empty';
            if (data.isDirty && data.content) {
                baseSchema = data.content;
                source = 'data.content (dirty)';
            } else if (upstreamContent && upstreamContent.layers) {
                baseSchema = upstreamContent;
                source = 'upstreamContent';
            } else {
                baseSchema = data.content || data.layoutData || { layers: [] };
                source = 'data.content/layoutData (fallback)';
            }

            const LayoutUtils = window.MagnesComponents?.Utils?.Layout;
            const hasValidItems = upstreamRawData?.items?.length > 0;

            // [Magnes] 获取当前页的独立覆写样式
            const overrides = data.pageOverrides?.[currentPage]?.layers || null;

            if (LayoutUtils && upstreamRawData && !data.isDirty && hasValidItems) {
                const mappedLayers = LayoutUtils.mapContentToLayers(baseSchema.layers, upstreamRawData, {
                    pageOffset: currentPage,
                    itemsPerPage: itemsPerPage,
                    overrides: overrides // 将单页覆写注入映射工具
                });
                return { ...baseSchema, layers: mappedLayers };
            }

            // 如果是 Dirty 模式且有 overrides，手动进行一层合并渲染
            if (data.isDirty && overrides) {
                const mergedLayers = baseSchema.layers.map(l => {
                    const ov = overrides.find(o => o.id === l.id);
                    return ov ? { ...l, ...ov } : l;
                });
                return { ...baseSchema, layers: mergedLayers };
            }

            return baseSchema;
        }, [data.content, data.layoutData, data.isDirty, upstreamContent, upstreamRawData, upstreamRawData?.lastUpdated, currentPage]);

        const schema = processedSchema;
        const itemsCount = upstreamRawData?.items?.length || 0;
        const totalPages = Math.max(1, Math.ceil(itemsCount / itemsPerPage));
        const layers = schema.layers || [];
        const activeLayer = layers[activeLayerIdx];

        // 同步 layersRef 与 layers (直接在渲染时同步，不使用 effect)
        layersRef.current = layers;

        // 保存当前状态到历史栈 (传入 layers 避免 TDZ)
        const saveToHistory = (layersToSave) => {
            if (isUndoingRef.current) return;
            if (!layersToSave || layersToSave.length === 0) return;

            if (historyIndexRef.current < historyStackRef.current.length - 1) {
                historyStackRef.current = historyStackRef.current.slice(0, historyIndexRef.current + 1);
            }

            // 避免保存重复的历史记录
            if (historyStackRef.current.length > 0) {
                const lastState = historyStackRef.current[historyStackRef.current.length - 1];
                if (JSON.stringify(lastState.layers) === JSON.stringify(layersToSave)) {
                    return;
                }
            }

            const currentState = {
                layers: JSON.parse(JSON.stringify(layersToSave)),
                timestamp: Date.now()
            };

            historyStackRef.current.push(currentState);
            historyIndexRef.current++;

            if (historyStackRef.current.length > MAX_HISTORY_SIZE) {
                historyStackRef.current.shift();
                historyIndexRef.current--;
            }
        };

        // 撤销操作
        const undo = () => {
            console.log('[FineTune] Undo pressed. History index:', historyIndexRef.current, 'stack size:', historyStackRef.current.length);
            if (historyIndexRef.current <= 0) {
                console.log('[FineTune] 没有可撤销的历史');
                return;
            }

            isUndoingRef.current = true;
            historyIndexRef.current--;
            const previousState = historyStackRef.current[historyIndexRef.current];
            console.log('[FineTune] Restoring state at index:', historyIndexRef.current, 'layers count:', previousState?.layers?.length);

            // 直接更新本节点的 data，使用 updateNodeData 保持一致性
            // 创建全新的 content 对象，确保 React 检测到变化
            const newContent = {
                ...(data.content || { layers: [] }),
                layers: JSON.parse(JSON.stringify(previousState.layers))
            };

            setLocalActiveLayerIdx(0);

            // 合并所有更新到一个 setNodes 调用，防止 React Flow 覆盖状态
            setNodes((nds) => nds.map((node) =>
                node.id === id ? {
                    ...node,
                    data: {
                        ...node.data,
                        isDirty: true,
                        content: newContent,
                        activeLayerIdx: 0
                    }
                } : node
            ));

            setTimeout(() => {
                isUndoingRef.current = false;
            }, 0);

            console.log('[FineTune] 撤销操作', historyIndexRef.current + 1, '/', historyStackRef.current.length);
        };

        // 重做操作
        const redo = () => {
            if (historyIndexRef.current >= historyStackRef.current.length - 1) {
                console.log('[FineTune] 没有可重做的历史');
                return;
            }

            isUndoingRef.current = true;
            historyIndexRef.current++;
            const nextState = historyStackRef.current[historyIndexRef.current];

            // 创建全新的 content 对象，确保 React 检测到变化
            const newContent = {
                ...(data.content || { layers: [] }),
                layers: JSON.parse(JSON.stringify(nextState.layers))
            };
            updateNodeData({
                isDirty: true,
                content: newContent
            });

            setTimeout(() => {
                isUndoingRef.current = false;
            }, 0);

            console.log('[FineTune] 重做操作', historyIndexRef.current + 1, '/', historyStackRef.current.length);
        };

        // 键盘事件监听 (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
        // 使用 ref 存储 undo/redo 函数，避免依赖变化导致重复监听
        const undoRef = React.useRef(undo);
        const redoRef = React.useRef(redo);
        React.useEffect(() => {
            undoRef.current = undo;
            redoRef.current = redo;
        }, [undo, redo]);

        React.useEffect(() => {
            const handleKeyDown = (e) => {
                // 只在当前节点被选中时响应 (使用 selected prop)
                if (!selected) return;

                // 忽略输入框内的撤销
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }

                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' || e.key === 'Z') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.shiftKey) {
                            redoRef.current();
                        } else {
                            undoRef.current();
                        }
                    } else if (e.key === 'y' || e.key === 'Y') {
                        e.preventDefault();
                        e.stopPropagation();
                        redoRef.current();
                    }
                }
            };

            window.addEventListener('keydown', handleKeyDown, { capture: true });
            return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
        }, [id, selected]);


        // 初始化历史记录 (必须在 layers 定义后)
        React.useEffect(() => {
            if (layers.length > 0 && historyStackRef.current.length === 0) {
                historyStackRef.current = [{
                    layers: JSON.parse(JSON.stringify(layers)),
                    timestamp: Date.now()
                }];
                historyIndexRef.current = 0;
            }
        }, [layers]);

        // --- 数据对外分发：供属性面板精确读取 ---
        React.useEffect(() => {
            if (layers.length > 0) {
                // 将当前最终渲染使用的图层数据暴露出去，避免属性面板去重复计算
                updateNodeData({ computedLayers: layers });
            }
        }, [layers, updateNodeData]);

        // --- 核心逻辑 2.0：自动合并（使用公共工具） ---
        React.useEffect(() => {
            const needsMerge = data.content && (!data.isParagraphMerged || data.mergeVersion < 4);
            if (!needsMerge) return;

            const LayoutUtils = window.MagnesComponents?.Utils?.Layout;
            if (!LayoutUtils) return;

            const originalLayers = data.content.layers || [];
            if (originalLayers.length === 0) return;

            console.log('[FineTune] Delegating text merging to LayoutUtils...');
            // 使用公共工具进行合并
            const finalMergedLayers = LayoutUtils.mergeTextLayers(originalLayers);

            setNodes(nds => nds.map(node =>
                node.id === id ? {
                    ...node,
                    data: {
                        ...node.data,
                        isParagraphMerged: true,
                        mergeVersion: 4,
                        content: { ...data.content, layers: finalMergedLayers }
                    }
                } : node
            ));
        }, [id, data.content, data.isParagraphMerged, data.mergeVersion, setNodes]);

        // --- 核心功能：附属属性面板 ---
        // 属性面板通过外部事件创建，不在组件内部自动创建，避免删除节点时的 Hooks 错误

        // --- 功能：批量导出所有页面 (Batch Export) ---
        const handleBatchExport = async () => {
            if (isExporting || totalPages <= 1) return;

            const confirmExport = confirm(`确认批量导出全部 ${totalPages} 页作品吗？\n导出过程中请勿操作，以防生成失败。`);
            if (!confirmExport) return;

            setIsExporting(true);
            try {
                // 确保 html-to-image 已加载
                if (!window.htmlToImage) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                const originalPage = currentPage;

                // 串行循环导出，防止 canvas 内存溢出
                for (let i = 0; i < totalPages; i++) {
                    // 1. 切换页面并强制等待渲染
                    setPage(i);
                    await new Promise(r => setTimeout(r, 800)); // 等待 800ms 渲染图片

                    const canvasElement = document.querySelector(`.fine-tune-canvas-${id}`);
                    if (!canvasElement) continue;

                    const { clone, wrapper } = cloneCanvasForExport(canvasElement);
                    try {
                        const dataUrl = await window.htmlToImage.toPng(clone, {
                            pixelRatio: 3,
                            backgroundColor: '#ffffff',
                            skipFonts: false
                        });

                        const link = document.createElement('a');
                        link.download = `Magnes_Batch_P${i + 1}_${Date.now()}.png`;
                        link.href = dataUrl;
                        link.click();

                        console.log(`[FineTune] Exported page ${i + 1}/${totalPages}`);
                    } finally {
                        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
                    }
                }

                // 恢复原始页码
                setPage(originalPage);
                alert(`✅ 批量导出完成！共导出 ${totalPages} 张图片。`);
            } catch (err) {
                console.error('[FineTune] Batch Export failed:', err);
                alert("导出中断：" + err.message);
            } finally {
                setIsExporting(false);
            }
        };

        // 辅助线吸附阈值 (0-1000 坐标系)
        const SNAP_THRESHOLD = 8;

        // 计算吸附位置
        const calculateSnapping = (currentBbox, excludeIdx) => {
            const lines = { x: [], y: [] };
            const snappedBbox = [...currentBbox];
            const [x, y, w, h] = currentBbox;
            const centerX = x + w / 2;
            const centerY = y + h / 2;
            const right = x + w;
            const bottom = y + h;

            let minDiffX = SNAP_THRESHOLD;
            let minDiffY = SNAP_THRESHOLD;
            let bestX = null;
            let bestY = null;

            layers.forEach((layer, idx) => {
                if (idx === excludeIdx || layer.type === 'background') return;
                const [lx, ly, lw, lh] = layer.bbox || [0, 0, 0, 0];
                const lCenterX = lx + lw / 2;
                const lCenterY = ly + lh / 2;
                const lRight = lx + lw;
                const lBottom = ly + lh;

                // X 轴对齐
                const xTargets = [lx, lCenterX, lRight];
                const xSources = [
                    { val: x, offset: 0 },
                    { val: centerX, offset: -w / 2 },
                    { val: right, offset: -w }
                ];

                xSources.forEach(s => {
                    xTargets.forEach(tVal => {
                        const diff = Math.abs(s.val - tVal);
                        if (diff < minDiffX) {
                            minDiffX = diff;
                            bestX = Math.round(tVal + s.offset);
                            lines.x = [tVal]; // 发现更近的，清空旧的
                        } else if (diff === minDiffX && diff < SNAP_THRESHOLD) {
                            if (!lines.x.includes(tVal)) lines.x.push(tVal);
                        }
                    });
                });

                // Y 轴对齐
                const yTargets = [ly, lCenterY, lBottom];
                const ySources = [
                    { val: y, offset: 0 },
                    { val: centerY, offset: -h / 2 },
                    { val: bottom, offset: -h }
                ];

                ySources.forEach(s => {
                    yTargets.forEach(tVal => {
                        const diff = Math.abs(s.val - tVal);
                        if (diff < minDiffY) {
                            minDiffY = diff;
                            bestY = Math.round(tVal + s.offset);
                            lines.y = [tVal]; // 发现更近的，清空旧的
                        } else if (diff === minDiffY && diff < SNAP_THRESHOLD) {
                            if (!lines.y.includes(tVal)) lines.y.push(tVal);
                        }
                    });
                });
            });

            if (bestX !== null) snappedBbox[0] = bestX;
            if (bestY !== null) snappedBbox[1] = bestY;

            return { snappedBbox, lines };
        };

        const handleMouseDown = (e, index) => {
            e.stopPropagation();
            if (e.button !== 0) return;
            setLayer(index);
            setNodes(nds => nds.map(n => n.id === id ? { ...n, selected: true } : n));

            const layer = layers[index];
            const bbox = layer?.bbox || [0, 0, 100, 100];

            // 拖拽开始前保存当前状态（用于撤销）
            saveToHistory(layers);

            setDragState({
                index,
                startX: e.clientX,
                startY: e.clientY,
                initialBbox: Array.isArray(bbox) ? [...bbox] : [bbox.x || 0, bbox.y || 0, bbox.width || 100, bbox.height || 100],
            });
        };

        const handleResizeStart = (e, index, handle) => {
            e.stopPropagation();
            e.preventDefault();
            setResizingState({
                index,
                handle,
                startX: e.clientX,
                startY: e.clientY,
                initialBbox: [...(layers[index].bbox || [0, 0, 0, 0])],
            });
        };

        React.useEffect(() => {
            if (!dragState && !resizingState) return;

            const handleMouseMove = (e) => {
                if (dragState) {
                    const canvasEl = document.querySelector(`.fine-tune-canvas-${id}`);
                    const canvasRect = canvasEl?.getBoundingClientRect();
                    const scaleX = canvasRect ? 1000 / canvasRect.width : 1000 / 300;
                    const scaleY = canvasRect ? 1000 / canvasRect.height : 1000 / 400;

                    const dx = (e.clientX - dragState.startX) * scaleX;
                    const dy = (e.clientY - dragState.startY) * scaleY;

                    const rawBbox = [...dragState.initialBbox];
                    rawBbox[0] = Math.max(0, Math.min(1000, Math.round(dragState.initialBbox[0] + dx)));
                    rawBbox[1] = Math.max(0, Math.min(1000, Math.round(dragState.initialBbox[1] + dy)));

                    console.log('[FineTune] Dragging:', dragState.index, 'dx:', dx, 'dy:', dy, 'new pos:', [rawBbox[0], rawBbox[1]]);

                    const { snappedBbox, lines } = calculateSnapping(rawBbox, dragState.index);
                    setGuideLines(lines);
                    // 直接使用 setNodes 避免闭包问题
                    setNodes((nds) => nds.map((node) => {
                        if (node.id !== id) return node;
                        const currentLayers = node.data.isDirty ? (node.data.content?.layers || layers) : layers;
                        const newLayers = [...currentLayers];
                        if (newLayers[dragState.index]) {
                            newLayers[dragState.index] = { ...newLayers[dragState.index], bbox: snappedBbox };
                        }
                        // 同步更新 layersRef
                        layersRef.current = newLayers;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                isDirty: true,
                                isParagraphMerged: true,
                                mergeVersion: 4,
                                content: { ...(node.data.content || schema), layers: newLayers }
                            }
                        };
                    }));
                } else if (resizingState) {
                    const dx = (e.clientX - resizingState.startX) / (300 / 1000);
                    const dy = (e.clientY - resizingState.startY) / (400 / 1000);
                    const [ix, iy, iw, ih] = resizingState.initialBbox;
                    const handle = resizingState.handle;
                    let nx = ix, ny = iy, nw = iw, nh = ih;

                    if (handle.includes('e')) nw = Math.max(20, iw + dx);
                    if (handle.includes('w')) {
                        const moveX = Math.min(dx, iw - 20);
                        nx = ix + moveX;
                        nw = iw - moveX;
                    }
                    if (handle.includes('s')) nh = Math.max(20, ih + dy);
                    if (handle.includes('n')) {
                        const moveY = Math.min(dy, ih - 20);
                        ny = iy + moveY;
                        nh = ih - moveY;
                    }

                    // 直接使用 setNodes 避免闭包问题
                    const resizedBbox = [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)];
                    setNodes((nds) => nds.map((node) => {
                        if (node.id !== id) return node;
                        const currentLayers = node.data.isDirty ? (node.data.content?.layers || layers) : layers;
                        const newLayers = [...currentLayers];
                        if (newLayers[resizingState.index]) {
                            newLayers[resizingState.index] = { ...newLayers[resizingState.index], bbox: resizedBbox };
                        }
                        // 同步更新 layersRef
                        layersRef.current = newLayers;
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                isDirty: true,
                                isParagraphMerged: true,
                                mergeVersion: 4,
                                content: { ...(node.data.content || schema), layers: newLayers }
                            }
                        };
                    }));
                }
            };

            const handleMouseUp = () => {
                // 如果是拖拽或缩放结束，保存最终状态到历史
                const wasDragging = dragState || resizingState;
                if (wasDragging && !isUndoingRef.current) {
                    // 使用 layersRef 获取最新的图层状态
                    console.log('[FineTune] Drag ended, saving to history. layers count:', layersRef.current?.length);
                    saveToHistory(layersRef.current);
                    console.log('[FineTune] History stack size:', historyStackRef.current.length, 'index:', historyIndexRef.current);
                }
                setDragState(null);
                setResizingState(null);
                setGuideLines({ x: [], y: [] });
            };

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }, [dragState, resizingState]);

        // 统一属性修改逻辑
        const updateLayerData = (index, updates) => {
            const newLayers = [...layers];
            newLayers[index] = { ...newLayers[index], ...updates };

            if (updates.style) {
                newLayers[index].style = { ...layers[index].style, ...updates.style };
            }

            // 保存历史记录 (在修改后)
            saveToHistory(newLayers);

            setNodes((nds) => nds.map((node) =>
                node.id === id ? {
                    ...node,
                    data: {
                        ...node.data,
                        isDirty: true,
                        content: { ...schema, layers: newLayers }
                    }
                } : node
            ));
        };

        // 添加图层逻辑 (修复层级与重复问题)
        const addLayer = (type) => {
            const now = Date.now();

            setNodes(nds => nds.map(n => {
                if (n.id !== id) return n;

                const currentLayers = n.data.content?.layers || [];
                // 计算当前最大 Z轴，确保新图层在最顶层
                const maxZ = currentLayers.reduce((max, l) => Math.max(max, l.z_index || 0), 10);
                // 增加位置偏移，防止点多次重叠在一起看不出来
                const offset = (currentLayers.length % 5) * 20;

                const newLayer = type === 'text' ? {
                    id: `text-${now}`,
                    type: 'text',
                    text: '新文字图层',
                    content: '新文字图层',
                    bbox: [400 + offset, 450 + offset, 200, 100],
                    style: { fontSize: 40, color: '#000000', fontWeight: 'bold', textAlign: 'center' },
                    isVariable: true,
                    placeholder: '请输入文字...',
                    z_index: maxZ + 10
                } : {
                    id: `image-${now}`,
                    type: 'placeholder_image',
                    url: '',
                    bbox: [350 + offset, 350 + offset, 300, 300],
                    isPlaceholder: true,
                    role: 'placeholder_image',
                    z_index: maxZ + 10
                };

                const updatedLayers = [...currentLayers, newLayer];

                // 保存历史记录 (在修改后)
                saveToHistory(updatedLayers);

                // 延迟一帧设置选中态，确保索引正确
                setTimeout(() => setLayer(updatedLayers.length - 1), 50);

                return {
                    ...n,
                    data: {
                        ...n.data,
                        isDirty: true,
                        content: { ...n.data.content, layers: updatedLayers }
                    }
                };
            }));
        };

        // --- 功能：导出当前页图片 ---
        const exportCurrentImage = async (e) => {
            e.stopPropagation();
            if (isExporting) return;

            const canvasElement = document.querySelector(`.fine-tune-canvas-${id}`);
            if (!canvasElement) {
                alert("找不到画布元素，请重试");
                return;
            }

            setIsExporting(true);
            try {
                // 如果没有 html-to-image，则尝试加载
                if (!window.htmlToImage) {
                    console.log('[FineEdit] Loading html-to-image...');
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.min.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                const { clone, wrapper } = cloneCanvasForExport(canvasElement);
                try {
                    const dataUrl = await window.htmlToImage.toPng(clone, {
                        pixelRatio: 3,
                        backgroundColor: '#ffffff',
                        skipFonts: false
                    });

                    const link = document.createElement('a');
                    link.download = `Magnes_Page_${currentPage + 1}_${Date.now()}.png`;
                    link.href = dataUrl;
                    link.click();

                    // 记录 CanvasActionLog
                    try {
                        const API = window.MagnesComponents?.Utils?.API;
                        if (API?.ActionLog?.log) {
                            API.ActionLog.log({
                                actionType: 'image_export',
                                targetNodeId: id,
                                payload: {
                                    page: currentPage + 1,
                                    totalPages: totalPages,
                                    layerCount: layers?.length || 0,
                                },
                                description: `用户导出了精细编排第 ${currentPage + 1} 页图片`,
                            });
                        }
                    } catch (e) {
                        console.error('[Magnes] CanvasActionLog 发送失败:', e);
                    }
                } finally {
                    if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
                }
            } catch (err) {
                console.error('[FineEdit] Export failed:', err);
                alert("导出失败：" + err.message);
            } finally {
                setIsExporting(false);
            }
        };


        // --- 核心逻辑恢复：保存为模版 ---
        const handleSaveTemplate = async () => {
            const name = prompt('请输入新模版名称', `定制模版_${new Date().toLocaleDateString()}_${new Date().toLocaleTimeString()}`);
            if (!name) return;

            // 1. 提取当前图层（排除背景占位逻辑，保留用户修改后的坐标和内容）
            const currentLayers = layers.map(l => ({ ...l }));

            // 2. 触发语义反演分析 (Semantic service)
            const SemanticService = window.MagnesComponents?.Services?.SemanticService;
            let finalLayers = currentLayers;

            if (SemanticService) {
                console.log('[FineTune] Starting semantic analysis for template inversion...');
                try {
                    finalLayers = await SemanticService.analyze(currentLayers);
                } catch (err) {
                    console.error('[FineTune] Semantic inversion failed, saving with raw roles:', err);
                }
            }

            // 3. 构造模版数据包
            const templateData = {
                id: `template-${Date.now()}`, // 必须提供唯一 ID
                name: name,
                layout: finalLayers, // 后端 process_layout_images 期待 Array 类型，而非 { layers: [] }
                atoms: upstreamNode?.data?.atoms || { palette: {} }, // 同步样式资产
                metadata: {
                    source: 'fine-tune-node',
                    parentImage: upstreamNode?.data?.content || null,
                    createdAt: new Date().toISOString()
                }
            };

            // 4. 同步至后端 API
            console.log('[FineTune] Saving template to backend:', templateData);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                if (!API?.magnesFetch) {
                    throw new Error('API.magnesFetch not found');
                }
                const res = await API.magnesFetch('/templates', {
                    method: 'POST',
                    body: JSON.stringify(templateData)
                });

                if (res.ok) {
                    alert('✨ 模版保存成功！\n您现在可以在“图文模版”节点中看到并直接应用这个方案了。');
                } else {
                    const error = await res.json();
                    alert('保存模版失败: ' + (error.detail || '后端校验未通过'));
                }
            } catch (err) {
                console.error('[FineTune] Backend connection error:', err);
                alert('连接后端失败，请确认 API 服务 (8088) 是否运行中。');
            }
        };

        if (!BaseNode) return null;

        // 缩放手柄组件
        const ResizeHandles = ({ index, bbox }) => {
            const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
            return handles.map(h => {
                let style = { position: 'absolute', width: '8px', height: '8px', backgroundColor: '#fff', border: '1.5px solid #000', zIndex: 100 };
                if (h.includes('n')) style.top = '-4px';
                if (h.includes('s')) style.bottom = '-4px';
                if (h.includes('w')) style.left = '-4px';
                if (h.includes('e')) style.right = '-4px';
                if (h === 'n' || h === 's') style.left = '50%', style.transform = 'translateX(-50%)';
                if (h === 'w' || h === 'e') style.top = '50%', style.transform = 'translateY(-50%)';

                const cursor = h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';

                return (
                    <div
                        key={h}
                        style={{ ...style, cursor }}
                        onMouseDown={(e) => handleResizeStart(e, index, h)}
                    />
                );
            });
        };

        // 属性面板状态
        const [mode, setMode] = React.useState('global');
        const [showGenPanel, setShowGenPanel] = React.useState(false);
        const [genPrompt, setGenPrompt] = React.useState('');
        const [isGenerating, setIsGenerating] = React.useState(false);
        const [useReferenceImage, setUseReferenceImage] = React.useState(false);
        const fileInputRef = React.useRef(null);

        // 获取背景图URL
        const currentBgUrl = layers.find(l =>
            l.role?.includes('background') ||
            l.role?.includes('reference') ||
            l.id?.includes('background') ||
            l.type === 'background' ||
            l.isPlaceholder
        )?.url || '';

        // 处理本地上传
        const handleLocalUpload = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const url = ev.target.result;
                const bgLayerIdx = layers.findIndex(l =>
                    l.role?.includes('background') ||
                    l.role?.includes('reference') ||
                    l.id?.includes('background') ||
                    l.type === 'background'
                );

                if (bgLayerIdx >= 0) {
                    updateLayerData(bgLayerIdx, { url, type: 'background', role: 'background' });
                } else {
                    const newLayers = [...layers];
                    newLayers.push({
                        id: `background-${Date.now()}`,
                        type: 'background',
                        role: 'background',
                        url: url,
                        bbox: [0, 0, 1000, 1000],
                        z_index: 0
                    });
                    // 保存历史记录
                    saveToHistory(newLayers);
                    setNodes(nds => nds.map(n => n.id === id ? {
                        ...n, data: { ...n.data, isDirty: true, content: { ...schema, layers: newLayers } }
                    } : n));
                }

                // 记录 CanvasActionLog
                try {
                    const API = window.MagnesComponents?.Utils?.API;
                    if (API?.ActionLog?.log) {
                        API.ActionLog.log({
                            actionType: 'asset_replace',
                            targetNodeId: id,
                            payload: {
                                layerType: 'background',
                                source: 'local_upload',
                            },
                            description: `用户在精细编排节点中上传了本地背景图片`,
                        });
                    }
                } catch (e) {
                    console.error('[Magnes] CanvasActionLog 发送失败:', e);
                }
            };
            reader.readAsDataURL(file);
        };

        // 打开侧边栏素材库
        const openSidebarAssets = () => {
            const bgLayer = layers.find(l =>
                l.role?.includes('background') ||
                l.role?.includes('reference') ||
                l.id?.includes('background') ||
                l.type === 'background' ||
                l.isPlaceholder
            );

            if (!bgLayer) {
                window.dispatchEvent(new CustomEvent('magnes:show_toast', {
                    detail: { message: '请先添加背景图层', type: 'warning' }
                }));
                return;
            }

            window.dispatchEvent(new CustomEvent('magnes:switch_ext_tab', {
                detail: {
                    tab: 'assets',
                    context: {
                        targetNodeId: id,
                        targetLayerId: bgLayer.id
                    }
                }
            }));
        };

        // AI背景生成
        const handleAIBackground = async () => {
            if (!genPrompt) return;
            setIsGenerating(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const payload = {
                    prompt: genPrompt,
                    aspect_ratio: '3:4',
                    reference_image: useReferenceImage ? currentBgUrl : null,
                    reference_mode: useReferenceImage ? 'img2img' : 'txt2img'
                };
                const resp = await API.magnesFetch('/painter/generate/background', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (resp.ok) {
                    const result = await resp.json();
                    const bgLayerIdx = layers.findIndex(l =>
                        l.role?.includes('background') ||
                        l.role?.includes('reference') ||
                        l.id?.includes('background') ||
                        l.type === 'background'
                    );

                    if (bgLayerIdx >= 0) {
                        updateLayerData(bgLayerIdx, { url: result.url, type: 'background', role: 'background' });
                    } else {
                        const newLayers = [...layers];
                        newLayers.push({
                            id: `background-${Date.now()}`,
                            type: 'background',
                            role: 'background',
                            url: result.url,
                            bbox: [0, 0, 1000, 1000],
                            z_index: 0
                        });
                        // 保存历史记录
                        saveToHistory(newLayers);
                        setNodes(nds => nds.map(n => n.id === id ? {
                            ...n, data: { ...n.data, isDirty: true, content: { ...schema, layers: newLayers } }
                        } : n));
                    }
                    setShowGenPanel(false);

                    // 记录 CanvasActionLog
                    try {
                        const LogAPI = window.MagnesComponents?.Utils?.API;
                        if (LogAPI?.ActionLog?.log) {
                            LogAPI.ActionLog.log({
                                actionType: 'asset_replace',
                                targetNodeId: id,
                                payload: {
                                    layerType: 'background',
                                    source: 'ai_generate',
                                    prompt: genPrompt,
                                    referenceMode: useReferenceImage ? 'img2img' : 'txt2img',
                                },
                                description: `用户通过 AI 生成了背景图片（提示词：${genPrompt.slice(0, 30)}...）`,
                            });
                        }
                    } catch (e) {
                        console.error('[Magnes] CanvasActionLog 发送失败:', e);
                    }
                }
            } catch (err) {
                console.error('[FineTune] AI背景生成失败:', err);
                alert('生成失败：' + err.message);
            } finally {
                setIsGenerating(false);
            }
        };

        return (
            <BaseNode
                id={id}
                title="精细编辑"
                icon={Sliders}
                selected={selected}
                style={{ width: '700px' }}
                headerExtra={null}
                handles={{
                    target: [{ id: 'input', top: '50%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex gap-4">
                    {/* 左侧：画布区域 */}
                    <div className="flex flex-col gap-4" style={{ width: '380px' }}>
                        {/* 1. WYSIWYG 画布区域 */}
                        {/* 动态宽高比适配：从 schema.canvas 获取比例，防止硬编码 3:4 导致变形 */}
                        <div
                            onClick={(e) => {
                                // 如果点击的是画布背景（而非由于冒泡传来的图层点击），取消选中
                                if (e.target === e.currentTarget) {
                                    setLayer(-1);
                                }
                            }}
                            className={`relative w-full bg-zinc-50 border border-black overflow-hidden group nodrag fine-tune-canvas-${id}`}
                            style={{
                                aspectRatio: (schema.canvas?.width && schema.canvas?.height)
                                    ? `${schema.canvas.width} / ${schema.canvas.height}`
                                    : '3 / 4'
                            }}
                        >
                            {/* 辅助线 Overlay */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none z-[2000]">
                                {guideLines.x.map((lx, i) => (
                                    <line key={`x-${i}`} x1={`${lx / 10}%`} y1="0" x2={`${lx / 10}%`} y2="100%" stroke="#000000" strokeWidth="1" strokeDasharray="4 2" />
                                ))}
                                {guideLines.y.map((ly, i) => (
                                    <line key={`y-${i}`} x1="0" y1={`${ly / 10}%`} x2="100%" y2={`${ly / 10}%`} stroke="#000000" strokeWidth="1" strokeDasharray="4 2" />
                                ))}
                            </svg>

                            {layers.length > 0 ? (
                                layers.map((layer, idx) => {
                                    const isActive = activeLayerIdx === idx;
                                    const isText = layer.type === 'text';

                                    // 增强 BBox 解析：兼容对象格式 {x, y, width, height}
                                    let bbox = layer.bbox || [0, 0, 0, 0];
                                    if (!Array.isArray(bbox) && typeof bbox === 'object') {
                                        bbox = [
                                            bbox.x || 0,
                                            bbox.y || 0,
                                            bbox.width || bbox.w || 0,
                                            bbox.height || bbox.h || 0
                                        ];
                                    }
                                    const [x, y, w, h] = bbox;

                                    // 更加鲁棒的背景判定：ID或Role中包含 background 关键词即可
                                    const isBackground =
                                        layer.role?.includes('background') ||
                                        layer.role?.includes('reference') ||
                                        layer.id?.includes('background') ||
                                        layer.type === 'background';

                                    const isPlaceholder = layer.isPlaceholder || layer.role === 'placeholder_image' || layer.type === 'placeholder_image';

                                    const style = {
                                        position: 'absolute',
                                        left: isBackground ? '0' : `${x / 10}%`,
                                        top: isBackground ? '0' : `${y / 10}%`,
                                        width: isBackground ? '100%' : (isText && w === 0 ? 'max-content' : `${(w / 10) * (layer.isLayoutAnalyst ? 1.2 : 1)}%`),
                                        height: isBackground ? '100%' : (isText && h === 0 ? 'max-content' : `${h / 10}%`),
                                        minWidth: isText ? '20px' : '0',
                                        minHeight: isText ? '20px' : '0',
                                        zIndex: isText ? 1000 + idx : ((layer.z_index || 0) + idx),
                                        cursor: isBackground ? 'default' : (dragState ? 'grabbing' : 'grab'),
                                        pointerEvents: isBackground ? 'none' : 'auto', // 防止全屏背景阻挡下层原本更高的 DOM 响应
                                        boxShadow: isActive && !isBackground ? 'inset 0 0 0 1px #000' : 'none',
                                        padding: '0', // [Alignment Fix] 移除 2px 偏移源，确保编辑态与导出态基准线统一
                                        margin: '0',
                                        verticalAlign: 'top',
                                        display: ((layer.isHidden ?? false) || (layer.opacity ?? 1) === 0) ? 'none' : 'block'
                                    };

                                    if (isText) {
                                        const textStyle = layer.style || {};
                                        const fontScaleFactor = 0.443;
                                        const displayFontSize = (parseInt(textStyle.fontSize) || 40) * fontScaleFactor;

                                        return (
                                            <React.Fragment key={layer.id || `layer-${idx}`}>
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        console.log('[FineTune] Clicked layer:', idx, 'current active:', activeLayerIdx);
                                                        setLayer(idx);
                                                        setNodes(nds => nds.map(n => n.id === id ? { ...n, selected: true } : n));
                                                    }}
                                                    onPointerDown={(e) => {
                                                        e.stopPropagation();
                                                        handleMouseDown(e, idx);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.currentTarget.contentEditable === 'true') {
                                                            const keys = ['Backspace', 'Delete', 'Enter', ' '];
                                                            if (keys.includes(e.key)) e.stopPropagation();
                                                        }
                                                    }}
                                                    onDoubleClick={(e) => {
                                                        if (isBackground) return;
                                                        e.stopPropagation();
                                                        e.currentTarget.contentEditable = true;
                                                        e.currentTarget.focus();
                                                    }}
                                                    onBlur={(e) => {
                                                        e.currentTarget.contentEditable = false;
                                                        updateLayerData(idx, { content: e.currentTarget.innerText, text: e.currentTarget.innerText });
                                                    }}
                                                    className="text-black"
                                                    style={{
                                                        ...style,
                                                        fontSize: `${displayFontSize}px`,
                                                        color: textStyle.color || '#000',
                                                        textAlign: textStyle.textAlign || 'center',
                                                        fontWeight: textStyle.fontWeight || 'bold',
                                                        fontFamily: textStyle.fontFamily || 'PingFang SC, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
                                                        whiteSpace: 'pre-wrap', // 允许换行
                                                        wordBreak: 'break-word',
                                                        lineHeight: '1.4',
                                                        userSelect: 'none',
                                                        overflow: 'visible'
                                                    }}
                                                >
                                                    {layer.content || layer.text || (isActive ? '输入内容...' : '')}
                                                </div>

                                                {/* 选中时显示复制/删除按钮（脱离 contentEditable DOM 结构） */}
                                                {isActive && !isBackground && (
                                                    <div
                                                        className="absolute flex gap-1"
                                                        style={{
                                                            left: style.left,
                                                            top: `calc(${style.top} - 32px)`,
                                                            zIndex: 2005
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newLayer = {
                                                                    ...layer,
                                                                    id: `text-${Date.now()}`,
                                                                    bbox: [x + 20, y + 20, w, h]
                                                                };
                                                                const newLayers = [...layers, newLayer];
                                                                // 保存历史记录
                                                                saveToHistory(newLayers);

                                                                const newIdx = newLayers.length - 1;
                                                                setLocalActiveLayerIdx(newIdx);
                                                                setNodes(nds => nds.map(n => n.id === id ? {
                                                                    ...n, data: {
                                                                        ...n.data,
                                                                        activeLayerIdx: newIdx,
                                                                        isDirty: true,
                                                                        isParagraphMerged: true,
                                                                        mergeVersion: 4,
                                                                        content: { ...(n.data.content || schema), layers: newLayers }
                                                                    }
                                                                } : n));
                                                            }}
                                                            className="px-2 py-1 bg-black text-white text-[9px] font-black hover:bg-zinc-700 pointer-events-auto"
                                                        >
                                                            复制
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const newLayers = layers.filter((_, i) => i !== idx);
                                                                // 保存历史记录
                                                                saveToHistory(newLayers);

                                                                // 如果删除后还有图层，选中第一个；否则清除选中
                                                                const newIdx = newLayers.length > 0 ? 0 : -1;
                                                                setLocalActiveLayerIdx(newIdx);

                                                                setNodes(nds => nds.map(n => n.id === id ? {
                                                                    ...n, data: {
                                                                        ...n.data,
                                                                        activeLayerIdx: newIdx,
                                                                        isDirty: true,
                                                                        isParagraphMerged: true,
                                                                        mergeVersion: 4,
                                                                        content: { ...(n.data.content || schema), layers: newLayers }
                                                                    }
                                                                } : n));
                                                            }}
                                                            className="px-2 py-1 bg-black text-white text-[9px] font-black hover:bg-zinc-700"
                                                        >
                                                            删除
                                                        </button>
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    } else {
                                        return (
                                            <div
                                                key={layer.id || `layer-${idx}`}
                                                onMouseDown={(e) => isBackground ? null : handleMouseDown(e, idx)}
                                                style={style}
                                            >
                                                {layer.url ? (
                                                    <img
                                                        src={resolveImageUrl(layer.url)}
                                                        crossOrigin="anonymous"
                                                        className={`w-full h-full pointer-events-none ${isBackground ? 'object-cover' : 'object-contain'}`}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full border border-dashed border-black/20 flex flex-col items-center justify-center bg-zinc-50/50">
                                                        <ImageIcon size={20} className="text-zinc-300" />
                                                        <span className="text-[9px] font-bold text-zinc-400 mt-1">
                                                            {isPlaceholder ? '展示位' : '空图片'}
                                                        </span>
                                                    </div>
                                                )}
                                                {isActive && !isBackground && <ResizeHandles index={idx} bbox={bbox} />}
                                            </div>
                                        );
                                    }
                                })
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center font-black">
                                    <Sliders size={32} strokeWidth={1} className="text-zinc-500" />
                                    <span className="text-[12px] uppercase tracking-widest text-zinc-500">
                                        等待输入数据
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 分页导航控制廊 */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between bg-white text-black px-2 py-1.5 -mt-px border border-black nodrag">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setPage(prev => Math.max(0, prev - 1)); }}
                                    disabled={currentPage === 0}
                                    className={`p-1 hover:bg-zinc-100 disabled:opacity-30`}
                                >
                                    <ChevronDown size={16} strokeWidth={3} className="rotate-90" />
                                </button>
                                <div className="flex flex-col items-center">
                                    <span className="text-[12px] font-black tabular-nums tracking-widest">
                                        {currentPage + 1} / {totalPages}
                                        {data.pageOverrides?.[currentPage] && <span className="text-red-500 ml-1">⚡</span>}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setPage(prev => Math.min(totalPages - 1, prev + 1)); }}
                                    disabled={currentPage === totalPages - 1}
                                    className={`p-1 hover:bg-zinc-100 disabled:opacity-30`}
                                >
                                    <ChevronDown size={16} strokeWidth={3} className="-rotate-90" />
                                </button>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 mt-4">
                            {/* 0. 保存为新模版 */}
                            <button
                                onClick={handleSaveTemplate}
                                className="flex items-center justify-center gap-1.5 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white"
                            >
                                <Copy size={14} />
                                保存为新模版
                            </button>

                            {/* 1. 导出操作区 - 一直显示 */}
                            <div className="flex -space-x-[1px]">
                                <button
                                    onClick={exportCurrentImage}
                                    disabled={isExporting}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white ${isExporting ? 'opacity-50' : ''}`}
                                >
                                    <ExternalLink size={14} />
                                    {isExporting ? '导出中...' : '导出当前页'}
                                </button>
                                <button
                                    onClick={handleBatchExport}
                                    disabled={isExporting || totalPages <= 1}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white ${isExporting ? 'opacity-50' : ''}`}
                                >
                                    <Icons.Download size={14} />
                                    {isExporting ? '导出中...' : `导出所有页(${totalPages})`}
                                </button>
                            </div>

                            {/* 2. 原来的导出操作区注释掉 */}
                            {false && layers.length > 0 && (
                                <div className="flex flex-col gap-2 pt-2 border-t border-black/5">
                                    <button
                                        onClick={exportCurrentImage}
                                        disabled={isExporting}
                                        className={`flex items-center justify-center gap-2 w-full h-12 bg-black text-white text-[13px] font-black hover:bg-zinc-800 transition-all uppercase tracking-widest ${isExporting ? 'opacity-50' : ''}`}
                                    >
                                        <ExternalLink size={16} strokeWidth={2.5} />
                                        {isExporting ? '正在导出图片...' : '导出当前页图'}
                                    </button>

                                    {totalPages > 1 && (
                                        <button
                                            onClick={handleBatchExport}
                                            disabled={isExporting}
                                            className={`flex items-center justify-center gap-2 w-full h-10 border border-black text-[11px] font-black hover:bg-black hover:text-white transition-all uppercase tracking-widest ${isExporting ? 'opacity-50' : ''}`}
                                        >
                                            <Icons.Download size={14} />
                                            {isExporting ? '批量处理中...' : `批量导出全部 ${totalPages} 页`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：属性面板区域 */}
                    <div className="flex flex-col gap-5 p-1" style={{ width: '280px' }}>
                        {/* 全局/当前页 模式切换 */}
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-zinc-900 uppercase tracking-wider">编辑范围</span>
                            <div className="flex border border-black">
                                <button
                                    onClick={() => setEditMode('global')}
                                    className={`px-3 py-1.5 text-[10px] font-black transition-all ${editMode === 'global' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                                        }`}
                                >
                                    全局
                                </button>
                                <button
                                    onClick={() => setEditMode('page')}
                                    className={`px-3 py-1.5 text-[10px] font-black transition-all ${editMode === 'page' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'
                                        }`}
                                >
                                    当前页
                                </button>
                            </div>
                        </div>

                        {/* 背景设置 */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-100 pb-1">
                                <ImageIcon size={12} />
                                背景设置
                            </div>
                            <div
                                className="aspect-video bg-zinc-50 border border-zinc-100 overflow-hidden relative group cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {currentBgUrl ? (
                                    <img src={resolveImageUrl(currentBgUrl)} crossOrigin="anonymous" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-1">
                                        <Icons.Upload size={24} strokeWidth={1} />
                                        <span className="text-[9px] uppercase">暂无背景</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                    <span className="text-white text-[10px] font-black opacity-0 group-hover:opacity-100">本地上传背景图</span>
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleLocalUpload}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={openSidebarAssets}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase"
                                >
                                    <Icons.Save size={12} />
                                    素材库
                                </button>
                                <button
                                    onClick={() => { setShowGenPanel(!showGenPanel); if (!showGenPanel) setGenPrompt(''); }}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase"
                                >
                                    <Icons.Wand2 size={12} />
                                    {showGenPanel ? '收起>' : 'AI 生成'}
                                </button>
                            </div>

                            {showGenPanel && (
                                <div className="flex flex-col gap-2 bg-zinc-50 border border-zinc-100 mt-1 p-2">
                                    {currentBgUrl && (
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-zinc-400 font-black uppercase">参考图模式</span>
                                                <button
                                                    onClick={() => setUseReferenceImage(!useReferenceImage)}
                                                    className={`flex items-center gap-1.5 px-2 py-1 text-[9px] font-black border transition-all ${useReferenceImage ? 'bg-black text-white border-black' : 'bg-white text-zinc-500 border-zinc-200'}`}
                                                >
                                                    {useReferenceImage ? '✓ 使用参考图' : '☐ 使用参考图'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <textarea
                                        value={genPrompt}
                                        onChange={(e) => setGenPrompt(e.target.value)}
                                        placeholder={useReferenceImage ? '描述想要如何修改背景...' : '输入背景生成描述词...'}
                                        className="w-full h-16 p-2 text-[11px] bg-white border border-zinc-200 outline-none focus:border-black"
                                    />
                                    <button
                                        onClick={handleAIBackground}
                                        disabled={isGenerating}
                                        className={`py-1.5 bg-black text-white text-[10px] font-black uppercase tracking-widest ${isGenerating ? 'opacity-50' : 'hover:bg-zinc-800'}`}
                                    >
                                        {isGenerating ? '正在生成...' : (useReferenceImage ? '基于参考图生成' : '开始生成')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 图层属性编辑 - 一直显示 */}
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-900 border-b border-zinc-100 pb-1">
                                <Type size={12} />
                                文字样式
                                {!activeLayer && <span className="text-zinc-400 text-[9px] normal-case">（请先选择文字图层）</span>}
                            </div>

                            {/* 字号、加粗、斜体、下划线 */}
                            {activeLayer ? (
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={activeLayer.type !== 'text'}
                                        onClick={() => activeLayer.type === 'text' && updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, fontSize: Math.max(12, (activeLayer.style?.fontSize || 40) - 4) } })}
                                        className="w-8 h-8 border border-zinc-200 hover:border-black text-[10px] font-bold disabled:opacity-30"
                                    >
                                        -
                                    </button>
                                    <span className="text-[10px] font-bold w-12 text-center">{(activeLayer.style?.fontSize || 40)}px</span>
                                    <button
                                        disabled={activeLayer.type !== 'text'}
                                        onClick={() => activeLayer.type === 'text' && updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, fontSize: (activeLayer.style?.fontSize || 40) + 4 } })}
                                        className="w-8 h-8 border border-zinc-200 hover:border-black text-[10px] font-bold disabled:opacity-30"
                                    >
                                        +
                                    </button>
                                    <button
                                        disabled={activeLayer.type !== 'text'}
                                        onClick={() => activeLayer.type === 'text' && updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, fontWeight: activeLayer.style?.fontWeight === 'bold' ? 'normal' : 'bold' } })}
                                        className={`w-8 h-8 border text-[10px] font-bold disabled:opacity-30 ${activeLayer.style?.fontWeight === 'bold' ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                                    >
                                        B
                                    </button>
                                    <button
                                        disabled={activeLayer.type !== 'text'}
                                        onClick={() => activeLayer.type === 'text' && updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, fontStyle: activeLayer.style?.fontStyle === 'italic' ? 'normal' : 'italic' } })}
                                        className={`w-8 h-8 border text-[10px] italic disabled:opacity-30 ${activeLayer.style?.fontStyle === 'italic' ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                                    >
                                        I
                                    </button>
                                    <button
                                        disabled={activeLayer.type !== 'text'}
                                        onClick={() => activeLayer.type === 'text' && updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, textDecoration: activeLayer.style?.textDecoration === 'underline' ? 'none' : 'underline' } })}
                                        className={`w-8 h-8 border text-[10px] underline disabled:opacity-30 ${activeLayer.style?.textDecoration === 'underline' ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                                    >
                                        U
                                    </button>
                                </div>
                            ) : (
                                <div className="text-[10px] text-zinc-400 py-2">请在画布上选择一个文字图层进行编辑</div>
                            )}

                            {activeLayer && (
                                <>
                                    {/* 颜色选择 */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[9px] text-zinc-400 font-black uppercase">文字颜色</span>
                                        <div className="flex items-center gap-2">
                                            {/* 获取图片中已有的文字颜色 */}
                                            {(() => {
                                                // 从所有图层中提取已有的文字颜色（去重，最多4个）
                                                const existingColors = layers
                                                    .filter(l => l.type === 'text' && l.style?.color && l.id !== activeLayer.id)
                                                    .map(l => l.style.color)
                                                    .filter((c, i, arr) => arr.indexOf(c) === i)
                                                    .slice(0, 4);

                                                // 基础颜色：黑、白、红、黄、绿、蓝
                                                const baseColors = ['#000000', '#FFFFFF', '#FF2442', '#FFD700', '#32CD32', '#1E90FF'];

                                                // 如果当前选中图层没有颜色，添加紫色作为默认提示
                                                const currentColor = activeLayer.style?.color;
                                                const showPurple = !currentColor || currentColor === '#000000';

                                                // 组合颜色列表（确保总共8个）
                                                const colorList = [...existingColors];
                                                for (const c of baseColors) {
                                                    if (colorList.length < 7) colorList.push(c);
                                                }
                                                if (showPurple && colorList.length < 7) {
                                                    colorList.push('#9400D3');
                                                }

                                                return colorList.slice(0, 7).map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, color } })}
                                                        className={`w-6 h-6 border ${activeLayer.style?.color === color ? 'border-black ring-1 ring-black' : 'border-zinc-300'}`}
                                                        style={{ backgroundColor: color }}
                                                        title={color}
                                                    />
                                                ));
                                            })()}
                                            {/* 七彩虹选择器（第8个） */}
                                            <div className="relative w-6 h-6 overflow-hidden border border-zinc-300 cursor-pointer" title="任意色">
                                                <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #ff0000 0%, #ff7f00 14%, #ffff00 28%, #00ff00 42%, #0000ff 56%, #4b0082 70%, #9400d3 84%, #ff1493 100%)' }} />
                                                <input
                                                    type="color"
                                                    value={activeLayer.style?.color || '#000000'}
                                                    onChange={(e) => updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, color: e.target.value } })}
                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* 对齐方式 */}
                                    <div className="flex items-center gap-1">
                                        {['left', 'center', 'right'].map((align) => (
                                            <button
                                                key={align}
                                                onClick={() => updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, textAlign: align } })}
                                                className={`flex-1 py-1.5 border text-[9px] font-bold uppercase ${activeLayer.style?.textAlign === align ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                                            >
                                                {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
                                            </button>
                                        ))}
                                    </div>

                                    {/* 字体选择 - 下拉框样式 */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[9px] text-zinc-400 font-black uppercase">字体</span>
                                        <select
                                            className="w-full h-8 px-2 border-b border-black text-[10px] font-bold outline-none bg-white"
                                            value={activeLayer.style?.fontFamily || 'PingFang SC'}
                                            onChange={(e) => updateLayerData(activeLayerIdx, { style: { ...activeLayer.style, fontFamily: e.target.value } })}
                                        >
                                            <option value="PingFang SC, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif">系统默认 (苹方)</option>
                                            <option value="SmileySans, PingFang SC, sans-serif">得意黑</option>
                                            <option value="AlibabaPuHuiTi, PingFang SC, sans-serif">阿里普惠体</option>
                                            <option value="JiangXiZhuoKai, PingFang SC, sans-serif">江西拙楷</option>
                                            <option value="XinYiGuanHei, PingFang SC, sans-serif">欣意冠黑体</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {/* 添加图层按钮 */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-200">
                                <button
                                    onClick={() => addLayer('text')}
                                    className="flex-1 py-2 border border-black text-black text-[10px] font-black hover:bg-black hover:text-white transition-all"
                                >
                                    添加文字
                                </button>
                                <button
                                    onClick={() => addLayer('image')}
                                    className="flex-1 py-2 border border-black text-black text-[10px] font-black hover:bg-black hover:text-white transition-all"
                                >
                                    增加占位图片
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.FineTuneNodeRF = FineTuneNode;

    console.log('✅ FineTuneNodeRF (Polished) Loaded');
})();
