(function () {
  'use strict';
  if (window.__OVYX_ASSET_OPTIMIZER_V1__) return;
  window.__OVYX_ASSET_OPTIMIZER_V1__ = true;

  var MAX_DIMENSION = 2560;
  var MIN_BYTES = 512 * 1024;
  var QUALITY = 0.88;

  function replaceExtension(name) {
    var value = String(name || 'image').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim() || 'image';
    return value.replace(/\\.[a-z0-9]{1,8}$/i, '') + '.webp';
  }

  function canvasBlob(canvas) {
    if (typeof canvas.convertToBlob === 'function') {
      return canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
    }
    return new Promise(function (resolve, reject) {
      if (typeof canvas.toBlob !== 'function') return reject(new Error('Image optimization is not supported in this browser.'));
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode the optimized image.'));
      }, 'image/webp', QUALITY);
    });
  }

  async function optimize(file) {
    if (!file || !/^image\\/(?:jpeg|png)$/i.test(String(file.type || '')) || file.size < MIN_BYTES) {
      return { file: file, optimized: false, originalBytes: Number(file && file.size) || 0, optimizedBytes: Number(file && file.size) || 0 };
    }
    if (typeof createImageBitmap !== 'function' || typeof File !== 'function') {
      return { file: file, optimized: false, originalBytes: file.size, optimizedBytes: file.size, reason: 'browser-image-codec-unavailable' };
    }
    var bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      var width = Math.max(1, Number(bitmap.width) || 1);
      var height = Math.max(1, Number(bitmap.height) || 1);
      var scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      var targetWidth = Math.max(1, Math.round(width * scale));
      var targetHeight = Math.max(1, Math.round(height * scale));
      var canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(targetWidth, targetHeight)
        : document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('Image optimization canvas is unavailable.');
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      var blob = await canvasBlob(canvas);
      if (!blob || blob.type !== 'image/webp' || blob.size >= file.size * 0.97) {
        return { file: file, optimized: false, originalBytes: file.size, optimizedBytes: file.size, reason: 'no-meaningful-size-reduction' };
      }
      var optimizedFile = new File([blob], replaceExtension(file.name), {
        type: 'image/webp',
        lastModified: Number(file.lastModified) || Date.now(),
      });
      return {
        file: optimizedFile,
        optimized: true,
        originalBytes: file.size,
        optimizedBytes: blob.size,
        originalWidth: width,
        originalHeight: height,
        width: targetWidth,
        height: targetHeight,
        format: 'image/webp',
      };
    } catch (error) {
      return { file: file, optimized: false, originalBytes: file.size, optimizedBytes: file.size, reason: String(error && error.message || 'optimization-failed').slice(0, 160) };
    } finally {
      try { bitmap && bitmap.close && bitmap.close(); } catch (_) {}
    }
  }

  function install() {
    var store = window.OVYXAssetStore;
    if (!store || store.__optimizerWrapped || typeof store.upload !== 'function') return false;
    var originalUpload = store.upload.bind(store);
    store.upload = async function (file, projectId, options) {
      var result = await optimize(file);
      var uploaded = await originalUpload(result.file, projectId, options || {});
      var optimization = {
        optimized: result.optimized === true,
        originalBytes: result.originalBytes,
        uploadedBytes: result.optimizedBytes,
        savedBytes: Math.max(0, result.originalBytes - result.optimizedBytes),
        width: result.width || null,
        height: result.height || null,
        format: result.format || String(result.file && result.file.type || ''),
        reason: result.reason || '',
      };
      if (result.optimized) {
        try {
          window.dispatchEvent(new CustomEvent('ovyx:asset-optimized', { detail: {
            assetId: String(uploaded.assetId || uploaded.id || ''),
            name: String(uploaded.name || result.file.name),
            ...optimization,
          } }));
        } catch (_) {}
      }
      return Object.assign({}, uploaded, { optimization: optimization });
    };
    store.__optimizerWrapped = true;
    window.OVYXAssetOptimizer = { optimize: optimize, version: '1.0.0', maxDimension: MAX_DIMENSION, quality: QUALITY };
    return true;
  }

  install();
  document.addEventListener('DOMContentLoaded', install, { once: true });
  window.addEventListener('firebase-auth-state-ready', install);
  window.addEventListener('ovyx:webstudio-initial-site-built', install);
})();
