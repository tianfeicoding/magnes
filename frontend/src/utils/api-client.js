// API Client Module
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    // Helper: Create headers
    const createHeaders = (apiKey, isFormData = false) => {
        const headers = {
            'Authorization': `Bearer ${apiKey}`
        };
        if (!isFormData) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    };

    const API = {
        /**
         * Magnes Backend 专属通用 Fetch 封装
         * 自动处理 BaseUrl (localhost/同源) 和 Token (Bearer)
         * 优先使用用户 JWT Token，如果不存在则使用旧的全局 Token
         */
        magnesFetch: async (path, options = {}) => {
            // 优先使用用户 JWT Token
            const Storage = window.BaseAPI?.Storage;
            const userToken = Storage?.loadUserToken ? Storage.loadUserToken() : '';
            const fallbackToken = window.MagnesComponents.Utils.Constants?.MAGNES_API_TOKEN || '';
            const token = userToken || fallbackToken;

            // 调试日志
            console.log('[API Client] magnesFetch:', { path, hasUserToken: !!userToken, tokenLength: token?.length, authHeader: `Bearer ${token?.substring(0, 15)}...` });

            const baseUrl = window.MagnesComponents.Utils.Constants?.MAGNES_API_URL ||
                (window.location.protocol === 'file:' ? 'http://localhost:8088/api/v1' : '/api/v1');

            const headers = {
                'Authorization': `Bearer ${token}`,
                ...options.headers
            };

            if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }

            const fetchUrl = path.startsWith('http') ? path : `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

            const response = await fetch(fetchUrl, {
                ...options,
                headers,
                credentials: 'include'
            });

            // 处理认证错误：401/403 触发登录弹窗（仅当 triggerLogin 为 true 时）
            if ((response.status === 401 || response.status === 403) && options.triggerLogin) {
                console.warn('[API Client] 🔒 认证失败，触发登录弹窗');
                window.dispatchEvent(new CustomEvent('magnes:open_login', {
                    detail: { reason: 'auth_required', message: '请先登录后再使用此功能' }
                }));
            }

            return response;
        },

        /**
         * Generic send request wrapper (For external AI APIs)
         */
        sendRequest: async (url, method, body, apiKey, signal) => {
            const isFormData = body instanceof FormData;
            const headers = createHeaders(apiKey, isFormData);

            const response = await fetch(url, {
                method,
                headers,
                body: isFormData ? body : JSON.stringify(body),
                signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
            }

            return response.json();
        },

        Chat: {
            /**
             * Send chat completion request (OpenAI compatible)
             */
            createCompletion: async (messages, config, signal) => {
                const { url, key, modelName, ...rest } = config;
                const endpoint = `${url.replace(/\/+$/, '')}/v1/chat/completions`;

                const payload = {
                    model: modelName,
                    messages,
                    stream: false, // Currently handling non-stream in utilities
                    ...rest
                };

                return API.sendRequest(endpoint, 'POST', payload, key, signal);
            }
        },

        Image: {
            /**
             * Generate image via various providers
             */
            generate: async (prompt, config, signal) => {
                const { provider, url, key, modelName, ...params } = config;

                // Handle Midjourney
                if (provider === 'Midjourney' || modelName.includes('mj')) {
                    return API.Midjourney.generate(prompt, config, signal);
                }

                // Handle Jimeng
                if (provider.includes('Jimeng') || modelName.includes('jimeng')) {
                    return API.Jimeng.generate(prompt, config, signal);
                }

                // Default OpenAI Compatible (DALL-E, NanoBanana, Flux)
                const endpoint = `${url.replace(/\/+$/, '')}/v1/images/generations`;
                const payload = {
                    model: modelName,
                    prompt,
                    n: 1,
                    size: params.size || "1024x1024",
                    response_format: "b64_json", // Preferred for canvas
                    ...params
                };

                return API.sendRequest(endpoint, 'POST', payload, key, signal);
            }
        },

        Video: {
            generate: async (prompt, config, signal) => {
                // To be implemented based on specific providers (Sora, Grok, etc.)
                // Placeholder for now
                console.warn('Video generation API not fully generalized yet');
                return null;
            }
        },

        // Provider Specific Implementations
        Midjourney: {
            generate: async (prompt, config, signal) => {
                const { url, key } = config;
                const endpoint = `${url.replace(/\/+$/, '')}/mj/submit/imagine`;

                // Submit task
                const taskRes = await API.sendRequest(endpoint, 'POST', { prompt }, key, signal);
                const taskId = taskRes.result;

                // Poll for result
                return API.Midjourney.poll(taskId, config, signal);
            },

            poll: async (taskId, config, signal) => {
                const { url, key } = config;
                const fetchUrl = `${url.replace(/\/+$/, '')}/mj/task/${taskId}/fetch`;

                while (true) {
                    if (signal?.aborted) throw new Error('Aborted');

                    const res = await API.sendRequest(fetchUrl, 'GET', null, key, signal);

                    if (res.status === 'SUCCESS') {
                        return res;
                    } else if (res.status === 'FAILURE') {
                        throw new Error(res.failReason || 'MJ Generation Failed');
                    }

                    // Wait 2s
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        },

        Jimeng: {
            generate: async (prompt, config, signal) => {
                // Placeholder for Jimeng implementation logic
                // Needs strict session handling which might reside in component state
                throw new Error('Jimeng implementation requires session handling in component');
            }
        }
    };

    // ── Project 持久化 API ──
    API.Project = {
        /**
         * 获取项目列表
         */
        list: async () => {
            const res = await API.magnesFetch('projects');
            return res.json();
        },

        /**
         * 获取单个项目
         */
        get: async (projectId) => {
            const res = await API.magnesFetch(`projects/${projectId}`);
            return res.json();
        },

        /**
         * 获取最后活跃项目（用于刷新后自动恢复）
         */
        getLastActive: async () => {
            const res = await API.magnesFetch('projects/last/active');
            return res.json();
        },

        /**
         * 创建新项目
         */
        create: async (data) => {
            const res = await API.magnesFetch('projects', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            return res.json();
        },

        /**
         * 更新项目（自动保存）
         */
        update: async (projectId, data) => {
            const res = await API.magnesFetch(`projects/${projectId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            return res.json();
        },

        /**
         * 删除项目
         */
        delete: async (projectId) => {
            const res = await API.magnesFetch(`projects/${projectId}`, {
                method: 'DELETE'
            });
            return res.json();
        },

        /**
         * 创建快照
         */
        createSnapshot: async (projectId, data) => {
            const res = await API.magnesFetch(`projects/${projectId}/snapshots`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            return res.json();
        },

        /**
         * 获取快照列表
         */
        listSnapshots: async (projectId) => {
            const res = await API.magnesFetch(`projects/${projectId}/snapshots`);
            return res.json();
        }
    };

    // ── 细粒度操作日志 API ──
    API.ActionLog = {
        /**
         * 发送一条画布操作日志
         */
        log: async ({ actionType, targetNodeId, payload, description, conversationId }) => {
            const res = await API.magnesFetch('projects/action-log', {
                method: 'POST',
                body: JSON.stringify({
                    actionType,
                    targetNodeId,
                    payload,
                    description,
                    conversationId
                })
            });
            return res.json();
        },

        /**
         * 获取操作日志历史
         */
        history: async (limit = 50, actionType) => {
            let url = `projects/action-log/history?limit=${limit}`;
            if (actionType) url += `&action_type=${encodeURIComponent(actionType)}`;
            const res = await API.magnesFetch(url);
            return res.json();
        }
    };

    // ── 记忆回流 API ──
    API.Memory = {
        /**
         * 触发记忆分析（分析操作日志 → 提取偏好 → 写入 UserMemory）
         */
        analyze: async (limit = 100) => {
            const res = await API.magnesFetch('projects/analyze-memory', {
                method: 'POST',
                body: JSON.stringify({ limit })
            });
            return res.json();
        },

        /**
         * 预览记忆分析结果（不写入数据库）
         */
        preview: async (limit = 50) => {
            const res = await API.magnesFetch(`projects/memory-analysis/preview?limit=${limit}`);
            return res.json();
        }
    };

    window.MagnesComponents.Utils.API = API;
})();
