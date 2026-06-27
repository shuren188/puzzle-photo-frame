/**
 * 相框预览模块 v7.0.0
 *
 * 核心原则：
 *   - PuzzleCanvas 尺寸 = 内框自然像素尺寸（如 1465×2021）
 *   - 输出 Canvas 尺寸 = PNG 原始尺寸
 *   - drawImage 全部使用 3 参数（零缩放）
 *   - CSS 控制视觉显示大小
 *
 * 函数：
 *   loadFrameImage()       — 加载相框 PNG
 *   getFrameUrl()          — 获取相框 URL
 *   getFrameBounds()       — 获取内框坐标
 *   buildPuzzleCanvas()    — 唯二调用 renderImage 的地方
 *   getNaturalInnerSize()  — 获取内框自然像素宽高
 *   renderFrame()          — 两个 3-param drawImage
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
 * 生成拼图画布（唯二调用 renderImage 的地方）
 * @param {HTMLImageElement} img
 * @param {number} w - 宽度（像素）
 * @param {number} h - 高度（像素）
 * @param {object} opts - zoom/offsetX/offsetY/rotation/fillColor
 * @returns {HTMLCanvasElement}
 */
export function buildPuzzleCanvas(img, w, h, opts) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  renderImage(canvas.getContext('2d'), img, canvas.width, canvas.height, opts);
  return canvas;
}

/**
 * 获取内框自然像素尺寸
 * 用于 buildPuzzleCanvas 的 w, h 参数
 */
export function getNaturalInnerSize(bounds) {
  return {
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

/**
 * 最终合成：拼图 + 相框
 * 全部使用 3 参数 drawImage（零缩放）
 *
 * Canvas 尺寸 = PNG 原始尺寸
 * drawImage(puzzle, left, top) — puzzle 尺寸 = 内框自然尺寸
 * drawImage(frame, 0, 0) — frame 尺寸 = PNG 原始尺寸
 */
export function renderFrame(ctx, puzzleCanvas, frameImg, bounds) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  ctx.canvas.width = fw;
  ctx.canvas.height = fh;

  // Step 1: 拼图直接贴入内框（3参数，零缩放）
  ctx.drawImage(puzzleCanvas, bounds.left, bounds.top);

  // Step 2: 透明PNG相框覆盖（3参数，零缩放）
  ctx.drawImage(frameImg, 0, 0);
}
