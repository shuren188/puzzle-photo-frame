/**
 * 相框处理模块
 *
 * 方案：蒙版预处理 + 两层 drawImage
 *
 * 预处理阶段（相框加载时）：
 *   - 将相框图片绘制到离屏 canvas
 *   - 内框区域像素 alpha 设为 0（透明）
 *   - 保存为 frameMaskCanvas
 *
 * 合成阶段（预览渲染时）：
 *   - Step 1: drawImage(puzzleCanvas) → 绘制完整拼图
 *   - Step 2: drawImage(frameMaskCanvas) → 覆盖相框（内框透明让拼图透出）
 *
 * 优势：不依赖任何 compositing 模式，纯两个 drawImage
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
 *
 * 将相框图片中内框区域的 alpha 设为 0，
 * 这样直接绘制在拼图上方时，内框透明让拼图透出，
 * 边框覆盖在拼图之上。
 *
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界
 * @returns {HTMLCanvasElement} 预处理后的蒙版 canvas
 */
export function createFrameMask(frameImg, bounds) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = fw;
  canvas.height = fh;
  const ctx = canvas.getContext('2d');

  // 绘制相框
  ctx.drawImage(frameImg, 0, 0);

  // 获取像素数据
  const imageData = ctx.getImageData(0, 0, fw, fh);
  const data = imageData.data;

  // 将内框区域的 alpha 设为 0（透明）
  const iL = bounds.left;
  const iT = bounds.top;
  const iR = bounds.right;
  const iB = bounds.bottom;

  for (let y = iT; y < iB; y++) {
    for (let x = iL; x < iR; x++) {
      const idx = (y * fw + x) * 4 + 3; // alpha channel
      data[idx] = 0;
    }
  }

  // 写回
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * 将拼图与相框合成
 *
 * 两步法（不依赖任何复合模式）：
 *   1. 绘制拼图（cover-fit 到画布，按内框比例填充）
 *   2. 绘制相框蒙版（内框透明，边框覆盖在拼图上）
 *
 * @param {CanvasRenderingContext2D} ctx - 输出上下文
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage 输出的拼图画布
 * @param {HTMLCanvasElement} frameMaskCanvas - createFrameMask 输出的蒙版 canvas
 * @param {{left,top,right,bottom}} bounds - 内框边界
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameMaskCanvas, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ---- Step 1: 绘制拼图（铺满整个画布，只显示内框部分） ----
  // 拼图尺寸按内框比例 cover-fit 到画布大小
  // 这样拼图会填满内框区域，画布其他部分会被后续的相框覆盖
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzA = puzW / puzH;
  const canvasA = canvasW / canvasH;

  let dW, dH, dX, dY;
  if (puzA > canvasA) {
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

  // ---- Step 2: 绘制相框蒙版（内框透明） ----
  // 缩放到 canvas 尺寸，直接盖在拼图上
  ctx.drawImage(frameMaskCanvas, 0, 0, canvasW, canvasH);
}

/**
 * 计算用于蒙版的画布上内框对应的裁剪区域（原始像素坐标）
 * 用于 renderFramedPreview 中确定 puzzleCanvas 的尺寸
 */
export function getMaskInnerSize(frameMaskCanvas, bounds, canvasW, canvasH) {
  const fw = frameMaskCanvas.width;
  const fh = frameMaskCanvas.height;
  return {
    left: Math.round(bounds.left * canvasW / fw),
    top: Math.round(bounds.top * canvasH / fh),
    right: Math.round(bounds.right * canvasW / fw),
    bottom: Math.round(bounds.bottom * canvasH / fh),
  };
}

export function clearFrameBoundsCache() {}
