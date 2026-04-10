(function () {
    window.MagnesComponents = window.MagnesComponents || {};

    // Dependencies - 优先从 BaseAPI.Constants 读取,确保初始化顺序正确
    const BaseConstants = window.BaseAPI?.Constants || {};
    const MagnesConstants = window.MagnesComponents.Utils?.Constants || {};

    // 合并常量,优先使用 BaseAPI 的值(因为它先加载)
    const DEFAULT_BASE_URL = BaseConstants.DEFAULT_BASE_URL || MagnesConstants.DEFAULT_BASE_URL || 'https://api.openai.com';
    const JIMENG_API_BASE_URL = BaseConstants.JIMENG_API_BASE_URL || MagnesConstants.JIMENG_API_BASE_URL || 'https://jimeng.jianying.com';

    // --- Configuration Constants ---
    const JIMENG_SESSION_ID = window.__ENV__?.JIMENG_SESSION_ID || '';
    const MAGNES_API_TOKEN = 'magnes_secure_token_2026';
    const PROMPT_LIBRARY_KEY = 'magnes_prompt_library';
    const VIRTUAL_CANVAS_WIDTH = 4000;
    const VIRTUAL_CANVAS_HEIGHT = 4000;

    // --- Default API Configs ---
    const DEFAULT_API_CONFIGS = [
        // Chat Models
        { id: 'gemini-3-pro', provider: 'Gemini 3 Pro', modelName: 'gemini-3-pro-preview', type: 'Chat', key: '', url: DEFAULT_BASE_URL },
        { id: 'gpt-5-1', provider: 'GPT 5.1', modelName: 'gpt-5.1', type: 'Chat', key: '', url: DEFAULT_BASE_URL },
        { id: 'gpt-5-2', provider: 'GPT 5.2', modelName: 'gpt-5.2', type: 'Chat', key: '', url: DEFAULT_BASE_URL },
        { id: 'deepseek-v3', provider: 'DeepSeek V3', modelName: 'deepseek-v3-1-250821', type: 'Chat', key: '', url: DEFAULT_BASE_URL },
        { id: 'gpt-4o', provider: 'GPT-4o', modelName: 'gpt-4o', type: 'Chat', key: '', url: DEFAULT_BASE_URL },

        // Image Models
        { id: 'nano-banana', provider: 'Nano Banana', modelName: 'nano-banana', type: 'Image', key: '', url: DEFAULT_BASE_URL },
        { id: 'nano-banana-2', provider: 'Nano Banana 2', modelName: 'nano-banana-2', type: 'Image', key: '', url: DEFAULT_BASE_URL },
        { id: 'gpt-image', provider: 'GPT-4o Image', modelName: 'gpt-4o-image', type: 'Image', key: '', url: DEFAULT_BASE_URL },
        { id: 'flux-kontext', provider: 'Flux Kontext', modelName: 'flux-kontext-pro', type: 'Image', key: '', url: DEFAULT_BASE_URL },
        { id: 'mj-v6', provider: 'Midjourney', modelName: 'MJ V6', type: 'Image', key: '', url: 'https://api.midjourney.com' },
        // 即梦模型（使用sessionid作为key，首次打开时为空，需要用户输入）
        { id: 'jimeng-4.5', provider: 'Jimeng 4.5', modelName: 'jimeng-4.5', type: 'Image', key: '', url: JIMENG_API_BASE_URL },
        { id: 'jimeng-4.1', provider: 'Jimeng 4.1', modelName: 'jimeng-4.1', type: 'Image', key: '', url: JIMENG_API_BASE_URL },
        { id: 'jimeng-3.1', provider: 'Jimeng 3.1', modelName: 'jimeng-3.1', type: 'Image', key: '', url: JIMENG_API_BASE_URL },

        // Video Models
        { id: 'sora-2', provider: 'Sora 2', modelName: 'sora-2', type: 'Video', key: '', url: DEFAULT_BASE_URL, durations: ['5s', '10s', '15s'] },
        { id: 'sora-2-pro', provider: 'Sora 2 Pro', modelName: 'sora-2-pro', type: 'Video', key: '', url: DEFAULT_BASE_URL, durations: ['15s', '25s'] },
        { id: 'google-veo3', provider: 'Google Veo 3', modelName: 'veo3.1-components', type: 'Video', key: '', url: 'https://ai.t8star.cn', durations: ['8s'] },
        { id: 'grok-3', provider: 'Grok3 Video', modelName: 'grok-video-3', type: 'Video', key: '', url: 'https://ai.t8star.cn', durations: ['8s', '5s'] },

        // 302.AI Models (OpenAI Compatible)
        { id: 'qwen-image-layered', provider: 'Qwen Image Layered', modelName: 'qwen-image-layered', type: 'Image', key: '', url: 'https://api.302.ai' },
    ];

    // --- Prompt Templates ---
    const PROMPT_TEMPLATES = {
        GRID: `基于我上传的这张参考图，生成一张九宫格（3x3 grid）布局的分镜脚本。请严格保持角色与参考图一致（Keep character strictly consistent），但在9个格子中展示该角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。`,

        UPSCALE: `请对参考图片进行无损高清放大（Upscale）。请严格保持原图的构图、色彩、光影和所有细节元素不变，不要进行任何创造性的重绘或添加新内容。仅专注于提升分辨率、锐化边缘（Sharpening）和去除噪点（Denoising），实现像素级的高清修复。Best quality, 8k, masterpiece, highres, ultra detailed, sharp focus, image restoration, upscale, faithful to original.`,

        STORYBOARD: `you are a veteran Hollywood storyboard artist with years of experience. You have the ability to accurately analyze character features and scene characteristics based on images. Provide me with the most suitable camera angles and storyboards. Strictly base this on the uploaded character and scene images, while maintaining a consistent visual style.

MANDATORY LAYOUT: Create a precise 3x3 GRID containing exactly 9 distinct panels.

- The output image MUST be a single image divided into a 3 (rows) by 3 (columns) matrix.
- There must be EXACTLY 3 horizontal rows and 3 vertical columns.
- Each panel must be completely separated by a thin, distinct, solid black line.
- DO NOT create a collage. DO NOT overlap images. DO NOT create random sizes. 
- The grid structure must be perfectly aligned for slicing.

Subject Content: "[在此处填充你对故事的描述]"

Styling Instructions:
- Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).
- Maintain perfect consistency of the character/object across all panels.
- Cinematic lighting, high fidelity, 8k resolution.

Negative Constraints:
- No text, no captions, no UI elements.
- No watermarks.
- No broken grid lines.`,

        CHARACTER_SHEET: `(strictly mimic source image art style:1.5), (same visual style:1.4),
score_9, score_8_up, masterpiece, best quality, (character sheet:1.4), (reference sheet:1.3), (consistent art style:1.3), matching visual style, 

[Structure & General Annotations]:
multiple views, full body central figure, clean background, 
(heavy annotation:1.4), (text labels with arrows:1.3), handwriting, data readout,

[SPECIAL CHARACTER DESCRIPTION AREA]:
(prominent character profile text box:1.6), (dedicated biography section:1.5), large descriptive text block,
[在此处填写特殊角色说明，例如：姓名、种族、背景故事等],

[Clothing Breakdown]:
(clothing breakdown:1.5), (outfit decomposition:1.4), garment analysis, (floating apparel:1.3), 
displaying outerwear, displaying upper body garment, displaying lower body garment, 

[Footwear Focus]:
(detailed footwear display:1.5), (floating shoes:1.4), shoe design breakdown, focus on shoes, 

[Inventory & Details]:
(inventory knolling:1.2), open container, personal accessories, organized items display, expression panels`,

        MOOD_BOARD: `# Directive: Create a "Rich Narrative Mood Board" (8-Grid Layout)

## 1. PROJECT INPUT 

**A. [Story & Concept / 故事与核心想法]**
> [跟据自身内容书写]

**B. [Key Symbols / 核心意象 (Optional)]**
> [深度理解参考图，自行创作]

**C. [Color Preferences / 色彩倾向 (Optional)]**
> [深度理解参考图，自行创作]

**D. [Reference Images / 参考图]**
> (See attached images / 请读取我上传的图片)

---

## 2. Role Definition
Act as a **Senior Art Director**. Synthesize the Input above into a single, cohesive, high-density **Visual Mood Board** using a complex **8-Panel Asymmetrical Grid Layout**.

## 3. Layout Mapping (Strict Adherence)
You must design a visual composition that tells the story through **8 distinct panels** within one image. **Do not** generate random grids. Map the content exactly as follows:

* **Panel 1 (The World):** A wide, cinematic establishing shot of the environment (based on Input A).
* **Panel 2 (The Protagonist):** A portrait close-up (based on reference images), focusing on micro-expressions.
* **Panel 3 (The Metaphor):** An **abstract symbolic object** representing the core theme (based on Input B).
* **Panel 4 (The Palette):** A graphical **Color Palette Strip** showcasing 5 specific colors extracted from the scene.
* **Panel 5 (The Texture):** Extreme macro close-up of a material surface (e.g., rust, skin, fabric) to add tactile richness.
* **Panel 6 (The Motion):** A motion-blurred or long-exposure shot representing time/chaos.
* **Panel 7 (The Detail):** A focused shot of a specific prop or accessory relevant to the plot.
* **Panel 8 (The AI Art Interpretation - CRITICAL):** This is your **free creative space**. Generate an artistic, surreal, or abstract re-interpretation of the story's emotion. **Do not just copy the inputs.** Create a "Vibe Image" (e.g., Double Exposure, Oil Painting style, or abstract geometry) that captures the *soul* of the narrative.

## 4. Execution Requirements
* **Composition Style:** High-end Editorial / Magazine Layout. Clean, thin white borders.
* **Visual Unity:** All panels must share the same lighting conditions and color grading logic (Unified Aesthetic).`
    };

    // 导出到 Config 命名空间（保持向后兼容）
    window.MagnesComponents.Config = {
        MAGNES_API_TOKEN,
        JIMENG_SESSION_ID,
        PROMPT_LIBRARY_KEY,
        VIRTUAL_CANVAS_WIDTH,
        VIRTUAL_CANVAS_HEIGHT,
        DEFAULT_API_CONFIGS,
        PROMPT_TEMPLATES
    };

    // 同时导出到 Utils.Constants 命名空间（供 app-context.js 使用）
    if (!window.MagnesComponents.Utils) window.MagnesComponents.Utils = {};
    if (!window.MagnesComponents.Utils.Constants) window.MagnesComponents.Utils.Constants = {};

    window.MagnesComponents.Utils.Constants.DEFAULT_API_CONFIGS = DEFAULT_API_CONFIGS;
    window.MagnesComponents.Utils.Constants.DEFAULT_BASE_URL = DEFAULT_BASE_URL;
    window.MagnesComponents.Utils.Constants.JIMENG_API_BASE_URL = JIMENG_API_BASE_URL;
    window.MagnesComponents.Utils.Constants.MAGNES_API_TOKEN = MAGNES_API_TOKEN;

    console.log('✅ Config loaded, API configs:', DEFAULT_API_CONFIGS.length);
})();
