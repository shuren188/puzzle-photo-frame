/**
 * 相框处理模块
 *
 * 方案：相框边框叠加法
 *   1. 输出画布尺寸 = 相框宽高比（预览尺寸）
 *   2. 绘制拼图（cover-fit 到内框区域）
 *   3. 叠加相框内框切割线纹理（multiply）
 *   4. 叠加相框边框（内框已被 destination-out 挖空）
 *
 * 这样相框边框精确覆盖在拼图之上，内框让拼图透出，永不偏移。
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
 * 将拼图与相框合成（边框叠加法）
 *
 * 步骤：
 *   1. 背景色填充画布
 *   2. 拼图 cover-fit 到内框区域（裁剪适配）
 *   3. 叠加内框切割线纹理（multiply）
 *   4. 叠加相框边框（内框挖空透明）
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage 输出的拼图画布
 * @param {string} fillColor - 背景填充色
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框坐标（原始图片像素）
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 */
export function compositeFramedImage(ctx, puzzleCanvas, fillColor, frameImg, bounds, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ---- 计算内框在画布上的像素坐标 ----
  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iR = Math.round(bounds.right * sx);
  const iB = Math.round(bounds.bottom * sy);
  const iw = iR - iL;
  const ih = iB - iT;
  if (iw <= 2 || ih <= 2) return;

  // ---- 1. 填充背景色 ----
  ctx.fillStyle = fillColor || '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ---- 2. 绘制拼图 cover-fit 到内框 ----
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzA = puzW / puzH;
  const inA = iw / ih;

  let dW, dH, dX, dY;
  if (puzA > inA) {
    // 拼图更宽 → 以宽为准填满内框，裁剪上下
    dW = iw;
    dH = Math.round(iw / puzA);
    dX = 0;
    dY = Math.round((ih - dH) / 2);
  } else {
    // 拼图更高 → 以高为准填满内框，裁剪左右
    dH = ih;
    dW = Math.round(ih * puzA);
    dX = Math.round((iw - dW) / 2);
    dY = 0;
  }

  // clip 到内框区域 + 绘制拼图
  ctx.save();
  ctx.beginPath();
  ctx.rect(iL, iT, iw, ih);
  ctx.clip();
  ctx.drawImage(puzzleCanvas, iL + dX, iT + dY, dW, dH);
  ctx.restore();

  // ---- 3. 叠加切割线纹理（multiply，仅内框区域）----
  const srcW = bounds.right - bounds.left;
  const srcH = bounds.bottom - bounds.top;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = iw;
  texCanvas.height = ih;
  const tCtx = texCanvas.getContext('2d');
  tCtx.drawImage(frameImg, bounds.left, bounds.top, srcW, srcH, 0, 0, iw, ih);

  ctx.save();
  ctx.beginPath();
  ctx.rect(iL, iT, iw, ih);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(texCanvas, iL, iT);
  ctx.restore();

  // ---- 4. 叠加相框边框（内框已挖空透明）----
  const borderCanvas = document.createElement('canvas');
  borderCanvas.width = canvasW;
  borderCanvas.height = canvasH;
  const bCtx = borderCanvas.getContext('2d');
  bCtx.drawImage(frameImg, 0, 0, canvasW, canvasH);
  bCtx.globalCompositeOperation = 'destination-out';
  bCtx.fillRect(iL, iT, iw, ih);

  ctx.drawImage(borderCanvas, 0, 0);
}

export function clearFrameBoundsCache() {}
