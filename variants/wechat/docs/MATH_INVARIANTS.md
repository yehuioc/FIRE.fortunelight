# 财富自由指南灯 · 数学不变量（v0.3.3）

这份文件是计算内核的最高优先级约束。UI、主题、上手版/高级版、动画都不能擅自改变它。

## 1. 一个内核

无论上手版还是高级自主版，都使用同一个核心模型：

```text
tracking_days = today - first_valid_transaction_date + 1
avg_daily_expense = total_expense / tracking_days
net_savings = total_income - total_expense
income_freedom = floor(net_savings / avg_daily_expense)   # 仅 net_savings > 0
freedom_days_bought = income_freedom + asset_freedom
lit_count = min(freedom_days_bought, future_cells)
```

高级版可以手动指定 `avg_daily_expense`，或覆盖 `tracking_days`。这些行为只是替换输入，不允许改写 `net_savings → freedom_days` 的数学关系。

## 2. 上手版不是第二套公式

为了做到“第一次打开就能看到结果”，上手版允许用户填写：

- 日均生活成本；
- 起始自由本金。

其中“起始自由本金”会作为一笔系统基准收入写入账本。因此它仍然进入：

```text
net_savings = total_income - total_expense
```

例如：

- 起始自由本金 ¥10,000；
- 日均成本 ¥100；
- 初始自由日 = 100；
- 支出 ¥50 后，净储蓄 = ¥9,950，自由日 = 99；
- 再支出 ¥1,100 后，净储蓄 = ¥8,850，自由日 = 88。

这是数据初始化方式的简化，不是公式分叉。

## 3. 可选的额外起始资产扩展

原项目 README / 使用指南后来加入了一个可选扩展：

```text
asset_freedom = floor(initial_assets / avg_daily_expense)
```

它和 `income_freedom` 分开计算：

```text
freedom_days_bought = asset_freedom + income_freedom
```

必须明确告诉用户：这部分“额外起始资产”是独立资产桶，不进入净储蓄，因此后续负净储蓄不会直接从这个桶里扣钱。不要把同一笔资金同时填为“起始自由本金”和“额外起始资产”。

## 4. 方格只显示完整天数

内部可以存在 99.50 天，但 `lit_count` 只显示完整天数。交易发生后：

- 跨过整数边界 → 点亮 / 熄灭方格；
- 没跨边界 → 方格不变，但反馈必须解释精确值和真实原因；
- 已全部点亮 → 变化进入 overflow，不得提示“下一格”。

## 5. 永久禁止

- 不得重新引入 `current_assets / daily_cost` 作为上手版独立公式；
- 不得引入 `effective_wealth = initial_assets + net_change` 替代原模型；
- 不得为了动画好看修改 `lit_count`；
- 不得让上手版和高级版在相同输入下得到不同公式结果。

> 数据是真相，动画是仪式。仪式服从真相。
