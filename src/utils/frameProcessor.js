/**
 * 相框处理模块 v3.2.0
 *
 * 不做任何图像分析，只做模板合成。
 *
 * renderFramed() 流程：
 *   1. 绘制 frame.jpg 作为背景（保留所有质感：木纹、阴影、玻璃、AO）
 *   2. clip 到内框区域
 *   3. drawImage(cropCanvas) — 拼图与内框比例相同，直接拉伸填满
 *   4. 完成
 *
 * 没有 getImageData / putImageData / brightness / alpha / createWoodFrame / createPuzzleLines
 * 没有像素级操作，没有图层分离。
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

export function getFrameBounds(sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  if (!BOUNDS_MAP[key]) {
    throw new Error(`缺少相框配置: ${key}，请检查 BOUNDS_MAP`);
  }
  return BOUNDS_MAP[key];
}

/**
 * 渲染带相框的效果图
 *
 * 不做任何图像分析、图层分离、像素操作。
 * 只是把 cropCanvas "贴"到相框模板的内框区域。
 *
 * @param {CanvasRenderingContext2D} ctx - 输出画布上下文
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 * @param {HTMLCanvasElement} cropCanvas - renderImage 已完成的拼图画布
 * @param {HTMLImageElement} frameImg - 相框图片（原始 JPG，不预处理）
 * @param {{left,top,right,bottom}} bounds - 内框边界
 */
export function renderFramed(ctx, canvasW, canvasH, cropCanvas, frameImg, bounds) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // 1. 绘制相框全图作为背景（保留全部质感）
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // 2. 计算内框在画布上的坐标
  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iw = Math.round((bounds.right - bounds.left) * sx);
  const ih = Math.round((bounds.bottom - bounds.top) * sy);

  if (iw < 2 || ih < 2) return;

  // 3. clip 到内框区域，绘制拼图
  // 拼图(cropCanvas)与内框比例相同，直接拉伸填满
  ctx.save();
  ctx.beginPath();
  ctx.rect(iL, iT, iw, ih);
  ctx.clip();
  ctx.drawImage(cropCanvas, iL, iT, iw, ih);
  ctx.restore();
}
