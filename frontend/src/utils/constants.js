(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const CONSTANTS = {
        MJ_VERSIONS: [
            { label: 'MJ V7', value: '--v 7' },
            { label: 'MJ V6.1', value: '--v 6.1' },
            { label: 'MJ V6', value: '--v 6' },
            { label: 'MJ V5.2', value: '--v 5.2' },
            { label: 'MJ V5.1', value: '--v 5.1' },
            { label: 'Niji V6', value: '--niji 6' },
            { label: 'Niji V5', value: '--niji 5' },
            { label: 'Niji V4', value: '--niji 4' }
        ],
        STYLE_PRESETS: {
            'face_keeper': {
                label: '保脸换装',
                color: 'text-pink-500 bg-pink-500/10 border-pink-500/20',
                prompt: ' [ 指令：使用第一张图作为【人脸参考】，使用第二张图作为【服装/背景参考】。将图1的人脸完美融合到图2的人物身上，保持图2的姿势和光影，保留图1的面部特征。(Face Swap Mode) ]'
            },
            'scene_swap': {
                label: '人景融合',
                color: 'text-green-500 bg-green-500/10 border-green-500/20',
                prompt: ' [ 指令：使用第一张图作为【人物主体】，使用第二张图作为【背景环境】。将图1的人物自动扣图并融入到图2的背景中，调整光照使其自然匹配。(Scene Composition Mode) ]'
            }
        },
        VIDEO_RES_OPTIONS: ['1080P', '720P'],
        GROK_VIDEO_RATIOS: ['3:2', '2:3', '1:1'],
        RATIOS: ['Auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'],
        RESOLUTIONS: ['Auto', '1K', '2K', '4K'],
        DEFAULT_BASE_URL: 'https://ai.comfly.chat',
        JIMENG_API_BASE_URL: 'http://localhost:5100', // Proxy default
        // Hamilton: 集中管理后端地以便于 file:// 协议和 http:// 协议切换
        MAGNES_BACKEND_URL: window.location.protocol === 'file:' ? 'http://localhost:8088' : '',
        MAGNES_API_URL: window.location.protocol === 'file:' ? 'http://localhost:8088/api/v1' : '/api/v1',
        MAGNES_API_TOKEN: 'magnes_secure_token_2026'
    };
    window.MagnesComponents.Utils.Constants = CONSTANTS;

    // 兼容遗留的 BaseAPI 架构
    window.BaseAPI = window.BaseAPI || {};
    window.BaseAPI.Constants = CONSTANTS;
})();
