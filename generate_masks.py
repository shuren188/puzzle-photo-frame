"""
生成相框灰度蒙版 PNG（白=边框保留，黑=内框透明）
使用灰度模式 PNG，文件极小
"""

from PIL import Image
import os

BOUNDS_MAP = {
    ('h', '35.jpg'):  (268, 230, 2189, 1691),
    ('h', '70.jpg'):  (310, 244, 2213, 1697),
    ('h', '120.jpg'): (262, 198, 2201, 1791),
    ('h', '200.jpg'): (2,   156, 2311, 1645),
    ('h', '300.jpg'): (28,  146, 2138, 1665),
    ('v', '35.jpg'):  (260, 372, 1725, 2393),
    ('v', '70.jpg'):  (266, 354, 1717, 2069),
    ('v', '120.jpg'): (152, 256, 1707, 2297),
    ('v', '200.jpg'): (180, 202, 1715, 2343),
    ('v', '300.jpg'): (26,  182, 1631, 2395),
}

def create_mask(jpg_path, png_path, bounds):
    img = Image.open(jpg_path)
    w, h = img.size
    # 创建灰度图：白=255(保留), 黑=0(切掉)
    mask = Image.new('L', (w, h), 255)
    left, top, right, bottom = bounds
    for y in range(max(0, top), min(h, bottom)):
        for x in range(max(0, left), min(w, right)):
            mask.putpixel((x, y), 0)

    # 优化 PNG 压缩：先滤波再保存
    mask.save(png_path, 'PNG', optimize=True)
    png_size = os.path.getsize(png_path)
    jpg_size = os.path.getsize(jpg_path)
    print(f'  {png_path}: {jpg_size//1024}KB JPG → {png_size//1024}KB PNG ({png_size/jpg_size*100:.1f}%)')

def main():
    base = 'F:/Claude Code/拼图裁剪-加相框/public/frames'
    for orient in ['h', 'v']:
        folder = os.path.join(base, orient)
        for fname in sorted(os.listdir(folder)):
            if not fname.endswith('.jpg'): continue
            key = (orient, fname)
            if key not in BOUNDS_MAP: continue
            jpg_path = os.path.join(folder, fname)
            png_name = fname.replace('.jpg', '.png')
            png_path = os.path.join(folder, png_name)
            print(f'[GEN] {orient}/{png_name}')
            create_mask(jpg_path, png_path, BOUNDS_MAP[key])

if __name__ == '__main__':
    main()
