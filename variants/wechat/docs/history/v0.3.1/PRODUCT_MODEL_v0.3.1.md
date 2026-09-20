# v0.3.1 产品与计算模型

## 1. 两种入口只改变输入，不改变公式

- 上手版：用户直接给出日均生活成本与记账起始资产，立即看到方格。
- 高级自主版：用户可以选择手动成本或账本自动成本，并调整原设计已经允许的覆盖项。

无论哪一种入口，最终都进入同一套原始数学模型。

## 2. 数学不变量（以最初《设计方案.md》为最高优先级）

账本自动成本：

`tracking_days = today - first_transaction_date + 1`

`avg_daily_expense = total_expense / tracking_days`

账本净储蓄：

`net_savings = total_income - total_expense`

由净储蓄购买的自由天数：

`income_freedom = floor(net_savings / avg_daily_expense)`，仅当 `net_savings > 0`。

如果用户选择纳入记账起始资产：

`asset_freedom = floor(initial_assets / avg_daily_expense)`

最终：

`freedom_days_bought = asset_freedom + income_freedom`

`lit_count = min(freedom_days_bought, future_cells)`

## 3. 手动成本与统计天数覆盖

这是原项目后续已经存在的高级能力，只用于替换公式中的输入项：

- 手动日均成本 > 0：用用户输入替代自动派生的 `avg_daily_expense`；
- 手动统计天数 > 0：用用户输入替代自动派生的 `tracking_days`。

它们不能修改后续自由天数的核心关系。

## 4. 为什么不再使用 v0.3.0 的 effective_wealth

`effective_wealth = initial_assets + income - expense` 是 v0.3.0 迁移过程中新增的另一种资金模型，并非最初设计。它虽然有另一套财务解释，但未经产品定义授权，因此 v0.3.1 已撤销。

以后任何版本若要改变核心数学模型，必须作为明确的产品决策单独讨论，不能在 UI/工程重构中顺带修改。
