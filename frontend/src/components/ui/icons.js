// Icons Component
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.UI = window.MagnesComponents.UI || {};

    const { 
        GripHorizontal, X, Copy, Maximize2, Trash2, Check, RefreshCw, 
        Layers, Sliders, Image, Type, Video, Film, Wand2, ArrowRight, 
        Sparkles, Plus, History, Edit3, Bot, Rocket, Layout, MonitorPlay, 
        MessageSquare, ImagePlus, PenTool, ChevronDown, ChevronUp
    } = lucide;

    // Optimized Icon Wrapper
    const IconWrapper = React.memo(({ name, size = 24, className = "", ...props }) => {
        const IconComponent = lucide[name];
        if (!IconComponent) {
            console.warn(`Icon ${name} not found`);
            return null;
        }
        return <IconComponent size={size} className={className} {...props} />;
    });

    // Icons collection for easy access
    const Icons = {
        GripHorizontal, X, Copy, Maximize2, Trash2, Check, RefreshCw, 
        Layers, Sliders, Image, Type, Video, Film, Wand2, ArrowRight, 
        Sparkles, Plus, History, Edit3, Bot, Rocket, Layout, MonitorPlay, 
        MessageSquare, ImagePlus, PenTool, ChevronDown, ChevronUp,
        Wrapper: IconWrapper
    };

    window.MagnesComponents.UI.Icons = Icons;
})();
