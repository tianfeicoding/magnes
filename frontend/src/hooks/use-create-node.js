(function () {
    const { React } = window;
    const { useCallback } = React;
    // 移除快照式引用，改由下文函数内动态获取

    /**
     * useCreateNode - 对话驱动的节点合成与生成 Hook
     * 
     * 功能定位：
     * 1. 响应对话助手（灵感助手）发出的创建节点请求（magnes:create_node）。
     * 2. 调用外部 SemanticService 对自然语言内容进行语义解析（提取时间、地点、标题等）。
     * 3. 匹配并加载营销模版，将提取的结构化数据精密映射到模版图层中。
     * 4. 在画布上自动创建“内容-模版-精细编辑”三段式工作流节点及其连线。
     * 5. 支持原地同步：若当前会话在画布已有节点，则直接更新现有节点内容而不再创建新节点。
     */
    const useCreateNode = ({
        setNodes,
        setEdges,
        setActiveTab,
        toast,
        conversationId
    }) => {
        const isProcessingRef = React.useRef(false);

        const handleCreateNodeRequest = useCallback(async (e) => {
            if (isProcessingRef.current) {
                console.warn('[Magnes] ⚠️ A node creation task is already in progress, ignoring.');
                return;
            }
            isProcessingRef.current = true;

            const {
                templateId,
                content: activityContent,
                prompt: activityPrompt,
                useEmoji,
                action // 从 e.detail 中取出真正的 action 标识
            } = e.detail;

            // 通用工具：循环剥除行首 Emoji（防止多次叠加残留）
            const stripLeadingEmoji = (str) => {
                let result = str;
                while (/^[\u{1F300}-\u{1FFFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}][\s\uFE0F]*/u.test(result)) {
                    result = result.replace(/^[\u{1F300}-\u{1FFFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}][\s\uFE0F]*/u, '');
                }
                return result.trim();
            };

            // 辅助函数: 归一化活动项的键名 (同步内容节点的逻辑)
            const normalizeActivityItems = (items) => {
                if (!items || !Array.isArray(items)) return items;
                return items.map(item => {
                    const normalized = {};
                    Object.keys(item).forEach(key => {
                        const val = item[key]; // [Restore] 核心变量挂载点
                        const Helpers = window.MagnesComponents?.Utils?.ParseHelpers;
                        const normalizedKey = Helpers ? Helpers.normalizeRole(key) : key;
                        if (val && (!normalized[normalizedKey] || String(val).length > String(normalized[normalizedKey]).length)) {
                            normalized[normalizedKey] = val;
                        }
                    });

                    // 极致贪婪探测逻辑：如果核心字段为空，翻遍所有 Key 找可能的备选
                    const findInAllKeys = (keywords) => {
                        return Object.entries(item).find(([k, v]) =>
                            keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())) && v && typeof v === 'string'
                        )?.[1] || '';
                    };

                    // [FIX] 移除 '活动' 关键词，避免 '活动时间'/'活动地点' 等被错误匹配为 title
                    if (!normalized.title) normalized.title = stripLeadingEmoji(findInAllKeys(['标题', '主题', '名称', 'title', 'header']));
                    // [FIX] 地点不再从 subtitle 提取，因为 subtitle (副标题) 往往就是活动名称本身
                    if (!normalized.venue) normalized.venue = findInAllKeys(['地点', '场所', '场地', '地址', 'location', 'venue', 'address']);
                    if (!normalized.date) normalized.date = findInAllKeys(['日期', '时间', '月份', 'date', 'time', 'calendar']);
                    if (!normalized.price) normalized.price = findInAllKeys(['门票', '价格', '票价', '费用', 'price', 'ticket', 'fee']);

                    // [FIX] 无论 title 来自何处，统一剥除行首 emoji，保证内容节点与画布一致
                    if (normalized.title) normalized.title = stripLeadingEmoji(normalized.title);

                    // [FIX] 防御性逻辑：如果解析出的地点和标题一模一样，说明是误提取，清理掉
                    let finalVenue = normalized.venue || item.venue || '';
                    if (finalVenue && normalized.title && stripLeadingEmoji(finalVenue) === normalized.title) {
                        finalVenue = '';
                    }

                    return {
                        ...item, // 先解开原始数据，保留所有原始 Key (如 "地点：")
                        id: item.id || Date.now() + Math.random(),
                        title: normalized.title || stripLeadingEmoji(item.title || ''),
                        venue: finalVenue, // 归一化值作为最高优先级覆盖同名 Key
                        date: normalized.date || item.date || '',
                        year: normalized.year || item.year || '2026',
                        price: normalized.price || item.price || '',
                        description: normalized.description || item.description || '',
                        images: normalized.images || item.images || []
                    };
                });
            };

            // 辅助函数: 为物品列表补全 Emoji (统一增强版: 图标代标题)
            const applyEmojiToItems = (items) => {
                const iconMap = {
                    date: '⏰', time: '⏰', 时间: '⏰', 日期: '⏰', Date: '⏰', Time: '⏰',
                    // [FIX] 移除 subtitle, 它是用于标题/副标题的，不应带 Emoji
                    venue: '📍', location: '📍', 地点: '📍', 场所: '📍', 场地: '📍', 地址: '📍', Location: '📍', Address: '📍', address: '📍', Venue: '📍',
                    price: '🎫', 门票: '🎫', 价格: '🎫', 费用: '🎫', Price: '🎫', Fee: '🎫',
                    description: '✨', highlights: '✨', 亮点: '✨', 特色: '✨', 简介: '✨', 内容: '✨', Description: '✨', Highlights: '✨', Content: '✨'
                };
                return items.map(item => {
                    const newItem = { ...item };
                    for (const [key, icon] of Object.entries(iconMap)) {
                        // [FIX] 确认不仅是名为 title 的 key，而是所有带有标题属性或 ID 的 key 都不打 Emoji
                        if (key.toLowerCase().includes('title') || key === 'id' || key === 'year') continue;

                        if (newItem[key] && typeof newItem[key] === 'string') {
                            let val = newItem[key].trim();
                            // 移除所有可能的中文标题和符号前缀
                            val = val.replace(/^(时间|日期|地点|场所|场地|地址|价格|门票|票价|费用|亮点|特色|简介|介绍|文案|内容|标题)[:：\-—]\s*/, '');

                            // 检查是否已经有了任何 Emoji（防止重复叠加）
                            // 范围说明：1F300-1F9FF (大部分图标), 2600-26FF (符号), 2300-23FF (包含闹钟), 2700-27BF (包含闪烁)
                            const alreadyHasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]/u.test(val.slice(0, 4));

                            if (val && !alreadyHasEmoji) {
                                newItem[key] = `${icon} ${val}`;
                            } else {
                                newItem[key] = val;
                            }
                        }
                    }
                    return newItem;
                });
            };

            let textContent = activityContent || activityPrompt || '';


            // 识别并解析 AI 的 JSON 指令源码
            if (textContent.trim().startsWith('{')) {
                try {
                    const parsed = JSON.parse(textContent.trim());
                    if (parsed.content || parsed.text) {
                        textContent = parsed.content || parsed.text;
                        console.log('[Magnes] 📝 Parsed clean content from JSON instruction');
                    }
                } catch (e) {
                    console.warn('[Magnes] Failed to parse content as JSON, using raw text');
                }
            }

            console.log('[Magnes] 🛎️ Starting Multi-Node Creation Flow:', { templateId, contentLength: textContent.length, useEmoji });

            // 记录原始文本，用于后续解析
            const rawTextContent = textContent;

            // 仅在显示层面（如果需要）对 textContent 进行 Emoji 增强
            // [FIX] 严格识别关键词，不含关键词的行（标题）绝不加 Emoji
            if (useEmoji && textContent) {
                const lines = textContent.split('\n');
                const emojiLines = lines.map(line => {
                    const l = line.trim();
                    if (!l) return line;
                    // 如果已经有 Emoji，不再处理
                    if (l.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2700}-\u{27BF}]/u)) return line;

                    const hasColon = l.includes(':') || l.includes('：');
                    // 没有冒号的行大概率是标题或纯信息，不加 Emoji
                    if (!hasColon) return line;

                    if (l.includes('时间') || l.includes('日期')) return '⏰ ' + l;
                    if (l.includes('地点') || l.includes('场地')) return '📍 ' + l;
                    if (l.includes('门票') || l.includes('价格')) return '🎫 ' + l;
                    if (l.includes('亮点') || l.includes('特色')) return '✨ ' + l;
                    return line;
                });
                textContent = emojiLines.join('\n');
            }

            try {
                // 1. 拉取营销模版
                console.log('[Magnes] 🕒 Step 1: Fetching templates...');
                const API = window.MagnesComponents.Utils.API;
                const res = await API.magnesFetch('templates');

                if (!res.ok) {
                    throw new Error(`无法获取模板列表 (HTTP ${res.status})`);
                }

                const templates = await res.json();
                // 找不到指定模版则取第一个作为兜底
                const template = templates.find(t => t.id === templateId) || templates[0];
                if (!template) throw new Error('未找到指定模版');
                console.log('[Magnes] ✅ Step 1: Template loaded:', template.name);

                // --- [CRITICAL ARCHITECTURE CHANGE: REGEX-FIRST] ---
                // 正则解析现在是“第一优先级”和“真相信源”
                const Helpers = window.MagnesComponents.Utils.ParseHelpers;
                let activities = Helpers ? Helpers.parseActivities(rawTextContent) : [];
                console.log('[Magnes] 🧬 Regex-First Extraction Result:', activities.length);

                // 仅当正则解析彻底失败（通常是对于极其凌乱的全文抓取文本）时，才调用 AI 进行语义提取
                const isVeryMessy = !activities || activities.length === 0 || activities.some(it => !it.title || it.title.length < 2);

                // [Optimization] 如果是 create_rednote_node 路径，通常数据已经过后端预处理，不再进行 AI 二次提取
                const skipAIExtract = action === 'create_rednote_node' || !isVeryMessy;

                if (!skipAIExtract) {
                    console.log('[Magnes] 🕒 Messy text detected, calling AI extraction for help...');
                    if (toast) toast('🔍 正在通过 AI 辅助识别凌乱文本...', 'info');
                    const semanticService = window.MagnesComponents.Services.SemanticService;
                    if (semanticService) {
                        try {
                            const aiItems = await semanticService.extractItems(rawTextContent);
                            if (aiItems && aiItems.length > 0) {
                                // 混合逻辑：使用 AI 的分块，但尝试用正则的精准字段补全 (回流)
                                activities = aiItems.map((aiItem, idx) => {
                                    const regexItem = activities[idx] || {};
                                    return {
                                        ...regexItem,
                                        ...aiItem,
                                        rawBlock: aiItem.rawBlock || regexItem.rawBlock || ""
                                    };
                                });
                            }
                        } catch (e) {
                            console.error('[Magnes] AI extraction failed, keeping regex items.', e);
                        }
                    }
                }

                // 进行键名归一化 (确保 location -> venue 等)
                activities = normalizeActivityItems(activities);

                // 统一增强版 Emoji 补全 (在归一化之后)
                if (useEmoji && activities.length > 0) {
                    activities = applyEmojiToItems(activities);
                }

                console.log('[Magnes] ✅ Step 2: Finished parsing. Total activities:', activities.length);

                // 3. 模版图层分类处理
                const layout = template.layout || [];
                // 筛选出所有可变文字图层
                const textLayersInTemplate = layout.filter(l => l.type === 'text' && l.isVariable);

                // 按语义角色分组，以支持多活动并行映射
                const roleGroups = {};
                textLayersInTemplate.forEach(l => {
                    const Helpers = window.MagnesComponents?.Utils?.ParseHelpers;
                    const role = Helpers ? Helpers.normalizeRole(l.semanticRole || l.role || 'other') : 'other';
                    if (!roleGroups[role]) roleGroups[role] = [];
                    roleGroups[role].push(l);
                });
                console.log('[Magnes] 📂 Role Groups for mapping:', Object.keys(roleGroups));

                // 4. 执行语义填充
                const filledTextLayers = textLayersInTemplate.map(layer => {
                    const Helpers = window.MagnesComponents?.Utils?.ParseHelpers;
                    const role = Helpers ? Helpers.normalizeRole(layer.semanticRole || layer.role || 'other') : 'other';
                    const roleList = roleGroups[role] || [];
                    const slotIdx = roleList.indexOf(layer); // 该 role 在模板中的第 N 个槽位

                    // [PATCH] 标题层对位修正：
                    // 如果模板的 title 槽位数 > activities 数，说明第0个 title 槽是"总标题"，
                    // 后续 title 槽从 activities[0] 开始对应。
                    // 如果 title 槽位数 == activities 数，则 1:1 直接对位。
                    let activityIdx;
                    if (role === 'title' && roleList.length > activities.length) {
                        // 多出一个 title 槽 → 第0个是总标题页面槽，从第1个开始对应活动
                        activityIdx = slotIdx - 1; // slotIdx=0 → -1 (总标题), slotIdx=1 → 0 (活动1)...
                    } else {
                        activityIdx = slotIdx;
                    }

                    // 核心逻辑：第 N 个同角色的图块对应文本中解析出的第 N 个活动
                    // activityIdx=-1 表示这是总标题（页面级）槽，直接保留模版原始文字，不注入内容
                    if (activityIdx < 0) {
                        return { ...layer, text: '', content: '' };
                    }
                    const activity = activities[activityIdx] || activities[0] || {};
                    const rawRole = layer.semanticRole || layer.role || '';

                    // 尝试匹配多种可能的 Key
                    const possibleKeys = [
                        role,
                        role.charAt(0).toUpperCase() + role.slice(1),
                        role.toUpperCase()
                    ];

                    let newText = "";
                    for (const key of possibleKeys) {
                        if (activity[key]) {
                            newText = activity[key];
                            break;
                        }
                    }

                    // 极致兜底：如果还是没找到，且这一层是标题
                    if (!newText && (rawRole.includes('标题') || role === 'title')) {
                        // [FIX] 不再从 activity 的任意字段取值（避免取到 ⏰/📍 等带 emoji 的 date/venue）
                        // 优先尝试从 rawBlock 的第一行无冒号文本提取标题
                        const rawBlock = activity.rawBlock || '';
                        const firstLine = rawBlock.split('\n').map(l => l.trim()).find(l => l);
                        if (firstLine) {
                            const hasColon = firstLine.includes(':') || firstLine.includes('：');
                            newText = hasColon ? '' : stripLeadingEmoji(firstLine);
                        }
                    }

                    // 如果确实解析到了新内容，即便模版原本没有 {{ 也要替换
                    if (newText && newText !== layer.text) {
                        return { ...layer, text: newText, content: newText };
                    }

                    // 最后的兜底：如果依然没内容，且原本有 {{，尝试从活动数据随便抓一个
                    if (!newText || newText === layer.text) {
                        let finalFallback = layer.text || '';
                        if (finalFallback.includes('{{')) {
                            const dataExists = Object.keys(activity).length > 0;
                            if (dataExists) {
                                // [FIX] title 图层只能从 title 或 rawBlock 取，禁止 fallback 到 venue/date
                                if ((rawRole.includes('标题') || role === 'title')) {
                                    const rawBlock = activity.rawBlock || '';
                                    const firstLine = rawBlock.split('\n').map(l => l.trim()).find(l => l);
                                    finalFallback = activity.title || (firstLine ? stripLeadingEmoji(firstLine) : '') || finalFallback;
                                } else {
                                    finalFallback = activity[role] || activity.venue || activity.date || Object.values(activity).find(v => typeof v === 'string' && v.length > 0 && v !== activity.id) || finalFallback;
                                }
                                finalFallback = finalFallback.replace(/{{|}}/g, '').trim();
                            }
                        }
                        return { ...layer, text: finalFallback, content: finalFallback };
                    }

                    return { ...layer };
                });

                const nonTextLayers = layout.filter(l => l.type !== 'text' || !l.isVariable);
                const mergedLayers = [...nonTextLayers, ...filledTextLayers];

                // 防重逻辑：如果该会话已存在节点，则原地更新
                let updated = false;
                if (conversationId && setNodes) {
                    setNodes(nds => {
                        // 智能匹配目标节点：优先匹配会话 ID 一致的，否则匹配最近创建的同类型节点
                        const targetContentNode = nds.find(n => n.type === 'rednote-content' && n.data?.conversationId === conversationId)
                            || nds.find(n => n.type === 'rednote-content');

                        if (!targetContentNode) return nds;

                        updated = true;
                        const targetConvId = targetContentNode.data?.conversationId || conversationId;

                        return nds.map(n => {
                            const isContentNode = n.type === 'rednote-content' && (n.data?.conversationId === targetConvId || n.id === targetContentNode.id);
                            const isFineTuneNode = n.type === 'fine-tune' && (n.data?.conversationId === targetConvId || n.id === targetContentNode.id);
                            const isTemplateNode = n.type === 'image-text-template' && (n.data?.conversationId === targetConvId || n.id === targetContentNode.id);

                            if (isContentNode) {
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        bulkText: textContent,
                                        items: activities,
                                        autoImport: false,
                                        initialBulkMode: activities.length === 0,
                                        lastUpdated: Date.now()
                                    }
                                };
                            }
                            if (isTemplateNode) {
                                return { ...n, data: { ...n.data, selectedStyleId: templateId } };
                            }
                            if (isFineTuneNode) {
                                return { ...n, data: { ...n.data, templateId: templateId, content: { layers: mergedLayers, canvas: template.canvas || { width: 1000, height: 1333 } }, isDirty: false, lastUpdated: Date.now() } };
                            }
                            return n;
                        });
                    });
                }

                if (updated) {
                    toast?.('✨ 已成功同步至画布现有节点', 'success');
                    setActiveTab?.('canvas');
                    return;
                }


                const baseId = Date.now();
                const contentNodeId = `content-${baseId}`;
                const templateNodeId = `template-${baseId}`;
                const fineTuneNodeId = `fine-tune-${baseId}`;

                // 5a. 内容节点（含自动导入）
                const contentNode = {
                    id: contentNodeId,
                    type: 'rednote-content',
                    position: { x: 100, y: 200 },
                    data: {
                        bulkText: textContent,
                        items: activities, // 传入解析好的活动，避免节点再次调用 AI
                        autoImport: false, // 既然已经传了项，且是自动生成的，不需要再次触发 autoImport
                        initialBulkMode: activities.length === 0, // 如果解析成功，直接进入结构化模式
                        useEmoji: Boolean(useEmoji),
                        label: '内容输入',
                        conversationId: conversationId
                    }
                };


                // 5b. 模版节点
                const templateNode = {
                    id: templateNodeId,
                    type: 'image-text-template',
                    position: { x: 500, y: 200 },
                    data: {
                        selectedStyleId: templateId,
                        label: '模版选择',
                        conversationId: conversationId
                    }
                };


                // 5c. 精细编辑节点（携带已填充图层）
                const fineTuneNode = {
                    id: fineTuneNodeId,
                    type: 'fine-tune',
                    position: { x: 900, y: 200 },
                    data: {
                        label: '精细编辑',
                        templateId: templateId,
                        activityContent: textContent,
                        isDirty: false, // 初始设为 false，以确保响应上游 Node 1 的实时修改
                        content: {
                            layers: mergedLayers,
                            canvas: template.canvas || { width: 1000, height: 1333 }
                        },
                        fromConversation: true,
                        conversationId: conversationId
                    }
                };


                setNodes(nds => [...nds, contentNode, templateNode, fineTuneNode]);

                // 5d. 建立连线
                setEdges(eds => [...eds,
                {
                    id: `edge-${contentNodeId}-${templateNodeId}`,
                    source: contentNodeId, target: templateNodeId,
                    sourceHandle: 'output', targetHandle: 'input'
                },
                {
                    id: `edge-${templateNodeId}-${fineTuneNodeId}`,
                    source: templateNodeId, target: fineTuneNodeId,
                    sourceHandle: 'output', targetHandle: 'input'
                }
                ]);

                setActiveTab('canvas');
                if (toast) {
                    toast(`✨ 已生成完整工作流，映射了 ${activities.length} 个活动`, 'success');
                }
                console.log('[Magnes] ✅ Three-node workflow created. Layers:', mergedLayers.length);

                // 记录 CanvasActionLog：通过对话创建工作流
                try {
                    const API = window.MagnesComponents?.Utils?.API;
                    if (API?.ActionLog?.log) {
                        API.ActionLog.log({
                            actionType: 'node_create',
                            targetNodeId: fineTuneNodeId,
                            payload: {
                                nodeTypes: ['rednote-content', 'image-text-template', 'fine-tune'],
                                activityCount: activities?.length || 0,
                                templateId: templateId,
                                source: 'conversation'
                            },
                            description: `用户通过对话创建了工作流（内容输入 → 模版选择 → 精细编排），包含 ${activities?.length || 0} 个活动`,
                            conversationId: conversationId
                        });
                    }
                } catch (e) {
                    console.error('[Magnes] CanvasActionLog 发送失败:', e);
                }

            } catch (err) {
                console.error('[Magnes] useCreateNode Error:', err);
                if (toast) {
                    toast('节点创建失败: ' + err.message, 'error');
                }
            } finally {
                isProcessingRef.current = false;
            }
        }, [setNodes, setEdges, setActiveTab, toast, conversationId]);


        return { handleCreateNodeRequest };
    };

    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};
    window.MagnesComponents.Hooks.useCreateNode = useCreateNode;
})();
