/**
 * Rednote Layout Node (Style Lab) (JSX/Modular)
 * 路径: src/nodes/rednote/stylelab-node.js
 */

(function () {
    'use strict';

    const { React } = window;
    const { useState, useEffect, useMemo, useCallback } = React;
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    const Icons = UI.Icons || {};
    const { Layout: LayoutIcon, RefreshCcw } = Icons;

    const RednoteLayoutNodeV2 = ({ node, isSelected, connectedImages = [], connectedText = {}, updateNodeData, hideHeader = false }) => {
        // ==================== 状态管理 ====================
        const presets = MAGNES.Utils?.RednoteStyles?.STYLE_PRESETS || window.RednoteStylePresets?.STYLE_PRESETS || {};

        const [template, setTemplate] = useState(node?.data?.template || 'ticket');
        const [activeTab, setActiveTab] = useState('presets'); // presets | magic | library
        const [currentStyle, setCurrentStyle] = useState(node?.data?.currentStyle || Object.values(presets)[0]);
        const [colorPrompt, setColorPrompt] = useState('');
        const [isGenerating, setIsGenerating] = useState(false);

        const [savedStyles, setSavedStyles] = useState(() => {
            try {
                const saved = localStorage.getItem('rednote_saved_styles');
                return saved ? JSON.parse(saved) : [];
            } catch (e) { return []; }
        });

        // ==================== 核心逻辑 ====================
        const applyStyle = useCallback((style) => {
            setCurrentStyle(style);
            // 自动根据风格定义切换模板 (如果风格内有定义)
            const newTemplate = style?.atoms?.decoration?.layoutPreset || style?.template || template;

            if (style?.type === 'custom') {
                setTemplate('custom');
            } else {
                setTemplate(newTemplate);
            }

            const layoutData = {
                template: newTemplate,
                currentStyle: style,
                style_config: style,
                layout_data: {
                    template: newTemplate,
                    connectedImages: connectedImages,
                    connectedText: connectedText,
                    // [核心扩展] 透传生成的背景与自定义布局协议
                    backgroundImage: style.backgroundImage,
                    customLayout: style.layout,
                    canvasSize: style.canvasSize
                },
                timestamp: Date.now()
            };
            updateNodeData && updateNodeData(layoutData);
        }, [template, connectedImages, connectedText, updateNodeData]);

        const resetToDefaultPalette = () => {
            const originalPreset = Object.values(presets).find(p => p.id === currentStyle?.id);
            if (originalPreset) applyStyle(originalPreset);
        };

        const handleGenerateStyle = async () => {
            setIsGenerating(true);
            await new Promise(r => setTimeout(r, 1000));
            // Mock generation based on current logic
            setIsGenerating(false);
        };

        const removeSavedStyle = (e, index) => {
            e.stopPropagation();
            if (!confirm('确定删除此收藏模版吗？')) return;
            const updated = [...savedStyles];
            updated.splice(index, 1);
            setSavedStyles(updated);
            localStorage.setItem('rednote_saved_styles', JSON.stringify(updated));
        };

        return (
            <div
                className={`bg-white transition-all ${hideHeader ? '' : 'border border-black'}`}
                style={{ width: '100%', minHeight: hideHeader ? 'auto' : '450px' }}
            >
                {!hideHeader && (
                    <div className="flex items-center justify-between px-3 py-2 border-b border-black text-[12px] font-bold bg-white text-black">
                        <div className="flex items-center gap-1.5">
                            <LayoutIcon size={14} />
                            <span className="uppercase tracking-widest">风格实验室</span>
                        </div>
                        <button onClick={resetToDefaultPalette} className="hover:opacity-60 transition-opacity">
                            <RefreshCcw size={14} />
                        </button>
                    </div>
                )}

                <div className="flex flex-col pointer-events-auto overflow-y-auto" style={{ maxHeight: '700px' }}>
                    {/* 区域一：模板选择 */}
                    <div className="pt-4 pb-2 p-3 border-b border-black/5">
                        <h3 className="text-[12px] font-bold text-black mono-header-text mb-3">模板选择</h3>
                        <div className="flex -space-x-[1px]">
                            {['ticket', 'market'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => { setTemplate(t); applyStyle(currentStyle); }}
                                    className={`flex-1 py-1.5 text-[12px] font-bold border border-black transition-all
                                               ${template === t ? 'bg-black text-white' : 'bg-white text-zinc-400 hover:bg-zinc-50'}`}
                                >
                                    {t === 'ticket' ? '票根 (Ticket)' : '市集 (Market)'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 区域二：风格实验室 */}
                    <div className="py-2 p-3">
                        <div className="flex items-center justify-between mb-4 px-0">
                            <h3 className="text-[12px] font-bold text-black mono-header-text">风格控制器</h3>
                            <button
                                onClick={(e) => { e.stopPropagation(); resetToDefaultPalette(); }}
                                className="text-[12px] underline font-bold"
                            >重置</button>
                        </div>

                        {/* Tab 切换 */}
                        <div className="flex -space-x-[1px] mb-4">
                            {['presets', 'magic', 'library'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-1.5 text-[12px] font-bold border border-black transition-all
                                               ${activeTab === tab ? 'bg-black text-white' : 'bg-white text-zinc-400 hover:bg-zinc-50'}`}
                                >
                                    {tab === 'presets' ? '灵感' : tab === 'magic' ? '智能' : '收藏'}
                                </button>
                            ))}
                        </div>

                        {/* 灵感库内容 */}
                        {activeTab === 'presets' && (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-wrap -space-x-[1px]">
                                    {Object.values(presets).map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => applyStyle(preset)}
                                            className={`px-3 py-1.5 text-[12px] border border-black transition-all font-bold
                                                       ${currentStyle?.id === preset.id ? 'bg-black text-white' : 'bg-white text-zinc-400 hover:text-black'}`}
                                        >
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>

                                {/* 预览区域 */}
                                <div className="py-2">
                                    <div className="text-[12px] font-bold text-black mb-4 mono-header-text">预览</div>
                                    <div
                                        className="bg-zinc-50 border border-black mx-auto overflow-hidden p-2"
                                        style={{ aspectRatio: '3/4', maxHeight: '180px', width: '135px', position: 'relative' }}
                                    >
                                        {/* 票根/手账 缩略图 */}
                                        <div className="w-full h-full border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col p-2 bg-white">
                                            <div className="text-center text-[12px] font-bold mb-1 text-black border-b border-black pb-0.5">
                                                {template === 'market' ? 'MARKET TEMPLATE' : 'TICKET TEMPLATE'}
                                            </div>
                                            <div className="flex-1 bg-zinc-100 mb-1 flex items-center justify-center text-[8px] text-zinc-400 border border-black">
                                                IMAGE
                                            </div>
                                            <div className="text-[8px] text-black font-bold uppercase truncate">Title Content</div>
                                            <div className="text-[7px] text-zinc-400">Date • Location</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 智能生成 */}
                        {activeTab === 'magic' && (
                            <div className="space-y-2">
                                <textarea
                                    className="w-full p-2 border border-black text-[12px] focus:outline-none focus:ring-1 focus:ring-black h-20"
                                    placeholder="描述你想要的风格，如：莫兰迪冷色调，或是 Y2K 霓虹感..."
                                    value={colorPrompt}
                                    onChange={(e) => setColorPrompt(e.target.value)}
                                />
                                <button
                                    onClick={handleGenerateStyle}
                                    disabled={isGenerating}
                                    className={`w-full py-2 text-[12px] font-bold border border-black transition-all
                                           ${isGenerating ? 'bg-zinc-100 text-zinc-400' : 'bg-black text-white hover:bg-zinc-800'}`}
                                >
                                    {isGenerating ? '正在生成...' : '立即应用'}
                                </button>
                            </div>
                        )}

                        {/* 收藏库 */}
                        {activeTab === 'library' && (
                            <div className="space-y-2">
                                {savedStyles.length > 0 ? (
                                    savedStyles.map((s, idx) => (
                                        <div key={idx} className="p-2 border border-black text-[12px] font-bold flex items-center justify-between group">
                                            <div className="flex flex-col">
                                                <span>{s.name}</span>
                                                <span className="text-[9px] opacity-30 uppercase">{s.type === 'custom' ? 'AI Generated' : 'Preset'}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => applyStyle(s)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity underline hover:text-blue-600"
                                                >应用</button>
                                                <button
                                                    onClick={(e) => removeSavedStyle(e, idx)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity underline text-red-500 hover:text-red-700"
                                                >删除</button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center border border-zinc-200">
                                        <span className="text-[12px] text-zinc-400 uppercase tracking-widest">暂无收藏内容</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 底部：当前方案配色 */}
                    {currentStyle && (
                        <div className="p-3 pt-0 pb-6 border-t border-black/5 mt-4">
                            <div className="text-[12px] font-bold text-black mb-3 uppercase tracking-widest opacity-30">
                                当前配色方案: {currentStyle.name}
                            </div>
                            <div className="flex gap-2">
                                {Object.values(currentStyle.atoms.palette).slice(0, 5).map((color, idx) => (
                                    <div
                                        key={idx}
                                        className="w-8 h-8 border border-black"
                                        style={{ backgroundColor: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 统一导出
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.Rednote = window.MagnesComponents.Nodes.Rednote || {};
    window.MagnesComponents.Nodes.Rednote.StyleLabNode = RednoteLayoutNodeV2;

    // 兼容旧版命名
    window.RednoteLayoutNodeV2 = RednoteLayoutNodeV2;

    console.log('✅ Rednote Style Lab Node (JSX) Registered');
})();
