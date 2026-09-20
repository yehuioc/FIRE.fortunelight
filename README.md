---
project_id: fortune
project_type: local-personal-finance-app
git_mode: independent
---

# 财富自由指南灯 · Fortune Light

把现有自由资源，按你选择的生活成本估计，翻译成可以自主支配的天数。每一格是一天；消费是用未来自由交换今天的价值。

本仓库以 Python + 浏览器的本地应用为主线，当前发布为 **1.0.0**。微信小程序作为平台变体保留在 [variants/wechat](variants/wechat/README.md)，独立沿用 **0.6.2** 的产品版本。两者共享理念和计算边界，各自维护适合平台的交互与存储实现。

## 直接使用

安装 Python 3.10 或更新版本，在项目目录运行：

~~~powershell
# Windows
.\run.ps1
# 或直接运行
python run.py
~~~

~~~bash
# macOS / Linux
bash run.sh
~~~

打开 http://127.0.0.1:8766 。首次启动会建立项目内的 .venv 并安装依赖，需要网络；依赖齐全后不再每次安装，可以离线运行。按 Ctrl+C 停止。可用 `python run.py --port 8767 --no-browser` 换端口或不自动开浏览器；开发时另加 `--reload`。

首次使用填写出生日期、目标年龄、日均生活成本和起始自由本金，即可开始。已有本地账本会自动升级并保留事实；已有微信 JSON 备份可从首屏恢复。

## 现在可以做什么

- 用“新增财富 / 生活消耗”记录自由事件，按完整天数播放点亮或熄灭仪式；可跳过、关闭动画与声音。
- 在上手模式手动估计成本；高级模式支持账本估计、观察天数覆盖、过去人生和独立资产桶。
- 用主分类、快捷标签和消费性质记录真实花费；在完整账本搜索、分页、修正、删除记录。
- 查看周、月、年消费分析、同期比较、分类或标签趋势，并导出可读 CSV。
- 查看真实记录的连续性、覆盖率、十二周活动格、成就、常用入口与上周回顾；可逐项关闭。
- 切换深夜金 / 纸上自由、系统字体 / 宋体、85%–115% 字号和首页模块顺序；随时重看使用指南。
- 导出完整 JSON，在恢复预览后替换账本；支持读取微信 v1 / v2 备份。

产品语义与操作见 [使用指南.md](使用指南.md)；分类方法见 [记账分类标准.md](记账分类标准.md)；计算、接口与变体映射见 [设计方案.md](设计方案.md)。这些文件位于仓库根目录。

60 秒产品演示及可复用的制作源码见 [demo/README.md](demo/README.md)，具体入口为 `demo/README.md`。视频用合成账本演示自由时间如何随真实收支变化。

## 数据和隐私

唯一主账本是 `data/ledger.db`，数据库升级、JSON 恢复、账单写入和演示重置前的自动备份在 `data/backups/`。界面导出的 JSON / CSV 保存到浏览器选择的下载位置；跨设备搬迁使用 JSON。JSON 恢复会替换账本、设置和快捷标签，先核对预览。

应用仅绑定 127.0.0.1，不依赖云账号、遥测、远程字体或 CDN；没有部署到公网的认证设计。不要把监听地址改成公开地址。本地数据不等于灾备，请自行保留一份离机备份。

`data/`、`imports/`、历史个人 `memory/`、`.venv/`、`reference/`、`tmp/`、`.evidence/`、`releases/`、私有微信开发配置和环境变量文件均不进入 Git 或源码发行包。测试只用项目 tmp 下的合成账本。

## 开发与验证

~~~powershell
.venv/Scripts/python -m unittest discover -s tests -p 'test_*.py' -v
# 可选浏览器验收，需要本机 Node.js、playwright 和 Chromium
npm install --no-save playwright
npx playwright install chromium
node tests/browser.cjs
~~~

Unix 将 Python 路径替换为 `.venv/bin/python`。浏览器可通过 `FORTUNE_BROWSER` 指定；Python 可通过 `FORTUNE_TEST_PYTHON` 指定。测试浏览器的临时目录与截图都留在本项目。核心后端无 Node 构建步骤。

微信变体的测试入口与官方运行时限制见其 README。自动化浏览器验证在 Windows / Chromium 完成；macOS、Linux 和微信真机没有在本次发布中实测。

## Git 与来源

本目录是独立 Git 仓库，主分支为 main。迁移基线 commit 保留此前本地源码，随后提交为本地主线；本地 1.0.0 不冒充微信 0.6.2，也不补造不存在的旧版本 tag。外层 AgentV2 仓库只负责项目导航，不再跟踪这里的代码。

微信参考源是用户提供的 `财富自由指南灯_微信小程序_v0.6.2.zip`，SHA-256：
`f9e9e1b21d460817097aa8bd89f68db82e4bc60d5b5868799d5dff7f0124a5bd`。

这是本地交付，没有创建 GitHub 远程仓库或公开发布。公开分发的许可证待权利人确认；当前不代替原始代码权利人作出授权。
