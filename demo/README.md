# Fortune Light 六十秒演示

这支视频用一个完整例子解释价值主张：把收支翻译成可以支撑的自由天数，让每笔钱对长期选择权的影响可见。

## 播放与使用

主成片：[Fortune-Light-60s-1080p.mp4](output/Fortune-Light-60s-1080p.mp4)，存储路径为 `demo/output/Fortune-Light-60s-1080p.mp4`。规格为 60 秒、1920 × 1080、30 fps、H.264 / AAC，字幕直接写入画面，配有中文合成旁白和原创合成轻配乐。

同目录提供封面 `Fortune-Light-cover.png` 和独立字幕 `Fortune-Light-60s.zh.srt`。直接分享 MP4 即可，播放不依赖本地服务。

影片采用合成账本，未拍摄或使用个人真实收支。录屏来自本地 v1.0.0 的真实操作：手动日均成本 ¥100、净自由资源 ¥30,000，对应 300 天；新增财富 ¥3,000 后为 330 天；生活消耗 ¥300 后为 327 天。镜头保留实际点亮、熄灭、消费分析和完整账本，不用动画改写计算结果。日均成本是本例的明确假设，不是对未来生活成本的保证。

## 时间线

准确文案与时点唯一维护在 [story.json](story.json)，路径 `demo/story.json`。结构为：问题 → 价值主张 → 成本基准 → 收入增加自由时间 → 消费交换自由时间 → 回看选择 → 品牌收尾。

`assets/` 保存实际界面截图和收入 / 消费录屏；`stage.html` 负责字体、构图、镜头转场和说明动画。操作录屏为适应一分钟节奏做了剪辑和轻微变速，影片不是按实时操作时长计时的教程。

## 再制作

需要项目 Python 环境、Node.js / Playwright / Chromium、FFmpeg 和 Python NumPy。中文配音使用 Windows 本机的 Microsoft Yaoyao；字体使用 Windows 已安装字体，不随项目重新分发字体文件。配乐由 audio.py 直接合成，没有引用第三方歌曲或样本。

从项目根目录运行：

~~~powershell
$env:FFMPEG = '你的 ffmpeg 可执行文件路径'
# 如 Playwright 安装在另一个目录，可设置 PLAYWRIGHT_MODULE 为该包绝对路径
node demo/capture.cjs
.\demo\narrate.ps1
python demo/audio.py --ffmpeg $env:FFMPEG
node demo/render.cjs
node demo/check.cjs
~~~

可先执行 `node demo/render.cjs --stills` 检查关键画面。capture.cjs 自建合成 SQLite 和独立端口，不读取或覆盖 `data/ledger.db`。工作文件、配音中间件、解码帧与验收证据留在 `.work/`，最终视频在 `output/`；二者都不进入源码 Git，制作脚本与合成界面素材已保留。

验收包括真实账本计算、关键画面检查、完整视频 / 音频解码、浏览器跳转与完整播放，以及声音响度和峰值检查。最终输出的参数、SHA-256 和当前检查证据存放于 `output/verification.json`。
