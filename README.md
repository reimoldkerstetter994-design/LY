# 音乐搜 · 在线音乐搜索网站

一个**单文件**的在线音乐搜索网站,可以搜索全球的歌曲、专辑、歌手和 MV,并支持约 30 秒的在线试听。

## 使用方法

**双击打开 `index.html` 即可**,不需要安装任何软件、不需要启动服务器。

1. 下载本仓库的 `index.html`(或点击 GitHub 上的 Code → Download ZIP 解压)
2. 双击 `index.html`,浏览器会自动打开
3. 输入歌名、歌手或专辑,开始搜索和试听

> 需要联网使用,搜索数据实时来自 iTunes Search API。

## 功能特性

- **多类型搜索**:歌曲 / 专辑 / 歌手 / MV 四种类型一键切换
- **多地区曲库**:支持中国大陆、香港、台湾、美国、日本、韩国、英国等地区
- **在线试听**:歌曲和 MV 提供约 30 秒试听片段,底部悬浮播放器支持进度拖动
- **热门推荐**:首页内置热门关键词,点击即搜
- **分页加载**:支持"加载更多"翻页浏览
- **响应式界面**:深色现代化 UI,适配手机与桌面

## 技术说明

- 单个 HTML 文件:样式与脚本全部内联,无任何依赖,可直接通过 `file://` 打开
- 数据来源:[iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)(免费、无需 API Key、支持跨域)
- 也可以直接部署到 GitHub Pages、Vercel、Netlify 等任意静态托管平台变成公开网站

## 免责声明

本项目仅供学习交流使用,音乐数据与试听片段均来自 iTunes Search API,版权归原权利方所有。
