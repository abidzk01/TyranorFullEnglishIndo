# Advanced Glass Appearance Style Plan (including the "Glass → Retro Glass" rename)

> Goal: add a third tier, "Advanced Glass", to "App settings → Appearance style"—**reproducing the material of the reference image (the system notification shade)**:
> a heavily blurred real-image base + light frosted cards (bright-top/dark-bottom border, top-edge highlight) + a floating glass button;
> coexisting with the existing glass style; and at the same time rename the existing "Glass" **display name** to "Retro Glass".
> The switch takes effect immediately and persists across restarts; zero visual regression for the default and retro glass styles (the retro drawing code is unchanged).
>
> **v2 revision**: the initial version made advanced glass a recolored variant of retro glass (synthesized color-blob background + dark film), which is not a reproduction.
> This version switches to an independent implementation: the background is a collage of game covers put through several rounds of box blur (real-image blur),
> cards use a light frosted film; see §6.3. Retro glass's `GlassStyle.kt` has been restored to its pre-change implementation.

---

## 1. Decision Record (suggested values; open items in §15)

| Decision point | Conclusion |
|---|---|
| Display name | Three appearance styles: **Default / Retro glass / Advanced glass** |
| Storage values | `default` / `glass` (semantics changed to retro glass, **value unchanged, zero migration for existing data**) / `glass_advanced` (new) |
| Code identifiers | Storage-value constants consolidated into the `AppearanceStyle` enum (single source of truth); `isGlass` semantics upgraded to "any glass tier", with a new `isAdvancedGlass`; **no** global rename of `isGlass` (involves 16 files, large diff, low payoff) |
| Implementation independence | Advanced glass drawing is an **independent implementation** (`theme/AdvancedGlassStyle.kt` + `ui/common/glass/AmbientBackdrop.kt`); retro glass's `GlassStyle.kt` is restored to the pre-change code, with only a one-line dispatch from the root component and `glassBorder` |
| Reuse strategy | Reuse the behavior layer (dynamic color getter dispatch / `glassBorder` forwarding / scheme mapping / disable rules / 32dp shapes), not the retro drawing implementation |
| Background image source | **Game cover collage blur**: take up to 6 covers from the game library and tile them into a 2×3 thumbnail → several rounds of box blur → cover-scale to fill + darken + vignette; falls back to soft theme-color blobs when the library has no covers |
| Blur strategy | The base image is a real bitmap blur (reusing `boxBlurArgb`, consistent on all APIs, zero RenderEffect pipeline); cards are only a light frosted film (the background is already globally blurred); real backdrop sampling is only for floating elements (liquid glass bottom bar, advanced glass floating default nav bar) |
| Dialogs/sheets | A separate window cannot sample the main window, so use a **gradient panel colored from the page background** (darkened toward a dark base + a little translucency) + scrim + optical border/top-edge highlight |
| Degradation | The option is visible on all APIs; base-image blur does not depend on RenderEffect (API 30 and 31+ look the same); floating elements fall back to a light semi-transparent film below API 31 |
| Animation | First version uses a static base image; drift animation is not in this version |
| Plan record | This document |

## 2. Terminology and Naming (including handling of existing conflicts)

- Three **appearance styles**: Default / **Retro glass** (formerly "Glass") / **Advanced glass** (new).
- **Navigation style** (Default / Liquid glass · Classic / Liquid glass · Lens) is **orthogonal and independent** of appearance style; this plan does not change the navigation style values.
- Handling the naming conflict: `CONTEXT.md:175` currently lists "Advanced glass" as an _Avoid_ alias for "Liquid glass · Lens",
  so it must be changed to "Enhanced glass", and the official term "Advanced Glass" added as belonging to appearance style; otherwise the glossary contradicts itself.
- English: Retro glass / Advanced glass; Japanese: レトロガラス / プレミアムガラス (the translated name may be revisited).

## 3. Decomposing the Image Material → Mapping to This Project

The image (notification shade style) has only three layers, and **the blur is applied only once**:

| Layer | What the image shows | Corresponding implementation in this project |
|---|---|---|
| 1 Global base | A real image heavily blurred across the screen + dark darkening + vignette in the four corners | `AmbientBackdrop`: game covers tiled into a 2×3 thumbnail → multiple rounds of `boxBlurArgb` → `advancedGlassPageBackground` cover-filled + 48% black + vignette; when there are no covers, falls back to soft theme-color blobs |
| 2 Translucent surface | Large-radius cards/buttons: a light translucent film, with the blur behind a card matching its surroundings | Light frosted film `AdvancedGlassSurface` (14% white) + bright-top/dark-bottom gradient border (20%→5% white) + top-edge highlight; the floating nav bar additionally overlays real backdrop sampling (API 31+) |
| 3 Optical decoration | Bright line on the top edge, highlight on button edges, very faint shadow | `advancedGlassBorder` (gradient brush border) + `glassSpecular` (top-edge highlight strip) + `Highlight`/`Shadow` (reusing the backdrop library) |

**Key conclusion**: the cards in the image do not run a blur pipeline themselves—the background is already globally blurred, and the card is only a light translucent film.
Implementing "blur behind each card individually" would create N `RenderEffect` pipelines and make the blur amount drift with position, so this project does not do it.

## 4. Current State and Change Surface

- Storage: `core/settings/AppSettingsStore.kt:94-98` (two constants), `:214-225` (get/set normalization).
- Snapshot: `theme/AppThemeColors.kt:26-28` (`isGlass`), `:49-53` (`refresh` deriving `isDark`/`toneSwitchEnabled`), `:56-75` (ThemeColorPayload).
- Palette and dynamic getters: `theme/Color.kt:25-67` (glass palette), `:80-114` (`PageGrey/NavWhite/TextColor/UnselectedGrey/DialogItemSurface`).
- Background and border: `theme/GlassStyle.kt:29-48` (`GlassBackground`), `:64-95` (`glassPageBackground`), `:131-147` (`glassBorder`).
- Shapes: `theme/AppShapes.kt:14-40` (glass 32dp / corner-radius Dp).
- Settings page: `ui/settings/AppSettingsActivity.kt:160-182` (appearance style dropdown), `:195-224` (disabling two items).
- System bars: `ui/common/AppScreen.kt:28-45` (initial decision + live following within the page).
- Nav bar: `ui/main/MainScreen.kt:142` (floating default nav bar), `:171-192` (backdrop recording + background), `:313-337` (floating bar implementation);
  `ui/common/LiquidGlassNavigation.kt:106-114,142-160`; `ui/common/glass/GlassNavigationThemeAdapter.kt:31-51`.
- Text: `res/values{,-en,-ja}/strings.xml:27-30`.
- Standards: `AGENTS.md:149-152`, `:391-395`; terminology: `CONTEXT.md:99-105`, `:169-175`.

## 5. Settings Model

### 5.1 New `core/settings/AppearanceStyle.kt` (pure Kotlin, JVM-testable)

```kotlin
enum class AppearanceStyle(val storageValue: String) {
    DEFAULT("default"),
    RETRO_GLASS("glass"),            // formerly "Glass": value unchanged, zero migration for existing users
    ADVANCED_GLASS("glass_advanced"); // new "Advanced glass"

    val isGlass: Boolean get() = this != DEFAULT
    val isAdvancedGlass: Boolean get() = this == ADVANCED_GLASS

    companion object {
        fun fromStorage(value: String?): AppearanceStyle =
            entries.firstOrNull { it.storageValue == value } ?: DEFAULT
    }
}
```

`AppSettingsStore`: delete the two `APPEARANCE_STYLE_DEFAULT/GLASS` constants (or turn them into aliases of `AppearanceStyle`),
with the enum holding the three persisted values (`default` / `glass` / `glass_advanced`; the constants move into the enum and `AppSettingsStore` no longer defines them separately); get/set now take and return the enum:

```kotlin
fun getAppearanceStyle(c: Context): AppearanceStyle =
    AppearanceStyle.fromStorage(prefs(c).getString(KEY_APPEARANCE_STYLE, null))
fun setAppearanceStyle(c: Context, style: AppearanceStyle) =
    prefs(c).edit().putString(KEY_APPEARANCE_STYLE, style.storageValue).apply()
```

There are only 3 call sites, so the change is manageable: `AppThemeColors.kt:50`, `AppScreen.kt:33`, `AppSettingsActivity.kt:164-177`.

### 5.2 `theme/AppThemeColors.kt`

```kotlin
var appearanceStyle by mutableStateOf(AppearanceStyle.DEFAULT); private set

val isGlass: Boolean get() = appearanceStyle.isGlass            // semantics: any glass tier (backward compatible with old call sites)
val isAdvancedGlass: Boolean get() = appearanceStyle.isAdvancedGlass

fun refresh(context: Context) {
    appearanceStyle = AppSettingsStore.getAppearanceStyle(context)
    primary = parseColorHex(...)
    isDark = appearanceStyle.isGlass || AppSettingsStore.isDarkEffective(context)
    toneSwitchEnabled = !appearanceStyle.isGlass && AppSettingsStore.isToneSwitchEnabled(context)
    // ThemeColorPayload: advanced glass cardArgb uses AdvancedGlassSurfaceSolid (the web shell does not support frosted film, so use an opaque composite color)
}
```

- Widening `isGlass` from "retro glass only" to "any glass tier" is an **intentional design**: it lets advanced glass automatically inherit all existing glass adaptations
  (transparent page background, glass surfaces, borders, disable rules) and avoids changing 16 `isGlass` call sites one by one.
- Among the `isGlass` branches that need to be reviewed individually (16 files in total), those that hardcode `Glass*` color values (`Color.kt`, `GlassStyle.kt`,
  `GlassNavigationThemeAdapter.kt`, `MiuixSettingsTheme.kt`) get an advanced branch; purely behavioral branches (`AppShapes.kt`,
  `MainScreen.kt:142`, the system bar decision) need no change.

### 5.3 Effective Rules (same as retro glass)

- Advanced glass is always dark, disables "Appearance mode" and "Tone switch", and **keeps the tone wheel available** (the fallback color blobs follow the theme color).
- After switching back to default/retro, the previously disabled storage values take effect again as usual.

## 6. Visual System

### 6.1 Palette (new in `theme/Color.kt`, light frosted system)

| Constant | Value | Purpose |
|---|---|---|
| `AdvancedGlassSurface` | `0x24FFFFFF` | Main cards/rows: 14% white frosted film (the light glass card of the reference image; higher values wash out) |
| `AdvancedGlassSurfaceHigh` | `0x2EFFFFFF` | Input fields/rows inside dialogs/indicators: 18% white |
| `AdvancedGlassSurfaceSolid` | `0xFF2A2D33` | Opaque glass surface for the no-real-time-blur degradation path (liquid glass bottom bar fallback) |
| `AdvancedGlassNavSurface` | `0x24FFFFFF` | Floating nav bar base (14% white + real sampling + highlight + shadow) |
| `AdvancedGlassBorder` | `0x33FFFFFF` | Border upper end 20% white |
| `AdvancedGlassBorderFaint` | `0x0DFFFFFF` | Border lower end 5% white (bright top, dark bottom) |
| `AdvancedGlassSpecular` | `0x1FFFFFFF` | Top-edge highlight strip 12% white, fading downward |
| `AdvancedGlassTextSecondary` | `0xFFC7CBD2` | Secondary text (brighter than retro's `GlassTextSecondary`, readable on a light film) |
| `AdvancedGlassUnselected` | `0xFFB6BBC3` | Unselected icons/text (unselected state on a light glass bar) |
| `AdvancedGlassBgTop/Mid/Bottom` | `0xFF1B1D22 / 0xFF101216 / 0xFF07080A` | Fallback background (no cover library) base gradient |

Text reuses `GlassText/GlassTextSecondary`; no new text colors are added.

Dialog/sheet panels do not use fixed colors: `rememberAdvancedGlassPanelSurface()` **samples the page background** to generate a vertical gradient
(split the ambient base image into three equal bands by height and take the average color → darken 0.72 toward the dark base `#121418` → alpha 0.94);
when the base image is empty, the theme color + fallback background colors are used. Dialogs/sheets are separate windows and cannot sample the main window's backdrop, so this gradient is the cross-window substitute.
**The sheet gradient must be drawn on the content layer (the `LazyColumn`'s modifier)**: the sheet position is determined by an internal anchors layout offset, so attaching it to the Surface's outer modifier lands at the un-offset position (the same trap as the glass border); the handle bar uses `topColor` to continue the color seamlessly.

### 6.2 Dynamic Getter Branches (`Color.kt:80-114`)

| Constant | Default | Retro glass | Advanced glass |
|---|---|---|---|
| `PageGrey` | current | `Transparent` | `Transparent` |
| `NavWhite` | current | `GlassSurface` | `AdvancedGlassSurface` |
| `TextColor` | current | `GlassText` | `GlassText` |
| `UnselectedGrey` | current | `GlassUnselected` | `GlassUnselected` |
| `DialogItemSurface` | `PageGrey` | `GlassSurfaceHigh` | `AdvancedGlassSurfaceHigh` |

Style: refine the `AppThemeColors.isGlass ->` branch into
`isAdvancedGlass -> AdvancedXxx; isGlass -> GlassXxx`, leaving the default and retro branches untouched.

### 6.3 Cover-Collage Blur Background (independent implementation)

- `ui/common/glass/AmbientBackdrop.kt` (new):
  - Take up to 6 non-empty `coverUri` values from `quickLaunch + recentGames + games` (reusing them cyclically when there are fewer);
  - decode each cover at tile size with `inSampleSize` → center-crop proportionally and paint into a 2×3 mosaic (288×432);
  - `boxBlurArgb(radius = 10, passes = 3)` for several rounds of box blur (reusing `ui/common/ImageBlur.kt`, consistent on all APIs);
  - the resulting `ImageBitmap` is written into the global snapshot via `AppThemeColors.updateAmbientBackdrop`, with a single-entry cache to avoid repeated decoding/blurring;
  - `rememberAmbientBackdrop(coverUris, enabled)` generates on a background thread and clears when `enabled = false` (not advanced glass).
- `advancedGlassPageBackground` in `theme/AdvancedGlassStyle.kt`: the base image cover-scaled to fill + 48% black darkening
  + vignette (transparent within a 55% radius from the center → 35% black at the edges); without a base image it degrades to three theme-color soft blobs + vignette.
- The base image is rebuilt only once when the cover set changes, drawn as a single `drawImage` (`FilterQuality.Low`), with zero per-frame pipeline cost.
- Secondary pages (`AppScreenScaffold`) share the same snapshot base image as the main screen; when the process restores directly into a secondary page it has not been generated yet, so it degrades to the fallback color blobs.

### 6.4 Surfaces, Borders and Highlights (independent implementation; retro code unchanged)

Component glass is unified into the same optical combination as the floating default nav bar: 14% white frosted film + gradient border + top-edge highlight + soft shadow.

- `theme/AdvancedGlassStyle.kt` (new):
  - `advancedGlassBorder`: an **additive light-receiving inner border** (an equivalent of the nav bar's `Highlight.Default`: a 45° white gradient, 30% on the lit side → 5% on the backlit side,
    `BlendMode.Plus`, border stroked at ×2 then clipped inside the shape so only the inner half shows) + a vertical gradient hairline border
    (top `AdvancedGlassBorder` → bottom `AdvancedGlassBorderFaint`) + a top-edge highlight strip
    ([AdvancedGlassSpecular] fading downward over 22% of the height); `GlassStyle.glassBorder` **forwards it in one line** for the advanced tier,
    leaving about 33 call sites untouched; the retro branch code stays exactly as is;
  - `glassShadow`: a soft shadow equivalent to the nav bar's `Shadow.Default` (BlurMaskFilter draws an offset silhouette +
    an even-odd difference punches out the shape's interior so the translucent film is not darkened by the shadow); no-op for default/retro;
    it must be attached **before the component's background** (or on component chains such as Card/MiuixCard where the background is internal);
  - `advancedGlassPageBackground`: see §6.3.
- Components that get the shadow: all MiuixCard/Card page cards, the quick-launch card, game cover cards, the cover search dialog,
  the unified dialog, the crop dialog, the search box capsule, and the floating default nav bar's degradation path; list rows (AppNavItem) do not get it, to avoid list noise.
- Corner radius follows `AppShapes.kt` 32dp; no new exemption is introduced.

## 7. Component Change List

### 7.1 Zero-Change Automatic Inheritance (no code changes)

`AppNavItem` / `AppAlertDialog` / `AppSearchField` / `GameActionsSheet` / `GameCard` / the MiuixCards on each page, etc.
all reference the dynamic getters and `glassBorder`, so under advanced glass they automatically change color and border (as long as the getter branches in §6.2/§6.4 are done).

### 7.2 Advanced-Glass-Specific Branches (P0)

| Location | Change |
|---|---|
| `theme/AppThemeColors.kt` | `appearanceStyle` snapshot + `isAdvancedGlass` + `ambientBackdrop` snapshot + payload |
| `theme/Color.kt` | the §6.1 light frosted palette + the five getter branches in §6.2 (retro branches untouched) |
| `theme/AdvancedGlassStyle.kt` (new) | independent implementation: `advancedGlassBorder` + `glassSpecular` + `advancedGlassPageBackground` |
| `theme/GlassStyle.kt` (restored) | the retro drawing code restored to its pre-change state; only `GlassBackground` and `glassBorder` each gain one advanced dispatch line |
| `ui/common/glass/AmbientBackdrop.kt` (new) | cover collage + box blur + `rememberAmbientBackdrop` + single-entry cache |
| `theme/MiuixSettingsTheme.kt` | refine the glass branch of the scheme mapping so the advanced tier uses `AdvancedGlass*` |
| `ui/common/AppScreen.kt:33` | system bar decision switches to `AppearanceStyle.isGlass` (advanced included automatically) |
| `ui/settings/AppSettingsActivity.kt` | three-way dropdown (see §9) |

### 7.3 Real-Sampling Enhancement (P1, only API 31+ and when backdrop is available)

| Location | Change |
|---|---|
| `MainScreen.kt` floating default nav bar | the advanced branch switches to `drawBackdrop(vibrancy() + blur(18dp), highlight = null, Shadow.Default(alpha=.85f), onDrawSurface = AdvancedGlassNavSurface)`—light glass + shadow, reproducing the floating glass button in the image; the border is drawn uniformly by `glassBorder`'s light-receiving inner border (same style and brightness as page components); `remember` reuses the Modifier to avoid rebuilding the pipeline per frame |
| `MainScreen.kt` background sampling layer | advanced glass draws `advancedGlassPageBackground` into the sampled content so the floating bar can sample the blurred base image |
| `LiquidGlassNavigation.kt` | under advanced glass the surface uses a white tint, alpha `0.55 → 0.42`, `Highlight` alpha `0.85 → 1.0` |
| `GlassNavigationThemeAdapter.kt` | `surfaceTint` uses white for the advanced tier, `fallbackSurface` → `AdvancedGlassSurfaceSolid` |
| Other elements | **not done** (blur pipelines for cards/grids cost a lot and add little visually) |

### 7.4 Dialogs/Sheets (separate window, cannot sample)

For cross-window components such as `AppAlertDialog`, `GameActionsSheet`, `GameShortcutCropDialog`: the panel
base color is generated by `rememberAdvancedGlassPanelSurface()` from the page background as a vertical gradient, the border follows `glassBorder`'s advanced gradient,
and `glassSpecular` adds the top-edge highlight; the scrim is slightly deepened (0.6 for dialogs/sheets/crop dialog).
State explicitly in the plan and in AGENTS.md the boundary that "dialogs do not take part in real sampling; the look relies on film + optical edge", so later changes do not mistakenly convert them to sampling.

## 8. Nav Bar Interaction Matrix

| Appearance style \ Nav style | Default | Liquid glass · Classic | Liquid glass · Lens |
|---|---|---|---|
| Default | current | current (16dp capsule glass bar) | current (three-layer sampling + refraction) |
| Retro glass | floating rounded glass bar (current) | surface alpha 0.55 | current (the lens picks its own color; appearance is not distinguished) |
| Advanced glass | floating bar upgraded to light real glass (`drawBackdrop` + shadow + the same light-receiving inner border as components) | white tint + alpha 0.42 + a stronger Highlight | current (already top-tier; only the palette follows the dark branch of isDark) |

Principle: appearance style only adjusts "material parameters" and never changes the user's nav style choice; the lens tier's existing measured parameters (`GlassBottomBarSpec`) are untouched.

## 9. Settings Page and Three Languages

### 9.1 Three-Way Dropdown (`AppSettingsActivity.kt:164-179`)

```kotlin
val appearanceStyles = AppearanceStyle.entries   // DEFAULT / RETRO_GLASS / ADVANCED_GLASS
OverlayDropdownPreference(
    title = stringResource(R.string.settings_appearance_style),
    items = appearanceStyles.map { stringResource(it.labelRes) },
    selectedIndex = appearanceStyles.indexOf(AppThemeColors.appearanceStyle),
    onSelectedIndexChange = { index ->
        AppSettingsStore.setAppearanceStyle(ctx, appearanceStyles[index])
        AppThemeColors.refresh(ctx)
    },
)
```

- The advanced glass item may carry a `summary` (optional): real-time blur on Android 12 and above.
- The disable logic for appearance mode/tone switch follows `enabled = !glass` (`glass = isGlass`, i.e. any glass tier).

### 9.2 Three Languages (key table)

| key | zh | ja | en |
|---|---|---|---|
| `settings_appearance_style` | 外观风格 | 外観スタイル | Appearance style |
| `settings_appearance_style_default` | 默认 | デフォルト | Default |
| `settings_appearance_style_glass` | **复古玻璃**(changed) | **レトロガラス**(changed) | **Retro glass**(changed) |
| `settings_appearance_style_advanced_glass` (new) | 高级玻璃 | プレミアムガラス | Advanced glass |
| `settings_appearance_style_advanced_glass_desc` (new, optional) | Android 12 及以上获得实时模糊 | Android 12 以上でリアルタイムぼかし | Real-time blur on Android 12+ |
| `settings_disabled_in_glass_style` | **玻璃外观风格下不可用**(changed) | **ガラス外観スタイルでは使用できません**(changed) | **Unavailable in glass appearance styles**(changed) |

### 9.3 Impact of the Rename

- **Only display text and comments change**; the storage value `glass`, the prefs key, and the `isGlass` identifier all stay as they are → existing users automatically
  see "Retro glass" after upgrading, with zero migration of both visuals and settings.
- Documentation sync (§12): add a one-line rename note at the top of the old plan `docs/glass-style-theme-plan.md` rather than rewriting the whole document.

## 10. Degradation, Performance and Boundaries

- **API 31+**: cover-blurred base image + light frosted film + real sampling for the floating bar (`RenderEffect`).
- **API < 31**: base-image blur does not depend on `RenderEffect` (box blur, same look), and the film and border are complete;
  only the floating bar falls back to a light semi-transparent film; the option is not hidden and no toast is shown.
- **Performance budget**: the base image is rebuilt once in the background only when the cover set changes (288×432 decode + blur, single-entry cache);
  drawing is one `drawImage` + two `drawRect`; the advanced tier of `glassBorder` is a gradient brush border;
  real sampling adds only one floating-bar pipeline, and only under advanced + API31+.
- **Readability**: the base image is overlaid with 58% black + a vignette, with body text in `GlassText`; dialogs/sheets use a background-sampled gradient (darkened 0.58, alpha 0.94) + a 0.6 scrim, so lists and inputs stay readable while retaining a little background translucency.
- **Zero regression**: the retro glass drawing code has been restored to its pre-change state; all advanced branches are gated by `isAdvancedGlass`.

## 11. Implementation Steps

- **P0 Foundation (independently acceptable)**
  1. `AppearanceStyle` enum + three-value get/set in `AppSettingsStore` (unknown values normalize to default);
  2. `AppThemeColors` snapshot/derivation + `ambientBackdrop` + payload;
  3. `Color.kt` light frosted palette and getter branches; `MiuixSettingsTheme.kt` scheme refinement;
  4. `AdvancedGlassStyle.kt` (independent border/highlight/background implementation) + `AmbientBackdrop.kt` (cover collage blur);
     `GlassStyle.kt` restored + one-line dispatch;
  5. settings page three-way choice + three-language text (including the retro glass rename).
- **P1 Material Enhancement**
  6. upgrade the floating default nav bar to light `drawBackdrop`; `LiquidGlassNavigation` advanced parameters; `GlassNavigationThemeAdapter` colors;
  7. dialog panel highlight (`glassSpecular`), scrim deepening, and panel color verification.
- **P2 Optional**
  8. slow drift animation for the base image;
  9. promote the host backdrop to secondary pages (add `rememberLayerBackdrop` to `AppScreenScaffold`, leaving room for real sampling of future in-page overlays).
- **Documentation**
  10. `CONTEXT.md` terminology update (three appearance-style values, the new advanced glass, the lens _Avoid_ revision);
      `AGENTS.md:149-152/391-395` glass standard update; rename note in the old plan document.

## 12. Testing and Verification

- Add `app/src/test/java/com/tyranor/next/core/settings/AppearanceStyleTest.kt` (referencing the existing `NavStyleNormalizationTest.kt`):
  - `fromStorage("glass") == RETRO_GLASS`, `"glass_advanced" == ADVANCED_GLASS`, `null/""/unknown == DEFAULT`;
  - a `storageValue` stability assertion (to prevent later accidental value changes from losing existing data).
- Build and static checks: `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest :app:checkHardcodedUiStrings`.
- Manual regression matrix: default/retro glass/advanced glass × the four tabs × secondary pages × dialogs/sheets × API 30 / API 31+ / API 33+ emulators.

## 13. Acceptance Criteria

- [ ] Settings → App settings shows "Appearance style = Default / Retro glass / Advanced glass"; switching takes effect immediately and persists across restarts.
- [ ] Existing `glass` users see "Retro glass" after upgrading, with the look pixel-identical to before the change (spot-check home/game/engine/settings).
- [ ] Advanced glass: the background is a colorful blurred collage of covers (soft theme-color blobs when the library has no covers) + darkening + a four-corner vignette.
- [ ] Advanced glass: cards are a light frosted film (14% white) + bright-top/dark-bottom border + top-edge highlight; dialog panels get the highlight.
- [ ] Advanced glass + default navigation (API 31+): the floating bar is light real blur glass + highlight + shadow; on API 30 it falls back to a light semi-transparent film without crashing.
- [ ] Under advanced glass, appearance mode and tone switch remain greyed out; the tone wheel is available (the fallback color blobs change with it).
- [ ] Dialogs/sheets under advanced glass are "page-background-sampled gradient + scrim + highlight edge", with colors that follow the cover base image, are neither grey nor black, and show no anomalous text bleed-through.
- [ ] All three languages have complete strings, and `checkHardcodedUiStrings` / `testDebugUnitTest` / `compileDebugKotlin` pass.

## 14. Risks and Rollback

| Risk | Mitigation |
|---|---|
| The cover-collage base image looks muddy with monochrome/dark covers | Use up to 6 covers to increase color variety; 48% darkening + vignette ensure separation; sample 3 different libraries during acceptance |
| Cover decode failure / no covers in the library | Tiles keep a base color; a total failure returns null and degrades to soft theme-color blobs; all decoding is wrapped in runCatching |
| Base-image memory footprint | 288×432 ARGB ≈ 0.5MB, single-entry cache; cleared when leaving advanced glass (`clearAmbientBackdropCache`) |
| After widening `isGlass` semantics, some branches are unsuitable for advanced glass | Review the 16 call sites listed in §5.2 one by one; add branches for color-value cases, leave behavioral ones alone |
| Insufficient text contrast on the light frosted film over bright cover areas | Uniformly darken the base image 58% + vignette; dialogs/sheets use an 80%-opacity grey glass film + 0.6 scrim; tune alpha per element if necessary |
| Gradient border misplaced on Miuix squircles | Follow the established retro-glass conclusion (indistinguishable at 32dp); if it misbehaves, keep a solid border + only the top-edge highlight |
| The floating bar's `drawBackdrop` crashes on some ROMs (AGSL probing) | Reuse the `GlassShaderSupport` probing and fallback logic; on failure fall back to the light semi-transparent film |
| The rename affects user perception | Text only: settings option, disable note, docs; storage/behavior unchanged |
| Rollback | New values normalize to default when unknown; all advanced branches are gated by `isAdvancedGlass`, so deleting the advanced files and the two dispatch points returns to the retro/default two-tier state |

## 15. Open Questions (resolved per the suggestions)

1. Background image source: **game cover collage blur** (confirmed); fallback is soft theme-color blobs.
2. Whether the color blobs/base image bind to the theme color: the fallback blobs bind to the theme color; when covers exist, the cover colors take precedence.
3. The Japanese name `プレミアムガラス` is adopted.
4. Base-image drift animation: not in this version.
5. Under advanced glass only appearance mode/tone switch are greyed out; no other items are hidden.
6. The user's nav style choice is never changed automatically.

## 16. Implementation Record (v2, landed)

P0 and P1 are implemented; P2 (base-image drift animation, promoting backdrop to secondary pages) remains optional and unimplemented.

| File | Change |
|---|---|
| `core/settings/AppearanceStyle.kt` (new) | three-tier enum + `isGlass`/`isAdvancedGlass` + `fromStorage` normalization |
| `core/settings/AppSettingsStore.kt` | two constants deleted; `get/setAppearanceStyle` take and return the enum (unknown values fall back to default) |
| `theme/AppThemeColors.kt` | `appearanceStyle` snapshot; `isGlass` changed to a derived getter (semantics = any glass tier) + `isAdvancedGlass`; `ambientBackdrop` snapshot + `updateAmbientBackdrop`; advanced branch in the payload |
| `theme/Color.kt` | light frosted palette (14% white film at the same tier as the nav bar, bright-top/dark-bottom border, top-edge highlight, fallback gradient); advanced branches for `NavWhite`/`DialogItemSurface`/`UnselectedGrey` (retro branches untouched) |
| `theme/AdvancedGlassStyle.kt` (new) | **independent implementation**: `advancedGlassBorder`, `glassSpecular`, `advancedGlassPageBackground` (base image cover-filled + darkened + vignette / fallback blobs) |
| `theme/GlassStyle.kt` (restored) | the retro drawing code restored to its pre-change state; only `GlassBackground` and `glassBorder` each gain one advanced dispatch line |
| `ui/common/glass/AmbientBackdrop.kt` (new) | cover decode → 2×3 collage → multiple rounds of `boxBlurArgb` → `ImageBitmap`; `rememberAmbientBackdrop` + single-entry cache + `clearAmbientBackdropCache` |
| `theme/MiuixSettingsTheme.kt` | glass branch refined: advanced glass uses `AdvancedGlassSurfaceHigh`/`AdvancedGlassBorder` |
| `ui/settings/AppSettingsActivity.kt` | appearance style three-way choice (enum-driven) + advanced glass description summary |
| `ui/common/AppScreen.kt` | system bar decision switches to `AppearanceStyle.isGlass` (advanced included automatically) |
| `ui/main/MainScreen.kt` | generate/write the cover-collage base image; the sampling layer includes the advanced background; floating bar `drawBackdrop` (light glass + vibrancy + blur 18dp + Shadow, highlight set to null and the border left to `glassBorder`, `remember` reuses the Modifier) |
| `ui/common/LiquidGlassNavigation.kt` | advanced glass: white tint, surface alpha 0.55→0.42, Highlight alpha 0.85→1.0 |
| `ui/common/glass/GlassNavigationThemeAdapter.kt` | `surfaceTint` uses white for the advanced tier + advanced branch for `fallbackSurface` + remember key |
| `ui/common/AppAlertDialog.kt` | advanced panel branch (background-sampled gradient) + `glassSpecular` + 0.6 scrim for the advanced tier |
| `ui/game/GameScreen.kt` | sheet panel (background-sampled gradient)/rows/top-edge line, advanced branches for the cover search dialog panel + dialog highlight + 0.6 scrim |
| `ui/game/GameShortcutCropDialog.kt` | advanced panel color branch + `glassSpecular` |
| `ui/home/HomeScreen.kt` | advanced branch for the swipe-to-delete layer |
| `ui/engine/EngineScreen.kt` | advanced branch for the `GlassTabRow` indicator |
| `res/values{,-en,-ja}/strings.xml` | "Glass" → "Retro glass"; new advanced glass name and description; the disable note now says "glass appearance styles" |
| `app/src/test/.../AppearanceStyleTest.kt` (new) | three-state normalization + glass-family detection + persisted-value stability |
| `CONTEXT.md` / `AGENTS.md` | terminology and standards synced (advanced glass = cover collage blurred base + light frosted film); the lens tier's `_Avoid_` drops "Advanced glass" and uses "Enhanced glass" instead |
| `docs/glass-style-theme-plan.md` | added a rename note at the top |

Verification: `:app:compileDebugKotlin`, `:app:testDebugUnitTest`, and `:app:checkHardcodedUiStrings` all pass
(visual acceptance items are in §13 and require a device/emulator).

### 16.1 v1 Review Fixes (kept)

| Issue | Fix |
|---|---|
| The floating default nav bar's inline `drawBackdrop` rebuilt the RenderEffect pipeline every frame during tab animations (ShapeProvider/lambda compared as unequal) | Changed to `remember(backdrop, density)` to reuse the same Modifier (`MainScreen.kt`) |
| `glassSpecular` was overlaid on top of content, and a too-high white ratio greyed out titles/cropped preview images | Default `heightFraction` set to 0.22, with the drawing layer documented in the KDoc |
| The `advanced` default parameter of `glassPageBackground` was easy to misuse | The advanced background was split into its own function (v2); the retro function is no longer parameterized |
| The `AdvancedGlassNavSurface` value in the docs did not match the implementation | Docs and implementation aligned (v2 uses `0x33FFFFFF`, light glass) |

### 16.2 Why v2 Was Corrected

The initial version (v1) made advanced glass a recolored variant of retro glass (`glassPageBackground(accent, advanced)` synthesized blobs +
a 70% dark film), which did not match the reference image's "heavily blurred real image + light frosted card". v2 instead: retro code restored,
advanced glass implemented in its own file, the background changed to a cover-collage blurred bitmap, and cards changed to a light frosted film.

### 16.3 v2 Review Fixes (independent agent re-review)

| Issue | Fix |
|---|---|
| Light frosted film + white text lacked contrast over bright cover areas | Base-image darkening 48% → 58%, vignette 35% → 40%; added `AdvancedGlassTextSecondary`/`AdvancedGlassUnselected` (brighter secondary text and unselected state), used by the Miuix scheme and the advanced branch of `UnselectedGrey` |
| The floating bar's `remember` did not include `advancedGlass`, so switching retro→advanced live kept the already-fixed retro monochrome border | `remember(backdrop, density, advancedGlass)` |
| `Highlight.Default.copy(alpha = 1f)` was redundant | Simplified to `Highlight.Default` |
| Comments/docs still contained v1 descriptions (blob background, constant names, payload color) | Synced `AppearanceStyle.kt`, `LiquidGlassNavigation.kt`, and plan §1/§5/§6.1/§16 |

Review confirmation: retro zero regression (`GlassStyle.kt` has only KDoc + the two dispatch points), base-image lifecycle/thread safety/failure paths correct,
MainScreen gating and sampling source correct, dialog separate-window boundary correct, compilation and unit tests pass.

### 16.4 Dialogs/Sheets Changed to a Light Glass Film (user feedback)

User feedback: the panels of the game launch sheet and the unified dialog are black; they should use the page background. Fix:
`AdvancedGlassPanel` changed from 85% dark to a **20% white light glass film**—although a separate window cannot sample the main window's backdrop,
the dialog/sheet window itself is transparent, so the light film can let the scrim-darkened page background through directly (the same look as the reference image's cards);
the scrims were deepened accordingly to guarantee readability: `AppAlertDialog` 0.7, sheet 0.7, cover search dialog 0.7,
`GameShortcutCropDialog` gained a 0.7 scrim, and Miuix `windowDimming` 0.7.
Sheet rows changed from the opaque `AdvancedGlassSurfaceSolid` to `AdvancedGlassSurfaceHigh` (20% white);
`AdvancedGlassPanelSolid` was deleted (no longer needed). Retro glass's dark panel is unchanged (its page background is a dark gradient,
so the dark panel is the established design).

### 16.5 Panel Opacity Revised (user feedback)

User feedback: the 20% white light glass film is **too transparent**; sheet/dialog content blends into the background. Fix:
`AdvancedGlassPanel` changed to **80% opacity neutral grey (`0xCC4A4E56`)**—retaining roughly 20% page-background translucency,
but solid enough overall that white body text and secondary text return to a safe contrast range (panel ≈ 8:1, rows inside a panel ≈ 5:1);
the scrim accordingly returns to 0.6 (the 0.7 compensation is no longer needed). Sheet rows still use `AdvancedGlassSurfaceHigh` (20% white),
appearing as slightly brighter glass cards on the grey panel.

### 16.6 Panels Changed to a Page-Background-Sampled Gradient (user feedback)

User feedback: do not render grey glass; sample colors from the page background for the gradient. Fix:
delete the fixed grey `AdvancedGlassPanel` and add `rememberAdvancedGlassPanelBrush()` (`theme/AdvancedGlassStyle.kt`)—
split the ambient base image into three equal bands by height and take the average color, darken 0.58 toward the dark base `#121418`, and use alpha 0.94 to produce a vertical gradient;
when the base image is empty, use the theme color + fallback background colors. Four panels adopt that gradient:
`AppAlertDialog` / `GameShortcutCropDialog` (transparent Card container + modifier draws the gradient),
the cover search dialog (replacing its original background color), and the game launch sheet (the `ModalBottomSheet`'s modifier draws the gradient + transparent container;
the Material3 1.4.0 source was checked: the passed modifier comes before the Surface's own background, including the handle area).
Sheet rows remain `AdvancedGlassSurfaceHigh` (20% white).

### 16.7 Sheet Base Color Misplacement Fixed (user feedback screenshot)

A real-device screenshot showed the lower half of the sheet revealing the page and the base color drawn in the upper part of the screen. Cause: the sheet position is determined by Material3's internal
`draggableAnchors` layout offset, so a background attached to the `ModalBottomSheet`'s outer modifier is drawn at the **un-offset**
layout position (the same trap as the project's earlier "glass border misplacement"). Fix:
- the sheet's sampled-color gradient is drawn on the content layer (the `LazyColumn`'s modifier) so it moves with the sheet offset;
- the handle bar is filled with `AdvancedGlassPanelSurface.topColor` (the gradient's top color) to blend seamlessly with the content-layer gradient;
- `containerColor` stays transparent; `AdvancedGlassPanelSurface` is upgraded from `rememberAdvancedGlassPanelBrush()`
  (returning brush + topColor), and the dialog side switches to `.brush`.
At the same time the sampled-color darkening ratio was raised from 0.58 to 0.68 to guarantee white body text contrast (the panel no longer turns washed out after sampling a light cover).

### 16.8 Component Glass Aligned with the Floating Default Nav Bar (user feedback)

User feedback: the glass effect of UI components should match the advanced glass default nav bar. The nav bar material = real sampling blur + vibrancy
+ Highlight + Shadow + 20% white film + gradient border; components, being inside the recorded content layer, cannot sample themselves
(the background is already a blurred image, so blurring again makes no visual difference), so they are aligned on the **optical combination**:
- frosted film `AdvancedGlassSurface` 15% → **20% white** (same tier as `AdvancedGlassNavSurface`);
- the top-edge highlight folded into `advancedGlassBorder` (the standalone `glassSpecular` deleted), so all 33 `glassBorder`
  call sites automatically get the nav bar's Highlight;
- added `Modifier.glassShadow()` (the equivalent of the nav bar's `Shadow.Default`: BlurMaskFilter + punching out the shape interior),
  attached to all MiuixCard/Card page cards, the quick-launch card, game cover cards, the three dialogs, the search box, and the floating bar's degradation path;
  list rows do not get it, to avoid scroll noise and shadow cost; dialogs/sheets are separate windows and do not take backdrop sampling (they keep the sampled-color gradient panel).

### 16.9 Components Gain the Nav Bar's "Light-Receiving Inner Border" (user feedback)

User feedback: the nav bar has a border layer, the components do not. After deeper analysis it was confirmed that the nav bar edge is **two layers** stacked:
1. `drawBackdrop(highlight = Highlight.Default)`—the library's additive light-receiving inner border: white 50%, `BlendMode.Plus`,
   width 0.5dp, stroked wider then clipped inside the shape so only the inner half shows; API 33+ uses a directional AGSL shader (45°/falloff),
   31–32 uses the BlurMaskFilter fallback;
2. `.glassBorder()`—our gradient hairline + top-edge highlight.

Components previously had only layer 2: the white hairline was 35%→12% normal blending, extremely weak against a light blurred base image, so it looked like "no border".
Components cannot reuse the library's Highlight directly (it must be paired with `drawBackdrop` sampling, while components inside the recorded content layer cannot sample themselves;
the background is already a blurred image, so blurring again makes no visual difference and would only add N RenderEffect pipelines).

Fix: implement layer 1 equivalently inside `advancedGlassBorder`—
a 45° diagonal white gradient (50% on the lit side → 10% on the backlit side), `BlendMode.Plus`, border width ×2 then `clipPath` into the shape
keeping only the inner half (the same approach as the library's `HighlightNode`). At the same time `glassBorder` gains a `rim: Boolean = true` parameter;
the floating default nav bar (which already has the library Highlight) passes `rim = false` to avoid doubling the brightness.
Now the edge composition of components and the nav bar is identical: additive light-receiving inner border + bright-top/dark-bottom hairline + top-edge highlight.

### 16.10 Overall Glass Darkened (user feedback)

User feedback: the glass of components and the nav bar is too white; it should be darker. Fix (only the opacity of the white film and optical white is adjusted; the structure is unchanged):
`AdvancedGlassSurface` 20% → **14%**, `AdvancedGlassSurfaceHigh` 20% → **18%**,
`AdvancedGlassNavSurface` 20% → **14%**, `AdvancedGlassSpecular` 20% → **12%**,
border 35%/12% → **30%/8%**, light-receiving inner border 50%/10% → **40%/7%**;
the darkening ratio of the dialog/sheet sampled-color panel goes 0.68 → **0.72**, darkening along with the components.

### 16.11 Border Darkened (user feedback)

User feedback: the border should be darker too. Fix: the gradient border 30%/8% → **20%/5%** white;
the additive light-receiving inner border 40%/7% → **30%/5%**. The structure is unchanged; only the whiteness is reduced.

### 16.12 Nav Bar Border Unified with Components (user feedback)

User feedback: the advanced glass default nav bar's border should match the components too (previously the nav bar used the library's `Highlight.Default`,
at a fixed 50% white, one tier brighter than the components' 30%/5% light-receiving inner border). Fix: set the floating default nav bar's `drawBackdrop`
`highlight` to `null`, and let the border go uniformly through `glassBorder` (`rim = true`, the default tier)—
now the nav bar and page components have fully identical edges: light-receiving inner border 30%/5% + gradient hairline 20%/5% + top-edge highlight 12%.
Side benefit: the library no longer constructs the `Highlight` AGSL RuntimeShader, removing one 33+ crash risk.