/**
 * 相框处理模块
 * 将拼图图片合成到相框效果图中
 *
 * 合成原理：
 *   1. 先用 renderImage 将用户图片处理成拼图图（含填充色/缩放/偏移/旋转）
 *   2. 再将拼图图片 contain-fit 到相框内框区域
 *   3. multiply 叠加切割线纹理
 */

const boundsCache = new Map();

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
  const fileMap = {
    '35片': '35.jpg', '70片': '70.jpg', '120片': '120.jpg',
    '200片': '200.jpg', '300/520片': '300.jpg',
  };
  const file = fileMap[sizeName];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}${folder}/${file}`;
}

/**
 * 边缘密度检测自动识别内框边界
 */
export function findPuzzleBounds(imageData, width, height) {
  const data = imageData.data;
  const step = Math.max(2, Math.floor(Math.min(width, height) / 400));

  const rowDensity = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0, total = 0;
    for (let x = 0; x < width - step; x += step) {
      const i1 = (y * width + x) * 4;
      const i2 = (y * width + x + step) * 4;
      if (Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]) > 50) count++;
      total++;
    }
    rowDensity[y] = total > 0 ? count / total : 0;
  }

  const colDensity = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0, total = 0;
    for (let y = 0; y < height - step; y += step) {
      const i1 = (y * width + x) * 4;
      const i2 = ((y + step) * width + x) * 4;
      if (Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]) > 50) count++;
      total++;
    }
    colDensity[x] = total > 0 ? count / total : 0;
  }

  const findFirstDense = (arr, start, end, dir) => {
    const sustain = 5;
    let i = start;
    while (dir > 0 ? i < end : i >= end) {
      let dense = 0;
      const limit = dir > 0 ? Math.min(i + sustain, end) : Math.max(i - sustain, end);
      for (let j = i; dir > 0 ? j < limit : j > limit; j += dir) {
        if (arr[j] > 0.005) dense++;
      }
      if (dense >= sustain * 0.4) return i;
      i += dir;
    }
    return dir > 0 ? end : start;
  };

  const denseRows = rowDensity.filter(d => d > 0.005).length;
  const denseCols = colDensity.filter(d => d > 0.005).length;

  let left, top, right, bottom;
  if ((denseRows / height) > 0.9 && (denseCols / width) > 0.7) {
    const mx = Math.round(width * 0.06);
    const my = Math.round(height * 0.06);
    left = mx; top = my; right = width - mx; bottom = height - my;
  } else {
    top    = findFirstDense(rowDensity, 0, height, 1);
    bottom = findFirstDense(rowDensity, height - 1, 0, -1);
    left   = findFirstDense(colDensity, 0, width, 1);
    right  = findFirstDense(colDensity, width - 1, 0, -1);
  }

  left   = Math.max(0, left);
  top    = Math.max(0, top);
  right  = Math.min(width - 1, right);
  bottom = Math.min(height - 1, bottom);

  const iw = right - left, ih = bottom - top;
  if (iw < width * 0.2 || ih < height * 0.2 || iw <= 0 || ih <= 0) {
    return {
      left: Math.round(width * 0.1), top: Math.round(height * 0.1),
      right: Math.round(width * 0.9), bottom: Math.round(height * 0.9),
    };
  }
  return { left, top, right, bottom };
}

export function getFrameBounds(frameImg) {
  const key = frameImg.src;
  if (boundsCache.has(key)) return boundsCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = frameImg.naturalWidth;
  canvas.height = frameImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);

  let bounds;
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    bounds = findPuzzleBounds(imageData, canvas.width, canvas.height);
  } catch (e) {
    const mx = Math.round(canvas.width * 0.1);
    const my = Math.round(canvas.height * 0.1);
    bounds = { left: mx, top: my, right: canvas.width - mx, bottom: canvas.height - my };
  }
  boundsCache.set(key, bounds);
  return bounds;
}

/**
 * 将已处理好的拼图图片合成到相框中
 *
 * 流程：
 *   1. 绘制完整相框到主画布
 *   2. 计算内框在画布上的位置
 *   3. 用 contain-fit 将拼图图片缩放到内框内（完整可见，不裁剪）
 *   4. multiply 叠加切割线纹理
 *
 * @param {CanvasRenderingContext2D} ctx - 输出上下文
 * @param {HTMLCanvasElement} puzzleCanvas - 已用 renderImage 处理好的拼图画布
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界（原始相片坐标）
 * @param {number} canvasW - 输出画布宽度
 * @param {number} canvasH - 输出画布高度
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameImg, bounds, canvasW, canvasH) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ---- 1. 绘制完整相框 ----
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // ---- 2. 计算内框在画布上的坐标 ----
  const scaleX = canvasW / fw;
  const scaleY = canvasH / fh;
  const iL = Math.round(bounds.left * scaleX);
  const iT = Math.round(bounds.top * scaleY);
  const iR = Math.round(bounds.right * scaleX);
  const iB = Math.round(bounds.bottom * scaleY);
  const iw = iR - iL;
  const ih = iB - iT;
  if (iw <= 2 || ih <= 2) return;

  // ---- 3. 离屏画布 — 拼图图片 contain-fit 到内框 ----
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzAspect = puzW / puzH;
  const innerAspect = iw / ih;

  // contain-fit: 拼图完整显示在内框内（不裁剪）
  let dW, dH, dX, dY;
  if (puzAspect > innerAspect) {
    // 拼图更宽 → 以宽为准
    dW = iw;
    dH = iw / puzAspect;
    dX = 0;
    dY = (ih - dH) / 2;
  } else {
    // 拼图更高 → 以高为准
    dH = ih;
    dW = ih * puzAspect;
    dX = (iw - dW) / 2;
    dY = 0;
  }

  // ---- 4. 离屏画布 — 拼图叠加上内框纹理（切割线） ----
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = iw;
  layerCanvas.height = ih;
  const lCtx = layerCanvas.getContext('2d');

  // 先填充亮色（multiply 时白色不改变下方）
  lCtx.fillStyle = '#FFFFFF';
  lCtx.fillRect(0, 0, iw, ih);

  // 绘制拼图（contain-fit 到内框大小）
  lCtx.drawImage(puzzleCanvas, 0, 0, puzW, puzH, dX, dY, dW, dH);

  // 截取相框内框纹理（切割线）
  const fiCanvas = document.createElement('canvas');
  fiCanvas.width = iw;
  fiCanvas.height = ih;
  const fiCtx = fiCanvas.getContext('2d');
  fiCtx.drawImage(frameImg,
    bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    0, 0, iw, ih
  );

  // multiply 叠加切割线
  lCtx.globalCompositeOperation = 'multiply';
  lCtx.drawImage(fiCanvas, 0, 0);
  lCtx.globalCompositeOperation = 'source-over';

  // ---- 5. 绘制到主画布的内框区域 ----
  ctx.drawImage(layerCanvas, iL, iT);
}

export function clearFrameBoundsCache() {
  boundsCache.clear();
}
