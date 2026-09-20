# 财富自由指南灯 · 微信小程序技术基线

更新时间：2026-08-21
适用版本：v0.3.2 起（历史规则继续保留）

这份文档是后续开发、修复、评审的长期技术约束。遇到微信渲染、生命周期、基础组件或系统 API 问题时，优先回查微信开放文档，不套用普通 Web/H5 经验。

## 1. 原生项目结构

固定结构：

```text
app.js
app.json
app.wxss
pages/<page>/<page>.js
pages/<page>/<page>.json
pages/<page>/<page>.wxml
pages/<page>/<page>.wxss
utils/
```

`app.json.pages` 注册的每个页面，本项目强制四件套齐全。自动测试负责阻止再次出现“注册了页面但漏包 guide.js”这类错误。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/framework/structure.html

## 2. WXML/WXSS 不是 HTML/CSS 浏览器环境

- 禁止 `window` / `document` / DOM API。
- 视图查询使用 `wx.createSelectorQuery()`。
- 状态更新使用 `setData`。
- WXML 只使用小程序基础组件；禁止 `div/span/br/b/small` 等 HTML 标签。
- 布局优先 Flex。
- 不依赖 `backdrop-filter`、复杂 CSS Grid、自定义变量等跨渲染器差异较大的能力。
- `wx:for` 必须有稳定 `wx:key`。

标题换行必须通过多个 `view/text` 结构实现，不写 `<br/>`。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/framework/
- https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html

## 3. Canvas 2D 与人生方格滚动 / 仪式策略

绘制只使用新版 Canvas 2D。V0.4.0 起明确拆成两个互不混用的 Canvas 角色：

1. `lifeCanvas`：静态方格快照生成器。节点固定在可视滚动区域之外，只负责绘制并通过 `wx.canvasToTempFilePath({ canvas })` 导出普通 PNG；首页真正滚动展示的是 `<image>`。
2. `ritualCanvas`：实时仪式舞台。只有交易导致 `lit_count` 发生整数格变化时才创建；它位于 `position: fixed` 的全屏遮罩中，不参与页面滚动。仪式结束即销毁。

这样同时满足两件事：

- 日常滚动时绝不让实时 Canvas 跟随页面，规避此前真机/模拟器快速滚动出现的拖影和延迟归位；
- 真正需要“点亮/熄灭”时，允许固定视口 Canvas 使用 `requestAnimationFrame` 做 Camera 追焦、逐格绽放/黯淡和回到全局。

实时仪式的底线：Canvas 只能改变视觉表现，最终格数永远来自 `computeStats()`；动画失败或被跳过时，必须立即回退到最终数据和最终静态快照，不能反过来修改账本。

性能策略：优先使用 `wx.createOffscreenCanvas({ type: '2d' })` 缓存完整静态方格背景，每帧只对缓存图做 Camera 变换并绘制正在变化的一小段格子；逻辑层的 `setData` 只低频同步文字进度，不允许每帧桥接。

官方参考：

- Canvas 组件：https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html
- Canvas.requestAnimationFrame：https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.requestAnimationFrame.html
- OffscreenCanvas：https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html
- Canvas 导出图片：https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.canvasToTempFilePath.html

## 4. 首次引导与滚动

首次引导不是盖在首页上的超大浮层，而是独占渲染分支：

```xml
<block wx:if="{{showOnboarding}}">...</block>
<block wx:else>...Canvas...</block>
```

v0.3.0 第四页信息量因“上手版 / 高级版”而增加，因此正文区使用 `scroll-view`，底部分页点与操作按钮独立固定在首启页面布局底部。

目的：
- 小屏能滚动；
- 底部操作不会覆盖字段；
- 不与 Canvas 争层级；
- 不依赖无限堆 `z-index`。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/component/scroll-view.html
- https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html

## 5. 输入字段与按钮对齐

微信 `button/input` 是基础组件，不能把 Web 浏览器默认基线当作可靠前提。

本项目规则：
- 主按钮使用 `display:flex; align-items:center; justify-content:center`，不再只依赖 `line-height == height`。
- 输入框显式给定 `height`；需要稳定垂直基线时同时给 `line-height`。
- 表单行使用明确宽度和 Flex 对齐，避免 picker/input 的默认尺寸差异产生偏移。
- 每版视觉检查必须专门查看按钮文字和字段文字是否居中。

## 6. 生命周期

Canvas：
- `onReady` 后初始化；
- 引导完成后，等待视图更新再查询 Canvas；
- `onShow` 从设置页返回时重读设置、主题和账本；
- `onResize` 重算 Canvas；
- `onUnload` 清理定时器与节点引用。

不要在 `onLoad` 直接查询尚未渲染的 Canvas。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/page-life-cycle.html

## 7. 主题系统

v0.3.0 开始主题是正式产品能力。

主题对象统一放在 `utils/theme.js`：
- 页面 class；
- 页面背景；
- 导航栏背景/前景；
- Canvas 调色板。

当前主题：
- `midnight` / 深夜金；
- `paper` / 纸上自由。

页面使用根 class 覆盖 WXSS；系统导航栏通过 `wx.setNavigationBarColor` 同步切换。该 API 的 `frontColor` 只使用 `#ffffff` 或 `#000000`。

不要把主题颜色写进计算模型。主题只改变展示。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/api/ui/navigation-bar/wx.setNavigationBarColor.html
- 微信官方设计团队 WeUI：https://github.com/Tencent/weui-wxss

## 8. 本地 Storage 与升级兼容

当前仍为本地优先：不登录、不上传账本。

v0.3.0 使用稳定 key：
- `wfb.settings`
- `wfb.transactions`
- `wfb.onboarding`
- `wfb.nextId`

并透明读取旧 `wfb.v020.*` 后迁移，避免版本号继续写进主 key 导致每次升级都断数据。

正式长期运营前仍需要导出/导入或可选云备份。

参考：
- https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html

## 9. 数学模型边界（v0.3.3）

上手版与高级自主版必须共享同一个核心公式：

`tracking_days = today - first_valid_transaction_date + 1`

`avg_daily_expense = total_expense / tracking_days`（或用户手动指定）

`net_savings = total_income - total_expense`

`income_freedom = floor(net_savings / avg_daily_expense)`（仅正净储蓄）

`asset_freedom = floor(initial_assets / avg_daily_expense)`（仅高级版可选的额外资产扩展）

`freedom_days_bought = asset_freedom + income_freedom`

`lit_count = min(freedom_days_bought, future_cells)`

上手版不得拥有第二套余额公式。为了立即得到结果，“起始自由本金”作为系统基准收入进入账本，因此后续普通支出会通过 `net_savings` 真实减少自由天数。高级版只开放更多输入控制权，不改变计算内核。

详细约束见项目 `docs/MATH_INVARIANTS.md`。

## 10. 首次体验原则

1. 前三页先讲核心理念、心态、反馈。
2. 不再强迫“先记录 7 天”。
3. 第四页把选择权交给用户：上手版 / 高级自主版。
4. 上手版必须第一次配置后立即得到可解释结果。
5. 高级版允许用户接管模型假设。
6. 支出不使用羞辱/惩罚措辞。
7. 明确不是投资建议、不是寿命预测、不是预算警察。

## 11. 发布与备案

正式发布前仍必须：
1. 真实 AppID；
2. 与实际功能一致的服务类目；
3. 小程序备案；
4. 按真实数据行为填写隐私保护说明；
5. 上传体验版；
6. iOS + Android 真机验收；
7. 提审；
8. 审核通过后发布。

备案权威来源：
- https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html

## 12. 每个版本强制验收门

### 自动检查
- JSON 解析；
- 注册页面四件套；
- JS 语法；
- WXML 标签白名单/平衡；
- 事件处理器存在；
- `wx:for` 稳定 key；
- 禁止浏览器 API / 已停止维护 API；
- 首启与 Canvas 互斥；
- 可滚动首页的人生方格必须来自 Canvas 导出的普通 image；实时 Canvas 只允许存在于固定视口的交易仪式遮罩中；
- 禁止 `wx.vibrateShort` 作为交易反馈；
- 模式选择结构存在；
- 主题选择结构存在；
- 不允许生产文案重新出现“7 天观察期”；
- 主交易按钮必须 Flex 居中；
- 数学模型、Storage、页面流程、升级迁移测试通过。

### 视觉检查
至少覆盖：
- 390×844；
- 360×800；
- 320×568；
- 两套主题；
- 第四页上手版 / 高级版；
- 设置页；
- 首页；
- 按钮文字与字段基线；
- 无横向溢出、遮挡、离屏；
- 首页快速上下滚动时人生方格必须与卡片同步移动，不允许出现拖影/延迟归位；
- 收支后方格数量与顶部自由天数必须同步变化。

### 微信最终验收
容器不能替代：
- 微信开发者工具编译；
- 微信模拟器；
- iOS 真机；
- Android 真机。

未经最后一关，不称“正式发布版”。
