/**
 * 相框预览模块 v4.0.0
 *
 * 唯一职责：把已完成的 cropCanvas 贴进透明PNG相框
 *
 * 渲染流程（固定3步，不做任何图片分析）：
 *   ① 设置画布尺寸
 *   ② 绘制 cropCanvas 到内框区域（坐标来自固定配置）
 *   ③ 绘制透明PNG相框（最上层，内框透明让 cropCanvas 透出）
 *
 * 没有：getImageData / putImageData / brightness / alpha / contain / cover / fit
 */

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
 * 计算内框在画布上的像素坐标和尺寸
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框坐标
 * @returns {{ iL: number, iT: number, iw: number, ih: number }}
 */
/** @package */
export function calcInnerRect(canvasW, canvasH, frameImg, bounds) {
  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  return {
    iL: Math.round(bounds.left * sx),
    iT: Math.round(bounds.top * sy),
    iw: Math.round((bounds.right - bounds.left) * sx),
    ih: Math.round((bounds.bottom - bounds.top) * sy),
  };
}

/**
 * 渲染带相框的效果图
 *
 * 使用九参数 drawImage 将整个 cropCanvas（包括白边）
 * 完整映射到相框内框区域。
 *
 * @param {CanvasRenderingContext2D} ctx - 输出画布上下文
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 * @param {HTMLCanvasElement} cropCanvas - renderImage 输出的已完成拼图
 * @param {HTMLImageElement} frameImg - 透明PNG相框图片
 * @param {{left,top,right,bottom}} bounds - 内框坐标
 */
export function renderFramed(ctx, canvasW, canvasH, cropCanvas, frameImg, bounds) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  const { iL, iT, iw, ih } = calcInnerRect(canvasW, canvasH, frameImg, bounds);
  if (iw < 2 || ih < 2) return;

  // 九参数 drawImage：将整个 cropCanvas（0,0 到宽高）拉伸映射到内框区域
  // 确保 renderImage 输出的全部内容（照片+白边+填充色）完整显示
  ctx.drawImage(
    cropCanvas,
    0, 0, cropCanvas.width, cropCanvas.height,
    iL, iT, iw, ih
  );

  // 绘制透明PNG相框（内框透明，让 cropCanvas 透出）
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);
}
