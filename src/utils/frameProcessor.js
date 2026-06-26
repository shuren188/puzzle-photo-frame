/**
 * 相框处理模块
 * 将拼图图片合成到相框效果图中
 *
 * 合成原理（使用 Canvas multiply 混合模式，GPU加速）：
 * 1. 将用户拼图绘制到内框区域
 * 2. 用 multiply 混合模式叠加相框的拼图切割线纹理
 *    - 暗色像素（切割线）→ 乘法混合后会变暗，透出切割线
 *    - 亮色像素（白板表面）→ 乘法混合后几乎不变，用户图片保留
 */

/** 缓存已检测的内框边界 */
const boundsCache = new Map();

/**
 * 加载相框图片
 */
export function loadFrameImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载相框失败: ${url}`));
    img.src = url;
  });
}

/**
 * 获取对应尺寸和方向的相框图片 URL
 * 使用 frames/h/ 和 frames/v/ 目录（纯英文文件名，避免中文编码问题）
 */
export function getFrameUrl(sizeName, isLandscape) {
  const folder = isLandscape ? 'frames/h' : 'frames/v';
  const fileMap = {
    '35片': '35.jpg',
    '70片': '70.jpg',
    '120片': '120.jpg',
    '200片': '200.jpg',
    '300/520片': '300.jpg',
  };
  const file = fileMap[sizeName];
  if (!file) return null;
  const base = import.meta.env.BASE_URL;
  return `${base}${folder}/${file}`;
}

/**
 * 通过边缘检测自动识别相框图片的内框（拼图区域）边界
 */
export function findPuzzleBounds(imageData, width, height) {
  const data = imageData.data;
  const step = width > 2000 ? 3 : 2;

  // 对每行计算水平边缘密度
  const rowDensity = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0, total = 0;
    for (let x = 0; x < width - step; x += step) {
      const i1 = (y * width + x) * 4;
      const i2 = (y * width + x + step) * 4;
      const diff = Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]);
      if (diff > 60) count++;
      total++;
    }
    rowDensity[y] = total > 0 ? count / total : 0;
  }

  // 对每列计算垂直边缘密度
  const colDensity = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0, total = 0;
    for (let y = 0; y < height - step; y += step) {
      const i1 = (y * width + x) * 4;
      const i2 = ((y + step) * width + x) * 4;
      const diff = Math.abs(data[i1] - data[i2]) + Math.abs(data[i1+1] - data[i2+1]) + Math.abs(data[i1+2] - data[i2+2]);
      if (diff > 60) count++;
      total++;
    }
    colDensity[x] = total > 0 ? count / total : 0;
  }

  // 从四边向内扫描找到拼图区域的边界
  // 拼图区域边缘密度高，相框边框边缘密度低
  const findFirstDense = (arr, start, end, dir) => {
    const sustain = 6;
    let i = start;
    while (dir > 0 ? i < end : i >= end) {
      let dense = 0;
      const limit = dir > 0 ? Math.min(i + sustain, end) : Math.max(i - sustain, end);
      for (let j = i; dir > 0 ? j < limit : j > limit; j += dir) {
        if (arr[j] > 0.008) dense++;
      }
      if (dense >= sustain * 0.6) return i;
      i += dir;
    }
    return dir > 0 ? end : start;
  };

  // 判断密集区占比
  const denseRows = rowDensity.filter(d => d > 0.008).length;
  const denseCols = colDensity.filter(d => d > 0.008).length;

  let left, top, right, bottom;
  if ((denseRows / height) > 0.85 && (denseCols / width) > 0.6) {
    // 几乎全是拼图区域（无边框相框）
    const mx = Math.round(width * 0.08);
    const my = Math.round(height * 0.08);
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

  // 验证结果
  const iw = right - left, ih = bottom - top;
  if (iw < width * 0.2 || ih < height * 0.2 || iw <= 0 || ih <= 0) {
    // 保守估计：内框约在中心 78% 区域
    const mx = Math.round(width * 0.11);
    const my = Math.round(height * 0.11);
    return { left: mx, top: my, right: width - mx, bottom: height - my };
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

  let bounds;
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    bounds = findPuzzleBounds(imageData, canvas.width, canvas.height);
  } catch (e) {
    // getImageData 失败时使用估计值
    const mx = Math.round(canvas.width * 0.11);
    const my = Math.round(canvas.height * 0.11);
    bounds = { left: mx, top: my, right: canvas.width - mx, bottom: canvas.height - my };
  }

  boundsCache.set(key, bounds);
  return bounds;
}

/**
 * 将用户拼图合成到相框中，保留拼图切割线纹理
 *
 * 原理：
 * 1. 绘制相框到画布
 * 2. 在内框区域用 multiply 混合模式叠加相框的切割线纹理
 *    - 画布上已有用户拼图（通过 renderFramedPreview 预先绘制）
 *    - 用 multiply 混合绘制相框内框区域 → 暗色切割线透出，亮色白板不变
 *
 * @param {CanvasRenderingContext2D} ctx - 输出上下文
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界（原始图片坐标）
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 */
export function compositeFramedImage(ctx, puzzleSource, frameImg, bounds, canvasW, canvasH) {
  // === 第一步：绘制相框背景（全尺寸）===
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // === 第二步：计算内框在画布上的位置 ===
  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iw = Math.round((bounds.right - bounds.left) * sx);
  const ih = Math.round((bounds.bottom - bounds.top) * sy);

  if (iw <= 2 || ih <= 2) return;

  // === 第三步：离屏画布 A — 绘制用户拼图（cover 适配内框大小）===
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

  // 画布 A：用户拼图
  const canvasA = document.createElement('canvas');
  canvasA.width = iw;
  canvasA.height = ih;
  const ctxA = canvasA.getContext('2d');
  ctxA.drawImage(puzzleSource, srcX, srcY, srcW, srcH, 0, 0, iw, ih);

  // === 第四步：画布 B — 相框内框区域（含切割线纹理）===
  const canvasB = document.createElement('canvas');
  canvasB.width = iw;
  canvasB.height = ih;
  const ctxB = canvasB.getContext('2d');
  ctxB.drawImage(frameImg,
    bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top,
    0, 0, iw, ih
  );

  // === 第五步：用 multiply 混合将切割线融合到用户拼图上 ===
  // 在画布 A 上使用 multiply 模式叠加画布 B
  // 暗部（切割线）：使下方像素变暗 → 切割线显现
  // 亮部（白板）：几乎不改变下方像素 → 用户图片保留
  ctxA.save();
  ctxA.globalCompositeOperation = 'multiply';
  ctxA.drawImage(canvasB, 0, 0);
  ctxA.restore();

  // === 第六步：将混合结果写回主画布 ===
  try {
    const blendedData = ctxA.getImageData(0, 0, iw, ih);
    ctx.putImageData(blendedData, iL, iT);
  } catch (e) {
    // 写入失败时忽略（不影响相框边框）
  }
}

/** 清空边界缓存 */
export function clearFrameBoundsCache() {
  boundsCache.clear();
}
