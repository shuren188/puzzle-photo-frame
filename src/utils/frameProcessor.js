/**
 * 相框处理模块
 *
 * 采用两种可靠技术：
 * 1. 预定义的内框坐标（不依赖自动检测）— 基于实际图片分析
 * 2. 像素级合成（不依赖GPU混合模式）— 精确保留切割线，完全替换白板
 */

/** 预定义内框边界（基于Python颜色变化分析，单位：原始图片像素） */
const BOUNDS_MAP = {
  // key: "isLandscape_sizeName"
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
  const fileMap = {
    '35片': '35.jpg', '70片': '70.jpg', '120片': '120.jpg',
    '200片': '200.jpg', '300/520片': '300.jpg',
  };
  const file = fileMap[sizeName];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}${folder}/${file}`;
}

/**
 * 获取预定义的内框边界（根据尺寸和横竖方向）
 */
export function getFrameBounds(frameImg, sizeName, isLandscape) {
  const key = `${isLandscape}_${sizeName}`;
  const predef = BOUNDS_MAP[key];
  if (predef) return predef;

  // 如果没有预定义，使用保守估计
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  return {
    left: Math.round(w * 0.12),
    top: Math.round(h * 0.14),
    right: Math.round(w * 0.94),
    bottom: Math.round(h * 0.96),
  };
}

/**
 * 将拼图合成到相框中（像素级精确合成）
 *
 * 像素级合成原理：
 *   对相框内框区域的每个像素：
 *     - 如果相框像素属于"白板区域"（亮度高）→ 用用户拼图像素替换
 *     - 如果相框像素属于"切割线区域"（亮度低）→ 保留相框原像素
 *     - 过渡区域 → 线性混合
 *
 * @param {CanvasRenderingContext2D} ctx - 输出画布上下文
 * @param {HTMLCanvasElement} puzzleCanvas - 已渲染好的拼图画布（renderImage 输出）
 * @param {HTMLImageElement} frameImg - 相框图片
 * @param {{left,top,right,bottom}} bounds - 内框边界
 * @param {number} canvasW - 输出宽度
 * @param {number} canvasH - 输出高度
 * @param {HTMLImageElement} [userImage] - 用户原始图片（可选，用于生成拼图）
 * @param {object} [imgState] - 渲染参数（用于内置渲染）
 */
export function compositeFramedImage(ctx, puzzleCanvas, frameImg, bounds, canvasW, canvasH) {
  const fw = frameImg.naturalWidth;
  const fh = frameImg.naturalHeight;

  ctx.canvas.width = canvasW;
  ctx.canvas.height = canvasH;

  // ========== 1. 绘制完整相框 ==========
  ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

  // ========== 2. 计算内框在画布上的位置 ==========
  const scaleX = canvasW / fw;
  const scaleY = canvasH / fh;
  const iL = Math.round(bounds.left * scaleX);
  const iT = Math.round(bounds.top * scaleY);
  const iR = Math.round(bounds.right * scaleX);
  const iB = Math.round(bounds.bottom * scaleY);
  const iw = iR - iL;
  const ih = iB - iT;
  if (iw <= 4 || ih <= 4) return;

  // ========== 3. 获取画布像素数据（含相框内框区域） ==========
  let framePixels;
  try {
    framePixels = ctx.getImageData(iL, iT, iw, ih);
  } catch (e) {
    return; // getImageData 失败时跳过合成
  }

  // ========== 4. 创建离屏画布 — 拼图图片 contain-fit 到内框大小 ==========
  const puzW = puzzleCanvas.width;
  const puzH = puzzleCanvas.height;
  const puzAspect = puzW / puzH;
  const innerAspect = iw / ih;

  // contain-fit：拼图完整显示在内框内
  let dW, dH, dX, dY;
  if (puzAspect > innerAspect) {
    dW = iw;
    dH = iw / puzAspect;
    dX = 0;
    dY = (ih - dH) / 2;
  } else {
    dH = ih;
    dW = ih * puzAspect;
    dX = (iw - dW) / 2;
    dY = 0;
  }

  const puzDestCanvas = document.createElement('canvas');
  puzDestCanvas.width = iw;
  puzDestCanvas.height = ih;
  const puzDestCtx = puzDestCanvas.getContext('2d');
  puzDestCtx.drawImage(puzzleCanvas, 0, 0, puzW, puzH, dX, dY, dW, dH);

  const puzzlePixels = puzDestCtx.getImageData(0, 0, iw, ih);

  // ========== 5. 像素级合成 ==========
  // 遍历内框区域的每个像素
  const data = framePixels.data;
  const puzData = puzzlePixels.data;
  const output = new Uint8ClampedArray(data.length);
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const fR = data[i];
    const fG = data[i + 1];
    const fB = data[i + 2];

    // 计算相框像素的亮度
    const brightness = (fR + fG + fB) / 3;

    if (brightness >= 195) {
      // 亮色区域（白板表面）→ 完全替换为用户拼图像素
      output[i] = puzData[i];
      output[i + 1] = puzData[i + 1];
      output[i + 2] = puzData[i + 2];
      output[i + 3] = puzData[i + 3] !== undefined ? puzData[i + 3] : 255;
    } else if (brightness <= 90) {
      // 暗色区域（切割线/阴影）→ 完全保留相框像素
      output[i] = fR;
      output[i + 1] = fG;
      output[i + 2] = fB;
      output[i + 3] = 255;
    } else {
      // 过渡区域 → 线性混合
      const t = (brightness - 90) / (195 - 90); // 0~1
      output[i]     = puzData[i]     * t + fR * (1 - t);
      output[i + 1] = puzData[i + 1] * t + fG * (1 - t);
      output[i + 2] = puzData[i + 2] * t + fB * (1 - t);
      output[i + 3] = 255;
    }
  }

  // ========== 6. 写回画布 ==========
  const blended = new ImageData(output, iw, ih);
  ctx.putImageData(blended, iL, iT);
}

export function clearFrameBoundsCache() {
  // boundsCache no longer needed since we use hardcoded values
}
