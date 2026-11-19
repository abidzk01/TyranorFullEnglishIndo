# Tyranor Next — AGENT Rules

This document is the unified rulebook that AI Agents must follow when developing in this project. Read it before adding or modifying code, and stay consistent with the existing implementation.

> Domain terminology: the authoritative definitions of the project's core concepts (engine / game library / settings / cover / save / UI conventions, etc.) are in `CONTEXT.md` (repository root). When development or code review touches those domain terms, follow the terminology and the `_Avoid_` notes in `CONTEXT.md`, and avoid introducing synonyms.

## Documentation Workflow Skills (docs/skills)

The project bundles three documentation workflow skills (named the same as the global user-level skills; the repository version is authoritative) for polishing designs and accumulating domain knowledge:

| Skill | Location | Purpose |
| --- | --- | --- |
| grilling | `docs/skills/grilling/SKILL.md` | Round-by-round interrogation of a plan/decision/idea, converging on a shared understanding via "design tree + rounds" |
| grill-with-docs | `docs/skills/grill-with-docs/SKILL.md` | Documentation output layered on top of grilling: ADRs and glossary entries are produced during the interrogation |
| domain-modeling | `docs/skills/domain-modeling/SKILL.md` | Build/polish the project domain model: maintain the `CONTEXT.md` glossary and write ADRs (formats in `docs/skills/domain-modeling/CONTEXT-FORMAT.md` and `ADR-FORMAT.md`) |

Constraints:

- **Interrogation discipline**: grilling-style flows are enabled only when the user explicitly asks to "polish / interrogate / review a plan"; between rounds you must wait for the user's answer and must not answer on their behalf or skip the frontier.
- **Domain model maintenance**: any change to terminology or a domain decision must be reflected in the repository-root `CONTEXT.md`; `CONTEXT.md` only accepts project-specific terms (generic programming concepts must not be listed), and definitions stay at one to two sentences.
- **Three ADR gates**: create an ADR under `docs/adr/` and cite the corresponding `ADR-FORMAT.md` only when a decision satisfies all three points — "hard to reverse, confusing without context, a real trade-off"; otherwise skip it rather than forcing it into a record.
- **Documents match practice**: when the glossary or an ADR conflicts with the code, state the difference on the spot using the code as the source of truth, instead of silently rewriting the document.

## Tech Stack

- Android Jetpack Compose + Material 3

- Kotlin

- Bottom navigation structure: `app/src/main/java/com/tyranor/next/ui/main/MainScreen.kt`

- Pages are grouped by feature domain under `app/src/main/java/com/tyranor/next/ui/`

- App business capabilities are grouped by the three-layer architecture under `app/src/main/java/com/tyranor/next/core/`

## Three-Layer Architecture Directory Rules

The project is split into three layers by responsibility, with a fixed dependency direction:

```
UI interaction layer -> feature abstraction layer -> engine foundation layer
```

### 1. Engine Foundation Layer

- Directory: `engine/`

- Responsibilities: KRKR/Kirikiroid, krkrsdl3, ONS, Artemis, Tyrano, SDL/Cocos/IJK, Native/JNI, engine host Activity, engine resources, Native plugin low-level loading.

- Rules: must not depend on `com.tyranor.next.ui.*`; must not care about App pages, Compose state, or list rendering.

### 2. Feature Abstraction Layer

- Directory: `app/src/main/java/com/tyranor/next/core/`

- Responsibilities: game scanning, game models, launch orchestration, cover scraping, save management, online patches, XP3 unpack/pack, app/engine/per-game configuration, authorization, background updates.

- Rules: may depend on the `engine` module; must not depend on Compose (including `androidx.compose.ui/foundation/material*` UI components, plus `androidx.compose.runtime` state primitives and the `@Immutable` annotation); must not treat page classes as ordinary business dependencies.
  Globally observable state always uses `kotlinx.coroutines.flow` (`StateFlow`) or a plain data payload (the `ThemeColorPayload` pattern), subscribed via `collectAsState` in the UI layer.

- New features go into the package matching their domain: `core/game`, `core/engine`, `core/cover`, `core/patch`, `core/unpack`, `core/settings`, `core/auth`, `core/updater`, etc.

### 3. UI Interaction Layer

- Directory: `app/src/main/java/com/tyranor/next/ui/`

- Responsibilities: Compose pages, Activity shells, dialogs, navigation, top bars, search fields, user input, loading state, and error state.

- Rules: may only call the feature abstraction layer; importing low-level engine packages such as `com.core`, `com.akira`, `com.yuri`, `org.tvp`, `org.libsdl`, `org.cocos2dx`, `bridge` directly is forbidden.

- Pages go into `ui/home`, `ui/game`, `ui/engine`, `ui/settings`, `ui/cover`, `ui/patch`, `ui/save`, `ui/archive`, `ui/auth` by feature domain; shared components go into `ui/common`.

### 4. Resource Ownership

- `engine/src/main/assets`: source of the engine runtime assets and shared engine scripts.

- `app/src/main/assets/engine`: app-only injection scripts; shared scripts are generated into app assets by Gradle from `engine/src/main/assets`.

- `engine/src/main/nativeplugins`: source of shared Native plugin `.so` files.
- `app/src/main/nativeplugins`: plugin manifests and source of app-only plugins.

- Maintaining the same binary or shared script by hand on both the app and engine sides is forbidden; the build script checks for duplicate source files.

***

## Error Handling Protocol (core → ui)

The error protocol from the feature abstraction layer (core) to the UI is fixed to the following three styles; introducing any other style is forbidden:

1. **Typed failure results**: expected business failures return a sealed Result / typed error DTO, and the UI maps the text.
   Existing templates: `LaunchResult` (`core/game/launch/LaunchResult.kt`), `ExternalEngineLaunchResult`,
   `UpdateCheckResult`, and the sealed results of `CoverScraperService`.
2. **Throw typed exceptions**: when exception semantics are genuinely needed, the exception must carry an error code rather than text (e.g.
   `GameSaveException(SaveErrorCode, detail)`), and the UI layer maps the error code to a string resource.
3. **No result means null / empty collection**; the caller handles errors with its own `runCatching` (limited to peripheral utility functions).

Hard constraints:

- **core must not use localized text as an error message/return value** (`throw IOException(text(R.string...))`
  or `return text(R.string...)` are forbidden); when a message is needed, return an error code and move all text assembly up to the UI
  (mapping files go in `ui/<domain>/` or `ui/common/`, e.g. `ui/common/LaunchErrorMessages.kt`).
- When adding an error branch, prefer extending an existing sealed type / error-code enum rather than adding a parallel protocol.
- Cancellation (`CancellationException`) is not a failure and must be propagated upward unchanged.

***

## Unified Page Top Bar Rules

Top bars on all pages (Home / Games / Library / Settings) must be consistent. **Always use the shared component
`com.tyranor.next.ui.common.AppTopBar`**; no page may hand-write that structure. Placeholder pages may reuse
`com.tyranor.next.ui.common.PlaceholderPage` (which also goes through AppTopBar internally).

### 0. Single Entry Point (AppTopBar)

- A page top bar must call `AppTopBar(title, ...)`; the title, structure, and color selection are handled by the component.
- Parameter conventions:
  - Material pages (default): do not pass `background`/`contentColor`; the component defaults to `colorScheme.background` / `colorScheme.onBackground`.
  - Miuix-style pages (`topBar` slot of a settings-style `MiuixScaffold`): pass `background = Color.Transparent` (the top bar background is always transparent and left to the root background layer — `MiuixTheme.colorScheme.background` is actually `PageGrey`, and passing it would cover the glass/gradient root background), `contentColor = MiuixTheme.colorScheme.onBackground`, and set `contentWindowInsets = WindowInsets(0.dp)`.
  - Pages where "tone switching" participates in color selection: pass `background = PageGrey`, `contentColor = TextColor`.
  - Right-side icons go into the `trailing` slot as `TopBarIcon`; collapsible content below the title (such as the search field on the games page) goes in the `underTitle` slot.
- New pages/components must not write the "background layer + statusBarsPadding + 64dp + titleLarge Bold" structure again.

### 1. Structure

- The top bar uses **Column + Centre**, and does **not** use Material3's `TopAppBar` / `Scaffold`.

- The page as a whole is assembled by an outer `Column`, with a fixed order: top bar → body content.

- **Placing any back button/icon in the top bar is forbidden**. Back navigation relies on the system back key/gesture (`Activity` defaults to `finish()`); do not deliver a back callback through an `onBack` parameter.

### 2. Height

- The title area has a fixed height of **64dp**.

- The top bar as a whole needs no additional height beyond 64dp.

### 3. Title

- The title is **left-aligned**, with horizontal padding `horizontal = 16.dp`, vertically centered.

- The title font size uses `MaterialTheme.typography.titleLarge`.

- The title **must be bold**: `fontWeight = FontWeight.Bold`.

### 4. Background Color

- The top bar background is **always transparent** (`AppTopBar` defaults to `Color.Transparent`), revealing the page root background layer: the default appearance style is "solid color + theme color/near color gradient (light includes soft glow + Gaussian blur; dark is a black-based diagonal gradient)" (`theme/DefaultPageBackground.kt`, which can be turned off in app settings under "Default theme gradient", after which the background is solid), and glass-style variants use the glass page gradient. Title and icons uniformly use `colorScheme.onBackground`.
- Page root containers (`MiuixScaffold(containerColor = ...)`, page-level Box) likewise **must not paint an opaque background** (always `Color.Transparent`); the background is the root background layer's responsibility, otherwise the gradient background is covered entirely.

- **Glass appearance styles (Retro Glass / Advanced Glass)**: under glass the page background is transparent and the top bar stays transparent (revealing the gradient/color patches and ambient light).
  Therefore **page content must be padded below the top bar as a whole** (using a persistent `Modifier.padding(top = top bar height)`, not the scroll area's
  `contentPadding`), otherwise scrolling content passes under the top bar and overlaps the title. For settings-style pages (`MiuixScaffold`), the
  top value of `innerPadding` must always be added to the list modifier, and `contentPadding` keeps only the additional spacing.

- Using the theme color `primary` as the top bar background is forbidden.

### 5. Status Bar

- The status bar must be **transparent and immersive** (`window.statusBarColor = Color.TRANSPARENT`), and the top bar's
  page background color extends upward to cover the status bar area.

- Status bar/navigation bar icons use **dark** (`SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)`), because the page background is light.

- The top bar must use `Modifier.statusBarsPadding()`, so the title content avoids the status bar while the background color extends continuously.

- Do not set a non-transparent background color on the status bar yourself.

### 6. Position Order

```
Column(fillMaxSize)                                // page root
├── Column(fillMaxWidth, background(background))    // page background color container (opaque)
│   ├── Column(statusBarsPadding)                    // avoids the status bar (background extends to the status bar)
│   └── Column(height 64dp, padding horizontal 16dp)  // title area
└── body content
```

> If a settings-style page uses `MiuixScaffold`, `containerColor` takes `Color.Transparent` (the background is drawn by the root background layer); the top bar in the `topBar` slot is implemented by the same rules:
> `Column(background(background)) { Column(statusBarsPadding) { Row(height 64dp, padding horizontal 16dp) { ... } } }`,
> and set `contentWindowInsets = WindowInsets(0.dp)` to avoid system insets adding spacing again.

### 7. Top Bar Icon Buttons

- Top bar right-side icon buttons **must use the shared component** `com.tyranor.next.ui.common.TopBarIcon` (layout aligned with the games page top bar); assembling your own with `IconButton`/`Icon` is **forbidden**.

- Component layout: `Image` rendering + `size(34.dp)` touch area + `clip(RoundedCornerShape(6.dp))` corner radius + `clickable` + `padding(4.dp)` inner padding, plus `ColorFilter.tint` with the theme color; the component carries its own `padding(start = 2.dp)`, ensuring uniform spacing between adjacent icons.

- `tint` is passed by the caller as the current theme color: Material pages pass `MaterialTheme.colorScheme.primary`, Miuix pages pass `MiuixTheme.colorScheme.primary`.

- Top bar icons always use drawable resources (`R.drawable.ic_*`); when a new icon is needed, create a resource in `res/drawable` (PNG or vector XML). Using `Icons.*` vector icons directly as top bar buttons is forbidden.

### 8. Explicit Exemption

- **Explicit exemption (pad layout editor)**: `ui/settings/PadLayoutEditScreen.kt` (`PadLayoutEditActivity`) **has no top bar**; the editing canvas occupies the entire screen (including system bar areas) — this is intentional design and is exempt from rules 0–7 of this section. Reason: the core contract of this page is to be **in the same viewport** as the in-game input pad layer (button positions are stored normalized to the viewport, and remapped proportionally across portrait/landscape), and a top bar would compress the canvas height and break "what you see is what you get". How to operate and how to exit is explained by a Toast shown on entering the screen; saving is triggered by "Save" in the editing panel, and exiting goes through the system back key. **This exemption applies only to this page**; every other page must use `AppTopBar` and must not invoke it.
- **Extension of the same exemption (this page reuses the engine's native editing UI)**: this page treats the engine-side native input pad layer and editing panel (`com.core.input.VirtualPadView` / `VirtualPadEditPanel`, whose `rootView` is provided by the core facade `PadEditorHost`) as its canvas as a whole, so **self-drawn dialogs and text sizes within this page** are likewise exempt, along with this page, from the cross-page consistency requirements for white dialog backgrounds / 8dp corner radius and the two-tier typography (the panel is a dark card presented in the same viewport as the game image; see `VirtualPadEditPanel.showDarkDialog`). The extended exemption **is likewise limited to this page and the in-game input pad layer**: other dialogs in the settings domain (`AppAlertDialog`) must still obey the dialog click-feedback, white background, and 8dp corner radius rules. **Reason correction**: this page's Activity is fixed to `sensorLandscape` (see `AndroidManifest.xml`), so the editor itself never goes through portrait/landscape switching; "remapped proportionally across portrait/landscape" describes the behavior of the **in-game** input pad layer.

***

## Cross-Page Consistency Requirements

- All pages share `PlaceholderPage` (or a structure consistent with it); pages must not each implement top bars in different styles.

- When adding a page: put the page body content into the `Column`'s body area; keep the top bar identical.

- Page description/explanation text must not be placed below the top bar; the body area should directly show the page's actual content or list.

- Page transition animations must stay consistent: switching among the four main Screen tabs uses a horizontal movement animation; entering other standalone Activity pages uses an upward page-flip animation, and exiting/going back uses a downward page-flip animation.

- The unified corner radius value for components is **8dp**; rounded components such as list item cards, feature item cards, and dialogs uniformly reference `theme/AppShapes.kt`:
  `AppComponentShape` (8dp by default / 32dp for glass appearance styles and floating navigation), Miuix components use `AppComponentCornerRadius`,
  and the drawer top uses `AppSheetTopShape`; no more scattered corner radius literals.

- **Tablet side rail**: when `isSideRailLayout()` matches (`isTabletScreen()` hits and the app setting "Tablet sidebar" toggle is on, on by default), the main navigation moves to the side (`ui/common/AppNavigationRail.kt`): the rail form takes the theme's "default navigation bar" form according to the appearance style; both Liquid Glass tiers and "Floating Button" do not adapt to the rail; the rail occupies layout width and the bottom inset becomes zero; the Advanced Glass rail samples a separate pure background layer (`railBackdrop`; it must not sample the content layer — coordinates would go out of bounds). Selected-state icon animation uniformly uses `ui/common/NavigationTabIcon.kt`.

- **Corner radius exemption**: the bar body and navigation item capsules of Liquid Glass navigation (`ui/common/LiquidGlassNavigation.kt`) use **16dp** (8dp plus 8dp), which is intentional design and not subject to the 8dp clause; other components must not invoke this exemption.

- **Corner radius exemption (Liquid Glass · Lens bottom bar)**: `ui/common/glass/EnhancedLiquidGlassNavigation.kt` mounted after selecting "Liquid Glass · Lens" in the app setting "Navigation bar style" (three places: bar body / icon copy row / moving lens) uses
  `theme/AppShapes.kt`'s `AppNavCapsuleShape` (capsule, corner radius = half height), the continuous capsule outline established by this project for that style, and is intentional design.
  **That component must also uniformly reference `AppNavCapsuleShape` and must not define an equivalent corner shape in place**; this exemption applies only to that component and no other component may invoke it.

- **Corner radius exemption (floating button navigation)**: `ui/common/FloatingGlassNavButton.kt` mounted after "Navigation bar style = Floating Button"
  uses `CircleShape` for the main button and the arc navigation items (a circle is the established form of this style), which is intentional design; this exemption applies only to that component and no other component may invoke it.
  **The material is fixed to the light / dark tiers of Liquid Glass** (light = white glass, dark = dark glass), **selected only by `AppThemeColors.isDark`,
  not by appearance style (default / retro glass / advanced glass)** (this style carries a fixed look and is an exemption from section 3.5's "components must go through dynamic constants";
  the fixed colors come from `theme/Color.kt`'s `FloatingNavGlassSurface` / `FloatingNavGlassSurfaceDark` /
  `GlassUnselected` / `FloatingNavGlassUnselectedDark`,
  it keeps the original icons, the icon accent color and approach glow follow the theme color, and the touch edge uses a semi-transparent theme-color glass overlay); the component must not introduce an `AppThemeColors` **style** check (picking the tier by light/dark is allowed and required).
  **Long-press drag position**: the position is stored in `AppSettingsStore` as normalized coordinates (converted within the safe area, see `floatingNavPositionPx` /
  `clampFloatingNavPosition`), the expansion direction adapts by quadrant (`floatingNavArcStartAngle`), and the settings page has "Reset floating button position";
  when collapsed, a long press expands and continuous sliding selects; after expansion, a long press on the main button collapses it and enters free movement, and the same finger can keep dragging.
  After expansion, a single tap on a child control switches pages and keeps it expanded; continuous slide-selection collapses after the release confirms. The main control stays 64dp, and main/child icons are uniformly 28dp.
  The expansion position is fixed, and touching a child control must not drag the others; when the sphere approaches, only scaling happens and intersection is limited by a fixed spacing.
  Page clicks are observed by the common parent layer and events must not be consumed: the same click both collapses the navigation and executes the page option, with no full-screen intercepting layer.
  Haptic feedback is kept for expand/collapse, selection confirmation, long-press entering movement, and actual landing; there must be no vibration when approaching, moving into, or switching between child control candidates.
  On tablets the floating button still keeps the sphere navigation, with arc radius and option size adapting to the safe area; tablet side rail rules for other styles stay unchanged.

- All dialog backgrounds must be white, and the corner radius must use the unified value **8dp**.

## Page Content Text Size Rules

Page content (except the top bar) may only use **two** text sizes, consistent with the engine settings page:

1. `MaterialTheme.typography.titleMedium` (large size, 15sp, globally overridden in `theme/Type.kt`; Material's default is 16sp) — card headers, dialog titles, list item primary titles (may be bold).
2. `MaterialTheme.typography.bodyMedium` — body text, row values, secondary descriptions, button text, empty/error messages.

- Using other typography sizes such as `bodySmall` / `bodyLarge` / `labelMedium` / `labelLarge` / `headlineMedium` / `headlineSmall` is **forbidden**.

- Miuix preference component titles default to `headline1` (17sp), which has already been globally overridden to 15sp in `MiuixSettingsTheme` (`defaultTextStyles(headline1 = TextStyle(fontSize = 15.sp))`), so they fall strictly into the two tiers and match `titleMedium`; do not change the font size per row yourself.

- Top bar titles are not subject to this restriction and still use `MaterialTheme.typography.titleLarge` Bold.

- **Explicit exemption**: the home quick launch card (`QuickLaunchCard` in `ui/home/HomeScreen.kt`) uses a blurred cover image + black dimming overlay as background with white text; the game name inside the card uses `MaterialTheme.typography.titleLarge` Bold and the engine name uses `MaterialTheme.typography.headlineSmall` Bold, neither subject to the two-tier rule; the rest of that card's text still follows the two-tier rule.

- **Explicit exemption**: the engine type badge in the top-left corner of game page cards (`GameCard` in `ui/game/GameScreen.kt`, overlaid on the cover only) uses `MaterialTheme.typography.labelSmall` (11sp) — the badge is a small annotation on the cover and would be too large under the two-tier rule; this is the only exemption, and all other body text still follows the two-tier rule. The badge background/text colors are a **fixed style** (`CoverBadgeBackground` / `CoverBadgeText` in `theme/Color.kt`: translucent black background + white text) and **do not change with the theme color, appearance mode, or tone switching**.

***

## Unified Search/Input Field Rules

App-wide search filter fields and single-line text inputs inside dialogs must uniformly use the shared component
`com.tyranor.next.ui.common.AppSearchField` (`app/src/main/java/com/tyranor/next/ui/common/AppSearchField.kt`).
**Forbidden**: assembling Miuix `SearchBar`/`InputField` directly in a page, and using Material's
`TextField`/`OutlinedTextField` as a search field or dialog input.

### 1. Component Form (Miuix style, non-expanding inline)

- Inside, the component is fixed to the `MiuixSettingsTheme + SearchBar + InputField` template, with `expanded` always
  `false` (inline); it does not use Miuix's expanding full-screen search page form.

- The leading icon is fixed at **26dp**, padding is fixed to `SearchBarDefaults.LeadingIconStartPadding /
  LeadingIconEndPadding`, and `tint` is uniformly `MiuixTheme.colorScheme.primary` — all of the above is handled inside the component;
  callers must not pass colors/sizes, keeping the global style modifiable in one place.

### 2. Parameter Conventions

- `query` / `onQueryChange`: required; the input state is held by the caller.

- `onSearch`: keyboard IME action callback. Local instant-filter scenarios may omit it (empty implementation by default);
  pass it when an explicit trigger is needed (e.g. network request, save on Enter).

- `leadingIcon`: drawable resource (`R.drawable.ic_*`). Search semantics use the default `ic_game_search`;
  other semantics must pass the corresponding icon (e.g. `ic_sheet_rename` for renaming). Abusing the search icon is forbidden.

- `iconContentDescription`: accessibility description, following the icon semantics.

- `modifier`: only for layout fine-tuning (e.g. outer margins); the width is guaranteed by the component's internal `fillMaxWidth`.

### 3. Existing Call Sites (align new scenarios with these)

| Scenario          | Location                                 | Icon                | onSearch        |
| ----------- | ---------------------------------- | ----------------- | --------------- |
| Game library filtering       | `GameScreen.kt` (below the top bar)              | `ic_game_search`  | instant filter, omit         |
| VNDB cover search   | `GameScreen.kt` (VndbSearchDialog)  | `ic_game_search`  | `search()` network request |
| krkr online patch filtering | `KrkrOnlinePatchActivity.kt` (first item in the list) | `ic_game_search`  | instant filter, omit         |
| Rename        | `GameScreen.kt` (RenameGameDialog)  | `ic_sheet_rename` | saves as soon as the content is valid         |

***

## Unified Tab Bar Rules

App-wide "tab bars / category bars" (horizontally laid out, single-select switching, where the selected item has a background indicator) **must** uniformly use the shared component
`com.tyranor.next.ui.common.SlidingTabRow` (`app/src/main/java/com/tyranor/next/ui/common/SlidingTabRow.kt`).
**Forbidden**: hand-writing indicator offsets, equal-width division, selected background, or text color in a page (the engine page's former self-drawn `GlassTabRow` has been merged into this component).

### 1. Component Form and Parameters

- The selected item is an **independent background indicator** (not a per-item background); when switching, it slides to the target tab with a 200ms linear animation; when widths are uneven in scrollable mode, the width animates in sync. The indicator corner radius uniformly uses `AppComponentShape`, and for glass styles the component internally calls `glassBorder` to add a 0.5dp hairline stroke.
- The indicator base color and text colors are dispatched inside the component by appearance style; **callers must not pass colors**:
  default style indicator `NavWhite`, selected text `TextColor` (does not follow the theme color; bold marks selection), unselected `onSurfaceVariant`;
  retro glass `GlassSurfaceHigh` + `GlassText`/`GlassTextSecondary`; advanced glass `AdvancedGlassSurfaceHigh` + `GlassText`/`AdvancedGlassTextSecondary`.
- Tab height is uniformly 42dp, text uniformly `MaterialTheme.typography.titleMedium`, bold when selected; accessibility uniformly `selectable(selected, role = Tab)`.
- Parameters: `tabs` (tab labels), `selectedIndex` (out-of-range values are clamped automatically), `onTabSelected`, `modifier` (outer margins only), `scrollable` (form switch, default false).

### 2. Two Forms

- `scrollable = false` (default): tabs have **equal widths**, suitable for paging with a fixed count and uniform width.
- `scrollable = true`: tabs **scroll horizontally by content width**, suitable for categories that are numerous / uneven in width; 12dp padding is built in at both ends, and when the selected item is off-screen (programmatic fallback, process restoration) it scrolls into view automatically (immediately positioned the first time, animated afterwards). Pages must not assemble an equivalent with `LazyRow`.

### 3. Existing Call Sites (align new scenarios with these)

| Scenario | Location | Form |
| --- | --- | --- |
| Engine page top paging (glass appearance) | `EngineScreen.kt` | equal width |
| Home "Category Warehouse" category bar (All / Quick / Recent / each engine type) | `CategoryWarehouse.kt` | horizontal scroll |

> Exception: in the default appearance style the engine page keeps using Miuix `TabRow` (the existing feel of equal-width paging with an animated indicator) and only uses this component under glass appearances; new scenarios (including the default style) always use this component.

***

## Unified Feature Navigation Item Rules

All "feature navigation lists" — i.e. items that enter / navigate / open a next level when clicked (such as the cover source list, group chat/channel items inside dialogs, secondary navigation items in settings, etc.) — **must** uniformly use the shared component
`com.tyranor.next.ui.common.AppNavItem` (`app/src/main/java/com/tyranor/next/ui/common/AppNavItem.kt`).
**Forbidden**: hand-assembling such items with `Row`/`Column` in pages/dialogs, and mixing in Material's `ListItem`/`ColumnItem` etc.

### 1. Component Form and Parameters

- Layout is fixed: corner radius `AppComponentShape` (8dp by default / 32dp for glass styles, see `theme/AppShapes.kt`) + background from the `theme/Color.kt` constant `NavWhite` (default for page scenarios) + padding (16dp horizontal / 12dp vertical) + 24dp leading icon + right indicator arrow `KeyboardArrowRight`. All handled inside the component.

- Background color convention (dual to the white dialog, details in 3.5): **items on a page** default to `NavWhite` (page background `PageGrey` → grey base with white card); **items inside a dialog** must pass `containerColor = DialogItemSurface` (default style = `PageGrey` grey card inside the white dialog; glass style = bright glass surface), ensuring the item contrasts with the dialog background and the hierarchy is clear. When "Tone switching" is on, `NavWhite`/`PageGrey` swap in sync and the contrast relationship stays the same; under glass styles `PageGrey` is transparent and `NavWhite` becomes a translucent glass surface, and `DialogItemSurface` automatically switches to the bright glass surface.

- The title uses `MaterialTheme.typography.bodyMedium` with color `TextColor`; the summary is optional, using `bodySmall` + a translucent secondary color. Neither depends on `colorScheme.surface*` (following the "Unified Component Background Color Rules").

- `leadingIcon`: the leading icon drawable; when not provided, the component automatically uses the **default placeholder icon** `DEFAULT_LEADING_ICON`; callers are not allowed to leave a blank where an icon should appear.

- `showLeadingIcon`: whether to show the leading icon, default `true`. **Pure action items** (such as save export/import/delete action items without an icon) may pass `false` to hide the icon slot, in which case the title aligns to the edge; do not pass a placeholder icon just to hide the icon.

- `onClick`: click callback; passing `null` means unavailable (the whole row greys out and is not clickable).

- The navigation icon always uses `KeyboardArrowRight`, built into the component; callers do not pass it.

- `showArrow`: whether to show the right navigation arrow. **Navigation items that "enter the next level" must be `true` (default)**; "action" items (actions that produce no navigation, such as launching a game or deleting) pass `false` to hide the arrow, so they are not mistaken for navigable.

- `verticalPadding` (height exemption clause): the item's vertical padding defaults to **12dp**. **Exemption**: items shown inside a bottom sheet panel (`ModalBottomSheet`) may use larger vertical padding (currently the game actions drawer uses 17dp, adding +10dp to the item's total height), limited to items inside drawers; items inside `AppAlertDialog` dialogs always keep the default 12dp.

- `leadingIconTint` / `titleColor`: explicitly override the leading icon and title colors (e.g. the game actions panel uniformly tints icons with the theme color `MaterialTheme.colorScheme.primary`, or colors a dangerous item with `colorScheme.error`). Passing `null` (default) uses the panel's default behavior (tinted white in dark mode, original image in light mode / `TextColor`).

- Dark mode adaptation: the leading icon (PNG drawable) and the right arrow are automatically tinted `Color.White` in dark mode and keep their original colors in light mode; the unavailable state (`onClick = null`) retains the `contentAlpha` fade. This adaptation is done inside the component; callers need not handle it.

- Color decisions rely on the global `AppThemeColors.isDark` snapshot and automatically recompose and refresh when the appearance mode changes, staying in sync with the overall theme.

### 2. Items in the Side Panel (AppSidePanel)

Items in the Miaomiao Tools side panel (the `content` slot of `ui/common/AppSidePanel.kt`) must use `AppNavItem`, uniformly adopting **the complete form consistent with dialog items (with icon + right indicator)**:

- `containerColor = DialogItemSurface` (the panel base color is `NavWhite`, and items are contrasting grey cards, the same dual relationship as dialog items).
- `leadingIcon` must pass a concrete icon corresponding to the feature semantics; the component's default placeholder icon must not be used, and the icon slot must not be hidden.
- `showArrow = true` (default): items in the panel uniformly keep the right indicator, and **"action" items (such as launching kr2 native) likewise do not hide the arrow** — this clause takes precedence over the earlier "action items pass `false`" clause.
- The vertical spacing between items is added uniformly inside `AppSidePanel` (`SidePanelItemSpacing` = 8dp, consistent with item lists inside dialogs); callers must not add their own outer margins.

### 3. Existing Call Sites (align new scenarios with these)

| Scenario              | Location                                       | leadingIcon                         |
| --------------- | ---------------------------------------- | ----------------------------------- |
| Select cover source (five sources unified)    | `GameScreen.kt` (CoverSourcePickerDialog) | `ic_cover_source` (cloud)               |
| Join group chat (QQ group / Telegram channel) | `SettingsScreen.kt` (join group chat dialog)              | `ic_group_qq` / `ic_group_telegram` |
| Miaomiao Tools panel (launch kr2 native) | `MainScreen.kt` (`content` slot of `AppSidePanel`) | `ic_settings_engine` |
| Miaomiao Tools panel (unpack/pack tool) | `MainScreen.kt` (`content` slot of `AppSidePanel`) | `ic_sheet_archive` |
| Miaomiao Tools panel (input and gamepad) | `MainScreen.kt` (`content` slot of `AppSidePanel`) | `ic_input_gamepad` |

***

## Unified Toggle Switch Rules

Every scenario needing a **boolean two-state switch** (on/off) must uniformly use **Miuix-style** switch components; mixing in Material3's `Switch` or switches from other libraries is forbidden, to avoid inconsistency in light/dark colors / theme color / tactile styling.

### 1. Component Selection (pick one per scenario)

- **Settings item switch** (title row + right-side switch, such as configuration items in a settings list): uniformly use
  `top.yukonga.miuix.kmp.preference.SwitchPreference` (title / checked / onCheckedChange).

- **Inline standalone switch** (a pure switch embedded at the end of a list item with no title row): uniformly use
  `top.yukonga.miuix.kmp.basic.Switch` (checked / onCheckedChange).

### 2. Existing Call Sites (align new scenarios with these)

| Scenario                                   | Location                                                | Component                 |
| ------------------------------------ | ------------------------------------------------- | ------------------ |
| Settings list switches (KRKR/ONS/Artemis/RPG Maker etc.) | `SettingsScreen.kt`                               | `SwitchPreference` |
| App settings switches (tone switching etc.)                        | `AppSettingsActivity.kt`                          | `SwitchPreference` |
| App settings "Navigation bar style" four-way choice                      | `AppSettingsActivity.kt`                          | `OverlayDropdownPreference` (non-boolean choice, see exception 3 in this section) |
| Cover source enable switch (inline)                         | `CoverScraperSettingsActivity.kt` (CoverSourceRow) | `Switch`           |

### 3. Exceptions

- **Non-boolean** choices such as the three-state "follow global / on / off" (e.g. `OverrideSwitch` in `PerGameSettingsScreen.kt`) do not fall into the toggle switch category; implement them with Miuix `OverlayDropdownPreference`, not subject to this section.

- Switches inside engine-native code (the engine module) are not part of the Compose layer and this section does not apply.

***

## Unified Dialog Click Feedback Rules

Inside `AppAlertDialog` dialogs (including `title` / `text` / `confirmButton` / `dismissButton` content),
**all buttons and components must not use any click or press feedback**: ripples, waves, scaling, highlighting, opacity/color changes, etc. are all forbidden.
The click behavior itself is unaffected; only the visual/tactile feedback is removed.

### 1. Component Selection

- Dialog text buttons uniformly use `DialogTextButton` from `ui/common/DialogClickEffects.kt` (internally
  `Modifier.clickable(indication = null)`); **forbidden** to use Material3 `TextButton` /
  `Button` / `IconButton` directly inside dialogs, and forbidden to use button components with built-in press animations.
- Clickable components in the dialog body (input fields, list items, switches, radio buttons, etc.) must disable click feedback:
  - Area level: wrap the outside with `CompositionLocalProvider(LocalIndication provides NoIndication)` (`NoIndication` is provided by `ui/common`);
  - Point level: explicitly pass `indication = null` to `Modifier.clickable`;
  - Shared item components: `AppNavItem` explicitly passes `indication = null`.
- Dismiss-on-scrim-click already has `indication = null` built into `AppAlertDialog`; callers need not handle it.

### 2. Existing Call Sites (align new scenarios with these)

| Scenario | Location | Treatment |
| --- | --- | --- |
| Winlator / Web port and other text-value dialogs (global) | `ui/settings/SettingsScreen.kt` | `DialogTextButton` + input area wrapped in `NoIndication` |
| Per-game override text dialogs (Winlator container, Web port, etc.) | `ui/settings/PerGameSettingsScreen.kt` (`OverrideText`) | `DialogTextButton` + input area wrapped in `NoIndication` |
| Add PC game dialog | `ui/game/PcGameAddDialog.kt` | `DialogTextButton` + inline `indication = null` |

### 3. In-Page Buttons (same intent, not dialogs)

`WithoutPressIndication` in `AppScreenScaffold` only affects components that go through `LocalIndication`; Material3's
`Button` / `TextButton` explicitly use `ripple()` internally and are **not affected by it**. In-page buttons that need no press feedback uniformly use
`ui/common/NoPressFeedbackButtons.kt`:

- Filled buttons: `NoRippleButton` (`tonal = true` is the light-background secondary style, usable for actions like "go to authorization");
- Text buttons: `NoRippleTextButton`.

| Scenario | Location | Component |
| --- | --- | --- |
| Unpack / pack page (authorize / choose directory / unpack / pack / rescan / change directory) | `ui/archive/ArchiveUnpackActivity.kt` | `NoRippleButton` / `NoRippleTextButton` |

### 4. Aligning Existing Code

The remaining existing dialogs (`GameScreen`, `LaunchErrorDialog`, `CoverScraperSettingsActivity`, etc. still have Material
`TextButton`) and in-page M3 `Button`s migrate under "align on touch": whenever any page/dialog is modified, it must be replaced with the no-click-feedback implementation in the same change.

***

## Unified Theme Color Usage Rules

The app theme color (primary) is modified by the user through **App settings → Color wheel** and must take effect globally and uniformly. The rules are as follows:

### 1. The Single Definition and Entry Point of the Theme Color

- The single global theme color state: `com.tyranor.next.theme.AppThemeColors.primary` (`mutableStateOf`; a change triggers app-wide recomposition).

- Persistence: `com.tyranor.next.core.settings.AppSettingsStore` (separate prefs file `app_settings`, key `theme_color`, default `#307DEF`).

- The single entry point for modifying the theme color: call `AppThemeColors.refresh(context)` after persisting; no page may modify `primary` itself.

- The `primaryColor` parameter of `TyranorNextTheme` (Material pages) and `MiuixSettingsTheme` (Miuix pages) **must be** **`Color? = null`**, and the global theme color must be read **inside the function body** with `val primary = primaryColor ?: AppThemeColors.primary`; both theme functions must be annotated `@NonSkippableComposable` (combined with reading inside the function body, this guarantees the theme recomposes whenever the wheel changes and the color syncs globally, without relying on call sites subscribing to the default parameter expression). Both load from storage via `ensureLoaded` first; passing hardcoded colors is forbidden.

### 2. How Pages Obtain the Theme Color

- **Material pages** (Home/Games/Engine tabs, save management, online patches and other Activities): uniformly use `MaterialTheme.colorScheme.primary` (selected icons/text, buttons, switches, input field focus indicators, etc.).

- **Miuix pages** (settings page/engine settings/per-game settings/app settings etc.): uniformly use `MiuixTheme.colorScheme.primary` (Preference icons, Slider, Switch, dropdowns, etc.).

- Every "accent color" spot such as icon tint, highlighted text, and selected state can only come from the above colorSchemes; **forbidden** to hardcode `Color(0x...)`, `#307DEF`, `Blue40`, or any brand blue in a page.

### 3. Neutral and Semantic Colors (fixed, not theme colors)

The following colors are fixed and referenced from `theme/Color.kt` constants; **forbidden** to write `Color(0x...)` directly in a page:

- `PageGrey` page background color, `NavWhite` card/navigation bar component color; whether the two swap is controlled by the app setting "Tone switching". `TextColor` body dark grey, `UnselectedGrey` navigation bar unselected grey.

- Semantic colors: `colorScheme.error` (error/delete), engine cover color (`EngineType.coverColor()`), cover placeholder white text, etc.

- Text and icons inside **theme-color solid components** (buttons/badges whose background is an opaque `primary`) **use white fixed** (`Color.White`);
  **forbidden** to use following colors such as `MaterialTheme.colorScheme.onPrimary` that change with the theme color; only light-background (primary plus opacity)
  secondary styles use theme-color text.

- Before adding any color, first check whether `Color.kt` already has a ready constant; neutral colors must be consolidated into `Color.kt` and not scattered as hardcoded values in pages.

### 3.5 Tone Following for Component Containers/Backgrounds

The background color of components (cards, list items, dialog content items, settings item containers, etc.) **must not depend on**
scheme colors such as `colorScheme.surface*` / `surfaceContainer` to automatically follow tone switching — those scheme
colors may be hardcoded by the theme functions (e.g. both the light and dark branches of `MiuixSettingsTheme` are set to `NavWhite`), and `Dialog` compositions such as dialogs
may not be inside the target Miuix/Material theme scope, causing the background color not to change with "appearance mode / tone switching".

Unified approach: component containers that need to change color with "tone switching" must **directly reference** the **computed constants of `theme/Color.kt`** (`get()`
reads the snapshot state of `AppThemeColors.isDark` / `toneSwitchEnabled`; a change triggers recomposition):

- Cards/navigation bar/component containers (including dialog backgrounds) → `NavWhite`

- Item containers inside dialogs (e.g. `AppNavItem` with `containerColor = DialogItemSurface`, hand-written item rows using
  `DialogItemSurface`) → contrast dual to the dialog background

- **Glass appearance styles (App settings → Appearance style = Retro Glass / Advanced Glass)**: the page background is a fixed dark scene
  (retro = black-grey gradient + theme-color diagonal ambient light; advanced = boxed blurred backdrop collaged from game covers + dimming + vignette,
  see `ui/common/glass/AmbientBackdrop.kt` and `theme/AdvancedGlassStyle.kt`),
  `PageGrey` is transparent, `TextColor` is always light; cards/items/dialogs/input fields uniformly use a 0.5dp hairline stroke (`Modifier.glassBorder()`;
  advanced glass uses a "bright top, dark bottom" gradient stroke and can overlay `Modifier.glassSpecular()` top-edge highlight on panels),
  advanced glass cards are light frosted film (14% white), and dialog/drawer panels are gradients sampled from the page background by `rememberAdvancedGlassPanelSurface()` (must not hardcode grey; the drawer gradient must be drawn on the content layer, because an outer modifier would be misaligned due to anchors layout offset).
  In this mode "appearance mode"
  and "tone switching" are unavailable (greyed out), and the color wheel stays available (the fallback color patches follow the theme color).
  Advanced glass drawing is an independent implementation (`theme/AdvancedGlassStyle.kt`); retro glass's `GlassStyle.kt` does not participate in its material;
  new components must go through dynamic constants and `glassBorder` and must not hardcode glass color values. True backdrop sampling is limited to the whitelist
  (Liquid Glass bottom bar, Lens bottom bar, Advanced Glass floating default navigation bar, main and child buttons of floating button navigation); dialogs/drawers are separate windows and **cannot** sample the main window content,
  so they can only use background-sampled gradients + scrim + optical stroke; do not wire backdrop for them.

- **Bottom drawer/panel (`ModalBottomSheet`) → treated as "page grey base"**: `ModalBottomSheet`'s `containerColor` usually takes `colorScheme.background` (light/dark follows tone switching, equal to the page background), so items inside the drawer (`AppNavItem` etc.) must pass `NavWhite` (grey base with white card), and must **not** apply the "white dialog, grey card" pattern with `PageGrey` — otherwise the item merges into the drawer background (e.g. the game actions drawer GameActionsSheet).

- **Game actions drawer (`GameActionsSheet`) disables the drag gesture**: uniformly pass `sheetGesturesEnabled = false`, allowing closing only via scrim/back key.
  Reason: M3 `ModalBottomSheet`'s dismissal rule is "displacement > 56dp or velocity > 125dp/s", any of which dismisses it (`BottomSheetDefaults`'
  `PositionalThreshold` / `VelocityThreshold`; since 1.4.0 `rememberModalBottomSheetState` does not expose these two thresholds),
  and the leftover gesture/inertia after the list reaches the top is handed over to the drawer, causing the drawer to be dismissed accidentally when the user "swipes a bit fast". New drawers align with this;
  content scrolling and item clicks are unaffected.

- Page background → `PageGrey`

- Text → `TextColor`

Taking a container background from `MiuixTheme`/`MaterialTheme`'s `colorScheme` is a **counter-example** (e.g. using
`MiuixTheme.colorScheme.surfaceContainer` for an item inside a dialog does not change color with tone switching; use the corresponding `theme/Color.kt` container constant instead —
page items `NavWhite`, dialog items `DialogItemSurface`).
Only when a scheme color is genuinely computed in real time and changes with tone switching may it be referenced.

### 4. Layering Requirements

- Any page root component must be wrapped in `TyranorNextTheme {}` or `MiuixSettingsTheme {}`, and the theme must be outermost (wrapped in the Activity's `setContent`).

- `MiuixSettingsTheme` only provides the Miuix theme; if a page internally uses `MaterialTheme.*` (e.g. dialogs, typography), `TyranorNextTheme` is still required outside (all existing Activities satisfy this; new pages must follow).

- The theme color **must not appear** in XML / drawable resources (except launch icons etc.).

***

## Testing and Review

The Agent must use the review skills in the Android CLI.

Multiple mutually independent Agents or sub-Agents should re-check the code from different angles, for example:
Code logic review: check the implementation logic, state transitions, boundary conditions, and potential logic errors.
Architecture review: check module responsibilities, dependency relationships, code coupling, and whether the existing architecture is broken.
Code robustness review: check exception handling, null values, resource release, thread safety, lifecycle, and extreme inputs.
Regression risk review: analyze whether the change may affect existing features, other engines, or existing call chains.
Code convention review: check code style, naming, duplicated code, dead code, and whether it complies with AGENTS.md and the project's existing conventions.

***

## Build

- Build command: `./gradlew assembleDebug --no-daemon`

- Use the Android CLI (`--sdk=/tmp/androidsdk`) to install onto a real device.

- Release rules (issue #79): only modify `appVersionName` in `app/build.gradle.kts`; `versionCode` is derived automatically by `versionCodeOf()`
  (`major*1_000_000 + minor*1_000 + patch`, minor/patch must be < 1000); hand-writing or rolling back `versionCode` is forbidden.
  The beta-release workflow pre-validates that versionCode strictly increases, and after the build verifies the APK's actual versionCode (a mismatch fails the build).

***

## Localization (i18n)

Supported in-app languages: **English (default)**, **Bahasa Indonesia**, **Simplified Chinese**, **Japanese**, plus `Follow system`.

- App strings: `app/src/main/res/values/strings.xml` (English default), `values-in`, `values-zh`, `values-ja`.
- Engine strings: `engine/src/main/res/values/strings.xml` (English default), `values-in`, `values-zh`, `values-ja`.
- Keep every language file key-complete; `tools/check-hardcoded-ui-strings.py` (Gradle `:app:checkHardcodedUiStrings`) enforces parity and blocks CJK string literals in Kotlin.
- Engine host UI (Kotlin/Java in `engine`) must resolve text through `com.core.engine.EngineUiText.get(...)` so it follows the launcher language; the app passes `LaunchContract.UI_LANGUAGE_TAG`.
- Never hardcode display text in Kotlin/Java; add a key to all four language files instead.
- Language selection: `AppSettingsStore.LANGUAGE_*` + `AppLocaleController`; the default is `en`.

## Git commit conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <summary>`.
  Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`.
- **Commit messages must be written in English** (subject and body), even when the discussion is in another language.
- Subject: imperative mood, lowercase after the type, no trailing period, at most 72 characters.
- Scope is optional but recommended (e.g. `i18n`, `engine`, `settings`, `cover`, `save`, `docs`).
- One logical change per commit; do not mix unrelated refactors with behavior changes.
- Reference issues in the body (`Refs: #123`) rather than stuffing them into the subject.