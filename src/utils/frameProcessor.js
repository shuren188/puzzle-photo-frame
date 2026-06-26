/**
 * 相框处理模块
 *
 * 方案：直接合成法
 *   不经过 renderImage 中间步骤，把用户原图直接绘制到相框内框
 *
 *   1. 相框全图铺底（边框+白板+切割线）
 *   2. 用户原图 cover-fitted 直接绘制到内框区域（替换白板）
 *   3. 切割线纹理 overlay 叠加保持可见
 *   4. 边框（内框挖空）盖在最顶层确保边框不受影响
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
 * 将用户图片直接合成到相框（不经过中间拼图步骤）
 *
 * @param {CanvasRenderingContext2D} ctx - 输出上下文
 * @param {HTMLImageElement} userImg - 用户原始图片
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框坐标
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 */
export function compositeFramedDirect(ctx, userImg, frameImg, bounds, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iw = Math.round((bounds.right - bounds.left) * sx);
  const ih = Math.round((bounds.bottom - bounds.top) * sy);
  if (iw <= 2 || ih <= 2) return;
  const iR = iL + iw;
  const iB = iT + ih;

  // ============ 第一步：相框边框（内框挖空）============
  const borderCanvas = document.createElement('canvas');
  borderCanvas.width = canvasW;
  borderCanvas.height = canvasH;
  const bCtx = borderCanvas.getContext('2d');
  bCtx.drawImage(frameImg, 0, 0, canvasW, canvasH);
  bCtx.globalCompositeOperation = 'destination-out';
  bCtx.fillRect(iL, iT, iw, ih);
  bCtx.globalCompositeOperation = 'source-over';

  // ============ 第二步：计算内框在相框原图的纹理区域 ============
  const texCanvas = document.createElement('canvas');
  texCanvas.width = iw;
  texCanvas.height = ih;
  const tCtx = texCanvas.getContext('2d');
  tCtx.drawImage(frameImg,
    bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    0, 0, iw, ih
  );

  // ============ 第三步：合成到主画布 ============
  // a) 绘制边框
  ctx.drawImage(borderCanvas, 0, 0);

  // b) 在内框区域绘制用户图片（cover-fitted）
  const iAspect = iw / ih;
  const uW = userImg.naturalWidth;
  const uH = userImg.naturalHeight;
  const uAspect = uW / uH;

  let srcX, srcY, srcW, srcH;
  if (uAspect > iAspect) {
    srcH = uH;
    srcW = Math.round(uH * iAspect);
    srcX = Math.round((uW - srcW) / 2);
    srcY = 0;
  } else {
    srcW = uW;
    srcH = Math.round(uW / iAspect);
    srcX = 0;
    srcY = Math.round((uH - srcH) / 2);
  }

  // clip 到内框区域再绘制用户图片
  ctx.save();
  ctx.beginPath();
  ctx.rect(iL, iT, iw, ih);
  ctx.clip();
  ctx.drawImage(userImg, srcX, srcY, srcW, srcH, iL, iT, iw, ih);
  ctx.restore();

  // c) 在内框区域叠加切割线纹理（multiply）
  ctx.save();
  ctx.beginPath();
  ctx.rect(iL, iT, iw, ih);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(texCanvas, iL, iT);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

export function clearFrameBoundsCache() {}
