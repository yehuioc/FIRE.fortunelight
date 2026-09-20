# Fortune Light 六十秒演示

这支视频用一个完整例子解释价值主张：把收支翻译成可以支撑的自由天数，让每笔钱对长期选择权的影响可见。

## 播放与使用

公开演示：[在作品页观看日语配音版](https://yehui-personal-space.chalky-beech-3411.chatgpt.site/work-fire-fortunelight.html#demo)，可直接播放与下载，无需运行制作环境。

本机生成的主成片路径为 `demo/output/Fortune-Light-60s-1080p.mp4`。规格为 60 秒、1920 × 1080、30 fps、H.264 / AAC，字幕直接写入画面，配有中文合成旁白和原创合成轻配乐。`output/` 属于生成物，不随 Git 源码下载。

同目录提供封面 `Fortune-Light-cover.png` 和独立字幕 `Fortune-Light-60s.zh.srt`。直接分享 MP4 即可，播放不依赖本地服务。

## GPT-SoVITS 中日配音

已使用作者提供的权重和日语参考音频，制作中文、日文两个 60 秒配音版本。制作时的权重目录标注为 `v2ProPlus`，运行时按文件内容识别为 **v4 LoRA**，并使用匹配底模加载；没有修改安装目录里的权重或默认配置。仓库不包含这些模型、参考音频或其授权，重新制作时须自行提供可使用的材料。

| 语言 | 纯人声，48 kHz / 24 bit / 单声道 | 带原配乐的视频预览 | 配音字幕 |
| --- | --- | --- | --- |
| 中文 | [中文 WAV](output/Fortune-Light-60s-GPTSoVITS-zh.wav) | [中文 MP4](output/Fortune-Light-60s-GPTSoVITS-zh.mp4) | [中文 SRT](output/Fortune-Light-60s-GPTSoVITS-zh.srt) |
| 日文 | [日文 WAV](output/Fortune-Light-60s-GPTSoVITS-ja.wav) | [日文 MP4](output/Fortune-Light-60s-GPTSoVITS-ja.mp4) | [日文 SRT](output/Fortune-Light-60s-GPTSoVITS-ja.srt) |

具体存储目录为本仓库的 `demo/output/`，文件名见上表；这些链接在完成本机生成后可用。两版视频沿用原有中文界面和画面内中文字幕，日文 SRT 作为独立文件提供，画面没有进行日文化重制。

本次在 RTX 4070 SUPER 上，以半精度、逐句、单条推理运行：PyTorch 峰值预留为 **2,392 MiB（约 2.34 GiB）**，张量分配峰值为 2,211 MiB。完整合成运行中，整卡占用从 5,793 MiB 到观测峰值 9,224 MiB，增量约 **3.35 GiB**；此增量包含运行开销，也可能受其他程序占用变化影响。脚本将 PyTorch 分配器预算限定在 5 GiB，为用户要求的 6 GB 预算留出余量。任务完成后推理进程退出，显存释放。

内容检查采用本机 Whisper 逐句转写，并对“一百元”“三百天选择权”等关键短句重新取样后选用更清楚的版本。中文跨语言合成仍有少量短句在自动识别中出现音近字偏差；日文也有同音词识别差异。没有将自动检查宣称为人工听感评审，当前版本适合先试听。媒体检查确认时长、音轨参数、完整解码和原画面保持一致。

中文文案仍以 `story.json` 为准；日文文案在 `narration.ja.json`，参考台词在 `reference.ja.json`。`narrate_gptsovits.py` 调用已有安装，配置与缓存留在 `.work/gptsovits/`；`compose_gptsovits.py` 对齐既有时间轴、复用原配乐并导出文件。当前选用片段记录在 `.work/gptsovits/synthesis-selected.json`，输出参数、哈希与检查结果在 `output/gptsovits-verification.json`。

在项目根目录重新合成，可使用：

~~~powershell
$gsvRoot = '你的 GPT-SoVITS 安装目录'
& "$gsvRoot/runtime/python.exe" -B -u demo/narrate_gptsovits.py --gsv-root $gsvRoot --gpt-weight '你的 GPT 权重文件' --sovits-weight '你的 SoVITS 权重文件' --reference '你的参考音频文件' --prompt-json demo/reference.ja.json
python -B demo/compose_gptsovits.py --ffmpeg '你的 FFmpeg 7+ 可执行文件' --manifest demo/.work/gptsovits/synthesis-selected.json
~~~

先把 `reference.ja.json` 中的台词改成所用参考音频的准确台词。第二条命令重建本次已选定的声音；新下载的源码没有私有 `synthesis-selected.json`，使用新一轮合成结果时应将 `--manifest` 改为第一条命令生成的 `synthesis-<seed>.json`。这两个脚本不会训练模型或上传参考音频。

影片采用合成账本，未拍摄或使用个人真实收支。录屏来自本地 v1.0.0 的真实操作：手动日均成本 ¥100、净自由资源 ¥30,000，对应 300 天；新增财富 ¥3,000 后为 330 天；生活消耗 ¥300 后为 327 天。镜头保留实际点亮、熄灭、消费分析和完整账本，不用动画改写计算结果。日均成本是本例的明确假设，不是对未来生活成本的保证。

## 时间线

准确文案与时点唯一维护在 [story.json](story.json)，路径 `demo/story.json`。结构为：问题 → 价值主张 → 成本基准 → 收入增加自由时间 → 消费交换自由时间 → 回看选择 → 品牌收尾。

重新录制旁白可直接使用 [配音文案](配音文案.md)，路径 `demo/配音文案.md`。这是当前成片的交接副本，包含逐句入点、出点、画面时间轴和留白说明。

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
