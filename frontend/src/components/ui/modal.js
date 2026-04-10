/**
 * Modal Component Module (源码 - JSX 格式)
 * 通用模态对话框组件
 * @module src/components/modal
 * @version 4.3.0
 * 
 * 注意: 此文件为开发源码,使用 JSX 语法
 * 编译后的版本位于: components-compiled/ui/modal.js
 */

(function () {
    'use strict';

    const { React } = window;
    const { X } = window.MagnesComponents?.UI?.LucideIcons || {};

    /**
     * Modal 组件
     * @param {Object} props - 组件属性
     * @param {boolean} props.isOpen - 是否打开Modal
     * @param {function} props.onClose - 关闭回调
     * @param {string} props.title - 标题
     * @param {ReactNode} props.children - 子元素
     * @param {string} props.theme - 主题('dark' 或 'light')
     */
    const Modal = ({ isOpen, onClose, title, children, theme = 'dark' }) => {
        if (!isOpen) return null;

        const isDark = theme === 'dark';

        return (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-[2px] transition-all"
                onClick={onClose}
            >
                <div
                    className={`shadow-2xl w-[680px] max-w-[95vw] overflow-hidden flex flex-col max-h-[90vh] border ${isDark ? 'bg-[#000000] border-zinc-800' : 'bg-white border-zinc-200'}`}
                    style={{ borderRadius: '0px' }} // Precision Monochrome: 0px radius
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}
                    >
                        <h3 className={`font-medium tracking-tight text-[14px] uppercase ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className={`p-1 transition-colors outline-none ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'}`}
                        >
                            {X && <X size={20} strokeWidth={1.5} />}
                        </button>
                    </div>
                    <div className={`p-0 overflow-y-auto custom-scrollbar flex-1 ${isDark ? 'bg-[#09090b]' : 'bg-white'}`}>
                        {children}
                    </div>
                </div>
            </div>
        );
    };

    // 初始化命名空间
    if (!window.MagnesComponents) {
        window.MagnesComponents = {};
    }
    if (!window.MagnesComponents.UI) {
        window.MagnesComponents.UI = {};
    }

    // 导出到全局命名空间
    window.MagnesComponents.UI.Modal = Modal;

    console.log('✅ Modal 组件已加载');
})();


