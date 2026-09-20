# 财富自由指南灯 · 微信平台变体

本目录保留用户提供的微信小程序 v0.6.2 源码，作为 Fortune Light 的微信平台变体持续维护。仓库主入口是上两级 [README.md](../../README.md)；本地版与微信版独立编号，不要求复制相同页面或存储架构。

## 运行和验证

在微信开发者工具中导入本目录，按实际账号配置 appid。随包的 touristappid 不是正式发布身份。个人开发工具设置使用被 Git 忽略的 project.private.config.json。

已有测试：

~~~bash
bash tests/run_all.sh
~~~

该入口依赖 Node.js、Python 和 Python Playwright；最后的视觉脚本还需要 Chromium。Node 用例和 static_check.py 可分别执行。自动化模拟与 Canvas 渲染检查不替代微信开发者工具及真机验证。本次整合通过现有 Node 回归和静态检查，没有执行小程序发布、备案或真机验收。

## 与本地主线的关系

共享自由事件语义、精确金额、成本校准、分类分析和记录习惯思想。本地使用 SQLite 与浏览器，微信保留 wx Storage 分桶和小程序页面。用户从微信导出的 v1 / v2 JSON 可以导入本地；两端没有自动同步。

当前源码版本以 VERSION.txt 和 app.js 为准；功能、运行代码和测试位于 pages、utils、tests。本地 README 与设计方案是本次整合的当前说明。

## 来源材料

源码来自用户提供的 v0.6.2 ZIP，完整来源指纹见仓库根 README。docs 与 visual_test 是随该包导入的历史需求、验证和视觉参考，属于上游来源快照；其中旧版本状态与完成声明不是本仓库本次发布的验收结论。原始 ZIP 保存在本机忽略目录 reference，未复制个人 project.private.config.json。
