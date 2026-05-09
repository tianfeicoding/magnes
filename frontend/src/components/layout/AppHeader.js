(function () {
    const { React } = window;
    const Icons = window.MagnesComponents?.UI?.Icons || {};
    const RefreshCw = Icons.RefreshCw || (() => null);
    const Settings = Icons.Settings || (() => null);
    const User = Icons.User || (() => null);
    const LogOut = Icons.LogOut || (() => null);
    const Plus = Icons.Plus || (() => null);
    const Save = Icons.Save || (() => null);
    const ChevronDown = Icons.ChevronDown || (() => null);
    const Layout = Icons.Layout || (() => null);
    const Check = Icons.Check || (() => null);

    /**
     * 应用顶部导航栏组件
     * 包含产品名称、Tab 切换以及系统操作按钮
     */
    const AppHeader = ({
        activeTab,
        setActiveTab,
        loadStats,
        setSettingsOpen,
        // 项目相关
        projectName,
        onNewProject,
        onSaveSkillDraft,
        isSavingSkillDraft,
        // 用户认证相关
        user,
        isLoggedIn,
        setLoginModalOpen,
        handleLogout
    }) => {
        // 处理登出
        const onLogout = () => {
            handleLogout();
        };

        return (
            <div className="h-16 bg-white border-b border-black flex items-center px-6 justify-between shrink-0 z-[100] relative">
                <div className="flex items-center gap-3">
                    <h1 className="font-bold text-2xl text-black tracking-tighter">Magnes</h1>
                </div>

                {/* 中央 Tab 切换区域 */}
                <div className="flex items-center -space-x-[1px] absolute left-1/2 -translate-x-1/2">
                    {[
                        { key: 'canvas', label: '画布' },
                        { key: 'knowledge', label: '知识库' },
                        { key: 'xhs', label: '灵感库' },
                        { key: 'gallery', label: '生图库' },
                        { key: 'skills', label: '技能库' },
                        { key: 'my-projects', label: '我的项目' }
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
                    {isLoggedIn && (activeTab === 'canvas' || activeTab === 'my-projects') && (
                        <button
                            onClick={onNewProject}
                            className="w-8 h-8 flex items-center justify-center border border-black bg-white text-black hover:bg-zinc-50 transition-all"
                            title="新建项目"
                        >
                            <Plus size={16} />
                        </button>
                    )}
                    {isLoggedIn && activeTab === 'canvas' && (
                        <button
                            onClick={onSaveSkillDraft}
                            disabled={isSavingSkillDraft}
                            className="w-8 h-8 flex items-center justify-center border border-black bg-white text-black hover:bg-zinc-50 transition-all disabled:opacity-40"
                            title="保存当前画布为技能草稿"
                        >
                            <Save size={16} />
                        </button>
                    )}
                    <button onClick={() => setSettingsOpen(true)} className="text-black/40 hover:text-black mt-1">
                        <Settings size={18} />
                    </button>

                    {/* 用户登录/登出区域 */}
                    <div className="flex items-center">
                        {isLoggedIn ? (
                            <button
                                onClick={onLogout}
                                className="text-black/40 hover:text-black mt-1"
                                title="退出登录"
                            >
                                <LogOut size={18} />
                            </button>
                        ) : (
                            <button
                                onClick={() => setLoginModalOpen(true)}
                                className="text-black/40 hover:text-black mt-1"
                                title="登录"
                            >
                                <User size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    window.MagnesComponents.Layout = window.MagnesComponents.Layout || {};
    window.MagnesComponents.Layout.AppHeader = AppHeader;
})();
