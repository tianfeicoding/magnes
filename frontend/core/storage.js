/**
 * BaseAPI Storage
 * localStorage 存储管理
 * 
 * 封装所有 localStorage 操作
 * @module baseapi/storage
 * @version 1.0.0
 */

(function (global) {
    'use strict';

    // localStorage 键名常量
    const STORAGE_KEYS = {
        API_CONFIGS: 'magnes_api_configs',
        TEST_API_CONFIGS: 'magnes_test_configs',
        GLOBAL_KEY: 'magnes_global_key',
        JIMENG_USE_LOCAL_FILE: 'magnes_jimeng_use_local_file',
        GENERATION_HISTORY: 'magnes_generation_history'
    };

    /**
     * 保存 API 配置到 localStorage
     * @param {Array} configs - API 配置数组
     */
    function saveConfigs(configs) {
        try {
            localStorage.setItem(STORAGE_KEYS.API_CONFIGS, JSON.stringify(configs));
            return true;
        } catch (error) {
            console.error('保存 API 配置失败:', error);
            return false;
        }
    }

    /**
     * 从 localStorage 加载 API 配置
     * @returns {Array|null} API 配置数组，如果不存在返回 null
     */
    function loadConfigs() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.API_CONFIGS);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            console.error('加载 API 配置失败:', error);
            return null;
        }
    }

    /**
     * 保存全局 API Key
     * @param {string} key - API Key
     */
    function saveGlobalKey(key) {
        try {
            localStorage.setItem(STORAGE_KEYS.GLOBAL_KEY, key);
            return true;
        } catch (error) {
            console.error('保存全局 Key 失败:', error);
            return false;
        }
    }

    /**
     * 加载全局 API Key
     * @returns {string} API Key，如果不存在返回空字符串
     */
    function loadGlobalKey() {
        try {
            return localStorage.getItem(STORAGE_KEYS.GLOBAL_KEY) || '';
        } catch (error) {
            console.error('加载全局 Key 失败:', error);
            return '';
        }
    }

    /**
     * 保存即梦使用本地文件设置
     * @param {boolean} useLocalFile - 是否使用本地文件
     */
    function saveJimengUseLocalFile(useLocalFile) {
        try {
            localStorage.setItem(STORAGE_KEYS.JIMENG_USE_LOCAL_FILE, String(useLocalFile));
            return true;
        } catch (error) {
            console.error('保存即梦设置失败:', error);
            return false;
        }
    }

    /**
     * 加载即梦使用本地文件设置
     * @returns {boolean} 是否使用本地文件，默认为 true
     */
    function loadJimengUseLocalFile() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.JIMENG_USE_LOCAL_FILE);
            return saved !== null ? saved === 'true' : true;
        } catch (error) {
            console.error('加载即梦设置失败:', error);
            return true;
        }
    }

    /**
     * 清除所有配置
     */
    function clearAll() {
        try {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            return true;
        } catch (error) {
            console.error('清除配置失败:', error);
            return false;
        }
    }

    // 导出到全局命名空间
    if (!global.BaseAPI) {
        global.BaseAPI = {};
    }

    global.BaseAPI.Storage = {
        STORAGE_KEYS,
        saveConfigs,
        loadConfigs,
        saveGlobalKey,
        loadGlobalKey,
        saveJimengUseLocalFile,
        loadJimengUseLocalFile,
        clearAll
    };

    console.log('✅ BaseAPI Storage 已加载');

})(typeof window !== 'undefined' ? window : global);
