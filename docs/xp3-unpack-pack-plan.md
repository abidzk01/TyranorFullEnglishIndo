# XP3 Unpack/Pack Feature Plan (Standalone Unpack / Pack Tool Page)

> Status: **Implemented**; see "Implementation Record" at the end for details
> Goal: provide a standalone "Unpack / Pack" tool page (`ui/archive`) in app settings: unpack = choose a directory, scan XP3 packages, preview entries master-detail, and extract everything into a folder named after the archive (name conflict is rejected, no automatic renaming); pack = choose a directory and compress it into a sibling `.xp3` with the same name (0 = stored, 1–9 zlib level). The core unpack/pack logic is implemented in Rust (`engine/rust`, derived from UsefulUnpack, MIT).
> Related: the "unpack/pack" terminology section in `CONTEXT.md`, acknowledgements in `README.md` (UsefulUnpack), `docs/artemis-base-patch-and-windows-env-reverse-engineering.md` (PFS unpacking in the launch chain, independent of this feature).

---

## 1. Requirements and Scope

| Item | Requirement |
|---|---|
| Entry point | App settings page adds an "Unpack / Pack" navigation item (`ArrowPreference` → `ArchiveUnpackActivity`, `exported=false`) |
| Unpack | Choose directory → recursively scan `.xp3` (depth ≤6, count ≤500) → left/right master-detail preview (archives on the left, entries on the right) → extract into a folder named after the archive (**reject and prompt** if it already exists, no automatic renaming) |
| Pack | Choose directory → compress into a sibling `.xp3` with the same name (**reject and prompt** if it already exists); under SAF proprietary providers, pack into cache first and then hand over to the system save dialog |
| Progress/cancel | Byte-level progress (a dedicated polling thread reads the Rust global progress slot), cancellable at any time (sentinel exception `ArchiveCancelledException`) |
| Strings | Three languages (values / values-en / values-ja) |
| Backend | **XP3 only**; the native library is `arm64-v8a` only (consistent with the whole app) |

**Non-goals (not done)**: PFS/PF6/PF8 unpack/pack (see §4 decision 1); a standalone KSD feature entry; XP3 split volumes (`.xp3.001` series); selective checkboxes for extracted entries (phase one extracts everything); encrypted entries inside xp3 (COSTOM/krkrz encrypted headers).

---

## 2. Architecture

```
ui/archive (ArchiveUnpackActivity + ArchiveViewModel)
        │  depends only on the feature abstraction layer
        ▼
core/unpack (app)
  ArchiveScanner     Recursive directory tree scanning (real path first, SAF DocumentFile fallback)
  ArchiveDetection   Detect XP3 by name/magic number (`58 50 33`)
  ArchiveStaging     SAF dual-track bridge: use directly when mappable, otherwise copy into
                     cacheDir/archive_staging for staging, then write the output back into the
                     directory tree via publishDir (the output directory is newly created and
                     validated as empty before writing)
  Xp3Archive         Blocking facade: listEntries / extractAll / pack (caller switches to Dispatchers.IO)
  NativeArchiveOp    Common scaffolding for blocking native calls + progress polling + cancel translation
        │  JNI
        ▼
engine/src/main/java/com/core/archive (Xp3Core, lazy System.loadLibrary)
        ▼
engine/rust (single crate cdylib, artifact libarchive_xp3_core.so)
  lib.rs             JNI entry points for XP3 entry listing/full extraction/selective extraction/packing (panic → IOException)
  common.rs          Progress slot (extract/compress dual store), ProgressWriter/Reader (checks cancellation at write points,
                     ErrorKind::Other prevents io::copy from retrying Interrupted forever), safe_join path escape protection
  ksd.rs             KSD mode-2 implicit decoding (no standalone entry point, see §4 decision 3)
```

## 3. Key Implementation Points

- **Single-flight mutex**: the ViewModel allows only one operation at a time (`working` latch); on the Rust side each format has only one global progress slot, so concurrent calls for the same format are forbidden.
- **Cancellation semantics**: Kotlin `cancelFlag`/Job cancellation → the polling thread fires Rust `cancel()` → native returns a `cancelled` error → after an exact match it is translated to `ArchiveCancelledException`, with a tail check preventing "cancellation landing on the last entry being swallowed as success".
- **fail-closed**: a failed/cancelled pack deletes the half-written output; a failed unpack counts per entry (`skipped`), fatal errors throw IOException and are localized.
- **Format safety**: `safe_join` rejects absolute paths/`..`/NUL/drive letters; extraction limits (declared size + decode clamp) defend against zlib bombs; packing rejects files and packages larger than 4GB.
- **R8**: `consumer-rules.pro` keeps `com.core.archive.**` (JNI does FindClass by literal name); retention is verified on build artifacts.

## 4. Key Decisions

1. **XP3 only, the whole PFS line removed**: the Rust implementation of PFS/PF6/PF8 (pfs-core) and the Kotlin facade (PfsArchive/ArtemisPf6Packer/PfsCore) have been deleted, narrowing the maintenance surface; PFS unpacking in the Artemis launch chain is a mainline feature (`ArtemisPfsUnpacker`, pure Kotlin) and stays as-is in the cloud, with zero coupling to this feature.
2. **Three Rust crates merged into one**: common/ksd-core/xp3-core merged into `src/{lib,common,ksd}.rs`; dead code unused by XP3 was deleted (rar volumes, BoundedWriter, standalone KSD mode0/1 entry points). Artifact size is unchanged (477KB → 476KB), and the repository has two fewer crate boundaries.
3. **KSD mode-2 implicit decoding**: some KRKR games wrap text entries inside XP3 in another layer of KSD mode-2 (`FE FE 02 FF FE` + two i64 lengths + raw deflate). During unpack, entries ≤16MB are buffered and probed, and on a hit they are additionally decoded to plain text; the rationale is that krkrsdl3 `TextStream.cpp` natively decodes this wrapper (supporting mode0/1/2), so the game runs either way, and decoding merely makes exported text directly editable. Anything that cannot be decoded is written out verbatim.

## 5. Acceptance

- [x] The settings page entry opens the tool page, and unpack/pack modes can be switched
- [x] Scanning lists XP3 files in the directory (including subdirectories), with a localized prompt for empty directories
- [x] Unpacked output is complete (byte-level round trip pack→unpack, covered by Rust tests)
- [x] Packed output can be unpacked again (round trip consistent)
- [x] Cancelling an operation mid-way shows "cancelled" and the half-written package is cleaned up
- [x] SAF directories (no real path) unpack/pack successfully through staging
- [x] `testDebugUnitTest`, `check-hardcoded-ui-strings.py`, `git diff --check` pass

## 6. Implementation Record

- **Rust**: `engine/rust` is a single crate (`Cargo.toml` cdylib + lto, `build-archives.sh` runs host tests then cargo-ndk produces the arm64 .so, NDK version aligned with engine/build.gradle); the progress slot tests and the pack round-trip tests share `TEST_LOCK` to serialize (statics trample each other after merging into a single test binary), and a reader test bug that failed to clear cancel and poisoned later cases was fixed
- **Kotlin**: `core/unpack` adds `ArchiveDetection/ArchiveScanner/ArchiveStaging/ArchiveCancelledException/ArchiveNativeMissingException/NativeArchiveOp/Xp3Archive`; `ui/archive` adds `ArchiveUnpackActivity/ArchiveViewModel` (the ViewModel is retained, so rotation does not lose scan results); the settings center `SettingsScreen` adds the navigation item (top-level card)
- **Strings**: three languages add `archive_*` keys (completeness across all three sides verified by script)
- **Docs**: `AGENTS.md` (core/ui domain list), `README.md` (core/unpack and ui/archive registration, engine/rust directory, UsefulUnpack acknowledgement), `CONTEXT.md` (unpack/pack terminology section)
- **Verification**: Rust `cargo test` 17/17; Kotlin `testDebugUnitTest` 346/346; `assembleDebug` (136M) and `assembleRelease` (R8, 112M) pass; release dex confirms `com/core/archive/Xp3Core` is retained by name and `libarchive_xp3_core.so` is in the package