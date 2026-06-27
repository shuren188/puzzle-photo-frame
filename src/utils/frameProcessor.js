/**
 * 相框处理模块
 *
 * 方案：拼图铺底 + 相框边框覆盖
 *
 * 预处理（相框加载时）：
 *   用 getImageData + alpha 将相框内框区域设为透明 → 生成边框蒙版 canvas
 *
 * 合成（每次渲染时，仅两次 drawImage）：
 *   Step 1: 拼图（pad模式）铺满整个画布
 *   Step 2: 边框蒙版盖在最上层（内框透明，让拼图透出）
 *
 * 不再使用任何 composite 混合操作。
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
 * 预处理：生成边框蒙版 canvas（内框透明）
 * @param {HTMLImageElement} frameImg
 * @param {{left,top,right,bottom}} bounds
 * @returns {HTMLCanvasElement}
 */
export function createBorderMask(frameImg, bounds) {
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 内框区域 alpha = 0（透明）
  for (let y = bounds.top; y < bounds.bottom; y++) {
    const rowStart = y * w;
    for (let x = bounds.left; x < bounds.right; x++) {
      data[(rowStart + x) * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 将拼图与相框合成（两步纯 drawImage）
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage 输出的拼图画布
 * @param {HTMLCanvasElement} borderMask - createBorderMask 输出的边框蒙版
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function compositeFramedImage(ctx, puzzleCanvas, borderMask, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // Step 1: 绘制拼图铺满整个画布（cover-fitted）
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzA = puzW / puzH;
  const ca = canvasW / canvasH;

  let dW, dH, dX, dY;
  if (puzA > ca) {
    dW = canvasW;
    dH = Math.round(canvasW / puzA);
    dX = 0;
    dY = Math.round((canvasH - dH) / 2);
  } else {
    dH = canvasH;
    dW = Math.round(canvasH * puzA);
    dX = Math.round((canvasW - dW) / 2);
    dY = 0;
  }

  ctx.drawImage(puzzleCanvas, dX, dY, dW, dH);

  // Step 2: 边框蒙版盖在最上层（内框透明）
  ctx.drawImage(borderMask, 0, 0, canvasW, canvasH);
}

export function clearFrameBoundsCache() {}
