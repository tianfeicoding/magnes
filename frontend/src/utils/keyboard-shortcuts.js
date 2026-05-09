// Keyboard Shortcuts
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const KeyboardShortcuts = {
        setupShortcuts: (callbacks) => {
            const { onDelete, onDuplicate, onUndo, onRedo } = callbacks;

            const handleKeyDown = (e) => {
                // Delete
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
                    onDelete && onDelete();
                }

                // Copy/Duplicate (Ctrl+D or Alt+Drag logic usually, here simple Ctrl+D)
                if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                    e.preventDefault();
                    onDuplicate && onDuplicate();
                }

                // Undo/Redo
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    if (e.shiftKey) {
                        onRedo && onRedo();
                    } else {
                        onUndo && onUndo();
                    }
                    e.preventDefault();
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    };

    window.MagnesComponents.Utils.Keyboard = KeyboardShortcuts;
})();
