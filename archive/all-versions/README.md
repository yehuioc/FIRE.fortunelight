# FIRE.fortunelight — historical source archive

This directory contains the recoverable source snapshots for every complete release currently available in the project history:

- v0.2.0
- v0.3.0
- v0.3.1
- v0.3.2
- v0.3.3
- v0.4.0
- v0.4.1
- v0.4.2
- v0.4.3
- v0.4.4
- v0.5.0

## Scope

The archive keeps the executable mini-program source needed to inspect/rebuild each release (app/pages/utils/config/readme/version files).

Generated visual-test screenshots, test output, docs generated during QA, and project.private.config.json were intentionally excluded from this compact GitHub transport archive. Repository-wide completion and integrity status is recorded in /VERSIONS.md.

## Archive identity

Decoded Zstandard archive SHA-256:

`d9d985c20132074df12b59e7f5ce5e865c784b24730e02d8107af3a824b4289e`

Base64 stream size: 92,416 bytes.

## Restore on Linux/macOS/Git Bash

```bash
cat archive/all-versions/source.tar.zst.b64.part* | base64 -d > source.tar.zst
echo "d9d985c20132074df12b59e7f5ce5e865c784b24730e02d8107af3a824b4289e  source.tar.zst" | sha256sum -c -
zstd -d -c source.tar.zst | tar -xf -
```

The restored tree is:

```text
fire_all_versions_essential/
  v0.2.0/
  v0.3.0/
  v0.3.1/
  v0.3.2/
  v0.3.3/
  v0.4.0/
  v0.4.1/
  v0.4.2/
  v0.4.3/
  v0.4.4/
  v0.5.0/
```

## Windows PowerShell

PowerShell does not have a universal built-in zstd decoder. Concatenate the Base64 pieces first, decode them, then use a locally installed `zstd.exe`:

```powershell
$parts = Get-ChildItem archive/all-versions/source.tar.zst.b64.part* | Sort-Object Name
$b64 = ($parts | ForEach-Object { Get-Content $_ -Raw }) -join ''
[IO.File]::WriteAllBytes("source.tar.zst", [Convert]::FromBase64String($b64))
Get-FileHash source.tar.zst -Algorithm SHA256
zstd.exe -d source.tar.zst -o source.tar
tar -xf source.tar
```
