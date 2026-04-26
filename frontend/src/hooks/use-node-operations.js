(function () {
    const { React } = window;
    const { useCallback, useEffect } = React;

    /**
     * useNodeOperations - 画布节点与连线的基础指令操作 Hook
     * 
     * 功能定位：
     * 1. 提供底层节点操作方法：删除（deleteSelected）、复制（duplicateSelected）、连线回调（onConnect）。
     * 2. 注册并控制 Canvas 上的拖拽（Drag & Drop）逻辑，实现从侧边栏拖入节点。
     * 3. 挂载全局快捷键监听：Delete/Backspace 删除元素，Cmd/Ctrl + D 快速复制节点。
     * 4. 对外暴露 `MagnesComponents.Utils.NodeOperations` 接口，供组件层通过命令式调用。
     */
    const useNodeOperations = ({
        nodes,
        edges,
        setNodes,
        setEdges,
        reactFlowInstance,
        addEdge
    }) => {
        // 1. 删除选中元素
        const deleteSelectedElements = useCallback(() => {
            const selectedNodes = nodes.filter(n => n.selected);
            const selectedEdges = edges.filter(e => e.selected);
            setNodes(nds => nds.filter(n => !n.selected));
            setEdges(eds => eds.filter(e => !e.selected));

            // 记录 CanvasActionLog
            try {
                const API = window.MagnesComponents?.Utils?.API;
                if (API?.ActionLog?.log && selectedNodes.length > 0) {
                    API.ActionLog.log({
                        actionType: 'node_delete',
                        targetNodeId: selectedNodes[0]?.id,
                        payload: {
                            deletedNodeCount: selectedNodes.length,
                            deletedEdgeCount: selectedEdges.length,
                            deletedNodeTypes: selectedNodes.map(n => n.type),
                        },
                        description: `用户删除了 ${selectedNodes.length} 个节点`,
                    });
                }
            } catch (e) {
                console.error('[Magnes] CanvasActionLog 发送失败:', e);
            }
        }, [nodes, edges, setNodes, setEdges]);

        // 2. 复制选中节点
        const duplicateSelectedNodes = useCallback(() => {
            const selected = nodes.filter(n => n.selected);
            if (selected.length === 0) return;
            const newNodes = selected.map(node => ({
                ...node,
                id: `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                position: { x: node.position.x + 50, y: node.position.y + 50 },
                selected: false
            }));
            setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
        }, [nodes, setNodes]);

        // 3. 精准删除指定 ID 的节点
        const deleteNodeById = useCallback((nodeId) => {
            setNodes(nds => nds.filter(n => n.id !== nodeId));
            setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        }, [setNodes, setEdges]);

        // 4. 精准复制指定 ID 的节点
        const duplicateNodeById = useCallback((nodeId) => {
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;
            const newNode = {
                ...node,
                id: `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                position: { x: node.position.x + 50, y: node.position.y + 50 },
                selected: false
            };
            setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), newNode]);
        }, [nodes, setNodes]);

        // 5. 连线处理
        const onConnect = useCallback((params) => {
            setEdges((eds) => addEdge({
                type: 'button-edge',
                ...params
            }, eds));

            // 记录 CanvasActionLog
            try {
                const API = window.MagnesComponents?.Utils?.API;
                if (API?.ActionLog?.log) {
                    API.ActionLog.log({
                        actionType: 'edge_connect',
                        targetNodeId: params.target,
                        payload: {
                            source: params.source,
                            target: params.target,
                            sourceHandle: params.sourceHandle,
                            targetHandle: params.targetHandle,
                        },
                        description: `用户连接了节点：${params.source} → ${params.target}`,
                    });
                }
            } catch (e) {
                console.error('[Magnes] CanvasActionLog 发送失败:', e);
            }
        }, [setEdges, addEdge]);

        // 6. 拖拽放置处理
        const onDragOver = useCallback((event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }, []);

        const onDrop = useCallback((event) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            if (!type || !reactFlowInstance) return;

            const position = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            const newNodeId = `${type}-${Date.now()}`;
            const newNode = {
                id: newNodeId,
                type: type,
                position,
                data: { label: type },
            };
            setNodes((nds) => nds.concat(newNode));

            // 记录 CanvasActionLog
            try {
                const API = window.MagnesComponents?.Utils?.API;
                if (API?.ActionLog?.log) {
                    API.ActionLog.log({
                        actionType: 'node_create',
                        targetNodeId: newNodeId,
                        payload: {
                            nodeType: type,
                            position,
                            source: 'drag_drop',
                        },
                        description: `用户从组件库拖拽添加了「${type}」节点`,
                    });
                }
            } catch (e) {
                console.error('[Magnes] CanvasActionLog 发送失败:', e);
            }
        }, [reactFlowInstance, setNodes]);

        // 7. 注册全局快捷键与公共接口
        useEffect(() => {
            if (!window.MagnesComponents.Utils) window.MagnesComponents.Utils = {};
            window.MagnesComponents.Utils.NodeOperations = {
                deleteSelected: deleteSelectedElements,
                duplicateSelected: duplicateSelectedNodes,
                deleteNodeById,
                duplicateNodeById
            };

            const handleKeyDown = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
                
                // Delete / Backspace 删除选中
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    deleteSelectedElements();
                }
                
                // Cmd/Ctrl + D 复制选中
                if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
                    e.preventDefault();
                    duplicateSelectedNodes();
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            
            // 监听来自独立连线组件的删除请求
            const handleCustomDelete = (e) => {
                const { id } = e.detail;
                setEdges(eds => eds.filter(edge => edge.id !== id));
            };
            window.addEventListener('magnes:delete_edge', handleCustomDelete);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('magnes:delete_edge', handleCustomDelete);
            };
        }, [deleteSelectedElements, duplicateSelectedNodes, deleteNodeById, duplicateNodeById, setEdges]);

        return {
            onConnect,
            onDragOver,
            onDrop,
            deleteSelectedElements,
            duplicateSelectedNodes,
            deleteNodeById,
            duplicateNodeById
        };
    };

    window.MagnesComponents.Hooks = window.MagnesComponents.Hooks || {};
    window.MagnesComponents.Hooks.useNodeOperations = useNodeOperations;
})();
