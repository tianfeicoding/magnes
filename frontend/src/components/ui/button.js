/**
 * Button Component Module (源码 - JSX 格式)
 * 通用按钮组件
 * @module src/components/button
 * @version 4.3.0
 * 
 * 注意: 此文件为开发源码,使用 JSX 语法
 * 编译后的版本位于: components-compiled/ui/button.js
 */

(function () {
    'use strict';

    const { React } = window;

    /**
     * Button 组件
     * @param {Object} props - 组件属性
     * @param {string} props.variant - 按钮变体: 'primary' | 'secondary' | 'ghost'
     * @param {Component} props.icon - 图标组件
     * @param {ReactNode} props.children - 子元素
     * @param {function} props.onClick - 点击回调
     * @param {string} props.className - 额外的CSS类名
     */
    const Button = ({
        variant = 'primary',
        icon: Icon,
        children,
        onClick,
        className = '',
        ...rest
    }) => {
        const variantStyles = {
            ghost: 'hover:bg-zinc-100 text-black/60 hover:text-black border-transparent',
            secondary: 'bg-zinc-100 text-black hover:bg-zinc-200',
            primary: 'bg-black text-white hover:bg-zinc-800'
        };

        return (
            <button
                onClick={onClick}
                className={`px-3 py-1.5 rounded-none text-[12px] font-bold flex items-center gap-1 transition-all border border-black ${variantStyles[variant] || variantStyles.primary} ${className}`}
                {...rest}
            >
                {Icon && <Icon size={14} />}
                {children}
            </button>
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
    window.MagnesComponents.UI.Button = Button;

    console.log('✅ Button 组件已加载');
})();


