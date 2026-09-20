# FIRE.fortunelight — v0.6.2 verified runtime source archive

Status: **complete and restorable**.

This directory contains the exact compact runtime-source snapshot exported from the locally verified v0.6.2 release.

## Release identity

Official v0.6.2 release ZIP SHA-256:

`f9e9e1b21d460817097aa8bd89f68db82e4bc60d5b5868799d5dff7f0124a5bd`

Local Git bundle SHA-256:

`0ac1ea0eb2af6ba005c9b4a4f66c334584478d32a23f0bcc1511a676a390fcf4`

Local v0.6.2 source commit:

`b51bc8433de4810544bab25efc8a68b3bbce10f5`

Local annotated `v0.6.2` tag object:

`fe76da807dd5600c50cd3809d323e8b91d7b4eaf`

## Compact runtime archive identity

Decoded Zstandard SHA-256:

`b5c863cb584e9681b5618520e190bdb8632317a3ae66c24d9c03e615b23c2204`

Runtime-tree fingerprint:

`8f2c4abf935bdcef8d6db7a494bb021c1e75a4a156c419632b148fa2e834bde4`

Base64 stream size: **116,880 characters**.

Transport layout:

- `source.tar.zst.b64.part00` through `part13`: 8,000 characters each
- `source.tar.zst.b64.part14`: 4,880 characters

All **15/15 GitHub blobs** were read back and compared with the local source parts using Git blob SHA-1; every part matched byte-for-byte.

## Scope

The compact archive contains the executable/runtime project source:

- `app.js`, `app.json`, `app.wxss`
- `pages/`
- `utils/`
- `project.config.json`
- `sitemap.json`
- `VERSION.txt`
- project README and gitignore

It intentionally excludes generated QA output, visual-test screenshots, machine-local private config, and other non-runtime artifacts.

Therefore this is an **exact compact runtime-source snapshot**, not a byte-for-byte copy of the full release ZIP. The full release package is identified by the ZIP SHA-256 above.

## Restore

Linux / macOS / Git Bash:

```bash
cat archive/v0.6.2/source.tar.zst.b64.part* | base64 -d > source.tar.zst
echo "b5c863cb584e9681b5618520e190bdb8632317a3ae66c24d9c03e615b23c2204  source.tar.zst" | sha256sum -c -
zstd -d -c source.tar.zst | tar -xf -
```

The restored root is:

```text
v0.6.2/
```

Windows PowerShell:

```powershell
$parts = Get-ChildItem archive/v0.6.2/source.tar.zst.b64.part* | Sort-Object Name
$b64 = ($parts | ForEach-Object { Get-Content $_ -Raw }) -join ''
[IO.File]::WriteAllBytes("source.tar.zst", [Convert]::FromBase64String($b64))
Get-FileHash source.tar.zst -Algorithm SHA256
zstd.exe -d source.tar.zst -o source.tar
tar -xf source.tar
```

## Git-history note

The repository's `main` branch is an archive index/history branch. The local development Git history (v0.5.2 → v0.6.2) is separately identified by the Git-bundle hash above; this archive does not pretend that its archive commits are the original local development commits.
