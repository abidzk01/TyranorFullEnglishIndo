# FVP Custom Font (User Font Replacement) Integration Plan

> Status: **Implemented (M0–M3 complete; build/unit tests pass, on-device interaction acceptance pending device connection, see "Implementation Record" at the end)**
> Related: `docs/fvp-engine-integration-plan.md` (FVP built-in engine, already implemented); upstream `xmoezzz/rfvp` (MPL-2.0, fork baseline `304e773` + FVP integration changes)
> Summary of conclusion: **App-private font + new ABI "force default font" route (option B)**.
> Font files reuse the existing `FontImport` to copy into `filesDir/fonts/`; at launch they are delivered via the `FVP_FONT_PATH` extra, and the host calls the new
> `rfvp_android_add_font` / `rfvp_android_set_forced_font` after create; the effect = the user-selected font replaces the game's default font globally (including Latin and CJK),
> while missing glyphs continue through the "system font fallback → built-in MS fonts" chain. Phase 1 does not do font subsetting, TTC face selection, or font downloads.

---

## 0. Terminology and Naming

| Item | Value |
|---|---|
| Feature name | Custom Font / Force Default Font |
| Engine settings key | `fvp_font` (String: empty = follow game default; otherwise the absolute path of an App-private font) |
| Per-game override key | `fvp_font` (null = follow global; `""` = follow game default; path = custom) |
| Partition key | `KEY_FVP_FONT` (persisted in the tyrano partition, avoiding a Room migration) |
| Intent extra | `LaunchContract.FVP_FONT_PATH = "fvp_font_path"` |
| New C ABI | `rfvp_android_add_font(handle, path) -> i32`, `rfvp_android_set_forced_font(handle, font_id)` |
| Font storage | `filesDir/fonts/<original file name>` (reuses `FontImport.importToPrivate`, no new directory) |
| Host methods | `NativeRfvp.addFont(long, String) -> int`, `NativeRfvp.setForcedFont(long, int)` |
| When it takes effect | after engine create and before the first frame (same point as `setTextHidpi` / `setSystemFont`) |

---

## 1. Background and Goals

### 1.1 Current State

rfvp's font capabilities are already fairly complete (see §2.1 in detail). Currently, FVP users in TyranorNext have three font options:

1. **The game's own `font/` directory**: put TTF/OTF/TTC into `<game root>/font|Font|FONT/` and it loads automatically, no settings required;
2. **System font fallback** (the FVP engine settings already have a switch): uses Android system CJK fonts (Noto Sans CJK etc.) to fill glyphs when missing;
3. **In-game font menu**: FVP scripts can enumerate and select fonts via `TextFontCount/TextFontName/TextFontSet` (included with some games).

Measured (desktop rfvp, `/tmp/hm_chs/font/HiraginoSansGB.ttc` → points to Hiragino Sans GB):

```
Loaded custom font face 'ヒラギノ角ゴ 簡体中文' from /tmp/hm_chs/font/HiraginoSansGB.ttc
Font scan done: loaded 1 custom font(s) from /tmp/hm_chs/font
```

That is, "drop a font into `font/` and it takes effect" is already verified; the font's internal name, file name, and file stem all work as matching keys
(`text_manager.rs:312 matches_name`).

### 1.2 Problems

- Users cannot pick a font inside the app: they must either dig through the game directory or rely on system fallback, which is a high barrier;
- Game-directory fonts cannot achieve "global replacement": when a script explicitly requests MS Gothic/MS Mincho, latin/digits/punctuation still use the built-in font
  (the built-in face is only overridden by the game font on CJK code points);
- Per-game and global cannot be layered: users want to pick once in settings, apply to all FVP games, and then override individually for a few games.

### 1.3 Goals and Non-Goals

**Goals**

- Provide "custom font" in FVP engine settings (global) and per-game settings (override): follow game default / import from the file picker / reset;
- Once selected, it **takes effect globally by force** (overriding the script's request for the built-in font), while missing glyphs go through system fallback and the built-in fallback;
- Font files are stored in the App-private directory, without modifying the game directory and without requiring all-files permission;
- Independent from the existing "system font fallback" and "text HiDPI" switches.

**Non-goals (phase 1)**

- Font subsetting/compression, per-face (TTC face) selection, per-weight selection;
- Font downloads/store, cloud sync;
- A "soft" mode that only replaces CJK code points while keeping built-in Latin (P2 alternative);
- Linked display of the in-game font menu (P2).

---

## 2. Upstream Survey Conclusions (measured)

### 2.1 rfvp Font Stack

| Module | Behavior | Source |
|---|---|---|
| Custom font directory | `<game root>/font` (case-compatible `Font`/`FONT`), scans `*.ttf/otf/ttc`, calls `load_font_file` for each and appends to `fonts: Vec<LoadedFont>` | `text_manager.rs:748-798`, `:397-445` |
| Font name resolution | prefers the font's `name` table (`extract_font_face_name`), falls back to the file stem/file name | `text_manager.rs:425-431`, `:638` |
| Name matching | internal name / file name / file stem, any of the three, case-insensitive | `text_manager.rs:312-320` |
| Font enumeration (script-visible) | `TextFontCount` / `TextFontName(id)` / `TextFontGet` / `TextFontSet(id)`; user font ids ≥ 0, built-in fixed ids < 0 (MS Gothic=-2 etc.) | `syscalls/text.rs:267-308` |
| Missing glyph fallback | `get_font_fallback_set(id)`: primary font + `preferred_cjk` (prefers game/system CJK fonts when the built-in face is requested) + fallbacks (custom → system fallback → 4 built-in faces) | `text_manager.rs:946-985` |
| Current font resolution | `FONTFACE_CURRENT` matches built-in names/loaded fonts by `current_font_name` | `text_manager.rs:873-922` |
| Font selection for rendering | rendering uses `text_font_idx1/2` (primary/ruby annotation) to call `get_font_fallback_set` | `text_manager.rs:2524-2525` |
| Glyph rasterization | ab_glyph lazy loading (parses headers only, rasterizes glyphs on demand) | `font.rs` header comment |
| TTC | only the first face is loaded (ttf-parser face 0), no face selection provided | `Font::from_vec` |

### 2.2 Gaps (Reasons a Fork Is Needed)

| # | Gap | Description |
|---|---|---|
| G1 | No "append font file at runtime" API | `load_font_file` is module-private, and `FontEnumerator` exposes no append entry either; `fonts` is only populated during `init_fontface()` |
| G2 | No concept of "forced default font" | Once a script selects a built-in face via `TextFontSet`, the game font is only preferred on CJK code points; Latin/punctuation cannot be replaced |
| G3 | No font-related entry in the Android ABI | the existing ABI only has `set_text_hidpi` / `set_system_font`, with no add/force |
| G4 | No font extra in the host | `LaunchContract` has no FVP font key, and `FvpActivity` is unaware of fonts |

### 2.3 TyranorNext Current State and Reusable Parts

| Component | Current state | How to reuse |
|---|---|---|
| `FontImport.importToPrivate(ctx, uri)` | unified extension allowlist (`.ttf/.ttc/.otf/.otc`) + copy to `filesDir/fonts/<original file name>` | **reuse directly**, FVP adds no import implementation |
| `FontPreference(label, value, followLabel, onFollow, onPick, valueInSummary)` | the font selection row shared by KRKR global/per-game (Miuix `ArrowPreference` + dialog) | reuse directly; pass `followLabel` as "follow game default"/"follow global" |
| KRKR precedent | global `F_DEFAULT_FONT` + `F_FORCE_DEFAULT_FONT`; `engine_settings_default_font` / `engine_settings_use_builtin_font` strings | reference for semantics and string style |
| Existing FVP settings | `fvp_nls` / `fvp_system_font` / `fvp_text_hidpi` (engine settings card + per-game branch) | append the font row in the same card/branch |
| Measured data | Hiragino Sans GB.ttc 23.5 MB; `fs::read` loads it into memory at once, ab_glyph rasterizes lazily, resident ≈ file size + glyph cache | basis for risk and time estimates |

---

## 3. Overall Design

### 3.1 Route Selection

| | A. Import into the game `font/` directory | **B. App-private font + forced default font (chosen)** |
|---|---|---|
| Engine changes | none | fork adds 2 ABIs (rebuild `.so`) |
| Font location | `<game root>/font/` (pollutes the game directory, needs all-files permission) | `filesDir/fonts/` (App-private, no permission required) |
| Scope | CJK code point priority + optional in the in-game font menu | **global forced replacement** (including Latin/digits/punctuation) |
| Reset | requires deleting files from the game directory | just clear the setting, game data untouched |
| Global/per-game | per-game is naturally isolated, global requires iterating all games | one setting applies to all games, per-game can override |
| Effort | ~0.5–1 day | ~2–3 days (including fork + `.so` + on-device regression) |

Conclusion: take **B**. A's "game directory font" is retained as an existing capability (no development needed) and is mentioned in the docs and settings notes.

### 3.2 Data Flow

```
Settings (engine settings global / per-game override)
  └─ fvp_font (empty = follow game default; path = filesDir/fonts/xxx.ttf)
       └─ EngineLauncher.buildFvpIntent
            extras: FVP_FONT_PATH (only delivered when non-empty)
       └─ FvpActivity.ensureEngine() (after create succeeds, before the first frame)
            ├─ NativeRfvp.setTextHidpi / setSystemFont            // existing
            ├─ int id = NativeRfvp.addFont(handle, path)          // new: load and return the font id
            └─ if (id >= 0) NativeRfvp.setForcedFont(handle, id)  // new: set as the forced default font
       └─ rfvp: FontEnumerator::add_font_file → set_forced_font
            └─ get_font_fallback_set(id) at render time: the forced font is used as the primary font
```

### 3.3 Forced Semantics and Priority Chain

```
Primary font:
  forced font (if configured and loaded successfully)
  └─ otherwise: the script's current font (current logic: built-in face prefers the game font/ font on CJK)
Missing-glyph fallback (in order):
  other loaded fonts (game font/ + App-private)
  → system CJK fallback fonts (scans /system/fonts when fvp_system_font is enabled)
  → built-in MS Gothic / MS Mincho / MS PGothic / MS PMincho
```

- **When force is enabled, the script's `TextFontSet` selection of a built-in face is overridden** (this is the expected semantics of "user font replacement", consistent with KRKR's "force default font");
- If a script explicitly selects a **user font id** (≥ 0), it is likewise overridden by the forced font in phase 1, so that the setting is what you see;
- After turning force off (setting back to "follow game default"), behavior is exactly the same as the current state.

### 3.4 Key Decisions

1. **Private fonts + no game directory pollution**: fonts are copied by `FontImport` into `filesDir/fonts/` (same directory and implementation as KRKR);
2. **New ABIs instead of extending the create signature**: keeps create stable; the font path is optional and a failure does not block startup;
3. **`forced_font` is specified by font id**: `add_font` returns the id, `set_forced_font(-1)` disables it; future multi-font switching/face selection will not require changing the ABI structure;
4. **Do not actively delete font files**: global and per-game may reference the same path; replace/reset only changes settings (phase 1 does no reference-scanning cleanup, P2 provides "clean up unused fonts");
5. **Three states per game**: follow global / follow game default / custom (reusing the KRKR override pattern);
6. **TTC only the first face**: accepted in phase 1, noted in the settings explanation; if per-face selection is needed, P2 extends `add_font(path, face_index)`;
7. **Compatible with older `.so`**: the bridge layer only logs when new symbols are missing; the host calls them only when the extra is non-empty, so with an old library the feature automatically degrades to "not enabled".

---

## 4. App-Side Change List

### 4.1 Settings Storage

| File | Change |
|---|---|
| `core/settings/EngineSettingsStore.kt` | `KEY_FVP_FONT = "fvp_font"`; `getFvpFont(c): String` (default `""`), `setFvpFont(c, path)`; normalize empty string |
| `core/settings/EngineSettingsResolver.kt` + `ResolvedEngineSettings` | new `fvpFont: String` (global value + per-game override: `resolve(override, global)`; the empty string is legal and means "follow game default") |
| `core/settings/PerGameSettingsStore.kt` | `F_FVP_FONT = "fvp_font"` |
| `core/game/storage/GameOverridePartitions.kt` | `KEY_FVP_FONT` constant added to `TYRANO_KEYS` (same policy as `KEY_FVP_NLS`) |
| `core/settings/EffectiveEngineSettings.kt` | reuse `resolve` (no allowlist for paths; only emptiness is checked) |

### 4.2 Font Import

**Zero new implementation**: call `FontImport.importToPrivate(ctx, uri)` directly (`ui/settings/FontSettings.kt:31-53`),
the extension allowlist already covers `.ttf/.ttc/.otf/.otc`, and the destination is `filesDir/fonts/<original file name>`.

### 4.3 Launch Chain

| File | Change |
|---|---|
| `engine/.../LaunchContract.kt` | `const val FVP_FONT_PATH = "fvp_font_path"` |
| `app/.../EngineLauncher.kt` `buildFvpIntent` | `if (settings.fvpFont.isNotBlank()) putExtra(LaunchContract.FVP_FONT_PATH, settings.fvpFont)` |

### 4.4 UI

| File | Change |
|---|---|
| `ui/settings/SettingsScreen.kt` FVP card | add `FontPreference` (`followLabel = engine_settings_fvp_font_follow`), `onFollow = { fvpFont = "" }`, `onPick = { fontLauncher.launch("*/*") }`; display the value with `File(path).name`; `saveAll` writes `setFvpFont` |
| `ui/settings/PerGameSettingsScreen.kt` FVP branch | add a font row (`valueInSummary = true`): `followLabel = engine_settings_follow_global`, with the three states null/""/path; reuse the page's existing `fontLauncher` |
| Explanation text | add at the bottom of the card: "Fonts apply to FVP only; TTC uses the first face; missing glyphs fall back to system fonts" |

### 4.5 Strings (Strictly Consistent Across Three Languages)

New keys (names in Appendix B): `engine_settings_fvp_font_title`, `engine_settings_fvp_font_follow`,
`engine_settings_fvp_font_hint`, `engine_settings_fvp_font_import_failed`.
Reuse existing: `engine_settings_select_font_file`, `engine_settings_follow_global`,
`engine_settings_follow_global_with_value`, `engine_settings_use_builtin_font` (no new ones required).

### 4.6 Other

- `GameSaveManager` / plugins / scanning: no functional branch changes;
- no new permissions (fonts are in the App-private directory).

---

## 5. engine-Side Change List

### 5.1 Contract

`engine/src/main/java/com/core/engine/LaunchContract.kt`

```kotlin
// ---------- FVP ----------
/** Custom font path (absolute path in the App-private directory; absent means follow game default/do not force). */
const val FVP_FONT_PATH = "fvp_font_path"
```

### 5.2 Host `com/core/fvp/FvpActivity.java`

`ensureEngine()` appends the following after the existing `setTextHidpi` / `setSystemFont`:

```java
String fontPath = getIntent().getStringExtra(LaunchContract.FVP_FONT_PATH);
if (fontPath != null && !fontPath.trim().isEmpty()) {
    int fontId = NativeRfvp.addFont(handle, fontPath.trim());
    if (fontId >= 0) {
        NativeRfvp.setForcedFont(handle, fontId);
        Log.i(TAG, "forced font enabled: id=" + fontId + " path=" + fontPath);
    } else {
        Log.w(TAG, "custom font load failed, fall back to game default: " + fontPath);
    }
}
```

Failures produce no Toast and do not block (the settings page shows the current path for the user to check).

### 5.3 JNI Bridge `engine/src/main/cpp/rfvp_bridge.cpp`

- `RfvpApi` adds `add_font: int32_t (*)(void*, const char*)`, `set_forced_font: void (*)(void*, int32_t)`;
- loaded as **optional symbols** in `load_api_once`: absence only triggers `LOGW` (compatible with an un-upgraded `librfvp.so`);
- JNI wrappers:
  - `Java_com_core_fvp_NativeRfvp_addFont(JNIEnv*, jclass, jlong handle, jstring path) -> jint`
  - `Java_com_core_fvp_NativeRfvp_setForcedFont(JNIEnv*, jclass, jlong handle, jint fontId)`

### 5.4 `NativeRfvp.java`

```java
/** Append a font file and return the font id (≥0 success; -1 failure/unsupported by an old library). */
public static native int addFont(long handle, String fontPathUtf8);

/** Set/clear the forced default font (fontId < 0 clears it). */
public static native void setForcedFont(long handle, int fontId);
```

### 5.5 Packaging

No new `.so`; replace the rebuilt `librfvp.so` (containing the new ABIs). `consumer-rules` already keeps `com.core.fvp.**`, no change needed.

---

## 6. fork (rfvp) Changes

Baseline: `/Users/weiss/github- engine/rfvp` (on top of the FVP integration changes).

### 6.1 Android C ABI (`crates/rfvp/src/android_host.rs`)

```c
/// Append one font file; returns the font id (≥0), or -1 on failure.
int32_t rfvp_android_add_font(void* handle, const char* font_path_utf8);

/// Set the forced default font; font_id < 0 clears it.
void rfvp_android_set_forced_font(void* handle, int32_t font_id);
```

### 6.2 `FontEnumerator` (`subsystem/resources/text_manager.rs`)

```rust
// field
forced_font_id: Option<i32>,

// new public APIs
pub fn add_font_file(&mut self, path: &Path) -> Option<i32>;   // reuse load_font_file, push then return the index
pub fn set_forced_font(&mut self, id: Option<i32>);             // out-of-range/invalid id normalizes to None

// interception points: get_font(id) and get_font_fallback_set(id)
// when forced is active: primary = fonts[id], preferred_cjk is cleared (the forced font is the primary font),
// fallbacks = other loaded fonts + system fallback (if enabled) + 4 built-in faces
```

- the `no_std` branch provides empty implementations with the same names (keeping the compile surface consistent);
- when `init_fontface()` rescans it clears `forced_font_id` to avoid a dangling id.

### 6.3 `App` Wrapper (`crates/rfvp/src/app.rs`)

```rust
pub fn add_font_file(&mut self, path: &std::path::Path) -> Option<i32>;
pub fn set_forced_font(&mut self, id: Option<i32>);
```

Internally goes through `gd_write(&self.game_data).fontface_manager`, the same pattern as `set_system_font_fallback_enabled`.

### 6.4 Build and Versioning

```bash
cd "/Users/weiss/github- engine/rfvp"
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/28.0.13004108"
CARGO_NDK_PLATFORM=26 cargo ndk -t arm64-v8a -o /tmp/rfvp-android-font build --release -p rfvp --lib
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" --strip-unneeded \
  /tmp/rfvp-android-font/arm64-v8a/librfvp.so
cp /tmp/rfvp-android-font/arm64-v8a/librfvp.so \
   /Users/weiss/opencode/rma/TyranorNext/engine/src/main/jniLibs/arm64-v8a/
```

- record the baseline commit; keep the MPL-2.0 notice;
- ABIs are only added, never changed, so old host binaries are unaffected.

---

## 7. Key Interaction Details

### 7.1 When It Takes Effect

- same point as `setTextHidpi` / `setSystemFont` (after create succeeds, before the first frame), ensuring the title screen already uses the selected font;
- setting changes require restarting the session to take effect (consistent with text encoding), noted in the settings info card.

### 7.2 Missing Glyphs and Fallback

- the forced font is the primary font; missing glyphs are tried in order: other loaded fonts → system CJK fallback (when the switch is on) → built-in MS faces;
- if the user-selected font lacks simplified Chinese glyphs and system fallback is off, it falls back to the built-in font's glyphs (which may not suit the user's taste); the settings note suggests "keep system font fallback enabled".

### 7.3 Relationship with the In-Game Font Menu

- when force is enabled, in-game font selection is overridden (a design trade-off);
- if the user wants to choose via the in-game menu, setting it to "follow game default" takes effect (no extra delivered, no force).

### 7.4 Global and Per-Game

| Level | Value | Behavior |
|---|---|---|
| Global | `""` | follow game default (current behavior) |
| Global | path | all FVP games force that font |
| Per-game | null | follow global |
| Per-game | `""` | that game follows the game default (ignoring global) |
| Per-game | path | that game forces that font (may point to a different font file than global) |

### 7.5 Font File Lifecycle

- import: `FontImport` copies it as-is to `filesDir/fonts/<original file name>`, overwriting same names;
- replace/reset: only settings are changed, files are not deleted (they may be shared with other games/global);
- uninstalling the app clears the private directory along with it; P2 provides "clean up unused fonts" (delete after scanning global + all per-game override references).

### 7.6 Compatibility and Failure Degradation

| Scenario | Behavior |
|---|---|
| Old `.so` (no new symbols) | bridge `LOGW`, `addFont` returns -1; force is not enabled, the game runs as it currently does |
| Font file deleted/corrupted | `addFont` fails → fall back to the game default font; visible in logs |
| Empty path | no extra delivered, host does not call the new ABIs |
| `.ttc` multiple faces | only the first face takes effect (noted in the explanation text) |

---

## 8. Build and Integration Steps

```bash
# 1) fork: add ABIs + rebuild librfvp.so (see §6.4), strip then add to jniLibs
# 2) integration build and verification
./gradlew :app:assembleDebug --no-daemon
./gradlew :app:testDebugUnitTest --no-daemon
python3 tools/check-hardcoded-ui-strings.py
git diff --check
```

CI impact: no Rust toolchain requirement (`.so` committed); APK size unchanged (only replacing the same-named `.so`).

---

## 9. Testing and Acceptance

### 9.1 Unit Tests

| Case | Content |
|---|---|
| `EffectiveEngineSettingsTest` (extended) | `fvpFont` empty string/path merging (override takes precedence, empty string is legal) |
| `GameOverridePartitionsTest` (extended) | `F_FVP_FONT` contract assertions + tyrano partition round trip |
| Settings resolution (with Context) | covered by on-device acceptance, no new Robolectric |

### 9.2 On-Device Acceptance (Huawei MAA-AN10, HappyMarguerite CHS full data)

1. import a Chinese font globally (e.g. LXGW WenKai / Source Han Sans) → launch the Japanese original and the translation (`gbk`/`sjis`):
   Chinese characters, full-width punctuation, and Latin letters all use the selected font;
2. turn off system font fallback + have the forced font miss a glyph → observe the fallback chain (the built-in font fallback must not crash);
3. set to "follow game default" → behavior identical to before integration;
4. per-game override: game A custom, game B follows global, independent of each other;
5. reset/delete the font file then launch → falls back to the game default, with a log entry;
6. launch time and memory: compare first-frame time and resident memory before/after importing a 20–40 MB font;
7. in-game font menu: overridden when force is on, selectable again after force is off (verifying the priority design);
8. old `.so` compatibility drill (optional): replace with the pre-integration `librfvp.so`; the app must not crash and the feature degrades.

### 9.3 Rollback

- removing the FVP font setting and the `FVP_FONT_PATH` delivery returns to the current state (lingering font files and key values are harmless);
- the ABIs added in the `.so` are incremental, no rollback risk.

---

## 10. Risks and Open Questions

| Risk | Impact | Mitigation |
|---|---|---|
| Font copyright | user-supplied fonts, the App bundles and distributes none | settings note states "please use fonts you have the right to use" |
| Large font memory/first-frame time | 20–40 MB resident + first-frame parsing | ab_glyph lazy loading; acceptance includes timing comparison; font subsetting in P2 if necessary |
| TTC only the first face | the face some users expect does not apply | noted in the explanation text; P2 extends face selection |
| Full-width/half-width metric differences | layout overflow/line-break changes after changing font | inherent to changing fonts; provide one-tap reset |
| Conflict with the in-game font menu | in-game selection "has no effect" | forced semantics + can be disabled; docs and settings notes |
| Font files piling up | private directory grows | P2 "clean up unused fonts" |
| Old `.so` missing symbols | call failures | bridge optional symbols + host degradation (§7.6) |

Open questions (decided during review):

1. whether selecting a custom font should force by default (recommended: yes; "follow game default" means no force);
2. whether P2 should provide a "soft" mode that only replaces CJK glyphs (keeping built-in Latin);
3. whether per-game needs "multi-font selection independent of global" (phase 1 uses a single value, recommended not to do it);
4. whether the settings card should show the font file's internal font name (requires reading the name table; recommended to show only the file name in phase 1).

---

## 11. Milestones (Suggested Implementation Order)

| Stage | Content | Dependency | Estimate |
|---|---|---|---|
| M0 | fork: `add_font_file` / `set_forced_font` + 2 ABIs + rebuild and strip `.so` | none | 0.5–1 day |
| M1 | engine: `LaunchContract.FVP_FONT_PATH` + `FvpActivity` wiring + bridge/NativeRfvp | M0 | 0.5 day |
| M2 | app: Store/Resolver/Partition/Launcher + global and per-game font rows + strings ×3 | M1 | 0.5–1 day |
| M3 | unit tests + on-device acceptance (§9.2) + plan document implementation record | M2 | 0.5–1 day |
| Phase 2 | multi-font management/cleanup, TTC face selection, soft mode, in-game menu linkage | M3 | to be scheduled |

---

## Appendix A: New ABI Reference Table

| Shim JNI (`com.core.fvp.NativeRfvp`) | C ABI | Return value/semantics |
|---|---|---|
| `addFont(handle, path)` | `rfvp_android_add_font` | font id (≥0) or -1 |
| `setForcedFont(handle, id)` | `rfvp_android_set_forced_font` | id < 0 clears the force |

## Appendix B: New String Keys (Three Languages)

| Key | zh | ja | en |
|---|---|---|---|
| `engine_settings_fvp_font_title` | 自定义字体 | カスタムフォント | Custom font |
| `engine_settings_fvp_font_follow` | 跟随游戏默认 | ゲーム既定に従う | Follow game default |
| `engine_settings_fvp_font_hint` | 仅对 FVP 生效；TTC 使用首个字面；缺字由系统字体回退兜底；修改后需重新进入游戏 | FVP のみ有効。TTC は先頭フェイスのみ。欠け字形はシステムフォントで補完。変更後は再起動が必要 | FVP only. TTC uses the first face. Missing glyphs fall back to system fonts. Restart to apply |
| `engine_settings_fvp_font_import_failed` | 字体导入失败:请选择 ttf/otf/ttc 文件 | フォントの読み込みに失敗しました:ttf/otf/ttc を選択してください | Font import failed: choose a ttf/otf/ttc file |

## Appendix C: Settings Keys and Priority

| Key | Level | Value | Default |
|---|---|---|---|
| `fvp_font` | global | `""` \| absolute path | `""` (follow game default) |
| `fvp_font` | per-game | `null` \| `""` \| absolute path | `null` (follow global) |

Effective resolution order: per-game override > global; `""` explicitly means "follow game default"; when the path does not exist it falls back to the game default (without writing to settings).

## Appendix D: Relationship with Existing Font Options

| Option | Priority | Scope | Dependency |
|---|---|---|---|
| This plan's "custom font" (forced) | highest (when force is on) | global replacement (including Latin) | App-private + new ABIs |
| Game `font/` directory fonts | medium (CJK code point priority when a built-in face is requested) | CJK glyphs | shipped with the game/placed manually by the user |
| System font fallback (`fvp_system_font`) | fallback layer | fills missing glyphs | Android system fonts |
| Built-in MS Gothic/Mincho etc. | last resort | all code points | built into rfvp |

---

## Implementation Record (M0–M3)

### M0 fork changes (`/Users/weiss/github- engine/rfvp`, uncommitted)

| File | Change |
|---|---|
| `crates/rfvp/src/subsystem/resources/text_manager.rs` | `FontEnumerator` gains the `forced_font_id` field and `add_font_file(path) -> Option<i32>` / `set_forced_font(id)` / `forced_font_id()` / `is_font_forced()` / `forced_font()`; `get_font(id)` returns the forced font first; `get_font_fallback_set(id)` disables and reorders `preferred_cjk` when forced; `init_fontface()` clears the forced id at the start; the no_std branch gets empty implementations; new unit test `font_enumerator_tests::add_font_file_returns_id_and_force_normalizes` |
| `crates/rfvp/src/app.rs` | `App::add_font_file(&Path) -> Option<i32>`, `App::set_forced_font(Option<i32>)` (via `gd_write`, same pattern as `set_system_font_fallback_enabled`) |
| `crates/rfvp/src/android_host.rs` | add exports `rfvp_android_add_font(handle, path) -> i32`, `rfvp_android_set_forced_font(handle, id)` |

Build and commit (API 26):

```bash
cd "/Users/weiss/github- engine/rfvp"
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/28.0.13004108"
CARGO_NDK_PLATFORM=26 cargo ndk -t arm64-v8a -o /tmp/rfvp-android-font build --release -p rfvp --lib
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" --strip-unneeded \
  /tmp/rfvp-android-font/arm64-v8a/librfvp.so
cp /tmp/rfvp-android-font/arm64-v8a/librfvp.so \
   engine/src/main/jniLibs/arm64-v8a/
```

Measured: `librfvp.so` 40,534,728 B after strip (+4,928 B over the pre-integration build); `rfvp_android_add_font` / `rfvp_android_set_forced_font` confirmed exported.

### M1 engine-side changes

- `LaunchContract.kt`: add `FVP_FONT_PATH = "fvp_font_path"`;
- `rfvp_bridge.cpp`: `RfvpApi` gains the two **optional symbols** `add_font` / `set_forced_font` (absence only triggers `LOGW`, compatible with old `.so`); add JNI `addFont` / `setForcedFont`;
- `NativeRfvp.java`: add `addFont(long, String) -> int`, `setForcedFont(long, int)`;
- `FvpActivity.java`: `ensureEngine()` calls `applyCustomFont()` after hidpi/system font (only executed when the extra is non-empty; load failures silently fall back to the game default).

### M2 app-side changes

- storage/resolution: `EngineSettingsStore` (`KEY_FVP_FONT` + `getFvpFont/setFvpFont/normalizeFvpFont`), `EngineSettingsResolver`/`ResolvedEngineSettings.fvpFont`, `PerGameSettingsStore.F_FVP_FONT`, `GameOverridePartitions.KEY_FVP_FONT` (added to `TYRANO_KEYS`);
- launch: `EngineLauncher.buildFvpIntent` delivers `FVP_FONT_PATH` when non-empty;
- UI: the `SettingsScreen` FVP card gains a `FontPreference` row + a dedicated `fvpFontLauncher` (import failure Toast) + `fvp_font_hint`; the `PerGameSettingsScreen` FVP branch gains a three-state `OverrideFontPreference` (follow global / follow game default / choose font file) and `fvpFontLauncher`;
- strings ×3: `engine_settings_fvp_font_title` / `..._follow` / `..._hint` / `..._import_failed`;
- unit tests: `EffectiveEngineSettingsTest.fvpFontOverrideSupportsExplicitGameDefault`, `GameOverridePartitionsTest` (`F_FVP_FONT` round trip + contract assertions).

### Deviations from the plan

1. The per-game font row did not change the shared `FontPreference` (it only supports the two states "follow + choose"); instead a private `OverrideFontPreference` was added inside `PerGameSettingsScreen` to implement three states; the shared component and KRKR behavior are unaffected.
2. Plan §6.2's "rescan clears the forced id" is implemented as unconditional clearing at the entry of `init_fontface()` (including the first scan), with the host re-applying it after create; the semantics are the same and simpler.
3. The new `FontEnumerator::forced_font_id()` getter is used only for unit test assertions.

### Verification results

- `cargo check -p rfvp`: passed;
- `cargo test -p rfvp --lib font_enumerator_tests`: 1 passed (load returns id=0, invalid id normalized, rescan clears, missing file returns None);
- `./gradlew :app:assembleDebug --no-daemon`: passed; the APK's `librfvp.so` exports `rfvp_android_add_font/set_forced_font`, and `librfvp_bridge.so` exports `Java_com_core_fvp_NativeRfvp_addFont/setForcedFont` (verified with `llvm-nm`);
- `./gradlew :app:testDebugUnitTest --no-daemon`: passed (`EffectiveEngineSettingsTest` 17 cases, `GameOverridePartitionsTest` 7 cases);
- `python3 tools/check-hardcoded-ui-strings.py`, `git diff --check`: passed;
- **On-device acceptance (§9.2): not executed** — the adb device was disconnected at execution time (`adb devices` empty, the APK had been built and contained the new symbols). Once the device is reconnected, execute per §9.2: import a Chinese font → launch HappyMarguerite (Japanese/translated) to verify the global font, the log shows `forced font enabled: id=.. path=..`, restore after disabling/resetting, per-game override, and missing-glyph fallback.

### To-do

1. after the device is restored, run the §9.2 on-device acceptance and fill in this section;
2. phase 2 candidates (multi-font management/cleanup, TTC face selection, soft mode, in-game menu linkage) have not been started.