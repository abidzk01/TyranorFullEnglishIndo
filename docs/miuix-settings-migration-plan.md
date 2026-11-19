# Settings Page Miuix Migration Implementation Plan

> Goal: introduce the `miuix-preference` dependency and replace the existing settings list items in
> `SettingsScreen.kt` with Miuix's `Card + BasicComponent (Preference family)` system, so the settings
> page gains a HyperOS (MIUI)-style look and interaction.

---

## 1. Background and Current State

### 1.1 Existing Implementation (before the migration)

File: `app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt`

| Existing component | Purpose | Visual |
|---|---|---|
| `SettingsEntryCard` | Settings entry card (4 engine entries) | M3 `Card` + `RoundedCornerShape(8dp)` + `NavWhite`, hand-written chevron |
| `ListSwitch` | Switch row | M3 `Row` + `Switch`, manual clickable |
| `SingleChoiceRow` | Single-choice row | M3 `Row` + `AppAlertDialog` + `RadioButton` dialog selection |
| `FontRow` | Font selection row | M3 `Row` + `AppAlertDialog` binary choice dialog |
| `EngineCard` | Engine detail grouping container | M3 `Card` with 8dp rounded corners |

Pain points: the components are hand-written and stylistically far from HyperOS; single-choice interaction requires a dialog plus radio buttons, which is a deep hierarchy.

### 1.2 The Miuix System (referencing KernelSU-Style-UI-Kit and the miuix 0.9.2 source)

- `BasicComponent`: the foundation of every settings item — minimum height 56dp, three-column layout (startAction / title+summary / endActions),
  the whole row is clickable, press-state feedback, and endActions take at most 60% of the width.
- `SwitchPreference` / `ArrowPreference` / `OverlayDropdownPreference` and others derive from `BasicComponent`.
- `Card`: superellipse (squircle) rounded corners default to 16dp, `surfaceContainer` background color, and a group of related settings shares one card.
- `OverlayDropdownPreference` depends on the `MiuixPopupHost` provided by miuix `Scaffold` (`renderInRootScaffold`).

## 2. Dependency Introduction

`gradle/libs.versions.toml`:

```toml
[versions]
androidxComposeBom = "2026.05.01"   # upgraded from 2026.03.01 to align with miuix 0.9.2 transitive dependencies
miuix = "0.9.2"

[libraries]
miuix-ui = { module = "top.yukonga.miuix.kmp:miuix-ui-android", version.ref = "miuix" }
miuix-preference = { module = "top.yukonga.miuix.kmp:miuix-preference-android", version.ref = "miuix" }
```

`app/build.gradle.kts`:

```kotlin
implementation(libs.miuix.ui)
implementation(libs.miuix.preference)
```

**Version notes (verified)**:
- miuix 0.9.2 transitively depends on `kotlin-stdlib 2.4.0`, `org.jetbrains.compose.foundation:foundation:1.11.1`,
  `miuix-core-android`, `miuix-squircle-android`, and `miuix-shader-android` (all from Maven Central; the current repository configuration already includes mavenCentral).
- The Compose BOM is raised to 2026.05.01 to avoid an ABI mismatch caused by mixing an older BOM with foundation 1.11.1
  (this combination matches the combination validated in production by KernelSU-Style-UI-Kit).
- Kotlin stays at 2.3.20: Kotlin metadata supports reading one minor version ahead (2.3.20 can read 2.4.0 metadata), and the build has been verified to pass.

**Build chain upgrade (actually implemented during the migration)**:

Modules such as `miuix-squircle-android` / `miuix-shader-android` in miuix 0.9.2 hard-require **compileSdk 37**,
so they were upgraded in sync (the exact same combination as the reference project):

| Item | Old value | New value |
|---|---|---|
| compileSdk (app) | `compileSdk = 36` | `compileSdk { version = release(37) { minorApiLevel = 0 } }` |
| AGP | 9.0.1 | 9.2.1 |
| Gradle Wrapper | 9.1.0 | 9.5.1 |
| targetSdk / minSdk | 36 / 26 | unchanged |
| engine module compileSdk | 36 | unchanged (no miuix dependency) |

## 3. Component Mapping (core design)

| Original component | New component (miuix) | Notes |
|---|---|---|
| `SettingsEntryCard` (M3 Card) | `Card` + `ArrowPreference` | The 4 engine entries are merged into 1 card, with a `startAction` icon |
| `ListSwitch` | `SwitchPreference` | The whole row toggles on click, HyperOS capsule switch |
| `SingleChoiceRow` (dialog + RadioButton) | `OverlayDropdownPreference` | Tap to expand an overlay dropdown layer; selecting immediately writes the value back, replacing the deep dialog |
| `FontRow` | `ArrowPreference` + `endActions` showing the current font | The binary choice dialog keeps the original `AppAlertDialog` (complying with the 8dp white dialog standard) |
| `EngineCard` | miuix `Card` | White squircle card, header preserved |

### 3.1 Option Data Structure Adjustment

The original `Map<String, String>` becomes `List<Pair<String, String>>` (order-preserving):

- For options whose "value may be empty (= engine default)", explicitly add a `"" to "Engine default"` entry
  (software/OpenGL texture compression, memory usage, FPS limit); selecting that item writes back an empty string, with the same semantics as the original "not set";
- For thread count and texture size, add `"" to "Auto"` as the first fallback item.

### 3.2 Theme Adaptation (keeping the app's fixed light style)

Create `theme/MiuixSettingsTheme.kt`:

```kotlin
private val TyranorMiuixLightColors = lightColorScheme(
    primary = Blue40,          // #307DEF, consistent with the app's primary color
    background = PageGrey,     // page background, consistent with the other tabs
    surface = PageGrey,
    surfaceContainer = NavWhite, // component/card color, controlled by "Tone switch"
    onBackground = TextColor,
    onSurface = TextColor,
    onSurfaceContainer = TextColor,
)
```

Wrap only the settings-related screens locally with `MiuixSettingsTheme { ... }`, leaving other pages unaffected.

### 3.3 Page Structure (following the AGENTS.md top bar standard)

```
MiuixSettingsTheme
└── miuix Scaffold(containerColor = PageGrey; popupHost provides MiuixPopupHost by default)
    ├── topBar = Column(statusBarsPadding) + Row(64dp, titleLarge)   ← structure identical to the existing one
    └── LazyColumn(horizontal = 12.dp, spacedBy(12.dp))
        ├── Card { ArrowPreference × 4 (entries) / SwitchPreference · DropdownPreference (details) }
        └── placeholder for the bottom navigation bar height
```

- `contentWindowInsets = WindowInsets(0.dp)`, with all padding controlled manually (following the existing behavior to avoid duplicate insets).

## 4. Differences from the AGENTS.md Standards

| Standard item | Handling in this change |
|---|---|
| Top bar Column + 64dp, transparent, statusBarsPadding | ✅ Unchanged (the miuix Scaffold is used only as a container) |
| Material3 TopAppBar/Scaffold prohibited | ✅ No M3 Scaffold used; the miuix Scaffold is required as the host for the dropdown overlay |
| Card corner radius uniformly 8dp | ⚠️ The settings page switches to Miuix's default 16dp squircle (a core characteristic of the Miuix style); other pages keep 8dp |
| Dialog white background, 8dp | ✅ The font selection dialog keeps `AppAlertDialog`; the newly added dropdown overlay uses the native Miuix style |
| Page transitions: main tabs horizontal movement / Activities enter upward, exit downward | ✅ Unchanged |

## 5. Implementation Steps

1. [x] Investigate the miuix 0.9.2 API (done: AAR decompilation verified `lightColorScheme`/`MiuixTheme(colors)`/`Card`/`Scaffold`/Preference signatures)
2. [x] `libs.versions.toml`: BOM upgrade + miuix version and library declarations + AGP 9.2.1
3. [x] `app/build.gradle.kts`: add the miuix dependencies + compileSdk 37 DSL
4. [x] Create `theme/MiuixSettingsTheme.kt`
5. [x] Rewrite `SettingsScreen.kt` (`SettingsScreen` entry + `EngineSettingsDetailScreen` details; delete the hand-written `ListSwitch`/`SingleChoiceRow` components)
6. [x] `./gradlew assembleDebug --no-daemon` build verification (BUILD SUCCESSFUL, app-debug.apk produced)
7. [x] Fix log: 1. compileSdk 36→37 + AGP/Gradle upgrade (a hard requirement of miuix); 2. `SwitchPreference` trailing lambda changed to an explicit `onCheckedChange = { }` (its last parameter is not a function type)

## 6. Acceptance Criteria

- The build passes and the APK can be installed;
- Settings page: a single card with 4 engine entries (with icons + right chevrons), Miuix look (white card, 16dp squircle, 56dp row height, capsule switches);
- Engine details: switch behavior, dropdown selection, font selection, and save logic are fully equivalent to before the migration (the persisted fields are unchanged);
- The top bar structure, page transition animations, and visual consistency with the other tabs are unaffected.

## 7. Optional Follow-up Extensions (out of scope for this change)

- Migrate `PerGameSettingsScreen` / `SaveManagementActivity` to the same system;
- Introduce Miuix scrolling experience features such as `overScrollVertical` / `scrollEndHaptic` / top bar scroll gradient.