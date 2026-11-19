# SiglusEngine (siglus_rs) built-in engine integration plan

> Status: **Implemented (M0–M5 complete)**; see the "Implementation record" at the end for notes and deviations
> Upstream: `Weiss-UltimateSavior/siglus_rs` (fork of `xmoezzz/siglus_rs`, MPL-2.0)
> Summary: **built-in host route** (a new host Activity in the engine module) + **direct jniLibs packaging**;
> Phase-one scope = core playability + text input/IME + key mapping + language setting + GAMENAME title write-back (**excluding cover art**).

---

## 0. Terminology and naming

| Item | Value |
|---|---|
| EngineType | `SIGLUS` |
| Display name (`EngineType.displayName`) | `Siglus` |
| Engine page group | GAL (`EngineTab.GAL`) |
| launchMode value | `internal.siglus` |
| Host class | `com.core.siglus.SiglusActivity` (process `:siglus`) |
| Native library | `libsiglus.so` (renamed from the upstream cargo-ndk artifact `libsiglus_scene_vm.so`, 20.5MB/arm64) |
| Save directory (phase one) | `<game root>/savedata` |
| Engine settings category | New `EngineSettingsKind.SIGLUS` |

---

## 1. Background

SiglusEngine is the in-house engine of Key / VisualArts (VA) visual novels, with representative titles including Rewrite, Summer Pockets, Angel Beats! 1st beat, Little Busters! and others. `siglus_rs` is an unofficial Rust rewrite and multi-platform port of that engine (MPL-2.0), and already provides a complete Android implementation:

- The Java side owns the `SurfaceView` and the `Choreographer` frame loop, while the Rust side is driven step by step through the `siglus_android_*` C ABI (step/touch/resize/messagebox);
- Its host model is isomorphic to TyranorNext's existing built-in engines (Artemis / ONS), so the integration surface is small;
- The repository has already been forked by this project's author, allowing the ABI and host behavior to be extended as needed.

Integration value: completes TyranorNext's end-to-end "scan & detect → launch → save → settings" support for Siglus-family games.

---

## 2. Upstream survey findings (measured)

### 2.1 Platform and host architecture

| Item | Finding | Source |
|---|---|---|
| Android support | A complete port already exists (Launcher + Player + JNI shim + cargo-ndk build script) | `platform/android/`, `platform/scripts/package_android_apk.sh` |
| Host model | `AppCompatActivity` + `SurfaceView` + `Choreographer`; the engine is driven by the C ABI `step(dt_ms)` | `SiglusGameActivity.java` |
| Background resume | `surfaceDestroyed` only stops the frame loop; the engine is destroyed only in `onDestroy` (progress is retained when returning to the foreground) | Same as above |
| Back key | Single click → engine Escape (in-game cancel); double click within 2 seconds → exit | Same as above |
| Immersive | `WindowCompat` + hidden `systemBars`, `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` | Same as above |
| Upstream module minSdk | 28 (this project is 26; lower versions are unverified and must be noted in the README/description) | `platform/android/app/build.gradle.kts` |

### 2.2 C ABI list (exported by `siglus.h`, Android section)

```
siglus_android_init_context(JavaVM*, jobject context)          // must precede create (the audio backend depends on ndk-context)
siglus_android_create(ANativeWindow*, w_px, h_px, scale, game_dir) -> handle
siglus_android_step(handle, dt_ms) -> i32                      // >0 normal exit; <0 VM error
siglus_android_resize / set_surface / touch(phase,x,y)
siglus_android_text_input(handle, utf8)                        // text commit (not wired up in the current host)
siglus_android_ime_preedit(handle, utf8|null, start, end)      // null means the preedit is canceled
siglus_android_key_down / key_up(handle, key_code)             // key_code = Windows VK
siglus_android_set_native_messagebox_callback / submit_messagebox_result
siglus_android_destroy(handle)
siglus_game_name_from_dir(dir) / siglus_game_cover_path_from_dir / siglus_game_cover_mime_from_dir
siglus_string_free(ptr)
```

- Touch coordinates are converted by the Rust side to logical coordinates according to the aspect-fit viewport (the host only passes physical pixels);
- Key codes are **Windows virtual-key codes** (`host.rs::vm_key_from_platform_code`: 0x1B/0x0D/0x20/0x08/0x09/0x10/0x11/0x12/0x25-0x28/0x30-0x39/0x41-0x5A/0x70-0x7B);
- There is **no** ABI to query "whether IME is currently needed / the IME cursor area", and **no** entry point for "text events of unmapped keys" (desktop uses winit Ime/KeyboardInput events; Android requires an added ABI).

### 2.3 Measured data

| Item | Value / finding |
|---|---|
| `lib/arm64-v8a/libsiglus.so` | 20,493,704 B (already stripped; depends only on `liblog/libandroid/libdl/libOpenSLES/libm/libc`) |
| JNI shim | 385,896 B (our own shim can replace it; no need to package it) |
| Upstream APK (`pre-release`, `1eadb38`) | 95.8MB, dual ABI; **duplicate packaging** of `libsiglus_scene_vm.so` (exactly the same size as `libsiglus.so`, so one copy can be saved) |
| Comparison | This project already bundles `libkrkrsdl3.so` at 28.4MB → the size is acceptable |
| Desktop cdylib reference | macOS `libsiglus_scene_vm.dylib` 18.7MB (same order of magnitude as Android) |
| Saves | `<project_dir>/savedata` (reading is also compatible with `<project_dir>/save`), `config.sav`/`global.sav`/screenshot png; same format as PC |
| Key | On first launch the EXE key is brute-forced automatically and written back to `<game root>/key.toml` (if the write fails it only takes effect in memory); requires write permission on the game root |
| Detection signatures | `Gameexe.dat` / `Gameexe.ini` (including EN/ZH/ZHTW/DE/ES/FR/ID variants) + `Scene.pck` (root or `Data/`); `Select.ini` determines the append directory |
| Title | `GAMENAME` (Gameexe), falling back to the directory name |
| Language | Environment variable `SIGLUS_LANGUAGE` (default `JP`), returned to game scripts through the engine's `GET_LANGUAGE` system call |
| Log switch | `SIGLUS_LOG` (off/error/warn/info/debug/trace) |
| Video | `.omv`/`.mpg`/`.wmv` pure software decoding (in-engine), no external player needed |
| Frame loop | Java `Choreographer`, `dt` clamped to 250ms |

### 2.4 Gap list (to be handled)

| # | Gap | Handling |
|---|---|---|
| G1 | The Android host does not wire up text input/IME | Fork adds the ABI (see §6.1) + engine host wiring (see §5) |
| G2 | The keyboard only maps Escape | The host forwards per the §7.1 mapping table; add the "text event for unmapped keys" ABI |
| G3 | No save directory override (fixed to the game root) | Accepted in phase one; the phase-two fork supports `SIGLUS_SAVE_DIR` to implement "scoped saves" |
| G4 | Packaging duplicates `libsiglus_scene_vm.so` | The build flow takes only one copy and renames it (see §8.1) |
| G5 | Upstream minSdk 28 | Release notes state "Siglus requires Android 9+" |
| G6 | Cover parsing needs the EXE key (`Gameexe.dat`) | Title write-back is invoked after the engine create succeeds (the key is ready or cached by then) |

---

## 3. Overall design

### 3.1 Route selection

| | External APK module | **Built-in host (selected)** |
|---|---|---|
| Main APK | unchanged | +20.5MB (arm64) |
| Integration effort | registry + `<queries>` + module install state + fork adds a launch entry | LaunchContract host branch + scan/save/settings completion |
| Experience | two APKs; the module must be granted storage permission separately | single APK; the all-files flow, save mirroring, per-game settings and engine page are all reused |
| Licensing | process isolation is the cleanest | acceptable (MPL-2.0 is compatible with GPLv2 per §3.3; keep the notices and source links) |
| Upgrades | the module is released independently | released together with the App (phase two can move it to a nativeplugin zip) |

Conclusion: consistent with the existing built-in engines (Kirikiroid2 / ONS / Artemis), take the built-in host route.

### 3.2 Data flow

```
App (game library card click)
  └─ EngineLauncher.buildIntent(SIGLUS)
       extras: PATH/GAME_PATH/PROJECT_ROOT/GAME_DIR/LAUNCH_TARGET/ROOT_URI
               LAUNCH_MODE=internal.siglus, ORIENTATION, theme color, SIGLUS_LANGUAGE
  └─ SiglusActivity (:siglus process)
       ├─ SurfaceView.created → System.loadLibrary("siglus_bridge")
       ├─ siglus_android_init_context → siglus_android_create(nativeWindow, w, h, density, gameDir)
       ├─ Choreographer every frame → siglus_android_step(dt)
       ├─ touch/key/IME → siglus_android_touch / key_event / text_input
       ├─ query the IME area every frame → show/hide the input method
       └─ after create succeeds → siglus_game_name_from_dir → write prefs (title write-back)
```

### 3.3 Key decisions

1. **Direct jniLibs packaging**: `engine/src/main/jniLibs/arm64-v8a/libsiglus.so`, distributed with the APK; CI does not need a Rust toolchain (the same pattern as `libkrkrsdl3.so`); in phase two, if release-free upgrades are needed, move it to a `nativeplugin` zip.
2. **Self-developed shim**: the upstream `siglus_jni.cpp` is not copied (only ~500 lines and missing IME/language/metadata entry points); instead `engine/src/main/cpp/siglus_bridge.cpp` is developed in-house (dlopen `libsiglus.so`, depending only on system libraries), avoiding MPL code mixing into the engine source tree.
3. **No cover art in phase one**: no `cover.png` etc. is integrated; title write-back is kept as requested.
4. **Permissions**: Siglus needs to read game resources + write `savedata/` and `key.toml` → reuse `EngineLauncher.requestAllFilesAccessIfNeeded` (MANAGE_EXTERNAL_STORAGE).
5. **No scoped saves in phase one**: the engine always writes to the game root; phase two supports it via the `SIGLUS_SAVE_DIR` environment variable (see §11).

---

## 4. App-side change list

### 4.1 Engine type and display

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | Add `SIGLUS("Siglus")` |
| `core/game/launch/EngineLauncher.kt` | Add `SIGLUS` to `supportedEngines` (engine page display) |
| `ui/engine/EngineScreen.kt` | `engineTabOf` → GAL; `engineDisplayName` keeps displayName; `engineDescription` gets a new branch; built-in engines default to `installed=true` + `engine_integrated` (no dialog needed; phase one does not add it to `builtinDialogEntries`) |
| `ui/game/GameScreen.kt` | `EngineType.coverColor()` gets a new placeholder color; `shouldShowSaveManagement` keeps "non-external/non-emulator → show" |
| `ui/home/HomeScreen.kt` | No change needed (uses displayName) |

### 4.2 Scan detection (`core/game/scan/EngineScanner.kt`)

Add signatures to the `detectEngine` decision chain (either after Artemis or before Tyrano is fine; the signatures do not conflict):

New collection variables (in the `call` collection phase, effective within the directory whitelist `ENGINE_SEARCH_DIRECTORIES`):
`hasGameexeDat`, `hasGameexeIni`, `hasScenePck` (root or `Data/`), `hasSelectIni`, `hasG00`.

Decision and scoring (`launchTarget = LAUNCH_TARGET_GAME_DIR`):

| Condition | Score |
|---|---|
| `Gameexe.dat` + `Scene.pck` | 96 |
| `Gameexe.ini` + `Scene.pck` | 95 |
| `Gameexe.dat/ini` (no `Scene.pck`) | 85 |
| `Scene.pck` + `Select.ini` + any `.g00` | 80 |
| `Select.ini` hit | +3 (bonus item; not sufficient on its own) |

File name matching must be case-insensitive and cover the localized variants `Gameexe{EN,ZH,ZHTW,DE,ES,FR,ID}.{dat,ini}` (aligned with the engine's `GAMEEXE_CANDIDATES`).

Add a unit test `EngineScannerSiglusTest` (following `EngineScannerPspSwitchTest`): root signature hit / `Data/Scene.pck` hit / case variants / Gameexe only without Scene.pck / no false positives (RPG Maker `Game.ini`, Artemis `root.pfs`, ONS without signatures).

### 4.3 Launch path (`core/game/launch/EngineLauncher.kt`)

- `buildIntent` gets a new branch (returns `Intent(SiglusActivity)`):
  - `PATH`/`GAME_PATH`/`PROJECT_ROOT`/`GAME_DIR` = real path of the game root (following `resolveGameDirectory`);
  - `ROOT_URI`, `LAUNCH_TARGET`, `LAUNCH_MODE = LaunchContract.LAUNCH_MODE_SIGLUS`;
  - `ORIENTATION` (following the existing orientation parameter);
  - `SIGLUS_LANGUAGE` = effective language (empty when auto → the host does not set env);
  - theme color extras are handled by the shared injection logic (already at the tail of `buildIntent`).
- Precondition: `requestAllFilesAccessIfNeeded` (consistent with the other built-in engines);
- After a successful launch: `recordRecentGame`; additionally invoke title write-back import (see §7.4);
- Launch failure: keep the typed `LaunchResult.Failure` return and the `LaunchErrorMessages` mapping.

### 4.4 Plugin validation branch

Add `SIGLUS -> true` to the `when (engine)` of `ensureForLaunch` in `core/engine/plugin/EnginePluginBootstrap.kt` (built-in, no plugin dependency); omitting it causes a compile failure (exhaustive when).

### 4.5 Saves (`core/game/save/GameSaveManager.kt`)

New branch in `resolveSaveLocation`:

```
EngineType.SIGLUS -> SaveLocation(File(root, "savedata"), text(R.string.save_location_engine_game_dir, game.engine.displayName), true)
```

- `listSaveFiles` / `exportToZip` / `importFromZip` are reused automatically (no changes needed);
- `cleanupAppData`: SIGLUS produces no app-private data → no new branch (when a game is deleted, the `savedata` inside the game root follows the existing policy, same as KRKR non-mirror mode);
- `excludeFor` gets no new entry (`.sav`/`.png` are all normal save data).

### 4.6 Engine settings (language)

| File | Change |
|---|---|
| `ui/settings/EngineSettingsMenuActivity.kt` | `EngineSettingsKind` adds `SIGLUS(R.string.engine_settings_siglus_title, R.drawable.ic_settings_engine)` |
| `ui/settings/SettingsScreen.kt` | `EngineSettingsDetailScreen`'s `LazyListPlaceholder` adds a `kind == SIGLUS` card `SiglusSettingsCard` (language dropdown, reusing the layout of the Ren'Py version dropdown) |
| `core/settings/EngineSettingsStore.kt` | Constants `SIGLUS_LANGUAGE_AUTO="auto"` and `JP/EN/ZH/ZHTW/DE/ES/FR/ID`; `getSigluLanguage/setSigluLanguage` (key `siglus_language`, written to `EnginePrefs.APP_PREFS`); whitelist normalization |
| `core/settings/EngineSettingsText.kt` | `sigluLanguageOptions()`: `auto → follow engine default (JP)`, `JP/EN/ZH/ZHTW/DE/ES/FR/ID` |
| `core/settings/EngineSettingsResolver.kt` + `ResolvedEngineSettings` | Add the `sigluLanguage` field (global + per-game override merged, `resolveAllowed` whitelist) |
| `core/settings/EffectiveEngineSettings.kt` | Language value whitelist normalization (invalid values fall back to `auto`) |
| `core/settings/PerGameSettingsStore.kt` | Add `F_SIGLUS_LANGUAGE = "siglus_language"` and its partition |
| `ui/settings/PerGameSettingsScreen.kt` | `when (game.engine)` gets a new SIGLUS branch: language dropdown (follow global / specific language) + info card (engine name, save directory, back-key description) |

Language semantics: `SIGLUS_LANGUAGE` only determines the value returned by the engine's `GET_LANGUAGE` system call (multi-language releases use it to switch text); `auto` means "do not set" (engine default `JP`).

### 4.7 Strings (strictly consistent across three languages)

Added to all three `strings.xml` files (final key names in Appendix C):

- `engine_desc_siglus` (engine page description)
- `engine_settings_siglus_title` (settings entry title)
- `engine_settings_siglus_language_title`, `engine_settings_siglus_language_auto`, `engine_settings_siglus_language_value_jp/en/zh/zhtw/de/es/fr/id`
- Reuse the existing `save_location_engine_game_dir` (takes a `%1$s` parameter, pass `game.engine.displayName`); no new save strings needed
- Other notices (e.g. double-click back to exit) use the three-language resources inside the host or fixed English (the host belongs to the engine module; if localization is required, the engine also needs strings — refer to the ONS host approach)

### 4.8 Other

- `core/game/storage/EngineDetectionRepository.kt`: `when (game.engine)` goes to `else -> null` (no version detection cache needed);
- `core/game/model/ScanGame.kt` / `GameEntity.kt`: no new fields needed (language goes through settings, title through write-back);
- `README.md`: add a SiglusEngine row to the engine support table; add `siglus_rs` (MPL-2.0) and the license notice to the acknowledgements;
- `CONTEXT.md`: add SiglusEngine and the "Siglus title write-back" term to the engine list.

---

## 5. engine-side change list

### 5.1 JNI shim: `engine/src/main/cpp/siglus_bridge.cpp` (new)

- `dlopen("libsiglus.so", RTLD_NOW)` + `dlsym` to obtain function pointers (cached into a static struct with `std::once_flag`);
- JNI methods (`com.core.siglus.NativeSiglus`):
  - `nativeInitContext(Context)` → `siglus_android_init_context` (using the JavaVM saved by `JNI_OnLoad` + a global reference);
  - `nativeSetLanguage(String|null)` → `setenv("SIGLUS_LANGUAGE", v, 1)` (**must be called before create**; passing null does not set it);
  - `create/setSurface/resize/step/touch/keyEvent/textInput/imePreedit/destroy`;
  - `imeArea(handle, int[4]) -> boolean` (new ABI, see §6.1);
  - `gameNameFromDir(path)` (for title write-back);
  - `messageboxCallback` registration (JNI callback → Java `SiglusMessagebox.onNativeMessagebox`).
- The same fault tolerance as `artemis_loader.cpp`: a missing symbol is only logged, core symbols must be checked before `create`; on failure throw `IllegalStateException` and let the host finish.

### 5.2 CMake

`engine/src/main/cpp/CMakeLists.txt` adds:

```cmake
add_library(siglus_bridge SHARED siglus_bridge.cpp)
target_link_libraries(siglus_bridge ${android-lib} ${log-lib} ${dl-lib})
```

### 5.3 Java host: `engine/src/main/java/com/core/siglus/`

| Class | Responsibility |
|---|---|
| `NativeSiglus.java` | JNI wrapper (`System.loadLibrary("siglus_bridge")`) |
| `SiglusActivity.java` | Lifecycle/frame loop/Surface/input/back key/IME show-hide/title write-back/messagebox routing (adapted from the upstream `SiglusGameActivity`, with Launcher-related parts removed) |
| `SiglusTextInputView.java` | Reuses the engine's existing IME pattern (isomorphic to `org.tvp.kirikiri2.KrTextInputView` + `KrInputConnection`): `onCheckIsTextEditor`/`onCreateInputConnection`, callbacks `commitText→textInput`, `setComposingText→imePreedit`, `finishComposingText→imePreedit(null)`, `sendKeyEvent→keyEvent` |

Key host behaviors (kept as upstream where identical, differences noted):

1. `onCreate`: full-screen immersive (`WindowCompat` + `WindowInsetsControllerCompat`); parse the `LaunchContract` extras, missing `PATH` → Toast + finish; attach the `SurfaceHolder.Callback`, touch and back callbacks; `applyImmersive()`; `setKeepScreenOn`.
2. `surfaceCreated`: when `handle != 0`, re-attach the surface via `setSurface` (returning from the background does not recreate the engine); otherwise `ensureEngine()`.
3. `ensureEngine()`: `nativeInitContext` → `nativeSetLanguage` (when the extra is non-empty) → `create(window, w, h, density, path)`; finish on failure; on success register the messagebox callback and record the handle.
4. Frame loop: `Choreographer.postFrameCallback`, `dt` clamped to 250ms; `step > 0` → `finish()`; `step < 0` → stop the loop, keep the last frame and the log (upstream semantics).
5. `onPause` stops the loop (without destroying the engine), `onDestroy` calls `destroy(handle)`.
6. Input:
   - touch is forwarded directly (coordinate conversion happens on the Rust side);
   - `onKeyDown/onKeyUp` map to VK codes per §7.1 and are forwarded via `keyEvent(handle, vk, text, isRepeat)`; `KEYCODE_BACK` is handled by `OnBackPressedCallback` (single click Escape, double click within 2s exits);
   - IME: every frame `imeArea(handle)` → when needed, `SiglusTextInputView` takes focus and calls `showSoftInput`; when not needed, hide and `clearFocus`; `commitText`/`setComposingText`/`finishComposingText` are forwarded.
7. Messagebox: `AlertDialog` (the engine side's traditional View system, consistent with the ONS/Artemis hosts); the four kinds map to `submitMessageboxResult` as upstream (OK/OK+CANCEL/YES+NO/YES+NO+CANCEL, **user logic values** 0/1/2).
8. Title write-back: after create succeeds, call `gameNameFromDir(path)`; if it differs from the directory name, write `siglus_title.<pathHash>` into `EnginePrefs.APP_PREFS` (`pathHash = Integer.toHexString(path.hashCode())`), using the same name agreed with the app side;
9. Logging: `SIGLUS_LOG` can be overridden by the `Intent` extra `siglus_log` (default warn), to ease on-device troubleshooting.

### 5.4 Manifest / resources

- `engine/src/main/AndroidManifest.xml` adds:

```xml
<activity
    android:name="com.core.siglus.SiglusActivity"
    android:exported="false"
    android:process=":siglus"
    android:launchMode="singleInstance"
    android:taskAffinity="com.core.Siglus"
    android:screenOrientation="sensorLandscape"
    android:windowSoftInputMode="adjustNothing"
    android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode|density|fontScale|locale|layoutDirection" />
```

- `engine/src/main/res/values/styles.xml` adds `Theme.Siglus` (`Theme.AppCompat.NoActionBar` + full-screen black background).

### 5.5 Contracts and constants

- `engine/src/main/java/com/core/engine/LaunchContract.kt`:
  - `LAUNCH_MODE_SIGLUS = "internal.siglus"`;
  - `SIGLUS_LANGUAGE = "siglus_language"`;
  - `SIGLUS_PATH_HASH = "siglus_path_hash"`;
  - (phase two) `SIGLUS_SCOPED_SAVE_DIR`.
- `engine/src/main/java/com/core/engine/EnginePrefs.kt`: `KEY_SIGLUS_TITLE_PREFIX = "siglus_title."`.

### 5.6 Packaging

- `engine/src/main/jniLibs/arm64-v8a/libsiglus.so` (20.5MB, shipped with the APK);
- `packaging.jniLibs.useLegacyPackaging = true` is already enabled (no change needed);
- CI needs no Rust toolchain (the .so is checked in).

---

## 6. fork (Weiss-UltimateSavior/siglus_rs) changes

### 6.1 New Android C ABI (`crates/siglus_scene_vm/src/android_host.rs` + `include/siglus.h`)

| New ABI | Semantics | Purpose |
|---|---|---|
| `int32_t siglus_android_ime_area(void* handle, int32_t* out_xywh)` | Returns 1 when an editbox is currently focused, filling in the x/y/w/h in **surface pixels** (the Rust side converts using the viewport + logical size, reusing the touch conversion code); returns 0 when IME is not needed | Host calls it every frame → `showSoftInput`/`hideSoftInput` and the cursor area |
| `int32_t siglus_android_editbox_accepts_direct_text(void* handle)` | Corresponds to `ctx.editbox_accepts_direct_text()` | Decides whether physical keyboard text passes straight through |
| `void siglus_android_key_event(void* handle, int32_t key_code, const char* text_utf8, int32_t is_repeat)` | Desktop semantics merged: mapped key → `on_key_down` (`is_repeat && Enter/Space/Escape` ignored); unmapped and not an editbox → `notify_wait_key()`; if `accepts_direct_text` and text is present → `on_text_input` | Single entry point for keyboard/soft-keyboard input |

`host.rs` must expose: `notify_wait_key()` (forwarding `vm.ctx.notify_wait_key()`), `editbox_accepts_direct_text()`, `focused_editbox_ime_area()` (existing `ctx` method), `logical_size()` (existing).

### 6.2 Language and saves (no phase-one change / phase two)

- `SIGLUS_LANGUAGE`: **already supported** (`runtime/globals.rs` reads `env::var`, default `JP`); phase one only needs the host to `setenv`, so the fork needs zero changes;
- Phase-two "scoped saves": `original_save::save_dir()` gains a `SIGLUS_SAVE_DIR` environment variable override (the same entry point for saving and reading, keeping compatibility with `<root>/savedata` and `<root>/save` when reading).

### 6.3 Build flow (`platform/scripts/package_android_apk.sh`, optional)

- Fix G4: after producing the output keep only `libsiglus.so` (delete the duplicate `libsiglus_scene_vm.so`), roughly halving the APK size.

### 6.4 Version and attribution

- Record the build baseline commit (e.g. `c17065c`) in TyranorNext's `README.md` and in this document;
- MPL-2.0: keep `LICENSE-MPL-2.0` and the file header notices; the TyranorNext README states "the engine runtime library comes from siglus_rs (MPL-2.0); see the fork repository for the source".

---

## 7. Key interaction details

### 7.1 Key mapping (Android `KeyEvent` → Windows VK)

| Android | VK | Notes |
|---|---|---|
| `KEYCODE_ESCAPE` / `KEYCODE_BACK` | 0x1B | Cancel/back |
| `KEYCODE_ENTER` / `KEYCODE_NUMPAD_ENTER` | 0x0D | Confirm |
| `KEYCODE_SPACE` | 0x20 | Advance |
| `KEYCODE_DEL` | 0x08 | Backspace (editbox backspace) |
| `KEYCODE_FORWARD_DEL` | 0x2E | Delete |
| `KEYCODE_TAB` | 0x09 | |
| `KEYCODE_SHIFT_LEFT/RIGHT` | 0x10 | |
| `KEYCODE_CTRL_LEFT/RIGHT` | 0x11 | Fast-forward |
| `KEYCODE_ALT_LEFT/RIGHT` | 0x12 | |
| `KEYCODE_META_*` | 0x5B | |
| `KEYCODE_DPAD_LEFT/UP/RIGHT/DOWN` | 0x25/0x26/0x27/0x28 | Menu navigation |
| `KEYCODE_A`..`KEYCODE_Z` | 0x41..0x5A | |
| `KEYCODE_0`..`KEYCODE_9` | 0x30..0x39 | |
| `KEYCODE_F1`..`F12` | 0x70..0x7B | |

Keys that are unmapped and have `event.unicodeChar != 0`: go through `key_event(handle, 0, text, repeat)` (triggering `notify_wait_key` and direct text input).

### 7.2 IME / text input flow

```
Every frame (after step):
  imeArea(handle) -> true ?  show the input method (SiglusTextInputView requests focus + showSoftInput)
                    -> false ? hide the input method (hideSoftInput + clearFocus)
IME events:
  commitText(t)          -> textInput(handle, t)          // engine commits to the editbox
  setComposingText(t,...)  -> imePreedit(handle, t, 0, len) // composing
  finishComposingText()  -> imePreedit(handle, null)      // cancel composition
Physical keyboard:
  keyEvent(handle, vk, text, repeat)
```

- Reuse the engine's existing IME class pattern (`KrTextInputView`/`KrInputConnection`), keeping the implementation style consistent with the KRKR host;
- Cursor area (CursorAnchorInfo): may be omitted in phase one (most IMEs work without it); listed as an optional improvement.

### 7.3 Language

```
Settings (global or per-game) → EngineSettingsResolver.sigluLanguage
  → EngineLauncher extras (SIGLUS_LANGUAGE)
  → host nativeSetLanguage (setenv when not auto)
  → SystemRuntimeState::default() reads env when the engine is created
  → the game script's GET_LANGUAGE receives the corresponding value
```

### 7.4 Title write-back (GAMENAME)

```
Host create succeeds → gameNameFromDir(path) (the engine already holds the key and parses Gameexe for GAMENAME)
  → if different from the directory name, write tyranor_prefs: siglus_title.<pathHash>
App (after a successful launch / on library refresh) → if the DB title == directory name (i.e. not manually renamed) → update to GAMENAME
```

- Write-back failure / no `GAMENAME` → keep the directory name (existing behavior);
- Manual rename protection: overwrite only when the title equals the scan default (directory name).

### 7.5 Saves

- Phase one: `<game root>/savedata` (the engine natively reads `<root>/save` for compatibility);
- Save mirroring (zip export/import) and listing are reused automatically; import writes back to `<game root>/savedata`;
- Phase two (optional): `SIGLUS_SAVE_DIR` + a per-game "scoped saves" switch (directory `getExternalFilesDir/save/siglus/<safeSaveName>`), with interaction semantics consistent with KRKR/ONS.

### 7.6 Permissions

- Consistent with other native engines: `requestAllFilesAccessIfNeeded` before launch (Android 11+ `MANAGE_EXTERNAL_STORAGE`);
- Without permission: Siglus can still read (depending on the directory), but writes to `savedata/` and `key.toml` fail → the `PerGameSettingsScreen` info card must note "all-files access is required to save".

### 7.7 Back key and exit

- Single back press → engine Escape (close menus/cancel selection);
- Double press within 2 seconds → exit the host (upstream semantics, with a Toast);
- `step > 0` (in-game exit to the system) → `finish()`.

---

## 8. Build and integration steps

### 8.1 Building the engine library (fork side, once/per update)

```bash
cd /Users/weiss/Desktop/sg/siglus_rs
cargo ndk -t arm64-v8a -o /tmp/siglus-android build --release -p siglus_scene_vm
cp /tmp/siglus-android/arm64-v8a/libsiglus_scene_vm.so \
   /Users/weiss/opencode/rma/TyranorNext/engine/src/main/jniLibs/arm64-v8a/libsiglus.so
```

(Alternatively use `lib/arm64-v8a/libsiglus.so` directly from the upstream release APK, baseline `1eadb38`; this project has already verified it can be extracted.)

### 8.2 Integration build and verification

```bash
./gradlew :app:assembleDebug --no-daemon
./gradlew :app:testDebugUnitTest --no-daemon
python3 tools/check-hardcoded-ui-strings.py
git diff --check
```

### 8.3 CI impact

- No Rust toolchain requirement (the .so is checked in); APK size +20.5MB (arm64); the nativeplugin packaging job is unaffected;
- If the fork side needs CI to produce the .so, refer to the upstream `release.yml` Android job (not required by this plan).

---

## 9. Testing and acceptance

### 9.1 Unit tests

| Case | Content |
|---|---|
| `EngineScannerSiglusTest` | Signature detection and scoring (including case, `Data/Scene.pck`, localized variants), no false positives |
| `EngineSettingsResolverTest` (extended) | SIGLUS language: global/per-game override, invalid values fall back to auto |
| `GameSaveManagerTest` (extended) | SIGLUS → `<root>/savedata`; import/export round trip |

### 9.2 On-device acceptance (at least 1 Siglus game)

1. Scanned and detected as Siglus, with title/cover displayed correctly;
2. Launch into the game: title screen → touch to advance dialogue → open menu/save → load;
3. After saving, re-enter (including after killing the process) and the save is still there (`savedata/` has new files; `key.toml` is generated on first launch);
4. Single back press = cancel/close menu, double press = exit;
5. Hardware keyboard (or adb `input keyevent`) space/enter advances, Ctrl fast-forwards;
6. Name-entry scenes: the soft keyboard appears, input commits, composing text works (see §7.2);
7. Language switching (if the game is multi-language): after setting JP/EN, `GET_LANGUAGE` takes effect;
8. Title write-back: after the first launch, the library title changes from the directory name to GAMENAME;
9. Background return: switching to the background and back does not restart the engine (progress retained);
10. Save mirroring: export zip → clear saves → import → load restores.

### 9.3 Rollback

- Removing the `EngineType.SIGLUS` related branches + deleting `libsiglus.so` returns to the pre-integration state (no data migration risk; title write-back only changes the title field, which can be changed back directly in the library).

---

## 10. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| wgpu/Vulkan compatibility (some older devices have no Vulkan) | Cannot render | Upstream supports a GLES backend (wgpu); cover it in on-device tests; if insufficient, document the device requirements |
| Upstream API changes | Any .so rebuild requires regression | Pin the baseline commit; depend only on the stable `siglus_android_*` ABI |
| Brute-forcing the EXE key on first launch is slow | First-launch wait | Upstream behavior; show a loading state (host Toast/wait animation optional) |
| minSdk 26 vs upstream 28 | Crashes on older devices | Note Android 9+ in the release notes; or add a version check hint in `EngineLauncher` |
| Game root is read-only (SD card/Android/data) | Save and key writes fail | Reuse the all-files flow; use `SIGLUS_SAVE_DIR` scoped saves in phase two |
| MPL-2.0 compliance | Licensing conflict concerns | Keep the notices + README source (fork) link; the self-developed shim is not mixed in |
| Host IME overlapping the in-game input method | Input anomalies | Align with KRKR host behavior; show IME only when `imeArea` is true |

Open questions (to be decided during review):

1. Whether the language dropdown includes `ZHTW/DE/ES/FR/ID` (phase one offers the full set; if too long, keep only `auto/JP/EN/ZH`);
2. Whether title write-back is enabled by default (recommended: yes, and overwrite only titles that were not manually renamed);
3. Whether to add an info dialog to the SIGLUS row on the engine page (showing engine source/version baseline; default: no, keeping `engine_integrated`).

---

## 11. Milestones (suggested implementation order)

| Stage | Content | Dependency | Estimate |
|---|---|---|---|
| M0 | fork adds the ABI (§6.1) + rebuild the .so; add to `jniLibs` | none | 0.5 day |
| M1 | engine: shim + host + Manifest + contract constants | M0 | 1 day |
| M2 | app: EngineType/scan/launch/save/plugin branch + strings | M1 | 1 day |
| M3 | Language settings chain (Store/Resolver/Settings UI/per-game override) | M2 | 1 day |
| M4 | IME/keyboard wiring + title write-back + on-device acceptance | M3 | 1 day |
| M5 | README/CONTEXT updates + regression (unit tests/three languages/build) | M4 | 0.5 day |
| Phase two | Scoped saves, nativeplugin conversion, cover art (cover.png), packaging deduplication, cursor anchor | M5 | To be scheduled |

---

## Appendix A: ABI mapping table (phase one)

| shim JNI | C ABI | Notes |
|---|---|---|
| `nativeInitContext` | `siglus_android_init_context` | Required before create |
| `nativeSetLanguage` | `setenv("SIGLUS_LANGUAGE")` | Via libc, not an engine symbol |
| `create` | `siglus_android_create` | |
| `setSurface` | `siglus_android_set_surface` | |
| `resize` | `siglus_android_resize` | |
| `step` | `siglus_android_step` | |
| `touch` | `siglus_android_touch` | |
| `keyEvent` | `siglus_android_key_event` | New (fork) |
| `textInput` | `siglus_android_text_input` | |
| `imePreedit` | `siglus_android_ime_preedit` | |
| `imeArea` | `siglus_android_ime_area` | New (fork) |
| `acceptsDirectText` | `siglus_android_editbox_accepts_direct_text` | New (fork; may be inlined into the keyEvent decision) |
| `destroy` | `siglus_android_destroy` | |
| `gameNameFromDir` | `siglus_game_name_from_dir` | Title write-back |
| `stringFree` | `siglus_string_free` | Metadata release |
| Messagebox callback | `siglus_android_set_native_messagebox_callback` + `submit_messagebox_result` | |

## Appendix B: Detection signature mapping (EngineScanner)

| Signature | File name/path | Case |
|---|---|---|
| Gameexe (main) | `Gameexe.dat`, `Gameexe.ini` | insensitive |
| Gameexe (localized) | `GameexeEN/ZH/ZHTW/DE/ES/FR/ID.{dat,ini}` | insensitive |
| Scene | `Scene.pck` (root), `Data/Scene.pck` | insensitive |
| append | `Select.ini` | insensitive |
| Resource hint | any `*.g00` in the root or search directory | insensitive |

## Appendix C: New string keys (three languages)

| Key | zh | ja | en |
|---|---|---|---|
| `engine_desc_siglus` | SiglusEngine(Key/VisualArts 系) | SiglusEngine(Key/VisualArts 系) | SiglusEngine (Key / VisualArts) |
| `engine_settings_siglus_title` | Siglus | Siglus | Siglus |
| `engine_settings_siglus_language_title` | 游戏语言 | ゲーム言語 | Game language |
| `engine_settings_siglus_language_auto` | 跟随引擎默认(JP) | エンジン既定(JP) | Engine default (JP) |
| `engine_settings_siglus_language_value_jp` | 日语(JP) | 日本語(JP) | Japanese (JP) |
| `engine_settings_siglus_language_value_en` | 英语(EN) | 英語(EN) | English (EN) |
| `engine_settings_siglus_language_value_zh` | 简体中文(ZH) | 簡体字中国語(ZH) | Simplified Chinese (ZH) |
| `engine_settings_siglus_language_value_zhtw` | 繁体中文(ZHTW) | 繁体字中国語(ZHTW) | Traditional Chinese (ZHTW) |
| `engine_settings_siglus_language_value_de` | 德语(DE) | ドイツ語(DE) | German (DE) |
| `engine_settings_siglus_language_value_es` | 西班牙语(ES) | スペイン語(ES) | Spanish (ES) |
| `engine_settings_siglus_language_value_fr` | 法语(FR) | フランス語(FR) | French (FR) |
| `engine_settings_siglus_language_value_id` | 印尼语(ID) | インドネシア語(ID) | Indonesian (ID) |

> The actual wording follows the project's three-language proofreading conventions; key names and counts use this table as the baseline, and after adding them `tools/check-hardcoded-ui-strings.py` must pass.

---

## Implementation record (M0–M5)

### M0 fork changes (`/Users/weiss/Desktop/sg/siglus_rs`, not committed)

| File | Change |
|---|---|
| `crates/siglus_scene_vm/src/host.rs` | Added `SiglusHost::key_event(code, text, is_repeat)` (desktop KeyboardInput semantics: mapped keys deduplicated, unmapped keys `notify_wait_key`, editbox text passthrough), `editbox_accepts_direct_text()`, `focused_editbox_ime_area()`, `notify_wait_key()` |
| `crates/siglus_scene_vm/src/android_host.rs` | Added exports `siglus_android_key_event` / `siglus_android_ime_area` (reusing the aspect-fit viewport conversion to surface pixels) / `siglus_android_editbox_accepts_direct_text` |
| `crates/siglus_scene_vm/include/siglus.h`, `platform/android/app/src/main/cpp/include/siglus.h` | New ABI declarations synchronized |

Build and check-in:

```bash
cd /Users/weiss/Desktop/sg/siglus_rs
ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/28.0.13004108   cargo ndk -t arm64-v8a -o /tmp/siglus-android build --release --lib -p siglus_scene_vm
cp /tmp/siglus-android/arm64-v8a/libsiglus_scene_vm.so    /Users/weiss/opencode/rma/TyranorNext/engine/src/main/jniLibs/arm64-v8a/libsiglus.so
```

Measured: the build takes about 5 minutes; the artifact is 20,484,936 B (same order of magnitude as upstream's 20,493,704 B, depending only on system libraries); `siglus_android_key_event/ime_area/editbox_accepts_direct_text` are confirmed exported.

### M1–M3 engine/app changes

- engine: `cpp/siglus_bridge.cpp` (self-developed JNI shim: dlopen + JNI_OnLoad caching JavaVM/NativeSiglus, `setenv("SIGLUS_LANGUAGE")`, messagebox callback, IME/text/metadata), CMake target `siglus_bridge`, `com/core/siglus/{NativeSiglus,SiglusActivity,SiglusTextInputView}.java`, Manifest `:siglus` entry, `Theme.Siglus`, `LaunchContract` (`LAUNCH_MODE_SIGLUS`/`SIGLUS_LANGUAGE`/`SIGLUS_PATH_HASH`), `EnginePrefs` (`siglus_title.`/`siglus_uri.`/`siglus_default_title.` prefixes), engine three-language strings (`engine_siglus_*` 3 keys ×3).
- app: `EngineType.SIGLUS`, `EngineScanner` signatures (`GAMEEXE_DAT_RE`/`GAMEEXE_INI_RE`/`scene.pck`/`select.ini`/`.g00`; scores 96/95/85/80) + `EngineScannerSiglusTest` (6 cases), `EngineLauncher.buildSiglusIntent` (including title write-back registration), `EnginePluginBootstrap` branch, `GameSaveManager` SIGLUS → `<root>/savedata`, `EngineScreen` (GAL/description), `GameScreen` placeholder color, `SiglusTitleFeedback` (library-load import) + `MainLibraryViewModel` hookup, `strings.xml ×3` (13 keys).
- settings: `EngineSettingsStore` (`siglus_language` + 9-value whitelist), `EngineSettingsResolver`/`ResolvedEngineSettings.siglusLanguage`, `EngineSettingsText.siglusLanguageOptions(Map)`, `EngineSettingsKind.SIGLUS` + global card, `PerGameSettingsStore.F_SIGLUS_LANGUAGE` + per-game card, `GameOverridePartitions.KEY_SIGLUS_LANGUAGE` (persisted with the tyrano partition).

### Deviations from the plan (as implemented)

1. Partition for the language override: the DB has no SIGLUS column, so `siglus_language` is explicitly listed in `TYRANO_KEYS` (the tyrano partition is the existing "remaining fields" partition); no Room migration.
2. Title write-back protocol: the App registers `siglus_uri.<hash>` and `siglus_default_title.<hash>` before launch; the host only writes `siglus_title.<hash>`; the import overwrites only when "library title == registered directory name", so user renames are protected.
3. Import timing: consumed during `MainLibraryViewModel` initialization (library load) rather than in a launch callback (the host write happens after launch).
4. The IME cursor anchor is implemented with `CursorAnchorInfo` (the original plan listed it as optional).
5. Tests: `EngineScannerSiglusTest` covers dat/ini/localized/Data-Scene/low confidence/false positives; `GameOverridePartitionsTest` gains SIGLUS key assertions.

### Verification results

- `./gradlew :app:assembleDebug` passes; the APK contains `lib/arm64-v8a/libsiglus.so` (20.5MB) and `libsiglus_bridge.so`; the merged Manifest contains `SiglusActivity`/`:siglus`.
- `./gradlew :app:testDebugUnitTest` passes; `python3 tools/check-hardcoded-ui-strings.py` and `git diff --check` pass.
- On-device acceptance (the ten items in §9.2) has not been performed yet; regression is pending an available device; Siglus requires Android 9+ (upstream minSdk 28).