# 微信历史源码归档索引

本页只记录此前公开的微信源码快照及恢复证据。当前产品以根目录 [README.md](README.md) 的本地 Fortune Light 为主线，微信当前适配代码在 [variants/wechat](variants/wechat/README.md)。不要根据本页最高归档版本判断本地主线版本。

| 微信版本 | 归档状态 | 位置 | 已有恢复证据 |
|---|---|---|---|
| v0.2.0 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.3.0 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.3.1 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.3.2 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.3.3 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.4.0 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.4.1 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.4.2 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.4.3 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.4.4 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.5.0 | 完整 | `archive/all-versions/` | 已包含在验证过的历史 Zstandard 归档中 |
| v0.5.1 | **待取得精确源码** | — | 已知原版本身份，尚未完整归档其精确源码字节 |
| v0.5.2 | 完整 | `archive/v0.5.2/` | 11 个 Git 分块与原分块一致，重建归档的 SHA-256 已核对 |
| v0.6.0 | 未单独归档 | — | 存在本地开发历史，未在此单独发布源码快照 |
| v0.6.1 | 未单独归档 | — | 存在本地开发历史，未在此单独发布源码快照 |
| v0.6.2 | **完整** | `archive/v0.6.2/` | 15 个 Git 分块与原分块逐字节一致，可恢复紧凑运行源码 |

## 早期归档指纹

v0.2.0 至 v0.5.0：

`d9d985c20132074df12b59e7f5ce5e865c784b24730e02d8107af3a824b4289e`

上值是 `archive/all-versions/` 中解码后的 Zstandard 归档 SHA-256。

## v0.5.2 指纹

原发布 ZIP 的 SHA-256：

`a4704f476f5375b5bd833587dc392343669039d99561be4f187cc88f34967e37`

紧凑 Zstandard 归档解码后的 SHA-256：

`59c9aebcf211576c8daad233a3ee92a956848987435e210d5ebc2a867c250b7e`

## v0.6.2 指纹

原发布 ZIP 的 SHA-256：

`f9e9e1b21d460817097aa8bd89f68db82e4bc60d5b5868799d5dff7f0124a5bd`

紧凑运行源码 Zstandard 归档的 SHA-256：

`b5c863cb584e9681b5618520e190bdb8632317a3ae66c24d9c03e615b23c2204`

原本地开发 Git bundle 的 SHA-256：

`0ac1ea0eb2af6ba005c9b4a4f66c334584478d32a23f0bcc1511a676a390fcf4`

原本地 v0.6.2 提交：

`b51bc8433de4810544bab25efc8a68b3bbce10f5`

此前的 GitHub 归档提交保存经过核对的可恢复快照，不冒充原微信本地开发提交历史。本地主线整合保留了这些既有提交与原归档文件。

## v0.5.1 缺口

旧 `archive/v0.5.1-v0.5.2/` 目录只有部分传输内容，不能作为完整恢复源。

v0.5.1 继续保留缺口，不用后续版本倒推伪造。
