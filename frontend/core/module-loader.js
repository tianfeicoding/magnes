/**
 * Magnes 动态模块加载器
 * 核心职责：
 * 1. 初始化全局 MagnesComponents 命名空间
 * 2. 维持原子脚本的严格加载时序（Utils -> Hooks -> Layout -> App）
 * 3. 注入防缓存版本号
 */
(function () {
    window.MagnesComponents = window.MagnesComponents || {
        version: '1.0.0',
        buildTimestamp: new Date().getTime(),
        Utils: {}, Hooks: {}, Context: {}, Nodes: {}, Components: {}, UI: {}, Services: {}
    };

    const scripts = [
        // 1. Project Core Utilities (Synchronous order via loader)
        "js/compiled/utils/constants.js",
        "core/storage.js",
        "core/config-manager.js",
        "js/compiled/_shared/prompt-templates.js",

        "js/compiled/build-info.js",
        "js/compiled/utils/api-client.js",
        "js/compiled/utils/performance-utils.js",
        "js/compiled/utils/canvas-utils.js",
        "js/compiled/utils/image-utils.js",
        "js/compiled/utils/node-helpers.js",
        "js/compiled/utils/layout-utils.js",
        "js/compiled/config.js",
        "js/compiled/components/ui/lucide-icons.js",
        "js/compiled/components/ui/emojiicons.js",
        "js/compiled/components/ui/button.js",
        "js/compiled/components/ui/modal.js",
        "src/components/ui/LoginModal.js",
        "js/compiled/context/app-context.js",
        "js/compiled/hooks/use-magnes-history.js",
        "js/compiled/hooks/use-magnes-node.js",
        "js/compiled/services/generation-service.js",
        "js/compiled/services/semantic-service.js",
        "js/compiled/components/ui/component-library.js",
        "js/compiled/components/ui/node-toolbar.js",
        "js/compiled/components/ui/conversation-panel.js",
        "js/compiled/nodes/rf/BaseNode.js",
        "js/compiled/components/ui/asset-picker.js",   // 素材选择器组件
        "js/compiled/nodes/rf/input-image-rf.js",
        "js/compiled/nodes/rf/gen-image-rf.js",
        "js/compiled/nodes/rf/layer-split-node-rf.js",
        "js/compiled/nodes/rf/refiner-node-rf.js",
        "js/compiled/nodes/rf/composer-node-rf.js",
        "js/compiled/nodes/rf/image-text-template-rf.js",
        "js/compiled/nodes/rf/fine-tune-node-rf.js",
        "js/compiled/nodes/rf/fine-tune-props-rf.js",  // 附属属性面板节点
        "js/compiled/nodes/rf/preview-rf.js",
        "js/compiled/nodes/rf/version-gallery-rf.js",
        "js/compiled/nodes/rf/text-node-rf.js",
        "js/compiled/nodes/rednote/style-presets.js",
        "js/compiled/nodes/rednote/editable-utils.js",
        "js/compiled/nodes/rednote/templates.js",
        "js/compiled/nodes/rednote/content-node.js",
        "js/compiled/nodes/rednote/stylelab-node.js",
        "js/compiled/nodes/rednote/preview-node.js",
        "js/compiled/nodes/rf/rednote-content-rf.js",
        "js/compiled/nodes/rf/rednote-stylelab-rf.js",
        "js/compiled/nodes/rf/rednote-preview-rf.js",
        "js/compiled/nodes/rf/layout-analyzer-rf.js",
        "js/compiled/nodes/rf/style-analyzer-rf.js",
        "js/compiled/nodes/rf/style-validator-rf.js",  // V1.0: 风格验证结果节点
        "js/compiled/pages/rag/rag-utils.js",
        "js/compiled/pages/rag/rag-components.js",
        "js/compiled/pages/rag/rag-utils.js",
        "js/compiled/pages/rag/rag-components.js",
        // 切换为 src 实时加载以绕过编译延迟
        "src/pages/rag/rag-panels.js",
        "js/compiled/pages/rag/rag-modals.js",

        // --- Stage 2: App.js Refactoring (使用 src 实时加载) ---
        "js/compiled/components/edges/ButtonEdge.js",
        "src/components/rag/RagMiddleContent.js",
        "src/components/layout/AppHeader.js",
        "src/components/layout/AppModals.js",
        "src/components/layout/RightSidebar.js",
        "js/compiled/utils/parse-helpers.js",
        "src/hooks/use-rag-data.js",
        "src/hooks/use-window-events.js",
        "src/hooks/use-node-operations.js",
        "src/hooks/use-generation-service.js",
        "src/hooks/use-create-node.js",
        "src/app.js"
    ];

    const version = window.MagnesComponents.version;
    const timestamp = window.MagnesComponents.buildTimestamp;

    scripts.forEach(src => {
        const isExternal = src.startsWith('http');
        const finalSrc = isExternal ? src : `${src}?v=${version}_${timestamp}`;
        const isBabelNeeded = src.startsWith('src/') || (src.endsWith('.js') && !src.includes('min.js') && !src.includes('compiled'));
        const scriptType = isBabelNeeded ? 'text/babel' : 'text/javascript';

        document.write(`<script type="${scriptType}" src="${finalSrc}"><\/script>`);
        if (src.includes('lucide-icons.js')) {
            document.write(`<script>
                (function() {
                    if (window.MagnesComponents.UI.LucideIcons) {
                        window.MagnesComponents.UI.Icons = window.MagnesComponents.UI.LucideIcons;
                    }
                })();
            <\/script>`);
        }
    });
})();
