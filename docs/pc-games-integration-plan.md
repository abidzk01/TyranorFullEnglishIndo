# PC Game Type Integration Plan (Manual Add + External Winlator Launch)

> Status: **Implemented (P1–P4)**; implementation notes at the end in "Implementation Record"
> Goal: add `EngineType.PC` for **manually adding** arbitrary Windows PC games (not part of directory scanning), provide an add entry in the game page's top bar (dialog to choose a directory + specify the launch exe), and launch via external Winlator; PC games are **not included** in save management or engine configuration, but support switching the "launch file" (same as YU-RIS).
> Related: `docs/external-console-emulator-launch-plan.md` §12 (YU-RIS/Winlator), `ExternalEmulatorLauncher`, `WinlatorContract`.

---

## 1. Requirements and Scope

| Item | Requirement |
|---|---|
| Library entry | **no scanning**: new icon in the game page's top bar → choose a directory in the dialog + retrieve exes from the directory and specify the launch exe → confirm to add to the game page |
| Launch | external Winlator (reusing YU-RIS's `dir_path` + relative `exe_path` protocol) |
| Saves | not included in unified save management (unsupported by `GameSaveManager`, save management hidden on the detail page) |
| Engine configuration | none (no new `EngineSettingsKind`; the per-game settings page only shows an info card) |
| Launch file switching | required: the game detail drawer's "launch file" can re-select the exe (reusing the existing picker) |
| Display | normal game page card (title = directory name, renamable), engine badge `PC`, cover searchable/local |

**Non-goals (not in phase 1)**: recursive exe search in subdirectories, process/argument configuration for PC games, automatic detection of Linux/other platform games, bulk import of PC games.

---

## 2. Current State and Reusable Assets

| Asset | Location | How to reuse |
|---|---|---|
| Winlator launch protocol | `core/engine/external/WinlatorContract.kt` | reuse directly (`dir_path`, relative `exe_path`, `confirm`, `launch_id`) |
| Launcher | `ExternalEmulatorLauncher.launchWinlator(...)` | reuse directly |
| Target registry | `ExternalEmulatorRegistry` / `EmulatorTarget` | extend to "one target serving multiple engines" |
| exe candidate filtering/sorting | `core/game/launch/YurisLaunchFiles.kt` | generalize to `WindowsLaunchFiles`, adding a PC branch |
| Launch file picker | `ui/game/GameScreen.kt` `LaunchFileDialog` + `EngineLauncher.listLaunchFiles/currentLaunchFileName` | add a PC branch and relax the drawer entry condition |
| Manual entry writing | `GameLibraryFacade.updateGames` + `MainLibraryViewModel` FIFO command queue | add an "add manual game" command |
| SAF directory selection + persistable permission | `SettingsScreen.kt` scan directory add (`OpenDocumentTree` + `takePersistableUriPermission`) | implement dialog directory selection the same way |
| Top bar | `ui/common/AppTopBar(trailing = ...)` | add the icon in `trailing` |
| Dialog conventions | `ui/common/AppAlertDialog` (the project's only dialog) | use for the add dialog |

---

## 3. Key Decisions

1. **Zero data model migration**: `uri` = the SAF tree URI of the chosen directory; `engine = PC`; `launchTarget = "DIR"`; **`launchFile` = the exe file name specified when adding** (relative to the directory). No new fields, no Room schema change (`launchFile` already exists).
2. **Launch exe resolution follows YU-RIS semantics**: `launchFile` takes precedence, otherwise auto-pick (directory name match → largest size → name). The exe is mandatory when adding, ensuring it works on first launch; afterwards it can be switched in "launch file".
3. **One Winlator target serves two engines**: `EmulatorTarget`'s `engine: EngineType` becomes `engines: List<EngineType>` (YURIS + PC), `forEngine` matches any of them; **the external launch support dialog still lists Winlator only once** (avoiding duplicate entries).
4. **Rescan protection (critical)**: `EngineScanner.rescanLibrary` currently **rebuilds** the entire game list from scan results (`activeScanned.map{...}`), which would delete manual PC entries. Existing entries with `engine == PC` must be retained during the merge (independent of scan roots, no `isGameUnderRoot` filtering).
5. **Queued writing**: the add action goes through `MainLibraryViewModel`'s command queue (serialized with scanning/deletion) to avoid "add immediately followed by rescan" overwriting each other; the UI publishes the result immediately (same pattern as `acceptPersistedGames`).
6. **Explicit exclusion from saves/settings**: `GameSaveManager.resolveSaveLocation` adds `PC` (unavailable); `shouldShowSaveManagement(PC) = false`; `PerGameSettingsScreen` adds a PC info card.
7. **Engine page display (optional but recommended)**: `PC` goes into the GAL group, described as "manually added Windows games, run via external Winlator"; clicking the row opens a "PC engine list" dialog (Winlator only, isomorphic to YU-RIS, for checking install status/going to the download).
8. **exe search scope**: exes at the **root level** of the directory (filtering out settings/unins/setup/install/update/patch/crack/keygen; sorting: directory name match → size descending → name). Subdirectories/manual input are listed for phase 2.
9. **Permissions**: use SAF listing when adding (no permission needed); at launch reuse `requestAllFilesAccessIfNeeded` to get the real path (required by Winlator).

---

## 4. Detailed Change List

### 4.1 core: Types and Launching

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | add `PC("PC")` |
| `core/engine/external/EmulatorTarget.kt` | `engine: EngineType` → `engines: List<EngineType>` (single-element by default, constructor compatible); add `supports(engine)` |
| `core/engine/external/ExternalEmulatorRegistry.kt` | Winlator entry `engines = listOf(YURIS, PC)`; `forEngine` iterates to match; the aggregate dialog still shows a single entry |
| `core/game/launch/WindowsLaunchFiles.kt` (generalized from `YurisLaunchFiles.kt`) | keep `candidates(File)`; add `candidatesOf(entries: List<Pair<String, Long>>, dirName)` (for SAF/DocumentFile use); `resolveExe/resolveExeName/currentLaunchFileName` gain a PC branch (behavior same as YURIS); keep the old name for call sites or rename all at once (inside `EngineLauncher`) |
| `core/game/launch/EngineLauncher.kt` | add `PC` to `listLaunchFiles`/`currentLaunchFileName`'s `when(engine)` (exe candidates); add `PC` to `supportedEngines`; the launch branch needs no change (`ExternalEmulatorRegistry.forEngine(PC)` already matches Winlator) |
| `core/game/save/GameSaveManager.kt` | add `EngineType.PC` to `resolveSaveLocation`'s "unsupported" branch |

### 4.2 core: Scan Protection and Manual Add

| File | Change |
|---|---|
| `core/game/scan/EngineScanner.kt` | retain manual entries when `rescanLibrary` merges: `val manual = currentGames.filter { it.engine == EngineType.PC && activeScanned.none { s -> s.uri == it.uri } }`, `updateGames { manual + activeScanned.map{...} }`; `cleanupDeletedGame`/`GameRootMatcher` are not involved (PC has no scan root) |
| `ui/main/MainLibraryViewModel.kt` | add `fun addManualGame(game: ScanGame, onResult: (Boolean) -> Unit)`: validate that the uri does not exist (return false/notify if it does) → publish immediately via `acceptGames` → `enqueuePersistence` writes to the library (`updateGames { it + game }`) |
| `core/game/library/GameLibraryFacade.kt` | reuse `updateGames` (no change needed); use `loadGames` if "query by uri" is needed |

### 4.3 UI: Add Entry and Dialog (Game Page)

| File | Change |
|---|---|
| `ui/game/GameScreen.kt` | 1 add an icon to `AppTopBar.trailing` (new `R.drawable.ic_game_add_pc`, or reuse an existing icon initially); 2 add the "PC game add dialog" state and component `PcGameAddDialog` (`AppAlertDialog`): directory row (click → `OpenDocumentTree`) → candidate exe list (single select, `AppNavItem`/Radio row) → title row (defaults to the directory name, editable, optional) → "Add"; 3 add `PC` to the drawer's "launch file" condition; 4 add a PC placeholder color to `EngineType.coverColor()` |
| new `ui/game/PcGameAddDialog.kt` (or inside GameScreen) | dialog state machine: `idle → picking → loading → ready(entries, selected) → adding → done`; inline error states (directory unreadable/no exe/already exists) |
| `ui/engine/EngineScreen.kt` | `engineTabOf` → GAL; add PC to `engineDescription`; generalize the Winlator-specific dialog condition from `engine == YURIS` to "target is WINLATOR_EXTERNAL" |
| `ui/settings/PerGameSettingsScreen.kt` | add an `EngineType.PC` branch: info card (explains it runs via Winlator, the launch file can be switched, no save management) |
| `ui/game/GameScreen.kt` (shouldShowSaveManagement) | `PC` stays `false` (already automatic under the existing `ExternalEmulatorRegistry.forEngine != null` criterion, needs a unit test to lock it) |

### 4.4 Strings (Strictly Consistent Across Three Languages)

| Key | zh | ja | en |
|---|---|---|---|
| `game_add_pc_content_description` | 添加 PC 游戏 | PC ゲームを追加 | Add PC game |
| `pc_add_dialog_title` | 添加 PC 游戏 | PC ゲームを追加 | Add PC game |
| `pc_add_pick_directory` | 选择游戏目录 | ゲームフォルダーを選択 | Choose game folder |
| `pc_add_directory_empty` | 未选择目录 | フォルダー未選択 | No folder selected |
| `pc_add_exe_label` | 启动程序 | 起動プログラム | Executable |
| `pc_add_exe_empty` | 目录内未找到可启动的 .exe | 起動可能な .exe が見つかりません | No runnable .exe found |
| `pc_add_loading` | 正在读取目录...... | フォルダーを読み込み中... | Reading folder... |
| `pc_add_duplicate` | 该目录已在游戏库中 | このフォルダーは既に追加済みです | This folder is already in the library |
| `pc_add_failed` | 添加失败,请重试 | 追加に失敗しました | Failed to add, please retry |
| `engine_desc_pc` | 手动添加的 Windows 游戏,经外置 Winlator 运行 | 手動追加の Windows ゲーム。外部 Winlator で実行 | Manually added Windows games, run via external Winlator |
| `engine_settings_pc_hint` | 该游戏经外置 Winlator 运行;启动程序可在游戏详情「启动文件」中切换,无存档管理与引擎参数。 | このゲームは外部 Winlator で実行されます。起動プログラムはゲーム詳細の「起動ファイル」で変更できます。セーブ管理とエンジン設定はありません。 | Runs via external Winlator. Change the executable via "Launch file" in game details; no save management or engine options. |

(Icon resources: if there is no dedicated icon, reuse `R.drawable.ic_sheet_launch_file` in phase 1 and replace it later.)

---

## 5. Interaction Details

### 5.1 Add Flow

```
[game page top bar + icon]
  → AppAlertDialog:
      directory row: not selected → click opens the SAF directory picker (OpenDocumentTree + takePersistableUriPermission)
      → after selection, list the directory asynchronously: DocumentFile.listFiles() → filter *.exe (excluding settings/unins/setup/install/update/patch/crack/keygen)
        → sort: directory name match → size (DocumentFile.length()) descending → name
        → single-select list in the dialog (first item selected by default)
      → title input (defaults to the directory name, empty = directory name)
      → [Cancel] [Add] (disabled when no directory/exe is selected)
  → add: ScanGame(title, uri=treeUri, engine=PC, launchTarget=DIR, launchFile=selected exe, coverUri=local cover optional)
      → MainLibraryViewModel.addManualGame(FIFO queue + immediate publish)
      → success Toast/close; duplicate directory → inline `pc_add_duplicate` notice
```

### 5.2 Launch

- `EngineLauncher.launchInternalChecked` → `ExternalEmulatorRegistry.forEngine(PC)` matches Winlator → `launchYurisViaWinlator` (same function, suggested rename to `launchWindowsViaWinlator`) → resolve the real path + all-files → `WindowsLaunchFiles.resolveExeName(game, path)` (`launchFile` first) → `launchWinlator(dir, exe)`.
- Directory resolution failure/no exe → reuse the existing `GameDirUnresolved`/`YurisExeMissing` typed failures and strings (the `launch_yuris_exe_missing` string needs generalizing to "no runnable .exe found").

### 5.3 Launch File Switching

- The drawer's "launch file" is shown for PC; `LaunchFileDialog` reuses `EngineLauncher.listLaunchFiles` (PC → exe candidates) and `currentLaunchFileName`; confirming writes `launchFile` (`onGameUpdated` → VM `replaceGame`).
- If the selected exe is deleted: at launch `resolveExe` falls back to auto-selection (existing semantics), and reports a failure if that fails.

### 5.4 Saves and Settings

- The detail drawer does not show "save management" (`shouldShowSaveManagement(PC)=false`).
- The PC branch of the per-game settings page only has an info card (same structure as PSP/Switch); it shows no adjustable items.

---

## 6. Boundaries and Risks

| Risk | Handling |
|---|---|
| **Rescan deletes manual entries** (current `rescanLibrary` rebuilds the list) | the retention logic in §4.2 + unit tests (retained when scan results contain no PC, scan results take precedence when the same uri is present) |
| Directory on removable storage | SAF can list it when adding; real path resolution fails at launch → notify (same as YURIS) |
| Directory/exe deleted or renamed | launch failure notice; "launch file" can be re-selected (notify when the candidate list is empty) |
| Duplicate add of the same directory | deduplicate by uri before adding (`acceptGames`/`loadGames`), notify `pc_add_duplicate` |
| exe in a subdirectory | not supported in phase 1; note "launch file lists root directory exes only", phase 2 adds "browse subdirectories/manually enter a relative path" |
| Cover | no automatic scraping; the user can "search cover/change cover" (existing capability) |
| Winlator not installed/outdated | reuse the existing `package_not_installed` / `external_launch_unsupported` notices and download guidance |

---

## 7. Implementation Checklist (by File)

1. `EngineType.PC`; `EmulatorTarget.engines` + registry; `WindowsLaunchFiles` (PC branch)
2. `EngineLauncher` (supportedEngines/listLaunchFiles/currentLaunchFileName) + `GameSaveManager` (PC unsupported) + `shouldShowSaveManagement`
3. `rescanLibrary` retains PC entries + VM `addManualGame`
4. `PcGameAddDialog` + top bar icon + drawer launch file condition + `coverColor`
5. `EngineScreen` (GAL/description/Winlator dialog generalization) + `PerGameSettingsScreen` PC branch
6. three-language strings; tests (exe candidates, rescan retention, save hiding); README/CONTEXT updates

---

## 8. Testing and Acceptance

**Unit tests**
- `WindowsLaunchFilesTest` (extended from `YurisLaunchFilesTest`): PC branch candidate filtering/sorting, `launchFile` priority
- `EngineScannerManualGameTest`: PC entries retained after rescan; the same uri hit by scanning uses the scan result
- `GameCardItemKeyTest`: `shouldShowSaveManagement(PC) == false`
- `EngineType`/registry: `forEngine(PC)` matches Winlator and the aggregate dialog does not duplicate

**On-device acceptance**
1. top bar icon → choose directory → exes listed (the directory name match/largest selected by default) → add → a PC card appears in the game page (badge PC)
2. launch → Winlator confirmation dialog (shows the mounted drive letter) → enter the game
3. switch to another exe in the detail's "launch file" → takes effect on the next launch
4. the detail has no "save management"; per-game settings have only the info card
5. PC entries remain after scanning/rescanning; duplicate adds of the same directory are rejected
6. directory deleted/renamed → the launch notice is readable

---

## 9. Milestones

| Stage | Content | Estimate |
|---|---|---|
| P1 | type/registry/exe candidate generalization + `EngineLauncher`/save exclusion | 0.5 day |
| P2 | rescan protection + VM manual add command + unit tests | 0.5 day |
| P3 | top bar entry + add dialog + launch file switching + strings | 1 day |
| P4 | engine page/per-game info card + README/CONTEXT + on-device acceptance | 0.5 day |

---

## 10. Implementation Record (P1–P4)

- **Types and launching**: `EngineType.PC("PC")`; `EmulatorTarget.engine: EngineType` → `engines: List<EngineType>` (single-engine convenience constructor retained), Winlator target `engines = [YURIS, PC]`; `forEngine` matches via `supports`, the aggregate dialog still shows a single Winlator entry
- **exe resolution**: `YurisLaunchFiles` generalized to "name + size" candidates (new `ExeCandidate` and `candidatesOf`, for SAF-side use; `candidates(File)` keeps its original behavior)
- **Launch**: `EngineLauncher.launchWindowsViaWinlator` (renamed from `launchYurisViaWinlator`), reused by PC; `supportedEngines`/`listLaunchFiles`/`currentLaunchFileName` gain PC; the drawer's "launch file" is enabled for PC
- **Saves/settings**: `GameSaveManager` returns unsupported for PC; `shouldShowSaveManagement(PC)=false` (automatic via the registry, assertion added); `PerGameSettingsScreen` adds a PC info card
- **Rescan protection**: `EngineScanner.mergeScannedWithManual` (internal pure function): retains `engine==PC` entries not hit by scanning during rescan, the same uri uses the scan result; `incrementalScan` itself is "existing + newly discovered" and is unaffected
- **Manual add**: `MainLibraryViewModel.addManualGame` (dedupe + immediate publish + FIFO queued persistence); `PcGameAddDialog` (SAF directory pick + persistable permission → SAF list root directory exes → single select → confirm; no title input, title = directory name; duplicate directory inline notice); wired to local cover probing (`EngineScanner.applyLocalCover`)
- **Entry**: new icon in the game page top bar (`R.drawable.ic_game_add_pc`, from the user-provided `数据.png`), placed to the left of the search icon
  - later update: the top bar entry changed to an "add game" branch dialog (`AddGameDialog`: add PC game / add Android game), the icon was renamed to `ic_game_add`, and the content description key `game_add_pc_content_description` was renamed to `game_add_content_description`; this plan's PC dialog functionality is unchanged, only the entry path became "add game → add PC game"
- **Engine page**: PC goes into the GAL group + `engine_desc_pc`; the Winlator-family exclusive dialog condition was generalized to `EmulatorLaunchStyle.WINLATOR_EXTERNAL` (shared by YURIS/PC)
- **Strings**: three languages gain 12 keys (`engine_desc_pc`, `engine_settings_pc_hint`, `game_add_pc_content_description`, `pc_add_*`)
- **Tests**: `EngineScannerManualGameTest` (retain manual PC / scan takes precedence for the same uri / non-PC not protected), `GameCardItemKeyTest` (PC hides save management)
- Verification: `assembleDebug`, `testDebugUnitTest`, `check-hardcoded-ui-strings.py`, `git diff --check` passed; on-device verification to be completed once the device is connected (§8 acceptance 1–6)