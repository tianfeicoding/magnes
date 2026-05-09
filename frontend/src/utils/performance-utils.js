// Performance Utilities
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const PerformanceUtils = {
        /**
         * Debounce function
         * @param {Function} func 
         * @param {number} wait 
         * @param {boolean} immediate 
         * @returns {Function}
         */
        debounce: (func, wait, immediate) => {
            let timeout;
            return function () {
                const context = this, args = arguments;
                const later = function () {
                    timeout = null;
                    if (!immediate) func.apply(context, args);
                };
                const callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow) func.apply(context, args);
            };
        },

        /**
         * Throttle function
         * @param {Function} func 
         * @param {number} limit 
         * @returns {Function}
         */
        throttle: (func, limit) => {
            let inThrottle;
            return function () {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            }
        },

        /**
         * Simple deep clone using JSON
         * Note: Doesn't handle Date, RegExp, Map, Set, etc.
         */
        deepClone: (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            return JSON.parse(JSON.stringify(obj));
        },

        /**
         * Generate a unique ID (UUID v4 style)
         */
        generateId: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    };

    window.MagnesComponents.Utils.Performance = PerformanceUtils;
})();
