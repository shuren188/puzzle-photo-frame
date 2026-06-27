/**
 * 相框处理模块 v3.0.0
 *
 * 方案：照片直绘内框 + 相框叠加层（含切割线）
 *
 * 预处理（相框加载时）：
 *   生成 frameOverlay：
 *   - 边框区域：保留原样（不透明）
 *   - 内框区域：白板(亮度≥195)→透明，切割线(亮度≤80)→保留(70%透明度)
 *
 * 渲染（每次重绘）：
 *   1. 清空画布 → 填充背景色
 *   2. 计算照片在内框的 cover-fit 坐标
 *   3. drawImage 照片到内框区域
 *   4. drawImage frameOverlay 盖在最上层
 *      → 边框覆盖照片边缘，切割线半透明叠在照片上，白板透明让照片透出
 */

const FILE_MAP = {
  '35片': '35.jpg', '70片': '70.jpg', '120片': '120.jpg',
  '200片': '200.jpg', '300/520片': '300.jpg',
};

const BOUNDS_MAP = {
  'true_35片':  { left: 268, top: 230, right: 2189, bottom: 1691 },
  'true_70片':  { left: 310, top: 244, right: 2213, bottom: 1697 },
  'true_120片': { left: 262, top: 198, right: 2201, bottom: 1791 },
  'true_200片': { left: 2,   top: 156, right: 2311, bottom: 1645 },
  'true_300/520片':  { left: 28,  top: 146, right: 2138, bottom: 1665 },
  'false_35片': { left: 260, top: 372, right: 1725, bottom: 2393 },
  'false_70片': { left: 266, top: 354, right: 1717, bottom: 2069 },
  'false_120片':{ left: 152, top: 256, right: 1707, bottom: 2297 },
  'false_200片':{ left: 180, top: 202, right: 1715, bottom: 2343 },
  'false_300/520片': { left: 26,  top: 182, right: 1631, bottom: 2395 },
};

export function loadFrameImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载相框失败: ${url}`));
    img.src = url;
  });
}

export function getFrameUrl(sizeName, isLandscape) {
  const folder = isLandscape ? 'frames/h' : 'frames/v';
  const file = FILE_MAP[sizeName];
  return file ? `${import.meta.env.BASE_URL}${folder}/${file}` : null;
}

export function getFrameBounds(frameImg, sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  return BOUNDS_MAP[key] || {
    left: Math.round(frameImg.naturalWidth * 0.12),
    top: Math.round(frameImg.naturalHeight * 0.14),
    right: Math.round(frameImg.naturalWidth * 0.94),
    bottom: Math.round(frameImg.naturalHeight * 0.96),
  };
}

/**
 * 预处理：生成相框叠加层
 * @param {HTMLImageElement} frameImg
 * @param {{left,top,right,bottom}} bounds
 * @returns {HTMLCanvasElement} RGBA canvas（边框保留 + 内框切割线半透明 + 内框白板透明）
 */
export function createFrameOverlay(frameImg, bounds) {
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      const idx = (y * w + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

      if (brightness >= 195) {
        // 白板/亮色 → 完全透明（让用户照片透出）
        data[idx + 3] = 0;
      } else if (brightness <= 80) {
        // 深色切割线 → 保留原色，70%透明度
        data[idx + 3] = 178;
      } else {
        // 过渡区 → 按亮度线性渐变透明度
        const alpha = Math.round(178 * (1 - (brightness - 80) / 115));
        data[idx + 3] = Math.max(0, Math.min(255, alpha));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 相框模式渲染函数
 *
 * 专用于当相框开启时的渲染。无相框模式使用 app.js 中的 renderImage。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW - 输出画布宽度
 * @param {number} canvasH - 输出画布高度
 * @param {HTMLImageElement} userImg - 用户原始图片
 * @param {object} imgState - { zoom, offsetX, offsetY, rotation, fillColor }
 * @param {HTMLCanvasElement} frameOverlay - createFrameOverlay 的输出
 * @param {{left,top,right,bottom}} bounds - 内框边界
 */
export function renderFramed(ctx, canvasW, canvasH, userImg, imgState, frameOverlay, bounds) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // Step 1: 清空画布
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Step 2: 填充背景色
  ctx.fillStyle = imgState.fillColor || '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 计算内框在画布上的像素坐标
  const fw = frameOverlay.width;
  const fh = frameOverlay.height;
  const sx = canvasW / fw;
  const sy = canvasH / fh;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iR = Math.round(bounds.right * sx);
  const iB = Math.round(bounds.bottom * sy);
  const iw = iR - iL;
  const ih = iB - iT;

  if (iw > 2 && ih > 2) {
    // Step 3: 计算用户照片在内框区域的 cover-fit 坐标
    const imgW = userImg.naturalWidth;
    const imgH = userImg.naturalHeight;
    // 考虑旋转
    const nr = imgState.rotation % 180 !== 0;
    const effW = nr ? imgH : imgW;
    const effH = nr ? imgW : imgH;
    const imgAspect = effW / effH;
    const innerAspect = iw / ih;

    let srcX, srcY, srcW, srcH;
    if (imgAspect > innerAspect) {
      srcW = effH * innerAspect;  // 以高度为准，裁剪左右
      srcH = effH;
      srcX = (effW - srcW) / 2;
      srcY = 0;
    } else {
      srcW = effW;
      srcH = effW / innerAspect;  // 以宽度为准，裁剪上下
      srcX = 0;
      srcY = (effH - srcH) / 2;
    }

    // 应用 zoom
    const zf = (imgState.zoom || 100) / 100;
    const zSrcW = srcW / zf;
    const zSrcH = srcH / zf;
    let zSrcX = srcX + (srcW - zSrcW) / 2;
    let zSrcY = srcY + (srcH - zSrcH) / 2;

    // 应用 offset
    const maxOffX = (zSrcW - srcW) / 2;
    const maxOffY = (zSrcH - srcH) / 2;
    zSrcX += maxOffX * ((imgState.offsetX || 0) / 100);
    zSrcY += maxOffY * ((imgState.offsetY || 0) / 100);

    // 如果旋转，旋转源图坐标
    const finalSrcX = nr ? zSrcY : zSrcX;
    const finalSrcY = nr ? zSrcX : zSrcY;
    const finalSrcW = nr ? zSrcH : zSrcW;
    const finalSrcH = nr ? zSrcW : zSrcH;

    // 处理旋转
    const rotation = (imgState.rotation || 0) % 360;
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(iL + iw / 2, iT + ih / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.translate(-(iL + iw / 2), -(iT + ih / 2));
    }

    // 绘制用户照片到内框区域
    ctx.drawImage(userImg, finalSrcX, finalSrcY, finalSrcW, finalSrcH, iL, iT, iw, ih);

    if (rotation !== 0) {
      ctx.restore();
    }

    // Step 4: 相框叠加层盖在最上层（边框+切割线，白板透明）
    ctx.drawImage(frameOverlay, 0, 0, canvasW, canvasH);
  } else {
    // 内框太小 → 只绘制相框
    ctx.drawImage(frameOverlay, 0, 0, canvasW, canvasH);
  }
}

export function clearFrameBoundsCache() {}
