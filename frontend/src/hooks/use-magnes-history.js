(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};

    const { useState, useCallback, useRef, useEffect } = React;
    const { Performance, Constants } = window.MagnesComponents.Utils || {};

    /**
     * useMagnesHistory - 对话历史记录管理器
     * 
     * 功能：
     * 1. 负责从本地存储 (localStorage) 加载历史记录，并支持 V4 到最新版本的平滑迁移。
     * 2. 自动从后端 API 同步云端历史记录。
     * 3. 提供 pushState, updateState, deleteState 等方法，确保本地状态与后端持久化同步。
     * 4. 提供了撤销/重做的接口预留（暂未完全实现逻辑，但提供了状态判断）。
     */
    const useMagnesHistory = (initialState = []) => {
        const NEW_KEY = 'magnes_generation_history'; // 新版历史记录键名
        const OLD_KEY = 'magnes_history_v4';         // 旧版历史记录键名（用于迁移）
        const isLocal = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.protocol === 'file:';
    // Hamilton: 使用统一的后端 API 地址常量
    const backendBaseUrl = Constants?.MAGNES_API_URL || (window.location.protocol === 'file:' ? 'http://localhost:8088/api/v1' : '/api/v1');

        // Load from localStorage if available
        const [history, setHistory] = useState(() => {
            try {
                // Migration Logic: Check if new key exists, if not, try migrating from old key
                const saved = localStorage.getItem(NEW_KEY);
                if (saved) {
                    return JSON.parse(saved);
                } else {
                    const oldSaved = localStorage.getItem(OLD_KEY);
                    if (oldSaved) {
                        console.log('🔄 Migrating history from v4 to generation_history...');
                        localStorage.setItem(NEW_KEY, oldSaved);
                        // Optional: remove old key after successful migration
                        // localStorage.removeItem(OLD_KEY); 
                        return JSON.parse(oldSaved);
                    }
                }
                return initialState;
            } catch (e) {
                return initialState;
            }
        });

        const [historyIndex, setHistoryIndex] = useState(() => {
            try {
                const savedHistory = localStorage.getItem(NEW_KEY);
                if (savedHistory) {
                    const parsed = JSON.parse(savedHistory);
                    return parsed.length - 1;
                }
                return -1;
            } catch (e) {
                return -1;
            }
        });

        // --- NEW: Load from Backend ---
        useEffect(() => {
            const fetchCloudHistory = async () => {
                try {
                    const API = window.MagnesComponents.Utils.API;
                    const response = await API.magnesFetch('/history/');
                    if (response.ok) {
                        const cloudData = await response.json();
                        if (cloudData.length > 0) {
                            setHistory(cloudData);
                            console.log('✅ History loaded from cloud DB (Source)');
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch history from backend', e);
                }
            };
            fetchCloudHistory();
        }, []);

        // --- NEW: Sync Local to Backend (One-time migration) ---
        useEffect(() => {
            const syncLocalToCloud = async () => {
                const localSaved = localStorage.getItem(NEW_KEY);
                if (!localSaved) return;

                try {
                    const localHistory = JSON.parse(localSaved);
                    console.log('🔄 Migrating local history to cloud...', localHistory.length);

                    for (const item of localHistory) {
                        const API = window.MagnesComponents.Utils.API;
                        await API.magnesFetch('/history/', {
                            method: 'POST',
                            body: JSON.stringify(item)
                        });
                    }
                    console.log('✅ Source migration complete. Clearing local cache...');
                    localStorage.removeItem(NEW_KEY);
                } catch (e) {
                    console.warn('Migration failed or partial', e);
                }
            };
            syncLocalToCloud();
        }, []);

        const pushState = useCallback(async (newState, options = {}) => {
            setHistory(prev => {
                const newHistory = [...prev, newState];
                if (newHistory.length > 50) newHistory.shift();
                return newHistory;
            });

            if (options.noSync) return;

            // Persist to backend
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.magnesFetch('/history/', {
                    method: 'POST',
                    body: JSON.stringify(newState)
                });
            } catch (e) { console.error('Failed to persist history item', e); }
        }, []);

        const updateState = useCallback(async (id, updates, options = {}) => {
            setHistory(prev => {
                return prev.map(item => {
                    if (item.id === id) {
                        return { ...item, ...updates };
                    }
                    return item;
                });
            });

            if (options.noSync) return;

            // Update backend
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.magnesFetch('/history/', {
                    method: 'POST',
                    body: JSON.stringify({ id, ...updates })
                });
            } catch (e) { console.error('Failed to update history item', e); }
        }, []);

        const deleteState = useCallback(async (id) => {
            setHistory(prev => prev.filter(item => item.id !== id));

            // Delete from backend
            try {
                const API = window.MagnesComponents.Utils.API;
                await API.magnesFetch(`/history/${id}`, {
                    method: 'DELETE'
                });
            } catch (e) { console.error('Failed to delete history item', e); }
        }, []);

        const undo = useCallback(() => console.log('Undo feature not available'), []);
        const redo = useCallback(() => console.log('Redo feature not available'), []);
        const canUndo = historyIndex > 0;
        const canRedo = historyIndex < history.length - 1;

        return {
            history,
            historyIndex,
            pushState,
            updateState,
            deleteState,
            undo,
            redo,
            canUndo,
            canRedo
        };
    };

    window.MagnesComponents.Hooks.useMagnesHistory = useMagnesHistory;
})();
