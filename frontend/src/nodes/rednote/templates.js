/**
 * Rednote Templates (JSX/Modular)
 * 路径: src/nodes/rednote/templates.js
 * 
 * 小红书业务模板组件 (Ticket & Market)
 */

(function () {
    'use strict';

    const { React } = window;
    const { useState, useEffect } = React;

    // ==================== DraggableText 组件 (JSX) ====================
    const DraggableText = ({ text, style = {}, onUpdate, isEditable = true, className = '' }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [val, setVal] = useState(text);

        useEffect(() => {
            setVal(text);
        }, [text]);

        const handleDoubleClick = (e) => {
            e.stopPropagation();
            if (isEditable) setIsEditing(true);
        };

        const handleBlur = () => {
            setIsEditing(false);
            if (onUpdate && val !== text) onUpdate(val);
        };

        if (isEditing) {
            return (
                <input
                    autoFocus
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onBlur={handleBlur}
                    className={`bg-transparent border-b-2 border-blue-500 outline-none min-w-[50px] text-center pointer-events-auto ${className}`}
                    style={style}
                    onClick={(e) => e.stopPropagation()}
                />
            );
        }

        return (
            <div
                className={`cursor-move select-none hover:ring-2 hover:ring-blue-400/50 rounded px-2 py-1 transition-all ${className}`}
                style={style}
                onDoubleClick={handleDoubleClick}
            >
                {val}
            </div>
        );
    };

    // ==================== MOCK_DATA ====================
    const MOCK_DATA = {
        ticket: {
            title: '非常毕加索',
            venue: '浦东美术馆',
            date: '12.22',
            year: '2025',
            dateLabel: '星期一',
            price: '40元通票',
            description: '毕加索国际巡展之旅的首站，中国唯一一站。史诗级全景登陆，国内迄今为止创作类型最全面的毕加索艺术巡礼。',
            image: null
        },
        market: {
            title: '上海十一月市集',
            venue: 'EXPLORE MORE EXCITING AND ENGAGING MARKETPLACES.',
            account: '@ARTIVO',
            items: [
                { name: '安福路创意市集', venue: '徐汇区安福路' },
                { name: '田子坊艺术市集', venue: '黄浦区泰康路' },
                { name: '新天地周末市集', venue: '黄浦区新天地' }
            ]
        }
    };

    // ==================== TicketTemplate (JSX) ====================
    const TicketTemplate = ({ data = MOCK_DATA.ticket, onUpdate }) => {
        const { image = null } = data;

        // 使用工具批量创建可编辑字段
        const Editable = window.MagnesComponents?.Utils?.RednoteEditable || window.RednoteEditableUtils;

        const fields = Editable?.makeEditableFields?.({
            title: { className: 'text-center text-[22px] font-black text-[#d4a017] mb-2 shrink-0', style: { letterSpacing: '2px', lineHeight: '1.1', display: 'block' } },
            venue: { className: 'text-[13px] font-bold text-[#c9a961]' },
            year: { className: 'text-[8px] font-bold' },
            date: { className: 'text-[20px] font-black leading-none', style: { fontFamily: 'Impact, sans-serif' } },
            price: { className: 'inline' },
            description: { className: 'inline' }
        }, data, onUpdate) || {};

        return (
            <div className="w-full h-full flex items-center justify-center p-2 relative" style={{ backgroundColor: '#f5f3ed', fontFamily: 'PingFang SC, sans-serif' }}>
                <div className="absolute top-0 bottom-0 left-1 w-3 bg-gradient-to-b from-[#e8c547] to-[#d4a017] opacity-60" />
                <div className="absolute top-0 bottom-0 right-1 w-3 bg-gradient-to-b from-[#e8c547] to-[#d4a017] opacity-60" />

                <div className="relative w-[94%] h-[96%] bg-white shadow-2xl flex flex-col rounded-sm overflow-visible">
                    <div className="flex-1 p-4 flex flex-col overflow-auto">
                        {fields.title}

                        <div className="relative w-full mx-auto mb-2 p-1 bg-white border-2 border-black shrink-0"
                            style={{ transform: 'rotate(-0.5deg)', maxWidth: '55%', aspectRatio: '3/4' }}>
                            <div className="absolute -top-1 -left-1 w-10 h-10 bg-[#e8c547] -z-10" />
                            {image ? (
                                <img src={image} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400">
                                    <span className="text-xl">🖼️</span>
                                    <span className="text-[12px]">3:4</span>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-1 mb-2 shrink-0">
                            <div className="flex-1 h-[2px] bg-[#e8c547]" />
                            <div className="flex-1 h-[2px] bg-[#e8c547]" />
                        </div>

                        <div className="flex justify-between items-end mb-2 shrink-0">
                            {fields.venue}
                            <div className="flex flex-col items-end text-[#d4a017]">
                                {fields.year}
                                {fields.date}
                                <span className="text-[8px] font-bold">起</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-0.5 my-2 shrink-0">
                            {Array.from({ length: 20 }).map((_, i) => (
                                <div key={i} className="w-0.5 h-0.5 rounded-full bg-red-500" />
                            ))}
                        </div>

                        <div className="shrink-0">
                            <div className="text-[12px] font-bold text-gray-700 mb-1">
                                <span>门票：</span>
                                {fields.price}
                            </div>
                            <div className="text-[8px] text-gray-600 leading-snug">
                                <span className="font-bold text-black">展览情报🔍：</span>
                                {fields.description}
                            </div>
                        </div>
                    </div>

                    <div className="absolute w-4 h-8 bg-[#f5f3ed] overflow-hidden" style={{ left: '0', bottom: '20%', borderRadius: '0 100px 100px 0' }} />
                    <div className="absolute w-4 h-8 bg-[#f5f3ed] overflow-hidden" style={{ right: '0', bottom: '20%', borderRadius: '100px 0 0 100px' }} />
                </div>
            </div>
        );
    };

    // ==================== MarketTemplate (JSX) ====================
    const MarketTemplate = ({ data = MOCK_DATA.market, onUpdate }) => {
        const listItems = data.items && data.items.length > 0 ? data.items : MOCK_DATA.market.items;

        const Editable = window.MagnesComponents?.Utils?.RednoteEditable || window.RednoteEditableUtils;

        const fields = Editable?.makeEditableFields?.({
            title: { style: { fontSize: '24px', fontWeight: '900', color: '#8B4513', letterSpacing: '2px', fontFamily: 'STHupo, "LiSu", sans-serif', transform: 'scaleY(1.1)', whiteSpace: 'nowrap' } },
            venue: { className: 'text-[8px] text-[#A0522D] font-bold w-2/3 leading-tight' },
            account: { className: 'bg-[#8B4513] text-white px-2 py-0.5 rounded-full text-[8px] font-bold shadow-sm transform -rotate-2' }
        }, data, onUpdate) || {};

        return (
            <div className="w-full h-full bg-[#f39c12] p-2 font-sans relative overflow-hidden" style={{ fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' }}>
                <div className="absolute inset-2 bg-white rounded-[16px] shadow-sm" style={{ border: '3px solid #fdf2e9' }} />

                <div className="relative z-10 h-full flex flex-col p-3">
                    <div className="mb-2">
                        <div className="flex justify-between items-start mb-1">
                            {fields.venue}
                            {fields.account}
                        </div>
                        <div className="w-full text-center mt-1">
                            {fields.title}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {listItems.map((item, index) => (
                            <div key={index} className="bg-gradient-to-r from-[#fff8dc] to-[#ffefd5] rounded-lg p-2 flex items-center gap-2 shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 bg-[#d2691e] rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0">
                                    {(index + 1)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[12px] font-bold text-[#8B4513] truncate">{item.name}</div>
                                    <div className="text-[8px] text-[#A0522D] truncate">{item.venue}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // ==================== CustomHtmlTemplate (JSX) ====================
    /**
     * 自定义 HTML 模板：支持语义化解析与字段映射
     * 优化：支持多 bbox 元素合并，实现“一键换词”而不重复。
     */
    const CustomHtmlTemplate = ({ data = {}, onUpdate }) => {
        const { backgroundImage = null, customLayout = null } = data;
        const elements = customLayout?.elements || customLayout?.layout?.elements || [];

        // 1. 语义化分析工具
        const getSemanticRole = (el) => {
            const text = (el.content || el.text || '').toLowerCase();
            const fontSize = parseInt(el.style?.fontSize || 0);
            if (fontSize >= 50) return 'title';
            if (text.includes('🔎') || text.includes('情报') || text.includes('简介') || (fontSize <= 28 && text.length > 20)) return 'description';
            if (text.includes('.') && /\d/.test(text) && text.length < 15) return 'date';
            if (text.includes('元') || text.includes('￥') || text.includes('price')) return 'price';
            return 'other';
        };

        // 2. 预处理：记录每个角色的“首个元素（主元素）”索引，用于承载替换内容
        const roleFirstIdx = {};
        elements.forEach((el, idx) => {
            const role = getSemanticRole(el);
            if (role !== 'other' && roleFirstIdx[role] === undefined) roleFirstIdx[role] = idx;
        });

        return (
            <div className="w-full h-full bg-white relative overflow-hidden" style={{ aspectRatio: '3/4', containerType: 'size' }}>
                {backgroundImage ? (
                    <img src={backgroundImage} className="absolute inset-0 w-full h-full object-cover z-0" alt="Bg" />
                ) : (
                    <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center text-zinc-300">EMPTY</div>
                )}

                <div className="absolute inset-0 z-10 pointer-events-none">
                    {elements.map((el, idx) => {
                        const style = el.style || {};
                        const role = getSemanticRole(el);
                        const isPrimary = roleFirstIdx[role] === idx;

                        // 3. 坐标解析适配 (支持 0-1000 归一化坐标转换为百分比)
                        let left = style.left, top = style.top, width = style.width;
                        if (el.bbox) {
                            if (Array.isArray(el.bbox)) {
                                left = (el.bbox[0] / 10) + '%';
                                top = (el.bbox[1] / 10) + '%';
                                width = ((el.bbox[2] - el.bbox[0]) / 10) + '%';
                            } else if (typeof el.bbox === 'object') {
                                left = (el.bbox.x / 10) + '%';
                                top = (el.bbox.y / 10) + '%';
                                width = (el.bbox.width / 10) + '%';
                            }
                        }

                        // 内容逻辑：若是主元素则尝试替换；非主元素且已有替换内容时直接隐藏
                        let displayContent = el.content || el.text || '';
                        let isPlaceholderText = false;

                        if (role === 'title' && data.title) {
                            displayContent = isPrimary ? data.title : '';
                        } else if (role === 'description' && data.description) {
                            displayContent = isPrimary ? data.description : '';
                        } else if (role === 'date' && data.date) {
                            displayContent = isPrimary ? data.date : '';
                        }

                        // 处理变量占位
                        if (!displayContent && el.isVariable) {
                            displayContent = el.placeholder || '请输入...';
                            isPlaceholderText = true;
                        }

                        // 隐藏非主元素的冗余内容
                        const isHidden = !isPrimary && role !== 'other' && (data[role] || el.isVariable);

                        if (isHidden) return null;

                        return (
                            <div
                                key={idx}
                                className={`absolute pointer-events-auto group role-${role}`}
                                style={{
                                    left,
                                    top,
                                    width,
                                    color: style.color || '#000',
                                    // 将 0-1000 的字号映射为容器宽度的百分比 (cqi)
                                    fontSize: typeof style.fontSize === 'number' || !isNaN(parseInt(style.fontSize))
                                        ? (parseInt(style.fontSize) / 10) + 'cqi'
                                        : (style.fontSize || '14px'),
                                    fontFamily: style.fontFamily || 'PingFang SC, sans-serif',
                                    fontWeight: style.fontWeight || 'normal',
                                    textAlign: style.textAlign || 'left',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.2'
                                }}
                            >
                                <DraggableText
                                    text={displayContent}
                                    isEditable={true}
                                    onUpdate={(val) => onUpdate && onUpdate({ ...data, [role]: val })}
                                    className={`
                                        ${role !== 'other' ? 'ring-1 ring-transparent group-hover:ring-blue-400' : ''}
                                        ${isPlaceholderText ? 'opacity-40 italic' : ''}
                                        ${el.isVariable ? 'border-b border-dashed border-black/20' : ''}
                                    `}
                                />
                            </div>
                        );
                    })}

                    {/* 图片占位符渲染 */}
                    {elements.filter(el => el.type === 'image' || el.isPlaceholder).map((el, idx) => {
                        if (el.url) return null; // 已有图片则跳过，由于本组件目前主要处理文字，图片通常在背景渲染，但此处保留占位图支持
                        if (!el.isPlaceholder) return null;

                        const [x, y, w, h] = el.bbox || [0, 0, 100, 100];
                        return (
                            <div
                                key={`placeholder-img-${idx}`}
                                className="absolute border border-dashed border-black/20 bg-zinc-50 flex flex-col items-center justify-center text-zinc-300"
                                style={{
                                    left: (x / 10) + '%',
                                    top: (y / 10) + '%',
                                    width: (w / 10) + '%',
                                    height: (h / 10) + '%',
                                    zIndex: 5
                                }}
                            >
                                <span className="text-[20px]">🖼️</span>
                                <span className="text-[8px] font-bold uppercase">Image Placeholder</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // 统一导出
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Nodes = window.MagnesComponents.Nodes || {};
    window.MagnesComponents.Nodes.Rednote = {
        DraggableText,
        TicketTemplate,
        MarketTemplate,
        CustomHtmlTemplate,
        MOCK_DATA
    };

    // 兼容旧版
    window.RednoteTemplates = window.MagnesComponents.Nodes.Rednote;
    window.RednoteComponents = window.RednoteComponents || {};
    window.RednoteComponents.MOCK_DATA = MOCK_DATA;

    console.log('✅ Rednote Templates (JSX) Registered');
})();
