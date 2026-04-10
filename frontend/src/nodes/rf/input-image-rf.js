/**
 * InputImageNode - React Flow 版本 (JSX)
 * 路径: src/nodes/rf/input-image-rf.js
 */

(function () {
    const { React } = window;
    const { useState, useCallback } = React;
    const ReactFlow = window.ReactFlow || window.ReactFlowRenderer;
    const { useReactFlow } = ReactFlow;

    // 依赖
    const MAGNES = window.MagnesComponents || {};
    const Icons = MAGNES.UI?.Icons || {};
    const { Image: ImageIcon, Upload, Trash2 } = Icons;
    const BaseNode = MAGNES.Nodes?.BaseNode;

    const isVideoUrl = (url) => {
        if (!url) return false;
        if (url.startsWith('data:video/')) return true;
        if (url.startsWith('data:')) return false; // Early exit for image data URLs
        return !!url.match(/\.(mp4|webm|ogg)$/i);
    };
    const getImageDimensions = (src) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.width, h: img.height });
            img.onerror = () => resolve({ w: 0, h: 0 });
            img.src = src;
        });
    };

    const InputImageNode = ({ id, data, selected }) => {
        const { setNodes } = useReactFlow();
        const [isHovered, setIsHovered] = useState(false);

        const updateData = useCallback((newData) => {
            setNodes((nds) =>
                nds.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...newData } } : node))
            );
        }, [id, setNodes]);

        const handleFileChange = async (file) => {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                const content = e.target.result;
                let dimensions = { w: 0, h: 0 };
                if (file.type.startsWith('image/')) {
                    dimensions = await getImageDimensions(content);
                }
                updateData({ content, dimensions, mimeType: file.type });
            };
            reader.readAsDataURL(file);
        };

        const hasContent = !!data.content;
        const isVideo = isVideoUrl(data.content);

        if (!BaseNode) return <div className="p-4 bg-red-500 text-white">Error: BaseNode Missing</div>;

        return (
            <BaseNode
                id={id}
                title="图片输入"
                icon={ImageIcon}
                selected={selected}
                style={{ width: '320px', minHeight: '300px' }}
                handles={{ source: [{ id: 'output', top: '50%' }] }}
            >
                <div
                    className={`relative w-full flex-1 overflow-hidden border border-black transition-all flex flex-col items-center justify-center
                               ${hasContent ? 'bg-zinc-900' : isHovered ? 'bg-zinc-50' : 'bg-white hover:bg-zinc-50'}`}
                    onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); setIsHovered(false); }}
                    onDragOver={(e) => { e.preventDefault(); setIsHovered(true); }}
                    onDragLeave={() => setIsHovered(false)}
                    style={{ aspectRatio: '1 / 1' }}
                >
                    <input
                        type="file"
                        accept="image/*,video/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={(e) => handleFileChange(e.target.files[0])}
                        disabled={hasContent}
                    />

                    {hasContent ? (
                        <div className="relative w-full h-full group">
                            {isVideo ? (
                                <video src={data.content} className="w-full h-full object-contain" controls />
                            ) : (
                                <img src={data.content} className="w-full h-full object-contain" alt="preview" />
                            )}

                            {data.dimensions && (
                                <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[12px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                                    {data.dimensions.w}x{data.dimensions.h}
                                </div>
                            )}

                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20 pointer-events-none">
                                <label className="bg-white text-black p-1 rounded cursor-pointer pointer-events-auto">
                                    <Upload size={16} />
                                    <input type="file" className="hidden" onChange={(e) => handleFileChange(e.target.files[0])} />
                                </label>
                                <button
                                    onClick={(e) => { e.stopPropagation(); updateData({ content: null, dimensions: null }); }}
                                    className="bg-red-500 text-white p-1 rounded pointer-events-auto"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center p-4 text-center pointer-events-none gap-3">
                            <ImageIcon size={32} strokeWidth={1} className="text-zinc-500" />
                            <span className="text-[12px] font-black text-zinc-500 tracking-widest uppercase">
                                请上传或拖拽图片素材
                            </span>
                        </div>
                    )}
                </div>
            </BaseNode>
        );
    };

    window.MagnesComponents.Nodes.InputImageNodeRF = InputImageNode;
    console.log('✅ InputImageNodeRF (JSX) Registered');
})();
