# V0.6.0 账本 Schema

## Expense transaction

```js
{
  id: 123,
  occurred_on: '2026-09-20',
  type: 'expense',
  amount: 18.5,
  category_id: 'meal',
  detail_tag: '日常吃饭',     // optional, <= 16 code points
  nature: 'necessary',       // necessary | adjustable | avoidable | unset
  note: '一食堂鸡腿饭',       // optional, <= 40 code points
  created_at: '...'
}
```

收入不需要消费分类字段；`opening_balance` 继续保持系统锁定语义。

## Storage

- `wfb.tx.index`：月份索引。
- `wfb.tx.YYYY-MM`：该月交易数组。
- `wfb.expensePresets`：用户快捷标签，最多 100 条。
- `wfb.transactions`：V0.5.x 旧 key，只作为迁移源；成功迁移后删除。

## Historical truth

V0.5.x 没有分类与消费性质事实，因此：

- `category_id = uncategorized`
- `nature = unset`

不做启发式猜测。
