# 发布状态

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
