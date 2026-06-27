/**
 * 相框处理模块
 *
 * 方案：蒙版预处理 + 内框精确 cover-fit
 *
 * 预处理（相框加载时一次性执行）：
 *   - 绘制相框到 canvas → 内框区域 alpha=0 → 保存为蒙版
 *
 * 合成（每次渲染时）：
 *   - Step 1: 绘制相框蒙版到主画布（内框透明，边框显示）
 *   - Step 2: 在内框区域绘制拼图（cover-fitted 到内框大小）
 *
 * 核心：拼图只绘制在内框区域内，不依赖任何 compositing 混合模式
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
  if (!file) return null;
  return `${import.meta.env.BASE_URL}${folder}/${file}`;
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
 * 预处理：创建内框透明的相框蒙版
 */
export function createFrameMask(frameImg, bounds) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, fw, fh);
  const data = imageData.data;

  // 内框区域 alpha = 0（透明）
  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      data[(y * fw + x) * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 将拼图与相框合成
 *
 * 两步纯 drawImage：
 *   1. 绘制相框蒙版（边框显示，内框透明）
 *   2. 在内框位置绘制拼图（cover-fit 到内框大小）
 *      → 用临时 canvas 裁剪到内框尺寸，防止溢出
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage 输出的拼图画布
 * @param {HTMLCanvasElement} frameMaskCanvas - createFrameMask 输出的蒙版
 * @param {{left,top,right,bottom}} bounds - 内框边界（原始图片坐标）
 * @param {number} canvasW - 输出画布宽度
 * @param {number} canvasH - 输出画布高度
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameMaskCanvas, bounds, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // 计算蒙版缩放比例
  const fw = frameMaskCanvas.width;
  const fh = frameMaskCanvas.height;
  const sx = canvasW / fw;
  const sy = canvasH / fh;

  // 计算内框在输出画布上的位置
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iw = Math.round((bounds.right - bounds.left) * sx);
  const ih = Math.round((bounds.bottom - bounds.top) * sy);
  if (iw <= 2 || ih <= 2) return;

  // ========== Step 1: 绘制相框蒙版 ==========
  ctx.drawImage(frameMaskCanvas, 0, 0, canvasW, canvasH);

  // ========== Step 2: 在内框位置绘制拼图 ==========
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzA = puzW / puzH;
  const inA = iw / ih;

  // cover-fit: 拼图填满内框（裁剪超出部分）
  let dW, dH, dX, dY;
  if (puzA > inA) {
    dW = iw;
    dH = Math.round(iw / puzA);
    dX = 0;
    dY = Math.round((ih - dH) / 2);
  } else {
    dH = ih;
    dW = Math.round(ih * puzA);
    dX = Math.round((iw - dW) / 2);
    dY = 0;
  }

  // 创建内框大小的临时 canvas，将拼图绘制上去
  const innerCanvas = document.createElement('canvas');
  innerCanvas.width = iw;
  innerCanvas.height = ih;
  const iCtx = innerCanvas.getContext('2d');
  iCtx.drawImage(puzzleCanvas, 0, 0, puzW, puzH, dX, dY, dW, dH);

  // 将内框 canvas 绘制到主画布的对应位置
  ctx.drawImage(innerCanvas, iL, iT);
}

export function clearFrameBoundsCache() {}
