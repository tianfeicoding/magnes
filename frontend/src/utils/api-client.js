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
         */
        magnesFetch: async (path, options = {}) => {
            const token = window.MagnesComponents.Utils.Constants?.MAGNES_API_TOKEN || '';
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
            
            return fetch(fetchUrl, {
                ...options,
                headers,
                credentials: 'include'
            });
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

    window.MagnesComponents.Utils.API = API;
})();
