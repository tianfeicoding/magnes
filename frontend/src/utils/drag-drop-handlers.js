// Drag and Drop Handlers
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const DragDropHandlers = {
        /**
         * Handle drag over event
         * @param {Event} event 
         */
        handleDragOver: (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        },

        /**
         * Handle drop event
         * @param {Event} event 
         * @param {Function} addNodeCallback - Callback to add node(type, x, y)
         * @param {Function} screenToWorld - Helper to convert coordinates
         * @param {Object} view - Current view state (if screenToWorld needs it)
         */
        handleDrop: (event, addNodeCallback, screenToWorld, view) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');

            if (typeof type === 'undefined' || !type) {
                return;
            }

            // Convert coordinates
            // Assuming screenToWorld takes (x, y, view) or just (x, y) if view is bound
            let world;
            if (view) {
                world = screenToWorld(event.clientX, event.clientY, view);
            } else {
                world = screenToWorld(event.clientX, event.clientY);
            }

            addNodeCallback(type, world.x, world.y);
        },

        /**
         * Handle drag start for toolbar items
         * @param {Event} event 
         * @param {string} nodeType 
         */
        handleDragStart: (event, nodeType) => {
            event.dataTransfer.setData('application/reactflow', nodeType);
            event.dataTransfer.effectAllowed = 'move';
        }
    };

    window.MagnesComponents.Utils.DragDrop = DragDropHandlers;
})();
