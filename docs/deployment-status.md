# 发布状态

## 2026-09-25 单位与作者编码补充

基于 `34261b871fc6cfa4a01955af36525c13606f199b`，按作者授权补充数量字段单位与编码释义。82 个字段新增单位，4 个字段补全或修正；指数和六项依据不足的数量字段不补猜。天时地利人和、北约、防空反导零值、高级非核潜艇及历史航母标记，在各数据页面显示释义和原码。两列“铝”名称不变，不增加朝鲜实体警告。

Excel、原数值、名次、权重和公式保持不变；单 Excel 自动更新流程继续使用。63 项本地测试及桌面、390px 手机视口专项检查通过，详见[检查记录](qa/units-and-author-codes-2026-09-25.md)。

已部署功能提交 [27690e2](https://github.com/Lawrence35952563/National-Power/commit/27690e25f750f98832b1e5bcfd6d657038f55552)，[Actions 36115350079](https://github.com/Lawrence35952563/National-Power/actions/runs/36115350079) 成功。正式 Pages 的新增释义、单位、手机显示和 Excel 下载已实际验证，24 项线上资源检查通过。

## 2026-09-25 阅读文案微调

基于 `a23a175c5a7a0a8e02481c329e93f6dc0eb029b8`，仅调整展示文案和领域卡片标题：研究说明恢复“三项排名、五项评分”两组；政治、经济、军事、交通等领域名称作大标题，下方一行小字介绍。移除三个抽象模块和重复释义，简化首页、排名、实体和比较页的重复提示。数据年份、估算和特殊记录的完整说明改为按需展开。

八领域的详细解释、24 个主题及字段映射保持完整；Excel、计算脚本、评分规则、格式化及军事编码未改。原有 56 项测试通过。真实浏览器在 1440px 和 390px 检查两组八张卡片、标题字号、交通详情、返回导航及说明展开，无页面横向溢出。

本轮功能变化仅涉及 `web/app.js`、`web/reading-guide.js`，继续使用原 Actions 构建部署流程。

## 2026-09-25 改版

已部署并实际验证 [本轮网站](https://lawrence35952563.github.io/National-Power/)。接手时最新 main 为 `34598abd02cd48f0f27530e1095d262ac4082681`，只增量合并 12 个变化路径；功能提交为 [e7357d7](https://github.com/Lawrence35952563/National-Power/commit/e7357d716277394dde165015054219741517a612)。

[Actions 36107219970](https://github.com/Lawrence35952563/National-Power/actions/runs/36107219970) 构建与部署成功，实际日志确认 56 项测试通过。桌面及 390/360 像素真实浏览器验收通过；部署后在实际 Pages 复验了搜索返回、分享比较、手机宽表及 Excel 下载。24 项线上资源请求成功，发布内容对应本次构建。

交接环境此前 GitHub 集成创建 tree/branch 的 403 记录保留在 QA 历史段。本次通过既有 GitHub CLI 认证正常读取并提交远端，非强制更新 main；没有改变保护、工作流或 Pages 设置。

[本轮交付状态](../DELIVERY.md) · [实际检查记录](qa/editorial-refresh-2026-09-25.md)

## 上一次成功发布

[当前网站](https://lawrence35952563.github.io/National-Power/) · [2026-09-24成功运行](https://github.com/Lawrence35952563/National-Power/actions/runs/35965032568)

历史验收保留在以下文件，不能当作本轮新界面的验收：

- [首发验收](qa/browser-release-2026-09-23.md)
- [阅读体验验收](qa/browser-release-2026-09-24.md)
- [表格与导航交互验收](qa/interaction-release-2026-09-24.md)

GitHub Pages 的 Source 保持 GitHub Actions。日常替换 `data/source/national-power.xlsx` 并提交 main 后，仍由原工作流校验、生成、测试并部署。物理设备、其他浏览器及离线本地文件浏览的未测范围见本轮实际检查记录。
