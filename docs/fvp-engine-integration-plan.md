# FVPEngine (rfvp) Built-in Engine Integration Plan

> Status: **Implemented (M0–M3 complete, on-device smoke test passed)**; full on-device acceptance (§9.2 in full) is pending once game data is on the device, see "Implementation Record" at the end.
> Related upstream: `xmoezzz/rfvp` (MPL-2.0, a Rust cross-platform rewrite of the FVP engine); local survey baseline `304e773` ("version bump")
> Summary of conclusion: **built-in host route** (new `com.core.fvp` host in the engine module) + **`librfvp.so` packaged directly via jniLibs**;
> upstream already provides a complete Android host-driven C ABI (`rfvp_android_*`, SurfaceView + Choreographer driven),
> the "runtime" integration surface is isomorphic to Siglus (siglus_rs); the "engine library" `librfvp.so` measures about 38.7 MiB for arm64 (after strip).
> Phase 1 scope = scan detection + launch + save mirroring + encoding/font settings + on-device acceptance; **excludes** IME, UIF `replace_chars` mapping, standalone saves.

---

## 0. Terminology and Naming

| Item | Value |
|---|---|
| EngineType | `FVP` |
| Display name (`EngineType.displayName`) | `FVP` |
| Engine page grouping | GAL (`EngineTab.GAL`) |
| launchMode value | `internal.fvp` |
| Host class | `com.core.fvp.FvpActivity` (process `:fvp`) |
| Runtime library (engine library) | `librfvp.so` (upstream cargo-ndk artifact, arm64 measured 45,826,680 B, 40,527,784 B after strip) |
| JNI bridge (runtime) | `librfvp_bridge.so` (shim built in-house by the engine module, dlopen's the runtime library above) |
| Save directory (phase 1) | `<game root>/save` |
| Engine settings category | new `EngineSettingsKind.FVP` |
| Game script | `*.hcb` (original) / `*.bch` (translation patch, same container format) |

---

## 1. Background

FVP is a proprietary engine used by FAVORITE visual novels (representative works such as *Happy☆Marguerite!* and *WhiteEternity*).
`rfvp` is an unofficial Rust rewrite of that engine (MPL-2.0), which already has:

- a complete virtual machine/script parser (`.hcb`), resource archive (`.bin`) reading, and winit + wgpu desktop execution;
- an **Android host-driven runtime**: Java side `SurfaceView` + `Choreographer` frame loop, Rust side driven step by step through the `rfvp_android_*` C ABI (consistent with the Siglus upstream model);
- locally verified: desktop mode runs *HappyMarguerite* correctly (Japanese original and CHS translation `Marguerite.bch`) — scanning, dialogue, BGM/SE, and save directory all work.

Integration value: complete the full "scan detection → launch → save → settings" chain for FVP games in TyranorNext;
translated versions (`*.bch` + GBK/SJIS text + custom font directory) and Chinese text display can reuse the system CJK font fallback on Android.

---

## 2. Upstream Survey Conclusions (measured)

### 2.1 Platform and Host Architecture

| Item | Conclusion | Source |
|---|---|---|
| Android support | Full port: Launcher APK + Player Activity + JNI shim + `cargo ndk` packaging script | `platform/android/`, `platform/scripts/package_android_apk.sh` |
| Host model | Java holds a `SurfaceView` + `Choreographer` main loop; `App::host_step(dt_ms)` is driven frame by frame via the C ABI | `platform/android/.../RfvpGameActivity.java`, `crates/rfvp/src/app.rs` (`host_step`) |
| Texture/rendering | wgpu 0.19 binds `ANativeWindow*` directly (Vulkan/GLES dual backend, build graph includes `glow`) | `App::build_android`, `init_render_android` |
| Audio | kira + cpal (Android uses AAudio/OpenSL), requires `ndk-context` initialization first | `rfvp_android_init_context` comments, platform scripts |
| Input | Single-finger touch `rfvp_android_touch(phase,x,y)`; iOS additionally has `host_key_ios`, **Android has no key ABI** | `android_host.rs`, `app.rs::host_key_ios` |
| Surface lifecycle | Provides `set_surface` (rebuild ANativeWindow) and `resize`; the upstream Activity destroys the engine and `finish`es on `surfaceDestroyed` | `rfvp_jni.cpp`, `RfvpGameActivity.java` |
| Packaging | `cargo ndk -t arm64-v8a -o jniLibs build --release -p rfvp --lib`; all default features (including gpu-render/audio/native-video/mp4) | `package_android_apk.sh:75-78` |
| Build-side API | Upstream script defaults to `CARGO_NDK_PLATFORM=28`; API 26 also builds successfully in testing (`.note.android.ident = 26`) | this test (NDK 28.0.13004108 / cargo-ndk 4.1.2) |

### 2.2 C ABI List (`android_host.rs` already exports these, `llvm-nm -D` usable as measured)

```
rfvp_android_init_context(JavaVM*, GlobalRef<Context>)      // must precede create (audio backend depends on ndk-context)
rfvp_android_create(ANativeWindow*, w_px, h_px, scale, game_dir_utf8, nls_utf8) -> handle
rfvp_android_step(handle, dt_ms) -> i32                     // 1 = exit requested
rfvp_android_resize(handle, w_px, h_px)
rfvp_android_set_surface(handle, ANativeWindow*, w_px, h_px)
rfvp_android_touch(handle, phase, x_px, y_px)               // phase 0/1/2/3
rfvp_android_set_text_hidpi(handle, enabled)
rfvp_android_destroy(handle)
android_main(...)                                           // empty stub, only a link-time placeholder
```

- Touch coordinates and Surface dimensions are both **physical pixels**; the Rust side performs aspect-fit viewport conversion (including hit testing for the built-in exit confirmation and legacy save/load UI);
- `game_dir_utf8` is the game root, `nls_utf8` is `sjis|gbk|utf8` (default sjis);
- No key/IME/title metadata ABI (see the gaps in §2.4).

### 2.3 Engine Library Measured Data

| Item | Value/Conclusion |
|---|---|
| `librfvp.so` (release, unstripped) | 45,826,680 B (≈43.7 MiB) |
| `librfvp.so` (`llvm-strip --strip-unneeded`) | 40,527,784 B (≈38.7 MiB) |
| cargo-ndk incidental artifacts | `libwmv_decoder.so` 599,624 B, `libmediacodec-4c4a3ce3b3fea0cb.so` 446,216 B (cdylib by-products of dependency crates; neither `NEEDED` nor strings of `librfvp.so` reference them) |
| `NEEDED` dependencies | `libmediandk`, `liblog`, `libOpenSLES`, `libandroid`, `libdl`, `libm`, `libc` (**no libc++_shared**) |
| Build command | see §8.1; API 26/28 both work, no obstacle aligning with the project's `minSdk 26` |
| Saves | `<game root>/save/rfvp_s###.bin` (reading is compatible with `s###.bin`); same format as desktop/PC |
| Fonts | custom font directory `<game root>/font|Font|FONT/*.ttf|otf|ttc` (case-compatible); system fallback scans `/system/fonts` (needs a runtime switch, off by default on Android) |
| Encoding | `sjis` (default) / `gbk` / `utf8`, fixed at creation, no runtime switching ABI (changing the setting requires restarting the host) |
| Video | `.mpg` (in-engine software decode), `.wmv` (pure software decode); `.mp4` goes through the MediaCodec dependency chain |
| Exit | In-script exit → `step` returns 1; back-key semantics must be supplied by the host (see §6.1) |
| Background | Upstream Activity destroys the engine and finishes on `surfaceDestroyed` (conservative semantics); `set_surface` reserves keep-alive capability |

### 2.4 Gap List (Requires a Fork)

| # | Gap | Handling |
|---|---|---|
| G1 | Android has no key ABI, so the back key cannot map to Escape | fork adds `rfvp_android_key(handle, vk, phase)` (phase 1 only ESC, phase 2 may extend to all VKs) |
| G2 | No runtime "system font fallback" switch, Chinese translations may show missing glyphs | fork adds `rfvp_android_set_system_font(handle, enabled)`; Android host defaults to on |
| G3 | `App::find_hcb` only globs `*.hcb`, so translation patch `*.bch` cannot be detected | fork changes to `*.bch` first, `*.hcb` as fallback (same container, desktop parsing already verified) |
| G4 | No game title metadata reading (compared with Siglus's `GAMENAME` write-back) | optional: port upstream `HcbTitleReader` logic on the host side + `fvp_title.<hash>` write-back (P2) |
| G5 | No IME/text input ABI | not done in phase 1 (FVP games basically have no name input); reference the Siglus plan if needed |
| G6 | The translation patch's UIF `replace_chars` mapping is not implemented (some placeholder traditional characters are not converted to simplified) | listed as P2: fork adds optional character mapping (reads replace pairs from `uif_config.json`) |
| G7 | No save directory override (standalone saves) | phase 1 accepts `<game root>/save`; P2 overrides via environment variable/ABI |
| G8 | Engine library size 38.7 MiB | already stripped; P2 can trim features such as `mp4` (requires video compatibility regression), accepted in phase 1 |

---

## 3. Overall Design

### 3.1 Route Selection

| | External APK module | **Built-in host (chosen)** |
|---|---|---|
| Main APK | unchanged | +38.7 MiB (arm64, after strip) |
| Integration effort | module project + registry + install protocol + fork launch entry | LaunchContract host branch + scan/save/settings completion |
| Experience | two APKs, the module needs its own authorization | single APK; all-files flow, save mirroring, per-game settings, and engine page all reused |
| Licensing | cleanest process isolation | MPL-2.0 is compatible with GPL-2.0, just keep the notice and source link |
| Upgrades | module releases independently | released with the app (phase 2 may migrate to nativeplugin zip) |

Conclusion: stay consistent with Siglus/ONS/Artemis and take the built-in host route.

### 3.2 Data Flow

```
App (library card click)
  └─ EngineLauncher.buildFvpIntent(FVP)
       extras: PATH/GAME_PATH/PROJECT_ROOT/GAME_DIR, LAUNCH_TARGET, ROOT_URI
               LAUNCH_MODE=internal.fvp, FVP_NLS, FVP_SYSTEM_FONT, FVP_TEXT_HIDPI
               ORIENTATION, theme color
  └─ FvpActivity (:fvp process)
       ├─ SurfaceView.created → System.loadLibrary("rfvp_bridge")
       ├─ rfvp_android_init_context(JavaVM, AppContext)   // precedes create
       ├─ rfvp_android_create(nativeWindow, w, h, density, gameDir, nls)
       ├─ rfvp_android_set_text_hidpi / set_system_font    // apply settings
       ├─ Choreographer each frame → rfvp_android_step(dt)       // dt clamp 250ms; 1=exit
       ├─ touch → rfvp_android_touch; back key → rfvp_android_key(ESC)
       └─ surfaceDestroyed → stop loop (engine keeps alive); back to foreground surfaceCreated → setSurface re-attach
```

### 3.3 Key Decisions

1. **jniLibs direct packaging**: `engine/src/main/jniLibs/arm64-v8a/librfvp.so`, shipped with the APK, CI needs no Rust toolchain (same pattern as `libkrkrsdl3.so` / `libsiglus.so`).
2. **In-house bridge**: do not copy upstream `rfvp_jni.cpp` (MPL); build an in-house dlopen shim in `engine/src/main/cpp/rfvp_bridge.cpp` (depends only on system libraries), using the same template as `siglus_bridge.cpp`.
3. **Host model reuses upstream host-driven semantics**: Java `SurfaceView` + `Choreographer` + `rfvp_android_*`, without enabling the winit/`android-activity` path.
4. **Back key maps only to Escape in phase 1**: aligning with the upstream iOS host; full keyboard mapping is listed for phase 2.
5. **System font fallback is on by default on Android**: Android always has Noto CJK; the value of the missing-glyph fallback for translation patches is high (differs from the desktop default, applied as the host default and can be disabled in settings).
6. **`*.bch` takes precedence over `*.hcb`**: consistent with how translation patches modify the exe, matching translation scripts automatically after integration.
7. **Phase 1 has no cover art**: consistent with other built-in engines; title write-back is listed as an optional enhancement.

---

## 4. App-Side Change List

### 4.1 Engine Type and Display

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | add `FVP("FVP")` (placed after `SIGLUS`) |
| `core/game/launch/EngineLauncher.kt` | add `FVP` to `supportedEngines` (engine page display) |
| `ui/engine/EngineScreen.kt` | `engineTabOf` → GAL; `engineDescription` new branch; `builtinDialogEntries` may add an `fvp-rfvp` entry (optional); built-in engines default to `installed=true` |
| `ui/game/GameScreen.kt` | `EngineType.coverColor()` new placeholder color; `shouldShowSaveManagement` follows "not external / not emulator → show" |
| `ui/home/HomeScreen.kt` | no changes needed (uses displayName) |

### 4.2 Scan Detection (`core/game/scan/EngineScanner.kt`)

Add new features in the `detectEngine` decision chain (suggested after SIGLUS; the two feature sets do not conflict):

New collection variables (root directory level):

- `hasFvpScript`: the root directory contains `*.hcb` or `*.bch` (**case-insensitive**, both are the same container format);
- `hasFvpGraphPack`: `graph.bin` / `graph_vis.bin`;
- `hasFvpAudioPack`: `bgm.bin` / `se.bin` / `se_env.bin` / `se_sys.bin` / `voice.bin` / `voice2.bin` / `etc.bin`.

Detection and scoring (`launchTarget = LAUNCH_TARGET_GAME_DIR`):

| Condition | Score |
|---|---|
| `hasFvpScript` + any graphics/audio pack | 96 |
| `hasFvpScript` (no packs) | 88 |
| Packs only (no script) | not matched (prevents false positives) |

Add unit test `EngineScannerFvpTest` (modeled on `EngineScannerSiglusTest`): hcb+pack hit / bch+pack hit / case variants / script-only hit / packs-only not a false positive / does not misclassify Siglus/YURIS/RPGM/ONS samples.

### 4.3 Launch Chain (`core/game/launch/EngineLauncher.kt`)

- add `EngineType.FVP` to `supportedEngines`;
- add a branch in `buildIntent`: `EngineType.FVP -> buildFvpIntent(...)`, with the new function placed near `buildSiglusIntent`:

```
PATH / GAME_PATH / PROJECT_ROOT / GAME_DIR = real path of the game root (reuse resolveGameDirectory)
ROOT_URI, LAUNCH_TARGET, LAUNCH_MODE = LaunchContract.LAUNCH_MODE_FVP
FVP_NLS        = effective encoding (sjis/gbk/utf8)
FVP_SYSTEM_FONT, FVP_TEXT_HIDPI = effective boolean settings
ORIENTATION    = reuse existing orientation parameter
theme color extras injected uniformly at the end of buildIntent
```

- Precondition: `requestAllFilesAccessIfNeeded` (FVP needs to write `<game root>/save`, same as KRKR/ONS in non-mirror mode);
- On success: `recordRecentGame`; on failure: reuse `LaunchResult.Failure` / `LaunchErrorMessages`.

### 4.4 Plugin Validation Branch

In `core/engine/plugin/EnginePluginBootstrap.kt`, `ensureForLaunch` `when (engine)` adds `FVP -> null` (built-in, no native plugin dependency; missing the change breaks the build).

### 4.5 Saves (`core/game/save/GameSaveManager.kt`)

Add a branch in `resolveSaveLocation`:

```
EngineType.FVP -> SaveLocation(File(root, "save"), text(R.string.save_location_engine_game_dir, game.engine.displayName), true)
```

- `listSaveFiles` / `exportToZip` / `importFromZip` are reused automatically;
- `cleanupAppData` gets no new branch (no app-private data is produced, same policy as SIGLUS).

### 4.6 Engine Settings

| Setting | Key | Values | Default |
|---|---|---|---|
| Text encoding (NLS) | `fvp_nls` | `sjis` / `gbk` / `utf8` | `sjis` |
| System font fallback | `fvp_system_font` | bool | `true` (on by default on Android, see §3.3-5) |
| Text HiDPI | `fvp_text_hidpi` | bool | `true` (consistent with upstream default) |

Change points (using SIGLUS as the template):

| File | Change |
|---|---|
| `core/settings/EngineSettingsStore.kt` | key constants, NLS allowlist, get/set/normalize |
| `core/settings/EngineSettingsResolver.kt` + `ResolvedEngineSettings` | new `fvpNls` / `fvpSystemFont` / `fvpTextHidpi` fields and merging |
| `core/settings/EffectiveEngineSettings.kt` | NLS uses `resolveAllowed`; booleans use `resolveBool` |
| `core/settings/PerGameSettingsStore.kt` | `F_FVP_NLS` / `F_FVP_SYSTEM_FONT` / `F_FVP_TEXT_HIDPI` |
| `core/game/storage/GameOverridePartitions.kt` | key constants added to `TYRANO_KEYS` (following the SIGLUS precedent, avoiding a Room migration) |
| `ui/settings/EngineSettingsText.kt` | `fvpNlsOptions()` / map |
| `ui/settings/EngineSettingsMenuActivity.kt` | `EngineSettingsKind.FVP` |
| `ui/settings/SettingsScreen.kt` | `FvpSettingsCard` (encoding dropdown + two switches) |
| `ui/settings/PerGameSettingsScreen.kt` | FVP branch: three overrides + info card (save directory, encoding notes) |

Encoding semantics: only takes effect when the engine is created; after a change the current session must be restarted (host Toast notification optional).

### 4.7 Strings (Strictly Consistent Across Three Languages)

Add to all three `strings.xml` files simultaneously: `engine_desc_fvp`, `engine_settings_fvp_title`, `engine_settings_fvp_nls_title`, `engine_settings_fvp_nls_sjis/gbk/utf8`, `engine_settings_fvp_system_font_title`, `engine_settings_fvp_text_hidpi_title`, `engine_settings_fvp_note`, etc. (key names and count in Appendix C).

### 4.8 Other

- `core/game/storage/EngineDetectionRepository.kt`: FVP goes to `else -> null` (no version detection cache);
- `ScanGame` / `GameEntity`: no new fields needed;
- `README.md`: add an FVP row to the engine support table; add `rfvp` (MPL-2.0) to acknowledgements;
- `CONTEXT.md`: add the FVPEngine term to the engine list.

---

## 5. engine-Side Change List

### 5.1 JNI Bridge: `engine/src/main/cpp/rfvp_bridge.cpp` (new)

- `dlopen("librfvp.so", RTLD_NOW)` + `dlsym` to obtain function pointers (cached with `std::call_once`);
- JNI methods (`com.core.fvp.NativeRfvp`):
  - `nativeInitAndroidContext(Context)`: `JNI_OnLoad` caches the JavaVM, then calls `rfvp_android_init_context` after `NewGlobalRef`;
  - `create(Surface, w, h, scale, gameDir, nls)`: `ANativeWindow_fromSurface` + hold a window reference (an `unordered_map` keyed by handle, same pattern as the upstream shim);
  - `step/resize/setSurface/touch/setTextHidpi/setSystemFont/keyEvent/destroy`;
- Fault tolerance: missing symbols are only logged; core symbols are mandatory before `create`; failure returns 0 and the host finishes (aligning with `siglus_bridge.cpp`).

### 5.2 CMake

Add to `engine/src/main/cpp/CMakeLists.txt`:

```cmake
add_library(rfvp_bridge SHARED rfvp_bridge.cpp)
target_link_libraries(rfvp_bridge ${android-lib} ${log-lib} ${dl-lib})
```

### 5.3 Java Host: `engine/src/main/java/com/core/fvp/`

| Class | Responsibility |
|---|---|
| `NativeRfvp.java` | JNI wrapper (`System.loadLibrary("rfvp_bridge")`) |
| `FvpActivity.java` | lifecycle/frame loop/Surface/touch/back key/immersive mode/loading overlay (behavior modeled on upstream `RfvpGameActivity`, code written in-house) |
| `FvpTitleReader.java` (P2) | read the HCB header title (`sys_desc_offset` → title), used for title write-back |

Key host behaviors:

1. `onCreate`: fullscreen immersive; parse `LaunchContract` extras (`PATH → GAME_PATH → PROJECT_ROOT → GAME_DIR`, take the first non-empty, Toast + finish if missing); `SurfaceHolder.Callback` + `OnTouchListener`; `setKeepScreenOn`; show loading overlay (`engine_starting_game`).
2. `surfaceCreated`: if `handle == 0` → `ensureEngine()` (init context → create → apply hidpi/system font settings); otherwise `setSurface` to re-attach. Remove the loading overlay after the first frame succeeds.
3. Frame loop: `Choreographer`, `dt` clamped to `[0,250]ms`; `step > 0` → `finish()`.
4. `onResume` starts the frame loop; `onPause` stops it; `onDestroy` stops the loop + `destroy(handle)`; `surfaceDestroyed` only stops the loop and sets `surfaceReady=false` (engine keeps alive); on returning to the foreground, `surfaceCreated` uses `setSurface` to re-attach the wgpu Surface, avoiding a restart of the current session when switching to the background.
5. Input: touch phases are forwarded directly; `KEYCODE_BACK` single press → `keyEvent(ESC down/up)`, double press within 2 seconds → exit (Toast `engine_fvp_back_again_to_exit`).
6. Multi-instance protection: `singleInstance` + `onNewIntent` Toast `engine_another_game_running`.

### 5.4 Manifest / Resources

```xml
<!-- FVPEngine (rfvp) host: Java SurfaceView + Choreographer main loop driving the Rust engine -->
<activity
    android:name="com.core.fvp.FvpActivity"
    android:exported="false"
    android:process=":fvp"
    android:launchMode="singleInstance"
    android:taskAffinity="com.core.Fvp"
    android:screenOrientation="sensorLandscape"
    android:theme="@style/Theme.Fvp"
    android:windowSoftInputMode="adjustNothing"
    android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode|density|fontScale|locale|layoutDirection" />
```

- add `Theme.Fvp` to `engine/src/main/res/values/styles.xml` (`Theme.AppCompat.NoActionBar` + black background);
- add `-keep class com.core.fvp.** { *; }` to `engine/consumer-rules.pro` (JNI name lookup safety).

### 5.5 Contract and Constants

`engine/src/main/java/com/core/engine/LaunchContract.kt`:

```kotlin
// ---------- FVP ----------
const val FVP_NLS = "fvp_nls"                     // sjis|gbk|utf8
const val FVP_SYSTEM_FONT = "fvp_system_font"     // bool
const val FVP_TEXT_HIDPI = "fvp_text_hidpi"       // bool
// (P2)const val FVP_PATH_HASH = "fvp_path_hash"

const val LAUNCH_MODE_FVP = "internal.fvp"
```

`EnginePrefs.kt` (P2): `KEY_FVP_TITLE_PREFIX = "fvp_title."`.

### 5.6 Packaging

- `engine/src/main/jniLibs/arm64-v8a/librfvp.so` (38.7 MiB after strip, shipped with the APK);
- recommend also including the cargo-ndk artifacts `libwmv_decoder.so` / `libmediacodec-<hash>.so` (+0.7 MiB, video decoding fallback; may be trimmed once confirmed unreferenced);
- `packaging.jniLibs.useLegacyPackaging = true` is already enabled (no change needed);
- CI needs no Rust toolchain (`.so` committed).

---

## 6. fork (rfvp) Changes

Baseline: `/Users/weiss/github- engine/rfvp` @ `304e773` (suggest forking to `Weiss-UltimateSavior/rfvp`).

### 6.1 Android Key ABI (G1)

Add to `crates/rfvp/src/android_host.rs`:

```c
void rfvp_android_key(void* handle, int32_t vk_code, int32_t phase); // phase 0=down, 1=up
```

- semantics use Windows VK (aligning with Siglus): phase 1 covers at least `0x1B ESC`; phase 2 may extend to `0x0D/0x20/0x11/0x25-0x28` etc.;
- `App::host_key_android(vk, phase)`: map to a winit `Key` and then route through `inputs_manager.notify_keydown/up` (see `host_key_ios`);
- when the built-in exit confirmation or the legacy save/load UI is open, keys are consumed only within that UI.

### 6.2 System Font Fallback ABI (G2)

```c
void rfvp_android_set_system_font(void* handle, int32_t enabled);
```

- `App` exposes `set_system_font_fallback_enabled` (`text_manager` already has a method of the same name);
- the host calls it after create and before the first frame;
- Android has no built-in "system font" concept, so it scans CJK fonts in `/system/fonts` (already implemented).

### 6.3 `*.bch` Support (G3)

`crates/rfvp/src/app.rs::find_hcb`:

- prefer the root directory's `*.bch` (translation patch), fall back to `*.hcb` when absent;
- `.bch` and `.hcb` are the same HCB container (first field `sys_desc_offset`, desktop parsing and play-through already verified);
- this change only affects script selection, not the parser.

### 6.4 Optional Enhancements (P2)

| Item | Plan |
|---|---|
| Title write-back (G4) | add `rfvp_android_game_title_from_dir` + `rfvp_android_string_free`; the host writes `fvp_title.<hash>`, the app side imports conditionally (aligning with the Siglus protocol) |
| UIF mapping (G6) | `App` gains an optional character mapping table (reads `text_processor.rules[replace_chars]` from the game root's `uif_config.json`) applied after text decoding; only effective for translation patches that declare support |
| Standalone saves (G7) | `rfvp_android_set_save_dir` or an environment variable overriding the `save_manager` root path |
| Surface keep-alive | the host's `surfaceDestroyed` only stops the loop; on returning to the foreground `set_surface` rebuilds the wgpu Surface (the upstream ABI already supports this) |

### 6.5 Build and Attribution

- record the build baseline commit in TyranorNext's `README.md` and in this document;
- MPL-2.0: keep the upstream `LICENSE` and file headers; note in the TyranorNext README that "the engine runtime library comes from rfvp (MPL-2.0), see the upstream/fork repository for source";
- the bridge shim and host code are written in-house, not copied from upstream files, avoiding license-mixing disputes.

---

## 7. Key Interaction Details

### 7.1 Touch and Coordinates

- the host passes only physical pixels (`MotionEvent.getX/getY`, the width/height of `SurfaceHolder.getSurfaceFrame()`);
- the Rust side converts touch to logical coordinates using an aspect-fit viewport, and handles hit-test priority for the built-in UI (exit confirmation, legacy save/load);
- `native_scale_factor` is passed `DisplayMetrics.density`, affecting only text HiDPI rasterization.

### 7.2 Back Key and Exit

- single back press → engine Escape (close menu/cancel);
- double press within 2 seconds → exit the host (Toast notification);
- `step` returns 1 (in-script exit to the system, e.g. the title screen's Exit) → `finish()`.

### 7.3 Text Encoding (NLS)

```
Settings (global or per-game) → EngineSettingsResolver.fvpNls
  → EngineLauncher extras (FVP_NLS)
  → host create(gameDir, nls)
  → script/save strings decoded with the encoding
```

- `sjis`: original Japanese / SJIS-based translation patch placeholder text;
- `gbk`: translation patches re-encoded as GBK;
- `utf8`: UTF-8 translation patches;
- cannot be switched at runtime, a change requires restarting the session (the host may Toast on demand).

### 7.4 Fonts

- custom fonts: the game root's `font|Font|FONT` directory (TTF/OTF/TTC) is loaded automatically — the common approach for translation patches;
- system fallback: on by default on the Android host, scans `/system/fonts` (Noto Sans CJK etc.) to fill missing glyphs;
- the engine's built-in MS-PGothic/MS-PMincho bitmap/vector fonts act as the final fallback (no `default.ttf` needed).

### 7.5 Saves

- phase 1: `<game root>/save/rfvp_s###.bin` (reading is compatible with `s###.bin`);
- save mirroring (zip export/import) and listing are reused automatically;
- requires write access to the game root → reuse `requestAllFilesAccessIfNeeded` (Android 11+ requires `MANAGE_EXTERNAL_STORAGE`).

### 7.6 Permissions

- consistent with Siglus: request all-files access before launching;
- without permission, reading the game may work (depending on the directory) but saving fails → the per-game settings info card explains this.

### 7.7 Background and Restoration

- switching to the background: `surfaceDestroyed` only stops the frame loop and sets `surfaceReady=false`; the engine process and VM state are preserved (no destroy, no finish);
- returning to the foreground: when `surfaceCreated` detects an existing handle it calls `NativeRfvp.setSurface` to attach the new `ANativeWindow` and rebuild the wgpu Surface; both `onResume`/`surfaceCreated` attempt to restore the frame loop;
- if the process is reclaimed by the system (memory pressure/vendor background policy), the game restarts only after returning; that is system behavior, not the host actively ending it.

---

## 8. Build and Integration Steps

### 8.1 Build the Engine Library (once/each update)

```bash
cd "/Users/weiss/github- engine/rfvp"
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/28.0.13004108"
CARGO_NDK_PLATFORM=26 cargo ndk -t arm64-v8a -o /tmp/rfvp-android build --release -p rfvp --lib
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" \
  --strip-unneeded /tmp/rfvp-android/arm64-v8a/librfvp.so
cp /tmp/rfvp-android/arm64-v8a/librfvp.so \
   /Users/weiss/opencode/rma/TyranorNext/engine/src/main/jniLibs/arm64-v8a/
```

Measured: build takes about 1.5–3 minutes; API 26/28 both work (aligned with `minSdk 26`).

### 8.2 Integration Build and Verification

```bash
./gradlew :app:assembleDebug --no-daemon
./gradlew :app:testDebugUnitTest --no-daemon
python3 tools/check-hardcoded-ui-strings.py
git diff --check
```

### 8.3 CI Impact

- no Rust toolchain requirement (`.so` committed);
- APK size +38.7 MiB (arm64), total `jniLibs` from about 68.8 MiB → about 107.5 MiB;
- the nativeplugin packaging task is unaffected.

---

## 9. Testing and Acceptance

### 9.1 Unit Tests

| Case | Content |
|---|---|
| `EngineScannerFvpTest` | hcb/bch ± resource pack features, case variations, packs-only not matched, not mutually exclusive with Siglus/YURIS/RPGM/ONS samples |
| `EngineSettingsResolverTest` (extended) | FVP encoding allowlist fallback, system font/HiDPI override merging |
| `GameOverridePartitionsTest` (extended) | FVP keys round-trip in the tyrano partition without loss |
| `GameSaveManagerTest` (extended) | FVP → `<root>/save`; import/export round trip |

### 9.2 On-Device Acceptance (at least 1 FVP game; *HappyMarguerite* Japanese + CHS recommended)

1. detected as FVP by scanning (both the Japanese `*.hcb` and the translated `*.bch` work);
2. launch into the game: title screen → touch to advance dialogue → open menu/save → load;
3. after saving, kill the process and re-enter; the save is still there (a new file exists in `<root>/save`);
4. encoding switching: text is correct under Japanese `sjis` and translated `gbk`/`sjis` (depending on the patch), and changes take effect after restart;
5. Chinese fonts: with no `font/` directory the system fallback displays simplified Chinese correctly; after placing a custom TTF it is preferred;
6. back key single press = cancel, double press = exit; the in-game Exit = normal exit;
7. `text_hidpi` switch: the text clarity difference on high-density screens matches expectations;
8. background/foreground, rotation (within sensorLandscape), and task switching cause no crashes;
9. large games (graph.bin >1GB) load and play smoothly; record memory and first-frame time;
10. save mirroring: export zip → clear saves → import → load restored.

### 9.3 Rollback

- removing `EngineType.FVP` related branches + deleting `librfvp.so`/the bridge so returns to the pre-integration state;
- no data migration risk (saves live in the game root, lingering setting keys are harmless).

---

## 10. Risks and Open Questions

| Risk | Impact | Mitigation |
|---|---|---|
| `librfvp.so` is 38.7 MiB, APK size grows noticeably | install package ~110 MiB | already stripped; P2 trims features such as `mp4`/`image-formats`; or phase 2 migrates to nativeplugin with on-demand download |
| wgpu Vulkan/GLES compatibility (older devices) | cannot render | wgpu 0.19 already includes a GLES backend; cover on-device testing; if insufficient, document device requirements in the README |
| Upstream API changes | recompiling requires regression | depend only on the stable `rfvp_android_*` ABI; pin the baseline commit |
| Translation patch UIF placeholder characters not mapped | a few traditional placeholder characters remain | implement character mapping in P2 (§6.4); explain in the settings info card in phase 1 |
| Back key/no IME | a few input scenarios are limited | phase 1 only maps ESC; IME is listed for P2 (FVP games basically have no input) |
| `<game root>` is read-only (SD card/Android/data) | save writes fail | reuse the all-files flow; P2 provides a standalone save directory |
| MPL-2.0 compliance | licensing questions | keep the notice + source link in the README; shim/host written in-house |
| `surfaceDestroyed` destroys the engine (already fixed) | backgrounding loses progress | changed to keep-alive + `set_surface` re-attach (see §7.7 and the implementation record) |

Open questions (decided during review):

1. default value of system font fallback (recommended `true`, the benefit is clear in Android missing-glyph scenarios);
2. whether to do title write-back in phase 1 (recommended P2, adding it after aligning the experience with Siglus);
3. whether `builtinDialogEntries` should add an `fvp-rfvp` version entry (recommended yes, to show the engine source baseline);
4. whether to offer `auto` as an encoding option (recommended no in phase 1, an explicit three-way choice is more controllable).

---

## 11. Milestones (Suggested Implementation Order)

| Stage | Content | Dependency | Estimate |
|---|---|---|---|
| M0 | fork adds ABI (§6.1/6.2/6.3) + rebuild and strip `.so`; add to `jniLibs` | none | 0.5 day |
| M1 | engine: shim + host + Manifest/resources + contract constants | M0 | 1 day |
| M2 | app: EngineType/scan/launch/saves/plugin branch + strings | M1 | 1 day |
| M3 | settings chain (encoding/system font/HiDPI: Store/Resolver/UI/per-game override) | M2 | 1 day |
| M4 | on-device acceptance (§9.2) + back key/font/encoding regression | M3 | 1 day |
| M5 | README/CONTEXT updates + unit tests/three languages/build regression | M4 | 0.5 day |
| Phase 2 | IME, UIF mapping, title write-back, standalone saves, Surface keep-alive, size trimming | M5 | to be scheduled |

---

## Appendix A: ABI Reference Table

| Shim JNI (`com.core.fvp.NativeRfvp`) | C ABI | Notes |
|---|---|---|
| `nativeInitAndroidContext(Context)` | `rfvp_android_init_context` | mandatory before create (audio/ndk-context) |
| `create(Surface,w,h,scale,gameDir,nls)` | `rfvp_android_create` | returns a handle, 0=failure |
| `step(handle,dtMs)` | `rfvp_android_step` | 1=exit requested |
| `resize` | `rfvp_android_resize` | |
| `setSurface` | `rfvp_android_set_surface` | unused in phase 1 (P2 keep-alive) |
| `touch` | `rfvp_android_touch` | phase 0/1/2/3 |
| `setTextHidpi` | `rfvp_android_set_text_hidpi` | |
| `setSystemFont` (new) | `rfvp_android_set_system_font` | fork §6.2 |
| `keyEvent` (new) | `rfvp_android_key` | fork §6.1 |
| `destroy` | `rfvp_android_destroy` | |

## Appendix B: Detection Feature Reference (EngineScanner)

| Feature | File name/path | Case |
|---|---|---|
| Script (original) | root directory `*.hcb` | insensitive |
| Script (translated) | root directory `*.bch` | insensitive |
| Graphics packs | `graph.bin`, `graph_vis.bin` | insensitive |
| Audio/other packs | `bgm.bin`, `se.bin`, `se_env.bin`, `se_sys.bin`, `voice.bin`, `voice2.bin`, `etc.bin` | insensitive |
| Auxiliary (not scored) | `movie/*.mpg`, `patchdata/` | — |

## Appendix C: New String Keys (Three Languages)

| Key | zh | ja | en |
|---|---|---|---|
| `engine_desc_fvp` | FVPEngine(FAVORITE 系) | FVPEngine(FAVORITE 系) | FVPEngine (FAVORITE) |
| `engine_settings_fvp_title` | FVP | FVP | FVP |
| `engine_settings_fvp_nls_title` | 文本编码 | テキスト文字コード | Text encoding |
| `engine_settings_fvp_nls_sjis` | Shift-JIS(日文原版) | Shift-JIS(日本語版) | Shift-JIS (Japanese) |
| `engine_settings_fvp_nls_gbk` | GBK(简体汉化) | GBK(簡体字中国語) | GBK (Simplified Chinese) |
| `engine_settings_fvp_nls_utf8` | UTF-8 | UTF-8 | UTF-8 |
| `engine_settings_fvp_system_font_title` | 系统字体回退 | システムフォント補完 | System font fallback |
| `engine_settings_fvp_text_hidpi_title` | 文本高分辨率渲染 | テキスト高解像度描画 | HiDPI text rendering |
| `engine_settings_fvp_note` | 修改编码后需重启游戏 | 文字コード変更後はゲームを再起動 | Restart the game to apply encoding changes |

> The engine module host's Toast strings (`engine_fvp_init_failed`, `engine_fvp_back_again_to_exit`, etc.) must be added to all three `engine/src/main/res/values{,-en,-ja}/strings.xml` files in sync; the actual wording follows the project's three-language proofreading conventions, and after adding them `python3 tools/check-hardcoded-ui-strings.py` must pass.

---

## Implementation Record (M0–M5)

### M0 fork changes (`/Users/weiss/github- engine/rfvp`, uncommitted)

| File | Change |
|---|---|
| `crates/rfvp/src/android_host.rs` | add exports `rfvp_android_key(handle, vk, phase)`, `rfvp_android_set_system_font(handle, enabled)` |
| `crates/rfvp/src/app.rs` | add `App::host_key_android` (VK → winit Key: ESC/Enter/Space/, arrow keys/Control, phase 0/1), `App::set_system_font_fallback_enabled` (enabling triggers a one-time system font scan); `find_hcb` changed to prefer `*.bch` and fall back to `*.hcb` |
| `crates/rfvp/src/subsystem/resources/text_manager.rs` | `FontEnumerator::load_system_fallback_fonts` (both std and no_std implementations, with no_std being an empty implementation) |

Build and commit (API 26):

```bash
cd "/Users/weiss/github- engine/rfvp"
export ANDROID_NDK_HOME="$HOME/Library/Android/sdk/ndk/28.0.13004108"
CARGO_NDK_PLATFORM=26 cargo ndk -t arm64-v8a -o /tmp/rfvp-android-fvp build --release -p rfvp --lib
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" --strip-unneeded /tmp/rfvp-android-fvp/arm64-v8a/*.so
cp /tmp/rfvp-android-fvp/arm64-v8a/*.so \
   engine/src/main/jniLibs/arm64-v8a/
```

Measured artifacts: `librfvp.so` 45,831,904 B → 40,529,800 B after strip; `libwmv_decoder.so` 435,832 B; `libmediacodec-4c4a3ce3b3fea0cb.so` 305,344 B; `.note.android.ident` API level = 26; all `rfvp_android_*` symbols (including the two new ones) confirmed exported.

### M1 engine-side changes

- `cpp/rfvp_bridge.cpp` (in-house shim: dlopen `librfvp.so` + dlsym function table + JNI_OnLoad caching the JavaVM + ANativeWindow reference management + tolerance for missing symbols);
- `cpp/CMakeLists.txt` adds the `rfvp_bridge` target;
- `com/core/fvp/NativeRfvp.java` (JNI wrapper) and `com/core/fvp/FvpActivity.java` (SurfaceView + Choreographer main loop, immersive mode, loading overlay, back key single press ESC / 2-second double press exit, singleInstance multi-open notification, `surfaceDestroyed` stopping the loop and destroying the engine);
- Manifest `FvpActivity` (`:fvp`, sensorLandscape, Theme.Fvp), `styles.xml` Theme.Fvp, `consumer-rules.pro` keep `com.core.fvp.**`;
- `LaunchContract`: `FVP_NLS` / `FVP_SYSTEM_FONT` / `FVP_TEXT_HIDPI` / `LAUNCH_MODE_FVP`;
- engine strings in three languages ×3 (`engine_fvp_missing_game_dir` / `engine_fvp_init_failed` / `engine_fvp_back_again_to_exit`).

### M2/M3 app-side changes

- `EngineType.FVP`, `EngineScanner` features (root `*.hcb`/`*.bch` + `FVP_PACK_NAMES`; script+resource pack 96 / script-only 88, scripts in nested directories not matched) + `EngineScannerFvpTest` (7 cases);
- `EngineLauncher`: `supportedEngines`, `buildIntent` FVP branch, `buildFvpIntent` (PATH/GAME_PATH/PROJECT_ROOT/GAME_DIR + the three settings + launchMode); `EnginePluginBootstrap` returns null; `GameSaveManager` → `<game root>/save`;
- UI: `EngineScreen` (GAL grouping, description strings, `fvp-rfvp` version entry), `GameScreen.coverColor` (`0xFFB05A2A`);
- settings: `EngineSettingsStore` (keys/allowlist/default sjis/system font and HiDPI on by default), `EngineSettingsResolver`/`ResolvedEngineSettings`, `PerGameSettingsStore` (`F_FVP_*`), `GameOverridePartitions` (in the tyrano partition, avoiding a Room migration), `EngineSettingsText`, `EngineSettingsKind.FVP`, `SettingsScreen` FVP card, `PerGameSettingsScreen` FVP branch;
- strings in three languages ×3: `engine_desc_fvp` + `engine_settings_fvp_*` (10 keys in total).

### Deviations from the plan

1. The repository has no `EngineSettingsResolverTest` / `GameSaveManagerTest`: instead, `EffectiveEngineSettingsTest` gained FVP allowlist/boolean override cases and `GameOverridePartitionsTest` gained FVP key round-trip and contract assertions; the save directory branch is guaranteed by compile-time exhaustiveness.
2. The Android key ABI was extended from "phase 1 only ESC" to ESC + Enter/Space/arrow keys/Control (the phase 1 host still only sends ESC), avoiding another `.so` change in phase 2.
3. `builtinDialogEntries` adds the `fvp-rfvp` entry as recommended (`rfvp-xmoezzz`).
4. System font fallback is on by default (as recommended); encoding does not offer auto (explicit three-way choice).

### Verification results

- `./gradlew :app:assembleDebug --no-daemon`: passed; the APK contains `lib/arm64-v8a/librfvp.so` (40.5 MB), `librfvp_bridge.so`, `libwmv_decoder.so`, `libmediacodec-*.so`.
- `./gradlew :app:testDebugUnitTest --no-daemon`: passed (including the 7 new FVP scan cases and settings/partition regression).
- `python3 tools/check-hardcoded-ui-strings.py`, `git diff --check`: passed.
- **On-device smoke test (Huawei MAA-AN10 / arm64)**:
  1. the debug APK installed over the existing one successfully, the app launched normally, and existing library data was preserved;
  2. the engine page shows an FVP entry (description/"integrated") and the FVP engine settings page opens (encoding dropdown + two switches + explanation text render correctly);
  3. using a synthetic directory containing only `Marguerite.bch` (translation script, 3.2 MB), scan detection succeeded (`FVP`, placeholder color, added to library), and `FvpActivity` launched successfully from the game card;
  4. the `:fvp` process stayed alive with no FATAL, and `/proc/<pid>/maps` confirmed `librfvp.so` and `librfvp_bridge.so` were loaded (dlopen + symbol resolution + create succeeded; a blank screen when resource packs are missing is expected);
  5. test files and test entries were cleaned up.
- Pending: the full play-through acceptance in §9.2 (dialogue/save/load/encoding switching/custom fonts/back key double-press exit, etc.) requires the full game data on the device and SAF authorization before regression.

### Post-implementation fix: Surface keep-alive (user feedback)

**Problem**: pressing Home to background during play, then returning from the launcher, restarted the game from the beginning.

**Cause**: `FvpActivity.surfaceDestroyed` adopted the upstream conservative semantics (stop loop + `destroy` + `finish`), ending the session as soon as the Surface became invalid.

**Fix** (`com/core/fvp/FvpActivity.java`, no `.so` rebuild needed; rfvp's `set_surface` ABI natively supports this model):

- `surfaceDestroyed`: only stop the frame loop and set `surfaceReady = false`; the engine and VM state are preserved;
- `surfaceCreated`: when a handle already exists, call `NativeRfvp.setSurface` to attach the new `ANativeWindow` and rebuild the wgpu Surface; otherwise create as on first launch;
- `surfaceChanged`: forward `resize` only when `surfaceReady`;
- `maybeStartFrameLoop` / `doFrame`: add a `surfaceReady` gate to avoid stepping when the Surface is missing;
- `onDestroy`: only then actually `destroy(handle)`.

**Verification**: after installing the fixed build on the device, launching with the full game data (`/sdcard/galgame/HappyMarguerite_CHS`), pressing Home to background and returning, the game continued at the original progress and no longer restarted; the user confirmed the issue was resolved.

---

## References

- Upstream: `xmoezzz/rfvp` (MPL-2.0): `setsumei/HOW-TO-BUILD.android-apk.md`, `platform/android/`, `crates/rfvp/src/android_host.rs`, `crates/rfvp/src/app.rs`, `crates/rfvp/src/subsystem/resources/text_manager.rs`
- Project precedents: `docs/siglus-engine-integration-plan.md` (built-in host + jniLibs route template), `docs/external-apk-engine-module-plan.md`
- Conventions: root `AGENTS.md` (three-layer architecture, pre-commit review), `CONTEXT.md` (terminology)