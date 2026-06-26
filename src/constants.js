/** 拼图尺寸配置 (物理厘米) */
export const SIZES = [
  { name: '35片', widthCm: 10, heightCm: 15, label: '10×15cm' },
  { name: '70片', widthCm: 15, heightCm: 20, label: '15×20cm' },
  { name: '120片', widthCm: 20, heightCm: 25, label: '20×25cm' },
  { name: '200片', widthCm: 21, heightCm: 30, label: '21×30cm' },
  { name: '300/520片', widthCm: 26, heightCm: 38, label: '26×38cm' },
];

/** 输出质量模式 (scale: 0=原分辨率, 2=2倍) */
export const QUALITIES = [
  { name: '原图', scale: 0, sub: '保持原画质' },
  { name: '高清', scale: 2, sub: '2倍分辨率' },
];

/** 预设填充颜色 */
export const PRESET_COLORS = [
  { name: '纯白', hex: '#FFFFFF' },
  { name: '黑色', hex: '#000000' },
  { name: '科技蓝', hex: '#06B6D4' },
  { name: '霓虹紫', hex: '#A855F7' },
  { name: '樱花粉', hex: '#EC4899' },
];

/** 默认设置 */
export const DEFAULTS = {
  sizeIndex: 0,            // 默认 35片
  quality: 0,               // 默认 原图画质（scale=0）
  fillColor: '#FFFFFF',    // 默认纯白
  zoom: 100,               // 默认 100%
  offsetX: 0,              // 默认水平居中
  offsetY: 0,              // 默认垂直居中
  rotation: 0,             // 默认不旋转
};

/** 缩放范围 */
export const ZOOM_RANGE = { min: 50, max: 150, step: 1 };

/** 偏移范围 (%) */
export const OFFSET_RANGE = { min: -100, max: 100, step: 1 };

/** 拖拽灵敏度 (降低幅度，减少误触) */
export const DRAG_SENSITIVITY = 1.0;

/**
 * 相框配置
 * 每个尺寸的横版/竖版相框文件映射
 */
export const FRAME_CONFIG = {
  // 尺寸名称 → { 横版文件名, 竖版文件名 }
  sizes: {
    '35片': { name: '35片', label: '10×15cm' },
    '70片': { name: '70片', label: '15×20cm' },
    '120片': { name: '120片', label: '20×25cm' },
    '200片': { name: '200片', label: '21×30cm' },
    '300/520片': { name: '300/520片', label: '26×38cm' },
  },
  files: {
    '35片': { file: '35（10x15）.jpg' },
    '70片': { file: '70（15x20）.jpg' },
    '120片': { file: '120（20x25）.jpg' },
    '200片': { file: '200（21x30）.jpg' },
    '300/520片': { file: '300和520（26x38）.jpg' },
  },
  /** 横版相框文件夹 */
  horizontalDir: '带框效果图-横版',
  /** 竖版相框文件夹 */
  verticalDir: '带框效果图-竖版',
};

/** 默认是否开启相框（默认关闭） */
export const DEFAULT_FRAME_ENABLED = false;

