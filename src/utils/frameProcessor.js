/**
 * 相框处理模块
 *
 * 最小化直接绘制法 - 回归最简单的方式
 *   1. 直接 drawImage 绘制相框
 *   2. 用 putImageData 将内框区域替换为用户图片
 *      绝不使用任何复合模式(destination-out/multiply等)
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

let debugInfo = '';

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

export function getDebugInfo() { return debugInfo; }

/**
 * 将用户拼图合成到相框（最简实现）
 *
 * 方法：
 * 1. 绘制相框全图到目标 canvas
 * 2. 读取内框区域的像素数据（含白板+切割线）
 * 3. 创建离屏画布，用 multiply 混合拼图和切割线
 * 4. 用 putImageData 把混合后的像素写入目标 canvas 的内框区域
 *    → 不使用 globalCompositeOperation，不依赖渲染上下文状态
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameImg, bounds, canvasW, canvasH) {
  const startMs = performance.now();
  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // 1. 绘制相框全图
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // 2. 计算内框在画布上的坐标
  const sx = canvasW / frameImg.naturalWidth;
  const sy = canvasH / frameImg.naturalHeight;
  const iL = Math.round(bounds.left * sx);
  const iT = Math.round(bounds.top * sy);
  const iR = Math.round(bounds.right * sx);
  const iB = Math.round(bounds.bottom * sy);
  const iw = iR - iL;
  const ih = iB - iT;
  debugInfo = `inner=${iw}x${ih} at (${iL},${iT}) on ${canvasW}x${canvasH}`;

  if (iw < 2 || ih < 2) return;

  // 3. 提取相框内框区域的像素（含切割线纹理）
  const frameInnerData = ctx.getImageData(iL, iT, iw, ih);

  // 4. 创建离屏画布 — 拼图 cover-fitted
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzA = puzW / puzH;
  const inA = iw / ih;

  let dW, dH, dX, dY;
  if (puzA > inA) {
    dW = iw; dH = Math.round(iw / puzA);
    dX = 0; dY = Math.round((ih - dH) / 2);
  } else {
    dH = ih; dW = Math.round(ih * puzA);
    dX = Math.round((iw - dW) / 2); dY = 0;
  }

  const puzInnerCanvas = document.createElement('canvas');
  puzInnerCanvas.width = iw;
  puzInnerCanvas.height = ih;
  const piCtx = puzInnerCanvas.getContext('2d');
  piCtx.drawImage(puzzleCanvas, 0, 0, puzW, puzH, dX, dY, dW, dH);
  const puzzleData = piCtx.getImageData(0, 0, iw, ih);

  // 5. 像素级混合：保留切割线，替换白板
  const out = new Uint8ClampedArray(puzzleData.data.length);
  const len = puzzleData.data.length;
  for (let i = 0; i < len; i += 4) {
    const fR = frameInnerData.data[i];
    const fG = frameInnerData.data[i + 1];
    const fB = frameInnerData.data[i + 2];
    const brightness = (fR + fG + fB) / 3;

    if (brightness >= 220) {
      // 纯白板 → 完全用用户图片
      out[i] = puzzleData.data[i];
      out[i+1] = puzzleData.data[i+1];
      out[i+2] = puzzleData.data[i+2];
    } else if (brightness <= 80) {
      // 深色切割线 → 完全保留
      out[i] = fR;
      out[i+1] = fG;
      out[i+2] = fB;
    } else {
      // 混合
      const t = (brightness - 80) / (220 - 80);
      out[i]   = puzzleData.data[i] * t + fR * (1 - t);
      out[i+1] = puzzleData.data[i+1] * t + fG * (1 - t);
      out[i+2] = puzzleData.data[i+2] * t + fB * (1 - t);
    }
    out[i+3] = 255;
  }

  // 6. 写回
  const blended = new ImageData(out, iw, ih);
  ctx.putImageData(blended, iL, iT);

  debugInfo += ` done in ${Math.round(performance.now() - startMs)}ms`;
}

export function clearFrameBoundsCache() {}
