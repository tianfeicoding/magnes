// Node Helpers
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    // Default node sizes
    const NODE_DEFAULTS = {
        'gen-video': { w: 320, h: 420 },
        'gen-image': { w: 360, h: 340 },
        'video-input': { w: 360, h: 420 },
        'video-analyze': { w: 400, h: 500 },
        'storyboard-node': { w: 600, h: 500 },
        'image-compare': { w: 400, h: 300 },
        'preview': { w: 320, h: 260 },
        'text-node': { w: 280, h: 200 },
        'rednote-content': { w: 350, h: 480 },
        'rednote-layout': { w: 300, h: 580 },
        'rednote-preview': { w: 340, h: 680 },
        'image-text-template': { w: 320, h: 500 },
        'layout-analyzer': { w: 320, h: 400 },
        'style-analyzer': { w: 340, h: 400 },
        'default': { w: 260, h: 260 }
    };

    /**
     * Get default settings for a specific node type
     * @param {string} type 
     * @param {any} initialContent 
     * @returns {Object} settings object
     */
    const getNodeSettings = (type, initialContent) => {
        switch (type) {
            case 'gen-image':
                return { model: 'nano-banana', ratio: 'Auto', resolution: 'Auto', prompt: '' };
            case 'gen-video':
                return { model: 'sora-2', duration: '5s', ratio: '16:9', videoPrompt: '' };
            case 'video-analyze':
                return { model: 'gemini-3-pro', segmentDuration: 3, analysisMode: 'manual', voiceoverResults: [], analysisResults: [] };
            case 'storyboard-node':
                return { projectTitle: '未命名分镜', shots: [] };
            case 'text-node':
                return { text: initialContent || '' };
            default:
                return {};
        }
    };

    const NodeHelpers = {
        /**
         * Create a new node object with default values
         * @param {string} type - Node type
         * @param {number} worldX - World X coordinate
         * @param {number} worldY - World Y coordinate
         * @param {any} initialContent - Initial content (optional)
         * @param {Object} initialDimensions - Initial dimensions (optional)
         * @param {string} forcedId - Optional ID to force
         * @returns {Object} New node object
         */
        createNodeObject: (type, worldX, worldY, initialContent = undefined, initialDimensions = undefined, forcedId = undefined) => {
            const size = NODE_DEFAULTS[type] || NODE_DEFAULTS['default'];
            const id = forcedId || `node-${Date.now()}`;

            return {
                id,
                type,
                x: worldX - size.w / 2, // Center on position
                y: worldY - size.h / 2,
                width: size.w,
                height: size.h,
                content: initialContent,
                ...(initialDimensions ? { dimensions: initialDimensions } : {}),
                settings: getNodeSettings(type, initialContent)
            };
        },

        getNodeDefaultSize: (type) => NODE_DEFAULTS[type] || NODE_DEFAULTS['default'],

        // Expose settings getter if needed separately
        getNodeSettings
    };

    window.MagnesComponents.Utils.Node = NodeHelpers;
})();
