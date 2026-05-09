/**
 * AssetPicker Component (分类 Tab 版本)
 * 路径: src/components/ui/asset-picker.js
 */

(function () {
    'use strict';
    console.log('[AssetPicker] 📦 Script loading...');

    // 延迟初始化，确保 React 和依赖都就绪
    function initAssetPicker() {
        const React = window.React;
        if (!React) {
            console.error('[AssetPicker] ❌ React not available');
            return null;
        }
        const { useState, useEffect, useCallback, useMemo } = React;

        // 安全检查依赖
        if (!window.MagnesComponents?.UI) {
            console.error('[AssetPicker] ❌ Missing MagnesComponents.UI');
            return null;
        }
        if (!window.MagnesComponents?.Utils?.API) {
            console.error('[AssetPicker] ❌ Missing MagnesComponents.Utils.API');
            return null;
        }

        const API = window.MagnesComponents.Utils.API;

        // Tab 按钮组件
        function TabButton({ active, onClick, children, count }) {
            return React.createElement('button', {
                onClick: onClick,
                className: active
                    ? 'px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-black text-white border border-black'
                    : 'px-3 py-1.5 text-[10px] font-black uppercase tracking-wider bg-white text-zinc-500 border border-zinc-200 hover:border-black hover:text-black'
            }, children + (count > 0 ? ` (${count})` : ''));
        }

        // 使用命名函数而不是箭头函数，更容易调试
        function AssetPicker(props) {
            const { isOpen, onClose, onSelect, title = '选择素材', isSidebar = false } = props || {};
            console.log('[AssetPicker] 🎨 Component rendering:', { isOpen, isSidebar });

            const [items, setItems] = useState([]);
            const [loading, setLoading] = useState(false);
            const [activeTab, setActiveTab] = useState('all');

            // 加载生图库数据
            const loadGallery = useCallback(async () => {
                console.log('[AssetPicker] 📡 Loading gallery...');
                setLoading(true);
                try {
                    const resp = await API.magnesFetch('/rag/documents?source_type=version_gallery&limit=60');
                    if (resp.ok) {
                        const data = await resp.json();
                        const docs = data.documents || [];
                        docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                        console.log('[AssetPicker] ✅ Loaded', docs.length, 'items');
                        // 打印第一个 item 的结构，帮助调试分类
                        if (docs.length > 0) {
                            console.log('[AssetPicker] 📄 Sample item structure:', {
                                id: docs[0].id,
                                tags: docs[0].tags,
                                user_tags: docs[0].user_tags,
                                style_tags: docs[0].style_tags,
                                label: docs[0].label,
                                prompt: docs[0].prompt?.substring(0, 50)
                            });
                        }
                        setItems(docs);
                    }
                } catch (e) {
                    console.error('[AssetPicker] Load failed:', e);
                } finally {
                    setLoading(false);
                }
            }, []);

            useEffect(() => {
                if (isOpen || isSidebar) {
                    loadGallery();
                }
            }, [isOpen, isSidebar, loadGallery]);

            // 从 items 中提取用户标签分类 (如 #背景图)
            const categories = useMemo(() => {
                const cats = new Map();
                cats.set('all', { label: '全部', count: items.length });

                items.forEach(item => {
                    let userTags = [];

                    // 1. 后端 user_tags 数组
                    if (Array.isArray(item.user_tags)) {
                        userTags = [...userTags, ...item.user_tags.filter(t => t && typeof t === 'string')];
                    }
                    // 2. 后端 style_tags 数组
                    if (Array.isArray(item.style_tags)) {
                        userTags = [...userTags, ...item.style_tags.filter(t => t && typeof t === 'string')];
                    }
                    // 3. 通用 tags 数组
                    if (Array.isArray(item.tags)) {
                        userTags = [...userTags, ...item.tags.filter(t => t && typeof t === 'string')];
                    }
                    // 4. 逗号分隔的字符串
                    else if (typeof item.tags === 'string' && item.tags.includes(',')) {
                        userTags = [...userTags, ...item.tags.split(',').map(t => t.trim()).filter(Boolean)];
                    }
                    // 5. 从 label/prompt 提取 #标签
                    ['label', 'prompt', 'title', 'description', 'folder_name'].forEach(field => {
                        if (item[field] && typeof item[field] === 'string') {
                            const hashTags = item[field].match(/#[\u4e00-\u9fa5\w-]+/g);
                            if (hashTags) userTags = [...userTags, ...hashTags];
                        }
                    });

                    // 去重并统计
                    const uniqueTags = [...new Set(userTags)];
                    uniqueTags.forEach(tag => {
                        const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
                        if (cats.has(cleanTag)) {
                            cats.get(cleanTag).count++;
                        } else {
                            cats.set(cleanTag, { label: cleanTag, count: 1 });
                        }
                    });
                });

                return cats;
            }, [items]);

            // 过滤后的 items - 根据用户标签过滤
            const filteredItems = useMemo(() => {
                if (activeTab === 'all') return items;
                return items.filter(item => {
                    let itemTags = [];

                    if (Array.isArray(item.user_tags)) {
                        itemTags = [...itemTags, ...item.user_tags.filter(t => t && typeof t === 'string')];
                    }
                    if (Array.isArray(item.style_tags)) {
                        itemTags = [...itemTags, ...item.style_tags.filter(t => t && typeof t === 'string')];
                    }
                    if (Array.isArray(item.tags)) {
                        itemTags = [...itemTags, ...item.tags.filter(t => t && typeof t === 'string')];
                    } else if (typeof item.tags === 'string' && item.tags.includes(',')) {
                        itemTags = [...itemTags, ...item.tags.split(',').map(t => t.trim()).filter(Boolean)];
                    }

                    ['label', 'prompt', 'title', 'description', 'folder_name'].forEach(field => {
                        if (item[field] && typeof item[field] === 'string') {
                            const hashTags = item[field].match(/#[\u4e00-\u9fa5\w-]+/g);
                            if (hashTags) itemTags = [...itemTags, ...hashTags];
                        }
                    });

                    const uniqueTags = [...new Set(itemTags)];
                    return uniqueTags.some(tag => {
                        const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
                        return cleanTag === activeTab;
                    });
                });
            }, [items, activeTab]);

            // 判断是否有分类 - 只要有至少 1 个标签就显示 Tab
            const hasMultipleCategories = categories.size > 1; // 'all' + at least 1 other

            if (!isOpen && !isSidebar) {
                console.log('[AssetPicker] ⏹️ Not rendering (isOpen=false, isSidebar=false)');
                return null;
            }

            console.log('[AssetPicker] 🖼️ Rendering UI with', items.length, 'items, categories:', categories.size);

            // 构建 Header 区域
            const headerChildren = [];

            // Tab 切换栏 - 只有多个分类时才显示
            if (hasMultipleCategories) {
                const tabButtons = [];
                categories.forEach((cat, key) => {
                    tabButtons.push(
                        React.createElement(TabButton, {
                            key: key,
                            active: activeTab === key,
                            onClick: () => setActiveTab(key),
                            count: cat.count
                        }, cat.label)
                    );
                });

                headerChildren.push(
                    React.createElement('div', {
                        key: 'tabs',
                        className: 'flex gap-1 p-2 border-b border-zinc-100 overflow-x-auto'
                    }, tabButtons)
                );
            }

            // 简化的 UI - 使用原生 DOM 元素避免任何 JSX 转译问题
            return React.createElement('div', {
                className: 'flex flex-col h-full bg-white'
            }, [
                // Header 区域（包含标题和 Tabs）
                ...headerChildren,
                // Content
                React.createElement('div', {
                    key: 'content',
                    className: 'flex-1 overflow-y-auto p-2'
                }, loading
                    ? React.createElement('div', { className: 'p-4 text-center text-zinc-400' }, '加载中...')
                    : filteredItems.length === 0
                        ? React.createElement('div', { className: 'p-4 text-center text-zinc-400' }, '暂无素材')
                        : React.createElement('div', { className: 'grid grid-cols-2 gap-2' },
                            filteredItems.map(item => React.createElement('div', {
                                key: item.id,
                                onClick: () => {
                                    console.log('[AssetPicker] 👆 Item clicked:', item.id);
                                    if (typeof onSelect === 'function') {
                                        onSelect({
                                            url: item.image_url,
                                            source: 'gallery',
                                            id: item.id
                                        });
                                    }
                                    if (!isSidebar && typeof onClose === 'function') {
                                        onClose();
                                    }
                                },
                                className: 'aspect-square bg-zinc-50 border border-zinc-100 cursor-pointer overflow-hidden hover:border-black'
                            }, React.createElement('img', {
                                src: item.image_url,
                                className: 'w-full h-full object-cover',
                                alt: ''
                            }))
                            )
                        )
                )
            ]);
        }

        // 导出
        if (window.MagnesComponents?.UI) {
            window.MagnesComponents.UI.AssetPicker = AssetPicker;
            console.log('✅ AssetPicker Loaded (Tab Version), typeof:', typeof AssetPicker);
        } else {
            console.error('[AssetPicker] ❌ Failed to export: UI namespace not found');
        }
        return AssetPicker;
    }

    // 延迟执行初始化，确保所有依赖就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAssetPicker);
    } else {
        // 如果 DOM 已就绪，延迟一小段时间确保其他脚本也加载完成
        setTimeout(initAssetPicker, 50);
    }
})();
