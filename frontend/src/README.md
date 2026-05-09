# Magnes Studio V1.0 Modules

This directory contains the modularized components for Magnes Studio V1.0.

## Structure

- **components/**: UI components (Canvas, Sidebar, etc.)
- **nodes/**: Node components (ImageNode, VideoNode, etc.)
- **utils/**: Utility functions (Canvas utils, API client, local storage, etc.)
- **hooks/**: Custom React hooks (useNodes, useHistory, etc.)
- **context/**: React Context definitions (AppContext)
- **styles/**: CSS files
- **config.js**: Global configuration
- **app.js**: Main application entry point

## Usage

These modules are automatically loaded by `js/magnes-modules.js`.

## Global Namespace

All components are exposed under `window.MagnesComponents`.
