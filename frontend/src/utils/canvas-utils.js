// Canvas Utilities
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const CanvasUtils = {
        /**
         * Convert screen coordinates (clientX, clientY) to world coordinates (canvas space)
         * @param {number} screenX 
         * @param {number} screenY 
         * @param {Object} view - {x, y, zoom}
         * @returns {{x: number, y: number}}
         */
        screenToWorld: (screenX, screenY, view) => {
            return {
                x: (screenX - view.x) / view.zoom,
                y: (screenY - view.y) / view.zoom
            };
        },

        /**
         * Convert world coordinates to screen coordinates
         * @param {number} worldX 
         * @param {number} worldY 
         * @param {Object} view - {x, y, zoom}
         * @returns {{x: number, y: number}}
         */
        worldToScreen: (worldX, worldY, view) => {
            return {
                x: worldX * view.zoom + view.x,
                y: worldY * view.zoom + view.y
            };
        },

        /**
         * Calculate real resolution based on virtual dimensions
         * @param {number} w 
         * @param {number} h 
         * @returns {string} e.g. "4M"
         */
        calculateResolutionLabel: (w, h) => {
            const totalPixels = w * h;
            const millions = totalPixels / 1000000;
            if (millions < 0.1) return Math.round(totalPixels / 1000) + 'K';
            return millions.toFixed(1) + 'M';
        },

        /**
         * Get virtual canvas size constants
         */
        getCanvasConstants: () => {
            return {
                VIRTUAL_WIDTH: 10000,
                VIRTUAL_HEIGHT: 10000
            };
        }
    };

    window.MagnesComponents.Utils.Canvas = CanvasUtils;
})();
