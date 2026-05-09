// Node Operations
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const NodeOperations = {
        /**
         * Delete a node by ID
         */
        deleteNode: (id, nodes, connections) => {
            const newNodes = nodes.filter(n => n.id !== id);
            const newConnections = connections.filter(c => c.from !== id && c.to !== id);
            return { nodes: newNodes, connections: newConnections };
        },

        /**
         * Duplicate a node
         */
        duplicateNode: (id, nodes) => {
            const node = nodes.find(n => n.id === id);
            if (!node) return null;

            const newNode = JSON.parse(JSON.stringify(node));
            newNode.id = `node-${Date.now()}`;
            newNode.x += 20; // Offset
            newNode.y += 20;

            // Special handling for some node types if needed (e.g. reset status)
            if (newNode.status === 'generating') {
                newNode.status = 'idle';
            }

            return newNode;
        },

        /**
         * Update node data
         */
        updateNode: (id, data, nodes) => {
            return nodes.map(n => n.id === id ? { ...n, ...data } : n);
        }
    };

    window.MagnesComponents.Utils.NodeOps = NodeOperations;
})();
