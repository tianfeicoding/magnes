// File Handlers
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const FileHandlers = {
        handlePaste: async (e, addNodeCallback, screenToWorld, view) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            // Center in view if view provided, else 0,0
                            // Logic depends on where you want to paste
                            const world = view ? screenToWorld(window.innerWidth / 2, window.innerHeight / 2, view) : { x: 0, y: 0 };
                            addNodeCallback('image-input', world.x, world.y, event.target.result, { w: img.width, h: img.height });
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(blob);
                    e.preventDefault(); // Prevent default paste behavior
                    return;
                }
            }
        },

        handleImageUpload: (file) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(e);
                reader.readAsDataURL(file);
            });
        }
    };

    window.MagnesComponents.Utils.FileHandlers = FileHandlers;
})();
