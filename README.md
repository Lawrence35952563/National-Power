# 国家长期能力综合排名

[打开网站](https://lawrence35952563.github.io/National-Power/) · [使用与更新说明](docs/user-guide.md)

本项目比较国家及其他评价实体调动资源、维持长期行动的能力，包含政治、经济、军事、交通、农业、能源、矿产和稳定八个领域。综合名次与领域结果以 Excel 为准，研究说明整理自《综合国力2.0》PDF。

可以直接搜索国家、查看排名、比较实体，或按原工作表浏览完整数据。点击数字可查看原表记录、公式和已有说明。网站保留正式排名与补充实体的区别，不自行补写国家排名理由。

## 浏览网站

| 想做什么 | 入口 |
| --- | --- |
| 查一个国家或实体 | 首页搜索，或综合排名 |
| 看领域结果与具体指标 | 点击实体名称 |
| 对照多个实体 | 实体比较：最多 5 个实体、8 个原字段 |
| 浏览原表 | 完整数据：主题选列、搜索、排序与完整原表视图 |
| 理解领域与评分 | 研究说明、来源与方法 |
| 保存数据 | 页面底部的下载入口 |

政治、经济、军事使用领域名次；另外五领域主要使用 1–5 级评分。名次与评分分别展示，不把名次差解释为能力倍数。网页中的字段数量包含派生字段和辅助项，不等于独立研究指标数量。

## 更新数据，只替换一个文件

**日常维护的文件是 [`data/source/national-power.xlsx`](data/source/national-power.xlsx)。**

1. 在 Excel 中修改数据，完成公式重新计算并保存；保留现有工作表名称和表头。
2. 将公开副本命名为 `national-power.xlsx`，上传到仓库的 [`data/source`](https://github.com/Lawrence35952563/National-Power/tree/main/data/source)，替换同名文件。
3. 等待 [Actions](https://github.com/Lawrence35952563/National-Power/actions) 中的 **Validate, build and deploy Pages** 检查和部署成功，再刷新网站。

排名、实体页、比较和下载一起更新。不需要手工修改网页、JSON 或 CSV。原表中人工录入的排名与评分仍由作者维护，网站不会因某个底层数字变化而自行改写研究判断。

如果改了工作表、列结构、权重或研究定义，请把新版文件交给维护者同步检查。检查失败时不发布新版；处理方式见[更新没成功怎么办](docs/user-guide.md#更新没成功怎么办)。

## 原始材料与说明

- Excel 是唯一数值来源。原表数值、公式、名次、空白和错误分别保留。
- PDF 用于解释研究范围和字段含义；网页引用实际 PDF 页码，不使用旧目录页码。
- PDF 的“发展”对应当前 Excel 的“政治”，PDF 的“政治”对应当前 Excel 的“稳定”。名称采用当前 Excel。
- 军事组合记录按已确认规则分项展示，不补猜缺失的位数或第二项数量。
- 公开 Excel 仅清理作者、最后编辑者和打印机元数据，不改变单元格内容。

具体方法见[来源与方法](docs/methodology.md)，原表问题见[数据检查记录](docs/qa/excel-audit.md)。历史工程验收保留在 [`docs/qa`](docs/qa)，与研究结论分开记录。

## 目录

| 路径 | 用途 |
| --- | --- |
| `data/source/national-power.xlsx` | 日常更新的唯一数据文件 |
| `web/` | 网站页面、交互与样式 |
| `web/reading-guide.js` | 按 PDF 整理的领域与主题说明，不保存国家数值 |
| `config/` | 工作表映射、报告释义和来源信息 |
| `scripts/` | 检查 Excel、转换数据、构建网站 |
| `tests/` | 数据与交互的回归检查 |
| `.github/workflows/pages.yml` | GitHub Actions 检查与发布流程 |
| `docs/` | 使用、方法、维护及验收记录 |

`dist/` 是自动生成的网站，不提交到仓库，不需要手工维护。

## 给维护者

构建使用 Python 标准库；完整测试还需要 Node.js。无需安装 npm 或 Python 包。

```bash
python scripts/build_site.py
python -m unittest discover -s tests -v
python -m http.server 8000 --directory dist
```

导入新版 Excel 并清理文档身份信息：

```bash
python scripts/import_workbook.py "/path/to/最新版.xlsx"
```

导入失败时保留旧文件。数据结构变更需要检查 `config/workbook.json`；说明修订需要核对 PDF 与 `config/reader-notes.json`，不得用旧报告数字覆盖 Excel。

网站为静态页面，不使用数据库、外部字体、Google 服务或第三方运行时 CDN。构建同时生成 `dist/offline.html`，单独保存这一个文件即可离线浏览和下载其中的数据；它不会自动获取线上更新。

维护者可在站点的 `preview.html` 检查 360、390、768、1440 像素宽度布局；它使用同一网站页面，不模拟实体设备。

GitHub Pages 使用 **GitHub Actions** 作为发布源。推送 `main` 后自动检查并部署，PR 只检查和构建。每次发布的实际结果以 Actions 和[发布状态](docs/deployment-status.md)为准。

## 使用与引用

引用时注明项目名称、研究版本、Excel 数据版本和访问日期。精确复核可同时保留下载页的数据指纹或所用 Excel 文件。研究说明与数值应一并阅读；网站公开展示不替第三方数据授予再许可。
