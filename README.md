# 国家长期能力综合排名

这是“综合国力”Excel 的在线展示网站，可以查看排名、浏览完整数据、打开实体档案、比较多个实体和下载数据。

**平时只需要维护一个 Excel，不需要修改网页。** 其余文件负责把 Excel 自动变成网站，正常更新数据时不用动。

**2026-09-23 发布验收进行中。** 已接管交接工程，修复 Windows UTF-8 兼容问题，34 项测试通过，并完成主要桌面与手机浏览器检查。插件写入仍返回 403；经用户完成 GitHub 官方 CLI 授权，现使用正常认证提交。最终部署结果见[发布状态](docs/deployment-status.md)。

- 网站地址（部署成功后可访问）：[国家长期能力综合排名](https://lawrence35952563.github.io/National-Power/)
- 第一次使用：[使用说明](docs/user-guide.md)
- 本次完成内容与发布状态：[交付说明](DELIVERY.md)

## 以后怎么更新

1. 在 Excel 中修改数据，完成重新计算并保存。日常更新保留现有工作表名称和表头。
2. 将文件命名为 **`national-power.xlsx`**，在 GitHub 的 [`data/source` 文件夹](https://github.com/Lawrence35952563/National-Power/tree/main/data/source)上传，替换同名文件并保存到 `main` 分支。
3. 打开仓库的 [Actions](https://github.com/Lawrence35952563/National-Power/actions)，等待 **Validate, build and deploy Pages** 完成。检查和部署都成功后，刷新网站即可看到新版。

排名、数值、实体页、比较数据和下载文件会一起更新。**不用手工修改几十个网页，也不用编辑 JSON 或 CSV。** 上传的 Excel 会进入公开仓库；请先清理文档属性中的个人信息。不会处理时，可以把新版文件交给维护者用内置导入命令完成。

如果 Actions 出现红叉，先打开那次运行查看失败提示，再按[使用说明中的出错处理](docs/user-guide.md#更新没成功怎么办)操作。检查失败时不会替换已经成功发布的网站，也不会擅自改你的研究数据。

## 文件夹是做什么的

| 路径 | 内容 |
| --- | --- |
| [`data/source/national-power.xlsx`](data/source/national-power.xlsx) | **日常只更新这个文件**：网站唯一数据源 |
| `web/` | 网站的外观和交互 |
| `scripts/` | 自动读取 Excel、检查数据和生成网站的程序 |
| `config/` | 告诉程序怎样理解工作表、字段和研究口径 |
| `tests/` | 自动检查网站与数据有没有出错 |
| `docs/` | 使用说明、方法说明、问题清单和验收记录 |
| `.github/workflows/` | 让 GitHub 在更新后自动检查、发布的设置 |

交付 ZIP 中的 `dist/` 是已生成的网站，方便离线查看；它不需要手工维护，也不提交到仓库。各目录的详细解释见[使用说明](docs/user-guide.md#这些文件为什么要保留)。

## 数据怎样保留

- 最新 Excel 是唯一数值来源，旧报告只解释背景。
- 原表名次、数值、公式和研究判断保持不变，包括小数名次与未排名实体。
- “公式参考值”不是百分制总分，网站不据此改写既定名次。
- 名次、评分、空白、原表错误和军事复合编码分别展示；未注明的来源、年份和单位不会被补猜。
- 当前工作簿和网站下载的公开副本仅清理作者、最后编辑者及打印机元数据，不改数据内容。

已发现的原表问题见 [Excel 检查报告](docs/qa/excel-audit.md)，方法解释见[研究方法](docs/methodology.md)。

## 给网站维护者

日常使用无需执行以下命令。需要在本地导入新版 Excel 时，使用：

```bash
python scripts/import_workbook.py "/path/to/最新版.xlsx"
```

这会清理文档身份信息、完整校验并替换数据源；校验失败时保留当前文件。增加工作表、改变表头或参考公式等结构调整，需要维护者同步检查 `config/workbook.json`。自动流程不会替作者决定新的研究规则。

本地构建需 Python 3.12+；完整自动验收还需 Node.js。无需安装 Python 或 npm 包：

```bash
python scripts/build_site.py
python -m unittest discover -s tests -v
python -m http.server 8000 --directory dist
```

浏览器访问 `http://localhost:8000/`。页面运行无需服务器端程序、数据库、Google 服务、外部字体或第三方 CDN；采用 hash 路由，兼容 GitHub Pages 子目录及直接分享链接。

构建还生成 `dist/offline.html`，可直接双击离线浏览。它嵌入同一份数据、页面源码与下载内容，单独保留这一个 HTML 文件即可使用。

GitHub Pages 的 Source 已由用户设为 **GitHub Actions**，无需再次操作。当前使用现有工作流检查、构建和部署；实际进度以[发布状态](docs/deployment-status.md)为准。

GitHub 官方说明：[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 使用与引用

引用时请注明项目名称、Excel 版本及数据指纹。保留原始来源的使用条件；本仓库公开展示不替第三方数据授予再许可。研究结果适合与其方法和数据限制一并阅读。
