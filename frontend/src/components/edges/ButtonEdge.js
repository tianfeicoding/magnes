(function () {
    const { React } = window;
    // 从全局获取 ReactFlow 相关的工具函数
    const { getBezierPath, EdgeLabelRenderer } = window.ReactFlow || {};
    const { Trash2 } = window.MagnesComponents.UI.Icons;

    /**
     * 自定义带删除按钮的连线组件
     * 解决了连线在主组件内定义导致的重渲染循环 Bug
     */
    const ButtonEdge = ({
        id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style = {}, markerEnd, selected, data
    }) => {
        if (!getBezierPath) return null;
        
        const [edgePath, labelX, labelY] = getBezierPath({
            sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
        });

        return (
            <React.Fragment>
                {/* 1. 基础连线层 */}
                <path id={id} style={style} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} />

                {/* 2. 隐形交互层 - 增加点击灵敏度 */}
                <path
                    d={edgePath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    className="react-flow__edge-interaction cursor-pointer"
                />

                {/* 3. 选中状态显示删除控制按钮 */}
                {selected && (
                    <EdgeLabelRenderer>
                        <div
                            style={{
                                position: 'absolute',
                                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                                pointerEvents: 'all',
                            }}
                            className="nodrag nopan z-[60]"
                        >
                            <button
                                className="w-6 h-6 bg-white border border-black text-black flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition-all shadow-lg"
                                onClick={(evt) => {
                                    evt.stopPropagation();
                                    // 优先调用通过 data 传入的删除回调
                                    if (data && typeof data.onDelete === 'function') {
                                        data.onDelete(id);
                                    } else {
                                        // 触发全局事件供外部监听（解耦重构时的兜底方案）
                                        window.dispatchEvent(new CustomEvent('magnes:delete_edge', { detail: { id } }));
                                    }
                                }}
                                title="删除此连线"
                            >
                                <Trash2 size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                    </EdgeLabelRenderer>
                )}
            </React.Fragment>
        );
    };

    // 挂载到全局组件库
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Edges = window.MagnesComponents.Edges || {};
    window.MagnesComponents.Edges.ButtonEdge = ButtonEdge;
})();
