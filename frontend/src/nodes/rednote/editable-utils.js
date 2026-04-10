/**
 * Rednote Editable Utils (JSX/Modular)
 * 路径: src/nodes/rednote/editable-utils.js
 * 
 * 为模板提供统一的可编辑字段包装逻辑。
 */

(function () {
    'use strict';

    const { React } = window;

    /**
     * 创建可编辑字段的辅助函数
     */
    function makeEditable(text, fieldName, data, onUpdate, options = {}) {
        const {
            className = '',
            style = {},
            isEditable = true,
            tag = 'span'
        } = options;

        // 获取 DraggableText 组件 (从即将重构的 Templates 模块或全局命名空间)
        const DraggableText = window.MagnesComponents?.Nodes?.Rednote?.DraggableText ||
            window.RednoteTemplates?.DraggableText;

        if (!DraggableText) {
            console.warn('DraggableText 组件未加载，字段将不可编辑');
            return React.createElement(tag, { className, style }, text);
        }

        return React.createElement(DraggableText, {
            text: text,
            onUpdate: (newText) => {
                if (onUpdate) {
                    onUpdate({ ...data, [fieldName]: newText });
                }
            },
            isEditable: isEditable,
            className: className,
            style: style
        });
    }

    /**
     * 批量创建可编辑字段
     */
    function makeEditableFields(fields, data, onUpdate) {
        const result = {};
        for (const [fieldName, options] of Object.entries(fields)) {
            const text = data[fieldName] || '';
            result[fieldName] = makeEditable(text, fieldName, data, onUpdate, options);
        }
        return result;
    }

    /**
     * 自动包装模板组件
     */
    function wrapWithEditableFields(TemplateComponent, editableFieldNames) {
        return function WrappedTemplate({ data, onUpdate, ...props }) {
            const editableData = new Proxy(data, {
                get(target, prop) {
                    const value = target[prop];
                    if (editableFieldNames.includes(prop) && typeof value === 'string') {
                        return makeEditable(value, prop, data, onUpdate, {
                            className: 'editable-field',
                            style: {}
                        });
                    }
                    return value;
                }
            });

            return React.createElement(TemplateComponent, {
                data: editableData,
                onUpdate,
                ...props
            });
        };
    }

    /**
     * 简化版：直接创建可编辑文本元素
     */
    function editableText(text, onChange, options = {}) {
        const DraggableText = window.MagnesComponents?.Nodes?.Rednote?.DraggableText ||
            window.RednoteTemplates?.DraggableText;
        if (!DraggableText) {
            return React.createElement('span', options, text);
        }

        return React.createElement(DraggableText, {
            text: text,
            onUpdate: onChange,
            isEditable: true,
            ...options
        });
    }

    // 导出
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};
    window.MagnesComponents.Utils.RednoteEditable = {
        makeEditable,
        makeEditableFields,
        wrapWithEditableFields,
        editableText
    };

    // 兼容旧版
    window.RednoteEditableUtils = window.MagnesComponents.Utils.RednoteEditable;

    console.log('✅ Rednote Editable Utils (JSX) Registered');
})();
