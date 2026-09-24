# 国家长期能力综合排名

这是“综合国力”Excel 的研究阅读网站。从综合位置进入实体档案，再通过八领域解释与具体字段，理解国家调动资源、维持长期行动的条件。网站同时保留完整原表、公式溯源、实体比较和数据下载。

**平时只需要维护一个 Excel，不需要修改网页。** 其余文件负责把 Excel 自动变成网站，正常更新数据时不用动。

**首发版本已于 2026-09-23 上线并完成实际验证。** [访问网站](https://lawrence35952563.github.io/National-Power/) · [首次成功部署](https://github.com/Lawrence35952563/National-Power/actions/runs/35825621835)。首发时 Windows 本地及 GitHub Actions 均通过 34 项测试，并用真实 Chromium 浏览器检查桌面和手机尺寸页面、路由、交互及下载。详细范围与未测项目见[首发浏览器和线上验收](docs/qa/browser-release-2026-09-23.md)。

**2026-09-24 上轮阅读体验修订已上线并复验。** 本地及 Actions 共 **42 项测试通过**；桌面、手机尺寸浏览器及 23 个线上资源/下载请求验证通过。新增研究导读与领域解释、修正名次显示，并解决旧浏览器缓存混用。[上轮验收记录](docs/qa/browser-release-2026-09-24.md) · [上轮部署](https://github.com/Lawrence35952563/National-Power/actions/runs/35947808774)。

**本轮表格与导航交互修订已部署并实际验证。** 新增 8 项测试，合计 **50 项本地与 Actions 测试通过**；桌面与 390 像素手机视口实操、23 个线上资源和下载检查通过。[功能提交 8f7aeb7](https://github.com/Lawrence35952563/National-Power/commit/8f7aeb7c111a594fc59c32927de59639fe3a5ef7) · [成功 Actions 35964560878](https://github.com/Lawrence35952563/National-Power/actions/runs/35964560878) · [本轮验收记录](docs/qa/interaction-release-2026-09-24.md)。

- 网站地址（已验证）：[国家长期能力综合排名](https://lawrence35952563.github.io/National-Power/)
- 第一次使用：[使用说明](docs/user-guide.md)
- 本次完成内容与发布状态：[交付说明](DELIVERY.md)

## 第一次怎样读

1. **研究导读**先解释研究的问题，再从综合排名选择一个熟悉的国家或实体。
2. **实体档案**把政治、经济、军事的领域名次与五项基础评分分开呈现；点击领域查看既有解释主题下的记录，也可选择 2–5 个实体比较。
3. **八个领域**说明每个领域在观察什么、与其他领域有什么联系，并提供具体字段入口。三个阅读分组只帮助理解，不改变原研究算法。
4. **数据与方法**集中提供来源与方法、字段目录、完整数据和下载。需要核对时，点击数值并展开高级溯源，查看原单元格与公式。

基础评分使用固定的 1–5 等级与文字解释，小数评分原样保留；名次和评分不画成能力比例条。综合排名中的领域和计算参考、实体页的明细与公式，以及方法页的权重说明均可按需展开。单位、年份和来源只在有明确记录时显示，缺失时省略，不补猜。

## 表格与比较怎样用

- **综合排名**可切换“简单榜单”和“领域总览”，公式参考值独立开关；把实体加入比较篮，再打开比较页。
- **实体比较**支持 2–5 个实体、最多 8 个原字段。按关键词、工作表和已有解释主题查找字段，切换筛选保留已选项。
- **完整数据**可使用已有主题列组合、搜索列名、自定义显示列及切换紧凑行距；“恢复完整原表”显示全部字段和辅助行。
- **实体档案**采用紧凑记录行，领域定位栏随滚动保留。按原有主题组织记录，其他记录、辅助字段和空记录均可访问，说明可折叠。
- **返回与分享**：浏览器后退会恢复该次访问的筛选、展开状态和滚动位置；顶部导航打开默认视图。地址栏保存可分享的筛选和选择，滚动位置只保存在当前浏览器会话中。

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
| `web/reading-guide.js` | 八领域的阅读分组、解释与字段链接；日常数字更新不用改 |
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

修订八领域导读文字时，编辑 `web/reading-guide.js`，并核对 `config/reader-notes.json` 中的报告释义与字段 ID。导读不保存国家数值，页面示例也从当前数据层读取；普通数字更新仍只替换 Excel。新增解释不构成新的评分或计算规则。

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
