/**
 * 相框处理模块
 *
 * 技术方案：Canvas 分层合成法
 *   1. 主画布：绘制完整相框
 *   2. 用 destination-out 切掉内框区域（形成透明窗口）
 *   3. 离屏画布：绘制拼图（cover-fitted 到内框大小）
 *   4. 用 multiply 叠加相框内框的切割线纹理
 *   5. 将离屏画布绘制到主画布的内框窗口位置
 *
 * 此方案利用 Canvas 原生 composite 操作，GPU 加速，不涉及像素级操作。
 */

/** 图片文件映射 */
const FILE_MAP = {
  '35片': '35.jpg', '70片': '70.jpg', '120片': '120.jpg',
  '200片': '200.jpg', '300/520片': '300.jpg',
};

/** 预定义内框边界（基于 Python 逐像素分析，单位：原始相框图片像素） */
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

/**
 * 获取相框内框边界
 */
export function getFrameBounds(frameImg, sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  const predef = BOUNDS_MAP[key];
  if (predef) return predef;

  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  return {
    left: Math.round(w * 0.12),
    top: Math.round(h * 0.14),
    right: Math.round(w * 0.94),
    bottom: Math.round(h * 0.96),
  };
}

/**
 * 将拼图合成到相框
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage 输出的拼图画布
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameImg, bounds, canvasW, canvasH) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ---- 计算内框在画布上的像素坐标 ----
  const scaleX = canvasW / fw;
  const scaleY = canvasH / fh;
  const iL = Math.round(bounds.left * scaleX);
  const iT = Math.round(bounds.top * scaleY);
  const iR = Math.round(bounds.right * scaleX);
  const iB = Math.round(bounds.bottom * scaleY);
  const iw = iR - iL;
  const ih = iB - iT;
  if (iw <= 2 || ih <= 2) return;

  // ==================== 主画布层 ====================
  // 1. 绘制完整相框
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // 2. 切掉内框（形成透明窗口）
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(iL, iT, iw, ih);
  ctx.globalCompositeOperation = 'source-over';

  // ==================== 拼图层（离屏）====================
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzAspect = puzW / puzH;
  const innerAspect = iw / ih;

  // cover-fit: 拼图填满内框（裁剪超出部分）
  let dX, dY, dW, dH;
  if (puzAspect > innerAspect) {
    // 拼图更宽 → 以宽度为准，裁剪上下
    dW = iw;
    dH = iw / puzAspect;
    dX = 0;
    dY = Math.round((ih - dH) / 2);
  } else {
    // 拼图更高 → 以高度为准，裁剪左右
    dH = ih;
    dW = ih * puzAspect;
    dX = Math.round((iw - dW) / 2);
    dY = 0;
  }

  // 创建拼图层
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = iw;
  layerCanvas.height = ih;
  const lCtx = layerCanvas.getContext('2d');

  // 绘制拼图（cover-fit 到内框大小）
  lCtx.drawImage(puzzleCanvas, 0, 0, puzW, puzH, dX, dY, dW, dH);

  // 截取相框内框纹理
  const texCanvas = document.createElement('canvas');
  texCanvas.width = iw;
  texCanvas.height = ih;
  const tCtx = texCanvas.getContext('2d');
  tCtx.drawImage(frameImg,
    bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    0, 0, iw, ih
  );

  // 用 multiply 叠加切割线
  lCtx.globalCompositeOperation = 'multiply';
  lCtx.drawImage(texCanvas, 0, 0);
  lCtx.globalCompositeOperation = 'source-over';

  // ==================== 将拼图层绘制到主画布的内框窗口 ====================
  ctx.drawImage(layerCanvas, iL, iT);
}

export function clearFrameBoundsCache() {}
