# 南农农业资源与环境学硕 · 官方公开资料抓取

实时汇总[南京农业大学](https://www.njau.edu.cn) **农业资源与环境学术学位硕士** 的官方公开报考信息，并生成本地资料台。

当前该一级学科按二级学科招生：

| 代码 | 专业 | 类型 |
| --- | --- | --- |
| 090301 | 土壤学 | 学硕 |
| 090302 | 植物营养学 | 学硕 |

同学院的生态学、环境科学、环境工程及专硕方向会一并列出，仅作对照，避免和 0903 学硕混淆。

## 抓什么、不抓什么

**会抓（官方公开网页）：**

- 研究生招生目录系统：拟招生人数、研究方向、初试/复试科目
- 科目页面上的官方参考书目
- 研究生招生网：章程、目录公告、复试办法、调剂与拟录取通知
- 资源与环境科学学院：复试安排、拟录取公示等与硕士招生相关的通知
- 官方附件链接（如学院复试细则 PDF）

**不会抓：**

- 往年真题、回忆版试卷、培训机构网盘/网课
- 需要登录才能看的系统
- 考生姓名等拟录取名单正文（只保留官方公示链接）

学校研招办有[严正声明](https://zsgz.njau.edu.cn/info/1007/1080.htm)：不对外提供往年考研真题，也未授权任何考研培训。

## 使用

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

python3 -m njau_are scrape
python3 -m njau_are serve
```

浏览器打开 `http://127.0.0.1:8765/`。也可以直接打开 `data/site/index.html`，或阅读 `data/latest.md` / `data/latest.json`。

抓取间隔约 0.9 秒，使用可识别的学术用途 User-Agent。请勿对学校站点做高频扫描。

## 测试

```bash
python3 -m pytest -q
```

## 主要来源

- https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx
- https://zsgz.njau.edu.cn/
- https://re.njau.edu.cn/
