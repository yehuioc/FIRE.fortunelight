# FIRE.fortunelight — v0.5.2 verified source archive

Status: **complete and restorable**.

This directory contains a compact, byte-verified source snapshot derived from the official `财富自由指南灯_微信小程序_v0.5.2.zip` release package.

## Identity

Official release ZIP SHA-256:

`a4704f476f5375b5bd833587dc392343669039d99561be4f187cc88f34967e37`

Decoded Zstandard archive SHA-256:

`59c9aebcf211576c8daad233a3ee92a956848987435e210d5ebc2a867c250b7e`

Base64 stream size: **83,672 characters**.

Transport parts:

- `source.tar.zst.b64.part00` through `part09`: 8,000 characters each
- `source.tar.zst.b64.part10`: 3,672 characters

Every GitHub blob was compared against the local source part with `git hash-object`; all 11/11 blobs matched byte-for-byte.

The reconstructed archive was then decoded, Zstandard-tested, extracted, and compared with the compact local source tree using `diff -qr`; all 36 source files matched.

## Scope

Included:

- app files
- pages
- utils
- project/config files needed to inspect the mini-program
- README / VERSION
- selected release-semantic documentation

Intentionally excluded from this compact transport archive:

- generated test output
- visual-test screenshots/output
- machine-local `project.private.config.json`
- other non-runtime QA artifacts

This is therefore an **exact compact source snapshot**, not a byte-for-byte copy of the full ~10 MB release ZIP.

## Restore

Linux/macOS/Git Bash:

```bash
cat archive/v0.5.2/source.tar.zst.b64.part* | base64 -d > source.tar.zst
echo "59c9aebcf211576c8daad233a3ee92a956848987435e210d5ebc2a867c250b7e  source.tar.zst" | sha256sum -c -
zstd -d -c source.tar.zst | tar -xf -
```

Restored tree:

```text
v0.5.2/
```

Windows PowerShell:

```powershell
$parts = Get-ChildItem archive/v0.5.2/source.tar.zst.b64.part* | Sort-Object Name
$b64 = ($parts | ForEach-Object { Get-Content $_ -Raw }) -join ''
[IO.File]::WriteAllBytes("source.tar.zst", [Convert]::FromBase64String($b64))
Get-FileHash source.tar.zst -Algorithm SHA256
zstd.exe -d source.tar.zst -o source.tar
tar -xf source.tar
```
