// Mask Editor Component
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};

    const { useState, useRef, useEffect } = React;
    const { Icons } = window.MagnesComponents.UI;

    const MaskEditor = ({ nodeId, imageUrl, imageDimensions, isActive, onClose, onSave, theme, view, maskContent, onUpdateNode }) => {
        const canvasRef = useRef(null);
        const ctxRef = useRef(null);
        const [isDrawing, setIsDrawing] = useState(false);
        const [brushSize, setBrushSize] = useState(30);
        // Local history for mask editing
        const [history, setHistory] = useState([]);
        const [historyIndex, setHistoryIndex] = useState(-1);
        const maxHistory = 20;

        useEffect(() => {
            if (!isActive || !imageDimensions || !canvasRef.current) return;

            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctxRef.current = ctx;

            // Set canvas size to image dimensions
            canvas.width = imageDimensions.w;
            canvas.height = imageDimensions.h;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Restore mask if exists
            if (maskContent) {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                    saveToHistory();
                };
                img.src = maskContent;
            } else {
                saveToHistory();
            }
        }, [isActive, imageDimensions, nodeId, maskContent]);

        const saveToHistory = () => {
            if (!canvasRef.current || !ctxRef.current) return;
            const canvas = canvasRef.current;
            const ctx = ctxRef.current;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            setHistory(prev => {
                const newHistory = prev.slice(0, historyIndex + 1);
                newHistory.push(imageData);
                if (newHistory.length > maxHistory) newHistory.shift();
                return newHistory;
            });

            // Since we can't depend on state instantly, we calculate index
            setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1));
            // Correct logic: index is new length - 1, bounded
        };

        const getCanvasCoordinates = (e) => {
            if (!canvasRef.current) return null;
            const canvas = canvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: Math.round(x * scaleX),
                y: Math.round(y * scaleY)
            };
        };

        const draw = (e) => {
            if (!isDrawing || !canvasRef.current || !ctxRef.current) return;
            const coords = getCanvasCoordinates(e);
            if (!coords) return;
            const ctx = ctxRef.current;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        };

        // Event Handlers
        const handleMouseDown = (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            setIsDrawing(true);
            saveToHistory();
            draw(e);
        };
        const handleMouseMove = (e) => {
            if (!isDrawing) return;
            e.preventDefault(); e.stopPropagation();
            draw(e);
        };
        const handleMouseUp = (e) => {
            if (!isDrawing) return;
            e.preventDefault(); e.stopPropagation();
            setIsDrawing(false);
            saveToHistory();
        };

        const handleUndo = () => {
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                const imageData = history[newIndex];
                if (imageData && ctxRef.current) {
                    ctxRef.current.putImageData(imageData, 0, 0);
                    setHistoryIndex(newIndex);
                }
            } else if (historyIndex === 0) {
                // Clear to initial
                const ctx = ctxRef.current;
                if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                setHistoryIndex(-1);
            }
        };

        const handleSave = () => {
            if (canvasRef.current) {
                const dataUrl = canvasRef.current.toDataURL(); // PNG
                onSave(nodeId, dataUrl);
                onClose();
            }
        };

        if (!isActive) return null;

        return (
            <div className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
                    {/* Header */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900/90 rounded-full px-6 py-2 flex items-center gap-4 border border-zinc-700 shadow-xl z-20">
                        <div className="flex items-center gap-2">
                            <Icons.Wrapper name="Brush" size={14} className="text-zinc-400" />
                            <input
                                type="range" min="5" max="100"
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-24 accent-white h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-xs text-zinc-400 w-6">{brushSize}</span>
                        </div>
                        <div className="w-[1px] h-4 bg-zinc-700"></div>
                        <button onClick={handleUndo} className="p-1 hover:text-white text-zinc-400 transition-colors" title="Undo">
                            <Icons.Wrapper name="Undo2" size={16} />
                        </button>
                        <button onClick={() => {
                            if (ctxRef.current && canvasRef.current) {
                                ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                                saveToHistory();
                            }
                        }} className="p-1 hover:text-white text-zinc-400 transition-colors" title="Clear">
                            <Icons.Wrapper name="Eraser" size={16} />
                        </button>
                    </div>

                    {/* Canvas Container */}
                    <div className="relative rounded-lg overflow-hidden border border-zinc-700 shadow-2xl bg-[#18181b] group">
                        {/* Original Image Background */}
                        <img src={imageUrl} className="max-w-full max-h-[80vh] object-contain block opacity-50" draggable={false} />

                        {/* Drawing Canvas */}
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        />

                        {/* Brush Cursor Indicator */}
                        <div className="pointer-events-none absolute w-full h-full top-0 left-0 hidden group-hover:block overflow-hidden">
                            {/* Custom cursor usually handled by CSS or JS overlay, here simplified */}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors text-sm font-bold shadow-lg shadow-white/10"
                        >
                            Save Mask
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    window.MagnesComponents.UI.MaskEditor = MaskEditor;
})();
