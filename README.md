# LY Dynamic Wallpapers

五张循环视频壁纸。人物动作做成 30fps 光流补帧的 MP4，浏览器里当视频播，不再切静帧。

## 预览

```bash
./start-wallpaper.sh
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)

- 自动循环播放
- `P` 横版 / 竖版
- `1`–`5` 切换场景
- `F` 全屏

重新生成视频：

```bash
python3 tools/build-videos.py
```
