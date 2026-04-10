(function () {
    const { React } = window;
    const { useState, useEffect, useCallback } = React;
    const { api } = window.MagnesComponents.Rag.Utils;

    /**
     * useRagData - RAG (检索增强生成) 数据管理与同步 Hook
     * 
     * 功能定位：
     * 1. 知识中心的数据源头：负责从后端 API 抓取并维护统计数据、知识库文档、小红书笔记、生图库以及提示词资产。
     * 2. 提供细粒度的数据操作：包括分页加载、单项/批量删除、分类切换、以及上传/入库逻辑。
     * 3. 驱动 RAG UI 的多维展示：实现了按时间线 (Timeline) 或按标签 (Tags) 聚合数据的核心算法。
     * 4. 跨组件同步：监听 `magnes:refresh_knowledge_base` 事件，确保全局数据实时更新。
     */
    const useRagData = (activeTab, toast) => {
        const [stats, setStats] = useState({});
        const [kbDocs, setKbDocs] = useState([]);
        const [xhsDocs, setXhsDocs] = useState([]);
        const [galleryDocs, setGalleryDocs] = useState([]);
        const [promptDocs, setPromptDocs] = useState([]);
        const [kbCategory, setKbCategory] = useState('通用资料');
        const [allDocChunks, setAllDocChunks] = useState([]);
        const [selectedDocId, setSelectedDocId] = useState(null);
        const [selectedDocIds, setSelectedDocIds] = useState([]);

        const [activeFlowItem, setActiveFlowItem] = useState('docs');
        const [searchResults, setSearchResults] = useState([]);
        const [rewrittenQueries, setRewrittenQueries] = useState([]);
        const [retrievalStats, setRetrievalStats] = useState(null);

        const [galleryView, setGalleryView] = useState('timeline'); // 'timeline' | 'tags' | 'prompts'
        const [xhsView, setXhsView] = useState('category'); // [NEW] 'timeline' | 'category'
        const [activeGalleryTag, setActiveGalleryTag] = useState('全部');

        const handleSelectDoc = (id, isSelected) => {
            setSelectedDocIds(prev => isSelected ? [...prev, id] : prev.filter(i => i !== id));
        };

        const loadStats = useCallback(async () => {
            try { setStats(await api.get('/stats')); } catch (e) { console.error('Load Stats Failed:', e); }
        }, []);

        const loadKb = useCallback(async () => {
            try {
                const d = await api.get('/knowledge/documents');
                setKbDocs(d.documents || []);
            } catch (e) { console.error('Load KB Failed:', e); }
        }, []);

        const loadXhs = useCallback(async () => {
            try {
                const d = await api.get('/documents?source_type=xhs_covers&limit=100');
                const docs = d.documents || [];
                // 确保按创建时间倒序排列，最新的在最上方
                docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                setXhsDocs(docs);
            } catch (e) { console.error('Load XHS Failed:', e); }
        }, []);

        const loadGallery = useCallback(async () => {
            try {
                const d = await api.get('/documents?source_type=version_gallery&limit=100');
                const docs = d.documents || [];
                // 确保生图库也按时间倒序
                docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
                setGalleryDocs(docs);
            } catch (e) { console.error('Load Gallery Failed:', e); }
        }, []);

        const loadPrompts = useCallback(async () => {
            try {
                const d = await api.get('/prompts');
                setPromptDocs(d.prompts || []);
            } catch (e) { console.error('Load Prompts Failed:', e); }
        }, []);

        const loadChunks = useCallback(async (docId) => {
            if (!docId) return;
            setSelectedDocId(docId);
            try {
                const data = await api.get(`/knowledge/documents/${encodeURIComponent(docId)}/chunks`);
                setAllDocChunks(data.chunks || []);
            } catch (e) {
                toast?.('获取分块失败', 'error');
                setAllDocChunks([]);
            }
        }, [toast]);

        // 实现删除逻辑
        const deleteKb = useCallback(async (id) => {
            if (!id) return;
            const isFav = activeTab === 'xhs' && kbCategory === '收藏图片';
            const isKb = (id.startsWith('kb_') || activeTab === 'knowledge') && !isFav;

            const msg = isFav ? "确定要取消收藏这张图片吗？" : (isKb ? "确定要删除该文档及其所有知识分块吗？" : "确定要删除该笔记吗？");
            if (!confirm(msg)) return;

            try {
                if (isFav) {
                    await api.removeFavorite(id);
                } else {
                    const path = isKb ? `/knowledge/documents/${id}` : `/documents/${id}`;
                    await api.del(path);
                }

                toast?.('✓ 操作成功');

                // 重新加载数据
                loadStats();
                if (isKb) loadKb();
                else if (activeTab === 'xhs') {
                    if (isFav) {
                        // 强制刷新收藏列表
                        setKbCategory('收藏图片');
                    } else {
                        loadXhs();
                    }
                }
                else if (activeTab === 'gallery') loadGallery();

                if (selectedDocId === id) {
                    setSelectedDocId(null);
                    setAllDocChunks([]);
                }
            } catch (e) {
                toast?.(`操作失败: ${e.message}`, 'error');
            }
        }, [activeTab, kbCategory, loadStats, loadKb, loadXhs, loadGallery, selectedDocId, toast]);

        // [实现全部清空逻辑
        const deleteAll = useCallback(async () => {
            const typeMap = { 'xhs': 'xhs_covers', 'gallery': 'version_gallery', 'knowledge': 'knowledge_base' };
            const currentType = typeMap[activeTab];
            const typeName = activeTab === 'xhs' ? '灵感库' : (activeTab === 'gallery' ? '生图库' : '品牌知识库');

            if (!confirm(`确定要清空【${typeName}】中的所有文档吗？此操作不可撤销。`)) return;

            try {
                toast?.(`正在清空${typeName}...`, '', true);
                // 统一调用 /documents/actions/clear
                const path = `/documents/actions/clear${currentType ? `?source_type=${currentType}` : ''}`;
                await api.del(path);
                toast?.('✓ 已全部清空');

                // 重新加载数据
                loadStats();
                if (activeTab === 'knowledge') loadKb();
                else if (activeTab === 'xhs') loadXhs();
                else if (activeTab === 'gallery') loadGallery();

                setSelectedDocIds([]);
                setSelectedDocId(null);
                setAllDocChunks([]);
            } catch (e) {
                toast?.(`清空失败: ${e.message}`, 'error');
            }
        }, [activeTab, loadStats, loadKb, loadXhs, loadGallery, toast]);

        // --- 提示词删除逻辑 ---
        const deletePrompt = useCallback(async (id) => {
            if (!id || !confirm("确定要删除这条提示词吗？此操作不可撤销。")) return;
            try {
                // 修复：提示词库使用独立的删除接口
                await api.del(`/prompts/${id}`);
                toast?.('✓ 提示词已删除');
                loadPrompts(); // 重新加载列表
            } catch (e) {
                toast?.(`删除失败: ${e.message}`, 'error');
            }
        }, [loadPrompts, toast]);

        // --- [NEW] 提示词打标逻辑 ---
        const updatePromptTags = useCallback(async (id, tags) => {
            try {
                await api.patch(`/prompts/${id}/tags`, { tags });
                toast?.('✓ 标签已同步');
                // 乐观更新
                setPromptDocs(prev => prev.map(p => p.id === id ? { ...p, user_tags: tags } : p));
            } catch (e) {
                toast?.('打标失败', 'error');
            }
        }, [toast]);

        // 实现上传逻辑
        const doKbUpload = useCallback(async (file, category, tags) => {
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', category || '通用资料');
            formData.append('tags', tags || '');

            toast?.('正在解析并上传并分块...', '', true);
            try {
                const res = await api.upload('/knowledge/upload', formData);
                toast?.(`✓ 上传成功: ${file.name}`);
                loadStats();
                loadKb();
                return res;
            } catch (e) {
                toast?.(`上传失败: ${e.message}`, 'error');
                throw e;
            }
        }, [loadStats, loadKb, toast]);

        // 监听页签切换，自动重置当前分类为对应页签的第一个分类，并重置 RAG 流程状态
        useEffect(() => {
            // [FIX] 切换页签时，重置 RAG 流程状态和选择状态，避免 UI 残留
            setActiveFlowItem('docs');
            setSelectedDocId(null);
            setSelectedDocIds([]);

            if (activeTab === 'xhs') setKbCategory('笔记灵感');
            else if (activeTab === 'gallery') setKbCategory('我的生成');
            else if (activeTab === 'knowledge') setKbCategory('通用资料');
        }, [activeTab]);

        // 面板切换或初始化时加载数据
        useEffect(() => {
            if (activeTab === 'canvas') return;
            loadStats(); loadKb(); loadGallery(); loadXhs(); // [FIX] 增加 loadXhs()

            // 如果是灵感库下的收藏图片分类，单独加载
            if (activeTab === 'xhs' && kbCategory === '收藏图片') {
                const loadFavs = async () => {
                    try {
                        const d = await api.getFavorites();
                        // 适配格式，将收藏的图片模拟为文档对象供 XhsCard 渲染
                        setXhsDocs((d.images || []).map(img => ({
                            id: img.doc_id, // 暂时指向原文档
                            img_id: img.id, // 收藏的图片 ID
                            title: img.title,
                            image_url: img.image_url,
                            category: '收藏图片',
                            source_type: 'xhs_favorited'
                        })));
                    } catch (e) { console.error('Load Favorites Failed:', e); }
                };
                loadFavs();
            } else if (activeTab === 'xhs') {
                loadXhs(); // [FIX] 确保非收藏夹场景也加载
            } else if (activeTab === 'gallery') {
                loadGallery();
                loadPrompts();
            }
        }, [activeTab, kbCategory, loadStats, loadKb, loadXhs, loadGallery, loadPrompts]);

        // 监听全局刷新事件 (比如收藏操作后)
        useEffect(() => {
            const handleRefresh = () => {
                loadStats();
                loadPrompts(); // 无论当前处于哪个页签，收藏操作后都应刷新提示词库缓存
                if (activeTab === 'gallery') {
                    loadGallery();
                } else if (activeTab === 'xhs' && kbCategory === '收藏图片') {
                    setKbCategory(prev => prev); // 强制重新触发
                } else if (activeTab === 'knowledge') {
                    loadKb();
                }
            };
            window.addEventListener('magnes:refresh_knowledge_base', handleRefresh);
            return () => window.removeEventListener('magnes:refresh_knowledge_base', handleRefresh);
        }, [activeTab, kbCategory, loadStats]);

        const timelineDocs = galleryDocs || [];
        const taggedDocs = (galleryDocs || []).filter(d => d.user_tags && d.user_tags.length > 0);

        // 按日期聚合 (Timeline)
        const getGroupedTimeline = (docsToGroup) => {
            const groups = {};
            (docsToGroup || []).forEach(doc => {
                const date = doc.folder_name || (doc.created_at ? doc.created_at.split('T')[0] : '未知日期');
                if (!groups[date]) groups[date] = [];
                groups[date].push(doc);
            });
            // 排序：日期倒序
            return Object.keys(groups).sort().reverse().map(date => ({
                id: date,
                name: date,
                docs: groups[date]
            }));
        };

        // 按 Tag 聚合 (Categorized)
        const getGroupedByTags = () => {
            const groups = {};
            taggedDocs.forEach(doc => {
                (doc.user_tags || []).forEach(tag => {
                    if (!groups[tag]) groups[tag] = [];
                    groups[tag].push(doc);
                });
            });
            return Object.keys(groups).map(tag => ({
                id: tag,
                name: tag,
                docs: groups[tag]
            }));
        };

        const updateGalleryTags = useCallback(async (docId, tags) => {
            try {
                await api.patch(`/gallery/${docId}/tags`, { tags });
                toast?.('✓ 打标成功');
                // 乐观更新或重新加载
                setGalleryDocs(prev => prev.map(d => d.id === docId ? { ...d, user_tags: tags } : d));
            } catch (e) {
                toast?.('打标失败', 'error');
            }
        }, [toast]);

        const updateGalleryRating = useCallback(async (docId, rating) => {
            try {
                await api.patch(`/gallery/${docId}/rating`, { rating });
                toast?.('✓ 评分已更新');
                setGalleryDocs(prev => prev.map(d => d.id === docId ? { ...d, rating } : d));
            } catch (e) {
                toast?.('评分失败', 'error');
            }
        }, [toast]);

        const batchUpdateGalleryTags = useCallback(async (docIds, tags) => {
            try {
                await api.put('/gallery/batch/tags', { doc_ids: docIds, tags });
                toast?.(`✓ 已为 ${docIds.length} 张图片打标`);
                setGalleryDocs(prev => prev.map(d => docIds.includes(d.id) ? { ...d, user_tags: tags } : d));
            } catch (e) {
                toast?.('操作失败', 'error');
            }
        }, [toast]);

        const renameGalleryFolder = useCallback(async (docId, newName) => {
            try {
                await api.patch(`/gallery/${docId}/folder`, { folder_name: newName });
                toast?.('✓ 重命名成功');
                // 如果是同一个生成批次的，通常需要全部重命名
                const target = galleryDocs.find(d => d.id === docId);
                if (target?.group_id) {
                    setGalleryDocs(prev => prev.map(d => d.group_id === target.group_id ? { ...d, folder_name: newName } : d));
                } else {
                    setGalleryDocs(prev => prev.map(d => d.id === docId ? { ...d, folder_name: newName } : d));
                }
            } catch (e) {
                toast?.('重命名失败', 'error');
            }
        }, [galleryDocs, toast]);

        return {
            stats, kbDocs, xhsDocs, galleryDocs, promptDocs, kbCategory, allDocChunks,
            selectedDocId, selectedDocIds, activeFlowItem, searchResults,
            rewrittenQueries, retrievalStats,
            galleryView, xhsView, activeGalleryTag,
            timelineDocs, taggedDocs,
            groupedTimeline: getGroupedTimeline(timelineDocs),
            xhsGroupedTimeline: getGroupedTimeline(xhsDocs),
            groupedTags: getGroupedByTags(),

            setKbCategory, setSelectedDocId, setSelectedDocIds, setActiveFlowItem,
            setSearchResults, setRewrittenQueries, setRetrievalStats,
            setGalleryView, setXhsView, setActiveGalleryTag,

            handleSelectDoc, loadStats, loadKb, loadXhs, loadGallery, loadPrompts, loadChunks,
            deleteKb, deletePrompt, updatePromptTags, deleteAll, doKbUpload,
            updateGalleryTags, batchUpdateGalleryTags, updateGalleryRating, renameGalleryFolder,
            api // 导出 api 实例供外部（如 useWindowEvents）使用
        };
    };

    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};
    window.MagnesComponents.Hooks.useRagData = useRagData;
})();
