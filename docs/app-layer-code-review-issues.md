# App-Layer Code Review Issue List

> Review scope: `app/src/main/java/com/tyranor/next` (89 Kotlin files, roughly 17,700 lines)
> Review basis: `AGENTS.md` review guidelines (five independent angles: code logic / architecture / robustness / regression risk / code conventions)
> Verification method: 4 independent review agents in parallel + 2 independent verification agents re-checking each item against the source, **all 31 items confirmed valid, 0 false positives**
> Review date: 2026-09-01

## Issue statistics

| Severity | Count | Description                                                         |
| ----- | -- | ---------------------------------------------------------- |
| Major | 2  | Functional defects, architectural layering violations, explicit-spec violations (M5/M6 confirmed exempt; M1/M2/M3/M4/M7-M11 all fixed, 0 pending)               |
| Minor | 20 | Boundary races, duplicated code, convention-consistency deviations                                          |
| Exempt    | 4  | M5/M6 quick-launch card font sizes; m1 SAF fallback directory creation `savedata` check; m14 liquid glass navigation 16dp corner radius — all recorded in AGENTS.md / in this item's resolution |
| Fixed   | 27 | 8 items in the first round on 2026-09-01 + M1, m2-m13 (excluding exemptions), m15-m20 fixed on 2026-09-10; summary below |

### 2026-09-10 fix summary

| Item | Fix content |
| --- | --- |
| M1 | `CoverSearchCandidate` gained `vndbId`/`metadataTitle`; wired through in three places: `asCoverOnlyUpdateFrom`, `mergeScrapedCover`, `bindCoverCandidate`; the batch callback condition now includes metadata changes (metadata-only changes are also persisted); the candidate persistence codec was updated accordingly |
| m2 | `GameLibraryFacade` quick-launch add/remove/save all wrapped in `synchronized(cacheLock)` (positions after the split) |
| m3 | `cleanTitle` English edition words now use `\b` word boundaries; added `CoverTitleCleanTest` |
| m4 | When ciphertext exists but decryption fails transiently, the legacy plaintext is kept and the function returns; only when "ciphertext is decryptable and different" is confirmed is it suppressed |
| m5 | 5 `MutableState` (4 in AppSettingsStore + `HikarinagiAuthStore.statusVersion`) changed to `MutableStateFlow`, `CoverScrapeTaskManager.state` changed to `StateFlow`, removed `ScanGame@Immutable`; core now has zero `androidx.compose.*` dependencies, and AGENTS.md restored the strict prohibition |
| m6 | `WithoutPressIndication` moved down into the `theme/` package, eliminating the theme→ui.common reverse dependency |
| m7 | `exportSchema=true` + KSP `room.schemaLocation=app/schemas` (2.json already produced); the destructive rebuild upgrade path narrowed to v1→v2 only (`fallbackToDestructiveMigrationFrom(1)`), future versions without a Migration now fail explicitly; downgrade rebuild retained |
| m8 | Save page directory resolution/traversal moved to `LaunchedEffect` + `withContext(IO)`, `refresh()` became suspend |
| m9 | Two `runCatching` calls on the patch page changed to try/catch, rethrowing `CancellationException` |
| m10 | Patch download cumulative byte cap of 200MB + new `patch_download_too_large` text in three languages |
| m11 | `AppNavItem` gained `showLeadingIcon`; `SaveActionCard` deleted, 3 action items changed to AppNavItem |
| m12 | Disappeared with the M8 Compose rewrite (no more `dialog.show()` dead check), confirmed by re-review |
| m13 | `Color.kt`'s `DarkGrey` made public and referenced, deleting the hardcoded `0xFF17191C` |
| m15 | New `Color.kt` constant `QuickLaunchFallback`, referenced by HomeScreen |
| m16 | Two SliderRows merged into `SliderRow(..., discrete)` |
| m17 | `BottomInsetSpacer` consolidated into `ui/common/Spacing.kt`, deleting the two private copies |
| m18 | New `FontImport` in `ui/settings/FontSettings.kt` (single implementation of display-name resolution + extension whitelist) |
| m19 | New `FontPreference` unified font dialog (shared by global/per-game, dialog items go through AppNavItem) |
| m20 | `AppScreenActivity`/`AppScreenScaffold` consolidated the boilerplate of 7 secondary Activities |

| Category        | Count |
| --------- | -- |
| Code logic      | 5  |
| Architecture / regression risk | 7  |
| Code robustness     | 5  |
| Code conventions      | 14 |

***

## Major issues

### M1. vndbId/metadataTitle from VNDB scraping are dropped along the entire chain, database metadata columns are always empty

- [x] Fixed (2026-09-10)

- **Category**: code logic

- **Location**: [CoverScraperService.kt:360-364](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/cover/CoverScraperService.kt#L360-L364)

- **Description**: `VndbCoverService.fetchBestCover` (VndbCoverService.kt:43-48) deliberately returns a result carrying `vndbId` / `metadataTitle`, but the entire effective chain drops these two fields:

  1. Batch scraping: `scrapeLibraryCovers` converts via `asCoverOnlyUpdateFrom` (CoverScraperService.kt:360-364), and that function only copies the two fields `coverUri` / `coverSource`;
  2. Merge layer `mergeScrapedCover` (CoverScrapeTaskManager.kt:104-112) likewise only compares/copies the two cover fields;
  3. Manual binding: `bindCoverCandidate` (CoverScraperService.kt:113-133) returns a value without `vndbId`; the only place writing `vndbId`, `VndbCoverService.bindCandidate` (VndbCoverService.kt:51-65), has zero callers project-wide.
     Contradicting this, `EngineScanner.rescanLibrary` (EngineScanner.kt:411-412) deliberately protects these two columns from being cleared by a scan, which shows they are intentionally maintained data, yet they are always empty in practice.

  > Verification note: `updateGameCover` (EngineScanner.kt:176-191) does in fact compare and persist four columns; the root cause is that the upstream transform input no longer has new values; grep confirms the only source of new values project-wide is the stripped `VndbCoverService` output.

- **Fix suggestion**:

  1. `asCoverOnlyUpdateFrom` copies the source result's `vndbId` / `metadataTitle` (overwrite when non-null);
  2. `mergeScrapedCover` compares and merges these two fields too;
  3. `bindCoverCandidate` fills `vndbId` / `metadataTitle` for VNDB candidates (can delegate to the existing `VndbCoverService.bindCandidate`).

### M2. core layer depends in reverse on the theme package, forming a core↔theme cycle and indirectly pulling in Compose types

- [x] Fixed (2026-09-06)

- **Category**: architecture

- **Location**: [EngineLauncher.kt:38](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt#L38), [EngineLauncher.kt:336-343](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt#L336-L343)

- **Description**: Line 38 of `EngineLauncher` does `import com.tyranor.next.theme.AppThemeColors`, and lines 336-343 read `AppThemeColors.isDark` / `primaryArgb` in `buildIntent` to inject theme colors into the engine Intent. Meanwhile line 9 of `theme/AppThemeColors.kt` already imports `core.settings.AppSettingsStore` (theme→core), so core→theme makes the two packages circular. Moreover `AppThemeColors` is built on `androidx.compose.runtime.mutableStateOf` and `androidx.compose.ui.graphics.Color`, making core indirectly depend on Compose types, violating AGENTS.md's "core must not depend on Compose UI components" and the fixed dependency direction (UI layer → feature abstraction layer → engine layer).

  > Fix note: implemented per suggestion 1 — added `core/theme/ThemeColorPayload.kt`, a pure data payload (darkMode / primaryArgb / onPrimaryArgb / cardArgb / textArgb / mutedArgb) plus the `ThemeColorPayloadStore` snapshot provider; `AppThemeColors.refresh` writes the snapshot every time the theme is loaded/switched; `EngineLauncher.buildIntent` now reads the snapshot (falling back to `ThemeColorPayload.DEFAULT`, consistent with the engine-side EngineThemeColors fallback). core no longer imports `com.tyranor.next.theme.*`.

- **Fix suggestion**: Define a pure data payload class inside core (e.g. `ThemeColorPayload`: darkMode / primaryArgb / card / text / muted) and have the ui-layer call site or the Application startup populate a core-readable snapshot provider from `AppThemeColors`; alternatively move the theme-color injection at the tail of `buildIntent` up into a ui-layer wrapper.

### M3. The core layer contains a @Composable function, Compose UI logic misplaced in the feature abstraction layer

- [x] Fixed (moved when the three-language solution landed, confirmed by re-review on 2026-09-06)

- **Category**: architecture

- **Location**: [AppLocaleController.kt:50-66](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/i18n/AppLocaleController.kt#L50-L66)

- **Description**: Lines 9-13 import `androidx.compose.runtime.*` and `androidx.compose.ui.platform.*`; lines 50-66 define the `@Composable` function `ProvideAppLocale` (CompositionLocalProvider supplying LocalContext / LocalConfiguration), used by 8 Activities (MainActivity, SaveManagementActivity, CoverScraperSettingsActivity, KrkrOnlinePatchActivity, PerGameSettingsActivity, AppSettingsActivity, EngineSettingsMenuActivity, EngineSettingsActivity). This violates AGENTS.md's "core must not depend on Compose UI components". The pure logic in the same file, lines 20-47 (wrap / localeOf / findActivity), is a legitimate core responsibility.

  > Fix note: `ProvideAppLocale` has been migrated to `ui/common/AppLocaleProvider.kt` (a @Composable wrapper calling `AppLocaleController.wrap` and injecting LocalContext / LocalConfiguration / LocalResources); `core/i18n/AppLocaleController.kt` now keeps only the pure logic `wrap` / `localeOf` / `findActivity`, with no Compose import at all; all 8 Activities plus ArtemisPatchChoiceDialog now import `com.tyranor.next.ui.common.ProvideAppLocale`. grep re-review confirms no `@Composable` functions remain in the core package (the remaining `MutableState`/`Immutable` were state snapshot primitives, not UI components).

- **Fix suggestion**: Migrate `ProvideAppLocale` to `ui/common` (e.g. `ui/common/AppLocale.kt`), keeping only non-composition logic in `core/i18n`; update the ui-layer import paths accordingly (8 places).

### M4. The krkr patch install task is bound to transient UI state, so after rotation it can install concurrently in duplicate and produce temp-file write races

- [x] Fixed (2026-09-06)

- **Category**: code robustness

- **Location**: [KrkrOnlinePatchActivity.kt:118-235](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/patch/KrkrOnlinePatchActivity.kt#L118-L235)

- **Description**:

  1. `installing` / `entries` / `message` (:120-123) are all `remember` (not `rememberSaveable`), and the download coroutine runs in `rememberCoroutineScope()` (:118, :220 scope.launch);
  2. After rotation the old coroutine scope is cancelled, but `KrkrOnlinePatchService.downloadAndInstall` internally uses HttpURLConnection + copyTo and other blocking IO without suspension points, so the download is not interrupted and keeps writing to completion in the game directory;
  3. In the rebuilt UI `installing` resets to false, the install button becomes available again, and the user can click once more to start a second concurrent task;
  4. Both tasks in `downloadAndInstall` (KrkrOnlinePatchService.kt:72) use the same fixed-path temp file `File(downloadDir, fileName)`, interleaving writes in truncate mode; the `finally` of whichever finishes first calls `tempFile.delete()` (:78-80) and deletes the temp file the other task is still writing, so the eventual `copyIntoGameDir` may copy a corrupt patch xp3 into the game directory;
  5. Rotation also loses the loaded patch index list and checkbox state, and `LaunchedEffect(Unit)` triggers a duplicate network request.

  > Fix note: implemented per the suggestion "service-layer process-level mutual exclusion" — `KrkrOnlinePatchService.downloadAndInstall` is wrapped entirely in a process-level `installLock` (kotlinx.coroutines Mutex, following the GameSaveManager.importLock pattern), so at any moment only one instance is downloading/writing to disk; the temp file now uses `File.createTempFile` to guarantee uniqueness and avoid clashing with historical leftovers, and `finally` only cleans up its own file. Concurrent tasks from rotation/repeated clicks no longer interleave writes to the same temp file, and the first finisher no longer deletes another's file; the worst case degrades to "serial re-download and re-install" (overwrite is idempotent), and data is no longer corrupted. UI-layer state persistence (rememberSaveable / keeping checkbox state) was not included: persisting `installing` would hang without reset when the old coroutine is already dead after rotation, and the remainder is merely the UX issue of "duplicate index requests / having to re-check items", which the process-level mutual exclusion covers as safe, idempotent behavior.

- **Fix suggestion**: Lift the download/install task and state into a ViewModel (with a Job handle and an installing StateFlow); or add process-level mutual exclusion to `downloadAndInstall` in the service layer (following `GameSaveManager.importLock`) and guarantee unique temp files (`File.createTempFile`); and persist key UI state with `rememberSaveable`.

### M5. The quick-launch card's engine name uses the prohibited headlineSmall size

- [x] Exempt (2026-09-10, per the current AGENTS.md clauses)

- **Category**: code conventions (two-tier text size rule)

- **Location**: [HomeScreen.kt:408-413](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/home/HomeScreen.kt#L408-L413)

- **Description**: The engine name `Text` in the quick-launch card uses `MaterialTheme.typography.headlineSmall`. AGENTS.md's "Page content text size conventions" explicitly prohibits `bodySmall / bodyLarge / labelMedium / labelLarge / headlineMedium / headlineSmall` and other typography sizes; page content may only use the two tiers `titleMedium` / `bodyMedium`.

- **Fix suggestion**: Change it to `MaterialTheme.typography.titleMedium` (optionally add `FontWeight.Bold` to keep the visual hierarchy).

- **Resolution (exempt)**: The explicit QuickLaunchCard exemption in the current `AGENTS.md` already covers "game name `titleLarge` Bold, engine name `headlineSmall` Bold", and neither is subject to the two-tier rule (see the last clause of "Page content text size conventions" in AGENTS.md); this item and M6 are both intentional design, and the status quo is kept.

### M6. The quick-launch card's game name uses titleLarge, exceeding the two-tier rule

- [x] Exempt: confirmed as intentional design and written into AGENTS.md's "Page content text size conventions" as an explicit exemption clause (quick-launch card game name `titleLarge` Bold is not subject to the two-tier rule); no code change needed

- **Category**: code conventions (two-tier text size rule)

- **Location**: [HomeScreen.kt:414-422](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/home/HomeScreen.kt#L414-L422)

- **Description**: The game name `Text` inside the card uses `typography.titleLarge`. The original judgment conflicted with AGENTS.md's "titleLarge is only usable for top bar titles"; it was later confirmed that this card is a special case using a blurred cover background with white text, and is intentional design.

- **Resolution**: Added an explicit exemption clause to the text size conventions in AGENTS.md (QuickLaunchCard game name `titleLarge` Bold); this item is no longer tracked as an issue.

### M7. AppAlertDialog's dialog background uses PageGrey instead of white

- [x] Fixed: `containerColor` changed from `PageGrey` to `NavWhite` (white by default in light mode, and computed live from the "tone switch" setting), and the KDoc comment now matches the implementation

- [x] Supporting adjustment: once the dialog became white, it matched the in-dialog items that are also `NavWhite`, so the visual hierarchy disappeared (e.g. join group chat / version module / scan directory / launch file selection dialogs). `AppNavItem` gained a `containerColor` parameter (default NavWhite keeps pages unchanged), and in-dialog items now uniformly pass `PageGrey` (gray card on a white dialog, dual to the white card on a gray page), with the AGENTS.md `AppNavItem` section and the 3.5 container color conventions updated accordingly

- **Category**: code conventions (dialog conventions)

- **Location**: [AppAlertDialog.kt:105](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/common/AppAlertDialog.kt#L105)

- **Description**: The Card container uses `containerColor = PageGrey`. In light mode `PageGrey` defaults to `GreyLight(0xFFF2F3F5)` (gray) rather than pure white, becomes white only when toneSwitch is enabled, and is near-black in dark mode. AGENTS.md explicitly states "all dialog backgrounds must be white", and the component container conventions specify that dialog content items should reference `NavWhite` rather than `PageGrey`. The KDoc comment on line 48 claims "white background", contradicting the implementation.

- **Fix suggestion**: Change `containerColor` to `NavWhite` (white by default in light mode, computed live from the "tone switch" setting, and also conforming to the component container color conventions).

### M8. The Artemis patch confirmation dialog uses a View-system AlertDialog instead of going through AppAlertDialog

- [x] Fixed: the native `Context.confirmArtemisPatchChoice` was deleted and a new Compose suspending version `awaitArtemisPatchChoice` was added (`setContent` + `ProvideAppLocale` + `AppAlertDialog`, reusing the same button→strategy mapping); the GameShortcutActivity trampoline now goes through that Compose dialog

- **Category**: code conventions (dialog conventions)

- **Location**: [ArtemisPatchChoiceDialog.kt:80-104](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/game/ArtemisPatchChoiceDialog.kt#L80-L104), [GameShortcutActivity.kt:56-60](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/game/GameShortcutActivity.kt#L56-L60)

- **Description**: Line 3 does `import android.app.AlertDialog`, and `confirmArtemisPatchChoice` uses `AlertDialog.Builder` to show a system-style dialog. This violates AGENTS.md's "all dialogs must uniformly use AppAlertDialog" and "all dialog backgrounds must be white, and corner radius must use the unified 8dp value" — white background / 8dp corners / unified layout are all uncontrollable. The usage site, GameShortcutActivity, is a pure ComponentActivity transparent trampoline (no setContent), but technically `setContent` + a Compose dialog is entirely possible (all other Activities do exactly that).

- **Fix suggestion**: Change the trampoline to a Compose version with `setContent` + `AppAlertDialog` (reusing this file's button→strategy mapping); or add an explicit exemption for this scenario in AGENTS.md.

### M9. The unified top bar entry PlaceholderPage has no call sites project-wide (dead code) and itself violates the conventions

- [x] Fixed (2026-09-06)

- **Category**: code conventions (top bar conventions)

- **Location**: [PlaceholderPage.kt:23-56](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/common/PlaceholderPage.kt#L23-L56)

- **Description**: AGENTS.md states the top bar "is currently implemented by the unified entry PlaceholderPage, and new pages should reuse it", but a project-wide grep finds only the definition plus references in AGENTS.md and docs, with **zero actual call sites**. The component itself also violates the conventions: the line 38 title lacks `FontWeight.Bold` (required by the conventions), and the top bar container lacks the `Modifier.background(colorScheme.background)` opaque background layer (the first layer of the section 6 structure diagram). This issue is the root cause of the ten handwritten copies in M10.

  > Fix note: implemented per the suggestion "complete the component and replace everything uniformly" — added `ui/common/AppTopBar.kt`, a unified top bar component (structure: opaque background + statusBarsPadding + 64dp title row with titleLarge Bold + `trailing` icon slot + `underTitle` collapsible-area slot; the `background`/`contentColor` parameters serve the three color-source cases Material / Miuix / tone switching); `PlaceholderPage` now uses AppTopBar with bold title and background layer added; for the replacement see the M10 fix note. AGENTS.md's top bar conventions gained a new "0. Unified entry (AppTopBar)" section.

### M10. The top bar structure is hand-copied across 10 pages instead of reusing a unified component

- [x] Fixed (2026-09-06)

- **Category**: code conventions (top bar conventions + duplicated code)

- **Location** (10 places, common skeleton: Column + background + statusBarsPadding + 64dp + horizontal 16dp + titleLarge Bold):

  1. [HomeScreen.kt:131-141](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/home/HomeScreen.kt#L131-L141)
  2. [EngineScreen.kt:75-87](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/engine/EngineScreen.kt#L75-L87)
  3. [GameScreen.kt:397-447](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/game/GameScreen.kt#L397-L447)
  4. [SaveManagementActivity.kt:159-177](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/save/SaveManagementActivity.kt#L159-L177)
  5. [KrkrOnlinePatchActivity.kt:147-168](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/patch/KrkrOnlinePatchActivity.kt#L147-L168)
  6. [SettingsScreen.kt:545-567](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L545-L567)
  7. [SettingsScreen.kt:628-639](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L628-L639) (SettingsTopBar)
  8. [AppSettingsActivity.kt:114-130](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/AppSettingsActivity.kt#L114-L130)
  9. [EngineSettingsMenuActivity.kt:104-123](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/EngineSettingsMenuActivity.kt#L104-L123)
  10. [PerGameSettingsScreen.kt:235-250](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/PerGameSettingsScreen.kt#L235-L250), [CoverScraperSettingsActivity.kt:330-347](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/cover/CoverScraperSettingsActivity.kt#L330-L347)

- **Description**: Violates AGENTS.md's "all pages share PlaceholderPage (or a structure consistent with it); each page must not implement its own differently-styled top bar". Verification confirmed the color sources had drifted three ways: Material pages use `colorScheme.background/onBackground`, Miuix pages use `MiuixTheme.colorScheme.background/onBackground`, and CoverScraperTopBar uses `PageGrey/TextColor` — confirming "each implements its own, so the unified entry has failed".

  > Fix note: all 11 handwritten top bar sites replaced with `AppTopBar`: HomeScreen / EngineScreen / SaveManagementActivity call it directly; KrkrOnlinePatchActivity / GameScreen / SettingsScreen (engine settings) / PerGameSettingsScreen use the `trailing`/`underTitle` slots to carry their existing icons and collapsible search fields; AppSettingsActivity / EngineSettingsMenuActivity / SettingsTopBar pass Miuix colors; CoverScraperTopBar passes PageGrey/TextColor to preserve the tone-switch semantics. Structure, 64dp, titleLarge Bold and the opaque background layer are all consolidated into a single point of maintenance in the component, and a grep re-review finds no leftover handwritten skeletons.

### M11. GameActionRow hand-assembles items with Row, navigation items do not reuse AppNavItem

- [x] Fixed (2026-09-06)

- **Category**: code conventions (feature navigation item conventions + duplicated code)

- **Location**: [GameScreen.kt:1322-1360](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/game/GameScreen.kt#L1322-L1360)

- **Description**: `GameActionRow` (Row + clip 8dp + NavWhite + horizontal 16dp + left icon 24dp + bodyMedium) corresponds element by element with `AppNavItem` (AppNavItem.kt:61-109); the only differences are the missing right arrow, vertical padding, icon tint with the theme color, and an extra danger state. At the call site GameScreen.kt:698-716, "Save management" (:701), "Online patch" (:709) and "Engine settings" (:715) are clearly "go to the next level" navigation items, falling under the AGENTS.md rule mandating AppNavItem (and they sit inside the GameActionsSheet dialog, which the conventions explicitly cover).

  > Fix note: implemented per the suggestion "extend AppNavItem to eliminate the parallel implementation" — AppNavItem gained three parameters: `showArrow` (true for navigation items / false for action items), `leadingIconTint` (primary/error icon color) and `titleColor` (danger title in error color); all 11 action items in GameActionsSheet changed to `AppNavItem(containerColor = NavWhite)`: navigation items (save management / online patch / engine settings) keep the right arrow, action items hide it, and the delete item keeps its danger semantics with an error tint + error title; the `GameActionRow` component was deleted entirely. (Note: the sheet is a ModalBottomSheet whose background is `colorScheme.background` (=PageGrey), so items use NavWhite as a white card on gray; a drawer-specific clause was added to AGENTS.md 3.5.)

- **Fix suggestion**: Change navigation items to `AppNavItem`; if the action semantics differences must be kept, extend AppNavItem with danger / hide-arrow parameters to eliminate the two parallel implementations.

***

## Minor issues

### m1. The SAF fallback directory creation hardcodes the check on the directory name "savedata", so ONS's "save" directory returns false even on success

- [x] Exempt (2026-09-10)

- **Category**: code logic

- **Location**: [EngineLauncher.kt:532-563](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt#L532-L563)

- **Description**: The last line of the function, :560 `current.name.equals("savedata", ignoreCase = true)`, binds the success condition to the directory name. The ONS launch branch (:283-291) passes a path ending in `"save"` when not scoped, so even when every level of createDirectory succeeds (ok=true), the name comparison fails and it still returns false; `saveDirReady` merely becomes false and a warning is logged, and the save directory is not guaranteed to exist. Only the krkr call site (:526/:528 pass savedata) happens to match. Currently, because "all files access" permission is enforced before launch, mkdirs failure is rare.

- **Fix suggestion**: Remove the hardcoded check on the target directory name, and instead record the resolved relative target and verify "the end of the relative path has been reached" after creating each level (e.g. compare the number of created segments, or that the final canonical path matches the target).

- **Resolution (exempt)**: `createSafDirectoryForStoragePath` is the fallback path that "creates directories level by level under a SAF-authorized directory"; the only call site whose return value is actually used is KRKR's `savedata` (`ensureKrGameSaveDirViaSaf`); the ONS non-scoped branch does pass `save`, but the return value only decides whether to print a warning, the `--save-dir` argument is still injected, and the primary path `saveDir.mkdirs()` has already run first. Validating against `savedata` to avoid falsely reporting success for unknown directory names is an intentional tightening; the status quo is kept and the exemption registered.

### m2. saveQuickLaunch writes the shared cache without a lock, addQuickLaunch's read-check-write is non-atomic, causing lost-update races

- [x] Fixed (2026-09-10)

- **Category**: code logic

- **Location**: [EngineScanner.kt:264-299](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/scan/EngineScanner.kt#L264-L299)

- **Description**: `addQuickLaunch` (:268-274) performs `loadQuickLaunch` (unlocked volatile read) → duplicate/capacity check → `saveQuickLaunch` (:292-294 directly `quickLaunchCache = snapshot`), never holding `cacheLock`. Every other cache write path in the same file is inside `synchronized(cacheLock)` (updateGames:149, updateGameCover:172, recordRecentGame:197, removeRecentGame:219, updateRecentGames:242, saveRoot:312, removeRoot:325), with quick-launch reads/writes the sole exception. When two threads run `addQuickLaunch` concurrently, the later save overwrites the earlier one (a game is lost).

  > Verification note: the "more than 3 slots" clause is practically unreachable (a single add writes length = snapshot+1 ≤ 3); the core problem is the lost update. The current main callers are effectively serial, masking the risk, but EngineScanner is a public object, so concurrent calls violate the invariant by contract.

- **Fix suggestion**: Bring `addQuickLaunch` / `removeQuickLaunch` / `saveQuickLaunch` under `synchronized(cacheLock)`, merging the read-check-write into a single locked operation.

### m3. cleanTitle's cleanup regex lacks word boundaries, titles containing the substrings patch/complete/trial get wrongly truncated

- [x] Fixed (2026-09-10)

- **Category**: code logic

- **Location**: [CoverSupport.kt:109-123](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/cover/CoverSupport.kt#L109-L123)

- **Description**: The regex at :119, `"(?i)complete|$localizedEditionWords|trial|patch"`, has no `\b` word boundaries, so replace replaces the substring at any position in the title. A demonstrable counterexample: "patch" matches inside "Dispatch" → the cleaned result becomes "Dis ". The cleaned result is used directly as the search keyword for Hikarinagi (:176, :199) / Bangumi (:250, :262) / Steam (:305, :323) / VNDB (VndbCoverService.kt:92); at best this fails to find the right entry, at worst it matches the wrong game and returns the wrong cover.

- **Fix suggestion**: Add word boundaries to the alternation, e.g. `"(?i)\\b(complete|trial|patch)\\b|$localizedEditionWords"` (Chinese words need no boundary), or tokenize and match whole words before reassembling.

### m4. Token migration clears the legacy plaintext token when Keystore decryption fails transiently, irreversibly losing the login state

- [x] Fixed (2026-09-10)

- **Category**: code logic + robustness

- **Location**: [HikarinagiAuthStore.kt:61-73](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/auth/HikarinagiAuthStore.kt#L61-L73)

- **Description**: The hasSecureTokens branch of `ensureMigrated` (:65-67) compares the legacy plaintext with the result of `SecureAuthStore.decryptField`; when they differ at :68-69 it immediately calls `legacy.edit().clear()` and sets `FIELD_MIGRATED=true`, never retrying. But `SecureAuthStore.decryptField` (SecureAuthStore.kt:45-62) on a transient Keystore exception (the comment explicitly gives "early cold start" as an example) swallows the exception via `runCatching` and returns an empty string without throwing, so the outer catch at :97 cannot catch it. At that point legacy is non-empty and secure is an empty string, which is misjudged as "the user has already logged in again after a failed migration", and the plaintext token is cleared; if the ciphertext ultimately cannot be decrypted (e.g. after migrating to a new device and restoring a backup, the Keystore key no longer matches), the login state is lost for good.

- **Fix suggestion**: Before clearing legacy, first confirm that secureAccess decryption succeeded (verify the ciphertext is non-empty and that decryptField did not take the failure path); when decryption fails, keep the legacy plaintext and return (retry the migration next time), and clear only when it is confirmed that "the ciphertext is decryptable and the token really differs".

### m5. core's settings/storage/model layer holds androidx.compose.runtime observable state (UI state leaking into core)

- [x] Fixed (2026-09-10)

- **Category**: architecture (boundary violation)

- **Location**:

  - [AppSettingsStore.kt:5-6](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/settings/AppSettingsStore.kt#L5-L6) (languageState:55, navStyleState:85, gameSortState:88, coverScraperSettingsVersion:91)

  - [HikarinagiAuthStore.kt:5-6](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/auth/HikarinagiAuthStore.kt#L5-L6) (:32 statusVersion)

  - [CoverScrapeTaskManager.kt:6-7](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/cover/CoverScrapeTaskManager.kt#L6-L7) (:30-31 State\<CoverScrapeTaskState>)

  - [ScanGame.kt:5](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/model/ScanGame.kt#L5) (@Immutable)

- **Description**: 12 `androidx.compose.*` imports in total under core. Strictly speaking `compose.runtime` is not a "UI component", making this a boundary-level violation, but depositing UI recomposition state in the feature abstraction layer hinders core from evolving independently.

- **Fix suggestion**: New code should not spread this pattern; for strict layering, change in-memory state to `kotlinx.coroutines.flow.StateFlow` collected with collectAsState by the ui layer, or lift it into a ui-layer ViewModel; at minimum, clarify in AGENTS.md the boundary convention that "core may use compose.runtime state".

  > Resolution (2026-09-10): 5 states changed to `MutableStateFlow` (`AppSettingsStore.languageState/navStyleState/gameSortState/coverScraperSettingsVersion` + `HikarinagiAuthStore.statusVersion`), `CoverScrapeTaskManager.state` changed to `StateFlow`, `@Immutable` removed from `ScanGame`; the UI now subscribes with `collectAsState()` everywhere (`ProvideAppLocale`/`MainScreen`/`GameScreen`/`AppSettingsScreen`/CoverScraper pages). core now has zero `androidx.compose.*` imports, and AGENTS.md restored the strict prohibition (no runtime state primitives and no `@Immutable`).

### m6. theme→ui/common reverse import, theme and ui form a package cycle

- [x] Fixed (2026-09-10)

- **Category**: architecture

- **Location**: [MiuixSettingsTheme.kt:9](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/theme/MiuixSettingsTheme.kt#L9) (used at :68)

- **Description**: `import com.tyranor.next.ui.common.WithoutPressIndication`, while many ui files import theme (e.g. GameScreen.kt:111-114, CoverScraperSettingsActivity.kt:54-59), so theme and ui depend on each other in a cycle, which prevents the theme package from being extracted/reused independently.

- **Fix suggestion**: Move `WithoutPressIndication` down into the theme/ package (a shared modifier of the theme layer), keeping the dependency one-way ui→theme.

### m7. Destructive migration + exportSchema not enabled, future schema evolution has a silent database-wipe regression window

- [x] Fixed (2026-09-10)

- **Category**: architecture / regression risk (the comment already declares part of the trade-off)

- **Location**: [GameLibraryDatabase.kt:44-46](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/game/storage/GameLibraryDatabase.kt#L44-L46)

- **Description**: version=2 (:24) and `exportSchema=false` (:25); :44 `fallbackToDestructiveMigrationOnDowngrade(dropAllTables=true)` + :46 `fallbackToDestructiveMigration(dropAllTables=true)`. The v1→v2 destructive rebuild is a known trade-off declared in the comment (prefs mirror restore), but two residual risks remain: 1) the prefs mirror in `GameLibraryRepository.kt:50` has a 1500ms debounce window (:313-323), and writes inside that window have no mirror to restore from; 2) `exportSchema=false` plus no Migration at all means that from v3 onward, any schema change where someone forgets to provide a Migration will silently wipe the entire database, and engine\_detection\_cache (Artemis launch memory) has to be relearned.

- **Fix suggestion**: Before the next schema change, enable exportSchema and configure a schema directory, and write proper Migrations; narrow the destructive migration to the downgrade case only (keep OnDowngrade) and force explicit migrations on the upgrade path.

### m8. The save management page performs recursive directory traversal during main-thread composition and in refresh()

- [x] Fixed (2026-09-10)

- **Category**: code robustness (verification downgraded: the SAF Binder is only a fallback path; the primary path is string parsing + local File IO)

- **Location**: [SaveManagementActivity.kt:113-122](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/save/SaveManagementActivity.kt#L113-L122)

- **Description**: :113-114 call `manager.resolveSaveLocation(game)` on the main thread inside the `remember` initialization block (the primary path being `safUriToPath` string parsing + `File.isDirectory`; the SAF Binder query is only a fallback after path resolution fails) and `manager.listSaveFiles(game)` (:307-315 recursively traverses the entire save directory tree on the main thread). `refresh()` at :119-122 also calls them from the main-thread segment of `runSaveTask` (outside `withContext(Dispatchers.IO)`). For Artemis games the save location is the game root directory, so with tens of thousands of files the first open and every completed operation cause jank.

- **Fix suggestion**: Change the initial load to `LaunchedEffect { withContext(Dispatchers.IO) { ... } }` and then populate state; wrap the whole body of `refresh()` in `withContext(Dispatchers.IO)`, returning to the main thread only to write back the result.

### m9. runCatching catches CancellationException, coroutine cancellation is misreported as an install failure

- [x] Fixed (2026-09-10)

- **Category**: code robustness

- **Location**: [KrkrOnlinePatchActivity.kt:223-233](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/patch/KrkrOnlinePatchActivity.kt#L223-L233) (:131 loadIndex likewise)

- **Description**: :223 `runCatching { downloadAndInstall(...) }` also catches `CancellationException`: when Activity recreation cancels the scope, the cancellation exception is handled as `onFailure` and a technical exception text is written to message, which both swallows the cancellation signal (breaking structured concurrency) and shows the user a misleading error. The runCatching in `loadIndex` at :131 is the same (with milder consequences).

- **Fix suggestion**: Follow the existing pattern in this project at GameScreen.kt:962: first `catch (e: CancellationException) { throw e }` and then catch other exceptions, or wrap a helper that only catches non-cancellation exceptions.

### m10. Patch downloads have no total byte cap, extreme input can fill up external storage

- [x] Fixed (2026-09-10)

- **Category**: code robustness

- **Location**: [KrkrOnlinePatchService.kt:115-127](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/core/patch/KrkrOnlinePatchService.kt#L115-L127)

- **Description**: `downloadToFile` is a bare `input.copyTo(output)` copy with neither a contentLength precheck nor a cumulative byte cap. The index content is parsed line by line with a regex (parseLine :86-101), so if the index content is abnormal or a URL points to an oversized resource, installing multiple selections can fill the disk without the user noticing. For comparison: `CoverImageCache.download` has a 20MB cap (CoverSupport.kt:18/:48/:59), and `GameSaveManager.extractZip` has a 1GB cap (GameSaveManager.kt:488/:373); this one has none.

- **Fix suggestion**: Accumulate written bytes in the copy loop and set a cap (e.g. 200MB); when exceeded, throw IOException and clean up the partial file.

### m11. SaveActionCard hand-assembles items with Card+Row+KeyboardArrowRight

- [x] Fixed (2026-09-10)

- **Category**: code conventions (verification downgraded: export/import/delete are actions rather than "go to the next level" navigation, so they do not fully fall under the mandatory AppNavItem scope; and AppNavItem forces a placeholder icon when there is no left icon)

- **Location**: [SaveManagementActivity.kt:252-271](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/save/SaveManagementActivity.kt#L252-L271)

- **Description**: A handwritten Card (NavWhite+8dp) + Row (h16 v18.5) + Text (titleMedium) + Icon (KeyboardArrowRight, onSurfaceVariant), highly duplicating the AppNavItem shape, and missing the dark-mode auto-tint-white adaptation for the arrow, importing `Icons.AutoMirrored.Filled.KeyboardArrowRight` itself.

- **Fix suggestion**: For consistency, first add no-icon / danger parameters to AppNavItem and then switch to it; otherwise keep it but be aware of the dual track versus the standard component.

### m12. Checking continuation.isActive synchronously after dialog.show() is dead code

- [x] Disappeared with the M8 dialog rewrite (re-reviewed 2026-09-10)

- **Category**: code conventions (dead code)

- **Location**: [ArtemisPatchChoiceDialog.kt:97-100](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/game/ArtemisPatchChoiceDialog.kt#L97-L100)

- **Description**: `suspendCancellableCoroutine` already registered `invokeOnCancellation` to dismiss (:96), and :97 has a prior `if (continuation.isActive)` check; after :98 `dialog.show()` returns synchronously, :99 checks `isActive` again — within a synchronous window on the same thread isActive cannot flip, so the :99 branch is unreachable.

- **Fix suggestion**: Delete the inner if and keep only `dialog.show()`.

### m13. Hardcoded Color(0xFF17191C) duplicates the private Color.kt constant DarkGrey

- [x] Fixed (2026-09-10)

- **Category**: code conventions (neutral color consolidation)

- **Location**: [LiquidGlassNavigation.kt:87](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/common/LiquidGlassNavigation.kt#L87)

- **Description**: `Color(0xFF17191C)` is literally and semantically identical to `DarkGrey` at theme/Color.kt:18, but because that constant was private it got hardcoded again, so the two drift when the dark palette is adjusted. This violates "neutral colors must be consolidated into Color.kt".

- **Fix suggestion**: Make Color.kt's DarkGrey a public constant and reference it here.

### m14. The navigation bar's 16dp corner radius conflicts with the "components uniformly use 8dp corners" clause (no registered exemption)

- [x] Exempt (2026-09-10)

- **Category**: code conventions (cross-page consistency)

- **Location**: [LiquidGlassNavigation.kt:90](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/common/LiquidGlassNavigation.kt#L90), :243

- **Description**: The comment at :89 cites the convention while declaring an intentional deviation that "liquid glass navigation adds 8dp on top of 8dp"; the navigation item capsule at :243 is likewise 16dp without explanation. This is inconsistent with AGENTS.md's "components uniformly use a corner radius of 8dp" clause, an unregistered exception that leaves future maintainers at a loss.

- **Fix suggestion**: Pick one: revert the navigation bar to 8dp corners, or add a corner-radius exemption clause for liquid glass navigation in AGENTS.md.

- **Resolution (exempt)**: Implemented per suggestion 2 — a corner-radius exemption clause was added to "Cross-page consistency requirements" in `AGENTS.md`: the liquid glass navigation bar body and navigation item capsules use 16dp (8dp plus another 8dp) as intentional design, not subject to the uniform 8dp rule, and other components must not cite it.

### m15. A page hardcodes the neutral color Color(0xFF303338)

- [x] Fixed (2026-09-10)

- **Category**: code conventions (verification downgraded: single private constant with a purpose comment)

- **Location**: [HomeScreen.kt:472](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/home/HomeScreen.kt#L472)

- **Description**: `private val QuickLaunchFallbackBackground = Color(0xFF303338)`; that value is not in theme/Color.kt (the existing dark shades are 0xFF222529 / 0xFF17191C). This violates "before adding any color, first check whether Color.kt already has a ready constant; neutral colors must be consolidated".

- **Fix suggestion**: Move it into theme/Color.kt as a named constant (e.g. QuickLaunchFallback) and reference it from HomeScreen.

### m16. EnumSliderRow and ContinuousSliderRow are nearly completely duplicated

- [x] Fixed (2026-09-10)

- **Category**: code conventions (duplicated code)

- **Location**: [SettingsScreen.kt:866-927](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L866-L927)

- **Description**: The two functions (:866-897 and :900-927) are line-for-line identical except for the four lines of snap+haptic parameters on the Slider (showKeyPoints/keyPoints/magnetThreshold/hapticEffect) — same ArrowPreference skeleton, endActions text, valueRange, callbacks.

- **Fix suggestion**: Merge them into `SliderRow(label, options, current, onSelect, discrete: Boolean)`, with discrete controlling the snap/haptic parameters.

### m17. BottomInsetSpacer is duplicated verbatim in two files

- [x] Fixed (2026-09-10)

- **Category**: code conventions (duplicated code)

- **Location**: [SettingsScreen.kt:643-645](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L643-L645), [AppSettingsActivity.kt:319-321](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/AppSettingsActivity.kt#L319-L321)

- **Description**: Even the KDoc comment of the private function of the same name, "list bottom spacer: avoid the system navigation bar", is word-for-word identical — a cross-file copy.

- **Fix suggestion**: Move it into ui/common (e.g. common/Spacing.kt) for settings-type pages to share.

### m18. Font import is implemented twice with drifting behavior (one place does not validate the extension)

- [x] Fixed (2026-09-10)

- **Category**: code conventions (duplicated code + inconsistent behavior)

- **Location**: [PerGameSettingsScreen.kt:502-509](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/PerGameSettingsScreen.kt#L502-L509), [SettingsScreen.kt:965-982](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L965-L982)

- **Description**: Both are private implementations of "import a font into filesDir/fonts" but their behavior has drifted: SettingsScreen.importFont first queries DISPLAY\_NAME via contentResolver.query (more reliable) and then validates the .ttf/.ttc/.otf/.otc whitelist; PerGameSettingsScreen.copyFontToPrivate only takes the name from `uri.lastPathSegment` (which may be null or contain path noise in provider scenarios) and does not validate the extension at all.

- **Fix suggestion**: Extract a single implementation into the core layer (e.g. core/settings/FontImport.kt) or ui/common, unifying the extension validation and file name resolution.

### m19. The font selection dialog is structurally duplicated in two places

- [x] Fixed (2026-09-10)

- **Category**: code conventions (duplicated code)

- **Location**: [PerGameSettingsScreen.kt:473-498](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/PerGameSettingsScreen.kt#L473-L498) (OverrideFont), [SettingsScreen.kt:929-963](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt#L929-L963) (FontRow)

- **Description**: Both components are "ArrowPreference + open state + AppAlertDialog + Column{two clickable Rows + cancel}", where the "select font file" item is line-for-line identical; the differences are only the semantics of the first item (follow global / clear override vs use built-in font / reset) and where the current value is displayed.

- **Fix suggestion**: Merge into a single FontPreference component with an optional override parameter (override == null renders the global version, otherwise renders the three-state version).

### m20. 7 Activities duplicate the handwritten edge-to-edge status bar template and inconsistencies have already appeared

- [x] Fixed (2026-09-10)

- **Category**: code conventions (duplicated code + template drift)

- **Location**: [AppSettingsActivity.kt:65-73](file:///Users/weiss/opencode/rma/TyranorNext/app/src/main/java/com/tyranor/next/ui/settings/AppSettingsActivity.kt#L65-L73) (same pattern: EngineSettingsMenuActivity:56-64, EngineSettingsActivity:24-32, CoverScraperSettingsActivity:72-76, SaveManagementActivity:69-73, KrkrOnlinePatchActivity:76-80, PerGameSettingsActivity:27)

- **Description**: The "darkMode check + enableEdgeToEdge two-branch" template is repeated in 7 Activities besides MainActivity. Moreover the first three (AppSettings:70-73, EngineSettingsMenu:61-64, EngineSettings:29-32) additionally handwrite `@Suppress("DEPRECATION") window.statusBarColor/navigationBarColor = TRANSPARENT` after enableEdgeToEdge, while the comments in MainActivity:44 and PerGameSettingsActivity:31 explicitly state "transparent immersion is handled by enableEdgeToEdge, no need to set the deprecated window\.statusBarColor again" — redundant in the former, concise in the latter: template drift.

- **Fix suggestion**: Extract an Activity extension function (e.g. `ComponentActivity.setupTransparentSystemBars()`) to unify the template, and delete the redundant window\.statusBarColor assignments after enableEdgeToEdge.

***

## Items that passed review (no issues found)

- **Dependency direction largely holds**: core/ has no `import com.tyranor.next.ui.*`; ui/theme/root packages have no imports of the engine packages `com.core / com.akira / com.yuri / org.tvp / org.libsdl / org.cocos2dx / bridge` (all 21 engine package imports live inside core/, which is allowed by the conventions).

- **EngineType dispatch is complete**: all 11 enum values are covered by the `when` in `EngineLauncher.buildIntent` (enforced at compile time); each engine's Intent extras contract corresponds one-to-one with the consumption points on the engine side (theme color injection → EngineThemeColors/KrDialogStyle, Artemis version fallback → ArtemisLauncherBaseActivity, krkr prefs → KirikiroidLauncherBaseActivity, `KR_RENDER_PREF_KEYS`(10) and `KR_FIELDS`(10) matching in count).

- **No conflicts in the external engine registry**: the RENPY dual modules are resolved by `resolveModule` according to version.

- **PrefsRenameMigration is non-destructive**: marker key + idempotent "copy only when the target is missing" merge; old files are kept so rollback is possible, and running for the whole process satisfies the declaration.

- **Room and process boundary**: `GameLibraryRepository.init` has an `isMainProcess` guard, so engine subprocesses never touch the database; the prefs mirror + `syncFromPrefsLocked` restore chain really exists.

- **Theme conventions core compliance**: both theme functions use `primaryColor: Color? = null` + read inside the function body + `@NonSkippableComposable` + `ensureLoaded`; there are no `colorScheme.surface*` container references.

- **Component conventions compliance**: no Material TopAppBar/Scaffold/TextField/Switch violations; top bar icons all use TopBarIcon; all search/input fields go through AppSearchField (AppSearchField's internal use of Miuix SearchBar/InputField is the component's fixed template and is compliant).

- **Robustness protections in place**: `GameSaveManager` atomic import + backup rollback, `ArtemisPfsUnpacker` path traversal/size limits, `EnginePluginBootstrap` zip-slip protection, `SecureAuthStore` Keystore fallback, cover 20MB / save zip 1GB caps, Room transaction boundaries, LIKE escaping and ESCAPE, SQL shard limit of 500, CancellationToken cancellation point coverage.

## Fix priority suggestions

> Updated: 2026-09-10 — **all items cleared**: 27 fixed (including the first round of 8 on 2026-09-01), 4 exempt (M5/M6/m1/m14); nothing pending.
> Verification: `assembleDebug` + `testDebugUnitTest` + `checkHardcodedUiStrings` all pass; `app/schemas` now begins to be exported per version.

If regressions occur later, handle them in this priority order:
1. **P0 (data correctness)**: M1, m4 (fixed; changes concentrated in the cover metadata chain and token migration)
2. **P1 (correctness/robustness)**: m3, m8, m9, m10 (fixed)
3. **P2 (architecture/evolution)**: m5, m6, m7 (fixed)
4. **P2 (conventions/duplication)**: M5/m14 exempt; m11, m13, m15-m19 fixed
