(function () {
    /**
     * 文本数据解析工具类
     * 包含对营销推文、活动列表的语义解析与映射逻辑
     */
    const ParseHelpers = {
        /**
         * 将活动内容按空行分组，解析各活动的结构化字段
         * @param {string} text 原始文本
         * @returns {Array<Object>} 解析后的活动列表
         */
        parseActivities: (text) => {
            if (!text) return [];
            // 强化分割逻辑：支持双换行、单换行+标题行特征（如第一行无冒号）等复合场景
            let blocks = text.split(/\n\s*\n/).filter(b => b.trim());
            
            // 极致切分策略：优先寻找带冒号且没有图标的行作为“活动分界线”
            const lines = text.split('\n');
            const newBlocks = [];
            let currentBlock = [];
            
            lines.forEach((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                
                // 判定是否为新标题行：
                // 1. 不包含冒号
                // 2. 长度适中
                // 3. 不是单纯的数字
                // 4. 下方紧跟带时间/地点标识的行
                const hasColon = trimmed.includes(':') || trimmed.includes('：');
                const isShort = trimmed.length > 0 && trimmed.length < 35;
                const nextLine = lines[i+1] || "";
                const nextHasInfo = nextLine.includes('时间') || nextLine.includes('地点') || nextLine.includes('⏰') || nextLine.includes('📍');
                
                const isNewItem = !hasColon && isShort && nextHasInfo && currentBlock.length > 3;

                if (isNewItem) {
                    newBlocks.push(currentBlock.join('\n'));
                    currentBlock = [trimmed];
                } else {
                    currentBlock.push(trimmed);
                }
            });
            newBlocks.push(currentBlock.join('\n'));
            if (newBlocks.length > 1) blocks = newBlocks;

            return blocks.map(block => {
                // 不再直接改写 block 原始变量，以保留 rawBlock 中的 [[笔记N]] 溯源元数据
                const cleanBlock = block.replace(/\[\[笔记\d+[^\]]*\]\]/g, '').trim();

                const lines = cleanBlock.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.startsWith('```')); // 过滤掉 markdown 代码块标识

                const activity = { title: '', date: '', venue: '', price: '', description: '', rawBlock: block.trim() };

                // 关键词映射定义 (支持多种常见字段名)
                const keyMap = {
                    title: ['名称', '主题'],
                    date: ['时间', '日期', 'time', 'date'],
                    venue: ['地点', '场地', 'location', 'venue'],
                    price: ['门票', '价格', '票价', 'price', 'ticket'],
                    description: ['亮点', '特色', '介绍', '内容', 'description', 'highlights']
                };

                let titleSet = false;
                lines.forEach((line, idx) => {
                    const colonIdx = line.search(/[:：]/);
                    const emojiMap = {
                        '⏰': 'date', '📍': 'venue', '🎫': 'price', '✨': 'description', '💡': 'description'
                    };
                    
                    // 检查行首是否有图标 (处理无标文字模式)
                    let emojiChar = null;
                    for (const char of Object.keys(emojiMap)) {
                        if (line.startsWith(char)) {
                            emojiChar = char;
                            break;
                        }
                    }

                    if (colonIdx !== -1) {
                        const key = line.slice(0, colonIdx).trim();
                        const val = line.slice(colonIdx + 1).trim();
                        let matched = false;
                        for (const [role, keywords] of Object.entries(keyMap)) {
                            if (keywords.some(kw => key.includes(kw))) {
                                activity[role] = val;
                                matched = true;
                                break;
                            }
                        }
                        // 兜底：如果一行有冒号但没匹配上 Label，但开头有图标，按图标识别
                        if (!matched && emojiChar) {
                            activity[emojiMap[emojiChar]] = val;
                            matched = true;
                        }
                        // 再次兜底：第一行作为标题
                        if (!matched && !titleSet && idx === 0) {
                            activity.title = line;
                            titleSet = true;
                        }
                    } else if (emojiChar) {
                        // 无冒号但首字是图标
                        const val = line.slice(emojiChar.length).trim();
                        activity[emojiMap[emojiChar]] = val;
                    } else if (!titleSet) {
                        // 无冒号且未设置标题的行，作为标题
                        activity.title = line;
                        titleSet = true;
                    }
                });
                return activity;
            });
        },

        /**
         * 语义角色映射
         * @param {string} role 原始角色名 
         */
        normalizeRole: (role) => {
            if (!role) return 'other';
            const baseRole = role.toLowerCase().replace(/(\s|_|\-|\()?\d+\)?$/, '').trim();
            
            // 使用更鲁棒的关键词包含逻辑
            const keyMap = {
                title: ['名称', '主题', '活动', '项', '标题', 'title', 'header', 'main_title'],
                date: ['时间', '日期', 'time', 'date', 'calendar'],
                venue: ['地点', '场所', '场地', '地址', '周边', 'venue', 'address', 'location', 'subtitle'],
                price: ['门票', '价格', '票价', '费用', '票', '钱', 'price', 'cost', 'ticket', 'fee'],
                description: ['亮点', '特色', '介绍', '内容', '简介', '文案', '详情', 'description', 'highlights', 'content', 'desc']
            };

            for (const [standardRole, keywords] of Object.entries(keyMap)) {
                if (keywords.some(kw => baseRole.includes(kw))) {
                    return standardRole;
                }
            }

            return baseRole;
        }
    };

    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};
    window.MagnesComponents.Utils.ParseHelpers = ParseHelpers;
})();
