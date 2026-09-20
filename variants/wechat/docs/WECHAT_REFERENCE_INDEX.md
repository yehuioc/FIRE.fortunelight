# 财富自由指南灯 · 微信小程序技术资料索引

长期优先级：微信开放文档 > 微信官方/腾讯官方示例与 WeUI > 可靠镜像/社区验证 > 普通 Web 经验。

## 项目结构与生命周期
- https://developers.weixin.qq.com/miniprogram/dev/framework/structure.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/page-life-cycle.html

## WXML / WXSS
- https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/
- https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html

## 基础组件
- Canvas 2D：https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html
- Canvas 导出临时图片：https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.canvasToTempFilePath.html
- Scroll View：https://developers.weixin.qq.com/miniprogram/dev/component/scroll-view.html
- Page Meta：https://developers.weixin.qq.com/miniprogram/dev/component/page-meta.html
- Picker：https://developers.weixin.qq.com/miniprogram/dev/component/picker.html
- Input：https://developers.weixin.qq.com/miniprogram/dev/component/input.html
- Button：https://developers.weixin.qq.com/miniprogram/dev/component/button.html

## 系统 UI
- 导航栏颜色：https://developers.weixin.qq.com/miniprogram/dev/api/ui/navigation-bar/wx.setNavigationBarColor.html
- 窗口信息：https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getWindowInfo.html

## Storage
- https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html
- https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.getStorageSync.html

## 微信视觉体系参考
- 微信官方设计团队 WeUI：https://github.com/Tencent/weui-wxss

## 备案
- 工信部 APP 备案通知：https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html

## 本项目当前明确决策
- 不使用 H5 DOM API。
- 不把新版 Canvas 机械当作旧原生层级模型，但仍通过“首启/首页互斥渲染”规避层级耦合。
- 高信息量第四页用 scroll-view，不让底部按钮与正文互相覆盖。
- 主题换色使用页面根 class + `wx.setNavigationBarColor` + Canvas palette。
- 上手版不依赖记账天数；高级账本模式才暴露统计天数。
- v0.3.2 起，可见人生方格使用“透明 Canvas 2D 绘制 → canvasToTempFilePath → 普通 image 展示”，避免滚动时 Canvas 内容延迟归位。
- v0.3.3 起，上手版与高级自主版共享同一个原始账本内核；上手版通过“起始自由本金”系统基准收入简化初始化，高级版只开放更多输入控制。
