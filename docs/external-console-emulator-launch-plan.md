# External Console Emulator Launch Integration Plan (PPSSPP / Eden / Winlator)

> Source: a retrospective of RinneMobile's handheld emulator launch chain (`com/core/launcher/HandheldLaunchers.kt`, `ExternalGameLaunchers.kt`, `EnginePackageResolver.kt`, `EngineDetector.kt`).
> Goal: TyranorNext should support handing PSP / Nintendo Switch / YU-RIS (Windows) games off to external emulators, and recognize and import those games during game scanning; the engine page should also gain an "external launch support" display item whose dialog lists PPSSPP, Eden and Winlator.
> Scope: "launch external emulators" only. No bundled PSP/Switch/Winlator runtime and no save management takeover (handled by the external emulator). The existing external APK module systems for RPG Maker / Ren'Py / Artemis etc. are unchanged.

> Implementation status: **Completed** (executed per the recommended defaults in §11). Key landing points:
> - `EngineType.PSP` / `EngineType.NINTENDO_SWITCH` + `EmulatorTarget` / `ExternalEmulatorRegistry` / `ExternalEmulatorLauncher`;
> - ROM identity uses "uri = ROM file URI" (one entry per ROM); scanning emits per item across all 4 paths of SAF/File × full/incremental;
> - Launch diverts to the external emulator before `resolveGameDirectory`, and returns a typed failure when not installed (Snackbar message + engine page download guidance);
> - The engine page gains an "external launch support" display item whose dialog lists PPSSPP / Eden; not installed opens the download page, installed opens the emulator's main UI;
> - `<queries>` gains the two packages, `file_paths.xml` extends `external-path`/`root-path`, and save management plus per-game settings explicitly annotate these two game kinds as "managed by the emulator".
> Retained items: the decision points in §11 are recommended defaults; they were implemented as such absent objections. Future adjustments (e.g. changing not-installed to a dialog with a direct download button) will be made separately.

---

## 1. Background

RinneMobile already implements a complete registry of external emulator launch strategies; the ones relevant to this plan are:

| Console | Package name | Activity | Intent contract | Recognized extensions |
| --- | --- | --- | --- | --- |
| PSP (PPSSPP standard) | `org.ppsspp.ppsspp` | `org.ppsspp.ppsspp.PpssppActivity` | `ACTION_VIEW` + `dataAndType(uri, "*/*")` + `setClassName` + `NEW_TASK\|GRANT_READ\|GRANT_WRITE` | `.pbp` `.cso` `.iso` `.chd` |
| PSP (PPSSPP Gold) | `org.ppsspp.ppssppgold` | `org.ppsspp.ppsspp.PpssppActivity` (same-source build, same class name) | Same as above | Same as above |
| Switch (Eden) | `dev.eden.eden_emulator` | `org.yuzu.yuzu_emu.activities.EmulationActivity` (yuzu namespace) | `ACTION_VIEW` + `dataAndType(uri, "application/octet-stream")` + `setClassName` + `NEW_TASK\|GRANT_READ` | `.nsp` `.xci` `.nca` `.nro` |

Common traits: installation is detected via `getPackageInfo`; when not installed it fails immediately and **does not fall back to a generic package launch**; URIs use SAF `content://`; launch targets an explicit component.

TyranorNext's current differences:

- No PSP / Switch engine types; scanning only walks directories with "one directory, one game", and `ScanGame.uri` is the sole identity (`GameEntity.@PrimaryKey val uri`);
- Launch must resolve a directory via `resolveGameDirectory` first, so file-type targets fail;
- No emulator package registry, no related `<queries>`, and `FileProvider` covers only `updates/`;
- The engine page only renders `supportedEngines`, with no slot for "non-engine display items".

---

## 2. Key Design Decisions

### 2.1 ROM game identity: `uri = ROM file URI` (default proposal, pending confirmation)

One game per ROM, `ScanGame`:

```kotlin
ScanGame(
    title = <ROM file name without extension>,
    uri = <ROM file URI>,        // SAF: content://... (buildDocumentUriUsingTree output); File fallback: absolute path
    engine = EngineType.PSP | EngineType.NINTENDO_SWITCH,
    launchTarget = <ROM file name>,  // display/edit reference only
)
```

Rationale and impact:

- **Uniqueness**: `uri` is the primary key, so one entry per ROM is naturally unique; `PerGameSettingsStore` / recent / quick launch / detection cache keys all hold.
- **Root ownership**: `GameRootMatcher` matches by documentId prefix, so `primary:Games/PSP/X.iso` belongs to `primary:Games` naturally.
- **Launch**: external launch uses `game.uri` directly, with no directory resolution.
- **Required bypass**: the branch in `EngineLauncher.launchInternalChecked` must be placed **before** `resolveGameDirectory` (a content:// file returns null there).
- **Saves**: `GameSaveManager` returns "not supported", and the game drawer hides save management.
- **Covers**: reuse `findLocalCoverUri` when the directory contains a single ROM; leave unset when there are multiple ROMs.

Rejected proposals: a composite key `uri=directory + #rom=...` (would need stripping at N consumption points, a large change surface); "one entry per directory taking the first ROM" (collections get collapsed). Neither is adopted unless decided otherwise during review.

### 2.1.1 PPSSPP variant (standard / Gold)

- The registry registers both PPSSPP targets (`ppssppStandard` / `ppssppGold`, differing only in applicationId); both `targets` participate in install detection and in the "external launch support" dialog listing
- The effective variant is resolved by the three-level settings: app-level `EngineSettingsStore.getPpssppVersion` (`ppsspp_version`, default `standard`) + per-game override `PerGameSettingsStore.F_PPSSPP_VERSION` → `ResolvedEngineSettings.ppssppVersion`
- At launch, `ExternalEmulatorRegistry.ppssppTarget(version)` resolves the target (Gold → `org.ppsspp.ppssppgold`, everything else falls back to standard), and `EngineLauncher` uses it to replace the default target of the PSP branch
- Entry points: Settings → Engine settings → "PPSSPP engine settings" (global dropdown); per-game settings PSP card (override dropdown, can be switched back to follow global)
- The Gold installUrl points to the Play Store (`https://play.google.com/store/apps/details?id=org.ppsspp.ppssppgold`); when not installed, "Go download" jumps per the selected variant

### 2.2 Launch chain bypass

PSP / Switch do not pass through `EnginePluginBootstrap` and do not enter `EngineLauncher.buildIntent`; they divert to `ExternalEmulatorLauncher` before `resolveGameDirectory`.

### 2.3 Engine page display

PSP/Switch are **not added** to `EngineLauncher.supportedEngines` (to avoid being shown as a checked "integrated engine" row). Instead, a fixed "external launch support" display item is appended after the engine list, whose dialog lists two entries, PPSSPP / Eden.

---

## 3. New Abstractions

```kotlin
// core/engine/external/EmulatorTarget.kt
data class EmulatorTarget(
    val engine: EngineType,            // PSP / NINTENDO_SWITCH
    @StringRes val displayNameRes: Int,
    val packageName: String,           // org.ppsspp.ppsspp / dev.eden.eden_emulator
    val activityName: String,          // explicit component class name
    val mime: String,                  // "*/*" / "application/octet-stream"
    val grantWrite: Boolean,           // PPSSPP true, Eden false
    val installUrl: String,
)

// core/engine/external/ExternalEmulatorRegistry.kt
object ExternalEmulatorRegistry {
    val targets: List<EmulatorTarget>
    fun forEngine(engine: EngineType): EmulatorTarget?
}
```

- Install detection and opening the download page reuse existing capabilities: an equivalent of `ExternalEngineLauncher.isPackageInstalled` (`getPackageInfo`) and `ExternalEngineLauncher.openInstallPage(context, url)`.
- `installUrl`: PPSSPP `https://www.ppsspp.org/` (or the Play Store); Eden `https://git.eden-emu.dev/eden-emu/eden/releases`.

---

## 4. Scan Recognition and Import

### 4.1 Extensions (default set, pending confirmation)

- PSP: `.pbp` `.cso` `.iso` `.chd` (excluding the ambiguous `.elf` for now)
- Switch: `.nsp` `.xci` `.nca` `.nro`

### 4.2 `EngineScanner` Change Points

File: `core/game/scan/EngineScanner.kt`

- Add a ROM detection and emission function, for example:
  ```kotlin
  private fun romEngineOf(name: String): EngineType?   // extension → PSP/SWITCH
  ```
- In the 4 traversal/incremental paths, emit this level's ROM after `detectEngine` misses:
  - SAF full `traverseDirectories` (198-235)
  - SAF incremental `scanRootIncremental` (138-173)
  - File fallback full `traverseFileDirectories` (419-450)
  - File fallback incremental `scanRootIncrementalFile` (384-417)
- SAF uses `SafNode.uri` (`buildDocumentUriUsingTree` output, carrying its own tree grant); File uses `File.absolutePath`.
- Title = file name without extension; cover = reuse `findLocalCoverUri` when the directory contains a single ROM.
- Whether to keep descending after emitting: by default **emit this level's ROM and continue descending into subdirectories** (to avoid missing nested collections), deduplicating by `uri` at the end (`scanRootInternal` already has `seen` dedup).
- Priority: the directory is first judged by `detectEngine`; if an engine matches, no ROM is emitted (engine first).

### 4.3 Other Persistence/Cleanup

- `GameRecordCodec` / `GameEntity` / `ScanGameIntents`: they use `EngineType.name`, so new enum values are automatically compatible; no change needed.
- Deleted-file cleanup: confirm the existence check for "file-type `uri`" (directory existence checks must tolerate files), adding `DocumentFile`/`File.isFile` branches where necessary.
- `EngineDetectionRepository.recordScanDetections`: the `else -> null` of `when(game.engine)` already acts as a fallback, so ROM kinds write no detection rows.

---

## 5. Launch Handoff

### 5.1 `ExternalEmulatorLauncher`

```kotlin
// core/engine/external/ExternalEmulatorLauncher.kt
object ExternalEmulatorLauncher {
    data class Result(val success: Boolean, val code: String, val target: EmulatorTarget)
    fun launch(context: Context, target: EmulatorTarget, game: ScanGame): Result
}
```

Flow:

1. `isPackageInstalled` detection; return `package_not_installed` when not installed.
2. URI normalization:
   - `content://` → use directly;
   - `file://` or absolute path → convert to a content URI via `FileProvider` (`${applicationId}.fileprovider`).
3. Build the Intent: `ACTION_VIEW` + `setDataAndType(uri, target.mime)` + `setClassName(target.packageName, target.activityName)` + `FLAG_ACTIVITY_NEW_TASK | FLAG_GRANT_READ_URI_PERMISSION` (add `FLAG_GRANT_WRITE_URI_PERMISSION` when `grantWrite`).
4. Catch `ActivityNotFoundException` / `SecurityException` / other exceptions → typed codes.

### 5.2 `EngineLauncher` Integration

`launchInternalChecked` before `resolveGameDirectory`:

```kotlin
ExternalEmulatorRegistry.forEngine(game.engine)?.let { target ->
    currentCoroutineContext().ensureActive()
    val result = ExternalEmulatorLauncher.launch(context, target, game)
    if (result.success) {
        GameLibraryFacade.recordRecentGame(context, game)
        return LaunchResult.Success
    }
    return LaunchResult.Failure.ExternalEmulatorFailed(result)
}
```

- `EngineLauncher.buildIntent`'s `when(engine)` gains PSP/SWITCH branches: `error("handled by ExternalEmulatorLauncher")`.
- `EngineLauncher.supportedEngines` does **not** gain PSP/SWITCH.

### 5.3 Results and Strings

- `LaunchResult.Failure` gains `data class ExternalEmulatorFailed(val result: ExternalEmulatorLauncher.Result)`.
- `ui/common/LaunchErrorMessages.kt` gains mappings: not installed / no matching Activity / denied / launch exception, all carrying the target name (PPSSPP / Eden).
- Default handling for not installed (pending confirmation): only a Snackbar message + guidance to the engine page's "external launch support" download; an optional enhancement is a dialog with a direct "Go download" button.

### 5.4 Saves and Drawer

- `GameSaveManager`'s `when(game.engine)` gains PSP/SWITCH → `SaveLocation(null, no_file_interface, false)`.
- `GameScreen.shouldShowSaveManagement` gains exclusions for PSP/SWITCH (alongside `ExternalEngineModuleRegistry.isExternalEngine`).
- The `else` branches of `RpgSaveFormat` / `EffectiveEngineSettings` already act as fallbacks; no change needed.

---

## 6. Engine Page "External Launch Support"

File: `ui/engine/EngineScreen.kt`

- Append a fixed item at the end of the engine `LazyColumn` (visually consistent with `EngineRow`): title "External launch support", summary "PPSSPP / Eden", with a check/cross on the right based on the installed count.
- Tapping shows an `AppAlertDialog` with `AppNavItem` (`DialogItemSurface`) listing `ExternalEmulatorRegistry.targets` one per row:
  - Not installed → summary "Not installed", tapping calls `ExternalEngineLauncher.openInstallPage(context, installUrl)`, failure Toast (reusing `engine_open_download_failed`);
  - Installed → summary "Installed", tap behavior (pending confirmation): open the emulator's main UI / just dismiss the dialog.
- Install state refreshes via `LifecycleEventEffect(ON_RESUME)` (refreshed in the same place as the existing `externalInstallStates`).
- Does not modify the existing engine row/version dialog logic.

---

## 7. Manifest / FileProvider

- `AndroidManifest.xml` `<queries>` additions:
  ```xml
  <package android:name="org.ppsspp.ppsspp" />
  <package android:name="dev.eden.eden_emulator" />
  ```
- `res/xml/file_paths.xml` additions (needed by the File fallback path; SAF-only would not need this):
  ```xml
  <external-path name="external" path="." />
  ```

---

## 8. String Checklist (zh / ja / en)

```text
engine_name_psp                          PSP
engine_name_nintendo_switch              Nintendo Switch
engine_desc_psp                          PSP games run through external PPSSPP
engine_desc_nintendo_switch              Switch games run through external Eden
engine_external_jump_title               External launch support
engine_external_jump_summary             PPSSPP / Eden
engine_emulator_ppsspp                   PPSSPP
engine_emulator_eden                     Eden
engine_emulator_installed                Installed
engine_emulator_not_installed            Not installed
launch_emulator_missing                  %1$s is not installed; download it from "External launch support"
launch_emulator_no_activity              %1$s provides no entry that accepts the game
launch_emulator_denied                   %1$s launch was denied by the system
```

`tools/check-hardcoded-ui-strings.py` must pass (hardcoding CJK strings in Kotlin sources is forbidden).

---

## 9. Phased Implementation Checklist

### Phase 0: Types and registry

- [x] `EngineType` gains `PSP("PSP")` and `NINTENDO_SWITCH("Nintendo Switch")`.
- [x] Add `EmulatorTarget` + `ExternalEmulatorRegistry` (PPSSPP / Eden entries).
- [x] `AndroidManifest.xml` `<queries>` gains the two packages.
- [x] Add minimal branches to the 6 exhaustive `when` sites (compiling is enough; UI refinement is in phases 3/4):
  `EnginePluginBootstrap`, `EngineLauncher.buildIntent`, `GameSaveManager`, `PerGameSettingsScreen`, `EngineScreen.engineDescription`, `GameScreen.coverColor`.

### Phase 1: Scan recognition and import

- [x] `EngineScanner` gains ROM extension detection and "one entry per ROM" emission, covering the 4 paths of SAF/File × full/incremental.
- [x] Emission priority: if `detectEngine` matches an engine, no ROM is emitted; only emit when it misses.
- [x] Covers: a single-ROM directory reuses the directory cover.
- [x] Review and fix the existence check for file-type URIs in "deleted-file cleanup".

### Phase 2: Launch handoff

- [x] Add `ExternalEmulatorLauncher` (install detection, URI normalization, Intent contract, exception fallback).
- [x] `EngineLauncher.launchInternalChecked` pre-branch + record recent on success.
- [x] `LaunchResult.Failure.ExternalEmulatorFailed` + `LaunchErrorMessages` strings.
- [x] `GameSaveManager` / `shouldShowSaveManagement` branches.
- [x] `res/xml/file_paths.xml` extension (if the File fallback path is adopted).

### Phase 3: Engine page display item

- [x] `EngineScreen` appends the "external launch support" item + install state refresh.
- [x] The dialog lists PPSSPP / Eden; not installed can jump to the download page, installed behavior landed per the decision.

### Phase 4: Strings and surroundings

- [x] Three-language `strings.xml` gains the section 8 key set.
- [x] `PerGameSettingsScreen` PSP/SWITCH branch (info card: managed by the external emulator, no adjustable items in the main app).
- [x] `GameScreen.coverColor` coloring (PSP/Switch placeholder colors).

### Phase 5: Tests and verification

- [x] `EngineScannerPspSwitchTest`: single-ROM / multi-ROM directory → one entry per ROM, `uri` is the file, engine correct, `launchTarget` correct; engine takes priority when the directory has engine traits.
- [x] `ExternalEmulatorRegistryTest`: engine→target mapping, package name/Activity/MIME/write permission, Intent construction (a pure function can be extracted to assert data/type/component/flags).
- [x] `./gradlew :app:testDebugUnitTest --no-daemon`
- [x] `./gradlew :app:assembleDebug --no-daemon`
- [x] `python3 tools/check-hardcoded-ui-strings.py`
- [x] `git diff --check`

---

## 10. Risks and Considerations

| Risk | Description | Mitigation |
| --- | --- | --- |
| `uri` semantics change | The `uri` of a ROM game is a file rather than a directory, affecting every consumption point that assumes "directory" | External launch diverts before `resolveGameDirectory`; saves/cleanup explicitly tolerate file URIs; tests cover it |
| Mixing content:// and file:// | Passing `file://` on the File fallback path throws `FileUriExposedException` | Prefer SAF; the File fallback goes through FileProvider (extending file_paths) |
| Package visibility | Without `<queries>`, install detection is always "not installed" | Phase 0 adds the two packages; no `QUERY_ALL_PACKAGES` |
| Extension misjudgment | Extensions like `.iso/.chd` are fairly generic | ROM candidates only; engine traits take priority; content magic checks can be added later |
| Increased scan volume | ROM collection directories produce many entries | Reuse existing depth/dedup; optionally add a "first-level ROMs only" toggle later |
| Descending multi-ROM directories | May yield duplicate/excess entries | Dedup by `uri`; can be changed to "stop descending once a ROM level is hit" if needed |
| External emulator behavior is uncontrolled | Saves, cheats, DL are managed by the emulator | Explicitly "no save takeover"; hide the save management entry |

---

## 11. Decision Points to Review

1. **ROM identity proposal**: `uri = ROM file URI` (recommended) — confirm?
2. **Extensions**: PSP `.pbp/.cso/.iso/.chd`, Switch `.nsp/.xci/.nca/.nro` — confirm?
3. **Not-installed launch UX**: Snackbar message + manually going to the engine page to download (recommended), or a dialog with a direct "Go download"?
4. **Installed item tap behavior on the engine page**: open the emulator main UI (recommended) / show status only / jump to the app info page?
5. **Same-directory priority**: engine first, ROM second (recommended) — confirm?
6. **File fallback**: accept extending `file_paths.xml` with `external-path` (recommended), or support SAF only this round?
7. **Whether to keep descending in multi-ROM directories**: emit this level's ROM and keep descending (recommended), or stop once a ROM level is hit?

---

## 12. Completion Criteria

- [x] Scanning recognizes PSP / Switch ROMs and imports them one by one with the correct engine type.
- [x] Tapping a PSP/Switch game can hand it off to the installed PPSSPP / Eden; clear prompts appear when not installed.
- [x] The engine page gains an "external launch support" item whose dialog shows PPSSPP / Eden and their install status, and can jump to the download page.
- [x] Save management and per-game settings behave explicitly for these two game kinds (unsupported / managed by the emulator).
- [x] Three languages consistent, unit tests pass, `assembleDebug` passes.
- [x] No regression to the scanning, launch and external module chains of existing engines (KRKR/ONS/Tyrano/Artemis/RPGM/Ren'Py).

---

## 12. Extension: YU-RIS via external Winlator (implemented)

> Protocol source: winlator-cn `docs/external-launch.md` (external launch + `dir_path` directory passing / automatic drive-letter mounting).

### 12.1 Recognition and import

- `EngineType.YURIS("YU-RIS")`; scan traits (`EngineScanner`):
  - `yscfg.dat` (engine settings file, 128B) combined with `*.ypf` (YPF package) → 96; `*.ypf` only (root or `pac/`) → 90; `yscfg.dat` only → 85; `YS*.DLL` ≥2 → 80; `.ymv` video → 75
  - The `pac/` directory is descended into only for YURIS traits (`.ypf`/`.ymv`) and is not merged into the generic directory whitelist, to avoid package-internal files affecting other engines' detection
- `launchTarget = "DIR"` (directory type); the main program resolves it at launch:
  - Automatic: after excluding settings/unins/setup/install/update/patch/crack/keygen from the root `.exe` files, prefer a directory-name match → largest size → name sorting
  - Manual: game details "launch file" override (`launchFile`, supports subdirectory-relative paths)
- Unit tests: `EngineScannerYurisTest`, `YurisLaunchFilesTest`

### 12.2 Launch handoff

- `EmulatorLaunchStyle.WINLATOR_EXTERNAL`: `EmulatorTarget` gains a launch style; the Winlator target is
  `com.winlator` / `com.winlator.ExternalLaunchActivity` (install detection + component resolvability detection; older versions lacking the exported entry report `external_launch_unsupported`)
- `WinlatorContract` (single source of protocol constants): `dir_path` (game directory Unix path), `exe_path` (relative file name), `confirm=true`, `launch_id=game.uri`
- `EngineLauncher.launchYurisViaWinlator`: resolve the real directory → all-files permission → resolve exe → hand off; `recordRecentGame` registers on success
- Directory mounting is done automatically by Winlator (idle drive letters allocated descending from `W:`, `save=false` mounts temporarily without persisting); the main app passes no drive letter and writes no container configuration

### 12.3 UI and storage

- The engine page GAL group gains a YU-RIS row (description in `engine_desc_yuris`); tapping opens the "external launch support" dialog (Winlator install status/download page); the game card placeholder color is `0xFF558B2F`
- Save management is hidden for YURIS (managed by Winlator, same policy as PSP/Switch); the per-game settings page shows the `engine_settings_yuris_hint` info card
- `<queries>` gains `com.winlator`; three-language strings: `engine_desc_yuris`, `engine_emulator_winlator`, `engine_settings_yuris_hint`, `launch_yuris_exe_missing`, `launch_emulator_unsupported`

### 12.4 Pending real-device verification

- After installing Winlator on a real device (the winlator-cn build with external launch support): launch a YU-RIS game from the library → Winlator confirmation dialog (shows the mounted drive letter) → confirm to enter the game; verify the automatic mount on first launch and that no container configuration remains after exit (`save=false`)

### 12.5 Winlator engine settings (parameters delivered by external launch)

- Entry: Settings → Engine settings → "Winlator external launch" (`EngineSettingsKind.WINLATOR`); app-level only (`ResolvedEngineSettings.winlator`), no per-game override yet
- Parameters: container ID / container name / graphics driver / graphics acceleration / resolution / locale (LC_ALL) / timezone (TZ) / Box64 preset / write container configuration (save)
- Fixed options (no free text): graphics driver = Vulkan driver (Turnip/Vortek) × OpenGL driver (Zink/VirGL/Gladio), 6 combinations total (aligned with the two dropdowns in Winlator container settings, delivered as the combination `vulkan,opengl`); resolution = 13 fixed values (`640x360`–`1920x1080`, labels include the aspect ratio); LC_ALL / TZ = common option dropdowns; an empty value uniformly means "follow container configuration" (the parameter is not delivered)
- At launch, `WinlatorContract.extras` maps them to Intent extras (key names aligned with winlator-cn `docs/external-launch-guide.md` §4): `container_id`, `container_name`, `graphics_driver`, `dxwrapper`, `screen_size`, `lc_all`, `tz`, `overrides` (Box64 preset), `save`; empty values are never delivered, leaving Winlator to handle them per the container configuration and container fallback chain (most recently used / only one / first)
- Value validation aligned with winlator-cn `LaunchArgs` (the storage layer normalizes whitelist violations back to empty, so invalid parameters do not cause Winlator to reject the whole launch): graphics driver limited to the 6 combinations; resolution limited to the 13 options; LC_ALL/TZ limited to dropdown options; graphics acceleration limited to dxvk/wined3d; Box64 built-in presets + `CUSTOM-<n>`
- Per-game override (`WinlatorOverride` + `EffectiveEngineSettings.mergeWinlator`): the per-game page shows the Winlator card for YU-RIS / CatSystem2 / PC, item by item "follow global / follow container configuration (explicit empty string) / specific option"; invalid override values normalize to an empty string rather than inheriting the global value