/**
 * App Context - 全局状态管理中心
 * 
 * 功能定位：
 * 1. 顶层状态存储：维护主题、画布视口、节点列表、连线、以及 API 配置等全局共享状态。
 * 2. 认证状态同步：初始化时自动从后端获取并同步所有 API Key 的认证状态。
 * 3. 跨组件分发：通过 MagnesProvider 将状态与 Setter 方法分发给所有子组件。
 * 4. 配置持久化：自动将 API 配置和用户偏好（如“即梦使用本地文件”）同步至 localStorage。
 */

(function () {
    'use strict';

    const { React } = window;
    const { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } = React;

    // 确保命名空间存在
    if (!window.MagnesComponents) window.MagnesComponents = {};
    if (!window.MagnesComponents.Context) window.MagnesComponents.Context = {};

    const MagnesContext = createContext(null);

    /**
     * MagnesProvider 组件
     * 提供全局应用状态
     */
    const MagnesProvider = ({ children }) => {
        const { DEFAULT_API_CONFIGS } = window.MagnesComponents.Utils.Constants;

        const [theme, setTheme] = useState('light');
        const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
        const [nodes, setNodes] = useState([]);
        const [connections, setConnections] = useState([]);
        const [selectedNodeId, setSelectedNodeId] = useState(null);
        const [connectingSource, setConnectingSource] = useState(null);
        const [lightboxItem, setLightboxItem] = useState(null);

        // 判断是否为空的自定义模型
        const isEmptyCustomModel = (config) => {
            if (!config.isCustom) return false; // 非自定义模型不过滤

            // 检查关键字段是否为空或默认值
            const hasEmptyProvider = !config.provider || config.provider === '新模型';
            const hasEmptyModelName = !config.modelName || config.modelName === 'model-name';
            const hasEmptyUrl = !config.url || config.url.trim() === '';
            const hasEmptyKey = !config.key || config.key.trim() === '';

            // 所有关键字段都为空才认为是空模型
            return hasEmptyProvider && hasEmptyModelName && hasEmptyUrl && hasEmptyKey;
        };

        // API 配置状态（从 localStorage 加载或使用默认值）
        const [apiConfigs, setApiConfigs] = useState(() => {
            try {
                const saved = localStorage.getItem('magnes_api_configs');
                const configs = saved ? JSON.parse(saved) : DEFAULT_API_CONFIGS;
                // 清理历史遗留的空模型
                return configs.filter(config => !isEmptyCustomModel(config));
            } catch (e) {
                console.error('加载 API 配置失败:', e);
                return DEFAULT_API_CONFIGS;
            }
        });

        // 创建 Map 优化查找性能（O(1)查找）
        const apiConfigsMap = useMemo(() => {
            const map = new Map();
            // 防御性检查：确保 apiConfigs 是数组
            if (Array.isArray(apiConfigs)) {
                apiConfigs.forEach(config => {
                    map.set(config.id, config);
                });
            }
            return map;
        }, [apiConfigs]);

        // 保存配置到 localStorage（过滤空模型）
        useEffect(() => {
            try {
                // 防御性检查：确保 apiConfigs 是数组
                if (!Array.isArray(apiConfigs)) {
                    console.warn('apiConfigs 不是数组，跳过保存');
                    return;
                }
                // 过滤掉空的自定义模型
                const validConfigs = apiConfigs.filter(config => !isEmptyCustomModel(config));
                localStorage.setItem('magnes_api_configs', JSON.stringify(validConfigs));
            } catch (e) {
                console.error('保存 API 配置失败:', e);
            }
        }, [apiConfigs]);

        // API Key 状态管理 (双端独立，详见模型配置弹窗说明)
        const [apiKeys, setApiKeys] = useState({
            global_api_url: '',
            global_api_key: '',
            slicer_api_url: '',
            slicer_api_key: ''
        });
        const [authStatus, setAuthStatus] = useState('loading'); // loading, configured, unconfigured, error

        // 用户认证状态
        const [user, setUser] = useState(() => {
            try {
                const Storage = window.BaseAPI?.Storage;
                return Storage?.loadUserInfo() || { isLoggedIn: false };
            } catch (e) {
                return { isLoggedIn: false };
            }
        });
        const [userToken, setUserToken] = useState(() => {
            try {
                const Storage = window.BaseAPI?.Storage;
                return Storage?.loadUserToken() || '';
            } catch (e) {
                return '';
            }
        });

        // 登录弹窗显示状态
        const [loginModalOpen, setLoginModalOpen] = useState(false);

        // 即梦图生图使用本地文件设置
        const [jimengUseLocalFile, setJimengUseLocalFile] = useState(() => {
            const saved = localStorage.getItem('magnes_jimeng_use_local_file');
            return saved !== null ? saved === 'true' : true;
        });

        // 初始化时从后端同步所有 API Key 的认证状态
        useEffect(() => {
            const fetchAuthStatus = async () => {
                try {
                    const API = window.MagnesComponents.Utils.API;
                    const resp = await API.magnesFetch('/auth/status');
                    const data = await resp.json();
                    if (data.status === 'success' && data.configs) {
                        setApiKeys({
                            global_api_url: data.configs.global_api_url.preview || '',
                            global_api_key: data.configs.global_api_key.preview || '',
                            slicer_api_url: data.configs.slicer_api_url.preview || '',
                            slicer_api_key: data.configs.slicer_api_key.preview || ''
                        });
                        setAuthStatus('configured');
                    } else {
                        setAuthStatus('unconfigured');
                    }
                } catch (e) {
                    console.error('获取认证状态失败:', e);
                    setAuthStatus('error');
                }
            };
            fetchAuthStatus();
        }, []);

        // 保存 jimengUseLocalFile
        useEffect(() => {
            localStorage.setItem('magnes_jimeng_use_local_file', String(jimengUseLocalFile));
        }, [jimengUseLocalFile]);

        // 用户登录处理
        const handleLoginSuccess = useCallback((data) => {
            const Storage = window.BaseAPI?.Storage;
            if (data.access_token && Storage) {
                Storage.saveUserToken(data.access_token);
                setUserToken(data.access_token);
            }
            if (data.user || data.username) {
                const userInfo = data.user || { username: data.username, isLoggedIn: true };
                Storage?.saveUserInfo(userInfo);
                setUser(userInfo);
            } else {
                setUser(prev => ({ ...prev, isLoggedIn: true }));
            }
            setLoginModalOpen(false);
        }, []);

        // 用户登出处理
        const handleLogout = useCallback(() => {
            const Storage = window.BaseAPI?.Storage;
            Storage?.clearUserAuth();
            setUser({ isLoggedIn: false });
            setUserToken('');
        }, []);

        // 检查是否已登录
        const isLoggedIn = useMemo(() => {
            return user?.isLoggedIn && userToken?.length > 0;
        }, [user, userToken]);

        // 监听打开登录弹窗事件
        useEffect(() => {
            const handleOpenLogin = (e) => {
                console.log('[AppContext] 🔓 收到打开登录弹窗事件:', e.detail);
                setLoginModalOpen(true);
            };
            window.addEventListener('magnes:open_login', handleOpenLogin);
            return () => window.removeEventListener('magnes:open_login', handleOpenLogin);
        }, []);

        const addNode = (node) => setNodes(prev => [...prev, node]);
        const updateNode = useCallback((id, data) => {
            setNodes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
        }, []);
        const removeNode = (id) => {
            setNodes(prev => prev.filter(n => n.id !== id));
            setConnections(prev => prev.filter(c => c.from !== id && c.to !== id));
        };

        const startGenerationRef = useRef((...args) => console.warn('Not implemented', args));
        const registerStartGeneration = (fn) => startGenerationRef.current = fn;
        const startGeneration = (...args) => startGenerationRef.current(...args);

        useEffect(() => {
            if (theme === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        }, [theme]);

        const value = {
            theme, setTheme,
            view, setView,
            nodes, setNodes, addNode, updateNode, removeNode,
            connections, setConnections,
            selectedNodeId, setSelectedNodeId,
            connectingSource, setConnectingSource,
            apiConfigs, setApiConfigs, apiConfigsMap,
            apiKeys, setApiKeys, authStatus, setAuthStatus,
            jimengUseLocalFile, setJimengUseLocalFile,
            lightboxItem, setLightboxItem,
            registerStartGeneration, startGeneration,
            // 用户认证相关
            user, setUser,
            userToken, setUserToken,
            isLoggedIn,
            loginModalOpen, setLoginModalOpen,
            handleLoginSuccess,
            handleLogout
        };

        return React.createElement(MagnesContext.Provider, { value }, children);
    };

    window.MagnesComponents.Context = {
        MagnesContext,
        MagnesProvider,
        useMagnesContext: () => useContext(MagnesContext)
    };

    console.log('✅ AppContext 已加载');
})();
