(function () {
    const { React } = window;
    const { History, RefreshCw, Settings } = window.MagnesComponents.UI.Icons;

    /**
     * 应用顶部导航栏组件
     * 包含产品名称、Tab 切换以及系统操作按钮
     */
    const AppHeader = ({
        activeTab,
        setActiveTab,
        historyOpen,
        setHistoryOpen,
        historyCount,
        loadStats,
        setSettingsOpen
    }) => {
        return (
            <div className="h-16 bg-white border-b border-black flex items-center px-6 justify-between shrink-0 z-[100] relative">
                <h1 className="font-bold text-2xl text-black tracking-tighter">Magnes</h1>

                {/* 中央 Tab 切换区域 */}
                <div className="flex items-center -space-x-[1px] absolute left-1/2 -translate-x-1/2">
                    {[
                        { key: 'canvas', label: '工作流画布' },
                        { key: 'knowledge', label: '品牌知识库' },
                        { key: 'xhs', label: '笔记灵感库' },
                        { key: 'gallery', label: 'AI生图库' }
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-6 py-2 border border-black text-[13px] font-bold transition-all ${activeTab === tab.key ? 'bg-black text-white' : 'bg-white text-black hover:bg-zinc-50'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* 右侧操作区域 */}
                <div className="flex items-center gap-4">
                    {activeTab === 'canvas' ? (
                        <button
                            onClick={() => setHistoryOpen(!historyOpen)}
                            className="text-black/40 hover:text-black mt-1 relative"
                        >
                            <History size={18} />
                        </button>
                    ) : (
                        <button onClick={loadStats} className="text-black/40 hover:text-black mt-1">
                            <RefreshCw size={18} />
                        </button>
                    )}
                    <button onClick={() => setSettingsOpen(true)} className="text-black/40 hover:text-black mt-1">
                        <Settings size={18} />
                    </button>
                </div>
            </div>
        );
    };

    window.MagnesComponents.Layout = window.MagnesComponents.Layout || {};
    window.MagnesComponents.Layout.AppHeader = AppHeader;
})();
