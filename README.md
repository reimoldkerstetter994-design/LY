# 南京农业大学 农业资源与环境（0903 学硕）考研资料实时抓取工具

自动抓取并整理 **南京农业大学 资源与环境科学学院** 农业资源与环境一级学科下的两个学术型硕士专业
（**090301 土壤学**、**090302 植物营养学**）的考研信息，生成一份持续更新的 Markdown/JSON 报告，并可在有新通知时推送到企业微信/钉钉/飞书。

最新报告：[`reports/latest.md`](reports/latest.md)（每次抓取自动覆盖）。

## 抓取哪些来源

| 类型 | 来源 | 内容 |
|---|---|---|
| 官方 | [研究生招生网](https://zsgz.njau.edu.cn/) 硕士最新通知 / 简章目录 / 录取公示 / 历年复试分数 / 历年报考情况 | 招生章程、专业目录、初试成绩、复试办法、拟录取名单、调剂、预通知等，含附件清单 |
| 官方 | [资源与环境科学学院](https://re.njau.edu.cn/) 学院通知 / 通知公告 / 研究生招生工作 | 学院复试细则、笔试面试安排、拟录取名单（含导师）、推免面试等（自动过滤本科/党建/博士信息） |
| 官方 | [研究生院在线招生目录](https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx) | 003 学院全部专业：拟招生人数、研究方向、初试/复试科目、**参考书目**；自动探测最新年份并与上一年对比差异 |
| 全网 | DuckDuckGo、Bing | 真题（回忆版）、复习经验、复试面经、报录比分析、机构资料等 |
| 公众号 | 搜狗微信搜索 | 南农研招、农学考研中心等公众号文章 |

所有条目按 **招生简章与目录 / 成绩与分数线 / 复试与录取 / 调剂 / 推免 / 真题与资料 / 经验与备考 / 导师与学科** 分类，
SQLite 去重，只有第一次出现的条目才算“新增”并触发推送。

另外 `data/knowledge_0903.yaml` 是一份人工核对过的核心事实库（考试科目、参考书目、复试科目、关键通知链接、年度时间线），
报告末尾会附上；程序抓到的实时目录若与之不同，以实时目录为准。

## 快速开始

```bash
git clone <本仓库>
cd <本仓库>
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 抓取一次（官网 + 招生目录 + 全网搜索），约 3~5 分钟
python -m njau_kaoyan.cli run

# 只抓官网 + 目录（1~2 分钟，适合频繁运行）
python -m njau_kaoyan.cli run --no-search

# 常驻监控：每 60 分钟抓一次官网/目录，每 6 轮做一次全网搜索，有新通知即推送
python -m njau_kaoyan.cli watch --interval 60 --search-every 6

# 查看抓到的招生目录（考试科目 / 参考书 / 复试科目）
python -m njau_kaoyan.cli catalog            # 只看 090301 / 090302
python -m njau_kaoyan.cli catalog --all      # 学院全部专业
python -m njau_kaoyan.cli catalog --json

# 查询数据库
python -m njau_kaoyan.cli list 857
python -m njau_kaoyan.cli list --kind official --category 复试与录取
python -m njau_kaoyan.cli list --kind weixin

# 不抓取，仅重新生成报告
python -m njau_kaoyan.cli report
```

也可以 `pip install -e .` 后直接使用 `njau-kaoyan run`。

## 实时推送

在 `config.yaml` 的 `notify.webhook_url` 填入群机器人地址（或设置环境变量 `NJAU_WEBHOOK_URL`），
`webhook_type` 支持 `wecom`（企业微信）、`dingtalk`、`feishu`、`generic`。默认只推送**官方新通知**
（`official_only: true`），不会被搜索结果刷屏。

## 免费云端定时抓取（GitHub Actions）

仓库自带 `.github/workflows/crawl.yml`：每 6 小时抓取一次，把更新后的 `data/njau_kaoyan.sqlite3` 和 `reports/` 提交回仓库，
这样打开 GitHub 就能看到最新报告。需要推送时在仓库 **Settings → Secrets** 添加 `NJAU_WEBHOOK_URL`，
可选在 **Variables** 添加 `NJAU_WEBHOOK_TYPE`。也可以在 Actions 页面手动触发（`workflow_dispatch`）。

## 配置说明（`config.yaml`）

- `target.majors`：目标专业代码，决定目录中哪些专业展示参考书并参与差异对比。
- `official`：官网栏目列表，`max_pages` 控制翻页数，`filter: true` 表示用 `relevance.official_topic_any` 过滤（学院栏目噪音多）。
- `catalog.years`：留空自动探测（当前年份 +1 往前找），`compare_previous_year` 开启与上一年对比。
- `search.queries` / `weixin_queries`：搜索关键词，可自行增删；`delay` 控制两次搜索的间隔，太快会被搜索引擎限流返回空页。
- `relevance`：相关性判定词表——`must_any`（必须是南农）、`topic_any`（必须与考研/本专业相关）、`exclude_any`（博士/本科/党建等直接丢弃）。
- `report.recent_days`：报告中“最近更新”窗口。

## 目录结构

```
njau_kaoyan/
  cli.py          命令行入口（run / watch / report / catalog / list）
  pipeline.py     一次完整抓取：官网 → 目录 → 搜索 → 入库 → 报告 → 推送
  sources/
    vsb.py        南农官网（VSB 建站系统）列表页/详情页/翻页解析
    catalog.py    研究生院在线招生目录（ASP.NET 表单回传）+ 参考书目 + 年度差异
    search.py     DuckDuckGo / Bing / 搜狗微信 解析
  classify.py     分类与相关性打分
  storage.py      SQLite 存储（条目、目录快照、运行记录）
  report.py       Markdown / JSON 报告
  notify.py       webhook 推送
data/knowledge_0903.yaml   人工核对的核心事实库
tests/                     离线解析测试（真实页面快照）
```

运行测试：`pip install pytest && pytest -q`

## 注意事项

- 官网附件（PDF/DOC）下载需要在浏览器输入验证码，程序只记录附件名称和链接，请点击链接手动下载。
- 官网部分通知（如科目调整表）以图片形式发布，程序会记录图片链接。
- 南农研招办已声明不对外提供往年真题，第三方“真题/资料”多为回忆版或机构整理，请自行甄别，谨防付费陷阱。
- 搜索引擎和搜狗微信有反爬限制，偶尔返回空结果属正常，程序会自动退避重试；官网栏目不受影响。
- 2027 年正式招生章程与专业目录以研招办 2026 年 9 月公布的版本为准。
