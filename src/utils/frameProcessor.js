/**
 * 相框处理模块
 * 将拼图图片合成到相框效果图中
 *
 * 核心流程：
 * 1. 加载对应尺寸和方向的相框图片
 * 2. 自动检测相框内框（拼图区域）边界（基于拼图切割线边缘检测）
 * 3. 将用户拼图图片合成到内框区域，保留相框中的拼图切割线纹理
 */

/** 拼图切割线检测阈值 */
const EDGE_THRESHOLD = 28;
/** 内框检测 — 边缘密度阈值 */
const EDGE_DENSITY_THRESHOLD = 0.006;
/** 内框检测 — 持续确认行数 */
const SUSTAINED_MIN = 8;
/** 拼图白板亮度阈值 — 高于此值视为"白板表面" */
const BOARD_BRIGHTNESS = 200;

/** 缓存已检测的内框边界 */
const boundsCache = new Map();

/**
 * 加载相框图片
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
export function loadFrameImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载相框失败: ${url}`));
    img.src = url;
  });
}

/**
 * 获取对应尺寸和方向的相框图片 URL
 * @param {string} sizeName
 * @param {boolean} isLandscape
 * @returns {string|null}
 */
export function getFrameUrl(sizeName, isLandscape) {
  const folder = isLandscape ? '带框效果图-横版' : '带框效果图-竖版';
  const fileMap = {
    '35片': '35（10x15）.jpg',
    '70片': '70（15x20）.jpg',
    '120片': '120（20x25）.jpg',
    '200片': '200（21x30）.jpg',
    '300/520片': '300和520（26x38）.jpg',
  };
  const file = fileMap[sizeName];
  return file ? `/${folder}/${file}` : null;
}

/**
 * 通过边缘检测自动识别相框的内框（拼图区域）边界
 * 原理：拼图切割线会产生密集边缘，相框边框区域相对平滑
 */
export function findPuzzleBounds(imageData, width, height) {
  const data = imageData.data;
  const getBrightness = (x, y) => {
    const i = (y * width + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  const step = width > 2000 ? 3 : 2;

  // 计算每行的水平边缘密度
  const rowDensity = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0, total = 0;
    for (let x = 0; x < width - step; x += step) {
      if (Math.abs(getBrightness(x, y) - getBrightness(x + step, y)) > EDGE_THRESHOLD) count++;
      total++;
    }
    rowDensity[y] = total > 0 ? count / total : 0;
  }

  // 计算每列的垂直边缘密度
  const colDensity = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0, total = 0;
    for (let y = 0; y < height - step; y += step) {
      if (Math.abs(getBrightness(x, y) - getBrightness(x, y + step)) > EDGE_THRESHOLD) count++;
      total++;
    }
    colDensity[x] = total > 0 ? count / total : 0;
  }

  // 找到连续的边缘密集区域边界
  const findBoundary = (arr, start, end, dir) => {
    let i = start;
    const cond = (i) => dir > 0 ? i < end : i >= end;
    const limit = (i) => dir > 0 ? Math.min(i + SUSTAINED_MIN, end) : Math.max(i - SUSTAINED_MIN, end);
    while (cond(i)) {
      let sustained = 0;
      for (let j = i; dir > 0 ? j < limit(i) : j > limit(i); j += dir) {
        if (arr[j] > EDGE_DENSITY_THRESHOLD) sustained++;
      }
      if (sustained >= SUSTAINED_MIN * 0.7) return i;
      i += dir;
    }
    return dir > 0 ? end : start;
  };

  const rowsAbove = rowDensity.filter(d => d > EDGE_DENSITY_THRESHOLD).length;
  const colsAbove = colDensity.filter(d => d > EDGE_DENSITY_THRESHOLD).length;
  const isFullPuzzle = (rowsAbove / height) > 0.7 && (colsAbove / width) > 0.5;

  let left, top, right, bottom;
  if (isFullPuzzle) {
    const mx = Math.round(width * 0.05);
    const my = Math.round(height * 0.05);
    left = mx; top = my; right = width - mx; bottom = height - my;
  } else {
    top  = findBoundary(rowDensity, 0, height, 1);
    bottom = findBoundary(rowDensity, height - 1, 0, -1);
    left  = findBoundary(colDensity, 0, width, 1);
    right = findBoundary(colDensity, width - 1, 0, -1);
  }

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(width - 1, right);
  bottom = Math.min(height - 1, bottom);

  // 保守退路
  const iw = right - left, ih = bottom - top;
  if (iw < width * 0.3 || ih < height * 0.3 || iw <= 0 || ih <= 0) {
    const mx = Math.round(width * 0.1);
    const my = Math.round(height * 0.1);
    left = mx; top = my; right = width - mx; bottom = height - my;
  }

  return { left, top, right, bottom };
}

/**
 * 获取相框图片的拼图区域边界（带缓存）
 */
export function getFrameBounds(frameImg) {
  const key = frameImg.src;
  if (boundsCache.has(key)) return boundsCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = frameImg.naturalWidth;
  canvas.height = frameImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frameImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = findPuzzleBounds(imageData, canvas.width, canvas.height);
  boundsCache.set(key, bounds);
  return bounds;
}

/**
 * 将用户拼图合成到相框中，保留拼图切割线纹理
 *
 * @param {CanvasRenderingContext2D} ctx - 输出 canvas 上下文
 * @param {HTMLCanvasElement|HTMLImageElement} puzzleSource - 用户拼图图片源
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界（原始坐标）
 * @param {number} canvasW - 输出 canvas 宽度
 * @param {number} canvasH - 输出 canvas 高度
 */
export function compositeFramedImage(ctx, puzzleSource, frameImg, bounds, canvasW, canvasH) {
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;

  // 1. 绘制相框（缩放到 canvas 尺寸）
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // 2. 计算内框在 canvas 坐标中的位置
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iR = Math.round(bounds.right * sx);
  const iB = Math.round(bounds.bottom * sy);
  const iw = iR - iL;
  const ih = iB - iT;
  if (iw <= 4 || ih <= 4) return; // 太小时跳过

  // 3. 提取相框内框区域的像素（已含拼图切割线纹理）
  const frameInnerData = ctx.getImageData(iL, iT, iw, ih);

  // 4. 计算拼图 cover 适配内框的裁剪区域
  const puzW = puzzleSource.naturalWidth || puzzleSource.width;
  const puzH = puzzleSource.naturalHeight || puzzleSource.height;
  const puzAspect = puzW / puzH;
  const innerAspect = iw / ih;

  let srcX, srcY, srcW, srcH;
  if (puzAspect > innerAspect) {
    srcH = puzH;
    srcW = puzH * innerAspect;
    srcX = (puzW - srcW) / 2;
    srcY = 0;
  } else {
    srcW = puzW;
    srcH = puzW / innerAspect;
    srcX = 0;
    srcY = (puzH - srcH) / 2;
  }

  // 5. 绘制拼图到离屏 canvas（缩放到内框大小）
  const puzCanvas = document.createElement('canvas');
  puzCanvas.width = iw;
  puzCanvas.height = ih;
  const puzCtx = puzCanvas.getContext('2d');
  puzCtx.drawImage(puzzleSource, srcX, srcY, srcW, srcH, 0, 0, iw, ih);
  const puzzleData = puzCtx.getImageData(0, 0, iw, ih);

  // 6. 像素级混合：保留拼图切割线，覆盖白板区域
  const outData = new Uint8ClampedArray(puzzleData.data.length);
  const len = puzzleData.data.length;
  for (let i = 0; i < len; i += 4) {
    const fR = frameInnerData.data[i];
    const fG = frameInnerData.data[i + 1];
    const fB = frameInnerData.data[i + 2];
    const brightness = (fR + fG + fB) / 3;

    // 亮度越高 → 越是白板表面 → 用用户图片
    // 亮度越低 → 越是切割线/阴影 → 保留相框原色
    let lineStrength;
    if (brightness >= BOARD_BRIGHTNESS) {
      lineStrength = 0;
    } else if (brightness <= 100) {
      lineStrength = 1;
    } else {
      lineStrength = (BOARD_BRIGHTNESS - brightness) / (BOARD_BRIGHTNESS - 100);
    }

    outData[i]     = puzzleData.data[i]     * (1 - lineStrength) + fR * lineStrength;
    outData[i + 1] = puzzleData.data[i + 1] * (1 - lineStrength) + fG * lineStrength;
    outData[i + 2] = puzzleData.data[i + 2] * (1 - lineStrength) + fB * lineStrength;
    outData[i + 3] = 255;
  }

  // 7. 将混合结果写回
  const blended = new ImageData(outData, iw, ih);
  ctx.putImageData(blended, iL, iT);
}

/** 清空边界缓存 */
export function clearFrameBoundsCache() {
  boundsCache.clear();
}
