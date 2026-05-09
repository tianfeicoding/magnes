/**
 * rag-utils.js - RAG 工具与配置
 */
(function () {
    'use strict';

    const API_BASE = '/api/v1/rag';

    const getImageUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        if (url.startsWith('/api/v1/rag/images/')) {
            return `http://localhost:8088${url}`;
        }
        const parts = url.split(/[/\\]/);
        const filename = parts[parts.length - 1];
        if (!filename) return url;
        const imageId = filename.split('.')[0];
        return `${API_BASE}/knowledge/images/${imageId}`;
    };

    const TABS = [
        { key: 'xhs', label: '灵感库', icon: '◆' },
        { key: 'gallery', label: 'AI生图库', icon: '▲' },
        { key: 'knowledge', label: '品牌知识库', icon: '■' }
    ];

    const api = {
        get: async (path) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`);
            if (!response.ok) throw new Error(`API ${response.status}`);
            return response.json();
        },
        post: async (path, body) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Error');
            return data;
        },
        upload: async (path, formData) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Error');
            return data;
        },
        del: async (path) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('删除失败');
        },
        patch: async (path, body) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Error');
            return data;
        },
        put: async (path, body) => {
            const API = window.MagnesComponents.Utils.API;
            const response = await API.magnesFetch(`/rag${path}`, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Error');
            return data;
        },
        // --- 收藏图片 API ---
        getFavorites: () => api.get('/favorites'),
        addFavorite: (imgId, metadata) => api.post('/favorites', { img_id: imgId, metadata }),
        removeFavorite: (imgId) => api.del(`/favorites/${imgId}`)
    };

    // --- RAG Hooks ---
    const useBatchDocuments = (docIds) => {
        const { useState, useEffect } = window.React;
        const [documents, setDocuments] = useState([]);
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (!docIds || docIds.length === 0) {
                setDocuments([]);
                return;
            }

            const fetchBatch = async () => {
                setLoading(true);
                try {
                    // 后端接口是 GET /documents/batch?ids=id1,id2
                    const idsParam = docIds.join(',');
                    const data = await api.get(`/documents/batch?ids=${encodeURIComponent(idsParam)}`);
                    setDocuments(data.documents || []);
                } catch (e) {
                    console.error('[useBatchDocuments] Error:', e);
                    setDocuments([]);
                } finally {
                    setLoading(false);
                }
            };

            fetchBatch();
        }, [JSON.stringify(docIds)]);

        return { documents, loading };
    };

    // 导出到全局命名空间
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Pages = window.MagnesComponents.Pages || {};
    window.MagnesComponents.Rag = window.MagnesComponents.Rag || {};
    window.MagnesComponents.Rag.Utils = { API_BASE, getImageUrl, TABS, api };
    window.MagnesComponents.Rag.Hooks = { useBatchDocuments };
})();
