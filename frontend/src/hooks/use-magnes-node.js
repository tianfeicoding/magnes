(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};

    const { useState, useCallback } = React;
    const { NodeHelpers } = window.MagnesComponents.Utils;

    /**
     * useMagnesNode - 画布节点状态基础管理 Hook
     * 
     * 功能：
     * 1. 维护 React Flow 节点的 state (nodes)。
     * 2. 追踪当前被选中的节点 ID (selectedNodeId)。
     * 3. 提供节点的基础增删改查方法 (addNode, updateNode, removeNode)。
     */
    const useMagnesNode = (initialNodes = []) => {
        const [nodes, setNodes] = useState(initialNodes); // 全局节点状态列表
        const [selectedNodeId, setSelectedNodeId] = useState(null); // 当前选中节点的 ID

        const addNode = useCallback((nodeOrType, x, y) => {
            let newNode;
            if (typeof nodeOrType === 'string') {
                // It's a type
                const createNodeObject = window.MagnesComponents.Utils.Node.createNodeObject;
                newNode = createNodeObject(nodeOrType, x, y);
            } else {
                // It's a node object
                newNode = nodeOrType;
            }

            setNodes(prev => [...prev, newNode]);
            return newNode;
        }, []);

        const updateNode = useCallback((id, data) => {
            setNodes(prev => prev.map(n => n.id === id ? { ...n, ...data } : n));
        }, []);

        const removeNode = useCallback((id) => {
            setNodes(prev => prev.filter(n => n.id !== id));
            if (selectedNodeId === id) setSelectedNodeId(null);
        }, [selectedNodeId]);

        const clearNodes = useCallback(() => {
            setNodes([]);
            setSelectedNodeId(null);
        }, []);

        return {
            nodes,
            setNodes,
            selectedNodeId,
            setSelectedNodeId,
            addNode,
            updateNode,
            removeNode,
            clearNodes
        };
    };

    window.MagnesComponents.Hooks.useMagnesNode = useMagnesNode;
})();
