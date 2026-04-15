/**
 * GenerationService
 * 
 * 核心生成服务，负责与后端 API 通信。
 * 主要功能：
 * 1. 启动并轮询各类生成任务（图像生成、图层拆分、内容优化等）。
 * 2. 这里的逻辑已从直接调用三方 API 迁移到通过后端代理执行任务。
 * 3. 包含鲁棒的 JSON 修复逻辑和 AI 协议解析逻辑，用于从 LLM 返回的内容中提取布局数据。
 */
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Services = window.MagnesComponents.Services || {};

    const { Constants } = window.MagnesComponents.Utils;

    // --- Utils Helper (Internal to Service for now or imported) ---
    const getBlobFromUrl = async (url) => {
        const response = await fetch(url);
        return await response.blob();
    };

    const getBase64FromUrl = async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
        });
    };

    const getImageDimensions = (urlOrBlob) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.width, h: img.height });
            img.onerror = reject;
            img.src = typeof urlOrBlob === 'string' ? urlOrBlob : URL.createObjectURL(urlOrBlob);
        });
    };

    // --- Polling Logic ---
    // (Simplified migration of poll logic)
    const pollTask = async (pollUrl, apiKey, onUpdate, maxAttempts = 60) => {
        let attempt = 0;
        const check = async () => {
            if (attempt >= maxAttempts) {
                onUpdate({ status: 'failed', error: 'Polling timeout' });
                return;
            }
            attempt++;

            try {
                const resp = await fetch(pollUrl, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                const data = await resp.json();

                // Generic Status Check (Adapt based on V3 logic for different providers)
                // For now assuming standard { status, output, progress }
                const status = (data.status || data.data?.status || '').toUpperCase();

                if (['SUCCESS', 'COMPLETED', 'SUCCEEDED'].includes(status)) {
                    // Extract Result
                    let images = data.output || data.data?.images || data.images || [];
                    if (data.data?.data && Array.isArray(data.data.data)) {
                        images = data.data.data.map(item => item.url);
                    }
                    else if (data.output && Array.isArray(data.output)) {
                        images = data.output; // Replicate/Banana often returns array of urls
                    }

                    onUpdate({ status: 'completed', images, data });
                } else if (['FAILED', 'ERROR', 'CANCELED'].includes(status)) {
                    onUpdate({ status: 'failed', error: data.error || data.message || 'Unknown error' });
                } else {
                    // Progress
                    onUpdate({ status: 'generating', progress: Math.min(95, 10 + attempt), data });
                    setTimeout(check, 3000);
                }
            } catch (e) {
                console.error('Poll Error', e);
                setTimeout(check, 3000);
            }
        };
        check();
    };

    class GenerationService {
        constructor() {
            this.storyboardTaskMap = new Map();
        }

        async startGeneration({
            prompt,
            type = 'image',
            sourceImages = [],
            nodeId,
            options = {},
            apiConfigs = [],
            callbacks = {}
        }) {
            const { onHistoryUpdate, onNodeUpdate } = callbacks;

            // 1. Config & Auth (Deprioritized direct API in favor of Backend Proxy)
            const modelId = options.model || (type === 'image' ? 'nano-banana' : 'sora-2');
            const modelConfig = apiConfigs.find(c => c.id === modelId) || {};
            const finalModelName = modelConfig.modelName || modelId;

            const isLocal = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.protocol === 'file:';
            // Hamilton: 使用统一的后端 API 地址常量
            const backendBaseUrl = Constants.MAGNES_API_URL || (window.location.protocol === 'file:' ? 'http://localhost:8088/api/v1' : '/api/v1');

            console.log('[GenerationService] Redirecting to Backend Task Runner...', {
                internalId: modelId,
                resolvedModelName: finalModelName,
                type
            });

            // --- HELPER: Robust JSON Repair & Parse ---
            const robustParse = (str) => {
                const tryParse = (s) => {
                    try {
                        const res = JSON.parse(s);
                        console.log('[robustParse] ✅ Parse successful');
                        return res;
                    } catch (e) {
                        console.warn('[robustParse] ❌ Parse failed:', e.message);
                        return null;
                    }
                };

                // 1. 尝试标准解析
                let result = tryParse(str);
                if (result) return result;

                let repaired = str.trim();

                // 2. 修复属性名前的空格/引号问题
                // AI 有时会返回 " "width" 而不是 "width" (quote-space-quote-word-quote)
                const beforeFix = repaired;
                repaired = repaired.replace(/" "(\w+)"/g, '"$1"');
                if (repaired !== beforeFix) {
                    console.log('[robustParse] Fixed malformed property names');
                } else if (repaired.includes('" "')) {
                    console.warn('[robustParse] Still has " " patterns:', repaired.substring(195, 215));
                }

                // 3. 基础修复 (仅限明显的结构性缺失)
                repaired = repaired.replace(/\}\s*\{/g, '},{');
                repaired = repaired.replace(/\]\s*\[/g, '],[');

                // 4. 处理截断
                const openBraces = (repaired.match(/\{/g) || []).length;
                const closeBraces = (repaired.match(/\}/g) || []).length;
                if (openBraces > closeBraces) repaired += '}'.repeat(openBraces - closeBraces);

                const openBrackets = (repaired.match(/\[/g) || []).length;
                const closeBrackets = (repaired.match(/\]/g) || []).length;
                if (openBrackets > closeBrackets) repaired += ']'.repeat(openBrackets - closeBrackets);

                // 5. 清理末尾逗号
                repaired = repaired.replace(/,\s*([\}\]])/g, '$1');

                result = tryParse(repaired);
                if (result) return result;

                // 6. 处理字符串中间截断（找到最后一个完整的对象）
                // 尝试从后往前找到最后一个完整的 }
                let lastCompleteBrace = -1;
                let braceCount = 0;
                for (let i = 0; i < repaired.length; i++) {
                    if (repaired[i] === '{') braceCount++;
                    else if (repaired[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) lastCompleteBrace = i;
                    }
                }
                if (lastCompleteBrace > 0 && lastCompleteBrace < repaired.length - 1) {
                    const truncated = repaired.substring(0, lastCompleteBrace + 1);
                    result = tryParse(truncated);
                    if (result) return result;
                }

                // 5. 递归边界检查与补全
                const first = repaired.indexOf('{');
                const last = repaired.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    const candidate = repaired.substring(first, last + 1);
                    result = tryParse(candidate);
                    if (result) return result;
                }
                return null;
            };

            // --- HELPER: Parse JSON from AI Markdown or Raw Text ---
            const parseAIProtocol = (text) => {
                const jsonBlocks = [];
                const mdRegex = /```json\s*([\s\S]*?)\s*```/gi;
                let match;
                while ((match = mdRegex.exec(text)) !== null) {
                    const blockJson = robustParse(match[1].trim());
                    if (blockJson) jsonBlocks.push(blockJson);
                }

                if (jsonBlocks.length === 0) {
                    const first = Math.min(
                        text.indexOf('{') !== -1 ? text.indexOf('{') : Infinity,
                        text.indexOf('[') !== -1 ? text.indexOf('[') : Infinity
                    );
                    const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
                    if (first !== Infinity && last !== -1 && last > first) {
                        const candidate = text.substring(first, last + 1);
                        const blockJson = robustParse(candidate);
                        if (blockJson) {
                            jsonBlocks.push(blockJson);
                        } else {
                        }
                    }
                }

                if (jsonBlocks.length === 0) {
                    return null;
                }

                const mergedJson = {};
                jsonBlocks.forEach(block => {
                    if (Array.isArray(block)) {
                        mergedJson.layers = (mergedJson.layers || []).concat(block);
                    } else if (typeof block === 'object' && block !== null) {
                        // 1. 提取并清理布局相关字段
                        const rawElements = block.layers ||
                            block.elements ||
                            block.layout?.elements ||
                            block.layout?.layers ||
                            block.textRegions;

                        if (Array.isArray(rawElements)) {
                            mergedJson.layers = (mergedJson.layers || []).concat(rawElements);
                        }

                        // 2. 深度查找 extractedContent (支持多种常见变体和点号语法的嵌套)
                        const kie = block.extractedContent ||
                            block.layout?.extractedContent ||
                            block.content?.extractedContent ||
                            block.extract?.contents ||
                            block.extract?.content ||
                            block.content;

                        if (kie && typeof kie === 'object' && !Array.isArray(kie)) {
                            mergedJson.extractedContent = {
                                ...(mergedJson.extractedContent || {}),
                                ...kie
                            };
                        }

                        // 3. 合并其他所有非保留字段
                        Object.keys(block).forEach(key => {
                            if (!['layers', 'elements', 'layout', 'textRegions', 'extractedContent'].includes(key)) {
                                mergedJson[key] = block[key];
                            }
                        });
                    }
                });

                const layers = [];
                const rawLayers = mergedJson.layers || [];

                if (Array.isArray(rawLayers)) {
                    rawLayers.forEach((el, idx) => {
                        const b = el.bbox || el.box || {};
                        const bbox = Array.isArray(b) ? b : [
                            b.x || b.left || 0,
                            b.y || b.top || 0,
                            b.width || b.w || (b.right ? b.right - b.left : 0) || 0,
                            b.height || b.h || (b.bottom ? b.bottom - b.top : 0) || 0
                        ];

                        // 允许解析多种图层类型，不再硬编码为 text
                        const type = el.type || (el.role?.includes('image') ? 'placeholder_image' : 'text');
                        const style = el.style || {};

                        // 为占位图片类型添加标记
                        const isPlaceholderType = type === 'placeholder_image' || el.role?.includes('placeholder');

                        layers.push({
                            id: `ai_${type}_${idx}_${Date.now()}`,
                            type: type,
                            role: el.role || type,
                            text: el.content || el.text || el.label || "",
                            content: el.content || el.text || el.label || "", // 两侧兼容
                            bbox: bbox,
                            z_index: el.z_index !== undefined ? el.z_index : (250 + idx),
                            // 强制默认可见：覆盖后端可能返回的错误隐藏值
                            isHidden: false,
                            opacity: 1,
                            // 标记占位图片类型，供下游节点识别
                            isPlaceholder: isPlaceholderType,
                            style: {
                                fontSize: parseInt(style.fontSize || el.fontSize || 40) || 40,
                                color: style.color || el.color || '#000000',
                                fontWeight: style.fontWeight || el.fontWeight || 'bold',
                                textAlign: style.textAlign || el.textAlign || 'center',
                                fontFamily: style.fontFamily || el.fontFamily || 'PingFang SC'
                            }
                        });
                    });
                }
                return { layers, raw: mergedJson };
            };

            try {
                if (onNodeUpdate) {
                    onNodeUpdate(nodeId, { isGenerating: true });
                }
                // 3. Request Backend Task
                const API = window.MagnesComponents.Utils.API;
                // [DEBUG] 打印发送的数据
                const requestBody = {
                    prompt, type, sourceImages, nodeId,
                    options: { ...options, model: finalModelName }
                };
                console.log('[GenerationService] Request body:', {
                    type,
                    hasStyleEvolution: !!options.style_evolution,
                    styleEvolutionLength: options.style_evolution?.length,
                    fullOptions: options
                });

                const response = await API.magnesFetch('/tasks/run', {
                    method: 'POST',
                    triggerLogin: true, // 用户主动点击生图时触发登录弹窗
                    body: JSON.stringify(requestBody)
                });

                // 处理认证错误
                if (response.status === 401 || response.status === 403) {
                    console.warn('[GenerationService] 🔒 认证失败，需要登录');
                    throw new Error('请先登录后再使用生图功能');
                }

                const startData = await response.json();
                if (!response.ok) throw new Error(startData.detail || 'Failed to start task');

                const taskId = startData.task_id;
                console.log('[GenerationService] Task Started:', taskId);

                // 4. Initial History
                if (onHistoryUpdate) {
                    onHistoryUpdate({
                        id: taskId, type, status: 'generating',
                        prompt, modelName: modelId,
                        startTime: Date.now(), progress: 5, sourceNodeId: nodeId
                    }, 'push', { noSync: true });
                }

                // 5. Poll Backend for Status
                const pollBackend = async () => {
                    try {
                        const API = window.MagnesComponents.Utils.API;
                        const response = await API.magnesFetch(`/tasks/${taskId}`);
                        const update = await response.json();

                        if (onHistoryUpdate) {
                            onHistoryUpdate({ id: taskId, ...update }, 'update', { noSync: true });
                        }

                        if (update.status === 'completed') {
                            if (onNodeUpdate) {
                                const uData = { isGenerating: false };

                                // 优先级策略：优先提取 URL
                                let finalContent = update.url || null;

                                // 只有当 update.content 有实际内容时才尝试处理
                                if (update.content !== undefined && update.content !== null && update.content !== '') {
                                    // Hamilton: 强制保留原始文本供语义服务诊断
                                    if (type === 'refine') {
                                        uData.style_learning = update.content;
                                    }

                                    if (type === 'layout_analyze') {
                                        uData.content = update.content;
                                        console.log('[GenerationService] Layout Analysis Response (first 500 chars):', update.content.substring(0, 500));

                                        // 使用与 Refiner 相同的 parseAIProtocol
                                        const protocol = parseAIProtocol(update.content);
                                        console.log('[GenerationService] parseAIProtocol result:', {
                                            hasResult: !!protocol,
                                            hasLayers: !!protocol?.layers,
                                            layerCount: protocol?.layers?.length,
                                            rawKeys: protocol?.raw ? Object.keys(protocol.raw) : 'none'
                                        });

                                        if (protocol && protocol.layers && protocol.layers.length > 0) {
                                            uData.layoutData = { layers: protocol.layers };
                                            console.log('[GenerationService] ✅ Layout parsed via protocol:', protocol.layers.length, 'layers');
                                        } else {
                                            // 兜底：直接解析（处理 layout_analyzer 的特殊格式）
                                            console.warn('[GenerationService] ⚠️ Protocol returned empty, trying direct extraction');
                                            try {
                                                const mdMatch = update.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                                const jsonStr = mdMatch ? mdMatch[1].trim() : update.content;
                                                console.log('[GenerationService] Attempting JSON parse:', jsonStr.substring(0, 500));
                                                // 使用 robustParse 而不是直接 JSON.parse
                                                const parsed = robustParse(jsonStr);
                                                if (!parsed) {
                                                    throw new Error('robustParse returned null');
                                                }
                                                const elements = parsed.layout?.elements || parsed.elements || parsed.layers || [];

                                                if (Array.isArray(elements) && elements.length > 0) {
                                                    const layers = elements.map((el, idx) => {
                                                        // 智能类型判断：支持多种方式指定占位图
                                                        let type = el.type;
                                                        if (!type) {
                                                            if (el.role?.includes('placeholder') || el.semanticRole?.includes('placeholder')) {
                                                                type = 'placeholder_image';
                                                            } else if (el.role?.includes('image') || el.semanticRole?.includes('image')) {
                                                                type = 'placeholder_image';
                                                            } else {
                                                                type = 'text';
                                                            }
                                                        }
                                                        const isPlaceholder = type === 'placeholder_image' || el.role?.includes('placeholder');
                                                        return {
                                                            id: el.id || `layout_el_${type}_${idx}_${Date.now()}`,
                                                            type: type,
                                                            role: el.semanticRole || el.role || type,
                                                            content: el.content || el.text || '',
                                                            text: el.content || el.text || '',
                                                            bbox: el.bbox || { x: 0, y: 0, width: 0, height: 0 },
                                                            z_index: el.z_index !== undefined ? el.z_index : (250 + idx),
                                                            isHidden: false,
                                                            opacity: 1,
                                                            isPlaceholder: isPlaceholder,
                                                            style: el.style || {}
                                                        };
                                                    });
                                                    uData.layoutData = { layers };
                                                    console.log('[GenerationService] ✅ Layout parsed directly:', layers.length, 'layers');
                                                } else {
                                                    console.error('[GenerationService] ❌ No elements found in layout');
                                                    uData.layoutData = { layers: [] };
                                                }
                                            } catch (e) {
                                                console.error('[GenerationService] ❌ All parsing methods failed:', e.message);
                                                console.error('[GenerationService] Raw content that failed:', update.content);
                                                uData.layoutData = { layers: [] };
                                            }
                                        }
                                    } else if (type === 'style_analyze') {
                                        try {
                                            const parsed = JSON.parse(update.content);
                                            uData.style_learning = parsed.style_learning;
                                            uData.style_prompt = parsed.style_prompt;
                                            uData.style_genome = parsed.style_genome;
                                            uData.background_color = parsed.background_color;
                                        } catch (e) { console.error('Style Parse Error', e); }
                                    } else if (type === 'style_evolve') {
                                        // [FIX] 解析 style_evolve 返回的 JSON，提取 style_prompt 和 style_evolution
                                        try {
                                            const parsed = JSON.parse(update.content);
                                            uData.style_prompt = parsed.style_prompt;
                                            uData.style_evolution = parsed.style_evolution || [];
                                            // 验证模式额外字段（只要有 critic_report 就认为是验证模式）
                                            if (parsed.critic_report || parsed.generated_image) {
                                                uData.generated_image = parsed.generated_image;
                                                uData.critic_report = parsed.critic_report;
                                                uData.validation_mode = parsed.validation_mode;
                                                uData.create_validator_node = parsed.create_validator_node;
                                                console.log('[GenerationService] ✅ Validation mode detected:', {
                                                    score: parsed.critic_report?.score,
                                                    evaluationMode: parsed.critic_report?.evaluation_mode
                                                });
                                            }
                                            console.log('[GenerationService] ✅ Style Evolve parsed:', {
                                                hasStylePrompt: !!parsed.style_prompt,
                                                evolutionCount: parsed.style_evolution?.length,
                                                hasCriticReport: !!parsed.critic_report
                                            });
                                        } catch (e) {
                                            console.error('[GenerationService] ❌ Style Evolve Parse Error:', e);
                                        }
                                    } else if (type === 'refine' || type === 'split') {
                                        try {
                                            // 1. Direct JSON (Split)
                                            const parsed = JSON.parse(update.content);
                                            uData.layoutData = parsed.layers ? parsed : { layers: parsed };
                                            // 结构化数据通常会将内容映射为布局，这里不覆盖 finalContent
                                        } catch (e) {
                                            // 2. Protocol Parsing (Refine/Gemini)
                                            console.log('[GenerationService] Raw AI Response for Protocol Parsing:', update.content);
                                            const protocol = parseAIProtocol(update.content);
                                            if (protocol && (protocol.layers?.length > 0 || protocol.raw?.extractedContent)) {
                                                uData.layoutData = { layers: protocol.layers || [] };

                                                // 同步回传完整的协议数据，供下游节点直接使用
                                                if (protocol.raw) {
                                                    const kie = protocol.raw.extractedContent || {};
                                                    uData.content = {
                                                        ...kie,
                                                        fullProtocol: protocol.raw,
                                                        images: sourceImages // 保持图片引用
                                                    };
                                                    // 对于 refine 任务，我们可能直接使用了 uData.content 的对象结构
                                                    finalContent = uData.content;
                                                }
                                            } else {
                                                finalContent = update.content;
                                            }
                                        }
                                    } else {
                                        // 其它文本生成任务
                                        finalContent = update.content;
                                    }
                                }

                                // 最终保护：如果 finalContent 仍然有效，则写入 payload
                                if (finalContent !== null) {
                                    uData.content = finalContent;
                                }

                                // [Data Flow Monitor] 高级诊断日志
                                console.log(`%c[Generation Result] Node: ${nodeId} Type: ${type}`, 'background: #10b981; color: #fff; padding: 2px 4px;', {
                                    hasUrl: !!update.url,
                                    hasContent: !!update.content,
                                    finalPayload: uData
                                });

                                onNodeUpdate(nodeId, uData);
                            }
                            return;
                        } else if (update.status === 'failed') {
                            if (onNodeUpdate) onNodeUpdate(nodeId, { isGenerating: false });
                            return;
                        }

                        setTimeout(pollBackend, 2000);
                    } catch (e) {
                        console.error('Backend Poll Error', e);
                        setTimeout(pollBackend, 3000);
                    }
                };

                pollBackend();

            } catch (error) {
                console.error('Generation Error', error);
                if (onHistoryUpdate) {
                    // 使用 nodeId 作为临时 ID，因为 taskId 可能未定义
                    onHistoryUpdate({ id: taskId || `temp_${nodeId}_${Date.now()}`, status: 'failed', errorMsg: error.message }, 'update');
                }
                if (onNodeUpdate) {
                    onNodeUpdate(nodeId, { isGenerating: false });
                }
            }
        }
    }

    window.MagnesComponents.Services.GenerationService = new GenerationService();
})();
