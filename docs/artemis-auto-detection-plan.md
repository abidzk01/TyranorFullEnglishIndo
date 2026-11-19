# Artemis Automatic Engine Detection Optimization Plan

> Goal: improve the "auto" option of the Artemis engine settings in Tyranor Next so that it no longer relies only on blind trying in a fixed order. Instead, based on characteristics such as the game directory, `boot.ini`, `system.ini`, the PFS package table, and Emote assets, it should prefer the Artemis engine version most likely to succeed, while preserving compatibility with existing older games.

## 1. Background

Tyranor Next currently bundles several Artemis runtime libraries and exposes an "engine version" choice through app-level / per-game settings.

The existing auto logic already has basic capabilities:

- Supports manually specifying an Artemis version.
- Supports reading the historical successful version in auto mode.
- Supports fingerprints for some Android Artemis new-shell directories, going straight to TyranorNext V1 when `boot.ini + root.pfs` is matched.
- Supports a compatibility fallback chain after an early exit at launch.
- Supports PFS games missing loose boot files by applying a base patch before launch.

But the auto option is still rather coarse:

- `boot.ini + root.pfs` only roughly points to V4/TyranorNext V1, without distinguishing Rev.2958 from Rev.3288.
- Emote games are not detected separately, so newer libraries without Emote support may be tried first.
- It does not read the PFS file table to determine whether `system.ini`, `system/first.iet`, Emote assets, or the Android boot section exist inside the package.
- It does not score the OBB / PAD / download data / assets resource delivery forms mentioned in the official Artemis Android documentation.
- The priority among traditional Windows Artemis directories, Android port directories, and commercial Android shell directories is still unclear.

## 2. Current Artemis Version Matrix

The mapping between Artemis version display names, config values, and actual libraries in the current project is as follows:

| Display name | Config value | Activity | engineLibName | Actual so | Rev | Emote | Positioning |
|---|---|---|---|---|---:|---|---|
| `v1(Tyranor/Rev.2762)` | `2` | `ArtemisActivityV2` | `artemis-compatible` | `libartemis-compatible.so` | 2762 | No | Legacy Tyranor compatibility line |
| `v2(Tyranor/Rev.3049/emote)` | `1` | `ArtemisActivityV1` | `artemis` | `libartemis.so` | 3049 | Yes | Legacy Tyranor Emote line |
| `v3(Tyranor/Rev.3201/emote)` | `3` | `ArtemisActivityV3` | `artemis-compatible-v2` | `libartemis-compatible-v2.so` | 3201 | Yes | Legacy Tyranor higher-version Emote line |
| `V1(TyranorNext/Rev.2958)` | `4` | `ArtemisActivityV4` | `artemis-v4` | `libartemis-v4.so` | 2958 | No | TyranorNext new-shell compatibility line |
| `V3(TyranorNext/Rev.3288)` | `5` | `ArtemisActivityV5` | `artemis-v5` | `libartemis-v5.so` | 3288 | No | TyranorNext new commercial Android shell line |

Notes:

- Config values must not be understood from the display names alone, because for historical compatibility the old values `1/2/3/4` are already used by user settings and per-game overrides.
- The auto logic should route based on config values and library capabilities, and must not arbitrarily migrate existing preferences.
- Neither Rev.2958 nor Rev.3288 has Emote symbols detected, so they should not be the first priority for Emote games.

## 3. Usable Detection Signals from External Material

### 3.1 `boot.ini` is a strong signal of an Android Artemis port shell

In the official Android template documentation, `boot.ini` is located at:

```text
app/src/main/assets/boot.ini
```

`boot.ini` mainly describes how resources are delivered on Android. Recognizable fields include:

```ini
[RESOURCE]
PLAY_ASSET_DELIVERY_NAMES = root_pfs_000,root_pfs_001,root_pfs_002
APK_EXPANSION_FILES_MAIN = 1
APK_EXPANSION_FILES_PATCH = 1
APK_EXPANSION_FILES_KEY =

[DOWNLOAD]
URL = http://server.com/path/to/root.pfs|http://server.com/path/to/root.pfs.000

[ID]
NAME = com.ies_net.artemis_test
```

Meanings usable for automatic detection:

- Presence of `[RESOURCE]`: high probability of an Android Artemis shell configuration.
- Presence of `APK_EXPANSION_FILES_*`: high probability of OBB / Google Play expansion file delivery.
- Presence of `PLAY_ASSET_DELIVERY_NAMES`: high probability of Play Asset Delivery.
- Presence of `[DOWNLOAD]` + `URL`: high probability of self-hosted download data delivery.
- Presence of `[ID] NAME`: legacy compatibility configuration, stated in the official docs to be obsolete after Rev.1425, but still usable to detect old Android shells.

### 3.2 The Android resource read order can indicate the delivery form

The official Android readme explicitly states the resource read order:

```text
APK Expansion Files
→ download data
→ Play Asset Delivery
→ APK assets
```

Mapped to the game directory scenarios users provide, several structures can occur:

1. A directory extracted from APK/OBB:

```text
boot.ini
main.xx.package.obb
patch.xx.package.obb
```

2. An Android data directory after download completes:

```text
root.pfs
root.pfs.000
system.ini
```

3. A game packed directly into APK assets:

```text
boot.ini
root.pfs
```

4. An original PC Artemis game directory:

```text
system.ini
system/first.iet
*.pfs
```

These structures have direct value for automatic engine selection.

### 3.3 The `[ANDROID]` section of `system.ini` is a strong platform-adaptation signal

The official specification documentation states:

- Windows reads `[WINDOWS]`
- iOS reads `[IOS]`
- Android reads `[ANDROID]`
- WebAssembly reads `[WASM]`

Therefore:

- If `[ANDROID]` exists in `system.ini`, the game already has an Android platform configuration.
- If `system.ini` only has `[WINDOWS]` or common sections, the resources may be original PC assets and need patching or the compatibility chain.
- If `system.ini` is missing but `root.pfs` exists, the boot file may be inside the package and a lightweight PFS table scan is needed.

Recognizable key items:

```ini
[ANDROID]
WIDTH =
HEIGHT =
BOOT =
CHARSET =
SIDECUT =
POWER_SAVING =
NO_SAVE =
```

Among them:

- `BOOT` can be used to determine the boot script path.
- `CHARSET` can be used for subsequent patch encoding handling.
- `WIDTH/HEIGHT` can be used to confirm the completeness of the configuration section.

### 3.4 The PFS package table can be used for lightweight detection

The official PFS documentation states:

- The root package file is usually `root.pfs`.
- Patch packages are `root.pfs.000` through `root.pfs.999`.
- Patch packages take priority over the root package.
- Files inside the package can be read by the engine like ordinary files.
- When Android does not use APK Expansion Files, the root package is still `root.pfs`.

Therefore automatic detection does not need to fully unpack large resources; it only needs to read the PFS file table and determine whether key files exist:

- `system.ini`
- `system/first.iet`
- `*.iet`
- `*.lua`
- `*.mp4`
- Emote-related assets or script references
- Android boot scripts
- the number of patch packages

This keeps scanning fast while significantly improving the accuracy of automatic version selection.

### 3.5 System variables such as `s.engineversion` are not suitable for pre-launch detection

`system_variables.md` records:

- `s.engineversion`
- `s.minimumsupportversion`
- `s.savedataversion`
- `s.builddate`
- `s.versioncode`
- `s.versionname`

These variables are produced by the running Artemis engine. They are suitable for post-launch diagnostics or log reporting, but cannot be read before launch, so they are not used as primary evidence for automatic engine selection.

## 4. Target Capabilities

### 4.1 Behavioral Goals for the Auto Option

When the user selects "auto", the following should hold:

1. If a historical successful version exists, use it first.
2. If there is no history, quickly scan the game directory / PFS table first to generate an Artemis fingerprint.
3. Decide the initial version from the fingerprint.
4. If launch fails or exits early, continue with the compatibility fallback chain.
5. Write the successful version to history so the next launch goes straight there.
6. A manually specified version is not affected by the auto logic.
7. Per-game overrides take priority over app-global settings.

### 4.2 Compatibility Goals

- Do not break existing older games.
- Do not break games that already have a recorded historical successful version.
- Do not prefer libraries without Emote support for Emote games.
- Do not force Rev.3288 ahead of all Android Artemis games.
- Do not fully unpack large PFS or OBB files during the scan phase.
- Do not modify user game resources unless the existing "base patch" flow is permitted by the user or the policy is set to automatic.

## 5. New Core Abstractions

It is recommended to add an independent detector:

```kotlin
object ArtemisEngineFingerprintDetector
```

Suggested location:

```text
app/src/main/java/com/tyranor/next/core/game/launch/ArtemisEngineFingerprintDetector.kt
```

Alternatively it can go in:

```text
app/src/main/java/com/tyranor/next/core/game/scan/ArtemisFingerprint.kt
```

It is recommended not to stuff it into `EngineLauncher.kt`, because automatic detection will only grow more complex and a single file would become a "spaghetti forest".

### 5.1 Fingerprint Data Structure

Suggested definition:

```kotlin
data class ArtemisGameFingerprint(
    val hasLooseBootIni: Boolean = false,
    val hasLooseSystemIni: Boolean = false,
    val hasLooseAndroidSection: Boolean = false,
    val hasLooseWindowsSection: Boolean = false,
    val hasLooseBootKey: Boolean = false,
    val hasLooseFirstIet: Boolean = false,

    val hasRootPfs: Boolean = false,
    val hasPatchPfs: Boolean = false,
    val hasAnyPfs: Boolean = false,
    val pfsEntryScanned: Boolean = false,
    val pfsHasSystemIni: Boolean = false,
    val pfsHasAndroidSection: Boolean = false,
    val pfsHasFirstIet: Boolean = false,
    val pfsHasLua: Boolean = false,
    val pfsHasIet: Boolean = false,
    val pfsHasMp4: Boolean = false,
    val pfsHasEmoteAsset: Boolean = false,

    val bootUsesApkExpansion: Boolean = false,
    val bootUsesPlayAssetDelivery: Boolean = false,
    val bootUsesDownload: Boolean = false,
    val bootUsesLegacyId: Boolean = false,
    val bootMentionsRootPfs: Boolean = false,

    val hasObbLikeFile: Boolean = false,
    val hasPf8LikeArchive: Boolean = false,

    val confidence: Int = 0,
    val reasons: List<String> = emptyList(),
)
```

### 5.2 Recommended Version Plan Structure

Suggested definition:

```kotlin
data class ArtemisEnginePlan(
    val initialVersion: String,
    val fallbackVersions: List<String>,
    val reason: String,
)
```

This way `EngineLauncher` only consumes the result and does not care about the scoring details.

## 6. Detection Rule Design

### 6.1 Historical Successful Version First

Currently available:

```text
artemis_engine.<pathHash>
```

It is recommended to keep it and strengthen compatibility:

- Recognize both the old `internal.artemis.*`
- And the new `ART_ENGINE_V1/V2/V3/V4/V5`
- If the library corresponding to the historical value no longer exists or is invalid, discard the historical value and re-run fingerprint detection

Priority:

```text
per-game manual override
→ app-global manual override
→ historical successful version
→ automatic fingerprint selection
→ default compatibility chain
```

### 6.2 Emote Detection Rules

Emote is one of the most important routing conditions.

Match conditions:

- Loose file names or paths contain:
  - `emote`
  - `d3demote`
  - `iemote`
- Paths like the following exist in the PFS table:
  - `D3DEmote`
  - `emote`
  - `*.mtn`
  - `*.psb`
  - `motion`
- The following appear in lightweight script/ini text:
  - `Emote`
  - `IEmote`
  - `D3DEmote`

Recommended chain after an Emote match:

```text
v3(Tyranor/Rev.3201/emote)
→ v2(Tyranor/Rev.3049/emote)
→ v1(Tyranor/Rev.2762)
→ V1(TyranorNext/Rev.2958)
→ V3(TyranorNext/Rev.3288)
```

Reasons:

- Rev.3201 is the highest legacy Emote line at present.
- Rev.3049 serves as a secondary Emote fallback.
- Rev.2958/3288 have no Emote support, so they should not be tried first.

### 6.3 Android Commercial Shell / New Shell Detection Rules

Strong signals:

- `boot.ini` exists
- The following appear in `boot.ini`:
  - `APK_EXPANSION_FILES_MAIN`
  - `APK_EXPANSION_FILES_PATCH`
  - `APK_EXPANSION_FILES_KEY`
  - `PLAY_ASSET_DELIVERY_NAMES`
  - `[DOWNLOAD]`
  - `URL =`
- `.obb` exists
- The `.obb` file name matches:
  - `main.<version>.<package>.obb`
  - `patch.<version>.<package>.obb`
- The archive header resembles `pf8`
- `root.pfs` or `root.pfs.000` exists
- `system.ini` has `[ANDROID]`

Recommended chain:

```text
V3(TyranorNext/Rev.3288)
→ V1(TyranorNext/Rev.2958)
→ v1(Tyranor/Rev.2762)
→ v3(Tyranor/Rev.3201/emote)
→ v2(Tyranor/Rev.3049/emote)
```

Reasons:

- Rev.3288 comes from a newer commercial Android shell, suitable for the modern OBB/PAD/boot.ini form.
- Rev.2958 is another new-shell line of TyranorNext.
- Legacy Tyranor Rev.2762 has no Emote support and serves as the traditional no-Emote fallback.

### 6.4 Android assets / Converted Directory Detection Rules

Medium-strong signals:

- `boot.ini` exists
- `root.pfs` exists
- `boot.ini` does not clearly enable OBB/PAD/download
- `system.ini` may be in the root directory or inside the PFS
- `system.ini` contains `[ANDROID]`

Recommended chain:

```text
V1(TyranorNext/Rev.2958)
→ V3(TyranorNext/Rev.3288)
→ v1(Tyranor/Rev.2762)
→ v3(Tyranor/Rev.3201/emote)
→ v2(Tyranor/Rev.3049/emote)
```

Reasons:

- These look more like Android port resources that have already been patched, and do not necessarily need the newest commercial shell.
- Rev.2958 is already the current TyranorNext default for going straight to new shells.

### 6.5 Traditional PC Artemis Directory Detection Rules

Strong signals:

- `system.ini` exists
- `system/first.iet` exists
- `root.pfs` or another `.pfs` exists
- No `boot.ini`
- `system.ini` is mostly `[WINDOWS]` or common sections, without `[ANDROID]`

Recommended chain:

```text
v1(Tyranor/Rev.2762)
→ v2(Tyranor/Rev.3049/emote)
→ v3(Tyranor/Rev.3201/emote)
→ V1(TyranorNext/Rev.2958)
→ V3(TyranorNext/Rev.3288)
```

If an Emote match occurs, switch to the Emote chain instead.

### 6.6 Directories With Only PFS

Characteristics:

- `root.pfs` / `root.pfs.000` present
- No loose `system.ini`
- No loose `system/first.iet`

Handling:

1. Perform a lightweight PFS table scan first.
2. If `system.ini + [ANDROID]` can be confirmed in the PFS table, use the Android assets/convert chain.
3. If Emote can be confirmed in the PFS table, use the Emote chain.
4. If there is only `system.ini` / `system/first.iet`, use the traditional chain.
5. Before launch, still follow the existing base patch confirmation mechanism.

Recommended default chain:

```text
v1(Tyranor/Rev.2762)
→ v2(Tyranor/Rev.3049/emote)
→ v3(Tyranor/Rev.3201/emote)
→ V1(TyranorNext/Rev.2958)
→ V3(TyranorNext/Rev.3288)
```

Reasons:

- With only PFS there is insufficient information, so it is not appropriate to jump straight to new versions.
- After patching, the extracted `system.ini` can be used for secondary confirmation.

## 7. Overall Automatic Selection Flow

```text
buildArtemisIntent()
  |
  |-- read per-game override
  |-- read app-global settings
  |
  |-- if not auto
  |     |-- use the manual version
  |
  |-- if auto
        |
        |-- read historical successful version
        |     |-- if valid, use the historical version
        |
        |-- generate ArtemisGameFingerprint
        |
        |-- generate ArtemisEnginePlan from the fingerprint
        |
        |-- launch with initialVersion
        |
        |-- encode fallbackVersions into the Intent
               or use the stage compatibility chain
```

## 8. Fallback Chain Rework

The current fallback chain uses the numeric `artemisFallbackStage`:

```text
0 → V2
1 → V3
2 → V4
3 → V5
```

This structure works for a fixed order, but is not flexible enough for "different orders generated from fingerprints".

Suggested rework:

```text
artemisFallbackVersions = "2,1,3,4,5"
artemisFallbackIndex = 0
```

Meaning:

- `artemisFallbackVersions` is a list of config values.
- `artemisFallbackIndex` indicates which entry in the list is currently in use.
- After an early exit, read the next config value and map it to the corresponding Activity and engineLibName.

Advantages:

- Each type of game can have its own fallback order.
- Adding new versions no longer requires repeatedly modifying stage-number conditions.
- The historical successful version can also be written as a config value instead of mixing in `internal.artemis.*`.

Compatibility strategy:

- In the first stage, keep the old `artemisFallbackStage`.
- After `artemisFallbackVersions` is added, the Activity reads the new field first.
- When the new field is absent, continue using the old stage logic.

## 9. Lightweight PFS Scanning Plan

The current `ArtemisPfsUnpacker` already has PFS table-reading and selective unpacking capabilities, from which the safe logic can be extracted or reused.

Suggested new read-only scanning interface:

```kotlin
object ArtemisPfsInspector {
    fun inspect(rootPath: String, maxEntries: Int = 2000): ArtemisPfsSummary
}
```

Returns:

```kotlin
data class ArtemisPfsSummary(
    val scanned: Boolean,
    val entryCount: Int,
    val hasSystemIni: Boolean,
    val systemIniPreview: String?,
    val hasFirstIet: Boolean,
    val hasLua: Boolean,
    val hasIet: Boolean,
    val hasMp4: Boolean,
    val hasEmoteAsset: Boolean,
    val archiveNames: List<String>,
)
```

Scan limits:

- At most read the table and a small amount of text preview per PFS.
- Do not read large resource bodies.
- Do not write to the game directory.
- Do not process anomalous packages that exceed the limits.
- PFS read failures must not affect launch; they only lower confidence.

Reusable safety limits:

- `MAX_ENTRY_COUNT`
- `MAX_NAME_BYTES`
- path normalization
- `root.pfs.000` patch ordering

## 10. Scoring Model

It is suggested not to write a pile of mutually exclusive `if`s directly, but to build a score instead.

### 10.1 Version Families

```text
legacyNoEmote = v1 Rev.2762
legacyEmote = v3 Rev.3201/emote, v2 Rev.3049/emote
nextNoEmote = V1 Rev.2958, V3 Rev.3288
```

### 10.2 Fingerprint Scoring Examples

| Signal | Score | Leans toward |
|---|---:|---|
| PFS/loose path matches Emote | +100 | legacyEmote |
| `system.ini` has `[ANDROID]` | +40 | nextNoEmote or the Android chain |
| `boot.ini` has OBB/PAD/download | +60 | Rev.3288 |
| `.obb` exists | +60 | Rev.3288 |
| PFS header is `pf8` | +50 | Rev.3288 |
| `boot.ini + root.pfs` | +40 | Rev.2958/3288 |
| `system.ini + system/first.iet` | +50 | legacy |
| Only `.pfs` with no Android information | +20 | legacy |
| Has `[WINDOWS]` and no `[ANDROID]` | +30 | legacy |

The end result is not just taking the highest score, but generating an ordered candidate chain.

## 11. Recommended Candidate Chains

### 11.1 Emote Games

```text
3 → 1 → 2 → 4 → 5
```

Corresponding to:

```text
v3 Rev.3201/emote
→ v2 Rev.3049/emote
→ v1 Rev.2762
→ V1 Rev.2958
→ V3 Rev.3288
```

### 11.2 New Commercial Android Shell / OBB / PAD / pf8

```text
5 → 4 → 2 → 3 → 1
```

Corresponding to:

```text
V3 Rev.3288
→ V1 Rev.2958
→ v1 Rev.2762
→ v3 Rev.3201/emote
→ v2 Rev.3049/emote
```

### 11.3 Android assets / boot.ini + root.pfs

```text
4 → 5 → 2 → 3 → 1
```

Corresponding to:

```text
V1 Rev.2958
→ V3 Rev.3288
→ v1 Rev.2762
→ v3 Rev.3201/emote
→ v2 Rev.3049/emote
```

### 11.4 Traditional PC Artemis

```text
2 → 1 → 3 → 4 → 5
```

Corresponding to:

```text
v1 Rev.2762
→ v2 Rev.3049/emote
→ v3 Rev.3201/emote
→ V1 Rev.2958
→ V3 Rev.3288
```

### 11.5 PFS Games With Insufficient Information

```text
2 → 1 → 3 → 4 → 5
```

If the PFS table scan finds Emote, switch to the Emote chain.

## 12. Implementation Steps

### Stage 1: Abstract the Version Metadata

Goal: maintain version values, Activity, library name, Rev, and Emote capability in one place.

New:

```kotlin
data class ArtemisEngineVariant(
    val value: String,
    val displayName: String,
    val activityClassName: String,
    val engineLibName: String,
    val rev: Int,
    val hasEmote: Boolean,
)
```

Or wrap it with a simple `when` first:

```kotlin
private fun artemisActivityAndLib(version: String): Pair<Class<*>, String>
private fun artemisVersionFromInternalName(name: String): String?
private fun artemisInternalName(version: String): String
```

Change points:

- `EngineLauncher.kt`
- `ArtemisLauncherBaseActivity.java`

Benefits:

- Avoids `when` blocks scattering more as versions are added.
- Prepares for the fallback list.

### Stage 2: Add the Artemis Fingerprint Scanner

New file:

```text
app/src/main/java/com/tyranor/next/core/game/launch/ArtemisEngineFingerprintDetector.kt
```

Responsibilities:

- Read the loose file structure.
- Read the first 64KB of `boot.ini`.
- Read the first 64KB of `system.ini`.
- Lightly read the PFS table.
- Output `ArtemisGameFingerprint`.

Notes:

- `boot.ini` is mostly Shift_JIS, but the field names are all ASCII, so `ISO_8859_1` or byte-level searching is sufficient.
- `system.ini` may be Shift_JIS / UTF-8; the field names can likewise be searched as ASCII upper first.
- SAF `content://` paths are not PFS table scanned for now to avoid complexity; scan only once a real path mapping succeeds.

### Stage 3: Implement Candidate Chain Generation

New:

```kotlin
fun buildAutoPlan(path: String): ArtemisEnginePlan
```

Output:

- initial version
- fallback list
- reason log

Log example:

```text
Artemis auto fingerprint path=/storage/... emote=false androidBoot=true obb=false pad=true pfs=true plan=5,4,2,3,1 reason=boot.ini uses PAD
```

### Stage 4: Rework Fallback Parameter Passing

New Intent extras:

```text
artemisFallbackVersions
artemisFallbackIndex
```

Example:

```text
artemisFallbackVersions = "5,4,2,3,1"
artemisFallbackIndex = 0
```

On early exit, `ArtemisLauncherBaseActivity`:

1. Reads the list.
2. Increments the index by 1.
3. Maps the next version to the corresponding Activity and `engineLibName`.
4. Writes the historical successful candidate.
5. Launches the next Activity.

Compatibility:

- If `artemisFallbackVersions` is absent, continue using the old `artemisFallbackStage`.

### Stage 5: Optimize History Recording

Currently the next package name is written before the early exit, which semantically resembles "version being attempted" rather than "successful version".

Suggested conservative optimization:

- Keep the old key to avoid breaking existing behavior.
- Add a new key:

```text
artemis_engine_success.<pathHash>
```

Write timing:

- If the Activity stays alive longer than `EARLY_EXIT_WINDOW_MS`, it did not fail immediately, so the current version can be recorded as a successful candidate in `onDestroy`.
- If the user exits voluntarily, the current version can also be recorded.

This way the next launch is closer to a "historical successful version" and is not polluted by one failed retry.

### Stage 6: Optional Scanner Caching

To avoid rescanning the PFS every time a game is clicked, the fingerprint can be cached.

Cache key:

```text
artemis_fingerprint.<pathHash>
```

Cache contents:

- rootPath
- root lastModified
- root.pfs lastModified / size
- root.pfs.000 lastModified / size
- fingerprint JSON

Invalidation conditions:

- Directory mtime changes.
- root.pfs size or mtime changes.
- The number of patch PFS files changes.
- An app version upgrade changes the schema.

The first version can skip caching and just cap the scan limits first.

## 13. Validation Cases

### 13.1 Ordinary Legacy Tyranor Rev.2762 Game

Directory:

```text
system.ini
system/first.iet
root.pfs
```

Expected:

```text
v1 Rev.2762 → v2 Rev.3049/emote → v3 Rev.3201/emote → V1 Rev.2958 → V3 Rev.3288
```

### 13.2 Legacy Emote Game

Directory or PFS table:

```text
emote/
D3DEmote
*.mtn
```

Expected:

```text
v3 Rev.3201/emote → v2 Rev.3049/emote → v1 Rev.2762 → V1 Rev.2958 → V3 Rev.3288
```

### 13.3 Android assets Form

Directory:

```text
boot.ini
root.pfs
```

`boot.ini` has no explicit OBB/PAD/download enablement.

Expected:

```text
V1 Rev.2958 → V3 Rev.3288 → v1 Rev.2762 → v3 Rev.3201/emote → v2 Rev.3049/emote
```

### 13.4 New Commercial Android OBB/PAD Form

Directory:

```text
boot.ini
main.16.package.obb
```

Or:

```ini
[RESOURCE]
APK_EXPANSION_FILES_MAIN = 16
```

Expected:

```text
V3 Rev.3288 → V1 Rev.2958 → v1 Rev.2762 → v3 Rev.3201/emote → v2 Rev.3049/emote
```

### 13.5 Only PFS, No system.ini

Directory:

```text
root.pfs
root.pfs.000
```

Expected:

- The existing base patch confirmation is still triggered before launch.
- If the PFS table matches Emote, use the Emote chain.
- If the PFS table matches `[ANDROID]`, use the Android chain.
- If information is insufficient, use the traditional chain.

### 13.6 Manually Specified Version

The user selects any version:

```text
v1/v2/v3/V1/V3
```

Expected:

- No automatic fingerprint routing is performed.
- No automatic fallback is performed unless the current project explicitly keeps manual fallback.
- A launch failure returns directly without quietly changing the user's choice.

## 14. Logging and Observability

Suggested new log tag:

```text
ArtemisAuto
```

Key logs:

```text
fingerprint summary
selected initial version
fallback chain
history hit/miss
pfs scan skipped reason
```

Example:

```text
ArtemisAuto I path=/storage/... history=none fingerprint={boot=true, android=true, emote=false, pad=true} chain=5,4,2,3,1
ArtemisAuto W pfs scan skipped: content uri path not resolved
ArtemisAuto I history hit version=3 source=success pathHash=...
```

This way, during remote testing, a logcat capture is enough to know why the auto option chose a particular version.

## 15. Risks

### 15.1 PFS Variant Risk

Risk:

- Different Artemis PFS versions may have different table structures.
- Some commercial packages may be obfuscated or encrypted.
- OBB may not be a plain PFS but `pf8` or another variant.

Mitigation:

- A PFS scan failure does not block launch.
- It only lowers confidence.
- The fallback chain is retained.

### 15.2 Emote False Positives

Risk:

- A file name coincidentally contains `emote`.

Mitigation:

- A single weak match only adds a low score.
- Only multi-condition matches of `D3DEmote`, `IEmote`, `.mtn`, and script references count as strong determinations.

### 15.3 Unknown Rev.3288 Coverage

Risk:

- Rev.3288 is a new commercial shell line, but it may not be compatible with every Android boot.ini game.

Mitigation:

- Prioritize Rev.3288 only when strong new-shell signals such as OBB/PAD/download/pf8 match.
- Plain `boot.ini + root.pfs` still prefers Rev.2958.

### 15.4 History Pollution

Risk:

- The current early-exit retry logic may write "the version to try next" as the historical value.

Mitigation:

- Add a success key.
- Read the old key only for compatibility.
- When recording the successful version, judge by lifetime or voluntary user exit.

## 16. Recommended Delivery Order

### First Batch: Low Risk, Improve Decision Quality First

1. Add `ArtemisEngineFingerprintDetector`.
2. Implement loose-file fingerprints for `boot.ini/system.ini/root.pfs`.
3. Implement Emote file name/path detection.
4. Generate candidate chains, but still use the existing stage fallback for now.
5. Add detailed logging.

### Second Batch: Medium Risk, Enhance PFS Table Scanning

1. Extract read-only PFS table scanning logic from `ArtemisPfsUnpacker`.
2. Detect `system.ini/system/first.iet/Emote` inside the PFS.
3. Adjust the candidate chain again based on `[ANDROID]` in the PFS's `system.ini`.
4. Cap the scan limits to avoid slow scans.

### Third Batch: Medium-High Risk, Rework the Dynamic Fallback Chain

1. Add `artemisFallbackVersions`.
2. Make the Java Activity support falling back over a config value list.
3. Keep the old `artemisFallbackStage` for compatibility.
4. Add a successful version key.

### Fourth Batch: Validation and Fine-Tuning

1. Validate Rev.2762/3049/3201 with known older games.
2. Validate TyranorNext V1 with Tyn/Rev.2958 games.
3. Validate TyranorNext V3 with ar-test/Rev.3288 style resources.
4. Validate with Emote games that no-Emote libraries are not used by mistake.
5. Validate patch confirmation and PFS table scanning with PFS-only games.

## 17. Expected Final Effect

When complete, the Artemis auto option will go from:

```text
fixed-order blind trying + a little boot.ini fast path
```

to:

```text
historical successful version
→ resource fingerprint detection
→ routing across Emote / Android new shell / traditional PC / PFS-only
→ dynamic fallback chain
→ successful version memory
```

This significantly reduces the number of trial-and-error attempts on first launch, prevents Emote games from mistakenly using a no-Emote version, and gives new commercial Android shells such as Rev.3288 a reasonable automatic entry point.

## 18. Implementation Status

Completed:

1. Added `ArtemisEngineFingerprintDetector`, centrally responsible for directory, `boot.ini`, `system.ini`, PFS table, OBB/PAD/download, `pf8`, and Emote asset fingerprint detection for the Artemis auto option.
2. The auto option now reads the new successful version record `artemis_engine_success.<pathHash>` first, then falls back to the old key `artemis_engine.<pathHash>`; only when there is no history does it generate a candidate chain from the fingerprint.
3. `EngineLauncher` has been changed to pass the dynamic candidate chain to the Artemis Activity:

```text
artemisFallbackVersions = "5,4,2,3,1"
artemisFallbackIndex = 0
artemisCurrentVersion = "5"
```

4. `ArtemisLauncherBaseActivity` now supports dynamic fallback chains; the old `artemisFallbackStage` is still kept for compatibility.
5. The successful version recording has changed to "record only after no early-exit fallback was triggered", avoiding polluting historical success with failed attempts.
6. `EngineScanner` has been extended to detect patch PFS files such as `root.pfs.000`, as well as Android commercial shell directories such as `boot.ini + .obb`.
7. Debug builds have verified that the Artemis plugin package contains five runtime libraries:

```text
libartemis.so
libartemis-compatible.so
libartemis-compatible-v2.so
libartemis-v4.so
libartemis-v5.so
```

No scan cache is in place currently; the first version controls elapsed time through limits on scan depth, scan count, PFS entry count, and preview read size.