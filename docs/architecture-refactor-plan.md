# TyranorNext Architecture Refactor Plan

> Generated: 2026-09-08
> Analysis scope: entire repository (core 54 files ~9.9k lines, ui 30 files ~8.3k lines, engine 154 files ~28.4k lines, cross-cutting concerns)
> Companion documents: architecture conventions in `AGENTS.md`, domain terminology in `CONTEXT.md`

> **Execution status (2026-09-10)**: all 6 items in the first tier are complete and pass `assembleDebug` / `testDebugUnitTest` / `checkHardcodedUiStrings`:
> - P0-1 EngineScanner split (`GameLibraryFacade` + `GamePathUtils`; Scanner now has 7 public methods and init callback registration is eliminated)
> - P0-6 Error protocol unification (`LaunchResult` / `GameSaveException` / `EnginePluginBootstrap.Failure` / external module `ExternalEngineErrorCode`; text mapping lives in `ui/common/LaunchErrorMessages.kt`, `ui/save/SaveErrorMessages.kt`; the rules are codified in `AGENTS.md`)
> - P1-7 engine `LaunchContract` (zero bare extras in the built-in path; external modules use `ExternalEngineContract`)
> - P0-3 `EffectiveEngineSettings` (pure-function merger, with JVM unit tests; `EngineSettingsResolver` for unified resolution; single source of truth for KR render preferences `KrRenderPrefs`)
> - P1-4 `AppScreenActivity` / `AppScreenScaffold` (7 secondary Activity boilerplates consolidated)
> - P2-10 Documentation revision (AGENTS.md Compose exemption boundaries + error protocol; CONTEXT.md dual FIFO lanes and new terminology)
>
> **2026-09-10 addendum**: all pending items in the "App-Layer Code Review Issue List" are now at zero (27 fixes + 4 exemptions). This also completed parts of the second/third tiers ahead of schedule:
> P0-4 Compose state fully converted to StateFlow (core has zero `androidx.compose.*` dependencies, and AGENTS.md restores the strict prohibition);
> P2-3 Room `exportSchema` enabled (`app/schemas`) and destructive upgrades narrowed to v1→v2 only (formal Migration and DAO splitting still pending).
>
> The remaining second/third-tier items (core modularization, GameScreen/SettingsScreen file splitting, InternalEngineModule, webcommon deduplication, ServiceLocator, etc.) are still pending.

---

## 1. Overall Assessment

The three-layer architecture (`ui → core → engine`) is directionally correct and the "hard rules" of the dependency direction are upheld, but there are two structural weaknesses:

1. **Responsibility drift inside the core layer** — concentrated God Objects, fragmented error protocols, and violations of its own declared dependency constraints;
2. **Missing ViewModels in the ui layer** — only 1 VM; page state is scattered across composables, and giant files host parasitic components that create horizontal dependencies.

### 1.1 Red Lines Already Upheld (no change needed)

| Red line | Verification result |
| --- | --- |
| engine does not depend on the app layer (`com.tyranor.next.*`) | grep over the whole repo: 0 hits |
| ui does not import low-level engine packages (`com.core`/`com.akira`/`com.yuri`/`org.tvp`/`org.libsdl`/`bridge`, etc.) | 0 violations |
| engine module dependencies are minimal | Only appcompat + documentfile + kotlin-stdlib, all `implementation` (not transitive) |
| Shared component reuse | AppTopBar in 10 places, AppAlertDialog in 8, good reuse |
| Type-safe Activity arguments | Unified via the `ScanGameIntents` factory pattern |
| Serialized write paths | Backstopped by the repository layer's single-thread FIFO executor |
| Extracted pure functions are testable | 23 JVM tests (StateReducer/Codec/SortKeys, etc.) |
| Documentation discipline | CONTEXT.md / AGENTS.md broadly consistent with the code, strong contract awareness (comments record issue #74, ABI compatibility, etc.) |

---

## 2. Problem List

Priority definitions:
- **P0** structural defects that continuously raise maintenance cost; largest return on change;
- **P1** local degradation (duplication/parasitism/boundary violation) affecting readability and consistency;
- **P2** latent risks and hygiene issues, not blocking for now but should be recorded.

### 2.1 core Layer (P0)

#### P0-1 EngineScanner God Object

- **Location**: `app/src/main/java/com/tyranor/next/core/game/scan/EngineScanner.kt` (1011 lines)
- **Current state**: the object singleton holds **27 public methods** spanning at least 7 responsibility categories:
  1. Scanning (`scanAll` / `rescanLibrary` / `incrementalScan` / `scanRoot`)
  2. Game library CRUD cache facade (`loadGames` / `updateGames` / `updateGameCover` / `removeGame`)
  3. Recent play (`recordRecentGame` / `loadRecentGames` / `removeRecentGame`)
  4. Quick launch (`loadQuickLaunch` / `addQuickLaunch` / `removeQuickLaunch` / `refreshQuickLaunch` / `isQuickLaunched`)
  5. Scan roots (`saveRoot` / `removeRoot` / `removeRootAndGames` / `loadRoots`)
  6. Engine detection (`detectEngine` / `applyLocalCover`)
  7. URI/path utilities (`safUriToPath` / `isRemovableStoragePath` / `safeSaveName`)
- **Extra coupling**: holds 3 `StateFlow` revision numbers + 4 groups of in-memory caches; the `init` block (lines 63-66) registers the `GameLibraryRepository.onPersistFailure` callback in reverse — an implicit load-order coupling between objects.
- **Impact**: library management responsibilities overlap with `GameLibraryRepository` (the same operation exists in both synchronous and suspend versions); the UI can write directly to the persistence layer during composition; tests must bypass the singleton.
- **Recommendation**: return library CRUD / recent play / quick launch / scan root responsibilities to `GameLibraryRepository` (or a new `GameLibraryFacade` facade), leaving only "scan + engine detection" in Scanner; unify revision broadcasts as a repository-layer responsibility.

#### P0-2 EngineLauncher Hardcodes Every Built-In Engine

- **Location**: `app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt` (1269 lines)
- **Current state**: the public surface is narrow (`launch` / `needsArtemisPatchConfirm` / `supportedEngines`), but lines 14-44 import **13 engine classes** at once (each engine Activity + `KrSafMirror` + `EngineSessionRegistry`); there are 36 private functions, internally mixing per-engine Intent construction, patch overlay disk writes, SAF mirror decisions, argument assembly and the Artemis version fallback chain.
- **Impact**: the "functional abstraction layer" in practice hardcodes knowledge of every concrete engine; external engines already have the `ExternalEngineModuleRegistry` module abstraction, but built-in engines do not follow the same path — the largest dependency-inversion gap.
- **Recommendation**: using `ExternalEngineModuleRegistry` as the template, establish a unified `InternalEngineModule` abstraction for built-in engines (`canHandle(engine) + buildIntent()`), leaving EngineLauncher to only orchestrate and merge settings; split per-engine Intent construction into independent strategy classes.

#### P0-3 Three-Level Setting Merge Logic Has No Abstraction

- **Location**: 30+ places in `EngineLauncher.kt` (108-109, 206-208, 395-510, 632-641, 900-901, 1255-1262)
- **Current state**: the override merge of app/engine/per-game three-level settings is scattered field-by-field across EngineLauncher using `?:`, with no unified merger; the field lists in `EngineSettingsStore` (73 getters/setters) and `PerGameSettingsStore.KR_FIELDS` are duplicated.
- **Impact**: adding one settings item requires changing `EngineSettingsStore` / `PerGameSettingsStore` / `EngineLauncher` in three places, and this layer has zero test coverage.
- **Recommendation**: extract an `EffectiveEngineSettings` merger (pure function, unit-testable) to unify three-level override resolution; EngineLauncher only consumes the result. Converge the field lists to a single source at the same time.

#### P0-4 core Violates Its Own "No Compose Dependency" Constraint

- **Location**:
  - `core/settings/AppSettingsStore.kt:5-6` (4 `MutableState`: languageState/navStyleState/gameSortState/coverScraperSettingsVersion)
  - `core/auth/HikarinagiAuthStore.kt:5-6` (`statusVersion: MutableState<Int>`)
  - `core/cover/CoverScrapeTaskManager.kt:6-7`
  - `core/game/model/ScanGame.kt:5` (`@Immutable` annotation, grey area)
- **Impact**: core singletons directly hold Compose-observable global state, making them untestable outside Compose/main thread; conflicts with the declaration at AGENTS.md:58.
- **Recommendation**: change Compose state to `StateFlow` or pure data payloads (the `ThemeColorPayload` pattern is already proven feasible, converted by UI-layer subscription); if `@Immutable` is kept, AGENTS.md must explicitly exempt runtime annotations.

- **Fixed (2026-09-10)**: the 4 `MutableState` and `HikarinagiAuthStore.statusVersion` are changed to `MutableStateFlow`, `CoverScrapeTaskManager.state` to `StateFlow`, and `@Immutable` removed from `ScanGame`; all UI subscribes via `collectAsState()`. core now has zero `androidx.compose.*` dependencies, and AGENTS.md restores the strict prohibition.

#### P0-5 core Depends on App R Resources

- **Location**: 15 core files `import com.tyranor.next.R` (including EngineLauncher, EngineScanner, GameSaveManager, CoverScraperService, and all 4 updater files); a typical case is `GameSaveManager.kt:123-160` where everything is `throw IOException(text(R.string....))`
- **Impact**: core is not an independent module and is tightly coupled to app resource compilation; localized messages are used as exception messages, so callers cannot programmatically distinguish error types.
- **Recommendation**: change core to pass `@StringRes Int` or error-code enums, and move text assembly up to the UI layer; this paves the way for P0-6 modularization.

#### P0-6 Fragmented Error Protocol (5 Styles Coexist)

| # | Style | Representative location |
| --- | --- | --- |
| 1 | `runCatching → null` | 25 call sites across core (mainstream) |
| 2 | `String?` error code | `EngineLauncher.launch(): String?` |
| 3 | `IOException(localized text)` | `GameSaveManager.kt:123-160` |
| 4 | runCatching → log swallowed | `EngineLauncher.kt:476,946,991,1035` |
| 5 | sealed Result (new code only) | `updater/GitHubUpdateChecker.kt:170`, `UpdateApkDownloader.kt:18`, `cover/CoverScraperService.kt:38` |

- **Impact**: callers cannot branch uniformly; old and new code use inconsistent protocols.
- **Recommendation**: use the proven sealed Result in updater/cover as the template, prioritizing two high-frequency call chains: `launch(): String?` and `GameSaveManager`; codify error protocol selection rules in AGENTS.md.

### 2.2 ui Layer (P1)

#### P1-1 Extremely Low ViewModel Coverage

- **Current state**: the whole ui layer has only 1 `MainLibraryViewModel` (367 lines); the other 14 files contain about 145 `remember { mutableStateOf }` occurrences, and secondary Activities all call core static singletons directly; `MainScreen.kt:88-94` manually calls `withContext(Dispatchers.IO)` inside `LaunchedEffect` to read settings (IO during composition).
- **Recommendation**: secondary Activities should at least move IO calls out of composition (VM or `produceState`); a full VM retrofit is not mandatory, but new pages must use VMs.

#### P1-2 GameScreen Giant File + Parasitic Components

- **Location**: `ui/game/GameScreen.kt` (1655 lines)
- **Current state**: embeds a ~650-line cover search subsystem (`CoverSearchDialog:1004` / `CoverCandidateCard:1220` / `CoverBitmapCache:1599` / `CoverThumbnailLoader:1607`) plus general utilities (`startActivityWithPageTransition:349` / `cleanupDeletedGame:332` / `rememberCoverBitmap:1521` / `gameCardItemKey:1442`), which are imported across packages by `ui/home` (`HomeScreen.kt:75-78`) — a home→game horizontal parasitic dependency; `GameActionsSheet` is a single 440-line composable (491-930).
- **Recommendation**: move cover search components to `ui/cover/`; move utilities to `ui/common/`; split GameActionsSheet by action domain.

#### P1-3 SettingsScreen Giant File + Parasitic Engine Settings

- **Location**: `ui/settings/SettingsScreen.kt` (1273 lines)
- **Current state**: embeds `EngineSettingsDetailScreen:660` (used by EngineSettingsActivity) and `krkrPercentOptions/krkrVcursorOptions:1217-1227`, and is imported across packages by `EngineScreen.kt:57` for `artVersionOptions` — an engine→settings horizontal dependency.
- **Recommendation**: make the engine settings UI its own file in the `ui/settings/engine/` subpackage.

#### P1-4 Activity Boilerplate Copied 7 Times

- **Current state**: every secondary Activity repeats the same ~25-30 lines: `isDarkEffective` check → `enableEdgeToEdge` (including the deprecated API `window.statusBarColor`) → `ProvideAppLocale { TyranorNextTheme { Surface } }` → `overridePendingTransition` in `finish()`. Affects all 7 secondary Activities (e.g. `EngineSettingsActivity.kt:21-60`).
- **Recommendation**: extract an `AppScreenScaffold` Composable host (or a lightweight BaseActivity) to unify theme wrapping, edge-to-edge and transitions.

#### P1-5 UI Bypasses FIFO and Writes Persistence Layer Directly (in Conflict with the Documented Claim)

- **Location**: `GameScreen.kt:210` (`EngineScanner.saveRoot`), `GameScreen.kt:334-335` (`removeRecentGame/removeQuickLaunch`), `SettingsScreen.kt:156-157/413-414/458`
- **Current state**: CONTEXT.md claims "MainLibraryViewModel serializes **all** persistence commands with a single-threaded FIFO queue", but there are in fact **two parallel FIFOs** (the VM Channel queue + the `GameLibraryRepository.writeScope` queue), and the UI direct-write path only enters the latter; it works only because the repository layer's second queue backstops it.
- **Recommendation**: make the repository layer's `post()` the single explicit write entry point, and change the documentation to describe reality; converge UI-side writes into the VM command queue or the repository facade.

#### P1-6 VM References DAO Constant Across Layers

- **Location**: `MainLibraryViewModel.kt:14` directly `import ...core.game.storage.GameLibraryDao` (only for the `MAX_QUICK_LAUNCH` constant, :189/:253)
- **Recommendation**: forward the constant through the `GameLibraryRepository` facade.

### 2.3 engine Layer (P1/P2)

#### P1-7 Intent Extras Contract Has No Unified Constant Class (the Most Fragile Contract)

- **Current state**: `path/gamePath/projectRoot/gamedir/rootUri/themeColor*` and other **20+ extras** are string literals scattered on both sides, with only a few having constants (`Anime4kRuntime.EXTRA_MODE`, `KrkrStartupDialogPolicy.EXTRA_ENABLED`); the protocol is loose (extras conventions + implicit shared prefs channel + explicit Intent class references — three channels coexist).
- **Recommendation**: define a `LaunchContract` contract constant class in the engine module and reference it from both app and engine; gradually make the shared prefs channel explicit.

#### P1-8 tyrano / rpgmaker Package Copy-Paste (~1500 lines)

| File pair | Duplication |
| --- | --- |
| `com/core/tyrano/VirtualMouseLayer.kt` ↔ `com/core/rpgmaker/VirtualMouseLayer.kt` | **byte-for-byte identical** (423 lines ×2) |
| `AsarArchive.kt` (both packages) | ~90% (the rpgmaker version has an extra `openStream`) |
| `TyranoStorage` ↔ `RpgMakerStorage` | Mostly the same (diff is only 65 lines) |
| `TyranoLocalHttpServer` ↔ `RpgMakerLocalHttpServer` | Has partially diverged |

- **Recommendation**: extract a `com.core.webcommon` shared package; parameterize the differences in the HTTP servers.

#### P1-9 Engine Host Activity God Classes

- **Current state**: `TyranoActivity` (1061 lines), `RpgMakerActivity` (1005 lines), `KirikiroidLauncherBaseActivity` (881 lines) mix window management/settings reading/HTTP/injection/storage; engine Activity logic is essentially untested (only 4 related unit tests).
- **Recommendation**: extract testable non-Activity logic (settings resolution, injection script preparation, storage path decisions), leaving only lifecycle and window management in the Activity.

#### P2-7 Business Logic Out of Bounds in engine + Implicit prefs Coupling

- **Current state**: engine reads/writes app-shared prefs directly (`TyranoActivity.kt:99` external network switch, `ArtemisLauncherBaseActivity.java:198` writing back the successful version, `OnsSettings` own prefs migration); `NativePluginManager/Installer` (SHA256 verification, enable state machine) leans toward app-side asset management; the `EngineLauncher.safeSharpnessValue` comment itself admits it is consistent with `OnsSettings.safeSharpness` (the same validation maintained in two places).
- **Recommendation**: converge prefs keys and read/writes onto the `EnginePrefs` contract anchor (partially done already); single-source the logic that must stay consistent on both sides, such as sharpness validation.

### 2.4 Cross-Cutting Concerns (P2)

#### P2-1 No DI + Initialization Order Maintained by Comments

- **Current state**: ~38 object singletons hardcode references to each other; the `EngineScanner.init` block registers the `GameLibraryRepository.onPersistFailure` callback; initialization order relies on comments in `TyranorNextApplication.onCreate` (lines 18-27) (PrefsRenameMigration must precede all prefs reads).
- **Recommendation**: do not force a DI framework; at minimum build a manual `ServiceLocator` to converge the singleton graph, making dependencies explicit and replaceable with test doubles.

#### P2-2 DB + prefs Dual-Write Transition Architecture (the Largest Consistency Risk Source)

- **Current state**: `GameOverridesRepository` / `GameLibraryRepository` prefs mirror write-back with a 1.5s debounce; cross-process prefs caches are invisible to each other, so touchpad fields written back by the engine subprocess get overwritten by the whole-row mirror, backstopped by `syncFromPrefs` backfill at startup (`GameOverridesRepository.kt:44-84`; the cacheGeneration retry loop shows the complexity); the comments themselves admit "full convergence is a follow-up item".
- **Recommendation**: converge long-term to a single source of truth (DB); engine subprocess write-back should go through an explicit Intent/file protocol rather than prefs.

#### P2-3 Room Storage Layer Risks

- **Current state**: `GameLibraryDatabase` uses `fallbackToDestructiveMigration(OnDowngrade)` (lines 44-46) + `exportSchema=false` — an upgrade without a migration path wipes the library, and a crash inside the debounce window loses increments; **a single DAO carries all 5 tables** with about 20 queries (`GameLibraryDao.kt` 137 lines); `EngineScanner.kt:13` directly imports DAO types, reaching storage details across packages.
- **Recommendation**: enable `exportSchema` and add formal Migrations; split the DAO by entity; confine DAO types to the storage package.

#### P2-4 No Unified Thread Utility

- **Current state**: no unified utility such as `runBlockingIo`; the three-line `runBlocking + withContext(IO)` template is reimplemented in three repositories (`GameLibraryRepository.kt:370-376` / `GameOverridesRepository.kt:98-103` / `EngineDetectionRepository.kt:101-102`); 46 handwritten `withContext(Dispatchers.IO)` occurrences; 2 global CoroutineScopes (GameLibraryRepository.writeScope, CoverScrapeTaskManager.scope); `SettingsScreen.kt:137` reads `EngineScanner.loadRoots` directly in a composition-time `remember {}` (relying on the warm cache as backstop).
- **Recommendation**: extract a unified blocking facade utility (including main-thread assertions); change composition-time reads to a single pattern of warm cache + revision subscription.

#### P2-5 No Logging Convergence

- **Current state**: 52 bare `android.util.Log` occurrences in app + 129 in engine, with TAG string literals scattered around; no level control, no release stripping strategy; engine uses SharedPreferences as a diagnostic log (`NativeBridge.recordOpenDiagnostic`); no UncaughtExceptionHandler.
- **Recommendation**: a lightweight logging facade (unified TAG prefix + release stripping/downgrading strategy), migrated incrementally.

#### P2-6 Navigation3 Exists in Name Only

- **Current state**: `NavigationKeys.kt` has only one `Main` NavKey, and `Navigation.kt` only forwards `MainScreen()`; real navigation = handwritten Tab state (`MainScreen.kt:83`) + 10 Activity jumps; `MainScreen`'s four Tabs × 7-8 callback props passing keeps expanding.
- **Recommendation**: decide whether to keep or drop it — either actually use Navigation3 for secondary pages, or remove the dependency; in the short term at least converge `MainScreen` callback props into a single `LibraryActions` data class.

#### P2-8 Three Coexisting Dialog Systems + Duplicated Loading States

- **Current state**: the in-house `AppAlertDialog` (8 places) coexists with native `Dialog` (`GameShortcutCropDialog.kt`) and `ModalBottomSheet` (`GameScreen.kt:53`); the loading flag + CircularProgressIndicator + empty-state text pattern is handwritten in 5+ places, and `common` has no unified async state component.
- **Recommendation**: keep the ModalBottomSheet cases (different interaction shape), migrate native Dialog to AppAlertDialog; add `AsyncStateContent` (loading/empty/error template) to `common`.

#### P2-9 Dead Code and Dead Configuration

- `ui/common/PlaceholderPage.kt` (38 lines) has zero references
- `app/build.gradle.kts:210/235-247` declares 6 androidTest dependencies, but the `app/src/androidTest` source set does not exist
- Pseudo-shared component: `LiquidGlassNavigation.kt` (282 lines, the largest file in `common`) has only one call site, MainScreen
- **Recommendation**: delete PlaceholderPage and the dead androidTest configuration (or add tests); move LiquidGlassNavigation to `ui/main/`.

#### P2-10 Weak Testability + Documentation Divergence

- **Current state**: all core Store/Repository objects are strongly Context-dependent and cannot be instantiated directly; e.g. `RpgVersionSettingsTest` has degenerated into constant assertions; the 30+ merge logic sites in EngineLauncher have zero tests. Two documentation divergences: 1) AGENTS.md says core must not use Compose, but 4 files in practice import runtime (see P0-4); 2) CONTEXT.md describes the FIFO "single entry point for all persistence commands", but in practice there are two FIFO lanes (see P1-5).
- **Recommendation**: per the AGENTS.md "documentation matches practice" discipline, either revise the documentation on the spot or eliminate the divergence when the plan lands; add pure-function unit tests when the merger (P0-3) lands.

---

## 3. Implementation Roadmap

### First Tier: Convergence (low risk, no architectural change, largest return)

| # | Item | Corresponding problem | Acceptance criteria |
| --- | --- | --- | --- |
| 1 | Split EngineScanner: return library management responsibilities to the repository-layer facade | P0-1 | Scanner public methods ≤ 10; UI never writes to the persistence layer during composition; init-block callback registration eliminated |
| 2 | Unify the error protocol (prioritize sealed Result for `launch()` / `GameSaveManager`) | P0-6 | Error types decoupled from UI text; selection rules codified in AGENTS.md |
| 3 | engine-side `LaunchContract` contract constant class | P1-7 | Zero bare extras strings; both sides reference the same constant source |
| 4 | `EffectiveEngineSettings` three-level settings merger | P0-3 | A new settings item changes only 1 place; merge logic has pure-function unit tests |
| 5 | Activity host component `AppScreenScaffold` | P1-4 | Boilerplate for 7 secondary Activities ≤ 5 lines each |
| 6 | Documentation revision (truthful description of the dual FIFO lanes, Compose runtime exemption boundaries) | P2-10 | Documentation matches code |

### Second Tier: Mid-Term Refactoring

| # | Item | Corresponding problem |
| --- | --- | --- |
| 7 | Modularize core into `:core` (R resources → `@StringRes`/error codes moved up; Compose state already StateFlow) | P0-4, P0-5 |
| 8 | Split GameScreen / SettingsScreen into files (cover components → `ui/cover/`, utilities → `ui/common/`, engine settings into their own subpackage) | P1-2, P1-3 |
| 9 | Built-in engine `InternalEngineModule` abstraction (aligned with ExternalEngineModuleRegistry) | P0-2 |
| 10 | `com.core.webcommon` shared package (deduplicate tyrano/rpgmaker) | P1-8 |
| 11 | Manual ServiceLocator to converge the singleton graph | P2-1 |
| 12 | Unified blocking facade utility + composition-time read convergence | P2-4 |

### Third Tier: On Record (handle when opportune)

| # | Item | Corresponding problem |
| --- | --- | --- |
| 13 | Logging facade (unified TAG + release stripping) | P2-5 |
| 14 | Navigation3 keep-or-drop decision; `MainScreen` callback prop convergence | P2-6 |
| 15 | Room: exportSchema enabled, destructive upgrade narrowed to v1→v2; add formal Migrations and DAO splitting | P2-3 |
| 16 | Converge DB+prefs dual-write into a single source of truth | P2-2 |
| 17 | Split engine Activity God classes (sink logic into testable units) | P1-9 |
| 18 | Dead code/configuration cleanup; AsyncStateContent component; make the engine prefs channel explicit | P2-8, P2-9, P2-7 |

---

## 4. Principle Constraints (Must Not Be Broken During Refactoring)

1. Dependency direction is fixed at `ui → core → engine`; engine has zero reverse dependencies and ui has zero direct engine package imports (the current 0 violations must be maintained).
2. core's external API semantics are threefold: operation failure throws an exception (a future AppException), no result returns null/empty collection, and callers do their own fault-tolerant `runCatching`.
3. All persistence writes must go through the repository layer's single-threaded queue (the only serialization guarantee point).
4. Verify each refactoring step with `./gradlew assembleDebug --no-daemon` + `checkHardcodedUiStrings`; use rg to verify key changes actually landed on disk (historical lesson: the Edit tool occasionally reports false success).
5. Terminology changes are synchronized to `CONTEXT.md`; when there is a conflict with the code, point out the difference immediately using the code as the source of truth (AGENTS.md documentation discipline).