# 发布状态

**2026-09-24：本轮表格与导航交互修订已部署并实际验证。** [网站](https://lawrence35952563.github.io/National-Power/) · [功能提交 8f7aeb7](https://github.com/Lawrence35952563/National-Power/commit/8f7aeb7c111a594fc59c32927de59639fe3a5ef7) · [成功 Actions 35964560878](https://github.com/Lawrence35952563/National-Power/actions/runs/35964560878)。

本地和 CI 的 50 项测试通过。紧凑比较矩阵、多字段对照、主题列组合、国家页定位和浏览状态恢复已完成；真实桌面 1440×960、手机 390×844 实操及 23 个线上资源/下载请求通过。源 Excel、研究配置、解释文件和构建工作流未修改。[本轮完整验收](qa/interaction-release-2026-09-24.md)。

以下为上轮阅读体验修订及首发历史。

**2026-09-24：阅读体验修订已上线并实际验证。** [网站](https://lawrence35952563.github.io/National-Power/) · [源码提交 bb62cdb](https://github.com/Lawrence35952563/National-Power/commit/bb62cdb58b1b1620f07edbd374fcc6ff68e0527b) · [成功 Actions](https://github.com/Lawrence35952563/National-Power/actions/runs/35947808774)。

本地与 CI 的 42 项测试通过。新增导读、领域解释和明确阅读路径；名次与基础评分分开表达，空元信息省略，源码资源自动使用内容哈希版本。真实桌面/手机视口、线上子路径与下载、23 个 HTTP 请求均已复验。数据源未改。[本轮详细验收](qa/browser-release-2026-09-24.md)。

以下保留首次发布历史。


**2026-09-23：已上线并实际验证。** 网站：[https://lawrence35952563.github.io/National-Power/](https://lawrence35952563.github.io/National-Power/)。

## 可追溯发布证据

- 远端原始 `main` 为 `fa6a0aee2d5bf3bee3a21a2ff9177f165fd10912`，仅含空白 README。已经审阅并保留为首次发布提交的父提交。
- [首次工程提交 `92fb97b`](https://github.com/Lawrence35952563/National-Power/commit/92fb97bfc04bce3b6a800de013ddcc4da3247cf4)；通过 GitHub 官方 CLI 的认证调用 GitHub Git data API，以 `force: false` 更新 `main`。提交前后均检查了远端分支，未覆盖别人修改。
- [Actions 35825621835](https://github.com/Lawrence35952563/National-Power/actions/runs/35825621835)：build 和 deploy 均成功；日志显示 `Ran 34 tests`、`OK`，全部 1,891 个公式缓存已检查，10 个既有错误保留为警告。
- Pages 部署步骤于 2026-09-23 06:13:39 UTC 成功结束。随后实际 HTTP 检查及真实浏览器打开成功，不以工作流成功代替网站验收。
- Pages API 确认 `build_type: workflow`；保留用户既有 GitHub Actions Source 设置。分支当时未受保护，rulesets 为空；没有修改任何保护或审批规则。
- 工作流位于根目录 `.github/workflows/pages.yml`。提交的是源码；`dist/` 保持忽略，由工作流重新构建部署。

## 验证结果

- 本地 Windows 构建和 34 项测试通过；修复了实际复现的默认 GBK 读取 UTF-8 配置失败。
- 线上 18 个资源/数据/下载请求全部 HTTP 200。Excel 指纹完全匹配交接原件；全部 CSV 与本地生成结果逐字节一致。
- 桌面 1440×960，手机 390×844 / 360×800 的 Chromium 实际检查已执行。子路径资源、hash 路由、实体与比较分享刷新、下载均通过。
- 详细通过范围和未测项目：[浏览器与线上验收](qa/browser-release-2026-09-23.md)。

## 权限路径历史

本轮重新实测 GitHub 插件 `create_blob` 仍为 `403 Resource not accessible by integration`；账号 `push/admin` 标记并不表示插件具有实际写入权限。初始本地 Git 运行时缺失 HTTPS helper，GitHub CLI 无登录，内置浏览器也未登录。用户完成官方 CLI 设备授权后，正常认证的 GitHub API 成功发布，无需重新设置 Pages，无需提供聊天密码或令牌。旧权限错误已不再阻止本次发布。

## 后续更新

只替换 `data/source/national-power.xlsx`，先在 Excel 重算并保存，再提交 `main`。现有工作流按检查、构建、测试、部署顺序运行，研究结构变更或新增校验错误会阻断发布。公式、作者排名和评分仍由作者维护，网站不擅自重排。
