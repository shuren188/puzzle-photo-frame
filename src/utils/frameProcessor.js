/**
 * 相框预览模块 v6.0.0
 *
 * 只做一件事：把已完成的拼图放进透明PNG相框
 */

import { renderImage } from './imageProcessor.js';

const FILE_MAP = {
  '35片': '35.png', '70片': '70.png', '120片': '120.png',
  '200片': '200.png', '300/520片': '300.png',
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

export function getFrameBounds(sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  const bounds = BOUNDS_MAP[key];
  if (!bounds) throw new Error(`缺少相框内框坐标配置: ${key}`);
  return bounds;
}

/**
 * 生成拼图画布（唯一调用 renderImage 的地方）
 * 预览和相框模式共用此函数
 */
export function buildPuzzleCanvas(img, w, h, opts) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  renderImage(canvas.getContext('2d'), img, w, h, opts);
  return canvas;
}

/**
 * 计算内框在画布上的坐标（纯浮点，不取整）
 */
export function calcInnerRect(canvasW, canvasH, frameNaturalW, frameNaturalH, bounds) {
  const sx = canvasW / frameNaturalW;
  const sy = canvasH / frameNaturalH;
  return {
    left: bounds.left * sx,
    top: bounds.top * sy,
    width: (bounds.right - bounds.left) * sx,
    height: (bounds.bottom - bounds.top) * sy,
  };
}

/**
 * 最终合成：两个 drawImage
 * 不做任何图片编辑、缩放计算、比例适配
 */
export function renderFrame(ctx, canvasW, canvasH, puzzleCanvas, frameImg, innerRect) {
  ctx.canvas.width = Math.round(canvasW);
  ctx.canvas.height = Math.round(canvasH);

  // drawImage 1: 拼图完整映射到内框区域
  ctx.drawImage(
    puzzleCanvas,
    0, 0, puzzleCanvas.width, puzzleCanvas.height,
    innerRect.left, innerRect.top, innerRect.width, innerRect.height
  );

  // drawImage 2: 透明PNG相框覆盖
  ctx.drawImage(frameImg, 0, 0, ctx.canvas.width, ctx.canvas.height);
}
