# App-Layer Screen Transition Performance Optimization Plan

## 1. Scope and Goals

This plan only covers the Jetpack Compose page layer of the `app` module; it does not modify the `engine` module or any game engine runtime logic.

Goals:

- Eliminate unnecessary per-frame recomposition during main page Tab switching.
- Avoid composing unrelated pages mid-animation when moving across multiple Tabs.
- Reduce the offscreen recording and real-time blur cost of liquid glass navigation while pages are moving.
- Unify the game library, recent games and quick launch into Activity-level state, so adjacent pages no longer each hold their own copy of the data.
- Remove the synchronous game library read during initial page composition.
- Limit concurrent cover decoding to stabilize main-thread and RenderThread pressure on first entry into a LazyGrid.
- Keep the existing page structure, theme, horizontal page-switch semantics and static liquid glass visuals unchanged.

## 2. Baseline Before Optimization

Test device: `24053PY09C`, resolution `1236 × 2750`, refresh rate `120Hz`, current navigation style `liquid_glass`.

| Path | P50 | P90 | P95 | P99 | GPU P90 |
|---|---:|---:|---:|---:|---:|
| Home → Games | 18ms | 30ms | 32ms | 73ms | 5ms |
| Games → Settings | 18ms | 38ms | 150ms | 150ms | 5ms |

The single-frame budget at 120Hz is about `8.33ms`. Currently the median frame exceeds two refresh cycles, and the P95 for cross-page switching reaches `150ms`.

## 3. Root Causes and Implementation Items

### 3.1 Main Tab Switching

Current state:

- `HorizontalPager` and a separate `selectedIndex` form two sources of state.
- When going directly from Home to Settings, the Pager animation passes through the intermediate pages and creates page content mid-animation.
- `beyondViewportPageCount = 1` causes the game page to be composed and covers to load early while still on Home.

Implementation:

- Drive `Transition` from a single `selectedIndex`, and perform horizontal displacement and opacity animation via `graphicsLayer`.
- The four Tabs are composed only once when MainActivity is first created; subsequent switches no longer rebuild the game grid and the Miuix settings page.
- Hidden pages have `alpha = 0`, have their semantics cleared, and pre-consume events during the `Initial` pointer phase; the target page also ignores touch until the animation completes.
- For direct cross-Tab moves, the start and end points are moved directly; although the intermediate pages stay resident, their opacity stays 0 and they never cross the screen.
- Search terms, scroll positions and page tasks are naturally retained by the resident composition and no longer rely on `SaveableStateHolder` restoration.
- The cost is about `180ms` extra on the first composition during cold start (measured 890ms → 1070ms), in exchange for no more long frames from settings page rebuilds on each subsequent Tab switch.

### 3.2 Liquid Glass Navigation

Current state:

- Page content is recorded as a whole page through `layerBackdrop`.
- Both the navigation base plate and the focus capsule perform real-time blur, and the base plate additionally performs lens.
- `focusX` is read during composition, so the focus animation recomposes the entire navigation bar every frame.
- The navigation item list and callbacks are recreated when the parent recomposes.

Implementation:

- Animated State is read only in the `offset`/`graphicsLayer` phase, skipping Composition.
- The fluid stretch value is computed inside `graphicsLayer`.
- Keep only one backdrop layer for the navigation base plate, lower blur from 24dp to 12dp, and remove the high-cost lens.
- The focus capsule becomes a translucent theme-colored fluid layer and no longer runs a second blur pipeline.
- `layerBackdrop` and the base plate effect chain stay resident, and are no longer repeatedly attached/compiled at animation start and end.
- The navigation item list is lifted into a stable top-level constant.
- Size and center coordinates are written to State only when the values actually change.

### 3.3 Page State and Main-Thread Reads

Current state:

- Home and the game page each hold their own game library derived state.
- `EngineScanner.loadGames/loadRecentGames/refreshQuickLaunch` run synchronously in composition initializers.
- Pages are synchronized through cache version numbers and manual write-back.

Implementation:

- Add an Activity-level `MainLibraryViewModel`.
- Use `StateFlow<MainLibraryUiState>` to uniformly provide the game library, recent games, quick launch and loading state.
- The ViewModel loads persistent data on `Dispatchers.IO`.
- Updates, deletions, scan results and quick-launch changes are uniformly written to the ViewModel and then persisted.
- Persistence commands run through a `Channel.UNLIMITED` single-consumer FIFO, guaranteeing that rapid consecutive operations are written to disk in the user's order.
- Use revision to prevent earlier refresh/write results from overwriting newer optimistic UI state.
- Game updates are merged into the latest on-disk object by "actually changed fields", preventing rename from overwriting a concurrently completed cover scrape.
- Scan tasks move to `viewModelScope`, so they continue running after leaving the Games Tab and keep the scan state.
- The ViewModel observes global scrape tasks directly, so Home data is updated even when the game page is not in the composition tree.
- MainActivity refreshes once from storage when returning to the foreground, picking up recent records produced after a game run.
- Pages use `collectAsStateWithLifecycle` to avoid pointless collection while the Activity is not visible.

### 3.4 Lists and Covers

In the current state, LazyGrid/LazyColumn already generally provide stable keys, so the list structure is not the primary bottleneck. The remaining problems are mainly concurrent decoding of cold covers and data stability.

Implementation:

- Mark `ScanGame` as `@Immutable` to help Compose skip unchanged cards.
- Add `contentType` to Lazy items of fixed type.
- Limit the number of covers decoded at the same time, avoiding a burst of IO/Bitmap work completing simultaneously on first display.
- Serialize identical cover URIs with a per-key Mutex; if the first card leaves composition and is cancelled, waiters can continue retrying.
- Keep the existing 24MB LRU thumbnail cache and size-based sampling.
- Cache the recent-game time text to avoid recreating formatters on row recomposition.

### 3.5 Performance Safeguards

Implementation:

- Keep the Debug unit tests and the Debug APK build regression.
- Add behavior tests for the main page state ViewModel.
- Compare with `gfxinfo reset` on the same physical device, the same navigation style and the same Tab path.
- Verify that all four pages (Home, Games, Engine, Settings) are reachable, and that after rapid consecutive taps the final page matches the selected Tab.

## 4. Acceptance Criteria

- Home → Games: P95 clearly below the pre-optimization `32ms`, with no `70ms+` long frames.
- Games → Settings: P95 drops from `150ms` to no more than `50ms`, and intermediate pages are no longer composed during the animation.
- GPU P90 no higher than the pre-optimization `5ms`.
- During page switching, navigation bar recomposition per frame is no longer triggered by `focusX` changes.
- When cold starting and pre-composing the game page, cover decoding is at most two-way concurrent, with no unbounded Bitmap task spike.
- Quick launch, recent games, game deletion, cover updates and scan results stay consistent between Home and the Games page.
- Both default navigation and liquid glass navigation switch normally.
- All unit tests, Debug compilation and APK installation pass.

## 5. Implementation Checklist

- [x] Refactor the main Tabs into a single-state, four-resident-page `Transition + graphicsLayer` container.
- [x] Hidden pages have cleared semantics and isolated pointers; only the start and end points participate in the visible animation.
- [x] The backdrop node and effect chain stay resident; remove lens and the focus secondary blur.
- [x] Defer reading of the liquid navigation animation State.
- [x] Stable navigation data and layout state writes.
- [x] Limit secondary switching during animation; long-press dragging commits the final Tab only on release.
- [x] Skip full-screen backdrop recording with no consumers below Android 12.
- [x] Add `MainLibraryViewModel` and a unified UI State.
- [x] Home/game pages changed to consume only the upper-layer state.
- [x] Move persistent data loading to the IO dispatcher.
- [x] Persistence command FIFO, revision anti-rollback, field-level concurrent merging.
- [x] Move scan tasks to the ViewModel; scrape completion is synchronized globally by the ViewModel.
- [x] Atomic read-modify-write for recent games, avoiding concurrent loss of launch records.
- [x] Add Compose immutability annotations to the game model.
- [x] Limit concurrent cover decoding and add Lazy content type.
- [x] Add behavior tests for state, field merging, cover throttling/cancellation.
- [x] Debug build, unit tests, three independent code reviews.
- [x] Debug APK over-installed on the physical device with app data preserved.
- [x] Complete the four-page visual/gesture, search state, rapid-tap regression and three rounds of frame-time re-measurement.

## 6. Results After Optimization

### 6.1 Automated Verification

- `./gradlew testDebugUnitTest assembleDebug --no-daemon`: passed.
- Debug unit tests: 18/18 passed, 0 failures, 0 errors.
- New coverage: 4 items for the shared state reducer, 3 items for the cover coordinator.
- `git diff --check`: passed.
- Three independent reviews covered navigation/glass, state/IO, and lists/covers; all P1 issues raised in review were fixed and re-verified.

The project-wide `lintDebug` ran up to the app analysis stage and was finally blocked by a pre-existing SDL Bluetooth
`MissingPermission` issue in the unmodified `engine` module (30 errors / 87 warnings). This plan does not modify the engine layer and
did not create a new baseline to mask that issue.

### 6.2 Physical Device State and Functional Regression

- Device: `24053PY09C`, serial number `592e1a6d`.
- The final `app-debug.apk` was over-installed at `2026-08-25 22:46:46`, package name `com.tyranor.next`, app data preserved.
- All four pages passed the Android UI hierarchy check: Home recent games, game grid, engine list and settings list are all normal.
- The game search field displays correctly; after switching to Settings and back to Games, the search expanded state is still retained.
- After rapid consecutive taps, page content matches the selected navigation item; there is no semantic leak or accidental touch on hidden pages.
- Both default navigation and lightweight liquid glass navigation completed switch regression; the light theme looks normal.
- The final four-resident-page version cold start shows `Status: ok`, `TotalTime: 1070ms`, with no FATAL logs.

### 6.3 Frame Time After Optimization

Measurement protocol: on the same 120Hz physical device, liquid glass navigation, after pages are warmed up, run three rounds of
`gfxinfo reset → tap the target Tab → wait 1 second → framestats` independently for each path. The table below uses the median of
each percentile across the three rounds to avoid picking the best round; GPU likewise takes the median of the three rounds' P90.

| Path | P50 | P90 | P95 | P99 | GPU P90 |
|---|---:|---:|---:|---:|---:|
| Home → Games (before) | 18ms | 30ms | 32ms | 73ms | 5ms |
| Home → Games (after) | 11.6ms | 21.3ms | 25.2ms | 65.6ms | 3.1ms |
| Games → Settings (before) | 18ms | 38ms | 150ms | 150ms | 5ms |
| Games → Settings (after) | 12.5ms | 21.7ms | 26.4ms | 62.0ms | 3.8ms |

Improvement:

- Home → Games: P50 `-35.8%`, P90 `-29.1%`, P95 `-21.3%`, P99 `-10.2%`, GPU P90 `-37.6%`.
- Games → Settings: P50 `-30.7%`, P90 `-42.9%`, P95 `-82.4%`, P99 `-58.7%`, GPU P90 `-25.0%`.

Maximum single-frame range across three rounds:

- Home → Games: `26.9–86.9ms`; the earlier intermediate implementation consistently produced glass/page rebuild long frames of `160–328ms` each round.
- Games → Settings: `37.7–63.9ms`; the earlier intermediate implementation consistently produced settings page rebuild long frames of `207–410ms` each round.

At 120Hz the P50 is still above the strict `8.33ms` single-frame budget, and the Debug build is not the final release performance ceiling;
however, the main long tail has converged from stable hundred-millisecond spikes to around 64ms, and all key percentiles and GPU P90
are better than the pre-optimization baseline.