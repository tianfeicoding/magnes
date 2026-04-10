// History Item Component
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};

    const { memo } = React;

    const HistoryItem = memo(({ item, isActive, onClick, timestamp }) => {
        return (
            <div
                className={`w-8 h-8 rounded-full cursor-pointer flex-shrink-0 relative group transition-all duration-300 ${isActive
                    ? 'ring-2 ring-white scale-110 z-10'
                    : 'opacity-50 hover:opacity-100 hover:scale-105'
                    }`}
                onClick={onClick}
            >
                {/* 缩略图 */}
                <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800 border border-zinc-700">
                    <canvas
                        ref={(canvas) => {
                            if (canvas && item) {
                                canvas.width = 30;
                                canvas.height = 30;
                                const ctx = canvas.getContext('2d');
                                // 将 ImageData 绘制到缩略图上 (可能会比较耗时，实际上应该在生成时就创建缩略图)
                                // 这里简化处理：暂时不绘制实际内容，只显示占位
                                ctx.fillStyle = '#3f3f46';
                                ctx.fillRect(0, 0, 30, 30);
                            }
                        }}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* 时间戳提示 */}
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[12px] font-mono text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 px-1 rounded">
                    {timestamp}
                </div>
            </div>
        );
    });

    window.MagnesComponents.UI.HistoryItem = HistoryItem;
})();
