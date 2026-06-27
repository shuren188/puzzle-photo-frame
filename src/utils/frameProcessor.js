/**
 * 相框处理模块 v3.1.0
 *
 * 遵循 GPT 建议的核心原则：
 *   renderFramed() 不参与图片裁剪，只接收已完成的 cropCanvas
 *
 * 预处理（相框加载时一次性生成两个叠加层）：
 *   1. woodFrame — 木框（内框完全透明，边框保留）
 *   2. puzzleLines — 拼图切割线纹理（内框暗线保留，白板透明）
 *
 * 渲染（每次重绘，严格5步）：
 *   ① 填充背景色
 *   ② renderImage() → cropCanvas（拼图已裁剪完成）
 *   ③ cropCanvas contain-fit 到内框区域（完整显示，不裁剪）
 *   ④ source-over 叠加 puzzleLines（切割线呈现在照片上）
 *   ⑤ source-over 叠加 woodFrame（木框覆盖最上层）
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
 * 预处理1：生成木框叠加层（内框完全透明）
 * @param {HTMLImageElement} frameImg
 * @param {{left,top,right,bottom}} bounds
 * @returns {HTMLCanvasElement}
 */
export function createWoodFrame(frameImg, bounds) {
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // 内框区域全部设为透明
  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) {
      data[(y * w + x) * 4 + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 预处理2：生成拼图切割线纹理（内框暗线保留，白板透明）
 * @param {HTMLImageElement} frameImg
 * @param {{left,top,right,bottom}} bounds
 * @returns {HTMLCanvasElement} 尺寸 = 内框尺寸
 */
export function createPuzzleLines(frameImg, bounds) {
  const iw = bounds.right - bounds.left;
  const ih = bounds.bottom - bounds.top;
  const canvas = document.createElement('canvas');
  canvas.width = iw;
  canvas.height = ih;
  const ctx = canvas.getContext('2d');

  // 截取相框内框区域
  ctx.drawImage(frameImg, bounds.left, bounds.top, iw, ih, 0, 0, iw, ih);

  // 处理像素：暗色切割线保留，亮色白板变透明
  const imageData = ctx.getImageData(0, 0, iw, ih);
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

    if (brightness >= 180) {
      // 白板/亮色 → 完全透明（不影响下方照片）
      data[i + 3] = 0;
    } else if (brightness <= 60) {
      // 深色切割线 → 保留原色，完全不透明
      data[i + 3] = 255;
    } else {
      // 过渡区 → 按亮度渐变透明度，颜色不变
      const alpha = Math.round(255 * (1 - (brightness - 60) / 120));
      data[i + 3] = Math.max(0, Math.min(255, alpha));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 渲染带相框的效果图
 *
 * 严格遵循5步流程，不参与任何图片裁剪计算。
 * 只接收已完成的 cropCanvas 进行包装。
 *
 * @param {CanvasRenderingContext2D} ctx - 输出画布上下文
 * @param {number} canvasW - 输出画布宽度
 * @param {number} canvasH - 输出画布高度
 * @param {HTMLCanvasElement} cropCanvas - 已完成的拼图画布（renderImage 输出）
 * @param {string} fillColor - 背景填充色
 * @param {HTMLCanvasElement} woodFrame - 木框叠加层
 * @param {HTMLCanvasElement} puzzleLines - 拼图切割线纹理
 * @param {{left,top,right,bottom}} bounds - 内框边界
 */
export function renderFramed(ctx, canvasW, canvasH, cropCanvas, fillColor, woodFrame, puzzleLines, bounds) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ========== ① 填充背景色 ==========
  ctx.fillStyle = fillColor || '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // ========== 计算内框在画布上的位置 ==========
  const fw = woodFrame.width;
  const fh = woodFrame.height;
  const sx = canvasW / fw;
  const sy = canvasH / fh;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iw = Math.round((bounds.right - bounds.left) * sx);
  const ih = Math.round((bounds.bottom - bounds.top) * sy);

  if (iw < 2 || ih < 2) {
    // 内框太小，只画木框
    ctx.drawImage(woodFrame, 0, 0, canvasW, canvasH);
    return;
  }

  // ========== ③ cropCanvas contain-fit 到内框 ==========
  // 注：cropCanvas 是已完成裁剪的拼图，必须完整显示
  const cW = cropCanvas.width;
  const cH = cropCanvas.height;
  const cA = cW / cH;
  const iA = iw / ih;

  let dW, dH, dX, dY;
  if (cA > iA) {
    // 拼图比内框更宽 → 以宽度为准（完整显示宽度）
    dW = iw;
    dH = Math.round(iw / cA);
    dX = 0;
    dY = Math.round((ih - dH) / 2);
  } else {
    // 拼图比内框更高 → 以高度为准（完整显示高度）
    dH = ih;
    dW = Math.round(ih * cA);
    dX = Math.round((iw - dW) / 2);
    dY = 0;
  }

  ctx.drawImage(cropCanvas, iL + dX, iT + dY, dW, dH);

  // ========== ④ source-over 叠加拼图切割线纹理 ==========
  // puzzleLines 尺寸 = 内框原始尺寸，需要缩放到当前画布的内框大小
  ctx.drawImage(puzzleLines, iL, iT, iw, ih);

  // ========== ⑤ source-over 叠加木框（内框透明）==========
  ctx.drawImage(woodFrame, 0, 0, canvasW, canvasH);
}

export function clearFrameBoundsCache() {}
