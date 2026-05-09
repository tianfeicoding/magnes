// Canvas Operations
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 4;

    const CanvasOperations = {
        /**
         * Handle wheel event for zooming and panning
         * @param {WheelEvent} e 
         * @param {Object} view - Current view state {x, y, zoom}
         * @param {Object} containerRef - Reference to container element
         * @returns {Object} New view state
         */
        handleWheel: (e, view, containerRef) => {
            // Ctrl/Cmd + Wheel to Zoom
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = -e.deltaY;
                const sensitivity = 0.001; // zoom speed
                const scale = Math.exp(delta * sensitivity); // logarithmic

                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Zoom towards mouse
                // NewZoom = OldZoom * scale
                const newZoom = Math.min(Math.max(view.zoom * scale, MIN_ZOOM), MAX_ZOOM);

                // Adjust position to keep mouse point stable
                // screen = world * zoom + pan
                // world = (screen - pan) / zoom
                // We want world point under mouse to stay same
                // (mouseX - oldPan) / oldZoom = (mouseX - newPan) / newZoom
                // mouseX - newPan = ((mouseX - oldPan) / oldZoom) * newZoom
                // newPan = mouseX - ((mouseX - oldPan) / oldZoom) * newZoom

                const newX = mouseX - ((mouseX - view.x) / view.zoom) * newZoom;
                const newY = mouseY - ((mouseY - view.y) / view.zoom) * newZoom;

                return { ...view, zoom: newZoom, x: newX, y: newY };
            } else {
                // Pan
                return {
                    ...view,
                    x: view.x - e.deltaX,
                    y: view.y - e.deltaY
                };
            }
        },

        zoomIn: (view) => {
            const newZoom = Math.min(view.zoom * 1.2, MAX_ZOOM);
            return { ...view, zoom: newZoom }; // Center zoom requires center point logic, simplified here
        },

        zoomOut: (view) => {
            const newZoom = Math.max(view.zoom / 1.2, MIN_ZOOM);
            return { ...view, zoom: newZoom };
        }
    };

    window.MagnesComponents.Utils.CanvasOps = CanvasOperations;
})();
