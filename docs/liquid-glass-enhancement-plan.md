# Liquid Glass Enhancement Plan

> Goal: add a new dropdown item to app settings, **Navigation bar style**, with three choices — Default / **Liquid glass · Classic** /
> **Liquid glass · Lens** (the latter is the high-fidelity implementation of this plan: three-layer sampling + refractive lens + press-and-drag, offered only on
> Android 13+; on lower versions it is normalized to the Classic option). Choosing "Default" leaves the screen exactly as before the change; choosing "Classic" only adds
> one hairline stroke in the light variant (see §6 D25), while all other behavior and visuals of the two variants stay unchanged.
>
> Basis: "Tyranor-Next: Liquid Glass Bottom Bar Comparison and High-Fidelity Implementation Plan" v1.1 (hereafter "the analysis report"; see §3.1).
> Implementation base: Tyranor-Next `origin/main` @ `4fc7042` (the branch has been rebased onto that commit) (the analysis report's verification baseline was `0f49e38`;
> upstream has since merged rounded-corner constant unification, glass top bar fixes and refactors, Ren'Py module settings, PSP / Switch entries and engine page categories;
> this plan has been rebased onto the latest base).

---

## 1. Decision Record

| Decision point | Outcome |
|---|---|
| New option placement | Merged with the ordinary option into **one dropdown item**, "Navigation bar style": Default / Liquid glass · Classic / Liquid glass · Lens, choose one of three |
| Visibility rule | **Devices below Android 13 are not offered the "Liquid glass · Lens" option** (it does not appear in the list); even if data is restored from a newer backup, reading it normalizes to "Liquid glass · Classic" |
| Default value | The default option (`default`). The default visuals are exactly identical to before the change |
| Activation condition | `nav_style == liquid_glass_enhanced` (any appearance style; normalized to `liquid_glass` below Android 13) |
| Implementation route | Report route **B**: reuse the project's existing Backdrop **1.0.2** (which already includes `lens` / `CombinedBackdrop` / `InnerShadow`), and **independently implement** the design baseline's optical parameters and interaction design (see §3.1 Copyright and implementation approach) |
| Outline | A capsule (`RoundedCornerShape(50%)`) replaces the capsule library's `ContinuousCapsule` (see §6 difference D1) |
| Four-item adaptation | Keep Tyranor's four business items; on phones center and narrow to the reference single-slot width of 76dp, on tablets/landscape (≥600dp) stretch to fill, consistent with the original liquid glass navigation (see §6 D18) |
| Cancel semantics | **Cancel does not commit**; return to the currently selected item (report §8.1 "Production recommendation", different from the design baseline, see §6 difference D3) |
| Host transition | **Only the Lens variant** accepts a new target during a transition (redirect); the default path keeps the original `isRunning` guard (report §8.7) |
| Haptics | **New haptic feedback added** (the design baseline has no such call; requested by the user, see §6 D16), using `performHapticFeedback`; not triggered without a motor |
| Chromatic dispersion | **Enabled** (early on it was set to "not added" per report §6.2, later changed to enabled after real-device testing: the bar carries a continuous rainbow band along the top and bottom edges, the slider carries colored edges when overlaying icons; the light variant additionally gets a 1.4× boost, see §6 D28) |

## 2. Toggle Model

### 2.1 `core/settings/AppSettingsStore.kt`

| Item | Content |
|---|---|
| key | `nav_style` (String, separate `app_settings` prefs), three-state values |
| Values | `default` (Material3 navigation bar) / `liquid_glass` (liquid glass) / `liquid_glass_enhanced` (liquid glass · lens) |
| In-memory state | `navStyleState: MutableStateFlow<String>` (defaults to `default`) |
| Read | `getNavStyle(c)`; `initNavStyle(c)` loads on first composition (idempotent) |
| Write | `setNavStyle(c, style)` (normalizes first, then persists and broadcasts) |
| Normalization | `normalizeNavStyle(stored, enhancedSupported)`: unknown values → `default`; the Lens variant below Android 13 → `liquid_glass` (pure function, unit-tested) |
| Migration | An early implementation stored the Lens variant as a separate boolean `liquid_glass_enhance`; `initNavStyle` upgrades it once to `liquid_glass_enhanced` and deletes the old key |

A single item with three states replaces the "parent toggle + child toggle": there is no hidden state where
"the parent is off but the child is still true", so no reset semantics are needed; legacy data is covered by the migration function.

**The summary text keeps only the "Android version note"**: the summary below the dropdown no longer describes the interface form; it only states the version
requirement for the options that need one (Classic requires Android 12+, Lens requires Android 13+); the Default option has no summary, keeping the UI concise.

### 2.2 Settings page `ui/settings/AppSettingsActivity.kt`

```kotlin
OverlayDropdownPreference(               // non-boolean choice, use a dropdown rather than a switch per AGENTS.md
    title = stringResource(R.string.settings_nav_bar_title),   // bottom navigation bar
    summary = <summary for the current option>,
    items = listOf(Default, Liquid glass · Classic, [Liquid glass · Lens]),            // the Lens item only appears on Android 13+
    selectedIndex = navStyleIndex,
    onSelectedIndexChange = { AppSettingsStore.setNavStyle(ctx, style) },
)
```

Strings (Chinese / English / Japanese all present):

| key | Simplified Chinese | English | Japanese |
|---|---|---|---|
| `settings_nav_bar_title` | 导航栏样式 | Navigation bar style | ナビゲーションバーのスタイル |
| `settings_nav_bar_default` | 默认 | Default | デフォルト |
| `settings_nav_bar_liquid_glass` | 液态玻璃 · 经典 | Liquid glass · Classic | リキッドグラス · クラシック |
| `settings_nav_bar_liquid_glass_enhanced` | 液态玻璃 · 透镜 | Liquid glass · Lens | リキッドグラス · レンズ |
| `settings_nav_bar_desc_liquid_glass` | Android 12 及以上生效 | Effective on Android 12 and above | Android 12 以上で有効 |
| `settings_nav_bar_desc_enhanced` | 仅 Android 13 及以上支持 | Android 13 and above only | Android 13 以上のみ対応 |

## 3. Implementation Structure

### 3.1 New Files

| Path (relative to `app/src/main/java/com/tyranor/next/`) | Responsibility | Source / notes |
|---|---|---|
| `ui/common/glass/GlassBottomBarSpec.kt` | Optics / motion / sizing parameter contract + platform capability flags | Independent implementation; values taken from report §6.3 |
| `ui/common/glass/GlassBottomBarColors.kt` | Glass color contract (independent of the optical parameters) | Independent implementation (architecture requirement of report §8.9) |
| `ui/common/glass/GlassNavigationThemeAdapter.kt` | The **single** entry point for theme → glass color | Independent implementation (placement rationale in §6 difference D2) |
| `ui/common/glass/GlassBottomBarGesture.kt` | Whole-bar press recognizer: DOWN triggers the callback, reports absolute coordinates, first pointer takes exclusive ownership, only counts as a drag once accumulated movement exceeds the platform slop, exactly one terminal state, **exclusively consumes** pointer events (read the position first, then `consume`; if already consumed upstream, switch to cancel) | Independent implementation |
| `ui/common/glass/LensMotionController.kt` | **Five** hand-written springs for position / pressure / volume (width·height) / glow, plus an input state machine (Idle / PressJump / PressedTracking / Settling) | Independent implementation |
| `ui/common/glass/PressGlowHighlight.kt` | Press glow (AGSL radial falloff, API 33+) | Independent implementation |
| `ui/common/glass/GlassShaderSupport.kt` | AGSL (`RuntimeShader`) **runtime** availability probing + circuit breaker: available only if 3 candidate programs all pass, otherwise the Lens variant falls back to Classic (the fallback path itself no longer depends on AGSL) | Independent implementation (see §6 D33) |
| `ui/common/glass/EnhancedLiquidGlassNavigation.kt` | Three-layer sampling bar: visible bar / sampling copy / moving lens | Independent implementation |

**Copyright and implementation approach (important)**: this project is **GPL-2.0-only**. This style is an **independent
implementation** by this project — **no third-party code was ported line by line**, and no third-party derivative attribution is retained;
algorithms, parameter values, and render layering order are design elements not protected by copyright, and the code itself was written
and tuned by this project. **All 8 implementation files are independent implementations**:
- The gesture recognizer is implemented as a single-layer state machine;
- The motion controller was **re-architected** into "one frame loop + five hand-written spring integrators", without using `Animatable` /
  `MutatorMutex` / `snapshotFlow` / `VelocityTracker`; release snapping and material retraction are ordinary conditions inside the loop;
- The press glow's AGSL shader is a hand-written expression;
- The bar component is split into several private composables, with composition and comment structure organized by this project.

Parameters are fixed in `GlassBottomBarSpec` after **on-device tuning** within this project (geometry follows the established layout, while optics and material
converged through multiple rounds of real-device visual tuning, see §4.2); once fixed they do not change with the user's wallpaper or theme.

> **What "report" means here**: the "report §X" references throughout this document point to an **internal analysis document from project inception** —
> "Tyranor-Next: Liquid Glass Bottom Bar Comparison and High-Fidelity Implementation Plan" v1.1 (**not in this repository**, nor is it third-party
> source code that was referenced). It records the established visual values and interaction timing of this style; those values are collectively called the
> "**design baseline**" in this document.

### 3.2 Modified Files

| File | Change |
|---|---|
| `core/settings/AppSettingsStore.kt` | `nav_style` becomes a three-state value + pure-function normalization + one-time legacy key migration |
| `ui/settings/AppSettingsActivity.kt` | The two toggles merge into one `OverlayDropdownPreference` (Default / Classic / Lens); the Lens item only appears on Android 13+ |
| `ui/main/MainScreen.kt` | Mount the bottom bar according to `nav_style`, accept redirection during transitions in the Lens variant, and draw the background into the sampling layer under the glass style |
| `theme/GlassStyle.kt` | Extract `Modifier.glassPageBackground()` so the drawing layer is reused (root background and sampled content share the same gradient source) |
| `theme/AppShapes.kt` | Add `AppNavCapsuleShape` (Lens-variant bottom bar capsule outline, consolidating the corner constant) |
| `res/values*/strings.xml` | Trilingual strings |
| `AGENTS.md` | Rounded-corner exemption extended to the Lens-variant bottom bar capsule |
| `CONTEXT.md` | Navigation style becomes a three-option term, with a new "Liquid glass · Lens" entry |
| `ui/common/LiquidGlassNavigation.kt` | `glassNavBottomInset()` gains a Lens-variant inset branch (including the two cases of "not renderable / AGSL unavailable", which either zero it or compute it as the Classic variant); `isWideScreen()` moved out |

| `ui/common/ScreenSize.kt` (new) | `isWideScreen()` extracted from the classic navigation file: the Lens-variant stretch decision is shared with the classic bottom bar / game page grid; the corresponding function and its now-unused imports were also removed from `LiquidGlassNavigation.kt` |
| `ui/common/glass/GlassShaderSupport.kt` (new) | AGSL runtime probing (see §6 D33) |
| `test/.../glass/GlassBottomBarGestureTest.kt` (new) | Release-path branching (`glassPressRelease`) + wiring function (`applyGlassPressRelease`) → regression sites against the real controller; **does not cover** the Compose callback layer (see §6 D34) |

**Unchanged**: the **bar implementation** of `ui/common/LiquidGlassNavigation.kt` (`LiquidGlassNavigationBar`) stays as-is,
serving as the "Classic" option implementation; that file only has the following changes: `glassNavBottomInset()` gains a Lens-variant
inset branch (76dp, zeroed when the component cannot render), and `isWideScreen()` is moved out to `ScreenSize.kt`.
`theme/Color.kt` only adds two optical neutral color constants. In addition, **the classic bar gained a neutral hairline stroke in the light variant**
(`Modifier.glassEdgeStroke`, see §6 D25); the dark variant is unaffected.

## 4. Render Chain and Parameters

### 4.1 Three-Layer Sampling (report §6.1)

```text
Page content ─────────────────────────────→ pageBackdrop (recorded by MainScreen)
    │
    ├─ A visible bar: ColorMatrix color filter → blur(3dp) → lens(12dp, 8dp, with dispersion) → surface color 34%
    │              → edge highlight + light-variant inner shadow → crisp icons (no velocity deformation, see D29)
    │
    ├─ B hidden copy: clearAndSetSemantics + alpha(0f) + layerBackdrop(tabsBackdrop)
    │        inside: icons scaled 1→1.2 + accent tint
    │              └────────────────────→ tabsBackdrop
    │
    └─ C moving lens: CombinedBackdrop(page, tabs)
                   lens(rest↔press interpolation, depthEffect=false, chromaticAberration=true)
                   + inner shadow + rest/press overlay (**no velocity deformation**, see §6 D29)
```

The Modifier order is fixed per report §8.4 and must not be rearranged (a wrong order causes empty sampling, ghosting, or clipping).

### 4.2 Parameters (`GlassBottomBarSpec.Default`: geometry follows the established layout; optics / material are fixed values tuned on-device in this project)

| Parameter | Value | Source |
|---|---|---|
| Bar height / inset / lens height | 64dp / 4dp / 56dp | Report §6.3 |
| Reference single-slot width / host horizontal inset | 76dp / 16dp | Report §6.3 / §8.5 |
| blur / surface alpha / bar lens | 3dp both light and dark / 0.34 / 12dp×8dp (**with dispersion**) | Report §6.3 starting point, lowered after real-device testing, see D28/D30 |
| Moving lens lens (rest → press) | 6dp×8dp → 10dp×12dp, `chromaticAberration = true`, `depthEffect = false` | See D28; the third parameter of Backdrop 1.0.2 is `depthEffect`, and the old code passing `true` here did not enable dispersion |
| Press scale (X = Y) / copy icon scale | 78/56 ≈ 1.3929 identical on both axes / 1 → 1.2 | User requested "press-scale only, left and right identical", see D29 |
| Whole-bar press scale / horizontal follow | `1 + 16dp/bar width` / ±4dp (EaseOut mapping) | Report §6.3 / §6.4 |
| Position spring | `1f / 1000f / 0.001f` | Report §6.3 |
| Press progress spring | `1f / 1000f / 0.001f` | Report §6.3 |
| X / Y scale springs | `0.6f / 250f`, `0.7f / 250f` | Report §6.3 |
| Velocity deformation | **Removed** (the design baseline's `scaleX / (1 − clamp(u×0.75))` is directional, producing "normal expansion when tapping the left, horizontal stretching when tapping the right", see §6 D29) | Report §6.4 (not adopted) |
| Rest / pressed lens overlay | `0.05` (rest) → `0.02` (press), see `staticLensCoverAlpha` / `pressedLensCoverAlpha` | See D30 |
| Release decision threshold (whether releasing counts as a cross-slot commit) | Fixed **0.10** index units | Report §8.5 four-item adaptation parameters |
| Bar edge highlight strength | Light `0.42` / dark `0.30` (the design baseline was 1.0, i.e. the 50% white built into `Highlight.Default`) | See D12/D30 |
| Whole-bar press scale delta cap | `0.05` (clamps `16dp/bar width`) | Very narrow window protection, see §6 D8 |
| Press glow brightening / soft glow | `0.06` / `0.12` (neutral white × press progress) | Report §6.3 |
| Light-variant surface opacity | `0.34` (the dark variant is also `0.34`) | See D15/D30 |
| Light-variant edge highlight | `0.42` | Same as above |
| Light-variant hairline stroke | `GlassEdgeStrokeWidth` = `0.5dp` neutral black × `0.14` (Classic variant is `0.10`) | Same as above |
| Minimum renderable bar width | `2 × inset = 8dp`; narrower is not rendered | Very narrow window protection, see §6 D8 |
| Grab threshold (how long to hold before the slider follows the finger) | `110ms`, clamped to `0...2000ms` at runtime | See D27 (haptics and selection are not affected by it) |
| Lens visual width cap / single-slot lower bound | `76dp` (= reference single-slot width) / `24dp` | Wide-screen and very narrow window adaptation, see D19 |
| Icon size / lens inner shadow radius (rest → press) | `26dp` / `2dp → 8dp` | Report §6.3 |
| Whole-bar settle spring | damping 1 / stiffness 300 / threshold 0.5 | Report §6.3 |
| Light-variant dispersion boost | refraction ×`1.4` (**bar only**, the slider does not take this factor) | §6 D28 |
| Light-variant bar inner shadow | `10dp / 0.12` (the dark variant is 0) | §6 D30 |
| Spring settle threshold | `visibilityThreshold = 0.001` | Report §6.3 |

### 4.3 Interaction (report §6.5 / §8.6)

- Pressing **anywhere**: one short haptic at that instant (semantic activation has its own separate one).
- **Light tap** (below the grab threshold and without dragging) → takes PR81's single-phase path entirely: `settleAt(pulse = true)`,
  with the swell and the glide starting on the same frame; only **holding ≥ `grabDelayMillis`** or **dragging past the platform touch slop**
  grabs the slider to the finger (see §6 D27).
- Dragging maps the **pointer's absolute x** through `pointerXToIndex` into a continuous index (equivalent to `dx / tabWidth`), flipping direction for LTR/RTL, with the index clamped to `[0, N−1]`.
- The follow position uses the source spring; **MOVE uses an absolute target** (`updatePressTarget`) and does not accumulate deltas.
- Release: `round(target)` **snaps to an integer slot** → commit the page switch → material falls back (position approaches the target first, then retracts).
- Cancel: **does not commit**, the lens returns to the currently selected item.
- Tapping: **haptic given on press** once; no haptic when arriving, and none on release (one physical session produces exactly one haptic, see D16).
- Fast re-grab: the next press directly clears the previous round's unfinished material-retraction intent (`shrinkWhenSettled`); there is no pending release flow.

> Haptic feedback uses `View.performHapticFeedback` and does not require the `VIBRATE` permission. The design baseline has no haptics;
> this item was added by this project at the user's request (D16).

## 5. Fallback Strategy (report §8.8)

| Platform | Behavior |
|---|---|
| API 33+ | Full: real-time blur + `lens` refraction + `depthEffect` + interactive highlight shader |
| API 31–32 | Real-time blur only + bar lens **does not take effect** (Backdrop 1.0.2's `lens` returns early below API 33, so the bar lens and the lens refraction are both no-ops); `Highlight` / `Shadow` / `InnerShadow` are passed as `null` by the caller when capability is insufficient (avoiding pointless offscreen layers); `onDrawSurface` still draws, so the selected state falls back to a semi-transparent accent capsule. Consistent with report §8.8 "blur + non-refractive selection feedback" |
| API 26–30 | No blur: opaque solid base + semi-transparent accent selection capsule |
| API 33+ but AGSL unavailable on the device | **The entire variant falls back to "Liquid glass · Classic"**: runtime probing (`GlassShaderSupport`, see D33) happens before mounting; on failure the Lens variant is not mounted and the host inset is computed as the Classic variant, and the Classic variant is made to **not pass `Highlight`** (`highlightAvailable = GlassShaderSupport.highlightAllowed`) — the library's `HighlightStyle` also constructs a `RuntimeShader` on 33+, so leaving that dependency in place would make the fallback "from one crashing variant to another crashing variant". Note that **API 31–32 is unaffected**: there the library takes the non-shader "stroke + `BlurMaskFilter`" path, so the highlight stays as-is (`highlightAllowedFor` is a pure function that always returns true for `sdkInt < 33`, unit-tested) |

Capabilities are expressed separately by `GlassBottomBarCapabilities.current` (the pure function `of(sdkInt)`, shared by settings normalization and rendering);
the user's choice only decides "whether to enable", not the capability determination. **Runtime** AGSL availability is probed separately by `GlassShaderSupport`,
which only affects "whether this variant can render" and does not affect the visibility of the option in settings (the option is still gated on API 33).

**Note (corrected after review)**: the "Liquid glass · Lens" option in settings only appears on **Android 13+**, and is normalized when read,
so in this app the 31–32 / 26–30 rows of the table above are **practically unreachable** — they are merely capability branches of the component layer (the component contract requires
capabilities to be degradable, so it can be reused in lower-threshold scenarios in the future). Therefore V13 "lower-version fallback branches" cannot be verified inside the app,
and must not be claimed as covered in a PR.

## 6. Explicit Differences from the Design Baseline (the report requires itemized recording)

| ID | Difference | Reason |
|---|---|---|
| D1 | The outline uses `AppNavCapsuleShape` from `theme/AppShapes.kt` (`RoundedCornerShape(50%)`) instead of the capsule library's `ContinuousCapsule` | Avoid introducing a dependency for a new outline: Backdrop 1.0.2's `lens` only accepts `CornerBasedShape`, while `ContinuousCapsule` belongs to the 2.0.1 tier (whose lens has an additional `RoundedRectangularShape` branch). The two are different geometry classes; this plan **does not claim** pixel equivalence, only that the difference converges under capsule geometry (not measured) |
| D2 | The theme adapter lives in `ui/common/glass/` rather than `theme/` as suggested by the report | The project's `theme/` currently does not depend on `ui/`, preserving the `ui → theme` dependency direction (AGENTS.md three-layer architecture discipline) |
| D3 | Cancel does not commit (in the design baseline, Cancel and End call the same callback and may commit) | Report §8.1 "Production recommendation: cancel does not commit". **Cost**: in the design baseline, cancelling still draws a neutral 10% overlay (in the no-blur variant); this implementation instead returns to the original item + accent capsule |
| D4 | The release decision threshold is fixed at the design baseline value `0.10` (the velocity normalization span was removed along with D29, so it is no longer an adaptation parameter) | Report §8.5 "four-item adaptation parameters", used to preserve the baseline feel |
| D5 | A "retract material only on release" state flag replaces the pending release flow | Report §8.6 item 5 requires the production version to handle "an old release stealing back a new lens". In this implementation `beginPress()` directly clears `shrinkWhenSettled`, so there is no longer a window where an old coroutine could press the new press back down (the original plan used session IDs for this, which is now unnecessary) |
| D6 | No "press then rebound" transition on first composition | The design baseline's `LaunchedEffect` triggers one press animation at startup; Tyranor's launch screen does not keep that pulse |
| D7 | When refraction is unavailable, an accent capsule serves as the selection fallback (the design baseline still draws a neutral 10% overlay in that variant) | A 10% neutral overlay is not enough to express selection on dark/complex backgrounds; lower versions need readable selection feedback |
| D8 | The bar width is clamped by window width | Report §9 narrow-screen risk: a 76dp single slot may not fit on extremely narrow screens |
| D9 | No repeated press pulse after a drag release | The design baseline's `onDragStopped` already calls `animateToValue(target)`, and when the host sends back `selectedIndex` its `LaunchedEffect` triggers once more; this implementation deduplicates by `targetValue` and skips the second one (affects the pixel stage of V02/V06) |
| D10 | The dependency stays at Backdrop **1.0.2** (the design baseline is based on 2.0.1) and the capsule library is not introduced | Report §7.2 route B. Verified: the `Highlight` / `Shadow` / `InnerShadow` data default values are identical in both versions, and the refraction shader string is unchanged (the only difference, `half4(1.0)` → `color`, is equivalent under the white default); residual pixel risk is concentrated in the outline geometry (see D1) |
| D11 | ~~The bar draws no external shadow (`shadow = null`)~~ **partially superseded by D26**: the bar now uses the same shadow as the Classic variant; the design baseline's stronger shadow is still not adopted | The design baseline's shadow is 10% black in light / 20% in dark, 24dp blur, offset 4dp downward, which is 2.5× this project's original liquid glass bar (`Shadow.Default.copy(alpha = 0.8f)`, equivalent to 8%); on a dark gradient background it forms a dark rounded outline larger than the bar (visually as if another layer sits under the bottom bar). The user confirmed removing it. **Note**: the shadow and inner shadow are kept while the moving lens is pressed (`pressProgress > 0`) and are 0 at rest, so no persistent dark layer is produced |
| D12 | **Bar edge highlight is split by lightness**: light `barHighlightAlphaLight = 0.42`, dark `barHighlightAlphaDark = 0.30` (the design baseline is `Highlight.Default.copy(alpha = 1f)`, i.e. 50% white + `BlendMode.Plus`) | That baseline value produces a noticeable bright edge at the bar's rounded ends, so the cross-section reads as "dark (outside the bar) → bright (edge) → dark (inside the bar)". The user requested "dark → slightly lighter → dark", hence the split and reduction; the light variant is higher because highlights are more easily washed out on a light base (see D30). The highlight while the moving lens is pressed still uses the baseline value via `pressProgress` (transient, not persistent) |
| D13 | ~~The sampling copy row's refraction strength grows with pressure~~ **changed to constant refraction** (`barLensHeightPx` / `barLensAmountPx`, not reading `controller.pressure`) | History: early on, layer B interpolated refraction by pressure, at the cost of the offscreen layer's sampling margin changing every frame (reallocating the render target each frame). After R1's re-review turned off layer B's dispersion, B's refraction amount no longer varies with pressure either — that cost is **eliminated**, and there is no `* progress` that needs reverting. Fidelity is instead carried by **layer C** (the moving lens) interpolating refraction by pressure, and icons inside the lens still get pushed up with the press (see the performance subsection in §7 for real-device measurements) |
| D15 | ~~Light-variant readability adaptation: surface opacity 0.40 → 0.62, edge highlight 0.18 → 0.42, plus a 0.5dp hairline stroke~~ **superseded by D30**: the final values are the same `0.34` surface for light and dark, highlights light `0.42` / dark `0.30`, hairline stroke `0.14` in light | Light pages have a very pale base color, so at low coverage the outline is only visible where there is content behind the bottom bar (user observation). D15's 0.62 was later judged "too heavy" by real-device testing, and D30 records the final converged values; all values are tunable at a single place in `GlassBottomBarSpec` |
| D23 | **Construction boundaries are also guarded**: `indexRange` falls back to `0f..0f` when non-finite/reversed, `initialIndex` falls back to the range start when non-finite and is clamped into range when out of bounds | Supplementary review found: a reversed range makes `coerceIn` throw; a non-finite initial value pollutes the position target so the spring never settles. Normalization happens at construction time, so runtime code no longer needs to defend |
| D26 | **The Lens-variant bar shadow is exactly the same as the Classic variant** (`Shadow.Default.copy(alpha = 0.8f)`, equivalent to about 8% black) | Maintainer feedback from real-device testing: the Lens variant previously had `shadow = null` (D11), which looked inconsistent with the Classic variant and felt less floating. Both variants now use the same shadow parameters; the design baseline's "10% black in light / 20% in dark, 24dp blur, 4dp downward offset" (2.5× strength, pressing out a larger dark outline on dark gradients) is still not adopted. The sampling copy row keeps `shadow = null` (it is invisible and only serves lens sampling; adding a shadow would bring dark edges into the lens interior) |
| D27 | **A light tap takes PR81's single-phase path; only holding/dragging makes "the slider follow the finger"**: `grabDelayMillis = 110ms` | The user requested "on top of the already-merged PR effect: holding anywhere brings the slider under the finger". If the slider rushed to the finger immediately on press, a light tap would become a two-phase motion of "dash → abrupt stop → glide again" (less smooth than PR81). Therefore: a light tap (below the threshold) → fully `settleAt(pulse = true)` (swell and glide start on the same frame, velocity not cleared); holding or starting to drag → only then grab the slider to the finger. 110ms is not a long-press determination and does not participate in haptics or selection timing |
| D28 | **Division of dispersion work**: the bar carries the **continuous rainbow band** along the top and bottom edges (`barLensHeight/Amount = 12/8dp` + `barLensChromatic = true`), while the slider carries the **colored edges** when overlaying icons (rest 6/8 → press 10/12dp + `movingLensChromatic = true`); the **light variant** additionally gets `lightDispersionBoost = 1.4` for the bar | Real-device testing: dispersion attached to the slider breaks into two arcs at the top and bottom and also affects both left and right ends ("abnormal rainbow pattern"); only on the bar does it look like the continuous long band in the user-provided reference image. Contrast is low on a light base, so the refraction amount needs boosting for visible separation, but it **may only be added to the bar** — adding it to the slider pulls colored smears out of the icons (the user observed "overdone") |
| D29 | **All velocity deformation removed** | The user requested "no matter which icon is tapped, the deformation must be identical; press-scale only". The design baseline formula is directional (the index increasing stretches horizontally, decreasing does the opposite), and this implementation's press speed far exceeds the magnitude that formula was tuned for, causing "normal expansion when tapping the left, horizontal stretching when tapping the right". The whole velocity chain (`velocity` output, velocity spring, `rawSpeed`, `lastIndex` and 5 velocity parameters) has been deleted; deformation is produced only by the press spring |
| D30 | **Bar material**: slight blur `3dp` (global) + overlay `0.34` + edge highlight (light 0.42 / dark 0.30); **light-variant only** inner shadow `10dp/0.12` and a slightly stronger hairline edge `0.14` | The light bar is a white base with a white highlight — white light over a white base is invisible; the effect at the top and bottom edges in the reference image relies on a soft inner dark edge hugging the border. The dark variant has contrast from its dark base, so the inner shadow is always 0 there (avoiding unnecessary offscreen layer cost) |
| D31 | **Color control changed to a `ColorMatrixColorFilter` built once and cached** | The first version called Backdrop's `colorControls(...)` inside the `effects` lambda, and that function **creates a new ColorFilter on every call** (confirmed by decompilation); Backdrop detects the value change and rebuilds the RenderEffect pipeline → the bottom bar **flickers abnormally** while content scrolls. Changed to `remember` one matrix filter instance for reuse, keeping the pipeline stable |
| D32 | **The sampling copy layer (B) does no dispersion**: `chromaticAberration = false` (explicitly hardcoded, **not** following `barLensChromatic`) | The third follow-up review found: although layer B is invisible, what it records into `tabsBackdrop` is refracted again by the moving lens (C); if B also enabled dispersion, icons would first get colored edges and then be refracted by C, producing "secondary dispersion pulling spikes out of blue icons". Now colored edges are each produced once by A (the continuous rainbow band along the visible bar's top and bottom edges, `barLensChromatic = true`) and by C (the colored edge when the slider overlays an icon, `movingLensChromatic = true`); see D28 for the division of work |
| D33 | **Three-layer AGSL fallback**: 1. probe **three** candidate programs before mounting (minimal / one covering the library's `lens()` `uniform shader`+`eval` / one covering the constructs and built-ins used by the library's `HighlightStyle.Default` — float2·float4 uniforms, branch helper functions, max·min·abs·sign·normalize·length·dot·pow·cos·sin; **not a verbatim copy of library programs**), and it is available only if **all compile**, otherwise the Lens variant is not mounted and the host inset is computed as the Classic variant; 2. the Classic variant **does not pass `Highlight`** when unavailable (the library's `HighlightStyle` also constructs a `RuntimeShader`; leaving that dependency in place would make the fallback equal to "falling back from one crashing variant to another crashing variant"); 3. the three `lens()` calls in our own `effects` are guarded by try/catch + a process-level circuit breaker (the construction site is inside this call stack), so on failure the whole variant degrades to "a glass bar without refraction" instead of crashing the main UI | The fourth follow-up review pointed out: the previous version probed only one minimal program, and the fallback target (the Classic variant) itself still depended on `Highlight`'s `RuntimeShader`, so the fallback never actually took effect. Library references verified: **only `effects/*` and `highlight/*` depend on AGSL**; `Shadow` / `InnerShadow` go through RenderEffect and are unaffected. Also, probe programs **must avoid AGSL reserved words**: `input` is a reserved word, and using it makes the program fail to compile with `IllegalArgumentException: name 'input' is reserved`, which misclassifies "the program is wrong" as "the device does not support it" (already hit once on a real device; re-verified after switching to `content` / `tint`); results are cached per process |
| D34 | **Release-path branching extracted into pure functions** (`glassPressRelease` + the `GlassPressRelease` sealed type) plus regression sites | The High-priority regression caught by the second follow-up review was not a controller miscalculation but **wiring**: `beginPressAt` already sets the pressure target to 1, and only `settleAt` / `endPress` / `cancelPress` pull it back, so a caller missing one call leaves the slider stuck in the pressed state forever. Controller unit tests cannot drive the caller, so "grabbed → Commit (normal-size snap) / not grabbed → Tap (single-phase pulse, swell only on cross-slot)" was extracted into a unit-testable pure decision, and `GlassBottomBarGestureTest` was added: it tests the decision itself (including clamping of dirty input) and drives the **production wiring function** `applyGlassPressRelease` → the real controller, asserting that **both** paths must let the pressure converge. **Coverage boundary (corrected truthfully after the fourth review)**: the cases cover "decision → controller", but **not** the Compose callback layer — if someone forgets to call the function in `onUp`, this test cannot detect it (a device or Compose test host would be needed) |
| D26b | **Material retraction must wait until the slider returns to the authoritative slot** (`cancelPress()` sets `shrinkWhenSettled = true` without retracting immediately) | Regression fix: an early version retracted the material immediately on cancel, so the slider shrank back to rest size mid-flight, which looked like "losing force halfway". Now the position target first returns to the currently selected slot, and the material retracts after it arrives; a new regression case covers "after cancel it still flies to the selected item, and the material falls back only after arriving" |
| D25 | **Classic variant gains a floating stroke in the light variant**: `Modifier.glassEdgeStroke(shape)` = a 0.5dp neutral black 10% hairline drawn along the bar's 16dp rounded corners | Maintainer feedback from real-device testing: on pure white / light gray pages the semi-transparent surface is almost the same color as the background, and the boundary is only visible where content shows through behind the bar, so the floating feel is lost. The dark variant does not add it (the dark base has its own contrast plus the bar's highlight/shadow); the values match the Lens-variant light stroke (`edgeStrokeWidth` / `edgeStrokeAlpha`) to avoid drift between the two variants |
| D24 | ~~Dragging only counts after exceeding the platform slop, and a pure tap calls `releasePress()`~~ **superseded by D27**: the recognizer still only reports `dragged = true` once accumulated movement exceeds `ViewConfiguration.scaledTouchSlop`, but **behavioral branching moved to the controller** — a light tap uses `settleAt(pulse)` (PR81's single-phase path, not clearing velocity, not stopping the glide), while holding/dragging uses `endPress(destination)` | Supplementary review found: if any movement counted as a drag, "a light tap during a glide" would be misjudged as a drag due to finger jitter — the lens would be halted and commit to whatever slot it happened to pass on release (the Tab's tap has already been cancelled once the slop is exceeded, so the wrong slot becomes the only result). `dragged` is reported on every `onDrag`, so the 1–3px jitter at the moment of pressing is not misjudged |
| D22 | **Drag start aligns the target baseline to the visual position** | Supplementary review found: grabbing the lens mid-animation and then dragging accumulates the delta on the previous target (grabbing at 1.5 during a 0→3 animation and dragging one slot left would commit to 2 instead of following the finger from 0.5→1). Changed so that `targetIndex = index` on the first drag delta; pure taps are unaffected |
| D21 | **Motion parameters are uniformly guarded at controller initialization**: `visibilityThreshold` / `releaseThreshold` / `pulseVisibleThreshold` / `pressedScale` fall back to defaults when non-finite and are clamped to valid ranges when finite; the `releaseThreshold` lower bound is 1e-5 (**not `max(threshold, epsilon)`**: that would make retraction happen epsilon before the target and leave the lens halfway) | These values directly determine "whether it has settled" or act as divisors. The review pointed out: when a threshold is NaN/±Inf/>1, the check never succeeds, `pulsePending`/`shrinkWhenSettled` are never cleared, and `allSettled()` is always false → the frame loop never exits. While adding tests it was also found that even a valid 0 retraction threshold would never be satisfied because of "strictly less than", so the lower bound is 1e-5 (**no longer `max(threshold, epsilon)`** — that would make retraction happen epsilon before the target, while epsilon is also the spring rest criterion, effectively leaving the lens halfway) |
| D20 | **A press pulse must be "visible" before the material retracts**: `settleAt(pulse = true)` records a pending pulse, and retraction is allowed only after the pressure rises past `pulseVisibleThreshold` | The review found: when the target index is already in place (e.g. tapping again right after dragging there), the retraction condition would reset the pressure target to 0 on the first frame, so the press would effectively not have happened. Changed to retract only after the pulse is visible, so near-target scenarios also get press feedback |
| D19 | **On wide screens the lens width is capped at the reference single-slot width of 76dp**: the gesture hit area is still the whole slot, while the visual lens is centered and does not exceed `spec.lensMaxWidth` | After stretching on tablets/landscape a single slot can exceed 200dp; if the lens equaled the whole slot, pressing would inflate it into a giant capsule (the user found this strongly incongruous). The original "Classic" variant's focus capsule is fixed at 76dp, so here it is capped at the reference single-slot width |
| D18 | **Tablet/landscape stretching**: when the screen width is ≥ 600dp the bottom bar stretches to fill (consistent with the original liquid glass navigation); phones still center and narrow to the reference single-slot width of 76dp. The naming was also adjusted to "Default / Liquid glass · Classic / Liquid glass · Lens" under "Navigation bar style" | The user observed on a tablet: a short centered bar looks inconsistent with the full-width navigation bar under the glass style. Narrow screens keep the reference proportions (report §8.5) |
| D16 | **New haptic feedback added** (the design baseline has none): **one `VIRTUAL_KEY` per physical session, only on DOWN**; semantic activation counts as a separate one | The user explicitly requested "make operations more responsive and tactile". Uses `View.performHapticFeedback` (`VIRTUAL_KEY`), **requires no VIBRATE permission**, is automatically silent when the system's "touch feedback" is off, and is not triggered on devices without a motor. Early versions had "vibrate when a tap lands on an uncovered icon after arrival" and "vibrate on release"; real-device testing found these sluggish and repetitive, so they were removed |
| D14 | The press glow is **driven by the lens's press progress**, no longer maintaining a separate finger-following position animation and a slower spring | The original plan's position animation, as assembled, did not participate in drawing (an extra coroutine per frame with no visual output); sharing the same spring makes brightness and volume synchronous and the rhythm more consistent |

In addition, the host fix from report §8.7 has been implemented: in the Lens variant, `MainScreen.selectPage()` no longer discards input because of a transition's
`isRunning`; instead it accepts the new target and lets `updateTransition` redirect from the currently displayed state; **the default path keeps the original guard**,
so this plan causes no behavior change for users who have not enabled the option.

## 7. Verification Status

| Item | Status |
|---|---|
| Build (`:app:assembleDebug`) | **Passed**: `app/build/outputs/apk/debug/app-debug.apk`, 108,194,491 B / sha256 `dabe5c35...5b337b`, package name `com.tyranor.next.test` (different from the original `com.tyranor.next`, so both can be installed side by side), versionName 1.36 / versionCode 1036000, minSdk 26 / targetSdk 36 / compileSdk 37. dex verified: all eight Lens-variant classes are present (including `GlassShaderSupport`), as are the upstream additions `ExternalEmulatorRegistry` (PSP/NS) and `initEngineTabs` (engine page categories) |
| Unit tests | `:app:testDebugUnitTest`: **268 cases, 267 passed / 1 failed**, of which **58 are new** in this plan (`GlassBottomBarSpecTest` 20 + `LensMotionControllerTest` 19 + `GlassBottomBarGestureTest` 12 + `GlassBottomBarCapabilitiesTest` 3 + `NavStyleNormalizationTest` 4). The only failure is `RpgSaveSyncTest > uppercaseSaveIsWrittenWhenItIsOnlyExistingDir` (`FileNotFoundException`), which is an **existing upstream failure / local filesystem related**: the same case fails with the same error on a clean `origin/main`, and the maintainer cannot reproduce it locally (the case depends on case-sensitive directory semantics); it is unrelated to this plan. The static check `tools/check-hardcoded-ui-strings.py` passes, with 491/491/491 trilingual keys |
| Artifact content check | The APK contains the trilingual strings and all `ui/common/glass/` classes (`EnhancedLiquidGlassNavigationKt` / `LensMotionController` / `GlassBottomBarGestureKt` / `PressGlowHighlight` / `GlassBottomBarSpec` / `GlassBottomBarColors` / `GlassNavigationThemeAdapterKt`); early-version classes deleted during the rewrite (`DampedDragAnimation` / `DragGestureInspector` / `InteractiveHighlight`, and `LensDragGesture`, which was replaced by `GlassBottomBarGesture`) no longer appear |
| Static check | `tools/check-hardcoded-ui-strings.py` (wired into `./gradlew check`) **passes**: 491/491/491 keys across three languages (`values` / `values-en` / `values-ja` 491 each) and no hardcoded Chinese inside Kotlin |
| Default path regression (Lens variant not enabled) | The original `LiquidGlassNavigationBar` path is unchanged; the transition redirection in `selectPage` **only takes effect in the Lens variant** (see the last paragraph of §6), and the default path behavior is unchanged |
| Independent code review | Eight subagents across two rounds: the first round ran five angles (logic / regression and architecture / security / robustness and performance / PR compliance) against an early version; after the rewrite into an independent implementation, three more angles ran (originality and licensing / rewrite logic / PR consistency). Issues have been fixed (see below) |
| Device verification (report P5) | **The maintainer has completed verification on an Android device** (against an intermediate revision of this PR): display and switching of the three navigation styles (Default / Classic / Lens), outline visibility in light and dark, tablet/landscape stretching, press and drag interaction, and haptic feedback. **Note**: afterwards the bar material (blur / overlay / highlight / inner shadow) and the dispersion division (D28/D30) were adjusted in response to user real-device feedback; these final values were **confirmed by the user on their own device**, and the maintainer has not re-verified them |
| Agent-side Android CLI install check (AGENTS.md §Testing and Review) | **Executed but could not complete**; commands and results: `android --version` → 1.0.16261425; `android --sdk=<SDK> info` → SDK path/version normal; `android --sdk=<SDK> install --apks=<debug APK>` → `Error: No online devices or emulators found`. Cause: no physical device connected locally (both `adb devices` on the WSL side and `adb.exe devices` on the Windows side were empty), and no AVD available (`android emulator list` empty), and the current user is not in the `kvm` group (`/dev/kvm` is `root:kvm`), so the emulator cannot start. The `/tmp/androidsdk` mentioned in AGENTS.md does not exist locally, so the check used `tyranor-work/android-sdk` inside the repository. Therefore device-side conclusions rely on the maintainer's real-device verification; the agent did not perform an independent install verification. |
| Not yet covered (**suggested** items, not mandatory in the repo) | TalkBack announcements, release/R8 builds, API 26–32 fallback variants, multi-finger handover and system cancel gestures; `GlassBottomBarGesture`'s touch-slop decision (requires a Compose test host; this environment has no device). `CONTRIBUTING.md` lists screenshots / phone and tablet / landscape / dark mode as "suggested", and the items above are treated by the same standard |

Issues found in review and already fixed (summary):

| Source | Issue | Resolution |
|---|---|---|
| Logic | The press glow rebuilt its instance from `tabWidthPx` while the gesture coroutine stayed bound to the old instance → the highlight was permanently dead | Rewritten as a gesture-free glow component, remembered only on `(controller, spec, colors)`, with position driven by lens state |
| Logic | `spec` was not in the controller's remember keys, so injected custom parameters had no effect | `remember(..., spec)` |
| Logic | On API 31–32, `Highlight`/`Shadow`/`InnerShadow` were passed with alpha=0, and the library only skips null → an invisible offscreen layer recorded every frame | Pass `null` when capability is insufficient |
| Fidelity | ~~The sampling copy row's refraction strength varied with pressure → the offscreen layer changed size every frame~~ **Eliminated**: layer B now uses constant refraction and the sampling margin is fixed; pressure-interpolated refraction happens only in layer C (the moving lens) | Handled together during R1 re-review (see §6 D13); real-device frame-time measurements are in the performance subsection of §7, and stay within budget |
| Robustness | Blocking bar touches with `clickable` added an unlabeled clickable semantics node | Briefly changed to consuming via `pointerInput` with `PointerEventPass.Main`; after the refactor, the **layer D whole-bar physical input overlay** (`matchParentSize()`, drawn last, no semantics) is the sole pointer owner, and the visible row's Tabs keep only the `Role.Tab` accessibility semantics |
| Robustness | Release waiting originally used a suspending wait flow, which could suspend forever and leave the pressed state stuck at 1 | After the re-architecture, "retract material after snapping" is an ordinary condition in the frame loop, with no suspension |
| Robustness | On extremely narrow windows `1 + 16dp/size.width` scales up to a malformed size; when the width is insufficient the bar is left as an 8px fragment | The press delta is clamped by `barPressScaleDeltaMax`; when `barWidth <= 2× inset` it is simply not rendered |
| Robustness | After a drag release, the host sending back the selected item triggers the press pulse once more | The drag commit path uses `endPress(destination)` (not going through `settleAt`); the tap path only carries a pulse when the index actually changes (`pulse = index != currentSelectedIndex`), and external changes from `LaunchedEffect(selectedIndex)` also go through `settleAt` with a pulse |
| Robustness | The visible row lacked `selectableGroup()`, so TalkBack had no "n / N" context | Added |
| Logic | The sampling copy row rebuilt its `drawBackdrop` lambda every frame → the RenderEffect pipeline was rebuilt repeatedly | All `effects` / `highlight` / `layerBlock` / `onDrawSurface` are `remember`ed on their respective dependencies |
| Copyright | The early revision's implementation approach triggered the originality and licensing review (non-compliant with the project's GPL-2.0-only requirements) | Everything rewritten as this project's independent implementation (see §3.1 Copyright and implementation approach) |
| Fidelity | `naturalBarWidth` dead code + duplicated formula | Changed to an instance method and used inside the component |
| Conventions | Rounded-corner literals, AGENTS.md exemption, CONTEXT.md not updated | Consolidated via `AppShapes.AppNavCapsuleShape` + both documents synchronized |
| Concurrency (CodeRabbit) | The settings page migrated on an IO thread while the dropdown was still interactive → the migration's read-modify-write could overwrite the style the user had just chosen | `initNavStyle` / `getNavStyle` / `setNavStyle` share `navStyleLock` for serialization |
| Data (CodeRabbit) | When the legacy key value was `false`, `getBoolean` returned early and the key stayed on disk forever | Switched to a `contains` check, deleting the old key whether true or false |
| Logic (CodeRabbit) | When the target was already in place, `settleAt(pulse = true)` pulled the pressure target back on the first frame → the press was invisible | Record a pending pulse and retract only after the pressure rises past `pulseVisibleThreshold` (§6 D20), plus a near-target regression test |
| Docs (CodeRabbit) | The plan document still said "parent toggle/child toggle" | Changed to the three-state "Navigation bar style" dropdown, with the risk table synchronized |
| Logic (maintainer's five-angle review M1) | Grabbing the lens mid-animation and dragging accumulated the delta on the old target → committing to the wrong slot | Drag start aligns the visual position (§6 D22), plus a regression case (verified: the case fails when reverted to the old logic) |
| Performance (M/P1) | `Highlight/Shadow/InnerShadow(alpha=0)` were still passed at pressure 0, and Backdrop only returns early on `null` | Return `null` when pressure ≤ 0 (all three bar layers + the copy row highlight), so still frames no longer record transparent offscreen layers |
| Rule conflict (🟠) | AGENTS.md's capsule exemption also allowed "creating an equivalent shape in place", conflicting with "no scattered corner literals" | Keep only `AppNavCapsuleShape`, and state explicitly that it must not be created in place inside the component either |
| Robustness (P3) | A `RuntimeShader` construction failure crashes the main UI; the shader's remember keys included a layout-phase width | Wrap construction in `runCatching` and degrade to no glow on failure; remove the width from the keys and read updated-state during drawing instead |
| Consistency (M2/M3/P4/P8) | Terminology not unified, plan document self-contradictory, narrow windows still leaving 76dp, line-number anchors stale | Terminology unified to "Classic / Lens" (internal IDs retained), mutually exclusive old conclusions removed, inset zeroed according to "whether it actually renders", anchors corrected |

Points known to need real-device verification (report §11.2 matrix):

- V02 press swell 78/56, copy icon 1.2, inner shadow; V05 signed deformation on fast back-and-forth and re-grabbability;
- V08 tapping another item before a transition finishes (`selectPage` now redirects in the Lens variant; confirm the visuals and state stay consistent, and whether the
  "see-through base" impression is acceptable when the sum of the two pages' alpha is briefly below 1 during redirection);
- V10 the lens updating in real time while a list scrolls under the bottom bar; V12 three-button navigation avoidance; V13 lower-version fallback branches;
- V14 TalkBack: one announcement per item, selection declared, whether extra focus appears;
- Background sampling under the glass appearance style (this change merged the gradient into the sampling layer; confirm there are no seams/dark holes; the **Default option**
  with the same root cause was not included in this fix and may still sample a transparent background under the glass style);
- Performance: `effects` rebuilds RenderEffect every frame while pressing; the main UI content is drawn multiple times per frame by `layerBackdrop` +
  `tabsBackdrop` — **measured, see the performance subsection below** (`dumpsys gfxinfo` comparative data shows that Janky and percentiles for bottom bar interaction
  are no worse than ordinary list scrolling within a page);
- Coexistence of gestures with page scrolling / system edge gestures (the bottom bar currently leaves 16dp on each side and does not occupy the edge gesture area).

**Real-device measurement (P2 closed)**: PPG-AN00 / Android 17 (SDK 37) / 120Hz (8.3ms budget), the same "long-press the bottom bar then drag horizontally across the whole bar" gesture 6 times × 2.5s, alternating between the Lens and Classic variants for 2–3 rounds each:
- Light: Lens variant Janky **0.50% / 0.51%**, UI p50/p90/p99 = 7/11/17, 7/10/17 ms, GPU p50 5ms; Classic variant 0.75% / 0.50%, 6/8/16, 6/8/14 ms, GPU p50 3ms.
- Dark (glass appearance style): Lens variant 1.36% / 1.43% / 0.68%, Classic variant 1.19% / 0.25% / 0.95%.
- Same-device baseline: ordinary list scrolling within a page 0.80% Janky, p90 18ms / p99 23ms (**higher** than bottom bar interaction).
Conclusion: the Lens variant's inherent cost is measurable but small (UI p50 +1ms, p90 +2~3ms, GPU p50 +2ms), and it is no worse than ordinary list scrolling, so it **stays within the frame budget**; therefore the fallback option below does not need to be enabled. Limitations: gfxinfo only provides end-to-end frame delivery and percentiles, without RenderThread/GPU breakdown attribution, and it does not cover long thermal steady state or low-end devices.

## 8. Risks and Rollback

| Risk | Response |
|---|---|
| Visual anomalies in the Lens variant | Switch to "Liquid glass · Classic" or "Default" in settings to return to the original implementation (three independent paths under the same dropdown) |
| Degraded looks on lower versions | Clearly labeled as a fallback variant; equivalent refraction would require a separate render backend (out of scope for this plan) |
| Increased performance cost | Off by default; when enabled it involves multiple backdrop draws + shaders. Real-device measurement (120Hz): full press/drag chain Janky ≈0.5%, UI p50 7–8ms, no worse than ordinary list scrolling, within budget; low-end devices and long thermal conditions are still not covered |
| Transition redirection causing visual misalignment | Redirection only takes effect in the Lens variant, and the default path keeps the original guard; if unsatisfactory, the branch can simply be removed |

## 9. Implementation Record

- Base: **latest official `origin/main` @ `4fc7042`** (followed in stages via `git fetch` + `rebase`; not pushed upstream);
  the branch `feat/liquid-glass-enhance` lives in a separate worktree and accumulated 24 commits, finally submitted as cross-repo PR #81
  (fork `yuukana1/Tyranor-Next` → upstream); the upstream repository is **only `fetch`ed, never `push`ed**, so none of its branches are affected.
- Conflict handling in the most recent rebase (`eeb00fb` → `4fc7042`, where upstream brought in PSP/NS entries and engine page categories): 6 files,
  one conflict each, all of the "both sides add something at the same insertion point" form, resolved uniformly as **both coexist** — keeping upstream's
  `engineTabsState` / `initEngineTabs` / `settings_engine_tabs` alongside the `settings_nav_bar_*` trilingual strings; in `MainScreen`'s loading block,
  this branch's `initNavStyle` (idempotent) is kept and upstream's `initEngineTabs` is appended. For the `README.md` conflict, upstream wins,
  so the final `README.md` is **byte-identical to upstream** (this PR does not touch the acknowledgements section).
- Sync method: local `git fetch` + `git rebase origin/main`. The only textual conflict was in `theme/GlassStyle.kt`:
  upstream added an accent diagonal ambient light to the root background, and this branch had extracted that drawing layer into `Modifier.glassPageBackground(accent)`;
  the resolution was to **keep the extraction** and move all of upstream's new brushes into the extracted function (accent is passed by the caller at composition time,
  preserving the recolor-and-recompose semantics), and change `GlassBackground` to call that Modifier — no behavior was lost on either side.
- Change surface: 8 new `ui/common/glass/` implementation files + `ui/common/ScreenSize.kt` (absorbing the width decision extracted from
  `LiquidGlassNavigation`) + **5** unit test files + this document; plus 7 modified Kotlin files
  (`AppSettingsStore` / `AppShapes` / `GlassStyle` / `MainScreen` / `AppSettingsActivity` /
  `LiquidGlassNavigation` / `Color`), 3 `strings.xml` (Chinese/English/Japanese, adding only the three-state strings),
  and `AGENTS.md` / `CONTEXT.md` / `docs/app-persistent-data-inventory.md`. **`README.md` is byte-identical to upstream**
  (an early revision modified the README acknowledgements section; those changes were fully reverted, so this PR makes no change to README).
  No new dependencies introduced; Gradle / Manifest / ProGuard unchanged.
- Build: `./gradlew :app:assembleDebug` passes; artifact and package name verification in §7.
- Review: the first round ran five angles (logic / regression and architecture / security / robustness and performance / PR compliance) against an early version;
  after the rewrite into an independent implementation, three more angles ran (originality and licensing / rewrite logic / PR consistency), with conclusions merged into §6 and §7.
- Device side: **the maintainer completed verification on an Android device** (see §7 for details); the agent did not perform an independent install verification —
  `android install` returned `No online devices`, and `/dev/kvm` is `root:kvm` with the current user not in the kvm group, so the
  emulator could not start with hardware acceleration (commands and results in §7).
- Not done (**suggested** items, not mandatory in the repo): frame-by-frame comparison, performance profiling (P2's frame budget needs real-device confirmation), release (R8) builds,
  TalkBack, API 26–32 fallback variants, multi-finger handover and system cancel gestures.

### 9.1 Test Package Name (the debug package does not share the original package name)

The debug package must use a package name different from the original `com.tyranor.next`; otherwise it cannot be installed alongside the original.
This project already has a ready-made switch, `TYRANOR_APPLICATION_ID` (`app/build.gradle.kts:92`, read order env →
`local.properties` → Gradle property), so **the committed build script is not modified**; only the local `local.properties`
(already gitignored) is written:

```properties
TYRANOR_APPLICATION_ID=com.tyranor.next.test
```

The artifact package name is `com.tyranor.next.test`, so it can be installed alongside the original; `namespace` remains `com.tyranor.next`,
so `R` / `BuildConfig` and the source package path are unaffected, and `${applicationId}.fileprovider` and `${applicationId}.androidx-startup` in the Manifest
are rewritten automatically along with the package name.

If **all** debug variants should permanently use the test package name, add
`debug { applicationIdSuffix = ".test" }` to `buildTypes` in `app/build.gradle.kts` (not adopted this time: the release process and CI are out of scope for this plan).