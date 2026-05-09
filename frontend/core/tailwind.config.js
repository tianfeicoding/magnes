/**
 * 局部 Tailwind 配置
 * 用于在无构建环境下定义 Magnes Studio 的自研 UI 色系与字体规范
 */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                zinc: { 850: '#1f1f22', 950: '#0c0c0e' }
            },
            fontFamily: {
                'sans': ['Inter', 'system-ui', '-apple-system', 'sans-serif']
            }
        }
    }
}
