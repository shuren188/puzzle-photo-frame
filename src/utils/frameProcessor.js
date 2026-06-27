/**
 * 相框预览模块 v8.0.0
 *
 * 核心原则：所有尺寸硬编码，零缩放、零计算
 *
 * 每个相框的：
 *   - frameWidth / frameHeight = PNG 原始像素尺寸
 *   - holeX / holeY = 内框左上角坐标
 *   - holeWidth / holeHeight = 内框像素尺寸
 *
 * puzzleCanvas 直接生成 holeWidth × holeHeight
 * drawImage(puzzleCanvas, holeX, holeY) — 3参数，零缩放
 * canvas 尺寸 = frameWidth × frameHeight
 * drawImage(frame, 0, 0) — 3参数，零缩放
 */

import { renderImage } from './imageProcessor.js';

const FILE_MAP = {
  '35片': '35.png', '70片': '70.png', '120片': '120.png',
  '200片': '200.png', '300/520片': '300.png',
};

const FRAME_INFO = {
  'true_35片':  { frameW: 2276, frameH: 1696, holeX: 268, holeY: 230, holeW: 1921, holeH: 1461 },
  'true_70片':  { frameW: 2346, frameH: 1792, holeX: 310, holeY: 244, holeW: 1903, holeH: 1453 },
  'true_120片': { frameW: 2304, frameH: 1856, holeX: 262, holeY: 198, holeW: 1939, holeH: 1593 },
  'true_200片': { frameW: 2348, frameH: 1728, holeX: 2,   holeY: 156, holeW: 2309, holeH: 1489 },
  'true_300/520片':  { frameW: 2293, frameH: 1696, holeX: 28,  holeY: 146, holeW: 2110, holeH: 1519 },
  'false_35片': { frameW: 1792, frameH: 2400, holeX: 260, holeY: 372, holeW: 1465, holeH: 2021 },
  'false_70片': { frameW: 1792, frameH: 2400, holeX: 266, holeY: 354, holeW: 1451, holeH: 1715 },
  'false_120片':{ frameW: 1792, frameH: 2400, holeX: 152, holeY: 256, holeW: 1555, holeH: 2041 },
  'false_200片':{ frameW: 1792, frameH: 2400, holeX: 180, holeY: 202, holeW: 1535, holeH: 2141 },
  'false_300/520片': { frameW: 1792, frameH: 2400, holeX: 26,  holeY: 182, holeW: 1605, holeH: 2213 },
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

export function getFrameInfo(sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  const info = FRAME_INFO[key];
  if (!info) throw new Error(`缺少相框配置: ${key}`);
  return info;
}

/**
 * 生成拼图画布（唯二调用 renderImage 的地方）
 * w, h 直接传入 info.holeW, info.holeH
 */
export function buildPuzzleCanvas(img, w, h, opts) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  renderImage(canvas.getContext('2d'), img, canvas.width, canvas.height, opts);
  return canvas;
}

/**
 * 最终合成：两个 3-参数 drawImage，零缩放
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} puzzleCanvas - 尺寸 = holeW × holeH
 * @param {HTMLImageElement} frameImg - 相框 PNG
 * @param {{frameW,frameH,holeX,holeY,holeW,holeH}} info - FRAME_INFO
 */
export function renderFrame(ctx, puzzleCanvas, frameImg, info) {
  // Canvas = 相框原始尺寸（像素级精准）
  ctx.canvas.width = info.frameW;
  ctx.canvas.height = info.frameH;

  // drawImage 1: 拼图直接贴入洞口（3参数，零缩放）
  // puzzleCanvas 尺寸 = holeW × holeH（完全匹配）
  ctx.drawImage(puzzleCanvas, info.holeX, info.holeY);

  // drawImage 2: 透明PNG相框覆盖（3参数，零缩放）
  ctx.drawImage(frameImg, 0, 0);
}
