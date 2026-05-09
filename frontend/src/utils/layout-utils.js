/**
 * Layout Utilities - 布局逻辑核心工具
 * 提供图层合并、段落识别、坐标换算等通用逻辑
 */
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const LayoutUtils = {
        /**
         * 自动合并图层（同行碎片合并 + 跨行段落合并）
         * @param {Array} layers - 原始图层列表
         * @returns {Array} 合并后的图层列表
         */
        mergeTextLayers: (layers) => {
            if (!layers || layers.length === 0) return [];

            const textLayers = layers
                .filter(l => l.type === 'text')
                .sort((a, b) => (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0));
            const otherLayers = layers.filter(l => l.type !== 'text');

            if (textLayers.length === 0) return layers;

            // 第一阶段：同行碎片合并 (Horizontal Merge)
            const horizontalMerged = [];
            const handledH = new Set();

            textLayers.forEach((layer, i) => {
                if (handledH.has(i)) return;
                let line = { ...layer };
                handledH.add(i);

                for (let j = i + 1; j < textLayers.length; j++) {
                    if (handledH.has(j)) continue;
                    const target = textLayers[j];
                    const s1 = line.style || {};
                    const s2 = target.style || {};

                    const yDiff = Math.abs((line.bbox?.[1] || 0) - (target.bbox?.[1] || 0));
                    // X 轴距离极近（小于 50 个 0-1000 单位）
                    const xClose = Math.abs((line.bbox?.[0] + line.bbox?.[2] || 0) - (target.bbox?.[0] || 0)) < 50;
                    const sameStyle = s1.fontSize === s2.fontSize;
                    const sameGroup = line.groupId === target.groupId;

                    if (yDiff < 15 && xClose && sameStyle && sameGroup) {
                        const content1 = line.content || line.text || '';
                        const content2 = target.content || target.text || '';
                        line.content = content1 + content2;
                        line.text = line.content;

                        const b1 = line.bbox || [0, 0, 0, 0];
                        const b2 = target.bbox || [0, 0, 0, 0];
                        const maxX = Math.max(b1[0] + b1[2], b2[0] + b2[2]);

                        // 调优：物理边界优先原则。
                        const rawWidth = maxX - b1[0];
                        const fs = parseInt(s1.fontSize) || 40;

                        // 仅当物理宽度极其狭窄（可能是 AI 定位不准）时，才按单字符宽度进行有限补偿。
                        // 且对于长文本，不再进行全程累加，避免出现 200% 这种非法宽度。
                        const estimatedCharWidth = Math.min(line.content.length, 10) * fs * 0.8;
                        const minWidth = Math.max(rawWidth, estimatedCharWidth);

                        // 最终 BBox 宽度：取物理合并宽度 + 10% 冗余，但上限严控在画布剩余空间内
                        const finalWidth = Math.min(Math.max(rawWidth * 1.1, minWidth), 1000 - b1[0]);
                        line.bbox = [b1[0], b1[1], Math.round(finalWidth), b1[3]];
                        handledH.add(j);
                    }
                }
                horizontalMerged.push(line);
            });

            // 第二阶段：跨行段落合并 (Vertical/Paragraph Merge)
            const finalMerged = [];
            const handledV = new Set();

            horizontalMerged.forEach((layer, i) => {
                if (handledV.has(i)) return;
                let para = { ...layer };
                handledV.add(i);

                for (let j = i + 1; j < horizontalMerged.length; j++) {
                    if (handledV.has(j)) continue;
                    const target = horizontalMerged[j];
                    const s1 = para.style || {};
                    const s2 = target.style || {};

                    const sameStyle = s1.fontSize === s2.fontSize && s1.fontFamily === s2.fontFamily;
                    const sameGroup = para.groupId === target.groupId;
                    const xAligned = Math.abs((para.bbox?.[0] || 0) - (target.bbox?.[0] || 0)) < 80;
                    const yClose = Math.abs((para.bbox?.[1] + para.bbox?.[3] || 0) - (target.bbox?.[1] || 0)) < 120;

                    if (sameStyle && xAligned && yClose && sameGroup) {
                        const content1 = para.content || para.text || '';
                        const content2 = target.content || target.text || '';
                        para.content = content1 + '\n' + content2;
                        para.text = para.content;

                        const b1 = para.bbox || [0, 0, 0, 0];
                        const b2 = target.bbox || [0, 0, 0, 0];
                        const minY = Math.min(b1[1], b2[1]);
                        const maxY = Math.max(b1[1] + b1[3], b2[1] + b2[3]);
                        const minX = Math.min(b1[0], b2[0]);
                        const maxX = Math.max(b1[0] + b1[2], b2[0] + b2[2]);

                        para.bbox = [minX, minY, maxX - minX, maxY - minY];
                        handledV.add(j);
                    }
                }
                finalMerged.push(para);
            });

            // 第三阶段：全局规范化与边界终核 (Final Sanitization)
            // 解决 width: 203.6% 问题的终极防线
            const safeTextLayers = finalMerged.map(layer => {
                if (layer.id?.includes('background') || layer.role === 'background') return layer;

                const s = layer.style || {};
                let bbox = layer.bbox || [0, 0, 0, 0];

                // 兼容处理：如果 bbox 是对象格式 {x, y, width, height}，转换为数组
                if (!Array.isArray(bbox) && typeof bbox === 'object') {
                    bbox = [
                        bbox.x || 0,
                        bbox.y || 0,
                        bbox.width || bbox.w || 0,
                        bbox.height || bbox.h || 0
                    ];
                }

                let [x, y, w, h] = bbox;

                // 1. 坐标归一化保障 (0-1000)
                x = Math.max(0, Math.min(parseFloat(x), 1000));
                y = Math.max(0, Math.min(parseFloat(y), 1000));

                // 2. 居中对齐特殊处理：提供稳健的居中参考平面
                if (s.textAlign === 'center') {
                    return {
                        ...layer,
                        bbox: [0, Math.round(y), 1000, Math.round(h)]
                    };
                }

                // 3. 非居中对齐：执行“保守冗余”+“强制封顶”规则
                const rawW = parseFloat(w);
                const boundedW = Math.min(rawW * 1.1, 1000 - x); // 绝对禁止穿透右边缘

                return {
                    ...layer,
                    bbox: [Math.round(x), Math.round(y), Math.round(boundedW), Math.round(h)]
                };
            });

            return [...otherLayers, ...safeTextLayers];
        },

        /**
         * 自动推断语义化文本层的 groupId（基于 Y 坐标聚类）
         * 解决老模版缺少 groupId 导致多活动映射错位的问题
         * @param {Array} layers 原始图层列表
         * @returns {Array} 注入 groupId 后的图层列表
         */
        autoInjectGroupIds: (layers) => {
            const semanticTexts = layers
                .map((l, idx) => ({ ...l, _idx: idx }))
                .filter(l => l.type === 'text' && l.semanticRole);

            if (semanticTexts.length === 0) return layers;

            // 如果已有任何语义层带有 groupId，说明模板已有分组设计，不再自动推断
            const hasAnyGroupId = semanticTexts.some(l => l.groupId);
            if (hasAnyGroupId) return layers;

            // 按 Y 坐标排序
            semanticTexts.sort((a, b) => (a.bbox?.[1] || 0) - (b.bbox?.[1] || 0));

            const gaps = [];
            for (let i = 1; i < semanticTexts.length; i++) {
                gaps.push((semanticTexts[i].bbox?.[1] || 0) - (semanticTexts[i - 1].bbox?.[1] || 0));
            }

            const sortedGaps = [...gaps].sort((a, b) => a - b);
            const median = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0;
            const threshold = Math.max(median * 2, 60); // 最小阈值 60，防止单字段模板被过度拆分

            // 先聚类出逻辑分组
            const groups = [];
            let currentGroup = [semanticTexts[0]];
            for (let i = 1; i < semanticTexts.length; i++) {
                if (gaps[i - 1] > threshold) {
                    groups.push(currentGroup);
                    currentGroup = [];
                }
                currentGroup.push(semanticTexts[i]);
            }
            groups.push(currentGroup);

            const result = [...layers];
            groups.forEach((group, gi) => {
                const groupId = `group_${gi + 1}`;
                group.forEach(l => {
                    result[l._idx] = { ...result[l._idx], groupId };
                });
            });

            return result;
        },

        /**
         * 将输入内容映射到图层中（根据语义角色或默认顺序）
         * @param {Array} layers 图层列表
         * @param {Object} content 输入内容对象 { title, venue, date, ... }
         * @param {Object} options 映射选项 { pageOffset: 0, itemsPerPage: 3 }
         * @returns {Array} 填充内容后的图层列表
         */
        mapContentToLayers: (layers, content, options = {}) => {
            const { pageOffset = 0, itemsPerPage = 3, overrides = null } = options;
            if (!layers || !content) return layers;

            // [Magnes Fix] 自动为缺少 groupId 的语义层注入分组，避免老模版多活动错位
            const injectedLayers = LayoutUtils.autoInjectGroupIds(layers);

            // 自动解包：如果输入的是完整的 Node Data 且包含 content 或 extractedContent 容器
            let fieldMap = content;
            if (content.content && typeof content.content === 'object') {
                fieldMap = { ...content, ...content.content };
            } else if (content.extractedContent && typeof content.extractedContent === 'object') {
                fieldMap = { ...content, ...content.extractedContent };
            }

            // [Magnes Multi-Item Support] 自动注入全局标题与项索引映射
            const items = fieldMap.items || [];
            // items[0] 作为顶层字段的兜底来源：
            // 确保没有 groupId 组路由的老模版能从 items[0] 读取 title/venue/date 等字段，
            // 而不依赖于调用方把 activeItem 展开到 node.data 顶层（那会导致所有活动读同一项）
            const item0Fallback = items.length > 0 ? items[0] : {};
            const augmentedMap = {
                ...item0Fallback,  // items[0] 兜底（可被 fieldMap 覆盖）
                ...fieldMap,
                main_title: fieldMap.mainTitle || fieldMap.title || item0Fallback.title || ''
            };

            // 注入 item_1, item_2 等结构化索引 (如 title_1, title_2)
            items.forEach((item, idx) => {
                const i = idx + 1;
                Object.keys(item).forEach(key => {
                    augmentedMap[`${key}_${i}`] = item[key];
                });
            });

            const hasSemanticRoles = layers.some(l => l.semanticRole);

            // 占位符提示
            const getDisplayText = (val, role) => {
                if (val && val.trim()) return val;
                const placeholders = {
                    title: '在此输入标题',
                    main_title: '页面总标题',
                    venue: '展览地点/场馆',
                    date: '12.22',
                    calendar_info: '[SUN.] 星期一',
                    time_indicator: '起',
                    year: '2025',
                    price: '40元通票',
                    description: '更多展览情报 with 详情...'
                };
                return placeholders[role] || null;
            };

            let textLayerIdx = 0;
            let imageLayerIdx = 0;
            const roleCounters = {}; // 追踪每个角色出现的次数

            // 打印完整输入，检查 item_1, images 等字段是否存在
            console.log('[LayoutUtils] INPUT content:', content);

            // 增强图片数组收集：支持多维度解包 (根路径或 Items 嵌套展平)
            // 注意：必须先展平 Items 以防止当前活动项的 images 字段劫持全局数组
            const flattenedImages = items.length > 0 ? items.reduce((acc, item) => acc.concat(item.images || []), []) : [];
            const images = (flattenedImages.length > 0 ? flattenedImages : null) || fieldMap.images || [];

            console.log('[LayoutUtils] RESOLVED images (Flattened):', images);

            // 自动补全机制：如果模版完全没定义图片层，但输入有图，则强制注入一个背景插槽
            const hasAnyImageLayer = injectedLayers.some(l => l.type === 'image' || l.type === 'placeholder_image' || l.type === 'background');
            let layersToProcess = [...injectedLayers];

            if (!hasAnyImageLayer && images.length > 0) {
                console.log('[LayoutUtils] No images defined in template. Injecting generic background placeholder as fallback.');
                layersToProcess.unshift({
                    id: 'auto_background_placeholder',
                    type: 'background',
                    role: 'placeholder_image',
                    isPlaceholder: true,
                    // 恢复为通用全屏比例，仅作为“坏掉模版”的兜底
                    bbox: [0, 0, 1000, 1333],
                    z_index: 0,
                    opacity: 1
                });
            }

            const mappedLayers = layersToProcess.map((layer, idx) => {
                const l = { ...layer };

                if (l.type === 'text') {
                    const originalText = l.text || l.content;
                    let role = l.semanticRole;

                    // 智能角色重定向：优先尝试组路由 (Group Routing)
                    if (role) {
                        roleCounters[role] = (roleCounters[role] || 0) + 1;
                        const count = roleCounters[role];

                        let finalVal = null;
                        let valFound = false;

                        // A. 优先级 1: 显式组路由 (Group Routing)
                        // 如果图层显式打上了 groupId 标签，则执行精准对位
                        if (l.groupId) {
                            const match = l.groupId.match(/group_(\d+)/);
                            const originalIdx = match ? parseInt(match[1]) - 1 : -1;
                            // [Magnes Pagination] 应用页码偏移：group_1 在第 2 页应显示第 4 个(idx=3)项
                            const gIdx = originalIdx + (pageOffset * itemsPerPage);

                            const targetItem = items[gIdx];
                            if (targetItem && targetItem[role] !== undefined) {
                                finalVal = targetItem[role];
                                valFound = true;
                                console.log(`[LayoutUtils] Page-Aware Group Route Match: ${l.groupId} (Page=${pageOffset}, itemIdx=${gIdx}) -> ${role} = "${finalVal}"`);
                            }
                        }

                        // B. 优先级 2: 全局字段路由 (No groupId)
                        // 仅当 AI 明确判定为 title (总标题) 且没有组 ID 时，才映射到 mainTitle
                        if (!valFound && !l.groupId) {
                            if (role === 'title') {
                                const mainTitle = augmentedMap.main_title;
                                if (mainTitle && mainTitle.trim()) {
                                    // 有全局总标题，直接使用
                                    finalVal = mainTitle;
                                    valFound = true;
                                    console.log(`[LayoutUtils] Global MainTitle Match: role=${role} -> main_title`);
                                } else if (items.length > 0 && items[0].title) {
                                    // [PATCH] 全局总标题为空时，以第一个活动的标题兜底，
                                    // 避免"无 groupId 的 title 层"在多活动场景下被错误隐藏
                                    finalVal = items[0].title;
                                    valFound = true;
                                    console.log(`[LayoutUtils] Global Title Fallback to items[0].title: "${finalVal}"`);
                                }
                            }
                            // 注意：非 title 角色的全局内容（如装饰文字）应保持原样，不参与自动填充
                        }

                        // C. 优先级 3: 扁平索引降级 (role_1, role_2...) - 兜底逻辑
                        if (!valFound) {
                            let effectiveRole = role;
                            if (role === 'title' && count === 1 && augmentedMap.main_title) {
                                effectiveRole = 'main_title';
                            } else if (count > 1) {
                                const itemIdx = (role === 'title' && augmentedMap.main_title) ? count - 1 : count - 1;
                                effectiveRole = `${role}_${itemIdx}`;
                                if (!augmentedMap[effectiveRole] && augmentedMap[role]) {
                                    effectiveRole = role;
                                }
                            }
                            finalVal = augmentedMap[effectiveRole];
                        }

                        if (typeof finalVal === 'object' && finalVal !== null) {
                            finalVal = Array.isArray(finalVal) ? finalVal.join('\n') : Object.entries(finalVal).map(([k, v]) => `${k}：${v}`).join('\n');
                        }

                        // 判定是否为空：undefined、null、空字符串 均视为内容缺失
                        const isEmpty = finalVal === undefined || finalVal === null || finalVal.toString().trim() === '';

                        if (isEmpty) {
                            l.text = "";
                            l.content = "";
                            l.isHidden = true;
                            l.opacity = 0;
                        } else {
                            // [PATCH] title 角色层：去除 finalVal 行首可能残留的 Emoji
                            // 防止 applyEmojiToItems 或其他路径污染标题显示
                            let displayVal = String(finalVal);
                            if (role === 'title' || role === 'main') {
                                let cleanVal = displayVal;
                                while (/^[\u{1F300}-\u{1FFFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}][\s\uFE0F]*/u.test(cleanVal)) {
                                    cleanVal = cleanVal.replace(/^[\u{1F300}-\u{1FFFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}][\s\uFE0F]*/u, '');
                                }
                                displayVal = cleanVal.trim();
                            }
                            l.text = displayVal;
                            l.content = displayVal;
                            l.isHidden = false;
                            l.opacity = 1;
                        }
                    }
                    // 2. 如果之前没有语义化标识，且上游已连接，则按顺序填充或隐藏
                    else if (!hasSemanticRoles) {
                        // 顺序填充跳过 main_title，确保分项内容不偏移
                        const sequence = ['title', 'venue', 'date', 'description', 'highlights', 'price'];
                        const role = sequence[textLayerIdx];

                        // 特殊处理：如果当前是第一个文本层且输入有 main_title，则强制让它接收 main_title
                        const isFirstText = textLayerIdx === 0;
                        const effectiveRole = (isFirstText && augmentedMap.main_title) ? 'main_title' : role;

                        const val = augmentedMap[effectiveRole];
                        if (val && val.toString().trim()) {
                            l.text = val;
                            l.content = l.text;
                            l.isHidden = false;
                            l.opacity = 1;
                        } else {
                            l.isHidden = true;
                            l.opacity = 0;
                        }
                    }
                    textLayerIdx++;
                } else if (l.type === 'image' || l.type === 'placeholder_image' || l.type === 'background') {
                    // 识别范围：显式包含 background 类型
                    const isPlaceholder = l.role === 'placeholder_image' || l.type === 'placeholder_image' || l.isPlaceholder;

                    // 背景保护：严禁向非占位背景层填充活动内容图
                    const isBackground = l.role === 'background' || l.type === 'background' || l.id?.includes('background');
                    if (isBackground && !isPlaceholder) {
                        return l; // 保持模版自带背景
                    }

                    if (isPlaceholder && images.length > 0) {
                        let finalUrl = null;

                        // A. 优先级 1: 显式组路由 (Group Route for Images) - 严格模式
                        if (l.groupId) {
                            const match = l.groupId.match(/group_(\d+)/);
                            const originalIdx = match ? parseInt(match[1]) - 1 : -1;
                            // [Magnes Pagination] 应用页码偏移：group_1 在第 2 页应显示第 4 个(idx=3)项
                            const gIdx = originalIdx + (pageOffset * itemsPerPage);
                            const targetItem = items[gIdx];

                            // 严格性：仅当该组确实有自己的上传图片时才填充
                            if (targetItem && targetItem.images && targetItem.images.length > 0) {
                                // 虽然一个组可能有多个槽位，但目前通常 1 项配 1 图
                                finalUrl = targetItem.images[0];
                                console.log(`[LayoutUtils] Strict Group Image Match: ${l.groupId} (Page=${pageOffset}, itemIdx=${gIdx}) -> items[${gIdx}].images[0]`);
                            } else {
                                // [Magnes Patch] 如果该活动项没传图，严禁去全局借图（否则会出现克隆现象）
                                finalUrl = null;
                                console.log(`[LayoutUtils] Group Image Empty: ${l.groupId} -> Skipping.`);
                            }
                        }

                        // B. 优先级 2: 全局顺序映射 (Sequence Fallback) 仅限全局变量槽位 (No groupId)
                        if (!finalUrl && !l.groupId) {
                            finalUrl = images[imageLayerIdx % images.length];
                            imageLayerIdx++;
                        }

                        if (finalUrl) {
                            l.url = finalUrl;
                            l.isPlaceholder = true;
                            l.isHidden = false;
                            l.opacity = 1;
                        } else {
                            // 没拿到图就隐藏或显示占位 UI，不应该显示上次的背景残留
                            l.url = null;
                            l.isHidden = false; // 保持占位可见或完全透明视业务而定，目前为 0
                            l.opacity = images.length > 0 ? 0 : 1;
                        }
                    }
                    // 顺序兜底 (处理非占位图片)
                    else if (images[imageLayerIdx] && l.type !== 'background') {
                        l.url = images[imageLayerIdx];
                        imageLayerIdx++;
                        l.isHidden = false;
                        l.opacity = 1;
                    }
                }
                return l;
            });

            const finalMappedLayers = mappedLayers.map(layer => {
                if (overrides && Array.isArray(overrides)) {
                    const override = overrides.find(o => o.id === layer.id);
                    if (override) {
                        return { ...layer, ...override };
                    }
                }
                return layer;
            });

            // 专项检查：哪些层最终拿到了 URL？
            const layersWithUrl = finalMappedLayers.filter(l => l.url);
            console.log('[LayoutUtils] FINAL MAPPED STATUS (Layers with URL):', layersWithUrl.length, layersWithUrl);

            return finalMappedLayers;
        }
    };

    window.MagnesComponents.Utils.Layout = LayoutUtils;
    console.log('✅ LayoutUtils Loaded');
})();
