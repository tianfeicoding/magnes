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

        if (!BaseNode) {
            console.warn(`[FineTuneNode] BaseNode not found during render of ${id}`);
            return null;
        }
        const [activeLayerIdx, setActiveLayerIdx] = React.useState(0);
        const [currentPage, setCurrentPage] = React.useState(0); // [Magnes Pagination] 当前页码
        const itemsPerPage = 3; // 模版默认槽位数

        const [dragState, setDragState] = React.useState(null);
        const [resizingState, setResizingState] = React.useState(null);
        const [guideLines, setGuideLines] = React.useState({ x: [], y: [] });
        const [openDropdown, setOpenDropdown] = React.useState(null);
        const [isExporting, setIsExporting] = React.useState(false);

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
            // 只有当上游有有效的 items 数据时才使用 LayoutUtils.mapContentToLayers
            // 否则直接使用原始布局（如 layout-analyzer 的输出）
            const hasValidItems = upstreamRawData?.items?.length > 0;
            if (LayoutUtils && upstreamRawData && !data.isDirty && hasValidItems) {
                const mappedLayers = LayoutUtils.mapContentToLayers(baseSchema.layers, upstreamRawData, {
                    pageOffset: currentPage,
                    itemsPerPage: itemsPerPage
                });
                return { ...baseSchema, layers: mappedLayers };
            }
            if (data.isDirty) {
            }
            return baseSchema;
        }, [data.content, data.layoutData, data.isDirty, upstreamContent, upstreamRawData, upstreamRawData?.lastUpdated, currentPage]);

        const schema = processedSchema;
        const itemsCount = upstreamRawData?.items?.length || 0;
        const totalPages = Math.max(1, Math.ceil(itemsCount / itemsPerPage));

        // 数据流监控
        React.useEffect(() => {
            // 静默监控
        }, [schema.layers?.length, data.isDirty, id, currentPage, totalPages]);

        const layers = schema.layers || [];
        const activeLayer = layers[activeLayerIdx];

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
            if (e.button !== 0) return;
            setActiveLayerIdx(index);
            setNodes(nds => nds.map(n => n.id === id ? { ...n, selected: true } : n));

            setDragState({
                index,
                startX: e.clientX,
                startY: e.clientY,
                initialBbox: [...(layers[index].bbox || [0, 0, 0, 0])],
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
                    const dx = (e.clientX - dragState.startX) / (300 / 1000); // 这里的 300 需要根据实际画布宽度校准
                    const dy = (e.clientY - dragState.startY) / (400 / 1000);

                    const rawBbox = [...dragState.initialBbox];
                    rawBbox[0] = Math.max(0, Math.min(1000, Math.round(dragState.initialBbox[0] + dx)));
                    rawBbox[1] = Math.max(0, Math.min(1000, Math.round(dragState.initialBbox[1] + dy)));

                    const { snappedBbox, lines } = calculateSnapping(rawBbox, dragState.index);
                    setGuideLines(lines);
                    updateLayerData(dragState.index, { bbox: snappedBbox });
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

                    updateLayerData(resizingState.index, { bbox: [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)] });
                }
            };

            const handleMouseUp = () => {
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

                // 延迟一帧设置选中态，确保索引正确
                setTimeout(() => setActiveLayerIdx(updatedLayers.length - 1), 50);

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
                // 如果没有 html2canvas，则尝试加载
                if (!window.html2canvas) {
                    console.log('[FineEdit] Loading html2canvas...');
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                const canvas = await window.html2canvas(canvasElement, {
                    useCORS: true,
                    scale: 2, // 导出 2 倍图保证清晰度
                    backgroundColor: '#ffffff'
                });

                const link = document.createElement('a');
                link.download = `Magnes_Page_${currentPage + 1}_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
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
                let style = { position: 'absolute', width: '8px', height: '8px', backgroundColor: '#fff', border: '1px solid #3b82f6', zIndex: 100 };
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

        return (
            <BaseNode
                id={id}
                title="精细编辑"
                icon={Sliders}
                selected={selected}
                style={{ width: '380px' }}
                headerExtra={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportCurrentImage}
                            disabled={isExporting}
                            className={`flex items-center gap-1 px-2 py-0.5 border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <ExternalLink size={10} />
                            {isExporting ? '导出中...' : '保存图片'}
                        </button>
                        <button
                            onClick={handleSaveTemplate}
                            className="flex items-center gap-1 px-2 py-0.5 border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white"
                        >
                            <Copy size={10} />
                            保存模版
                        </button>
                    </div>
                }
                handles={{
                    target: [{ id: 'input', top: '50%' }],
                    source: [{ id: 'output', top: '50%' }]
                }}
            >
                <div className="flex flex-col gap-4">
                    {/* 1. WYSIWYG 画布区域 */}
                    {/* 动态宽高比适配：从 schema.canvas 获取比例，防止硬编码 3:4 导致变形 */}
                    <div
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
                                <line key={`x-${i}`} x1={`${lx / 10}%`} y1="0" x2={`${lx / 10}%`} y2="100%" stroke="#FF2442" strokeWidth="1" strokeDasharray="4 2" />
                            ))}
                            {guideLines.y.map((ly, i) => (
                                <line key={`y-${i}`} x1="0" y1={`${ly / 10}%`} x2="100%" y2={`${ly / 10}%`} stroke="#FF2442" strokeWidth="1" strokeDasharray="4 2" />
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
                                    width: isBackground ? '100%' : `${(w / 10) * (layer.isLayoutAnalyst ? 1.2 : 1)}%`,
                                    height: isBackground ? '100%' : `${h / 10}%`,
                                    zIndex: (layer.z_index || 0) + idx,
                                    cursor: isBackground ? 'default' : (dragState ? 'grabbing' : 'grab'),
                                    outline: isActive && !isBackground ? '1.5px solid #3b82f6' : 'none',
                                    padding: isText ? '4px' : '0',
                                    display: ((layer.isHidden ?? false) || (layer.opacity ?? 1) === 0) ? 'none' : 'block'
                                };

                                // Diagnostic: check first text layer values
                                if (isText && idx === 0) {
                                }

                                if (isText) {
                                    const textStyle = layer.style || {};
                                    const fontScaleFactor = 0.443;
                                    const displayFontSize = (parseInt(textStyle.fontSize) || 40) * fontScaleFactor;

                                    return (
                                        <div
                                            key={layer.id || `layer-${idx}`}
                                            onMouseDown={(e) => isBackground ? null : handleMouseDown(e, idx)}
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
                                            className="transition-shadow text-black outline-none"
                                            style={{
                                                ...style,
                                                fontSize: `${displayFontSize}px`,
                                                color: textStyle.color || '#000',
                                                textAlign: textStyle.textAlign || 'center',
                                                fontWeight: textStyle.fontWeight || 'bold',
                                                fontFamily: 'PingFang SC, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif',
                                                whiteSpace: 'pre-wrap', // 允许换行
                                                wordBreak: 'break-word',
                                                lineHeight: '1.4',
                                                userSelect: 'text',
                                                overflow: 'visible'
                                            }}
                                        >
                                            {layer.content || layer.text || (isActive ? '输入内容...' : '')}
                                            {isActive && !isBackground && <ResizeHandles index={idx} bbox={bbox} />}
                                        </div>
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
                                                    src={layer.url.startsWith('/uploads') ? `http://localhost:8088${layer.url}` : layer.url}
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

                        {/* 独立浮动工具栏 */}
                        {selected && activeLayerIdx !== null && layers[activeLayerIdx] && layers[activeLayerIdx].type === 'text' && !dragState && !resizingState && (
                            (() => {
                                const layer = layers[activeLayerIdx];
                                const [lx, ly, lw, lh] = layer.bbox || [0, 0, 0, 0];
                                const textStyle = layer.style || {};
                                const py = ly / 10;
                                const ph = lh / 10;
                                const isOnBottom = py > 40;
                                const toolTop = isOnBottom ? Math.max(5, py - 12) : Math.min(85, py + ph + 2);

                                return (
                                    <div className="absolute left-0 right-0 z-[3000] flex justify-center pointer-events-none" style={{ top: `${toolTop}%` }}>
                                        <div className="flex items-center bg-white border border-black h-8 px-1 pointer-events-auto -space-x-[1px]" onMouseDown={e => e.stopPropagation()}>
                                            {/* Font */}
                                            <div className="relative h-full flex items-center">
                                                <button className="px-2 text-[10px] font-black hover:bg-zinc-100 h-full flex items-center gap-1 min-w-[70px] uppercase tracking-tighter" onClick={() => setOpenDropdown(openDropdown === 'font' ? null : 'font')}>
                                                    {textStyle.fontFamily?.split(' ')[0] || 'PingFang'}
                                                    <div className="border-t-[3px] border-t-black border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent ml-1"></div>
                                                </button>
                                                {openDropdown === 'font' && (
                                                    <div className="absolute top-full left-0 mt-[1px] bg-white border border-black z-[4000] w-24 py-1">
                                                        {['PingFang SC', 'JetBrains Mono', 'Outfit'].map(f => (
                                                            <button key={f} className="w-full text-left px-2 py-1.5 text-[10px] font-bold hover:bg-black hover:text-white" onClick={() => { updateLayerData(activeLayerIdx, { style: { fontFamily: f } }); setOpenDropdown(null); }}>
                                                                {f.split(' ')[0]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="w-[1px] h-4 bg-black/15 mx-1"></div>
                                            {/* Size Stepper: + 数字 - */}
                                            <div className="flex items-center h-full group/stepper">
                                                <button
                                                    className="w-8 h-full flex items-center justify-center hover:bg-black hover:text-white transition-colors text-[12px] font-black"
                                                    onClick={() => {
                                                        const current = parseInt(textStyle.fontSize) || 40;
                                                        updateLayerData(activeLayerIdx, { style: { fontSize: current + 2 } });
                                                    }}
                                                >
                                                    +
                                                </button>
                                                <div className="px-1 text-[10px] font-black min-w-[32px] text-center flex items-center justify-center h-full border-x border-black/5">
                                                    {textStyle.fontSize || 40}
                                                </div>
                                                <button
                                                    className="w-8 h-full flex items-center justify-center hover:bg-black hover:text-white transition-colors text-[12px] font-black"
                                                    onClick={() => {
                                                        const current = parseInt(textStyle.fontSize) || 40;
                                                        updateLayerData(activeLayerIdx, { style: { fontSize: Math.max(8, current - 2) } });
                                                    }}
                                                >
                                                    -
                                                </button>
                                            </div>
                                            <div className="w-[1px] h-4 bg-black/15 mx-1"></div>
                                            {/* Bold */}
                                            <button className={`w-8 h-full flex items-center justify-center hover:bg-zinc-100 text-black ${textStyle.fontWeight === 'black' || textStyle.fontWeight === 'bold' ? 'bg-zinc-100' : ''}`} onClick={() => { const newWeight = (textStyle.fontWeight === 'black' || textStyle.fontWeight === 'bold') ? 'normal' : 'black'; updateLayerData(activeLayerIdx, { style: { fontWeight: newWeight } }); }}>
                                                <span className="text-[10px] font-black">B</span>
                                            </button>
                                            <div className="w-[1px] h-4 bg-black/15 mx-1"></div>
                                            {/* Color */}
                                            <div className="w-8 h-full flex items-center justify-center relative">
                                                <input type="color" className="absolute inset-0 opacity-0 cursor-pointer" value={textStyle.color || '#000000'} onChange={(e) => updateLayerData(activeLayerIdx, { style: { color: e.target.value } })} />
                                                <div className="w-4 h-4 border border-black/20" style={{ backgroundColor: textStyle.color || '#000' }}></div>
                                            </div>
                                            <div className="w-[1px] h-4 bg-black/15 mx-1"></div>
                                            {/* Delete */}
                                            <button className="w-8 h-full flex items-center justify-center hover:bg-red-50 text-black hover:text-red-600" onClick={() => {
                                                const newLayers = layers.filter((_, i) => i !== activeLayerIdx);
                                                setNodes((nds) => nds.map((node) => node.id === id ? {
                                                    ...node,
                                                    data: {
                                                        ...node.data,
                                                        isDirty: true, //标记脏数据，防止被上游覆盖
                                                        content: { ...schema, layers: newLayers }
                                                    }
                                                } : node));
                                                setActiveLayerIdx(0);
                                            }}>
                                                <Trash size={12} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()
                        )}
                    </div>
                    {/* 分页导航控制廊 */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between bg-white text-black px-2 py-1.5 -mt-px border border-black nodrag">
                            <button
                                onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.max(0, prev - 1)); }}
                                disabled={currentPage === 0}
                                className={`p-1 hover:bg-zinc-100 disabled:opacity-30`}
                            >
                                <ChevronDown size={16} strokeWidth={3} className="rotate-90" />
                            </button>
                            <div className="flex flex-col items-center">
                                <span className="text-[12px] font-black tabular-nums tracking-widest">{currentPage + 1} / {totalPages}</span>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setCurrentPage(prev => Math.min(totalPages - 1, prev + 1)); }}
                                disabled={currentPage === totalPages - 1}
                                className={`p-1 hover:bg-zinc-100 disabled:opacity-30`}
                            >
                                <ChevronDown size={16} strokeWidth={3} className="-rotate-90" />
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        {/* 活动组 (Group) 聚合展示层 - 用户请求隐藏 */}
                        {/* <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between border-b border-black pb-1">
                                <span className="text-[10px] font-black text-black uppercase tracking-widest">语义组化浏览 (Group View)</span>
                            </div>

                            <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {(() => {
                                    // 1. 自动对图层进行分组
                                    const groups = {};
                                    layers.forEach((l, idx) => {
                                        const gid = l.groupId || 'group_none';
                                        if (!groups[gid]) groups[gid] = { id: gid, items: [] };
                                        groups[gid].items.push({ ...l, originalIdx: idx });
                                    });

                                    // 2. 角色映射表
                                    const ROLE_LABELS = {
                                        title: '标题', venue: '地点', date: '日期', price: '价格',
                                        description: '文案', highlights: '亮点', time_indicator: '时间段', other: '辅助'
                                    };

                                    // 3. 渲染分组列表
                                    return Object.values(groups).sort((a, b) => {
                                        if (a.id === 'group_none') return -1;
                                        return a.id.localeCompare(b.id);
                                    }).map(group => (
                                        <div key={group.id} className="flex flex-col border border-black/5 bg-zinc-50/30">
                                            <div className="px-2 py-1 bg-zinc-100/50 flex items-center justify-between border-b border-black/5">
                                                <span className="text-[9px] font-black text-black/60 uppercase tracking-widest">
                                                    {group.id === 'group_none' ? '✦ 全局/独立图层' : `◆ 活动项 ${group.id.split('_')[1]}`}
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                {group.items.map(item => {
                                                    const isActive = activeLayerIdx === item.originalIdx;
                                                    const isLocked = item.role === 'background';
                                                    const label = ROLE_LABELS[item.semanticRole] || item.semanticRole || (item.type === 'text' ? '文本' : '图片');

                                                    return (
                                                        <div
                                                            key={item.originalIdx}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setActiveLayerIdx(item.originalIdx);
                                                            }}
                                                            className={`
                                                                flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all border-l-2
                                                                ${isActive ? 'bg-black text-white border-black' : 'hover:bg-zinc-100 text-black border-transparent'}
                                                                ${isLocked ? 'opacity-50' : ''}
                                                            `}
                                                        >
                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`text-[9px] font-black px-1 ${isActive ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                                                        {label}
                                                                    </span>
                                                                    <span className="text-[11px] font-bold truncate">
                                                                        {item.text || item.content || (item.type === 'image' ? '[图片图层]' : '未命名')}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {isActive && <div className="ml-auto w-1 h-1 bg-white rounded-full scale-110" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div> */}

                        <div className="flex flex-col gap-3">
                            {/* 添加图层快捷控制 */}
                            <div className="flex -space-x-[1px]">
                                <button
                                    onClick={() => addLayer('text')}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white"
                                >
                                    <Type size={14} />
                                    添加文字
                                </button>
                                <button
                                    onClick={() => addLayer('image')}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-12 border border-black text-[12px] font-black hover:bg-black hover:text-white transition-all bg-white"
                                >
                                    <ImageIcon size={14} />
                                    增加占位图片
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">图层精修控制</span>
                                {activeLayer && (
                                    <span className="text-[10px] px-2 py-0.5 bg-black text-white font-black uppercase">
                                        {activeLayer.type === 'text' ? '文本图层 ' : '图片图层'}
                                    </span>
                                )}
                            </div>

                            {activeLayer ? (
                                (() => {
                                    // 在此作用域重新计算背景判定，修复 ReferenceError
                                    const isActiveLayerBackground =
                                        activeLayer.role?.includes('background') ||
                                        activeLayer.role?.includes('reference') ||
                                        activeLayer.id?.includes('background') ||
                                        activeLayer.type === 'background';

                                    return (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-zinc-400 uppercase">重心 X (0-1000)</label>
                                                <input
                                                    type="number"
                                                    value={activeLayer.bbox?.[0] || 0}
                                                    onChange={(e) => {
                                                        const newBbox = [...activeLayer.bbox];
                                                        newBbox[0] = parseInt(e.target.value) || 0;
                                                        updateLayerData(activeLayerIdx, { bbox: newBbox });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="h-8 px-2 text-[12px] font-black border border-black outline-none bg-zinc-50 nodrag"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-zinc-400 uppercase">重心 Y (0-1000)</label>
                                                <input
                                                    type="number"
                                                    value={activeLayer.bbox?.[1] || 0}
                                                    onChange={(e) => {
                                                        const newBbox = [...activeLayer.bbox];
                                                        newBbox[1] = parseInt(e.target.value) || 0;
                                                        updateLayerData(activeLayerIdx, { bbox: newBbox });
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="h-8 px-2 text-[12px] font-black border border-black outline-none bg-zinc-50 nodrag"
                                                />
                                            </div>

                                            {/* 模版变量控制 */}
                                            <div className="col-span-2 mt-2 pt-2 border-t border-black/5 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold text-black uppercase">模版交互配置</span>
                                                </div>

                                                {activeLayer.type === 'text' ? (
                                                    <div className="flex flex-col gap-3">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[9px] font-bold text-zinc-500 uppercase">设为可编辑变量</label>
                                                            <button
                                                                onClick={() => updateLayerData(activeLayerIdx, { isVariable: !activeLayer.isVariable })}
                                                                className={`w-8 h-4 border border-black relative transition-colors ${activeLayer.isVariable ? 'bg-black' : 'bg-white'}`}
                                                            >
                                                                <div className={`absolute top-0 bottom-0 w-3 border-r border-black transition-all ${activeLayer.isVariable ? 'right-0 border-l border-r-0 bg-white' : 'left-0 bg-black'}`} />
                                                            </button>
                                                        </div>
                                                        {activeLayer.isVariable && (
                                                            <div className="flex flex-col gap-1">
                                                                <label className="text-[9px] font-bold text-zinc-400 uppercase">占位提示文本</label>
                                                                <input
                                                                    type="text"
                                                                    value={activeLayer.placeholder || ''}
                                                                    placeholder="例如: 请输入标题..."
                                                                    onChange={(e) => updateLayerData(activeLayerIdx, { placeholder: e.target.value })}
                                                                    onMouseDown={(e) => e.stopPropagation()}
                                                                    className="h-8 px-2 text-[10px] font-bold border border-black outline-none bg-white nodrag"
                                                                    onKeyDown={(e) => e.stopPropagation()}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    !isActiveLayerBackground && (
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[9px] font-bold text-zinc-500 uppercase">设为展示区插槽</label>
                                                            <button
                                                                onClick={() => {
                                                                    const isP = !activeLayer.isPlaceholder;
                                                                    updateLayerData(activeLayerIdx, {
                                                                        isPlaceholder: isP,
                                                                        role: isP ? 'placeholder_image' : 'other'
                                                                    });
                                                                }}
                                                                className={`w-8 h-4 border border-black relative transition-colors ${activeLayer.isPlaceholder ? 'bg-black' : 'bg-white'}`}
                                                            >
                                                                <div className={`absolute top-0 bottom-0 w-3 border-r border-black transition-all ${activeLayer.isPlaceholder ? 'right-0 border-l border-r-0 bg-white' : 'left-0 bg-black'}`} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="py-6 text-center border border-black/10 text-zinc-500 text-[12px] font-black uppercase tracking-widest">
                                    请选择图层进行微调
                                </div>
                            )}
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
