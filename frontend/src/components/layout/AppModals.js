(function () {
    const { React } = window;
    const { Modal } = window.MagnesComponents.UI;

    /**
     * 全局模态窗管理组件
     * 容器级组件，汇集了发布、草稿、详情、来源等所有系统弹窗
     */
    const { Toast } = window.MagnesComponents.Rag.Components;
    const {
        XhsPublishModal,
        DraftModal,
        NoteDetailModal,
        SourceModal
    } = window.MagnesComponents.Rag.Modals;

    /**
     * 应用全局弹窗容器组件
     * 汇集了草稿、发布、详情、来源溯源、设置以及 Toast 通知
     */
    const AppModals = ({
        // 草稿箱状态
        draftModalOpen,
        setDraftModalOpen,
        draftContent,
        setDraftContent,
        isDraftReadOnly,
        draftTemplateId,
        setDraftTemplateId,
        // 发布状态
        publishModalOpen,
        setPublishModalOpen,
        publishData,
        confirmPublish,
        isPublishing,
        // 详情状态
        detailModalOpen,
        setDetailModalOpen,
        selectedDetailDoc,
        detailContentOverride,
        toast,
        // 来源状态
        sourceModalOpen,
        setSourceModalOpen,
        sourceDocIds,
        activeSourceMap,
        sourceContent,
        // 通知状态
        toastMsg,
        toastType,
        toastPersistent,
        setToastMsg,
        // 全局设置状态
        settingsOpen,
        setSettingsOpen,
        apiKeys,
        setApiKeys,
        jimengUseLocalFile,
        setJimengUseLocalFile
    }) => {
        const h = React.createElement;

        // 编辑模式状态
        const [isDraftEditMode, setIsDraftEditMode] = React.useState(false);
        const [draftEditCallback, setDraftEditCallback] = React.useState(null);

        React.useEffect(() => {
            const handleOpenEdit = (e) => {
                const { content, onConfirm } = e.detail;
                setDraftContent(content);
                setIsDraftEditMode(true);
                setDraftEditCallback(() => onConfirm);
                setDraftModalOpen(true);
            };
            window.addEventListener('magnes:open_draft_for_edit', handleOpenEdit);
            return () => window.removeEventListener('magnes:open_draft_for_edit', handleOpenEdit);
        }, [setDraftContent, setDraftModalOpen]);

        return (
            <React.Fragment>
                {/* 1. 草稿编辑/查看弹窗 */}
                {draftModalOpen && h(DraftModal, {
                    isOpen: draftModalOpen,
                    onClose: () => {
                        setDraftModalOpen(false);
                        setIsDraftEditMode(false);
                        setDraftEditCallback(null);
                    },
                    initialContent: draftContent,
                    isReadOnly: isDraftReadOnly,
                    isEditMode: isDraftEditMode,
                    onConfirm: (newContent) => {
                        if (draftEditCallback) draftEditCallback(newContent);
                        setDraftModalOpen(false);
                        setIsDraftEditMode(false);
                        setDraftEditCallback(null);
                    },
                    onSyncToCanvas: (c, options) => {
                        window.dispatchEvent(new CustomEvent('magnes:sync_to_canvas', {
                            detail: {
                                content: c,
                                ...options,
                                templateId: draftTemplateId
                            }
                        }));
                        setDraftModalOpen(false);
                        if (setDraftTemplateId) setDraftTemplateId(null);
                    }
                })}

                {/* 2. 小红书发布确认弹窗 */}
                {publishModalOpen && h(XhsPublishModal, {
                    isOpen: publishModalOpen,
                    onClose: () => setPublishModalOpen(false),
                    data: publishData,
                    onConfirm: confirmPublish,
                    loading: isPublishing
                })}

                {/* 3. 笔记/文档详情弹窗 */}
                {detailModalOpen && h(NoteDetailModal, {
                    doc: selectedDetailDoc,
                    contentOverride: detailContentOverride,
                    onClose: () => setDetailModalOpen(false),
                    toast
                })}

                {/* 4. 来源溯源弹窗 */}
                {sourceModalOpen && h(SourceModal, {
                    isOpen: sourceModalOpen,
                    onClose: () => setSourceModalOpen(false),
                    docIds: sourceDocIds,
                    sourceMap: activeSourceMap,
                    content: sourceContent,
                    toast
                })}

                {/* 5. 全局 Toast 通知 */}
                {toastMsg && h(Toast, {
                    message: toastMsg,
                    type: toastType,
                    persistent: toastPersistent,
                    onDone: () => setToastMsg('')
                })}

                {/* 6. 模型与全局设置弹窗 */}
                <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="模型配置" theme="light">
                    <div className="p-8 space-y-10">
                        {/* 1. Global API Configuration */}
                        <div className="flex flex-col gap-5">
                            <div className="flex justify-between items-end">
                                <label className="text-[14px] font-bold uppercase tracking-wider text-zinc-900">常规对话配置 (Global)</label>
                                <span className="text-[10px] text-zinc-400 italic">用于 对话助手、RAG 和 节点 等</span>
                            </div>

                            <div className="flex flex-col gap-3">
                                {/* URL Input */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-zinc-500 font-medium">API 基础路径 (Base URL)</span>
                                        <button
                                            onClick={() => setApiKeys({ ...apiKeys, global_api_url: 'https://ai.t8star.cn' })}
                                            className="text-[10px] text-blue-500 hover:text-blue-700 underline"
                                        >
                                            使用 t8star 预设
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={apiKeys.global_api_url || ''}
                                        onChange={(e) => setApiKeys({ ...apiKeys, global_api_url: e.target.value })}
                                        placeholder="https://ai.t8star.cn"
                                        className="border-b border-zinc-200 py-2 text-[13px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800"
                                    />
                                </div>

                                {/* Key Input */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] text-zinc-500 font-medium">API Key</span>
                                    <div className="flex gap-3">
                                        <input
                                            type="password"
                                            value={apiKeys.global_api_key || ''}
                                            onChange={(e) => setApiKeys({ ...apiKeys, global_api_key: e.target.value })}
                                            placeholder="输入 t8star 或其他供应商 API Key"
                                            className="flex-1 border-b border-zinc-200 py-2 text-[13px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800"
                                        />
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const API = window.MagnesComponents.Utils.API;
                                                    const results = await Promise.all([
                                                        API.magnesFetch('/auth/config', {
                                                            method: 'POST',
                                                            body: JSON.stringify({ value: apiKeys.global_api_url, config_type: 'global_api_url' })
                                                        }),
                                                        API.magnesFetch('/auth/config', {
                                                            method: 'POST',
                                                            body: JSON.stringify({ value: apiKeys.global_api_key, config_type: 'global_api_key' })
                                                        })
                                                    ]);
                                                    if (results.every(r => r.ok)) alert('✅ 常规配置已安全保存');
                                                    else alert('❌ 部分保存失败');
                                                } catch (e) { alert('❌ 保存异常'); }
                                            }}
                                            className="px-4 py-2 text-[10px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase whitespace-nowrap"
                                        >
                                            SAVE GLOBAL
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Slicer API Configuration */}
                        <div className="flex flex-col gap-5">
                            <div className="flex justify-between items-end">
                                <label className="text-[14px] font-bold uppercase tracking-wider text-zinc-900">智能分层配置 (Slicer)</label>
                                <span className="text-[10px] text-zinc-400 italic">仅用于“视觉分析-智能分层”</span>
                            </div>

                            <div className="flex flex-col gap-3">
                                {/* URL Input */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[11px] text-zinc-500 font-medium">API 基础路径 (Base URL)</span>
                                        <button
                                            onClick={() => setApiKeys({ ...apiKeys, slicer_api_url: 'https://api.302.ai' })}
                                            className="text-[10px] text-orange-500 hover:text-orange-700 underline"
                                        >
                                            使用 302.ai 预设
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={apiKeys.slicer_api_url || ''}
                                        onChange={(e) => setApiKeys({ ...apiKeys, slicer_api_url: e.target.value })}
                                        placeholder="https://api.302.ai"
                                        className="border-b border-zinc-200 py-2 text-[13px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800"
                                    />
                                </div>

                                {/* Key Input */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[11px] text-zinc-500 font-medium">API Key</span>
                                    <div className="flex gap-3">
                                        <input
                                            type="password"
                                            value={apiKeys.slicer_api_key || ''}
                                            onChange={(e) => setApiKeys({ ...apiKeys, slicer_api_key: e.target.value })}
                                            placeholder="输入 302.ai API Key"
                                            className="flex-1 border-b border-zinc-200 py-2 text-[13px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800"
                                        />
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const API = window.MagnesComponents.Utils.API;
                                                    const results = await Promise.all([
                                                        API.magnesFetch('/auth/config', {
                                                            method: 'POST',
                                                            body: JSON.stringify({ value: apiKeys.slicer_api_url, config_type: 'slicer_api_url' })
                                                        }),
                                                        API.magnesFetch('/auth/config', {
                                                            method: 'POST',
                                                            body: JSON.stringify({ value: apiKeys.slicer_api_key, config_type: 'slicer_api_key' })
                                                        })
                                                    ]);
                                                    if (results.every(r => r.ok)) alert('✅ 分层配置已安全保存');
                                                    else alert('❌ 部分保存失败');
                                                } catch (e) { alert('❌ 保存异常'); }
                                            }}
                                            className="px-4 py-2 text-[10px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase whitespace-nowrap"
                                        >
                                            SAVE SLICER
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[11px] text-zinc-400 bg-zinc-50 p-3 border border-dashed border-zinc-200 leading-relaxed">
                                <strong>💡 提示：</strong> “智能分层”目前深度适配 302.ai 的 Qwen 拆图协议。若更换为通用多模态 URL，自动拆图层功能可能会受限。
                            </p>
                        </div>

                        {/* 3. Local File Mode */}
                        {/* <div className="space-y-4 pt-6 border-t border-zinc-100">
                            <div className="flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-[14px] font-bold uppercase tracking-wider text-zinc-900">使用本地文件模式</span>
                                    <span className="text-[11px] text-zinc-400 mt-0.5">Local File Data Interceptor</span>
                                </div>
                                <button
                                    onClick={() => setJimengUseLocalFile(!jimengUseLocalFile)}
                                    className={`w-12 h-6 border-[1.5px] border-black flex p-0.5 transition-colors duration-300 ${jimengUseLocalFile ? 'bg-black' : 'bg-white'}`}
                                >
                                    <div className={`w-4 h-4 ${jimengUseLocalFile ? 'translate-x-[22px] bg-white' : 'bg-black'} transition-transform duration-300`}></div>
                                </button>
                            </div>
                            <div className="bg-zinc-50 p-4 border border-zinc-100">
                                <p className="text-[12px] text-zinc-600 leading-relaxed">
                                    <strong>原理说明：</strong> 在本地开发环境中，外部 API (如 t8star/302.ai) 无法直接访问您的 <code>localhost</code> 本地链接。
                                    开启此模式后，系统会在发送请求前将本地图片自动转换为 <strong>Base64 数据流</strong>，确保远程模型能够正常读取并处理您的作品素材。
                                </p>
                            </div>
                        </div> */}
                    </div>
                </Modal>
            </React.Fragment>
        );
    };

    window.MagnesComponents.Layout = window.MagnesComponents.Layout || {};
    window.MagnesComponents.Layout.AppModals = AppModals;
})();
