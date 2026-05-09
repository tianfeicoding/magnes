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
    const LoginModal = window.MagnesComponents?.UI?.LoginModal;

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
        draftInitialMsg,
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
        xhsPrecheckModalOpen,
        setXhsPrecheckModalOpen,
        xhsPrecheckInfo,
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
        setJimengUseLocalFile,
        // 登录弹窗状态
        loginModalOpen,
        setLoginModalOpen,
        onLoginSuccess
    }) => {
        const h = React.createElement;

        // 编辑模式状态
        const [isDraftEditMode, setIsDraftEditMode] = React.useState(false);
        const [draftEditCallback, setDraftEditCallback] = React.useState(null);

        // 设置面板 Tab 状态
        const [settingsTab, setSettingsTab] = React.useState('model');
        const [soulMd, setSoulMd] = React.useState('');
        const [soulLoading, setSoulLoading] = React.useState(false);
        const [memoryMd, setMemoryMd] = React.useState('');
        const [memoryMdLoading, setMemoryMdLoading] = React.useState(false);
        const [soulSaved, setSoulSaved] = React.useState(false);
        const [memoryMdSaved, setMemoryMdSaved] = React.useState(false);

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

        // 设置面板打开时加载 Soul.md 和 MEMORY.md
        React.useEffect(() => {
            if (!settingsOpen) return;

            const loadMemoryData = async () => {
                try {
                    const API = window.MagnesComponents.Utils.API;
                    const [soulRes, memoryRes] = await Promise.all([
                        API.magnesFetch('/memory/soul', { triggerLogin: true }),
                        API.magnesFetch('/memory/memory', { triggerLogin: true })
                    ]);
                    if (soulRes.ok) {
                        const soulData = await soulRes.json();
                        setSoulMd(soulData.data?.text || '');
                    }
                    if (memoryRes.ok) {
                        const memoryData = await memoryRes.json();
                        setMemoryMd(memoryData.data?.text || '');
                    }
                } catch (e) {
                    console.error('[AppModals] Failed to load memory data:', e);
                }
            };
            loadMemoryData();
        }, [settingsOpen]);

        const saveSoulMd = async () => {
            setSoulLoading(true);
            try {
                const API = window.MagnesComponents.Utils.API;
                const res = await API.magnesFetch('/memory/soul', {
                    method: 'POST',
                    triggerLogin: true,
                    body: JSON.stringify({ text: soulMd })
                });
                if (res.ok) {
                    setSoulSaved(true);
                    setTimeout(() => setSoulSaved(false), 1500);
                } else {
                    alert('❌ 保存失败');
                }
            } catch (e) {
                alert('❌ 保存异常');
            } finally {
                setSoulLoading(false);
            }
        };

        const saveMemoryMd = async () => {
            setMemoryMdLoading(true);
            try {
                const API = window.MagnesComponents.Utils.API;
                const res = await API.magnesFetch('/memory/memory', {
                    method: 'POST',
                    triggerLogin: true,
                    body: JSON.stringify({ text: memoryMd })
                });
                if (res.ok) {
                    setMemoryMdSaved(true);
                    setTimeout(() => setMemoryMdSaved(false), 1500);
                } else {
                    alert('❌ 保存失败');
                }
            } catch (e) {
                alert('❌ 保存异常');
            } finally {
                setMemoryMdLoading(false);
            }
        };

        const renderModelConfig = () => h('div', { className: 'p-8 space-y-10' }, [
            // 1. Global API Configuration
            h('div', { key: 'global', className: 'flex flex-col gap-5' }, [
                h('div', { key: 'label', className: 'flex justify-between items-end' }, [
                    h('label', { className: 'text-[12px] font-bold uppercase tracking-wider text-zinc-900' }, '常规对话配置 (Global)'),
                    h('span', { className: 'text-[10px] text-zinc-400 italic' }, '用于 对话助手、RAG 和 节点 等')
                ]),

                h('div', { key: 'inputs', className: 'flex flex-col gap-3' }, [
                    h('div', { key: 'url', className: 'flex flex-col gap-1.5' }, [
                        h('div', { className: 'flex justify-between items-center' }, [
                            h('span', { className: 'text-[11px] text-zinc-500 font-medium' }, 'API 基础路径 (Base URL)'),
                            h('button', {
                                onClick: () => setApiKeys({ ...apiKeys, global_api_url: 'https://ai.t8star.cn' }),
                                className: 'text-[10px] text-blue-500 hover:text-blue-700 underline'
                            }, '使用 t8star 预设')
                        ]),
                        h('input', {
                            type: 'text',
                            value: apiKeys.global_api_url || '',
                            onChange: (e) => setApiKeys({ ...apiKeys, global_api_url: e.target.value }),
                            placeholder: 'https://ai.t8star.cn',
                            className: 'border-b border-zinc-200 py-2 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800'
                        })
                    ]),

                    h('div', { key: 'key', className: 'flex flex-col gap-1.5' }, [
                        h('span', { className: 'text-[11px] text-zinc-500 font-medium' }, 'API Key'),
                        h('div', { className: 'flex gap-3' }, [
                            h('input', {
                                type: 'password',
                                value: apiKeys.global_api_key || '',
                                onChange: (e) => setApiKeys({ ...apiKeys, global_api_key: e.target.value }),
                                placeholder: '输入 t8star 或其他供应商 API Key',
                                className: 'flex-1 border-b border-zinc-200 py-2 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800'
                            }),
                            h('button', {
                                onClick: async () => {
                                    try {
                                        const API = window.MagnesComponents.Utils.API;
                                        const results = await Promise.all([
                                            API.magnesFetch('/auth/config', {
                                                method: 'POST',
                                                triggerLogin: true,
                                                body: JSON.stringify({ value: apiKeys.global_api_url, config_type: 'global_api_url' })
                                            }),
                                            API.magnesFetch('/auth/config', {
                                                method: 'POST',
                                                triggerLogin: true,
                                                body: JSON.stringify({ value: apiKeys.global_api_key, config_type: 'global_api_key' })
                                            })
                                        ]);
                                        if (results.every(r => r.ok)) alert('✅ 常规配置已安全保存');
                                        else alert('❌ 部分保存失败');
                                    } catch (e) { alert('❌ 保存异常'); }
                                },
                                className: 'px-4 py-2 text-[10px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase whitespace-nowrap'
                            }, 'SAVE GLOBAL')
                        ])
                    ])
                ])
            ]),

            // 2. Slicer API Configuration
            h('div', { key: 'slicer', className: 'flex flex-col gap-5' }, [
                h('div', { key: 'label', className: 'flex justify-between items-end' }, [
                    h('label', { className: 'text-[12px] font-bold uppercase tracking-wider text-zinc-900' }, '智能分层配置 (Slicer)'),
                    h('span', { className: 'text-[10px] text-zinc-400 italic' }, '仅用于"视觉分析-智能分层"')
                ]),

                h('div', { key: 'inputs', className: 'flex flex-col gap-3' }, [
                    h('div', { key: 'url', className: 'flex flex-col gap-1.5' }, [
                        h('div', { className: 'flex justify-between items-center' }, [
                            h('span', { className: 'text-[11px] text-zinc-500 font-medium' }, 'API 基础路径 (Base URL)'),
                            h('button', {
                                onClick: () => setApiKeys({ ...apiKeys, slicer_api_url: 'https://api.302.ai' }),
                                className: 'text-[10px] text-orange-500 hover:text-orange-700 underline'
                            }, '使用 302.ai 预设')
                        ]),
                        h('input', {
                            type: 'text',
                            value: apiKeys.slicer_api_url || '',
                            onChange: (e) => setApiKeys({ ...apiKeys, slicer_api_url: e.target.value }),
                            placeholder: 'https://api.302.ai',
                            className: 'border-b border-zinc-200 py-2 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800'
                        })
                    ]),

                    h('div', { key: 'key', className: 'flex flex-col gap-1.5' }, [
                        h('span', { className: 'text-[11px] text-zinc-500 font-medium' }, 'API Key'),
                        h('div', { className: 'flex gap-3' }, [
                            h('input', {
                                type: 'password',
                                value: apiKeys.slicer_api_key || '',
                                onChange: (e) => setApiKeys({ ...apiKeys, slicer_api_key: e.target.value }),
                                placeholder: '输入 302.ai API Key',
                                className: 'flex-1 border-b border-zinc-200 py-2 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800'
                            }),
                            h('button', {
                                onClick: async () => {
                                    try {
                                        const API = window.MagnesComponents.Utils.API;
                                        const results = await Promise.all([
                                            API.magnesFetch('/auth/config', {
                                                method: 'POST',
                                                triggerLogin: true,
                                                body: JSON.stringify({ value: apiKeys.slicer_api_url, config_type: 'slicer_api_url' })
                                            }),
                                            API.magnesFetch('/auth/config', {
                                                method: 'POST',
                                                triggerLogin: true,
                                                body: JSON.stringify({ value: apiKeys.slicer_api_key, config_type: 'slicer_api_key' })
                                            })
                                        ]);
                                        if (results.every(r => r.ok)) alert('✅ 分层配置已安全保存');
                                        else alert('❌ 部分保存失败');
                                    } catch (e) { alert('❌ 保存异常'); }
                                },
                                className: 'px-4 py-2 text-[10px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase whitespace-nowrap'
                            }, 'SAVE SLICER')
                        ])
                    ])
                ]),

                h('p', { key: 'tip', className: 'text-[11px] text-zinc-400 bg-zinc-50 p-3 border border-dashed border-zinc-200 leading-relaxed' },
                    h('span', null, '💡 提示："智能分层"目前深度适配 302.ai 的 Qwen 拆图协议。若更换为通用多模态 URL，自动拆图层功能可能会受限。')
                )
            ])
        ]);

        const renderSoulMd = () => h('div', { className: 'p-6 space-y-4 overflow-y-auto max-h-[70vh]' }, [
            h('div', { key: 'header', className: 'flex justify-between items-center' }, [
                h('h3', { className: 'text-[12px] font-bold uppercase tracking-wider text-zinc-900' }, '偏好设置'),
                soulSaved && h('span', { className: 'text-[11px] text-green-600 font-medium' }, '✅ 已保存')
            ]),
            h('p', { className: 'text-[11px] text-zinc-500' }, '在这里写下你的品牌调性、创作风格、固定要求等，AI 会在每次对话时优先读取这些设定。'),
            h('textarea', {
                value: soulMd,
                onChange: (e) => setSoulMd(e.target.value),
                placeholder: '例如：\n我是一个母婴博主，风格温暖治愈。\n所有海报都偏向暖粉色系，不要用冷色调。',
                rows: 12,
                className: 'w-full border border-zinc-200 p-3 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800 resize-none'
            }),
            h('div', { className: 'flex justify-end' }, [
                h('button', {
                    onClick: saveSoulMd,
                    disabled: soulLoading,
                    className: 'px-4 py-2 text-[11px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase disabled:opacity-50'
                }, soulLoading ? '保存中...' : '保存')
            ])
        ]);

        const renderMemoryMd = () => h('div', { className: 'p-6 space-y-4 overflow-y-auto max-h-[70vh]' }, [
            h('div', { key: 'header', className: 'flex justify-between items-center' }, [
                h('h3', { className: 'text-[12px] font-bold uppercase tracking-wider text-zinc-900' }, '记忆设置'),
                memoryMdSaved && h('span', { className: 'text-[11px] text-green-600 font-medium' }, '✅ 已保存')
            ]),
            h('p', { className: 'text-[11px] text-zinc-500' }, '在这里整理系统需要记住的关键信息、常用工作流、历史决策等。'),
            h('textarea', {
                value: memoryMd,
                onChange: (e) => setMemoryMd(e.target.value),
                placeholder: '例如：\n- 常用模板：母婴活动海报（使用 12 次）\n- 上次活动：2026年4月上海亲子展\n- 成功工作流：上传图片 → 风格分析 → 精细编排',
                rows: 12,
                className: 'w-full border border-zinc-200 p-3 text-[12px] outline-none focus:border-black transition-colors bg-transparent text-zinc-800 resize-none'
            }),
            h('div', { className: 'flex justify-end' }, [
                h('button', {
                    onClick: saveMemoryMd,
                    disabled: memoryMdLoading,
                    className: 'px-4 py-2 text-[11px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase disabled:opacity-50'
                }, memoryMdLoading ? '保存中...' : '保存')
            ])
        ]);

        const renderSettingsContent = () => {
            if (settingsTab === 'model') return renderModelConfig();
            if (settingsTab === 'soul') return renderSoulMd();
            return renderMemoryMd();
        };

        const renderXhsPrecheckModal = () => {
            const steps = Array.isArray(xhsPrecheckInfo?.instructions) ? xhsPrecheckInfo.instructions : [];
            const showQr = !!xhsPrecheckInfo?.qrcode_image_url;
            return h(Modal, {
                isOpen: xhsPrecheckModalOpen,
                onClose: () => setXhsPrecheckModalOpen(false),
                title: xhsPrecheckInfo?.title || '小红书环境检查未通过',
                theme: 'light'
            }, h('div', { className: 'p-6 space-y-5 text-zinc-900' }, [
                h('div', { key: 'summary', className: 'space-y-2' }, [
                    h('p', { className: 'text-[13px] leading-relaxed font-medium' }, xhsPrecheckInfo?.message || '当前无法执行小红书搜索。'),
                    xhsPrecheckInfo?.detail && h('p', { className: 'text-[11px] leading-relaxed text-zinc-500 border border-zinc-200 bg-zinc-50 px-3 py-2' }, xhsPrecheckInfo.detail)
                ]),
                steps.length > 0 && h('div', { key: 'steps', className: 'space-y-2' }, [
                    h('div', { className: 'text-[11px] font-bold uppercase tracking-wider text-zinc-500' }, '操作步骤'),
                    h('ol', { className: 'space-y-2' },
                        steps.map((step, index) => h('li', {
                            key: `xhs-step-${index}`,
                            className: 'flex items-start gap-3 text-[12px] leading-relaxed'
                        }, [
                            h('span', { className: 'shrink-0 w-5 h-5 border border-black flex items-center justify-center text-[10px] font-bold' }, index + 1),
                            h('span', null, step)
                        ]))
                    )
                ]),
                showQr && h('div', { key: 'qr', className: 'space-y-3 border border-zinc-200 bg-zinc-50 p-4' }, [
                    h('div', { className: 'text-[11px] font-bold uppercase tracking-wider text-zinc-500' }, '登录二维码'),
                    h('img', {
                        src: xhsPrecheckInfo.qrcode_image_url,
                        alt: '小红书登录二维码',
                        className: 'w-48 h-48 object-contain border border-zinc-200 bg-white'
                    }),
                    xhsPrecheckInfo?.qr_login_url && h('a', {
                        href: xhsPrecheckInfo.qr_login_url,
                        target: '_blank',
                        rel: 'noreferrer',
                        className: 'text-[12px] text-blue-600 underline break-all'
                    }, xhsPrecheckInfo.qr_login_url)
                ]),
                h('div', { key: 'actions', className: 'flex justify-end pt-1' }, [
                    h('button', {
                        onClick: () => setXhsPrecheckModalOpen(false),
                        className: 'px-4 py-2 text-[11px] font-bold border border-black hover:bg-black hover:text-white transition-all duration-200 uppercase'
                    }, '我知道了')
                ])
            ]));
        };

        return (
            h(React.Fragment, null, [
                // 1. 草稿编辑/查看弹窗
                draftModalOpen && h(DraftModal, {
                    isOpen: draftModalOpen,
                    onClose: () => {
                        setDraftModalOpen(false);
                        setIsDraftEditMode(false);
                        setDraftEditCallback(null);
                    },
                    initialContent: draftContent,
                    initialMsg: draftInitialMsg,
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
                }),

                // 2. 小红书发布确认弹窗
                publishModalOpen && h(XhsPublishModal, {
                    isOpen: publishModalOpen,
                    onClose: () => setPublishModalOpen(false),
                    data: publishData,
                    onConfirm: confirmPublish,
                    loading: isPublishing
                }),

                // 3. 笔记/文档详情弹窗
                detailModalOpen && h(NoteDetailModal, {
                    doc: selectedDetailDoc,
                    contentOverride: detailContentOverride,
                    onClose: () => setDetailModalOpen(false),
                    toast
                }),

                // 4. 来源溯源弹窗
                sourceModalOpen && h(SourceModal, {
                    isOpen: sourceModalOpen,
                    onClose: () => setSourceModalOpen(false),
                    docIds: sourceDocIds,
                    sourceMap: activeSourceMap,
                    content: sourceContent,
                    toast
                }),

                // 5. 小红书环境预检失败弹窗
                xhsPrecheckModalOpen && renderXhsPrecheckModal(),

                // 6. 全局 Toast 通知
                toastMsg && h(Toast, {
                    message: toastMsg,
                    type: toastType,
                    persistent: toastPersistent,
                    onDone: () => setToastMsg('')
                }),

                // 7. 登录/注册弹窗
                loginModalOpen && LoginModal && h(LoginModal, {
                    isOpen: loginModalOpen,
                    onClose: () => setLoginModalOpen(false),
                    onLoginSuccess,
                    requireApiKey: true
                }),

                // 8. 设置弹窗（Tab 化）
                h(Modal, {
                    isOpen: settingsOpen,
                    onClose: () => setSettingsOpen(false),
                    title: '设置',
                    theme: 'light'
                }, h('div', { className: 'flex flex-col' }, [
                    // Tab 栏
                    h('div', {
                        key: 'tabs',
                        className: 'flex border-b border-zinc-100'
                    }, [
                        h('button', {
                            key: 'model',
                            onClick: () => setSettingsTab('model'),
                            className: `px-5 py-3 text-[12px] font-bold transition-colors ${settingsTab === 'model' ? 'text-black border-b-2 border-black' : 'text-zinc-400 hover:text-zinc-600'}`
                        }, '模型配置'),
                        h('button', {
                            key: 'soul',
                            onClick: () => setSettingsTab('soul'),
                            className: `px-5 py-3 text-[12px] font-bold transition-colors ${settingsTab === 'soul' ? 'text-black border-b-2 border-black' : 'text-zinc-400 hover:text-zinc-600'}`
                        }, '偏好设置'),
                        h('button', {
                            key: 'memory',
                            onClick: () => setSettingsTab('memory'),
                            className: `px-5 py-3 text-[12px] font-bold transition-colors ${settingsTab === 'memory' ? 'text-black border-b-2 border-black' : 'text-zinc-400 hover:text-zinc-600'}`
                        }, '记忆设置')
                    ]),
                    // 内容区
                    h('div', { key: 'content' }, renderSettingsContent())
                ]))
            ])
        );
    };

    window.MagnesComponents.Layout = window.MagnesComponents.Layout || {};
    window.MagnesComponents.Layout.AppModals = AppModals;
})();
