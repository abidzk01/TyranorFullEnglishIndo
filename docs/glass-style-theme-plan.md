# Glass Style Theme Plan

> Note: the "glass" described in this document (persisted value `glass`) was later renamed to **"Retro glass"** (display name only; the stored value and behavior are unchanged);
> the new third option, "Advanced glass", is described in "Advanced Glass Appearance Style Plan" (`docs/advanced-glass-appearance-style-plan.md`).
>
> Goal: add a new "Appearance style" dropdown item to app settings (Default / Glass). Under the glass style: the page background is fixed to a black-gray gradient,
> all cards/items/dialogs/panels become semi-transparent frosted glass + a 0.5px stroke; appearance mode and tone switching are grayed out and unavailable,
> while the tone wheel stays available. Switching takes effect immediately with no restart, and the default style keeps the current visuals completely unchanged.

---

## 1. Decision Record (confirmed with the user)

| Decision point | Outcome |
|---|---|
| Frosted glass implementation | **Semi-transparent faux glass**: a semi-transparent dark glass surface + a 0.5px bright edge; no per-component real sampling blur (the background is a plain gradient, so visual differences are minimal; compatible with all API levels, zero blur pipeline cost). The bottom navigation keeps using the existing `kyant backdrop` real blur |
| Accent color | **The tone wheel stays available under the glass style**, reusing the theme color the user already chose, without forcing the default blue |
| Appearance mode | **Disabled under the glass style** (the background is a fixed black-gray gradient, so light mode is meaningless); the original value is restored after switching back to the default style |
| Background gradient | Fixed black-gray vertical gradient (suggested `#26282C → #0E0F11`) |
| Stroke | Unified 0.5dp hairline (implementation in 4.4; if a physical 0.5px is required it can be adjusted at a single place) |
| Plan filed | This document |

## 2. Current State and Change Surface

- Theme entry points: `theme/Theme.kt` (Material), `theme/MiuixSettingsTheme.kt` (Miuix) — two themes, both reading primary / isDark / toneSwitch from the
  `theme/AppThemeColors.kt` snapshot, with `@NonSkippableComposable` guaranteeing immediate recomposition.
- Color constants: `theme/Color.kt`'s `PageGrey` (page background) / `NavWhite` (card container) / `TextColor` /
  `UnselectedGrey` are all `get()` reading the snapshot, referenced in about 17 files globally.
- Settings storage: `core/settings/AppSettingsStore.kt` (separate `app_settings` prefs); the navigation bar style
  `nav_style` is an existing reference (string constant + get/set + in-memory `StateFlow`).
- App settings page: `ui/settings/AppSettingsActivity.kt:70`, which already has five MiuixCard sections: language / tone wheel / appearance mode / tone switch / liquid glass navigation.
- Root backgrounds: `MainActivity.kt:65`'s `Surface(colorScheme.background)` and `ui/common/AppScreen.kt:64`'s
  `AppScreenScaffold` (host of all secondary pages) are the only two root Surfaces; `MainScreen.kt:122` paints the background color once more on the content layer.
- Shared container components: `AppNavItem` (page `NavWhite` / in-dialog `PageGrey` duality), `AppAlertDialog`
  (white 8dp card), `AppTopBar` (page-background-colored top bar), `AppSearchField` (Miuix SearchBar, base color taken from
  `surfaceContainerHigh`), `GameActionsSheet` (`ModalBottomSheet`, base color taken from `colorScheme.background`).
- Miuix components take all colors from `MiuixTheme.colorScheme` (Card→`surfaceContainer`, input field→
  `surfaceContainerHigh`, dialog scrim→`windowDimming`, divider→`dividerLine`); changing the scheme inside
  `MiuixSettingsTheme` applies it in bulk.

## 3. Settings Model

### 3.1 `core/settings/AppSettingsStore.kt`

```kotlin
const val KEY_APPEARANCE_STYLE = "appearance_style"
const val APPEARANCE_STYLE_DEFAULT = "default"
const val APPEARANCE_STYLE_GLASS = "glass"

fun getAppearanceStyle(c: Context): String =
    prefs(c).getString(KEY_APPEARANCE_STYLE, APPEARANCE_STYLE_DEFAULT)
        ?.takeIf { it == APPEARANCE_STYLE_GLASS } ?: APPEARANCE_STYLE_DEFAULT

fun setAppearanceStyle(c: Context, style: String) { /* normalize + putString */ }
```

No new StateFlow: the UI subscribes to the `AppThemeColors` snapshot (same source as tone/appearance mode) to avoid two state sources.

### 3.2 `theme/AppThemeColors.kt`

```kotlin
var isGlass by mutableStateOf(false); private set

fun refresh(context: Context) {
    isGlass = AppSettingsStore.getAppearanceStyle(context) == AppSettingsStore.APPEARANCE_STYLE_GLASS
    primary = parseColorHex(AppSettingsStore.getThemeColorHex(context))   // the wheel stays available, no forcing
    isDark = isGlass || AppSettingsStore.isDarkEffective(context)         // glass is always dark
    toneSwitchEnabled = !isGlass && AppSettingsStore.isToneSwitchEnabled(context)
    // ThemeColorPayload: when isGlass, darkMode=true and card/text use the glass panel colors
}
```

- `ensureLoaded` is untouched: both themes call `refresh` on the first frame, so the glass style takes effect on the first frame.
- When switching styles on the settings page: `AppSettingsStore.setAppearanceStyle(...)` → `AppThemeColors.refresh(ctx)`,
  and the whole app recomposes immediately.

## 4. Visual System

### 4.1 Palette (added to `theme/Color.kt`, dynamic constants whose values depend on `isGlass`)

```kotlin
// glass-only (used only in the isGlass branch)
val GlassBgTop = Color(0xFF24262B)           // gradient start (cool gray top, darkened)
val GlassBgMid = Color(0xFF17191D)           // mid-gradient transition
val GlassBgBottom = Color(0xFF0A0B0D)        // gradient end (near black)
val GlassBgGlow = Color(0x0AFFFFFF)          // top ambient glow (radial, 4% white)
val GlassSurface = Color(0xCC191B1F)         // cards/items: 80% dark, for readability
val GlassSurfaceHigh = Color(0xE61F2126)     // input fields/in-dialog items: 90% dark
val GlassPanel = Color(0xE6141518)           // dialog/drawer panels: 90% dark
val GlassBorder = Color(0x24FFFFFF)          // 0.5px stroke: 14% white
val GlassText = Color(0xFFEDEEF0)            // primary text
val GlassTextSecondary = Color(0xFFA6AAB0)   // secondary text
val GlassUnselected = Color(0xFF7F858D)      // unselected
```

> Final background form: `GlassBackground` uses `drawWithCache` to layer four layers — a three-stop vertical gradient
> (0f cool gray top / 0.52f mid gray / 1f near black) + a white top ambient light (center slightly above the screen top, radius about 55% of screen height, 4% white)
> + two layers of accent diagonal ambient light (top-right main: alpha 0.26, center 0.85w/0.22h, radius 1.05w; bottom-left secondary: alpha 0.12,
> center 0.10w/0.78h). The accent ambient light changes in real time with the tone wheel, giving the glass surfaces something colored to let through.
>
> Panel transparency trade-off: the first draft's 8%/12% white was overly transparent on a plain gradient (dropdown overlays and the search field have no extra backing surface),
> so the final choice is 80%–90% dark semi-transparency, preserving gradient see-through while guaranteeing readability.

`PageGrey / NavWhite / TextColor / UnselectedGrey` gain an `isGlass` branch:

| Constant | Default style | Glass style |
|---|---|---|
| `PageGrey` | current | `Color.Transparent` (revealing the root gradient) |
| `NavWhite` | current | `GlassSurface` |
| `TextColor` | current | `GlassText` |
| `UnselectedGrey` | current | `GlassUnselected` |

A new dual constant `DialogItemSurface`: default = `PageGrey`; glass = `GlassSurfaceHigh`.
It is used for "in-dialog items" — under glass, `PageGrey` being transparent would make items invisible on a glass dialog, so the original
`AppNavItem(containerColor = PageGrey)` dialog call sites now pass this instead.

### 4.2 Scheme Mapping for Both Themes

`theme/Theme.kt` (Material): `background/surface = PageGrey` (transparent under glass),
`onBackground/onSurface = TextColor` already in place; only `surfaceVariant/outline` need to be pointed at the glass colors.

`theme/MiuixSettingsTheme.kt` (glass branch):

```kotlin
background = PageGrey                // transparent, revealing the gradient
surface = PageGrey
surfaceContainer = GlassSurface      // MiuixCard default base color → all cards become glass automatically
surfaceContainerHigh = GlassSurfaceHigh       // SearchBar/InputField
surfaceContainerHighest = GlassSurfaceHigh
onBackground = onSurface = onSurfaceContainer = TextColor
onSurfaceContainerVariant = GlassTextSecondary
outline = dividerLine = GlassBorder  // dropdown overlays, dividers
windowDimming = Color.Black.copy(alpha = 0.6f)
primary = stored theme color (the wheel stays available)
```

### 4.3 Gradient Root Background (new `theme/GlassStyle.kt`)

```kotlin
@Composable
fun GlassBackground(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val modifier = if (AppThemeColors.isGlass)
        modifier.background(Brush.verticalGradient(listOf(GlassBgTop, GlassBgBottom)))
    else modifier else modifier.background(MaterialTheme.colorScheme.background)
    Box(modifier.fillMaxSize()) { content() }
}
```

Applied at two roots:
- `MainActivity.kt:65`: `Surface` replaced by `GlassBackground { MainNavigation() }`.
- `ui/common/AppScreen.kt:70`: `Surface` replaced by `GlassBackground { ... }` (covering all secondary pages).
- `MainScreen.kt:122` keeps `.background(colorScheme.background)` (transparent under glass) and does not repaint the gradient.

### 4.4 Glass Stroke Modifier (`theme/GlassStyle.kt`)

```kotlin
private val GlassShape = RoundedCornerShape(8.dp)

fun Modifier.glassBorder(
    shape: Shape = GlassShape,
    width: Dp = 0.5.dp,
    color: Color = GlassBorder,
): Modifier = if (AppThemeColors.isGlass)
    border(BorderStroke(width, color), shape) else this
```

- Reads the snapshot state → style switching recomposes automatically.
- 0.5dp renders as 1–2 physical pixels on high-density screens; if a physical 0.5px is required, it can be changed at a single place to
  `drawWithCache { onDrawWithContent { drawContent(); drawOutline(...) } }` using `0.5f` pixels.
  This plan defaults to 0.5dp (a visual hairline).
- MiuixCard fills with a squircle while the stroke uses RoundedCornerShape(8dp); at an 8dp radius the difference is imperceptible to the eye, which is acceptable.

## 5. Component Change List

### 5.1 Shared Components (change the internals; callers need zero changes)

| Component | Change |
|---|---|
| `AppNavItem` | Under glass `NavWhite` already becomes a glass surface automatically; append `.glassBorder()` after `.background(containerColor)` (no border when the container passes a transparent `PageGrey`) |
| `AppAlertDialog` | Card color `NavWhite` → switch to `GlassPanel` under glass; append `.glassBorder()`; scrim opacity unchanged |
| `AppTopBar` | Background transparent under glass (`PageGrey`/`MiuixTheme.background` are automatically transparent), text `TextColor`; optionally add a 0.5px bottom divider (drawing only the bottom edge with `glassBorder`) |
| `AppSearchField` | Becomes glass automatically after overriding Miuix `surfaceContainerHigh`; outer `.glassBorder(RoundedCornerShape(8.dp))` |
| `GameActionsSheet` | `containerColor` switches to `GlassPanel` under glass; top corners with `glassBorder`; items remain `NavWhite` (AGENTS.md drawer item convention) |
| `LiquidGlassNavigationBar` | Unchanged; under the glass style `isDark=true`, so its surface color follows the dark branch automatically |
| `BottomInsetSpacer` | Unchanged |

### 5.2 Page Containers (just add the stroke; most colors follow automatically)

- Material `Card` (`EngineScreen EngineRow`, `SaveManagement` cards, `PatchEntryCard`,
  `GameShortcutCropDialog` cards, `CoverSearchDialog` cards): `containerColor = NavWhite` becomes glass automatically;
  append `.glassBorder(RoundedCornerShape(8.dp))` at each site.
- `GameCard` (`GameScreen.kt:1466`): the card itself is a cover/engine-colored placeholder; append the glass stroke.
- `HomeScreen`: append the stroke to `QuickLaunchEmptyCard`, the `RecentGameRow` content layer, and `QuickLaunchCard`;
  keep `QuickLaunchFallback` fixed dark gray.
- MiuixCard call sites (`SettingsScreen`, `AppSettingsActivity`, `PerGameSettingsScreen`,
  `EngineSettingsMenuActivity`, `CoverScraperSettingsActivity`, `RpgMakerSettingsCard`,
  `FontSettings`, `EngineSettingsDetailScreen`, etc., about 20 sites): colors become glass automatically via the scheme;
  add `modifier = Modifier.fillMaxWidth().glassBorder()` at each site.
  (Optional: wrap a `GlassCard` component to consolidate in one place; the first version adds it per site for minimal change.)
- Call sites passing `containerColor = PageGrey` for in-dialog items (`EngineScreen.kt:129`, `RpgMakerSettingsCard.kt:327/334`,
  `FontSettings.kt:101/109`, `SettingsScreen.kt:507/511/549/569`, etc.) switch to `DialogItemSurface`.
- Non-card `PageGrey` usages inside pages (`CoverScraperSettingsActivity.kt:256` sequence badge,
  `GameScreen.kt:1251/1389`, `SettingsScreen.kt:389`): judge each case — is it readable when transparent under glass? If not, switch to `DialogItemSurface`.

## 6. Settings Page Changes (`ui/settings/AppSettingsActivity.kt`)

1. Add one MiuixCard + `OverlayDropdownPreference` (suggested placement: before "Appearance mode"):

```kotlin
val appearance = if (AppThemeColors.isGlass)
    AppSettingsStore.APPEARANCE_STYLE_GLASS else AppSettingsStore.APPEARANCE_STYLE_DEFAULT
OverlayDropdownPreference(
    title = stringResource(R.string.settings_appearance_style),
    items = listOf(
        stringResource(R.string.settings_appearance_style_default),
        stringResource(R.string.settings_appearance_style_glass),
    ),
    selectedIndex = if (appearance == AppSettingsStore.APPEARANCE_STYLE_GLASS) 1 else 0,
    onSelectedIndexChange = { index ->
        AppSettingsStore.setAppearanceStyle(ctx, if (index == 1) GLASS else DEFAULT)
        AppThemeColors.refresh(ctx)
    },
)
```

2. Disabled items (grayed out under the glass style; the `enabled` parameter is already supported in Miuix 0.9.2):
   - Appearance mode `OverlayDropdownPreference(enabled = !isGlass)`;
   - Tone switch `SwitchPreference(enabled = !isGlass)`;
   - Tone wheel `ArrowPreference` stays available (confirmed this time).
   - Suggested: add `summary = stringResource(R.string.settings_disabled_in_glass_style)` to the two disabled cards to explain why.
3. New trilingual keys (`values/values-ja/values-en`, run `checkHardcodedUiStrings`):

| key | zh | ja | en |
|---|---|---|---|
| `settings_appearance_style` | 外观风格 | 外観スタイル | Appearance style |
| `settings_appearance_style_default` | 默认 | デフォルト | Default |
| `settings_appearance_style_glass` | 玻璃 | ガラス | Glass |
| `settings_disabled_in_glass_style` | 玻璃风格下不可用 | ガラススタイルでは使用できません | Unavailable in Glass style |

## 7. System Bar and Engine Shell Integration

- `ui/common/AppScreen.kt:30`: append `|| getAppearanceStyle(this) == APPEARANCE_STYLE_GLASS` to
  `val darkMode = AppSettingsStore.isDarkEffective(this)`; under glass use light system bar icons
  (`SystemBarStyle.dark`).
- The `SideEffect` at `MainActivity.kt:51` reads `AppThemeColors.isDark`, which is automatically true under glass, so no change is needed.
- `AppThemeColors.refresh`'s `ThemeColorPayloadStore`: under glass set `darkMode=true` and use the ARGB of
  `GlassPanel/GlassText/GlassTextSecondary` for card/text/muted, keeping the Tyrano/Web shell colors consistent.

## 8. Degradation, Performance, and Edge Cases

- **API < 31**: does not rely on RenderEffect, so the translucency + stroke fully work with no blur loss; `LiquidGlassNavigationBar`
  continues to take its <31 solid-color branch.
- **Performance**: the whole app gains only one extra gradient Box and one hairline per component; there is no per-component blur pipeline, so scrolling/grids gain no overhead.
- **Where real sampling is impossible (dialogs/drawers are separate windows)**: uniformly use the high-opacity `GlassPanel` panel, prioritizing readability.
- **Contrast**: text uniformly uses `GlassText`; text on the cover grid stays inside cards; if a specific page shows low contrast, adjust the `GlassPanel` alpha at that single place.
- **Zero regression for the default style**: all glass logic is gated by `isGlass`; when `isGlass=false` the behavior is pixel-identical to the current state.

## 9. Implementation Steps

1. `AppSettingsStore`: add the `appearance_style` constant and get/set.
2. `AppThemeColors`: `isGlass` snapshot + `refresh` branch + ThemeColorPayload mapping.
3. `Color.kt`: glass palette + glass branches for the four dynamic constants + `DialogItemSurface`; scheme mapping in `Theme.kt`/`MiuixSettingsTheme.kt`.
4. Add `theme/GlassStyle.kt`: `GlassBackground` + `Modifier.glassBorder`.
5. Wire the root backgrounds: `MainActivity`, `AppScreenScaffold`; `AppScreenActivity` system bar determination.
6. Shared components: `AppNavItem` / `AppAlertDialog` / `AppTopBar` / `AppSearchField` / `GameActionsSheet`.
7. Add strokes to page containers site by site + switch in-dialog items to `DialogItemSurface` (checklist in section 5).
8. Settings page: add the appearance style dropdown, disable appearance mode and tone switch, add trilingual strings.
9. Verification: `./gradlew :app:assembleDebug` (including `checkHardcodedUiStrings`),
   manual regression matrix: default/glass × four Tabs × secondary pages × dialogs × existing light/dark values × API 30/31+ emulators.

## 10. Acceptance Criteria

- [ ] Settings → App settings shows "Appearance style = Default/Glass", switching takes effect immediately and persists across restarts.
- [ ] Under glass: black-gray gradient background, all cards/items/dialogs/drawers/search fields have a frosted glass look with a 0.5px stroke.
- [ ] Under glass: appearance mode and tone switch are grayed out and unclickable; the tone wheel can be opened and changes the accent color immediately.
- [ ] Under glass, status bar/navigation bar icons are light; the engine web shell follows dark mode.
- [ ] Switching back to default: visuals are identical to before the change (spot-check the home/game/settings/engine pages and dialogs).
- [ ] Trilingual strings complete, `checkHardcodedUiStrings` passes, `assembleDebug` passes.

## 11. Risks and Rollback

| Risk | Mitigation |
|---|---|
| `colorScheme.background` being transparent exposes window transparency somewhere | Root gradient covers everything (MainActivity/AppScreenScaffold); during acceptance, specifically check dialog/IME scenarios |
| In-dialog items previously relied on `PageGrey` contrasting with the white base, which fails under glass | Add `DialogItemSurface` as a unified replacement; grep every `PageGrey` call site and judge each one |
| Miuix squircle vs RoundedCornerShape stroke misalignment | An 8dp radius is imperceptible; if a visible deviation appears, draw the stroke via `squircleBackground` instead or lower the stroke alpha |
| Some existing theme colors (low saturation) have insufficient contrast under glass | The wheel stays available so users can adjust it themselves; no forced replacement |
| Rollback | Settings gains only one prefs key; all code changes are gated by `isGlass`, so rolling back means deleting the glass branches or locking the default value back to `default` |

## 12. Implementation Record

Implemented as planned; main changes:

| File | Change |
|---|---|
| `core/settings/AppSettingsStore.kt` | Add `KEY_APPEARANCE_STYLE`, `APPEARANCE_STYLE_DEFAULT/GLASS` and get/set (invalid values normalize to default) |
| `theme/AppThemeColors.kt` | Add the `isGlass` snapshot; `refresh` computes glass/dark/tone-switch; ThemeColorPayload glass branch |
| `theme/Color.kt` | Glass palette + glass branches for `PageGrey/NavWhite/TextColor/UnselectedGrey` + `DialogItemSurface` |
| `theme/MiuixSettingsTheme.kt` | Mapping for `surfaceContainerHigh/Highest`, `secondaryContainer`, outline/divider, windowDimming, etc. under glass |
| `theme/GlassStyle.kt` (new) | `GlassBackground` (gradient root background) + `Modifier.glassBorder` (drawWithContent drawing a 0.5dp stroke after the content) |
| `MainActivity.kt` / `ui/common/AppScreen.kt` | Root Surface replaced with `GlassBackground`; AppScreenActivity system bar determination includes glass and follows it live within the page |
| `ui/common/AppNavItem/AppAlertDialog/AppSearchField` | Items/dialogs/search fields become glass (stroke, panel color, capsule-shaped stroke) |
| `ui/game/GameScreen.kt` | The actions drawer and cover search dialog use `GlassPanel`; candidate placeholders/launch file rows switch to `DialogItemSurface`; GameCard stroke |
| `ui/home/HomeScreen.kt` | Strokes for the quick launch card/empty card/recently opened rows |
| `ui/engine`, `ui/save`, `ui/patch`, `ui/cover`, `ui/game/GameShortcutCropDialog` | Page card strokes, in-dialog items switched to `DialogItemSurface` |
| `ui/settings/*` (including RpgMaker/FontSettings/PerGame/EngineSettingsMenu) | Strokes on all MiuixCards, dialog items switched to `DialogItemSurface` |
| `ui/settings/AppSettingsActivity.kt` | Add the "Appearance style" dropdown card; under glass, appearance mode and tone switch get `enabled=false` with the reason shown; the tone wheel stays available |
| `res/values{,-ja,-en}/strings.xml` | Add 4 keys |
| `AGENTS.md` / `CONTEXT.md` | Synchronize the glass style container color guidance and the "Appearance style" term |

Verification: `:app:compileDebugKotlin`, `:app:testDebugUnitTest`, `:app:checkHardcodedUiStrings` all pass
(the remaining visual acceptance items require a real device, see section 10).

### 12.1 Fixes After On-Device Acceptance

| Issue | Cause | Fix |
|---|---|---|
| The actions drawer (GameActionsSheet) background still looks transparent | Both the panel `GlassPanel` (90%) and the items `NavWhite` (80%) carry alpha, so bright covers underneath show through | Add opaque `GlassPanelSolid`/`GlassSurfaceSolid` to `Color.kt`; switch the drawer panel and all 11 item sites to opaque; deepen the glass scrim to 60% |
| After attaching `glassBorder` to the outer drawer, a white line appears / the handle sticks to the left | 1. The drawer's vertical position is determined by an internal `draggableAnchors` layout offset, so the outer stroke is drawn at unoffset coordinates and the white line lands in the background; 2. The custom `dragHandle`'s `Column` defaults to horizontal Start alignment, squeezing the handle left | Remove the drawer's outer stroke; instead draw a 0.5dp top edge line at the first position of the `dragHandle` slot, and set the `Column` to `fillMaxWidth + CenterHorizontally` |
| The home page's recently played swipe-to-delete layer looks accent-tinted translucent | The delete layer used `colorScheme.primary`, and the translucent item on top lets the color through | Under glass, the delete layer is fixed to the bright glass surface `GlassSurfaceHigh`; the default style keeps the theme color |
| `AppSearchField`'s stroke wraps the outer layout | The stroke was attached to the Miuix `SearchBar`'s `modifier` (the outer Column, including insideMargin etc.), while the capsule base color is drawn inside `InputField` | Move the stroke to `InputField`'s `modifier`, using `CircleShape` to match the capsule base color |
| The page background gradient looks dull | A single two-point vertical gradient (#26282C→#0E0F11) lacks depth | Changed to a three-stop gradient (#24262B/#17191D/#0A0B0D) + a top 4% white radial ambient glow (`GlassBgGlow`), caching both Brushes at once with `drawWithCache` |
| Under the glass style the default navigation bar is still a flat solid bar | The default `NavigationBar` occupies layout height, with an opaque glass container color and no stroke | Under the glass appearance style + default navigation style, the navigation bar becomes a floating rounded glass bar (`MainScreen.floatingDefaultNav`): corners unified with components (`AppComponentShape`), `glassBorder` 0.5dp stroke, `GlassNavSurface` (95% dark) glass base, and icons only without text (bar height narrowed to 64dp); `windowInsets=0` with outer avoidance, and the list's bottom inset unified to 88dp via `glassNavBottomInset()` |
| Rounded corners scattered as literals, impossible to adjust uniformly under glass | 22 hardcoded `RoundedCornerShape(8.dp)` + 15 hardcoded Miuix `cornerRadius = 8.dp` | Add a unified `theme/AppShapes.kt` entry point: `AppComponentShape` (default 8dp / glass 32dp, consistent with the floating navigation), `AppComponentCornerRadius` (Miuix Dp), `AppSheetTopShape` (drawer top); replace across the project with the constants and clean up unused imports |
| On some pages the text overlaps the title when the content scrolls under the top bar | Under glass the page background `PageGrey` is transparent, and content in pages like MiuixScaffold scrolls beneath the top bar, which a transparent bar cannot hide | Changed to "transparent top bar + content padded below": `AppTopBar` stays transparent under glass (revealing the gradient/ambient light); the 6 MiuixScaffold pages move the top `innerPadding` value from the scrollable `contentPadding` to a persistent padding on the list's `modifier`, so content overall sits below the top bar and no longer scrolls through it |
| Glass over a neutral black-gray gradient has "nothing to let through" | The background lacked color depth, so no matter how transparent the components were there was nothing to show through | Pair it with the C-variant background: `GlassBackground` overlays accent diagonal ambient light (top-right main alpha 0.26, center 0.85w/0.22h, radius 1.05w; bottom-left secondary alpha 0.12), changing color live with the tone wheel; the 4% white top glow is kept. Measured: perceptible tonal depth appears in the glass surfaces/gaps (+5~+20 difference in the blue channel) |

All of the above have been verified on a real device: the drawer is opaque with the handle centered and no stray lines; the search field stroke hugs the capsule.