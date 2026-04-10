/**
 * Rednote Preview Node (JSX/Modular)
 * 路径: src/nodes/rednote/preview-node.js
 * 
 * 提供沉浸式的小红书手机模拟预览，并集成 AI 增强功能。
 */

(function () {
    'use strict';

    const { React } = window;
    const { useState, useRef, useEffect, useCallback } = React;
    const MAGNES = window.MagnesComponents || {};
    const UI = MAGNES.UI || {};
    // ==================== iPhone 仿真外壳样式 ====================
    const iPhoneStyles = `
        .iphone-frame {
            position: relative;
            width: 250px;
            height: 520px;
            background: #fff;
            border-radius: 54px;
            padding: 0;
            box-shadow: none;
            border: 1px solid #000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            pointer-events: auto;
        }
        .iphone-inner {
            position: relative;
            flex: 1;
            background: #fff;
            border-radius: 53px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .iphone-notch {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 20px;
            background: #000;
            border-bottom-left-radius: 14px;
            border-bottom-right-radius: 14px;
            z-index: 100;
        }
        .iphone-home-bar {
            position: absolute;
            bottom: 6px;
            left: 50%;
            transform: translateX(-50%);
            width: 70px;
            height: 4px;
            background: #000;
            border-radius: 2px;
            z-index: 100;
            opacity: 0.1;
        }
    `;

    const RednotePreviewNode = ({ node, isSelected, connectedLayoutData }) => {
        const layoutData = connectedLayoutData || node?.data?.layoutData || null;
        const template = layoutData?.template || 'ticket';

        // 安全地从命名空间获取模版
        const RednoteNodes = (window.MagnesComponents?.Nodes?.Rednote) || {};
        const MOCK_DATA = RednoteNodes.MOCK_DATA || {
            ticket: { title: '示例标题', venue: '示例地点', description: '示例描述' },
            market: { title: '示例市集', items: [] }
        };

        const { TicketTemplate, MarketTemplate, CustomHtmlTemplate } = RednoteNodes;
        const displayData = layoutData || MOCK_DATA[template] || {};

        return (
            <div className="iphone-frame" style={{ cursor: 'default' }}>
                <style>{iPhoneStyles}</style>
                <div className="iphone-notch" />

                <div className="iphone-inner">
                    {/* 模拟系统状态栏 */}
                    <div className="pt-2 px-4 pb-2 flex items-center justify-between border-b border-zinc-50 bg-white z-20 shrink-0">
                        <span className="text-[11px] font-bold">9:41</span>
                        <div className="flex gap-1 items-center">
                            <span className="text-[10px] scale-90">📶</span>
                            <span className="text-[10px] scale-90">🔋</span>
                        </div>
                    </div>

                    {/* 模拟 App 顶栏 */}
                    <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-100 bg-white z-20 shrink-0">
                        <span className="text-[12px] opacity-40">❮</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-zinc-100 border border-zinc-200 overflow-hidden">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="" className="w-full h-full object-cover" />
                            </div>
                            <span className="text-[11px] font-bold">Rednote Studio</span>
                        </div>
                        <span className="text-[12px] opacity-20">•••</span>
                    </div>

                    {/* 滚动预览区 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-zinc-50 pointer-events-none">
                        <div className="w-full aspect-[3/4] bg-white relative border-b border-zinc-100">
                            {layoutData ? (
                                <div className="w-full h-full">
                                    {(template === 'ticket' && TicketTemplate) && <TicketTemplate data={displayData} isReadOnly={true} />}
                                    {(template === 'market' && MarketTemplate) && <MarketTemplate data={displayData} isReadOnly={true} />}
                                    {(template === 'custom' && CustomHtmlTemplate) && <CustomHtmlTemplate data={displayData} isReadOnly={true} />}
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-20">等待输入</span>
                                </div>
                            )}
                        </div>

                        {/* 正文预览 */}
                        <div className="p-4 space-y-2">
                            <div className="text-[13px] font-bold text-black leading-tight">
                                {displayData.title || '待输入标题'}
                            </div>
                            <div className="text-[12px] text-zinc-600 leading-snug whitespace-pre-wrap">
                                {displayData.description || '在这里预览你的正文内容...'}
                            </div>
                            <div className="flex flex-wrap gap-1 text-[11px] text-blue-600 font-bold">
                                <span>#RednoteStudio</span>
                                <span>#AI创作</span>
                            </div>
                        </div>
                    </div>

                    {/* 模拟 App 底栏 */}
                    <div className="px-4 py-3 border-t border-zinc-100 flex items-center gap-2 bg-white shrink-0 pb-3">
                        <div className="flex-1 bg-zinc-100 rounded-full h-7 px-3 flex items-center">
                            <span className="text-[11px] text-zinc-400">说点什么...</span>
                        </div>
                        <div className="flex gap-3 opacity-30">
                            <span className="text-[13px]">♡</span>
                            <span className="text-[13px]">☆</span>
                        </div>
                    </div>
                </div>

                <div className="iphone-home-bar" />
            </div>
        );
    };

    // 统一导出
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.Rednote = window.MagnesComponents.Nodes.Rednote || {};
    window.MagnesComponents.Nodes.Rednote.PreviewNode = RednotePreviewNode;

    // 兼容旧版
    window.RednotePreviewNode = RednotePreviewNode;

    console.log('✅ Rednote Preview Node (JSX) Registered');
})();
