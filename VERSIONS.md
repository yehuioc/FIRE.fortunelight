# FIRE.fortunelight version archive status

This file is the authoritative status index for source snapshots currently recoverable from this repository.

| Version | GitHub status | Location | Verification |
|---|---|---|---|
| v0.2.0 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.3.0 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.3.1 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.3.2 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.3.3 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.4.0 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.4.1 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.4.2 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.4.3 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.4.4 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.5.0 | Complete | `archive/all-versions/` | Included in verified historical Zstandard archive |
| v0.5.1 | **Pending exact source** | — | Original release identity is known, but exact source bytes have not yet been completely archived here |
| v0.5.2 | Complete | `archive/v0.5.2/` | 11/11 Git blobs match local source parts; reconstructed archive SHA-256 verified |
| v0.6.0 | Not separately archived | — | Exists in the local development Git history, but no independent GitHub source snapshot is published here |
| v0.6.1 | Not separately archived | — | Exists in the local development Git history, but no independent GitHub source snapshot is published here |
| v0.6.2 | **Complete** | `archive/v0.6.2/` | 15/15 Git blobs match local source parts byte-for-byte; compact runtime archive is restorable |

## Historical archive identity

For v0.2.0 through v0.5.0:

`d9d985c20132074df12b59e7f5ce5e865c784b24730e02d8107af3a824b4289e`

This is the SHA-256 of the decoded Zstandard archive in `archive/all-versions/`.

## v0.5.2 identities

Official release ZIP SHA-256:

`a4704f476f5375b5bd833587dc392343669039d99561be4f187cc88f34967e37`

Compact decoded Zstandard archive SHA-256:

`59c9aebcf211576c8daad233a3ee92a956848987435e210d5ebc2a867c250b7e`

## v0.6.2 identities

Official release ZIP SHA-256:

`f9e9e1b21d460817097aa8bd89f68db82e4bc60d5b5868799d5dff7f0124a5bd`

Compact runtime Zstandard archive SHA-256:

`b5c863cb584e9681b5618520e190bdb8632317a3ae66c24d9c03e615b23c2204`

Local development Git bundle SHA-256:

`0ac1ea0eb2af6ba005c9b4a4f66c334584478d32a23f0bcc1511a676a390fcf4`

Local v0.6.2 commit:

`b51bc8433de4810544bab25efc8a68b3bbce10f5`

The GitHub archive branch is not presented as the original local development commit history; it stores independently verified restorable snapshots.

## v0.5.1 boundary

The old `archive/v0.5.1-v0.5.2/` directory is a partial transfer and is not a valid recovery source.

v0.5.1 remains intentionally unresolved rather than being reverse-engineered from a later version.
