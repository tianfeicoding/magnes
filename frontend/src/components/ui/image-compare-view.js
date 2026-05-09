// Image Compare View
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};

    const { useState, useRef, useCallback, useEffect, memo } = React;
    const { Icons } = window.MagnesComponents.UI;

    const ImageCompareView = memo(({ img1, img2 }) => {
        const [pos, setPos] = useState(50);
        const containerRef = useRef(null);
        const [isHovering, setIsHovering] = useState(false);
        const requestRef = useRef();

        const handleMove = useCallback((e) => {
            if (!containerRef.current) return;

            // Use requestAnimationFrame for performance
            if (requestRef.current) return;

            requestRef.current = requestAnimationFrame(() => {
                if (!containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
                setPos((x / rect.width) * 100);
                requestRef.current = null;
            });
        }, []);

        useEffect(() => {
            return () => {
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                }
            };
        }, []);

        const displayImg1 = img1;
        const displayImg2 = img2 || img1;

        if (!displayImg1) return (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed pointer-events-none">
                <Icons.Wrapper name="Image" size={32} className="mb-2 opacity-50" />
                <span className="text-xs">Waiting for input...</span>
            </div>
        );

        return (
            <div
                ref={containerRef}
                className="relative w-full h-full select-none overflow-hidden rounded-lg group"
                onMouseMove={handleMove}
                onTouchMove={handleMove}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                {/* Background Image (Right side shown effectively) */}
                <img
                    src={displayImg2}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    alt="After"
                    draggable={false}
                />

                {/* Foreground Image (Left side, clipped) */}
                <div
                    className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none border-r-2 border-white/50 shadow-[2px_0_5px_rgba(0,0,0,0.3)]"
                    style={{ width: `${pos}%` }}
                >
                    <img
                        src={displayImg1}
                        className="absolute top-0 left-0 max-w-none h-full object-cover"
                        style={{ width: containerRef.current ? containerRef.current.clientWidth : '100%' }}
                        alt="Before"
                        draggable={false}
                    />
                </div>

                {/* Slider Handle */}
                <div
                    className="absolute top-0 bottom-0 w-8 -ml-4 cursor-ew-resize flex items-center justify-center z-10 transition-opacity duration-200"
                    style={{ left: `${pos}%`, opacity: isHovering ? 1 : 0.6 }}
                >
                    <div className="w-[2px] h-full bg-white/50 shadow-[0_0_4px_rgba(0,0,0,0.5)]"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/40 shadow-lg flex items-center justify-center text-white transfrom hover:scale-110 transition-transform">
                        <Icons.Wrapper name="Code" size={14} className="rotate-90" />
                    </div>
                </div>

                {/* Labels */}
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white text-[12px] px-1.5 py-0.5 rounded pointer-events-none border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    BEFORE
                </div>
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur text-white text-[12px] px-1.5 py-0.5 rounded pointer-events-none border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    AFTER
                </div>
            </div>
        );
    });

    window.MagnesComponents.UI.ImageCompareView = ImageCompareView;
})();
