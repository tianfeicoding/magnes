/**
 * Rednote Style Presets (JSX/Modular)
 * 路径: src/nodes/rednote/style-presets.js
 */

(function () {
    'use strict';

    /**
     * Style Atoms - 样式原子
     * 可被 AI 读写的标准化样式配置
     */
    const createStyleAtom = (config) => ({
        id: config.id || `style-${Date.now()}`,
        name: config.name || 'Untitled Style',
        atoms: {
            background: {
                type: config.background?.type || 'solid',
                value: config.background?.value || '#ffffff',
                opacity: config.background?.opacity || 1.0
            },
            palette: {
                primary: config.palette?.primary || '#000000',
                secondary: config.palette?.secondary || '#666666',
                accent: config.palette?.accent || '#FF2442',
                text: config.palette?.text || '#333333',
                muted: config.palette?.muted || '#999999'
            },
            typography: {
                titleFont: config.typography?.titleFont || 'serif',
                bodyFont: config.typography?.bodyFont || 'sans-serif',
                weight: config.typography?.weight || 'bold'
            },
            decoration: {
                border: config.decoration?.border || 'none',
                stickers: config.decoration?.stickers || [],
                layoutPreset: config.decoration?.layoutPreset || 'ticket'
            }
        },
        metadata: {
            source: config.source || 'preset',
            tags: config.tags || [],
            createdAt: config.createdAt || Date.now()
        }
    });

    // 预设风格库
    const STYLE_PRESETS = {
        vintage_ticket: createStyleAtom({
            id: 'vintage_ticket',
            name: '复古票根',
            background: { type: 'solid', value: '#f5f3ed' },
            palette: {
                primary: '#f5f3ed', secondary: '#e8c547', accent: '#d4a017',
                text: '#2c2416', muted: '#c9a961'
            },
            typography: { titleFont: 'serif', bodyFont: 'sans-serif', weight: 'bold' },
            decoration: { border: 'solid', stickers: ['ticket-stub', 'vintage-stamp'], layoutPreset: 'ticket' },
            tags: ['复古', '票根']
        }),
        japanese_journal: createStyleAtom({
            id: 'japanese_journal',
            name: '日式手账',
            background: { type: 'solid', value: '#f39c12' },
            palette: {
                primary: '#f39c12', secondary: '#FFE4B5', accent: '#8B4513',
                text: '#5D4037', muted: '#A0522D'
            },
            typography: { titleFont: 'serif', bodyFont: 'sans-serif', weight: 'normal' },
            decoration: { border: 'dashed', stickers: ['washi-tape', 'stamp'], layoutPreset: 'market' },
            tags: ['日式', '市集']
        }),
        minimal_white: createStyleAtom({
            id: 'minimal_white',
            name: '极简留白',
            background: { type: 'solid', value: '#ffffff' },
            palette: {
                primary: '#ffffff', secondary: '#f5f5f5', accent: '#000000',
                text: '#1a1a1a', muted: '#cccccc'
            },
            typography: { titleFont: 'sans-serif', bodyFont: 'sans-serif', weight: 'normal' },
            decoration: { border: 'none', stickers: [], layoutPreset: 'ticket' },
            tags: ['极简', '现代']
        })
    };

    // 通用色板
    const COMMON_PALETTES = {
        sakura: {
            id: 'sakura', name: '樱花粉',
            background: { type: 'solid', value: '#fff0f5' },
            palette: { primary: '#fff0f5', secondary: '#ffb7c5', accent: '#ff69b4', text: '#5c3a4a', muted: '#e6a8b7' }
        },
        ocean: {
            id: 'ocean', name: '深邃蓝',
            background: { type: 'solid', value: '#f0f8ff' },
            palette: { primary: '#f0f8ff', secondary: '#87cefa', accent: '#4682b4', text: '#1a3c5e', muted: '#aecbe8' }
        }
    };

    // 导出
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};
    window.MagnesComponents.Utils.RednoteStyles = {
        createStyleAtom,
        STYLE_PRESETS,
        COMMON_PALETTES
    };

    // 兼容旧版命名空间
    window.RednoteStylePresets = window.MagnesComponents.Utils.RednoteStyles;

    console.log('✅ Rednote Style Presets (JSX) Registered');
})();
