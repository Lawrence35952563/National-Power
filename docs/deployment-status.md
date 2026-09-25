# 发布状态

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
