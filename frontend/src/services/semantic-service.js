/**
 * SemanticService
 * 
 * 语义识别服务，用于增强图层的元数据。
 * 主要功能：
 * 1. 自动对图层中的文字内容进行语义角色（Role）识别（如 title, date, price 等）。
 * 2. 通过 GenerationService 调用 LLM (如 GPT-4o) 进行意图理解。
 * 3. 为后续的样式自动匹配和模板化提供语义支撑。
 */
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Services = window.MagnesComponents.Services || {};

    /**
     * SemanticService
     * 负责对图层内容进行语义识别，为每个文字图层分配角色（Role）
     */
    class SemanticService {
        constructor() {
            this.roles = ['title', 'venue', 'date', 'calendar_info', 'time_indicator', 'year', 'price', 'highlights', 'description'];
            this.cachedPrompts = null;
        }

        /**
         * 加载后端提示词
         */
        async fetchPrompts() {
            if (this.cachedPrompts) return this.cachedPrompts;
            try {
                const API = window.MagnesComponents.Utils.API;
                console.log(`[SemanticService] Fetching prompts...`);
                const response = await API.magnesFetch('/prompts/');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const data = await response.json();
                console.log(`[SemanticService] Successfully loaded prompts:`, Object.keys(data));
                this.cachedPrompts = data;
                return data;
            } catch (err) {
                console.error('[SemanticService] Totally failed to load backend prompts:', err.message);
                return null;
            }
        }

        /**
         * 分析图层列表，返回带有 semanticRole 的新图层列表
         * @param {Array} layers 图层数组
         * @returns {Promise<Array>}
         */
        async analyze(layers) {
            const textLayers = layers.filter(l => l.type === 'text');
            if (textLayers.length === 0) return layers;

            const generationService = window.MagnesComponents.Services.GenerationService;
            if (!generationService) {
                console.warn('[SemanticService] GenerationService not found, skipping analysis.');
                return layers;
            }

            // 优先使用后端动态提示词
            const allPrompts = await this.fetchPrompts();
            let prompt = "";
            const layerInputs = textLayers.map((l, i) => ({ id: i, text: l.text || l.content }));

            if (allPrompts && allPrompts.SEMANTIC_ANALYSIS) {
                prompt = allPrompts.SEMANTIC_ANALYSIS.main.replace('{layers_json}', JSON.stringify(layerInputs, null, 2));
            } else {
                console.error('[SemanticService] SEMANTIC_ANALYSIS prompt missing');
                return layers;
            }

            try {
                // 使用 Promise 包装对话生成过程
                const result = await new Promise((resolve, reject) => {
                    generationService.startGeneration({
                        prompt: prompt,
                        type: 'refine',
                        nodeId: 'semantic-analyzer',
                        options: { model: 'gpt-4o' },
                        callbacks: {
                            onNodeUpdate: (id, data) => {
                                const text = data.style_learning || '';

                                // 1. 实时预览解析
                                if (text && data.isGenerating !== false) {
                                    const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                                    if (m) {
                                        try {
                                            const p = JSON.parse(m[1] || m[0]);
                                            if (Array.isArray(p)) resolve(p);
                                        } catch (e) { }
                                    }
                                }

                                // 2. 任务结束时的强制解析
                                if (data.isGenerating === false) {
                                    console.log(`%c[SemanticService] AI Raw Response Dump (Len:${text.length})`, 'background: #4f46e5; color: #fff; font-weight: bold; padding: 2px 4px;', text);

                                    if (!text || text.length < 2) {
                                        reject(new Error('LLM returned empty content. Possible backend/timeout issue.'));
                                        return;
                                    }

                                    const tryExtract = (str) => {
                                        // A. Markdown 块匹配
                                        const m = str.match(/```json\s*([\s\S]*?)\s*```/);
                                        if (m) {
                                            try { return JSON.parse(m[1].trim()); } catch (e) { }
                                        }
                                        // B. 数组外括号匹配
                                        const aStart = str.indexOf('['), aEnd = str.lastIndexOf(']');
                                        if (aStart !== -1 && aEnd > aStart) {
                                            const sub = str.substring(aStart, aEnd + 1);
                                            try { return JSON.parse(sub); } catch (e) {
                                                try { return JSON.parse(sub + ']'); } catch (e2) { }
                                                try { return JSON.parse(sub + '}]'); } catch (e3) { }
                                            }
                                        }
                                        // C. 对象外括号匹配
                                        const oStart = str.indexOf('{'), oEnd = str.lastIndexOf('}');
                                        if (oStart !== -1 && oEnd > oStart) {
                                            const sub = str.substring(oStart, oEnd + 1);
                                            try { return JSON.parse(sub); } catch (e) {
                                                try { return JSON.parse(sub + '}'); } catch (e2) { }
                                            }
                                        }
                                        return null;
                                    };

                                    let resultData = tryExtract(text);

                                    // 自动解包对象格式的响应 (如 { layers: [...] })
                                    if (resultData && !Array.isArray(resultData) && typeof resultData === 'object') {
                                        resultData = resultData.layers || resultData.items || resultData.data || Object.values(resultData).find(v => Array.isArray(v));
                                    }

                                    if (Array.isArray(resultData)) {
                                        resolve(resultData);
                                    } else {
                                        console.error('[SemanticService] Final Extraction Failed. Raw:', text);
                                        reject(new Error('LLM output format error: No valid JSON array detected. Check console for raw text.'));
                                    }
                                }
                            }
                        }
                    });
                });

                // 将识别出的角色映射回原图层
                const newLayers = [];
                layers.forEach(layer => {
                    if (layer.type !== 'text' && layer.type !== 'body') {
                        newLayers.push({ ...layer });
                        return;
                    }

                    const textContent = layer.text || layer.content;
                    let analysis = result.find(r => layerInputs[r.id]?.text === textContent);

                    if (analysis) {
                        // 支持原子化拆解 (Parts)
                        if (analysis.parts && Array.isArray(analysis.parts) && analysis.parts.length > 1) {
                            analysis.parts.forEach((part, pIdx) => {
                                let rawRole = part.role || analysis.role || 'other';
                                let semanticRole = rawRole;
                                let groupId = part.groupId || analysis.groupId || layer.groupId || null;

                                if (!groupId && rawRole.includes('_')) {
                                    const roleParts = rawRole.split('_');
                                    semanticRole = roleParts[0];
                                    groupId = `group_${roleParts[1]}`;
                                } else if (rawRole.includes('_')) {
                                    semanticRole = rawRole.split('_')[0];
                                }

                                const parentBbox = layer.bbox || [0, 0, 100, 20];
                                const partHeight = parentBbox[3] / analysis.parts.length;
                                const newBbox = [parentBbox[0], parentBbox[1] + (pIdx * partHeight), parentBbox[2], partHeight];

                                newLayers.push({
                                    ...layer,
                                    id: `${layer.id}_split_${pIdx}`,
                                    text: part.text || part.content || "",
                                    content: part.text || part.content || "",
                                    role: rawRole,
                                    semanticRole: semanticRole,
                                    groupId: groupId,
                                    bbox: newBbox
                                });
                            });
                        } else {
                            let rawRole = analysis.role || 'other';
                            let semanticRole = rawRole;
                            let groupId = (analysis.groupId !== undefined) ? analysis.groupId : (layer.groupId || null);

                            // 如果角色名中自带下划线（如 title_1），且没有显式 groupId，则尝试从角色名推导
                            if (!groupId && rawRole.includes('_')) {
                                const parts = rawRole.split('_');
                                semanticRole = parts[0];
                                groupId = `group_${parts[1]}`;
                            } else if (rawRole.includes('_')) {
                                semanticRole = rawRole.split('_')[0];
                            }

                            newLayers.push({
                                ...layer,
                                role: rawRole,
                                semanticRole: semanticRole,
                                groupId: groupId
                            });
                        }
                    } else {
                        newLayers.push({ ...layer });
                    }
                });

                console.log(`[SemanticService] Analysis Success (${newLayers.length} layers): `, newLayers);
                return newLayers;

            } catch (err) {
                console.error('[SemanticService] Analysis Global Error:', err);
                throw err; // 抛出错误以使 Caller (如 FineTuneNode) 中断流程
            }
        }

        async extractItems(text) {
            if (!text || !text.trim()) return [];
            const generationService = window.MagnesComponents.Services.GenerationService;
            if (!generationService) return [];

            const allPrompts = await this.fetchPrompts();
            let prompt = "";
            if (allPrompts && (allPrompts.ITEM_EXTRACTION || allPrompts.CONTENT_EXTRACTOR)) {
                const templateObj = allPrompts.ITEM_EXTRACTION || allPrompts.CONTENT_EXTRACTOR;
                prompt = templateObj.main.replace('{text}', text).replace('{text_content}', text);
            } else return [];

            try {
                return await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        console.warn('[SemanticService] Item Extraction Timed Out (30s). Falling back...');
                        resolve([]); // 超时则返回空，触发兜底
                    }, 30000);

                    generationService.startGeneration({
                        prompt: prompt,
                        type: 'refine',
                        nodeId: 'item-extractor',
                        options: { model: 'gpt-4o' },
                        callbacks: {
                            onNodeUpdate: (id, data) => {
                                if (data.style_learning) {
                                    const m = data.style_learning.match(/\[\s*\{[\s\S]*\}\s*\]/);
                                    if (m) { 
                                        try { 
                                            const items = JSON.parse(m[0]);
                                            clearTimeout(timeoutId);
                                            resolve(items); 
                                            return; 
                                        } catch (e) { } 
                                    }
                                }
                                if (data.isGenerating === false) {
                                    clearTimeout(timeoutId);
                                    const m = (data.style_learning || '').match(/\[\s*\{[\s\S]*\}\s*\]/);
                                    if (m) { 
                                        try { resolve(JSON.parse(m[0])); } 
                                        catch (e) { resolve([]); } // JSON 损坏也不要 Block 画布
                                    }
                                    else {
                                        console.warn('[SemanticService] No JSON found in finished output');
                                        resolve([]); 
                                    }
                                }
                            }
                        }
                    });
                });
            } catch (err) {
                console.error('[SemanticService] Item Extraction Failed:', err);
                return [];
            }
        }

        async refineForRednote(text) {
            if (!text || !text.trim()) return null;
            const generationService = window.MagnesComponents.Services.GenerationService;
            if (!generationService) return null;

            const allPrompts = await this.fetchPrompts();
            let prompt = "";
            if (allPrompts && allPrompts.REDNOTE_OPTIMIZE) {
                prompt = allPrompts.REDNOTE_OPTIMIZE.main.replace('{text}', text);
            } else return null;

            try {
                return await new Promise((resolve, reject) => {
                    generationService.startGeneration({
                        prompt: prompt,
                        type: 'refine',
                        nodeId: 'rednote-refiner',
                        options: { model: 'gpt-4o' },
                        callbacks: {
                            onNodeUpdate: (id, data) => {
                                if (data.style_learning) {
                                    const m = data.style_learning.match(/\{[\s\S]*\}/);
                                    if (m) { try { resolve(JSON.parse(m[0])); return; } catch (e) { } }
                                }
                                if (data.isGenerating === false) {
                                    const m = (data.style_learning || '').match(/\{[\s\S]*\}/);
                                    if (m) { try { resolve(JSON.parse(m[0])); } catch (e) { reject(e); } }
                                    else reject(new Error('No JSON info found'));
                                }
                            }
                        }
                    });
                });
            } catch (err) {
                console.error('[SemanticService] Rednote Refine Failed:', err);
                return null;
            }
        }
    }

    window.MagnesComponents.Services.SemanticService = new SemanticService();
    console.log('✅ Semantic Service Registered (Clean Version)');
})();
