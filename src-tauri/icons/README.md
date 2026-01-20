# 图标说明

此目录需要包含以下图标文件用于应用打包：

- `32x32.png` - 32x32 像素图标
- `128x128.png` - 128x128 像素图标  
- `128x128@2x.png` - 256x256 像素图标 (macOS Retina)
- `icon.icns` - macOS 图标
- `icon.ico` - Windows 图标

## 生成图标

可以使用以下工具从 `icon.svg` 生成所需图标：

### 使用 Tauri 图标生成器

```bash
npm install -g @tauri-apps/cli
tauri icon ./icon.svg
```

### 或使用在线工具

1. 访问 https://tauri.app/v1/guides/features/icons
2. 上传 SVG 或高分辨率 PNG (1024x1024)
3. 下载生成的图标包

### 手动生成 (需要 ImageMagick)

```bash
# 安装 ImageMagick
# Windows: choco install imagemagick
# macOS: brew install imagemagick

# 生成 PNG
convert icon.svg -resize 32x32 32x32.png
convert icon.svg -resize 128x128 128x128.png
convert icon.svg -resize 256x256 128x128@2x.png

# 生成 ICO (Windows)
convert icon.svg -resize 256x256 icon.ico

# 生成 ICNS (macOS)
# 需要在 macOS 上使用 iconutil
```

## 临时解决方案

在开发阶段，可以先注释掉 `tauri.conf.json` 中的 `bundle.icon` 配置，
或者创建空的图标文件占位。Tauri 在开发模式下不强制要求图标。
