/**
 * MaskFillNode - 遮罩抠图与合成节点 (React Flow 版本)
 * 布局：左右分栏（参考 FineTuneNode）
 * 左侧：底图预览 + Mask 交互画布
 * 右侧：操作面板（Tab + 上传 + 按钮）
 */

(function () {
    const { React } = window;
    const { useState, useCallback, useRef, useEffect } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    const MAGNES = window.MagnesComponents || {};
    const Icons = MAGNES.UI?.Icons || {};
    const { Scissors, Eraser, Undo, Wand2, Loader2, Download, Image: ImageIcon, Trash2, Upload, Move, X } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const MaskFillNode = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const baseCanvasRef = useRef(null);
        const maskCanvasRef = useRef(null);
        const baseFileInputRef = useRef(null);
        const fillFileInputRef = useRef(null);

        const [brushSize, setBrushSize] = useState(20);
        const [isErasing, setIsErasing] = useState(false);
        const [isDrawing, setIsDrawing] = useState(false);
        const [isProcessing, setIsProcessing] = useState(false);
        const [activeTab, setActiveTab] = useState('manual');
        const [semanticPrompt, setSemanticPrompt] = useState('');
        const [showPreview, setShowPreview] = useState(false);
        // MobileSAM 状态
        const [samMode, setSamMode] = useState('point'); // 'point' | 'box'
        const [samPoints, setSamPoints] = useState([]);
        const [samBox, setSamBox] = useState(null); // {x, y, w, h} 归一化
        const [isSamDragging, setIsSamDragging] = useState(false);
        const [samDragStart, setSamDragStart] = useState(null);

        const updateData = useCallback((newData) => {
            setNodes((nds) =>
                nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node))
            );
        }, [id, setNodes]);

        // 上游数据自动接收：支持 input-image / painter-node / layer-split 等
        const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
        const edges = ReactFlow?.useEdges ? ReactFlow.useEdges() : [];
        const nodes = ReactFlow?.useNodes ? ReactFlow.useNodes() : [];

        const upstreamImage = React.useMemo(() => {
            const connectedEdges = edges.filter(e => e.target === id);
            if (connectedEdges.length === 0) return null;
            const sourceNode = nodes.find(n => n.id === connectedEdges[0].source);
            if (!sourceNode) return null;
            return sourceNode.data?.content || sourceNode.data?.image_url || sourceNode.data?.background_url || null;
        }, [edges, nodes, id]);

        // 自动将上游图片设为底图
        React.useEffect(() => {
            if (upstreamImage && upstreamImage !== data.baseImage) {
                updateData({ baseImage: upstreamImage });
                setTimeout(() => clearMask(), 100);
            }
        }, [upstreamImage]);

        // 调试：追踪 data.content 变化
        React.useEffect(() => {
            if (data.content) {
                console.log('[MaskFill] data.content 已更新，类型:', typeof data.content, '长度:', typeof data.content === 'string' ? data.content.length : 'N/A', '前 50 字符:', typeof data.content === 'string' ? data.content.slice(0, 50) : data.content);
            }
        }, [data.content]);

        // 上传底图
        const handleBaseImageUpload = async (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                updateData({ baseImage: e.target.result });
                setTimeout(() => clearMask(), 100);
            };
            reader.readAsDataURL(file);
        };

        // 上传填充图
        const handleFillImageUpload = async (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                updateData({ fillImage: e.target.result });
            };
            reader.readAsDataURL(file);
        };

        // 底图加载到 hidden canvas（用于像素合成）
        useEffect(() => {
            if (!data.baseImage || !baseCanvasRef.current) return;
            const img = new Image();
            img.onload = () => {
                const canvas = baseCanvasRef.current;
                canvas.width = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);

                if (maskCanvasRef.current) {
                    maskCanvasRef.current.width = img.width;
                    maskCanvasRef.current.height = img.height;
                    const mCtx = maskCanvasRef.current.getContext('2d');
                    mCtx.fillStyle = 'white';
                    mCtx.fillRect(0, 0, img.width, img.height);
                }
            };
            img.src = data.baseImage;
        }, [data.baseImage]);

        // Mask 画笔坐标转换
        const getCanvasCoords = (e) => {
            const canvas = maskCanvasRef.current;
            if (!canvas) return { x: 0, y: 0 };
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
            };
        };

        const startDrawing = (e) => {
            if (!maskCanvasRef.current) return;
            setIsDrawing(true);
            const { x, y } = getCanvasCoords(e);
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx.beginPath();
            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = isErasing ? 'white' : 'black';
            ctx.fill();
        };

        const draw = (e) => {
            if (!isDrawing || !maskCanvasRef.current) return;
            const { x, y } = getCanvasCoords(e);
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.strokeStyle = isErasing ? 'white' : 'black';
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const stopDrawing = () => {
            setIsDrawing(false);
            if (maskCanvasRef.current) {
                maskCanvasRef.current.getContext('2d').beginPath();
            }
        };

        const clearMask = () => {
            if (!maskCanvasRef.current) return;
            const ctx = maskCanvasRef.current.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
            // 同时清空语义分割的状态
            updateData({ semanticDescription: null, semanticPreviewUrl: null, semanticMaskUrl: null });
        };

        const invertMask = () => {
            if (!maskCanvasRef.current) return;
            const canvas = maskCanvasRef.current;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const v = 255 - data[i];
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
            }
            ctx.putImageData(imageData, 0, 0);
        };

        // MobileSAM 交互事件
        const getPreviewCoords = (e) => {
            const previewEl = e.currentTarget;
            const rect = previewEl.getBoundingClientRect();
            return {
                nx: (e.clientX - rect.left) / rect.width,
                ny: (e.clientY - rect.top) / rect.height,
            };
        };

        const handleSamMouseDown = (e) => {
            if (activeTab !== 'sam' || !data.baseImage) return;
            e.stopPropagation();
            const { nx, ny } = getPreviewCoords(e);
            if (samMode === 'point') {
                setSamPoints((prev) => [...prev, [nx, ny]]);
            } else if (samMode === 'box') {
                setIsSamDragging(true);
                setSamDragStart({ nx, ny });
                setSamBox(null);
            }
        };

        const handleSamMouseMove = (e) => {
            if (!isSamDragging || samMode !== 'box') return;
            const { nx, ny } = getPreviewCoords(e);
            setSamBox({
                x: Math.min(samDragStart.nx, nx),
                y: Math.min(samDragStart.ny, ny),
                w: Math.abs(nx - samDragStart.nx),
                h: Math.abs(ny - samDragStart.ny),
            });
        };

        const handleSamMouseUp = () => {
            if (samMode === 'box') {
                setIsSamDragging(false);
            }
        };

        const clearSamSelection = () => {
            setSamPoints([]);
            setSamBox(null);
            setSamDragStart(null);
        };

        const handleSamSegment = async () => {
            if (!data.baseImage) { alert('请先上传底图'); return; }
            if (samMode === 'point' && samPoints.length === 0) { alert('请在图片上点击选择区域'); return; }
            if (samMode === 'box' && !samBox) { alert('请在图片上拖拽画框'); return; }

            setIsProcessing(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const payload = { image_url: data.baseImage };
                if (samMode === 'point') {
                    payload.point_coords = samPoints;
                } else {
                    payload.box = [samBox.x, samBox.y, samBox.x + samBox.w, samBox.y + samBox.h];
                }

                const response = await API.magnesFetch('/segment/mobilesam', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                const result = await response.json();

                if (result.mask_url) {
                    const maskImg = new Image();
                    maskImg.onload = () => {
                        if (maskCanvasRef.current) {
                            const mCtx = maskCanvasRef.current.getContext('2d');
                            mCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                            mCtx.drawImage(maskImg, 0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                        }
                    };
                    maskImg.src = result.mask_url;
                    updateData({ samMaskUrl: result.mask_url, samPreviewUrl: result.preview_url });
                }
            } catch (error) {
                console.error('MobileSAM 分割失败:', error);
                alert('分割失败: ' + (error.message || '请稍后重试'));
            } finally {
                setIsProcessing(false);
            }
        };

        // 合成预览
        const generatePreview = () => {
            if (!data.baseImage || !data.fillImage || !baseCanvasRef.current || !maskCanvasRef.current) {
                alert('请先上传底图和填充图');
                return;
            }

            const baseCanvas = baseCanvasRef.current;
            const maskCanvas = maskCanvasRef.current;
            const baseCtx = baseCanvas.getContext('2d');
            const maskCtx = maskCanvas.getContext('2d');

            if (baseCanvas.width === 0 || baseCanvas.height === 0 || maskCanvas.width === 0 || maskCanvas.height === 0) {
                alert('画布尺寸异常，请重新上传底图');
                return;
            }

            console.log('[MaskFill] 合成开始 | 底图长度:', data.baseImage?.length, '填充图长度:', data.fillImage?.length, '底图===填充图:', data.baseImage === data.fillImage);
            console.log('[MaskFill] 画布尺寸 | base:', baseCanvas.width, 'x', baseCanvas.height, 'mask:', maskCanvas.width, 'x', maskCanvas.height);

            try {
                const baseData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
                const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

                // 诊断 mask 统计信息
                let blackPixels = 0, whitePixels = 0, grayPixels = 0;
                let minVal = 255, maxVal = 0;
                for (let i = 0; i < maskData.data.length; i += 4) {
                    const v = maskData.data[i];
                    if (v < minVal) minVal = v;
                    if (v > maxVal) maxVal = v;
                    if (v === 0) blackPixels++;
                    else if (v === 255) whitePixels++;
                    else grayPixels++;
                }
                const totalPixels = maskData.data.length / 4;
                console.log('[MaskFill] Mask 统计 | 总像素:', totalPixels, '黑(0):', blackPixels, '白(255):', whitePixels, '灰:', grayPixels, '最小:', minVal, '最大:', maxVal);

                const baseProcessedCanvas = document.createElement('canvas');
                baseProcessedCanvas.width = baseCanvas.width;
                baseProcessedCanvas.height = baseCanvas.height;
                const baseProcessedCtx = baseProcessedCanvas.getContext('2d');
                const baseProcessedData = baseProcessedCtx.createImageData(baseCanvas.width, baseCanvas.height);

                for (let i = 0; i < baseData.data.length; i += 4) {
                    const maskVal = maskData.data[i];
                    const alpha = maskVal / 255;
                    baseProcessedData.data[i] = baseData.data[i];
                    baseProcessedData.data[i + 1] = baseData.data[i + 1];
                    baseProcessedData.data[i + 2] = baseData.data[i + 2];
                    baseProcessedData.data[i + 3] = baseData.data[i + 3] * alpha;
                }
                baseProcessedCtx.putImageData(baseProcessedData, 0, 0);

                // 诊断 baseProcessedCanvas 透明度
                let transparentPixels = 0;
                for (let i = 3; i < baseProcessedData.data.length; i += 4) {
                    if (baseProcessedData.data[i] < 255) transparentPixels++;
                }
                console.log('[MaskFill] baseProcessed 半透明/透明像素数:', transparentPixels);

                const resultCanvas = document.createElement('canvas');
                resultCanvas.width = baseCanvas.width;
                resultCanvas.height = baseCanvas.height;
                const resultCtx = resultCanvas.getContext('2d');

                const fillImg = new Image();
                fillImg.onload = () => {
                    try {
                        resultCtx.drawImage(fillImg, 0, 0, resultCanvas.width, resultCanvas.height);
                        resultCtx.drawImage(baseProcessedCanvas, 0, 0);
                        const resultUrl = resultCanvas.toDataURL('image/png');
                        console.log('[MaskFill] 合成成功，结果 URL 长度:', resultUrl.length, '前 50 字符:', resultUrl.slice(0, 50));
                        updateData({ previewUrl: resultUrl, content: resultUrl });
                        console.log('[MaskFill] 合成完成，结果已输出到下游节点');
                    } catch (err) {
                        console.error('[MaskFill] 合成画布导出失败:', err);
                        alert('合成失败: ' + (err.message || '画布导出异常，请检查图片是否跨域'));
                    }
                };
                fillImg.onerror = () => {
                    alert('填充图加载失败，请重新上传');
                };
                fillImg.src = data.fillImage;
            } catch (err) {
                console.error('[MaskFill] 合成异常:', err);
                alert('合成失败: ' + (err.message || '未知错误'));
            }
        };

        // AI 自动抠图
        const handleAutoSegment = async () => {
            if (!data.baseImage) { alert('请先上传底图'); return; }
            setIsProcessing(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const response = await API.magnesFetch('/segment/auto', {
                    method: 'POST',
                    body: JSON.stringify({ image_url: data.baseImage }),
                });
                const result = await response.json();
                if (result.mask_url) {
                    const maskImg = new Image();
                    maskImg.onload = () => {
                        if (maskCanvasRef.current) {
                            const mCtx = maskCanvasRef.current.getContext('2d');
                            mCtx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                            mCtx.drawImage(maskImg, 0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                        }
                    };
                    maskImg.src = result.mask_url;
                    updateData({ autoMaskUrl: result.mask_url, autoPreviewUrl: result.preview_url });
                }
            } catch (error) {
                console.error('AI 抠图失败:', error);
                alert('AI 抠图失败，请尝试手动选区');
            } finally {
                setIsProcessing(false);
            }
        };

        // 语义抠图
        const handleSemanticSegment = async () => {
            if (!data.baseImage) { alert('请先上传底图'); return; }
            if (!semanticPrompt.trim()) { alert('请输入想提取的区域描述'); return; }
            setIsProcessing(true);
            try {
                const API = window.MagnesComponents?.Utils?.API;
                const response = await API.magnesFetch('/segment/semantic', {
                    method: 'POST',
                    body: JSON.stringify({ image_url: data.baseImage, prompt: semanticPrompt.trim() }),
                });
                const result = await response.json();
                if (result.mask_url) {
                    const maskImg = new Image();
                    maskImg.onload = () => {
                        if (maskCanvasRef.current) {
                            const mCtx = maskCanvasRef.current.getContext('2d');
                            const w = maskCanvasRef.current.width;
                            const h = maskCanvasRef.current.height;

                            // 叠加模式：新 mask 叠加到现有 mask 上（黑色=镂空，白色=保留）
                            const currentData = mCtx.getImageData(0, 0, w, h);
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = w;
                            tempCanvas.height = h;
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCtx.drawImage(maskImg, 0, 0, w, h);
                            const newData = tempCtx.getImageData(0, 0, w, h);

                            for (let i = 0; i < currentData.data.length; i += 4) {
                                // 如果当前像素是透明的（空 canvas），视为白色（保留）
                                if (currentData.data[i + 3] === 0) {
                                    currentData.data[i] = 255;
                                    currentData.data[i + 1] = 255;
                                    currentData.data[i + 2] = 255;
                                    currentData.data[i + 3] = 255;
                                }
                                // 取最小值：黑色(0) 会覆盖白色(255)，实现叠加镂空
                                const minVal = Math.min(currentData.data[i], newData.data[i]);
                                currentData.data[i] = minVal;
                                currentData.data[i + 1] = minVal;
                                currentData.data[i + 2] = minVal;
                            }
                            mCtx.putImageData(currentData, 0, 0);
                        }
                    };
                    maskImg.src = result.mask_url;
                    updateData({ semanticMaskUrl: result.mask_url, semanticPreviewUrl: result.preview_url, semanticDescription: result.description });
                }
            } catch (error) {
                console.error('语义抠图失败:', error);
                alert('语义抠图失败: ' + (error.message || '请检查描述或稍后重试'));
            } finally {
                setIsProcessing(false);
            }
        };

        const handleExport = () => {
            if (!data.previewUrl) { generatePreview(); return; }
            const link = document.createElement('a');
            link.download = `mask-fill-${Date.now()}.png`;
            link.href = data.previewUrl;
            link.click();
        };

        if (!BaseNode) return <div className="p-4 bg-red-500 text-white">Error: BaseNode Missing</div>;

        return (
            <BaseNode
                id={id}
                title="遮罩抠图与合成"
                icon={Scissors}
                selected={selected}
                style={{ width: '520px' }}
                handles={{
                    source: [{ id: 'output', top: '50%' }],
                    target: [{ id: 'input', top: '20%' }],
                }}
            >
                <div className="flex gap-4">
                    {/* 左侧：预览区 */}
                    <div className="flex flex-col gap-3" style={{ width: '280px' }}>
                        {/* 底图预览 + Mask 叠加 */}
                        <div
                            className="relative w-full bg-zinc-50 border border-black overflow-hidden group cursor-pointer"
                            style={{ aspectRatio: '3 / 4', minHeight: '180px' }}
                            onMouseDown={handleSamMouseDown}
                            onMouseMove={handleSamMouseMove}
                            onMouseUp={handleSamMouseUp}
                        >
                            {data.baseImage ? (
                                <>
                                    <img
                                        src={data.baseImage}
                                        className="w-full h-full object-contain"
                                        alt="base"
                                        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
                                    />
                                    <canvas
                                        ref={maskCanvasRef}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        style={{
                                            position: 'absolute', inset: 0, zIndex: 2,
                                            width: '100%', height: '100%',
                                            cursor: activeTab === 'manual' ? 'crosshair' : activeTab === 'sam' ? (samMode === 'point' ? 'crosshair' : 'crosshair') : 'default',
                                            opacity: 0.5,
                                        }}
                                    />
                                    {/* MobileSAM 点标记 */}
                                    {activeTab === 'sam' && samPoints.map((p, idx) => (
                                        <div
                                            key={idx}
                                            className="absolute z-10 w-2 h-2 bg-red-500 rounded-full border border-white"
                                            style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, transform: 'translate(-50%, -50%)' }}
                                        />
                                    ))}
                                    {/* MobileSAM 框标记 */}
                                    {activeTab === 'sam' && samBox && (
                                        <div
                                            className="absolute z-10 border-2 border-red-500 bg-red-500/10"
                                            style={{
                                                left: `${samBox.x * 100}%`,
                                                top: `${samBox.y * 100}%`,
                                                width: `${samBox.w * 100}%`,
                                                height: `${samBox.h * 100}%`,
                                            }}
                                        />
                                    )}
                                    {/* 更换图片按钮 */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); baseFileInputRef.current?.click(); }}
                                        className="absolute bottom-2 left-2 z-10 px-2 py-1 bg-black text-white text-[9px] font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        更换图片
                                    </button>
                                </>
                            ) : (
                                <div
                                    className="w-full h-full bg-zinc-50 flex flex-col items-center justify-center text-zinc-300 gap-1 cursor-pointer relative"
                                    onClick={() => baseFileInputRef.current?.click()}
                                >
                                    <Upload size={24} strokeWidth={1} />
                                    <span className="text-[9px] uppercase font-black">暂无图片</span>
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                        <span className="text-white text-[10px] font-black opacity-0 group-hover:opacity-100">本地上传</span>
                                    </div>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={baseFileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => handleBaseImageUpload(e.target.files[0])}
                            />
                        </div>

                        {/* hidden canvas 用于像素合成 */}
                        <canvas ref={baseCanvasRef} style={{ display: 'none' }} />

                        {/* 合成结果预览 */}
                        {data.previewUrl && (
                            <div className="w-full border border-black overflow-hidden">
                                <div className="bg-black text-white text-[9px] font-black px-2 py-1">合成预览</div>
                                <img src={data.previewUrl} className="w-full object-contain" style={{ maxHeight: '200px' }} alt="preview" />
                            </div>
                        )}

                        {/* 底图操作按钮 */}
                        {data.baseImage && (
                            <div className="flex gap-2">
                                <button
                                    onClick={clearMask}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase"
                                >
                                    <Trash2 size={12} />
                                    清空
                                </button>
                                <button
                                    onClick={invertMask}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase"
                                >
                                    <Undo size={12} />
                                    反转
                                </button>
                                <button
                                    onClick={() => { updateData({ baseImage: null, previewUrl: null, content: null }); clearMask(); }}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-black text-[10px] font-black hover:bg-black hover:text-white transition-all uppercase"
                                >
                                    <X size={12} />
                                    移除
                                </button>
                            </div>
                        )}

                    </div>

                    {/* 右侧：操作面板 */}
                    <div className="flex flex-col gap-3" style={{ width: '200px' }}>
                        {/* Tab 切换 */}
                        <div className="flex border border-black">
                            <button
                                onClick={() => setActiveTab('manual')}
                                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'manual' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                            >
                                手动
                            </button>
                            <button
                                onClick={() => setActiveTab('auto')}
                                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'auto' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                            >
                                AI
                            </button>
                            <button
                                onClick={() => setActiveTab('semantic')}
                                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'semantic' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                            >
                                语义
                            </button>
                            <button
                                onClick={() => setActiveTab('sam')}
                                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter transition-all ${activeTab === 'sam' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                            >
                                点选
                            </button>
                        </div>

                        {/* 手动选区 */}
                        {activeTab === 'manual' && data.baseImage && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">画笔 {brushSize}px</span>
                                    <div className="flex border border-black">
                                        <button
                                            onClick={() => setIsErasing(false)}
                                            className={`p-1 ${!isErasing ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                                            title="镂空"
                                        >
                                            <Eraser size={10} />
                                        </button>
                                        <button
                                            onClick={() => setIsErasing(true)}
                                            className={`p-1 ${isErasing ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                                            title="恢复"
                                        >
                                            <Undo size={10} />
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="100"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(Number(e.target.value))}
                                    className="w-full accent-black"
                                />
                                <span className="text-[9px] text-zinc-400">
                                    {isErasing ? '白色 = 恢复保留' : '黑色 = 镂空区域'}
                                </span>
                            </div>
                        )}

                        {/* AI 抠图 + 填充图 */}
                        {activeTab === 'auto' && data.baseImage && (
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleAutoSegment}
                                    disabled={isProcessing}
                                    className={`w-full py-2 border border-black text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5
                                        ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' : 'bg-black text-white hover:bg-zinc-800'}`}
                                >
                                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                                    {isProcessing ? '识别中...' : '智能抠图'}
                                </button>
                                {data.autoPreviewUrl && (
                                    <div className="w-full border border-black/10 overflow-hidden" style={{ maxHeight: '120px' }}>
                                        <img src={data.autoPreviewUrl} className="w-full h-full object-contain" alt="auto" />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 语义抠图 */}
                        {activeTab === 'semantic' && data.baseImage && (
                            <div className="flex flex-col gap-2">
                                <textarea
                                    value={semanticPrompt}
                                    onChange={(e) => setSemanticPrompt(e.target.value)}
                                    placeholder="保留相框边框，去掉中间照片"
                                    className="w-full h-16 p-2 border border-black/20 text-[10px] text-black placeholder:text-zinc-400 resize-none focus:border-black focus:outline-none transition-all"
                                />
                                <button
                                    onClick={handleSemanticSegment}
                                    disabled={isProcessing || !semanticPrompt.trim()}
                                    className={`w-full py-2 border border-black text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5
                                        ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' : 'bg-black text-white hover:bg-zinc-800'}`}
                                >
                                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                                    {isProcessing ? '分析中...' : '语义抠图'}
                                </button>
                                {data.semanticDescription && (
                                    <span className="text-[9px] font-black text-zinc-500">{data.semanticDescription}</span>
                                )}
                                {data.semanticPreviewUrl && (
                                    <div className="w-full border border-black/10 overflow-hidden" style={{ maxHeight: '120px' }}>
                                        <img src={data.semanticPreviewUrl} className="w-full h-full object-contain" alt="semantic" />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MobileSAM 点选模式 */}
                        {activeTab === 'sam' && data.baseImage && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">智能分割模式</span>
                                <div className="flex border border-black">
                                    <button
                                        onClick={() => { setSamMode('point'); clearSamSelection(); }}
                                        className={`flex-1 py-1 text-[9px] font-black uppercase transition-all ${samMode === 'point' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                                    >
                                        点选
                                    </button>
                                    <button
                                        onClick={() => { setSamMode('box'); clearSamSelection(); }}
                                        className={`flex-1 py-1 text-[9px] font-black uppercase transition-all ${samMode === 'box' ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-100'}`}
                                    >
                                        框选
                                    </button>
                                </div>
                                <span className="text-[9px] text-zinc-400 leading-tight">
                                    {samMode === 'point'
                                        ? '在左侧图片上点击想要保留的区域，可点击多个点'
                                        : '在左侧图片上拖拽画一个框住目标的矩形'}
                                </span>
                                {(samPoints.length > 0 || samBox) && (
                                    <button
                                        onClick={clearSamSelection}
                                        className="w-full py-1.5 border border-black text-[9px] font-black uppercase hover:bg-black hover:text-white transition-all"
                                    >
                                        清除选择
                                    </button>
                                )}
                                <button
                                    onClick={handleSamSegment}
                                    disabled={isProcessing || (samMode === 'point' && samPoints.length === 0) || (samMode === 'box' && !samBox)}
                                    className={`w-full py-2 border border-black text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5
                                        ${isProcessing ? 'bg-zinc-800 text-white cursor-wait' : 'bg-black text-white hover:bg-zinc-800'}`}
                                >
                                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                                    {isProcessing ? '分割中...' : '运行智能分割'}
                                </button>
                                {data.samPreviewUrl && (
                                    <div className="w-full border border-black/10 overflow-hidden" style={{ maxHeight: '120px' }}>
                                        <img src={data.samPreviewUrl} className="w-full h-full object-contain" alt="sam" />
                                    </div>
                                )}
                                {data.semanticDescription && (
                                    <div className="w-full bg-zinc-50 border border-zinc-200 px-2 py-1.5">
                                        <span className="text-[9px] text-zinc-500 leading-tight block">
                                            <span className="font-black text-zinc-700">识别结果：</span>
                                            {data.semanticDescription}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 填充图 — 所有模式共用 */}
                        {data.baseImage && (
                            <div className="flex flex-col gap-2 border-t border-black/10 pt-3 mt-1">
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">填充图</span>
                                {!data.fillImage ? (
                                    <div
                                        className="w-full aspect-video bg-zinc-50 border border-black overflow-hidden relative group cursor-pointer hover:bg-zinc-100 transition-all"
                                        onClick={() => fillFileInputRef.current?.click()}
                                    >
                                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-1">
                                            <ImageIcon size={20} strokeWidth={1} />
                                            <span className="text-[9px] uppercase font-black">上传填充素材</span>
                                        </div>
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                            <span className="text-white text-[9px] font-black opacity-0 group-hover:opacity-100">本地上传</span>
                                        </div>
                                        <input
                                            type="file"
                                            ref={fillFileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleFillImageUpload(e.target.files[0])}
                                        />
                                    </div>
                                ) : (
                                    <div className="relative w-full border border-black/10 overflow-hidden" style={{ maxHeight: '100px' }}>
                                        <img src={data.fillImage} className="w-full h-full object-contain" alt="fill" />
                                        <button
                                            onClick={() => updateData({ fillImage: null, previewUrl: null, content: null })}
                                            className="absolute top-1 right-1 bg-black text-white p-1 hover:bg-zinc-800 transition-all"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                )}
                                {/* 合成与导出 */}
                                {data.fillImage && (
                                    <div className="flex flex-col gap-2 mt-1">
                                        <button
                                            onClick={generatePreview}
                                            className="w-full py-2 border border-black bg-white text-black text-[10px] font-black uppercase hover:bg-black hover:text-white transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <Move size={10} />
                                            合成并输出
                                        </button>
                                        <button
                                            onClick={handleExport}
                                            className="w-full py-2 border border-black bg-black text-white text-[10px] font-black uppercase hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <Download size={10} />
                                            导出结果
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.MaskFillNodeRF = MaskFillNode;
    console.log('[MaskFillNodeRF] Registered');
})();
