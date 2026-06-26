/**
 * 相框处理模块
 * 将拼图图片合成到相框效果图中
 *
 * 合成原理：
 *   1. 绘制相框到主画布
 *   2. 计算内框区域在画布上的位置
 *   3. 离屏画布 A：将用户图片 cover-fit 到内框大小
 *   4. 离屏画布 B：截取相框内框的切割线纹理
 *   5. multiply 混合 B→A：保留切割线，白板区域透出用户图片
 *   6. 将 A 绘制到主画布的内框位置（覆盖白板，保留边框）
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

  // 行边缘密度
  const rowDensity = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0, total = 0;
    for (let x = 0; x < width - step; x += step) {
      const i1 = (y * width + x) * 4;
      const i2 = (y * width + x + step) * 4;
      const diff = Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]);
      if (diff > 50) count++;
      total++;
    }
    rowDensity[y] = total > 0 ? count / total : 0;
  }

  // 列边缘密度
  const colDensity = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0, total = 0;
    for (let y = 0; y < height - step; y += step) {
      const i1 = (y * width + x) * 4;
      const i2 = ((y + step) * width + x) * 4;
      const diff = Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]);
      if (diff > 50) count++;
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
 * 将用户图片合成到相框中
 *
 * 按以下步骤正确合成：
 *   1. 主画布：绘制完整相框
 *   2. 计算内框在画布上的像素坐标
 *   3. 从原始用户图片（puzzleSource = HTMLImageElement）直接 cover-fit 绘制到内框大小
 *      → 避免经过 renderImage 的 pad 中间步骤导致的对齐问题
 *   4. 叠加相框内框的切割线纹理（multiply 混合模式）
 *   5. 将带纹理的用户图片绘制到主画布的内框区域
 *
 * @param {CanvasRenderingContext2D} ctx - 输出上下文
 * @param {HTMLImageElement} userImage - 用户原始图片元素（直接使用，不经过 renderImage）
 * @param {object} imgState - 渲染参数 { zoom, offsetX, offsetY, rotation, fillColor }
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界（原始相片坐标）
 * @param {number} canvasW - 输出画布宽度
 * @param {number} canvasH - 输出画布高度
 */
export function compositeFramedImage(ctx, userImage, imgState, frameImg, bounds, canvasW, canvasH) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ---- 步骤 1: 绘制完整相框 ----
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // ---- 步骤 2: 计算内框在画布上的坐标 ----
  const scaleX = canvasW / fw;
  const scaleY = canvasH / fh;
  const iL = Math.round(bounds.left * scaleX);
  const iT = Math.round(bounds.top * scaleY);
  const iw = Math.round((bounds.right - bounds.left) * scaleX);
  const ih = Math.round((bounds.bottom - bounds.top) * scaleY);
  if (iw <= 2 || ih <= 2) return;

  // ---- 步骤 3: 离屏画布 — 用户图片（cover-fit 到内框） ----
  // 直接从用户原始图绘制，考虑 zoom/offset/rotation
  const uCanvas = document.createElement('canvas');
  uCanvas.width = iw;
  uCanvas.height = ih;
  const uCtx = uCanvas.getContext('2d');

  // 先填充背景色（极暗色，multiply 后不影响）
  uCtx.fillStyle = '#000000';
  uCtx.fillRect(0, 0, iw, ih);

  // 计算 cover-fit：用户图片适配内框
  const imgW = userImage.naturalWidth;
  const imgH = userImage.naturalHeight;
  const imgAspect = imgW / imgH;
  const innerAspect = iw / ih;

  let drawW, drawH, drawX, drawY;
  if (imgAspect > innerAspect) {
    drawH = ih;
    drawW = ih * imgAspect;
    drawX = (iw - drawW) / 2;
    drawY = 0;
  } else {
    drawW = iw;
    drawH = iw / imgAspect;
    drawX = 0;
    drawY = (ih - drawH) / 2;
  }

  // 应用 zoom
  const zoomFactor = (imgState.zoom || 100) / 100;
  const zoomedW = drawW * zoomFactor;
  const zoomedH = drawH * zoomFactor;
  let zDrawX = drawX - (zoomedW - drawW) / 2;
  let zDrawY = drawY - (zoomedH - drawH) / 2;

  // 应用 offset（百分比 → 像素）
  const maxOffX = (zoomedW - iw) / 2;
  const maxOffY = (zoomedH - ih) / 2;
  zDrawX -= maxOffX * (imgState.offsetX || 0) / 100;
  zDrawY -= maxOffY * (imgState.offsetY || 0) / 100;

  // 旋转
  const rotation = (imgState.rotation || 0) % 360;
  let needsRotation = rotation !== 0;

  if (needsRotation) {
    uCtx.save();
    uCtx.translate(iw / 2, ih / 2);
    uCtx.rotate(rotation * Math.PI / 180);
    uCtx.translate(-iw / 2, -ih / 2);
  }

  uCtx.drawImage(userImage, zDrawX, zDrawY, zoomedW, zoomedH);

  if (needsRotation) {
    uCtx.restore();
  }

  // ---- 步骤 4: 从相框截取内框纹理（含切割线）并 multiply 叠加 ----
  const fiCanvas = document.createElement('canvas');
  fiCanvas.width = iw;
  fiCanvas.height = ih;
  const fiCtx = fiCanvas.getContext('2d');
  fiCtx.drawImage(frameImg,
    bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    0, 0, iw, ih
  );

  uCtx.save();
  uCtx.globalCompositeOperation = 'multiply';
  uCtx.drawImage(fiCanvas, 0, 0);
  uCtx.restore();

  // ---- 步骤 5: 将合成结果绘制到主画布的内框区域 ----
  ctx.drawImage(uCanvas, iL, iT);
}

export function clearFrameBoundsCache() {
  boundsCache.clear();
}
