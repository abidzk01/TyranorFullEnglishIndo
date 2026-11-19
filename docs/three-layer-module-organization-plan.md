# Three-Layer Module Organization Plan

## Implementation Status

This plan has been landed in the current workspace:

- The feature abstraction layer has been migrated to `app/src/main/java/com/tyranor/next/core/`.
- The UI layer has been migrated by page domain to `app/src/main/java/com/tyranor/next/ui/`.
- The old `scanner`, `settings`, `updater`, and `ui/pages` main source packages have been emptied and removed.
- Shared native plugin so files use `engine/src/main/nativeplugins` as the source of truth; the app side keeps the manifest and app-only plugins, which are merged and packaged by Gradle at build time.
- Shared RPGMaker scripts `__rmmz__.js`, `__hook_rmmz_core.js`, `__hook_rmmz_managers.js` use `engine/src/main/assets` as the source of truth and are generated into app assets by Gradle at build time.
- `AGENTS.md` has been extended with the three-layer directory rules; new files must be classified according to this plan.

## Goal

Classify the current project into three explicit layers by responsibility:

1. Bottom engine layer: responsible for actual engine execution, Native/JNI, engine host Activity, engine resources, and plugin loading.
2. Feature abstraction layer: responsible for turning app-side business intent into executable capability, including game scanning, launching, covers, saves, patches, settings, and updates.
3. Interface UI interaction layer: responsible for Compose pages, Activity shells, navigation, dialogs, theme, user interaction, and state presentation.

The goal is not a one-shot massive move, but to gradually stabilize the dependency direction as follows without breaking existing functionality:

```text
Interface UI interaction layer
    ↓
Feature abstraction layer
    ↓
Bottom engine layer
```

The bottom engine layer must not depend on app UI in reverse; the UI layer must not depend directly on engine implementation classes; cross-layer communication all goes through the feature abstraction layer.

## Current Structure Overview

The current project is a standard Android multi-module project:

```text
TyranorNext/
├── app/       # App entry point, Compose UI, feature abstraction layer, app resources
├── engine/    # Engine host, Native/JNI, SDL/Cocos/IJK, engine resources
├── docs/      # Plan documents
├── gradle/    # Gradle Wrapper and version catalog
├── .github/   # CI/CD
└── build.gradle.kts / settings.gradle.kts / gradle.properties
```

The module boundaries are broadly reasonable:

- `app` is the final application module and depends on `engine`.
- `engine` is an Android Library carrying bottom engine capabilities.
- The UI currently does not import low-level engine packages such as `com.core`, `org.tvp`, `org.libsdl`, or `bridge` directly.
- The main changes are concentrated on package responsibilities inside `app`: the old `scanner` package has been split into `core/*`, and the old `ui/pages` has been split into UI feature domains.

## Layer One: Bottom Engine Layer

### Current Ownership

The bottom engine layer is mainly located at:

```text
engine/
├── src/main/java/
│   ├── bridge/
│   ├── com/akira/tyranoemu/remote/
│   ├── com/core/
│   ├── com/ies_net/artemis/
│   ├── com/yuri/onscripter/
│   ├── org/cocos2dx/lib/
│   ├── org/libsdl/app/
│   ├── org/libsdl3/app/
│   ├── org/tvp/
│   └── tv/danmaku/ijk/
├── src/main/cpp/
├── src/main/jniLibs/
├── src/main/assets/
├── src/main/nativeplugins/
└── src/main/AndroidManifest.xml
```

### Responsibilities

- Engine host Activities:
  - Kirikiri/Kirikiroid
  - krkrsdl3
  - ONScripter
  - Artemis
  - Tyrano
- Native/JNI bridging:
  - `krkr_bridge.cpp`
  - `bridge.NativeBridge`
  - `bridge.KrSafMirror`
  - `bridge.KrPathUtils`
- Third-party/porting layer code such as SDL, SDL3, Cocos2dx, IJK.
- Engine-side resources, scripts, fonts, CSB UI, native so files.
- Native plugin installation, lookup, loading, and version compatibility.
- Engine-process-level low-level preferences and UI strings, e.g. `EnginePrefs`, `EngineThemeColors`, `EngineUiText`.

### Layer Rules

- May depend on Android Framework, DocumentFile, Native/JNI, and engine third-party libraries.
- Must not depend on `com.tyranor.next.ui.*`.
- Must not depend on app page state, Compose components, or ViewModel.
- Must not directly decide how the app game list, cover list, or settings page is presented.
- Parameters required for engine launch are passed in via Intent, extras, file paths, Uri, and the plugin management interface.

### Follow-up Optimization Points

- Keep the `engine` module as the bottom boundary; migrating UI pages into `engine` is not recommended.
- The `bridge` package name is rather generic; it may later be moved to `com.core.bridge` or split per engine into `com.core.kirikiri.bridge`.
- `engine/src/main/nativeplugins` and `app/src/main/nativeplugins` contain duplicate resources, so the source-of-truth needs to be made explicit.
- `engine/src/main/assets` and `app/src/main/assets/engine` contain some duplicate scripts, so it must be clear which are engine runtime resources and which are app packaging/injection resources.

## Layer Two: Feature Abstraction Layer

### Ownership Before the Change

Before the change, the feature abstraction layer was mainly scattered across:

```text
app/src/main/java/com/tyranor/next/
├── scanner/
├── settings/
└── updater/
```

Here `scanner` was not just a scanning layer, but contained multiple business capabilities:

```text
scanner/
├── ArtemisPfsUnpacker.kt
├── CoverScrapeTaskManager.kt
├── CoverScraperService.kt
├── CoverSupport.kt
├── EngineLauncher.kt
├── EnginePluginBootstrap.kt
├── EngineScanner.kt
├── EngineType.kt
├── GameSaveManager.kt
├── KrkrOnlinePatchService.kt
├── ScanGame.kt
└── VndbCoverService.kt
```

### Responsibilities

The feature abstraction layer accepts intent from the UI layer and schedules bottom engine or system capabilities:

- Scan game directories and identify engine types.
- Maintain the game data model.
- Choose the engine host based on game type and launch it.
- Prepare native plugins, SAF mirrors, and engine parameters.
- Manage cover search, download, merge, and cache refresh.
- Manage game save import/export/isolated saves.
- Manage online patches.
- Manage app settings, engine settings, and per-game settings.
- Manage background update checks and notification policy.
- Manage Hikarinagi authorization.

### Current Directory

`scanner` has been broken into more precise feature packages:

```text
app/src/main/java/com/tyranor/next/core/
├── game/
│   ├── model/
│   │   └── ScanGame.kt
│   ├── scan/
│   │   └── EngineScanner.kt
│   ├── launch/
│   │   └── EngineLauncher.kt
│   └── save/
│       └── GameSaveManager.kt
├── engine/
│   ├── EngineType.kt
│   └── plugin/
│       └── EnginePluginBootstrap.kt
├── cover/
│   ├── CoverSupport.kt
│   ├── CoverScraperService.kt
│   ├── CoverScrapeTaskManager.kt
│   └── VndbCoverService.kt
├── patch/
│   └── KrkrOnlinePatchService.kt
├── unpack/
│   └── ArtemisPfsUnpacker.kt
├── settings/
│   ├── AppSettingsStore.kt
│   ├── EngineSettingsStore.kt
│   └── PerGameSettingsStore.kt
├── auth/
│   ├── HikarinagiAuthService.kt
│   └── HikarinagiAuthStore.kt
└── updater/
    ├── BackgroundUpdateWorker.kt
    ├── GitHubUpdateChecker.kt
    └── UpdateNotificationManager.kt
```

### File Migration Mapping

| Current file | Suggested destination | Rationale |
| --- | --- | --- |
| `scanner/ScanGame.kt` | `core/game/model/ScanGame.kt` | Game data model, not scanning implementation |
| `scanner/EngineScanner.kt` | `core/game/scan/EngineScanner.kt` | Game scanning and detection |
| `scanner/EngineLauncher.kt` | `core/game/launch/EngineLauncher.kt` | Launch adapter from app to engine |
| `scanner/GameSaveManager.kt` | `core/game/save/GameSaveManager.kt` | Save business logic |
| `scanner/EngineType.kt` | `core/engine/EngineType.kt` | Engine type abstraction |
| `scanner/EnginePluginBootstrap.kt` | `core/engine/plugin/EnginePluginBootstrap.kt` | Engine plugin preparation |
| `scanner/CoverSupport.kt` | `core/cover/CoverSupport.kt` | Cover support rules |
| `scanner/CoverScraperService.kt` | `core/cover/CoverScraperService.kt` | Cover scraping service |
| `scanner/CoverScrapeTaskManager.kt` | `core/cover/CoverScrapeTaskManager.kt` | Cover task scheduling |
| `scanner/VndbCoverService.kt` | `core/cover/VndbCoverService.kt` | VNDB cover source |
| `scanner/KrkrOnlinePatchService.kt` | `core/patch/KrkrOnlinePatchService.kt` | Online patch service |
| `scanner/ArtemisPfsUnpacker.kt` | `core/unpack/ArtemisPfsUnpacker.kt` | Artemis PFS unpacking |
| `settings/AppSettingsStore.kt` | `core/settings/AppSettingsStore.kt` | App configuration storage |
| `settings/EngineSettingsStore.kt` | `core/settings/EngineSettingsStore.kt` | Engine configuration storage |
| `settings/PerGameSettingsStore.kt` | `core/settings/PerGameSettingsStore.kt` | Per-game configuration storage |
| `settings/HikarinagiAuthService.kt` | `core/auth/HikarinagiAuthService.kt` | Account authorization service |
| `settings/HikarinagiAuthStore.kt` | `core/auth/HikarinagiAuthStore.kt` | Account authorization state |
| `updater/*` | `core/updater/*` | Update check and notification policy |

### Layer Rules

- May depend on the bottom `engine` module.
- May depend on Android Framework, WorkManager, DocumentFile, network, file system.
- Must not depend on Compose UI components.
- Must not depend on concrete page classes, except for the very few system callback Activity targets that can be isolated via an Intent contract.
- State needed by the UI layer should be organized into stable data models or result types, rather than exposing bottom engine classes directly.

## Layer Three: Interface UI Interaction Layer

### Ownership Before the Change

Before the change, the UI layer was mainly located at:

```text
app/src/main/java/com/tyranor/next/
├── MainActivity.kt
├── Navigation.kt
├── NavigationKeys.kt
├── TyranorNextApplication.kt
├── theme/
└── ui/
    ├── common/
    ├── main/
    └── pages/
```

`ui/pages` once mixed top-level tabs, secondary Activities, dialogs, and local UI:

```text
ui/pages/
├── AppAlertDialog.kt
├── AppSettingsActivity.kt
├── CoverScraperSettingsActivity.kt
├── CoverSourceUi.kt
├── EngineScreen.kt
├── EngineSettingsActivity.kt
├── EngineSettingsMenuActivity.kt
├── GameScreen.kt
├── HikarinagiOAuthCallbackActivity.kt
├── HomeScreen.kt
├── KrkrOnlinePatchActivity.kt
├── PerGameSettingsActivity.kt
├── PerGameSettingsScreen.kt
├── PlaceholderPage.kt
├── SaveManagementActivity.kt
└── SettingsScreen.kt
```

### Responsibilities

- Compose pages and components.
- Activity shells and page enter/exit animations.
- User clicks, input, dialogs, loading states, error states.
- Main navigation, tab switching, top bar.
- Theme, colors, typography, shared UI components.
- Calling the feature abstraction layer and subscribing to results.

### Current Directory

`ui/pages` has been split by page domain:

```text
app/src/main/java/com/tyranor/next/ui/
├── common/
│   ├── AppAlertDialog.kt
│   ├── AppNavItem.kt
│   ├── AppSearchField.kt
│   ├── LiquidGlassNavigation.kt
│   ├── PlaceholderPage.kt
│   ├── Spacing.kt
│   ├── TimeFormats.kt
│   └── TopBarIcon.kt
├── main/
│   ├── MainLibraryViewModel.kt
│   └── MainScreen.kt
├── home/
│   └── HomeScreen.kt
├── game/
│   └── GameScreen.kt
├── engine/
│   └── EngineScreen.kt
├── settings/
│   ├── SettingsScreen.kt
│   ├── AppSettingsActivity.kt
│   ├── EngineSettingsMenuActivity.kt
│   ├── EngineSettingsActivity.kt
│   ├── PerGameSettingsActivity.kt
│   └── PerGameSettingsScreen.kt
├── cover/
│   ├── CoverScraperSettingsActivity.kt
│   └── CoverSourceUi.kt
├── patch/
│   └── KrkrOnlinePatchActivity.kt
├── save/
│   └── SaveManagementActivity.kt
└── auth/
    └── HikarinagiOAuthCallbackActivity.kt
```

### File Migration Mapping

| Current file | Suggested destination | Rationale |
| --- | --- | --- |
| `ui/pages/HomeScreen.kt` | `ui/home/HomeScreen.kt` | Home tab |
| `ui/pages/GameScreen.kt` | `ui/game/GameScreen.kt` | Game page tab |
| `ui/pages/EngineScreen.kt` | `ui/engine/EngineScreen.kt` | Engine page tab |
| `ui/pages/SettingsScreen.kt` | `ui/settings/SettingsScreen.kt` | Settings page tab |
| `ui/pages/AppSettingsActivity.kt` | `ui/settings/AppSettingsActivity.kt` | App settings page |
| `ui/pages/EngineSettingsMenuActivity.kt` | `ui/settings/EngineSettingsMenuActivity.kt` | Engine settings entry |
| `ui/pages/EngineSettingsActivity.kt` | `ui/settings/EngineSettingsActivity.kt` | Engine settings detail |
| `ui/pages/PerGameSettingsActivity.kt` | `ui/settings/PerGameSettingsActivity.kt` | Per-game settings shell |
| `ui/pages/PerGameSettingsScreen.kt` | `ui/settings/PerGameSettingsScreen.kt` | Per-game settings content |
| `ui/pages/CoverScraperSettingsActivity.kt` | `ui/cover/CoverScraperSettingsActivity.kt` | Cover source settings |
| `ui/pages/CoverSourceUi.kt` | `ui/cover/CoverSourceUi.kt` | Cover source UI |
| `ui/pages/KrkrOnlinePatchActivity.kt` | `ui/patch/KrkrOnlinePatchActivity.kt` | Online patch page |
| `ui/pages/SaveManagementActivity.kt` | `ui/save/SaveManagementActivity.kt` | Save management page |
| `ui/pages/HikarinagiOAuthCallbackActivity.kt` | `ui/auth/HikarinagiOAuthCallbackActivity.kt` | Authorization callback Activity |
| `ui/pages/AppAlertDialog.kt` | `ui/common/AppAlertDialog.kt` | Shared dialog |
| `ui/pages/PlaceholderPage.kt` | `ui/common/PlaceholderPage.kt` | Shared page skeleton |

### Layer Rules

- May depend on the feature abstraction layer.
- Must not depend directly on bottom engine Activities or the Native Bridge.
- Must not directly handle engine plugin installation, SAF mirror details, or native library loading details.
- Page state should preferably live in a ViewModel or stable state model, avoiding piling business flows inside Composables.
- Shared UI components continue to be consolidated in `ui/common`, following the AGENTS.md rules for top bar, search field, navigation items, switches, and theme colors.

## Resource Ownership Plan

### Current Problem

There are currently two types of duplicate resources:

1. `app/src/main/assets/engine` and `engine/src/main/assets` share some duplicate scripts.
2. `app/src/main/nativeplugins` and `engine/src/main/nativeplugins` share duplicate native plugin so files.

Some scripts are exactly identical, while others share a name but differ in content. This state requires an explicit resource source of truth; otherwise maintenance will easily suffer from "updated on one side, missed on the other".

### Recommended Rules

- `engine/src/main/assets`: raw resources directly depended on by engine runtime.
- `app/src/main/assets/engine`: business resources that must be shipped with the app for the app startup or injection flow.
- `engine/src/main/nativeplugins`: plugin/library resources directly usable by the bottom engine.
- `app/src/main/nativeplugins`: plugin package sources installed into the private directory on first app launch.

If the same file needs to enter both directories, a build-time copy/packaging task should be created first, avoiding manual maintenance of two copies.

### Follow-up Goal

```text
source-of-truth/
    ↓ build task
generated/copied assets
```

The end state should be:

- Manual edits happen only in a single source directory.
- Packaging artifacts are generated by Gradle tasks.
- The documentation states who maintains each type of resource.
- CI checks whether duplicate resources have drifted unexpectedly.

## Migration Implementation Record

### Phase One: Documentation and Rules Consolidation

- Old package paths in `AGENTS.md` have been updated, correcting `com/example/tyranornext` to `com/tyranor/next`.
- The three-layer dependency direction has been made explicit in both `AGENTS.md` and this plan.
- It is now explicit that new features must first be classified into a layer.
- It is now explicit that the UI layer must not reference bottom engine packages directly.
- The `scanner` main source package has been removed.

Acceptance criteria:

- No stale package names remain to mislead.
- New features can be placed in a directory directly by the three-layer rules.

### Phase Two: Splitting the Feature Abstraction Layer

- `core/game/model` created, `ScanGame.kt` migrated.
- `core/game/scan` created, `EngineScanner.kt` migrated.
- `core/game/launch` created, `EngineLauncher.kt` migrated.
- `core/game/save` created, `GameSaveManager.kt` migrated.
- `core/engine` created, `EngineType.kt` migrated.
- `core/engine/plugin` created, `EnginePluginBootstrap.kt` migrated.
- `core/cover` created, cover-related files migrated.
- `core/patch` created, `KrkrOnlinePatchService.kt` migrated.
- `core/unpack` created, `ArtemisPfsUnpacker.kt` migrated.
- `core/settings` created, settings stores migrated.
- `core/auth` created, Hikarinagi authorization migrated.
- `core/updater` created, update checking migrated.

Acceptance criteria:

- The `scanner` package is deleted, or only a very short-lived compatibility file remains.
- All imports point to the new packages.
- Unit tests pass.
- The app can scan, launch games, fetch covers, open settings, and check for updates normally.

### Phase Three: Splitting the UI Layer by Page Domain

- `ui/home` created, home page migrated.
- `ui/game` created, game page migrated.
- `ui/engine` created, engine page migrated.
- `ui/settings` created, settings page and settings Activities migrated.
- `ui/cover` created, cover settings UI migrated.
- `ui/patch` created, online patch page migrated.
- `ui/save` created, save management page migrated.
- `ui/auth` created, OAuth callback Activity migrated.
- Shared dialogs and the page skeleton migrated to `ui/common`.
- Manifest, navigation, and Activity jump imports updated.

Acceptance criteria:

- `ui/pages` is deleted, or only a very short-lived compatibility file remains.
- The UI layer still does not import bottom engine packages directly.
- All four main page tabs switch correctly.
- All secondary Activities open and return correctly.
- Page animations, top bar, and theme color rules remain unchanged.

### Phase Four: Resource source-of-truth Consolidation

- Scripts with the same name in `app/src/main/assets/engine` and `engine/src/main/assets` have been compared.
- The real maintenance source of each script has been marked.
- Shared scripts that were exactly identical have been changed to build-time copies.
- App-only scripts that share a name but differ in content have been kept, with their usage differences documented in the resource ownership rules.
- `app/src/main/nativeplugins` and `engine/src/main/nativeplugins` have been compared.
- The maintenance approach for duplicate so files has been changed to an engine single source + Gradle merged artifact.
- Sync and duplicate source check tasks have been added to Gradle.

Acceptance criteria:

- Duplicate resources have an explicit source description.
- CI can detect unexpected drift.
- Native plugins still package, install, and load correctly.
- Engine launch is unaffected.

### Phase Five: Build Script and Test Reinforcement

- Evaluate whether the relatively complex native plugin packaging logic in `app/build.gradle.kts` should move out to a convention plugin or `buildSrc`.
- Unify the compileSdk strategy between `app` and `engine` to avoid long-term version drift.
- Add unit test coverage after the package migration.
- Perform a full regression on the main page, game scanning, game launching, cover fetching, and opening the settings page.

Acceptance criteria:

- `./gradlew testDebugUnitTest --no-daemon` passes.
- `./gradlew assembleDebug --no-daemon` passes.
- Android CLI can identify the project and the APK output.
- It installs and runs correctly on a real device.

## Suggested Migration Order

Small incremental commits are recommended; moving all files at once is not recommended.

```text
Documentation rules
  ↓
Feature abstraction layer core split
  ↓
UI page domain split
  ↓
Resource source-of-truth
  ↓
Build script cleanup
  ↓
Tests and on-device regression
```

Each phase should remain buildable, runnable, and revertible.

## Risks and Control Strategies

| Risk | Impact | Control strategy |
| --- | --- | --- |
| Bulk package migration causes missed import updates | Compilation failure | Run unit tests or assembleDebug after each migrated group |
| Manifest Activity paths missed | Secondary pages cannot open | Check the Manifest carefully after migrating UI Activities |
| UI layer mistakenly references bottom engine classes | Layer boundaries breached again | Add `rg` check rules |
| Resources with the same name have different content | Wrong resource used at runtime | Build a resource usage inventory first, then unify the source |
| Native plugin path changes | Engine launch failure | Keep the packaging artifact path unchanged; only adjust the source |
| Test package paths not migrated | Tests break | Adjust test imports in the same batch as the source migration |
| AGENTS.md rules lag behind | Later implementations keep following the old structure | Fix the documentation in the first phase |

## Suggested Structural Checks

Simple checks can be added later to CI or local scripts:

```bash
rg "import (com\\.core|com\\.akira|com\\.yuri|org\\.tvp|org\\.libsdl|org\\.cocos2dx|bridge\\.)" app/src/main/java/com/tyranor/next/ui
```

The expected result is empty. Any result means the UI layer depends directly on the bottom engine layer.

```bash
rg "package com\\.tyranor\\.next\\.scanner" app/src/main/java app/src/test
```

The expected result is empty after the migration is complete.

## Final Target Structure

```text
TyranorNext/
├── app/
│   └── src/main/java/com/tyranor/next/
│       ├── core/              # Feature abstraction layer
│       │   ├── auth/
│       │   ├── cover/
│       │   ├── engine/
│       │   ├── game/
│       │   ├── patch/
│       │   ├── settings/
│       │   ├── unpack/
│       │   └── updater/
│       ├── theme/             # UI theme system
│       ├── ui/                # Interface UI interaction layer
│       │   ├── auth/
│       │   ├── common/
│       │   ├── cover/
│       │   ├── engine/
│       │   ├── game/
│       │   ├── home/
│       │   ├── main/
│       │   ├── patch/
│       │   ├── save/
│       │   └── settings/
│       ├── MainActivity.kt
│       ├── Navigation.kt
│       ├── NavigationKeys.kt
│       └── TyranorNextApplication.kt
├── engine/                    # Bottom engine layer
│   └── src/main/
│       ├── java/
│       ├── cpp/
│       ├── jniLibs/
│       ├── assets/
│       ├── nativeplugins/
│       └── AndroidManifest.xml
└── docs/
```

## Decision Criteria

When adding new files later, decide ownership with the following questions:

1. Does it directly run/adapt an engine, Native, SDL, Cocos, or IJK?
   - Yes: put it in the bottom engine layer.
2. Does it handle business capabilities such as scanning, launching, covers, saves, patches, configuration, updates, or account authorization?
   - Yes: put it in the feature abstraction layer.
3. Is it responsible for pages, dialogs, theme, navigation, buttons, lists, or user input?
   - Yes: put it in the interface UI interaction layer.

If a file matches multiple layers at once, prefer splitting it. The UI keeps only interaction, business flows sink into the feature abstraction layer; the feature abstraction layer keeps only orchestration, and real engine details sink into the bottom engine layer.