// Image and Video Utilities
(function () {
    window.MagnesComponents = window.MagnesComponents || {};
    window.MagnesComponents.Utils = window.MagnesComponents.Utils || {};

    const ImageUtils = {
        /**
         * Get image dimensions
         * @param {string} src - Image URL
         * @returns {Promise<{w: number, h: number}>}
         */
        getImageDimensions: (src) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const timeoutId = setTimeout(() => {
                    img.src = ""; // Stop loading
                    reject(new Error("getImageDimensions timed out (5s)"));
                }, 5000);

                img.onload = () => {
                    clearTimeout(timeoutId);
                    resolve({ w: img.naturalWidth, h: img.naturalHeight });
                };
                img.onerror = (e) => {
                    clearTimeout(timeoutId);
                    reject(new Error("Failed to load image dimensions"));
                };
                img.src = src;
            });
        },

        /**
         * Check if URL is a video
         * @param {string} url 
         * @returns {boolean}
         */
        isVideoUrl: (url) => {
            if (!url) return false;
            // Jimeng API might return force_video_display param
            if (url.includes('force_video_display=true')) return true;

            // Data URI check
            if (url.startsWith('data:video')) return true;

            // Extension check for typical video files
            const ext = url.split('.').pop().split('?')[0].toLowerCase();
            return ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
        },

        /**
         * Load video metadata
         * @param {string} src 
         * @returns {Promise<{duration: number, w: number, h: number}>}
         */
        getVideoMetadata: (src) => {
            return new Promise((resolve, reject) => {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true;
                video.playsInline = true;
                video.onloadedmetadata = () => {
                    resolve({
                        duration: Number(video.duration) || 0,
                        w: video.videoWidth || 0,
                        h: video.videoHeight || 0,
                    });
                };
                video.onerror = () => reject(new Error('Failed to load video metadata'));
                video.src = src;
            });
        },

        /**
         * Extract Key Frames from video
         * @param {string} src 
         * @param {Object} options 
         * @returns {Promise<string[]>} Array of base64 images
         */
        extractKeyFrames: (src, { fps = 2 } = {}) => {
            return new Promise((resolve, reject) => {
                const video = document.createElement('video');
                const canvas = document.createElement('canvas'); // Offscreen canvas
                const ctx = canvas.getContext('2d');
                video.muted = true;
                video.playsInline = true;
                video.crossOrigin = 'anonymous'; // Critical for CORS
                video.src = src;
                const frames = [];

                const handleError = () => reject(new Error('Video frame extraction failed'));
                video.onerror = handleError;

                video.onloadedmetadata = async () => {
                    const duration = video.duration;
                    const width = video.videoWidth;
                    const height = video.videoHeight;

                    // Limit max resolution for performance
                    const maxDim = 640;
                    let scale = 1;
                    if (Math.max(width, height) > maxDim) {
                        scale = maxDim / Math.max(width, height);
                    }

                    canvas.width = width * scale;
                    canvas.height = height * scale;

                    const step = 1 / fps;
                    let currentTime = 0;

                    const captureFrame = () => {
                        return new Promise((res) => {
                            video.currentTime = currentTime;
                            video.onseeked = () => {
                                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                frames.push(canvas.toDataURL('image/jpeg', 0.7));
                                res();
                            };
                            video.onerror = () => res(); // Skip error frames
                        });
                    };

                    while (currentTime < duration) {
                        await captureFrame();
                        currentTime += step;
                        // Limit total frames to avoid memory issues (e.g. max 20 frames)
                        if (frames.length >= 20) break;
                    }

                    resolve(frames);
                };
            });
        },

        /**
         * Compose multiple images into one Data URL
         * @param {string[]} urls - Array of image URLs/DataURLs
         * @returns {Promise<string>} Data URL of the composed image
         */
        composeImages: (urls) => {
            return new Promise(async (resolve, reject) => {
                if (!urls || urls.length === 0) return resolve(null);
                if (urls.length === 1) return resolve(urls[0]);

                try {
                    // 1. Load all images and find max dimensions
                    const imgs = await Promise.all(urls.map(url => {
                        return new Promise((res) => {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            img.onload = () => res(img);
                            img.onerror = () => res(null); // Skip failed images
                            img.src = url;
                        });
                    }));

                    const validImgs = imgs.filter(Boolean);
                    if (validImgs.length === 0) return resolve(null);

                    // Find max width and height to determine canvas size
                    const maxWidth = Math.max(...validImgs.map(i => i.width));
                    const maxHeight = Math.max(...validImgs.map(i => i.height));

                    // 2. Setup Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = maxWidth;
                    canvas.height = maxHeight;
                    const ctx = canvas.getContext('2d');

                    // 3. Draw layers sequentially
                    validImgs.forEach(img => {
                        // Center align logic:
                        const dx = (maxWidth - img.width) / 2;
                        const dy = (maxHeight - img.height) / 2;
                        ctx.drawImage(img, dx, dy, img.width, img.height);
                    });

                    // 4. Export
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    console.error('[ImageUtils] Compose Error:', e);
                    reject(e);
                }
            });
        }
    };

    window.MagnesComponents.Utils.Image = ImageUtils;
})();
