# v0.4.3 · 对抗修复版

本版不增加周边功能，不改变已冻结的核心公式；只修复 V0.4.2 对抗测试暴露的主体正确性、语义反馈和异常运行路径。

- 货币整数边界改用 cents 计算。
- 保存起始自由本金时保留历史日期。
- 账本自动模式的成本首次建立/历史跨度重算使用 calibration 反馈，不播放误导性的 gain/loss ritual，不触发 FREE。
- ¥0.01 最小金额门禁。
- RitualGrid destroy/restart/draw failure Promise 必须 settle。
- 运行中 resize 同步 Canvas。
- 巨量音效事件限流。
- Storage 脏数据防护加强。

公式定义仍以 docs/MATH_INVARIANTS.md 为准。
