# Tablet Side Rail Navigation Adaptation Plan

> Goal: on tablets/large windows (sw600dp tablets or width ≥ 840dp), move the main navigation from the bottom to the side;
> the rail **takes the shape of that theme's "default navigation bar" for the current appearance style** (default = Material3 rail,
> retro glass = floating glass pillar, advanced glass = floating true glass pillar); **liquid glass · classic / lens does not participate in
> rail adaptation** and automatically falls back to the theme default shape on tablets.
> Zero regression for the bottom bar shape and small-screen behavior.

---

## 1. Decision Record

| Decision point | Conclusion |
|---|---|
| Breakpoint | `isTabletScreen()` (`ui/common/ScreenSize.kt`): `smallestScreenWidthDp ≥ 600` (tablet, including portrait) or `screenWidthDp ≥ 840` (large window); does not use `isWideScreen()` (it includes "any landscape", and landscape phones are only 360–420dp tall, making a 4-item vertical stack too cramped) |
| Toggle | The app settings gain a "tablet sidebar" toggle (`AppSettingsStore.sideRailState`, default **on**): `isSideRailLayout() = isTabletScreen() && toggle`; when off, tablets keep bottom navigation; in-memory StateFlow, toggling in the settings page takes effect immediately |
| Rail shape | Take the "default navigation bar" shape for the appearance style: default → Material3 `NavigationRail`; retro glass → floating glass pillar; advanced glass → floating true glass pillar (same optics: `drawBackdrop` vibrancy/blur + shadow + lit inner stroke) |
| Liquid glass variants | **Not adapted**: on tablets the liquid bottom bar is not rendered, falling back directly to the theme default shapes above; the settings page shows a "displayed as a side rail on tablets" hint when on a tablet and a liquid variant is selected |
| Layout | `Row { rail, content layer (weight 1f) }` — the rail occupies layout width, so pages need no new side padding; `glassNavBottomInset()` returns 0 in rail mode |
| Advanced glass sampling | The rail sits outside the content layer, so sampling the content layer would fail with out-of-bounds coordinates; MainScreen separately records the **pure background** (cover filled + dimmed + vignette) into `railBackdrop`, with coordinates sharing the window origin for the rail to sample |
| Selection animation | Extract `ui/common/NavigationTabIcon.kt` so the bottom bar and rail share the same "bottom-up fill" icon animation |
| System bars | The rail slot uses `WindowInsets.systemBars.only(Vertical + Start)` (landscape three-button navigation sits at the side, so the start inset must be avoided) |
| Switch timing | Driven by `LocalConfiguration`, switching immediately on rotation/split screen with no restart |

## 2. Structure

```
MainScreen
└── Box(fillMaxSize)                      // outer layout
    ├── [railBackdropActive] Box.fillMaxSize().layerBackdrop(railBackdrop).then(pageBackground)
    │                                      // tablets + advanced glass only: record the "pure background layer" for rail sampling
    └── if (railLayout) Row(fillMaxSize)
        │   ├── AppNavigationRail(...)     // theme default shape per appearance style, occupying layout width
        │   └── Column(weight 1f) { MainTabPages(...) }
        └── else Column(fillMaxSize)       // bottom bar shape (current state)
            ├── MainTabPages(...)
            ├── [non-glass/floating] DefaultBottomNavigationBar
            └── Box overlay: liquid classic/lens bottom bar, glass floating default bar
```

- `MainTabPages`: the four always-present pages extracted from the original `MainScreen` (a `ColumnScope` extension, including `weight(1f)`),
  shared by both layouts so pages and transitions stay exactly identical.
- `isSideRailLayout()` = the device matches `isTabletScreen()` **and** the "tablet sidebar" toggle is on.
- `AppNavigationRail` (`ui/common/AppNavigationRail.kt`):
  - Default appearance: `NavigationRail` + `NavigationRailItem` (no ripple, no selection indicator, colors aligned with the bottom bar);
  - Glass family: floating glass pillar (64dp wide, `AppComponentShape`); retro uses the solid `GlassNavSurface`,
    advanced uses `drawBackdrop` sampling `railBackdrop` (`vibrancy + blur 18dp`, highlight left empty —
    the stroke is uniformly drawn by `glassBorder`'s lit inner stroke, the same as page components) + `glassShadow` + `AdvancedGlassNavSurface`.

## 3. Padding and Page Adaptation

| Item | Handling |
|---|---|
| List bottom padding | `glassNavBottomInset()` returns 0 in rail mode (navigation occupies width at the side) |
| Side padding | Not needed: the rail occupies layout width in the `Row`, and the content area narrows automatically |
| Top bar | Each page's own `AppTopBar` narrows automatically inside the Row; no change needed |
| Game grid column count | Still 6 columns per `isWideScreen()` (the rail only takes about 88dp); if real devices look cramped, recompute later as "available width − rail width" |

## 4. Boundaries and Degradation

- Landscape phones (sw < 600 and width < 840): keep the bottom bar, behavior unchanged.
- API < 31: `drawBackdrop` for the advanced glass rail is unavailable → fall back to the `AdvancedGlassNavSurface` translucent membrane + stroke + shadow.
- The two liquid glass variants are not rendered on tablets (`liquidBottomActive = liquidGlass && !railLayout`),
  and the lens AGSL detection and fallback logic is unaffected (it still only applies on the bottom bar path).
- Rotation/split screen triggers a `LocalConfiguration` change → immediate rail ↔ bottom bar switch; page state (`selectedIndex`) is preserved.

## 5. Implementation Record

| File | Change |
|---|---|
| `ui/common/ScreenSize.kt` | Add `isTabletScreen()` (device check) and `isSideRailLayout()` (device + toggle) |
| `core/settings/AppSettingsStore.kt` | Add `KEY_SIDE_RAIL`, `DEFAULT_SIDE_RAIL_ENABLED = true`, the `sideRailState` StateFlow and get/set/init |
| `ui/settings/AppSettingsActivity.kt` | Add a "tablet sidebar" SwitchPreference (default on) + initialization read |
| `ui/common/NavigationTabIcon.kt` (new) | Extract the selected-state icon fill animation from the bottom bar, shared by bottom bar and rail |
| `ui/common/AppNavigationRail.kt` (new) | Material3 rail + glass floating pillar (retro/advanced), with the advanced one sampling `railBackdrop` |
| `ui/main/MainScreen.kt` | Add `railLayout`/`liquidBottomActive`/`glassRail`/`railBackdropActive` decisions; `Row` rail layout; extract `MainTabPages`; split `bottomBackdropActive`; switch bottom bar icons to `NavigationTabIcon` |
| `ui/common/LiquidGlassNavigation.kt` | `glassNavBottomInset()` returns 0 in rail mode |
| `ui/settings/AppSettingsActivity.kt` | When on a tablet with a liquid variant selected, the summary hints "displayed as a side rail on tablets" |
| `res/values{,-en,-ja}/strings.xml` | Add `settings_nav_bar_desc_rail` |

Verification: `:app:compileDebugKotlin`, `:app:testDebugUnitTest`, `:app:checkHardcodedUiStrings`, `:app:assembleDebug` pass.

## 6. On-Device Fixes

| Problem | Cause | Fix |
|---|---|---|
| On tablets the three quick-launch cards at the top of the home page do not fill the width | The large-screen branch of `QuickLaunchSection` set a `widthIn(max = 900.dp)` cap on the three-card row and centered it, leaving gaps on both sides on tablets (available width still > 900dp after removing the rail) | Remove the 900dp cap and use `Modifier.fillMaxWidth()`; the cover inside the card already has a 99dp cap and the text column adapts, so widening does not squeeze content |

## 7. Tablet Sidebar Toggle (user feedback)

User request: add a settings toggle for the tablet side rail; become a rail only when enabled, keep the bottom when disabled, default on.
- Storage: `AppSettingsStore.KEY_SIDE_RAIL` (default `true`) + in-memory `sideRailState` (the main screen recomposes immediately after toggling in the settings page);
- Decision: `isSideRailLayout() = isTabletScreen() && sideRailState` — the main screen layout, `glassNavBottomInset()` and the
  settings page's "displayed as a side rail on tablets" hint share the same decision;
- Setting item: the app settings page's "tablet sidebar" toggle (`settings_side_rail` + `settings_side_rail_summary`, three languages),
  placed after the navigation bar style card;
- Initialization: the main screen and the settings page each call `initSideRail(ctx)` (so when a process recreation lands directly on the settings page, the toggle shows the real on-disk value).