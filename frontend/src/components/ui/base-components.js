// Base UI Components
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};

    const { useMemo, useState, useEffect, useRef } = React;
    const { Icons } = window.MagnesComponents.UI;

    // --- Component: Mask Visual Feedback ---
    const MaskVisualFeedback = ({ canvasRef, isDrawing }) => {
        const [show, setShow] = useState(false);
        const [pos, setPos] = useState({ x: 0, y: 0 });

        useEffect(() => {
            if (!isDrawing || !canvasRef.current) {
                setShow(false);
                return;
            }

            const canvas = canvasRef.current;
            const updatePos = (e) => {
                const rect = canvas.getBoundingClientRect();
                setPos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                });
                setShow(true);
            };

            canvas.addEventListener('mousemove', updatePos);
            return () => canvas.removeEventListener('mousemove', updatePos);
        }, [isDrawing, canvasRef]);

        if (!show || !isDrawing) return null;

        return (
            <div
                className="pointer-events-none absolute z-50 w-4 h-4 rounded-full border-2 border-white shadow-sm bg-transparent transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: pos.x, top: pos.y }}
            />
        );
    };

    // --- Component: Lazy Base64 Image ---
    const LazyBase64Image = ({ src, className, alt, onError, onLoad, ...props }) => {
        const [isLoaded, setIsLoaded] = useState(false);
        const [error, setError] = useState(false);
        const imgRef = useRef();

        useEffect(() => {
            if (!src) return;
            const img = new Image();
            img.onload = () => {
                setIsLoaded(true);
                if (onLoad) onLoad();
            };
            img.onerror = () => {
                setError(true);
                if (onError) onError();
            };
            img.src = src;
        }, [src, onLoad, onError]);

        return (
            <div className={`relative overflow-hidden bg-zinc-800/50 ${className}`} {...props}>
                {!isLoaded && !error && (
                    <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                        <Icons.Wrapper name="Loader2" className="animate-spin" size={20} />
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-red-900/10">
                        <Icons.Wrapper name="AlertCircle" size={24} />
                    </div>
                )}
                {isLoaded && (
                    <img
                        src={src}
                        alt={alt || "content"}
                        className="w-full h-full object-cover animate-fade-in"
                        draggable={false}
                    />
                )}
            </div>
        );
    };

    // --- Component: Artistic Progress ---
    const ArtisticProgress = ({ visible, progress, status, type = 'default' }) => {
        if (!visible) return null;

        // Render implementation
        return (
            <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-500">
                <div className="relative mb-8">
                    {/* Outer Ring */}
                    <div className="absolute inset-[-20px] rounded-full border border-white/10 animate-[spin_4s_linear_infinite]"
                        style={{ borderTopColor: 'rgba(255,255,255,0.3)', borderLeftColor: 'transparent' }} />

                    {/* Progress Ring */}
                    <svg width="120" height="120" className="transform -rotate-90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        <circle cx="60" cy="60" r="54" fill="none" stroke="#2a2a2a" strokeWidth="2" />
                        <circle
                            cx="60" cy="60" r="54" fill="none" stroke="white" strokeWidth="2"
                            strokeDasharray={339.292}
                            strokeDashoffset={339.292 * (1 - progress / 100)}
                            className="transition-all duration-300 ease-out"
                            strokeLinecap="round"
                        />
                    </svg>

                    {/* Center Value */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-[200] tracking-tighter text-white font-mono">
                            {Math.round(progress)}
                            <span className="text-sm ml-1 opacity-50">%</span>
                        </span>
                    </div>
                </div>

                {/* Status Text (Typewriter effect) */}
                <div className="h-8 flex items-center">
                    <span className="text-zinc-400 font-mono tracking-[0.2em] text-sm uppercase animate-pulse">
                        {status || 'PROCESSING'}
                    </span>
                </div>

                {/* Decorative Line */}
                <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-zinc-700 to-transparent mt-8" />
            </div>
        );
    };

    window.MagnesComponents.UI.Base = {
        MaskVisualFeedback,
        LazyBase64Image,
        ArtisticProgress
    };
})();
