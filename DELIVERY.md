# 本次交付

现有“国家长期能力综合排名”网站已发布并验证：[打开网站](https://lawrence35952563.github.io/National-Power/)。

## 实际改动

- 原样接管交接工程，保留 `.github/`、`.gitignore`、数据管线和原生静态网页；工程文件位于仓库根目录，未提交 `dist/` 或交接 ZIP。
- 修复 Windows 默认中文编码导致配置读取失败的问题：Python 文本读写和 Node 测试的子进程输入输出显式使用 UTF-8。未改研究数据、公式、权重、排名或测试校验规则。
- 更新 README、交付及发布/验收记录，以实际结果替换历史未上线状态。
- 插件写入仍返回 403；经用户完成 GitHub 官方 CLI 设备授权，通过正常认证的 GitHub API 提交，保留初始提交历史，未强推或改变保护规则。

## 发布与验收

- [首次工程提交](https://github.com/Lawrence35952563/National-Power/commit/92fb97bfc04bce3b6a800de013ddcc4da3247cf4)；[首次成功 Actions](https://github.com/Lawrence35952563/National-Power/actions/runs/35825621835)。工作流在 `main` 更新时检查 Excel、构建、运行完整测试，再部署 Pages。
- Windows Python 3.14.6 / Node 24.19.0：构建成功，34 项测试全部通过，无跳过。Actions Python 3.12：同样 34 项通过。
- 真实 Chromium：本地与线上桌面、手机视口检查通过；涵盖排名、搜索、宽表字段选择/排序/冻结、实体档案、比较、指标、解释、下载和分享路由。具体覆盖范围见[浏览器验收](docs/qa/browser-release-2026-09-23.md)。
- 线上首页、资源、数据、校验结果和全部下载共 18 项 HTTP 检查均为 200；JS/CSS/SVG 及全部 11 个 CSV 与本地构建逐字节相同。
- 线上 Excel SHA-256 与交接输入相同：`330dc73f643c117e05dfcd3f0ec8c419e2ea251025c2bbd2d7223e81a25b832a`。
- 9 张表、65 个实体、51 个正式排名、14 个补充记录、8 个领域；221 个领域数据字段不是独立研究指标数量。
- 独立核对 11,026 个存储单元格及 1,891 条公式；军事五组拆成十列的既有修复完整保留。

## 作者仍需判断

日本等实体 `.1` 记录含义、数值存储丢失的末尾零、10 个既有除零错误、既定名次与参考值差异、来源/年份/单位缺失，以及字段名称与公式口径等已知问题保持原样。网站保留不确定性，不自行补猜；详见[Excel 审计](docs/qa/excel-audit.md)及[读数含义](docs/qa/reader-semantics.md)。

## 以后更新

日常只替换 `data/source/national-power.xlsx`。在 Excel 中同步维护人工排名/评分、重算公式并保存，保持表结构；上传到仓库同一路径并提交 `main`，等待 Actions 全绿，刷新网站。无需另改 JSON、CSV 或网页。

本地导入新版可用 `python scripts/import_workbook.py "/path/to/新版.xlsx"`，它先清理身份元数据并校验，再替换数据源。结构、表头、权重或解释变更需另核对配置；失败的新版本不会覆盖已成功发布的网站。

未测：实体手机硬件、Safari/Firefox、多地区网络可达性和对全部 65 个实体逐项人工点击。已完成的手机检查是实际 Chromium 的 390×844 与 360×800 响应式视口，并非实体手机测试。
