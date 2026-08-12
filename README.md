# 音乐搜 · 在线音乐搜索网站

一个纯前端的在线音乐搜索网站,可以搜索全球的歌曲、专辑、歌手和 MV,并支持约 30 秒的在线试听。

## 功能特性

- **多类型搜索**:歌曲 / 专辑 / 歌手 / MV 四种类型一键切换
- **多地区曲库**:支持中国大陆、香港、台湾、美国、日本、韩国、英国等地区
- **在线试听**:歌曲和 MV 提供约 30 秒试听片段,底部悬浮播放器支持进度拖动
- **热门推荐**:首页内置热门关键词,点击即搜
- **分页加载**:支持"加载更多"翻页浏览
- **响应式界面**:深色现代化 UI,适配手机与桌面

## 技术说明

- 纯静态页面:HTML + CSS + 原生 JavaScript,无需构建工具和后端
- 数据来源:[iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)(免费、无需 API Key、支持跨域)

## 本地运行

由于是纯静态站点,任选一种方式启动即可:

```bash
# 方式一:Python
python3 -m http.server 8000

# 方式二:Node.js
npx serve .
```

然后浏览器访问 `http://localhost:8000`。

也可以直接部署到 GitHub Pages、Vercel、Netlify 等任意静态托管平台。

## 目录结构

```
.
├── index.html      # 页面结构
├── css/style.css   # 样式
└── js/app.js       # 搜索、渲染与播放逻辑
```

## 免责声明

本项目仅供学习交流使用,音乐数据与试听片段均来自 iTunes Search API,版权归原权利方所有。
