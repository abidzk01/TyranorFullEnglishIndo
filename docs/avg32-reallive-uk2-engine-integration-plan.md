# AVG32 / RealLive / UK2 Three-Engine Integration Plan (framebuffer engine group)

> Status: **plan awaiting review (not implemented); M0 measurement completed (see §2.6)**
> Related upstream: `Weiss-UltimateSavior/siglus_rs` @ `85730c2` (adds `game_launcher` / `engine-detect` / `avg32` / `reallive` / `uk2`)
> Summary of the conclusion: **reuse the upstream unified library `game_launcher` + a self-built JNI shim + one new framebuffer host Activity**;
> the M0 measurement confirms that a single library exports both `siglus_android_*` (including the fork's new input ABI) and `game_*`, with only +4.0MB in size,
> so **Option A is final**; the Siglus chain continues to reuse the same `.so` and the host code stays untouched.
> Phase 1 scope = scan detection → launch → text/audio/video → save read/write → text encoding settings; **no online cover scraping, no independent save mirroring**.

---

## 0. Terminology and Naming

| Item | Value |
|---|---|
| EngineType | `AVG32("AVG32")`, `REALLIVE("RealLive")`, `UK2("UK2")` |
| Engine page group | GAL (`EngineTab.GAL`) |
| launchMode | `internal.framebuffer` (shared by all three engines) |
| Host class | `com.core.games.FramebufferGameActivity` (process `:fbgames`) |
| JNI wrapper | `com.core.games.NativeGames` (`System.loadLibrary("games_bridge")`) |
| Self-built shim | `engine/src/main/cpp/games_bridge.cpp` → `libgames_bridge.so` |
| Native engine library | `libsiglus.so` (= upstream `libgame_launcher.so` renamed) **or** `libgames.so` (Option B, see §3.1) |
| Save directory | See §6 (AVG32 = single file `<root>/SAVE.INI`; RealLive = `<root>/savedata_rs`; UK2 = `<root>/FLAG00.DAT`...`FLAG09.DAT`) |
| Engine settings category | New `EngineSettingsKind.FRAMEBUFFER` (text encoding) |

---

## 1. Background

The `siglus_rs` upstream has expanded from "a port of SiglusEngine" into **a four-engine Rust reimplementation**, consolidating the multi-engine capability into two new crates:

| Engine | Upstream crate | Size | Unit tests | Rendering |
|---|---|---|---|---|
| SiglusEngine | `siglus_scene_vm` | — | — | GPU (wgpu) + platform native host |
| RealLive | `reallive` | ~94.9k lines | 62 | CPU software rendering → RGBA frames |
| AVG32 | `avg32` | ~15.8k lines | 34 | CPU software rendering → RGBA frames |
| UK2 (PC-98) | `uk2` | ~18.1k lines | 34 | CPU software rendering → RGBA frames |

TyranorNext status: `EngineType` already has built-in engines such as `SIGLUS` and `FVP`; the host model is "one `Activity` per engine + one self-built `*_bridge.so` (dlopen the engine .so)". FVP's `com/core/fvp/{FvpActivity, NativeRfvp}.java` + `librfvp_bridge.so` + `librfvp.so` is exactly the template this plan copies.

**Key difference**: Siglus is `SurfaceView + wgpu + siglus_android_*` ABI; AVG32/RealLive/UK2 are the `game_fb_*` framebuffer ABI (CPU produces frames → host uploads textures/bitmaps), so **`SiglusActivity` cannot be reused**.

---

## 2. Upstream Capability Survey (measured / source reading)

### 2.1 C ABI (`game_launcher`, see `crates/game_launcher/src/ffi.rs`)

```c
/* detection / identification */
char* game_scan_json(const char* path, int depth, const char* cover_cache_dir);
char* game_probe_json(const char* root, const char* nls, const char* cover_cache_dir);
/* probe result fields: id/root/engine/engine_name/supported/unsupported_reason/title/
 *                      cover/cover_kind/nls/nls_options[{id,label}] */

/* run (RealLive / AVG32 / UK2) */
void* game_fb_open(const char* root, const char* engine, const char* nls,
                   char** error_out);              /* returns NULL on failure and fills in the error string */
int   game_fb_step(void* h, uint32_t dt_ms);       /* 0=running 1=finished */
const uint8_t* game_fb_frame(void* h,
                             uint32_t* width, uint32_t* height);
                                                   /* tightly packed RGBA8; pointer valid until the next call */
void  game_fb_pointer_move(void* h, int32_t x, int32_t y);
void  game_fb_pointer_button(void* h, int32_t button, int32_t pressed); /* 0=left 1=right */
void  game_fb_wheel(void* h, int32_t up);
void  game_fb_key(void* h, uint32_t code, int32_t pressed);
void  game_fb_text(void* h, const char* utf8);     /* IME commit */
int   game_fb_cursor_visible(void* h);             /* 1=host should show the pointer */
const char* game_fb_title(void* h);                /* do not free; valid until the next call */
void  game_fb_close(void* h);

void  game_add_font_file(const char* path);
void  game_string_free(char* ptr);
```

Key codes: `1 Enter / 2 Escape / 3 Space / 4-7 Up/Left/Down/Right / 8 PageUp / 9 PageDown / 10 Home / 11 End / 12 Backspace / 13 Tab / 14 Ctrl / 15 Shift / 0x100+n Fn (n=1..12) / 0x10000+codepoint character`.
Note: **there is no separate `frame_size` ABI** — each frame calls `game_fb_frame(h,&w,&h)` directly to get the size and pixel pointer (the upstream shim's `fbFrameSize`/`fbCopyFrame` are just JNI wrappers around it).

### 2.2 Engine Detection (`engine-detect`)

| Engine | On-disk evidence |
|---|---|
| SiglusEngine | `Scene.pck` or `Gameexe.dat` |
| UK2 | `UK2.CFG`, or a `.MES` with the `<< UK2 TEXT Ver1.00 >>` header |
| AVG32 | `Gameexe.ini` + `PACL` `SEEN.TXT`, or loose `TPC32` `SEEN###.TXT` |
| RealLive | `Gameexe.ini` + a `SEEN.TXT` with a 10000-entry TOC (scene header `0x1d0` / AVG2000 `0x1cc`), or loose `SEEN####.TXT` |

The RealLive archive location is found through `#FOLDNAME.TXT` in `Gameexe.ini`, falling back to the game root and `DAT/`.

### 2.3 Upstream Android Implementation (for reference; the shim is recommended to be self-built)

- `com.chino.siglus.NativeGames`: `System.loadLibrary("siglus")` + `loadLibrary("siglus_jni")`; methods `scanJson/probeJson/addFontFile/fbOpen/fbStep/fbFrameSize/fbCopyFrame/fbPointerMove/fbPointerButton/fbWheel/fbKey/fbText/fbClose`.
- `FramebufferGameActivity`: `Choreographer` frame loop; `fbStep` → `fbCopyFrame` (DirectByteBuffer) → `FramebufferView` draws the bitmap; touch tap = left button, two-finger tap = right button, two-finger swipe = wheel; buttons skip/menu; `EXTRA_ROOT/EXTRA_ENGINE/EXTRA_NLS/EXTRA_TITLE`.
- `siglus_jni.cpp`: `dlopen("libsiglus.so")` + `dlsym` (fetching both `siglus_android_*` and `game_*`).
- Upstream build script `platform/scripts/package_android_apk.sh`: `LAUNCHER_CARGO_PKG=game_launcher`, the artifact `libgame_launcher.so` is **renamed to `libsiglus.so`**, and the single library exports both ABI groups.

### 2.4 Gap List (must be addressed)

| # | Gap | Handling |
|---|---|---|
| G1 | Whether a single library exports both `siglus_android_*` and `game_*` | **Solved in M0**: measurement shows both ABI groups fully exported (§2.6), no Option B needed |
| G2 | No `android_logger` initialization on non-Siglus paths | Initialize `android_logger` inside the shim, or reuse `siglus_android_init_context` |
| G3 | All three engines need CJK fonts | Call `game_add_font_file` before launch: prefer the game's own `dat/*.ttf`, fall back to the FVP/Siglus default font |
| G4 | AVG32 saves are a single file `SAVE.INI` | Save management must support "file mode" or `root + file name filter` (§6) |
| G5 | UK2 save file names/directory | **Solved in M0 (confirmed by source reading)**: `<game root>/FLAG00.DAT`...`FLAG09.DAT` (10 slots, see §6) |
| G6 | CPU software rendering performance (1080p stretching) | Bitmap upload is handled by Canvas/GPU; frame rate and memory measured (§7) |
| G7 | Three-language copy, strictly consistent across three languages | Add strings keys and pass `tools/check-hardcoded-ui-strings.py` |
| G8 | Title/cover already implemented in Kotlin | Optionally integrate `game_probe_json` to improve non-Siglus cover/title quality |
| G9 | arm64-v8a target only | Consistent with the existing `engine` module; x86_64 emulator in phase 2 |

### 2.6 M0 Measurement Record (2026-09-25, siglus_rs @ `85730c2`)

Build command:

```bash
ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/28.0.13004108 \
  cargo ndk -t arm64-v8a -o /tmp/games-android build --release -p game_launcher
# 1m57s, artifact libgame_launcher.so
```

| Metric | Measured value | Conclusion |
|---|---|---|
| Artifact | `libgame_launcher.so`, 24,602,928 B, stripped | Single library is usable |
| Size increase | Compared with the current `libsiglus.so` (20,645,832 B): **+3,957,096 B (+4.0MB)** | Total increase for three engines is only 4MB, acceptable |
| Dynamic dependencies | Only `liblog/libandroid/libdl/libOpenSLES/libm/libc` | No third-party runtimes |
| LOAD alignment | `0x4000` (16KB) | Meets Android 15+/16KB page size |
| `siglus_android_*` exports | All 16 present, including `create/step/touch/key_event/ime_area/ime_preedit/text_input/editbox_accepts_direct_text/set_native_messagebox_callback/submit_messagebox_result/init_context/set_surface/resize/destroy/key_down/key_up` | **G1 solved**: the existing `libsiglus_bridge.so` dlopen chain is unchanged |
| Other `siglus_*` exports | `siglus_game_name_from_dir`, `siglus_game_cover_path_from_dir`, `siglus_game_cover_mime_from_dir`, `siglus_string_free` | Title/cover ABI also present |
| `game_*` exports | All 15 present: `game_fb_open/step/frame/pointer_move/pointer_button/wheel/key/text/close/cursor_visible/title`, `game_scan_json`, `game_probe_json`, `game_add_font_file`, `game_string_free` | All ABIs required by the new host are available |

**Conclusion**: Option A passes; `engine/src/main/jniLibs/arm64-v8a/libsiglus.so` can be replaced directly with this artifact (see §7.2 for the subsequent Siglus regression).

---

## 3. Overall Design

### 3.1 Route Selection

| | Option A: single library (recommended) | Option B: dual libraries (fallback) |
|---|---|---|
| Approach | Replace `libsiglus.so` with `game_launcher` (a superset containing four engines) | Keep `libsiglus.so` (siglus_scene_vm) and add `libgames.so` (game_launcher) |
| Pros | Consistent with upstream; no duplicate Siglus code; the Siglus bridge needs no changes (symbols unchanged) | The already-validated Siglus kernel is untouched; risk isolation |
| Cons | Any engine's problem enters the same .so; larger size | Both .so files contain siglus_scene_vm, duplicating about 20MB |
| Preconditions | M0 measurement of symbol exports + Siglus regression passes | Option A validation fails or the size is unacceptable |

**Conclusion**: the M0 measurement (§2.6) has confirmed that Option A's symbol exports and size both meet the bar, so **A is final**; Option B is retained only as a troubleshooting option if a regression appears in the future.

### 3.2 Data Flow

```
App (game library card click)
  └─ EngineLauncher.buildFramebufferIntent(engine)
       extras: PATH/GAME_PATH/PROJECT_ROOT/GAME_DIR/ROOT_URI/LAUNCH_TARGET
               LAUNCH_MODE=internal.framebuffer, GAMES_ENGINE, GAMES_NLS
  └─ FramebufferGameActivity(:fbgames)
       ├─ System.loadLibrary("games_bridge") (shim dlopen libsiglus.so)
       ├─ game_add_font_file(font) → game_fb_open(root, engine, nls, &err)
       ├─ Choreographer each frame: game_fb_step(dt) → game_fb_frame(h,&w,&h)
       │     → Bitmap → FramebufferView (letterbox scaling)
       ├─ touch/key/IME → game_fb_pointer_* / fb_key / fb_text
       └─ step returns 1 or onDestroy → game_fb_close
```

### 3.3 Frame Rendering

- `game_fb_frame(h, &w, &h)` obtains the original size (AVG32 640×480, RealLive 800×600, UK2 640×400)
  and the tightly packed RGBA8 pointer, then centers it aspect-fit in the container (the same semantics as Siglus's viewport).
- The host uses one reused `Bitmap` (`Bitmap.Config.ARGB_8888`) + DirectByteBuffer to avoid per-frame allocation;
  the pixels from `game_fb_frame` are copied into the Bitmap and then drawn with `Canvas.drawBitmap`.
- wgpu/Metal is not involved, it is pure Canvas/GPU stretching; on 1080p target devices the pressure is mainly in `game_fb_step` (CPU),
  judged by the frame rate metrics in §7; downscale the target resolution if necessary (the host only scales, it does not change the engine internals).

### 3.4 Input Mapping

| Input | Behavior |
|---|---|
| Single-finger tap | Left button down+up (advance dialogue) |
| Two-finger tap | Right button (system menu/cancel) |
| Two-finger vertical swipe | Wheel (replay/history) |
| Back key | Right button; long press or double tap exits the host |
| Volume keys | Pass through to the system |
| Other keys | Mapped per Appendix B; unmapped and printable → `game_fb_text` |
| IME | Name-entry scenes: `game_fb_text` (phase 1 only does "text commit", no cursor anchoring) |

### 3.5 Engine Detection

Two-stage, to avoid rewriting the upstream detection logic and to avoid making scanning strongly dependent on native:

1. **Kotlin fast features** (`EngineScanner`) — collected case-insensitively:
   `Gameexe.ini`, `SEEN.TXT` (read the first 4 bytes to determine `PACL`; or use the 10000-entry TOC / `0x1d0`, `0x1cc` to determine RealLive),
   loose `SEEN*.TXT` headers (`TPC32`/RealLive headers), `UK2.CFG`, `.MES` header `<< UK2 TEXT Ver1.00 >>`.
2. **native probe enhancement** (optional, at import/pre-launch) — `game_probe_json` returns engine, title, cover, and NLS options;
   fall back to the Kotlin result on failure.

Suggested decision order: `SIGLUS → FVP → AVG32 → REALLIVE → UK2 → YURIS → CS2 ...`
(a standalone `Gameexe.ini` is no longer treated as Siglus by default beyond that; note the conflict with the existing `hasGameexeIni → SIGLUS 85`, and prioritize `SEEN.TXT` evidence in the scoring chain).

### 3.6 Text Encoding (NLS)

- Reuse FVP's encoding settings pattern: global default + per-game override.
- Values: `auto / sjis / gbk / big5 / utf8 / korean` (full set for RealLive; a subset for AVG32/UK2).
- The new `GameInfo.nls_options` comes from native; UI labels are rendered from local resources.
- Semantics: only affects text/script/save decoding for non-Siglus engines; `auto` = engine default (RealLive follows the RLdev record, otherwise SJIS).

### 3.7 Title and Cover (Optional Enhancement)

- `game_probe_json` can already provide `title` and `cover` (cover image → `.ico` → icon embedded in the exe → in-game image).
- Phase 1 recommendation: **scan detection must be done; cover/title enhancement can be deferred** (the existing library cover logic is already usable) to avoid too large a change surface at once.

### 3.8 Isolation From Siglus

- `libsiglus_bridge.so` + `SiglusActivity` + the `:siglus` process stay completely untouched;
- The new engines get an independent `libgames_bridge.so` + `FramebufferGameActivity` + `:fbgames` process;
- The two only share the native `libsiglus.so` (Option A) or each holds its own .so (Option B).

---

## 4. Change List

### 4.1 Upstream `siglus_rs` (M0 validation / possibly small changes)

| File | Change |
|---|---|
| — | Build the arm64 `.so` with `-p game_launcher`; verify with `llvm-nm` that `siglus_android_*`, `siglus_android_key_event/ime_area/editbox_accepts_direct_text`, and `game_*` are all exported |
| `crates/game_launcher/src/ffi.rs` | No change needed; `game_fb_frame` returns an RGBA8 pointer (valid until the next call) for the host to copy each frame |
| (optional) `crates/game_launcher/src/lib.rs` | If Option A symbols are missing: add `pub use siglus_scene_vm::android_host;` / `#[used]`, or add an android-only feature to control the Siglus dependency |

### 4.2 engine Module

| File | Change |
|---|---|
| `engine/src/main/cpp/games_bridge.cpp` | **New**: self-built shim, `dlopen("libsiglus.so" \| "libgames.so")` + `dlsym` `game_*`; JNI methods for `NativeGames`; logging via `android_logger`/`__android_log_print`; missing symbols are only logged and make `fbOpen` return 0 |
| `engine/src/main/cpp/CMakeLists.txt` | Add `add_library(games_bridge SHARED games_bridge.cpp)`, linking `android/log/dl` |
| `engine/src/main/java/com/core/games/NativeGames.java` | **New**: JNI wrapper (`System.loadLibrary("games_bridge")`), methods aligned with §2.1 |
| `engine/src/main/java/com/core/games/FramebufferGameActivity.java` | **New**: host (frame loop/input/IME/back key/error prompts/exit), following the upstream `FramebufferGameActivity` and the existing `FvpActivity` style |
| `engine/src/main/java/com/core/games/FramebufferView.java` | **New**: bitmap drawing + letterbox |
| `engine/src/main/AndroidManifest.xml` | Add `FramebufferGameActivity` (`android:process=":fbgames"`, `exported=false`, `sensorLandscape`, `configChanges` same as Siglus) |
| `engine/src/main/java/com/core/engine/LaunchContract.kt` | Add `LAUNCH_MODE_FRAMEBUFFER`, `GAMES_ENGINE`, `GAMES_NLS` |
| `engine/src/main/res/values{,-ja,-en}/strings.xml` | Host copy (errors, exit prompts, etc.) in three languages |
| `engine/src/main/jniLibs/arm64-v8a/` | Option A: replace `libsiglus.so`; Option B: add `libgames.so` |

### 4.3 app Module

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | Add `AVG32("AVG32")`, `REALLIVE("RealLive")`, `UK2("UK2")` |
| `core/game/scan/EngineScanner.kt` | Add features and scoring (§3.5); fix the overlapping detection of `Gameexe.ini` and Siglus |
| `core/game/launch/EngineLauncher.kt` | Add the three engines to `supportedEngines`; `buildIntent` branch → `buildFramebufferIntent` |
| `core/engine/plugin/EnginePluginBootstrap.kt` | `when` on the three engines → `true` (built-in, no plugin) |
| `core/game/save/GameSaveManager.kt` | `resolveSaveLocation` three branches (§6); AVG32 single-file mode |
| `ui/engine/EngineScreen.kt` | GAL grouping, `engineDescription`, built-in `installed=true` |
| `ui/game/GameScreen.kt` | `coverColor()` placeholder color |
| `core/settings/EngineSettingsStore.kt` | `fb_nls` key and whitelist (`auto/sjis/gbk/big5/utf8/korean`) |
| `core/settings/EngineSettingsResolver.kt` / `ResolvedEngineSettings` | Add the `fbNls` field (global + per-game merged) |
| `core/settings/PerGameSettingsStore.kt` | `F_FB_NLS` (persisted alongside the tyrano partition) |
| `ui/settings/EngineSettingsMenuActivity.kt` | `EngineSettingsKind.FRAMEBUFFER` |
| `ui/settings/SettingsScreen.kt` / `PerGameSettingsScreen.kt` | Encoding dropdown + info card (save location/back key description) |
| `app/src/main/res/values{,-ja,-en}/strings.xml` | 15± keys, strictly consistent across three languages |
| `README.md` / `CONTEXT.md` | Engine support table and terminology (AVG32/RealLive/UK2, framebuffer host) |
| Tests | `EngineScannerAvg32Test` / `RealliveTest` / `Uk2Test`; `EngineSettingsResolverTest` extensions |

### 4.4 Build and Packaging

```bash
# Option A: single library (isomorphic to upstream)
cd /Users/weiss/Desktop/sg/siglus_rs
ANDROID_NDK_HOME=... cargo ndk -t arm64-v8a -o /tmp/games-android build --release -p game_launcher
cp /tmp/games-android/arm64-v8a/libgame_launcher.so \
   /Users/weiss/opencode/rma/TyranorNext/engine/src/main/jniLibs/arm64-v8a/libsiglus.so
```

- Consistent with how the existing Siglus kernel is committed: **CI does not need the Rust toolchain** (the .so is committed).
- Record the baseline commit in the README and this document.
- Verify symbols after building (M0):
  `llvm-nm -D --defined-only libsiglus.so | grep -E 'siglus_android_|game_fb_'`

---

## 5. Key Interaction Details

### 5.1 Frame Loop and Lifecycle

- `Choreographer.postFrameCallback`; `dt` clamped to 250ms (consistent with the Siglus host).
- `onPause` stops the loop but does **not close the engine** (progress preserved); `onDestroy` calls `game_fb_close`.
- `fb_step` returns `1` = in-game exit → `finish()`; `fb_open` failure → Toast + `finish()`.

### 5.2 Errors and Unsupported Cases

- `supported=false` / `unsupported_reason` from `game_probe_json` is intercepted and displayed before launch.
- An unknown engine (`Unknown`) does not enter the host.

### 5.3 IME / Text Input

- Phase 1: the same 1×1 transparent `View` + `InputConnection` as Siglus, `commitText → game_fb_text`;
  composing text (`setComposingText`) is not forwarded (name entry in all three engines is confirmed character by character).
- Show the IME only when the game requests text — `game_fb_*` has no "does it need an IME" query and the interface is insufficient,
  so phase 1 may use a "button to manually show/hide the IME" (host menu item), listed as a known UX gap.

### 5.4 Logging

- The shim uses `__android_log_print` to print `fbOpen/fbStep` errors; Rust `log` records are dropped if there is no logger (acceptable).
- Optional: before create, the host calls `siglus_android_init_context` from the same library to initialize `android_logger`
  (level controlled by SIGLUS_LOG), but it requires a JavaVM/Context, which is an M1 detail.

---

## 6. Save Semantics

| Engine | Engine default write | TyranorNext `SaveLocation` | Notes |
|---|---|---|---|
| AVG32 | `<game root>/SAVE.INI` (overridable via `AVG32_SAVE_DIR`) | **Single-file mode**: `File(root, "SAVE.INI")`, or a new `SaveLocation.file` field | Global flags are also stored in this file |
| RealLive | `<game root>/savedata_rs` (overridable via `REALLIVE_SAVE_DIR`) | Directory `<root>/savedata_rs` | Directory style, directly reusing the existing list/import/export |
| UK2 | `<game root>/FLAG00.DAT`...`FLAG09.DAT` (10 slots, confirmed from source) | `root + ^FLAG\d\d\.DAT$ filter` or directory mode | PC-98 saves; the engine-internal name `flagNN.dat1` is mapped through a virtual extension and uppercased before being written |
| Siglus | `<game root>/savedata` | Directory (current) | Unchanged |

**Recommendation**: add a "file set (directory + file name whitelist)" capability to `SaveLocation`;
AVG32/UK2 use that mode; RealLive uses the existing directory mode. Deleting a game follows the existing KRKR non-mirroring policy.

---

## 7. Tests and Acceptance

### 7.1 Unit Tests

| Case | Content |
|---|---|
| `EngineScannerAvg32Test` | `Gameexe.ini` + `PACL SEEN.TXT`, loose `TPC32`, case variants, must not misjudge as RealLive |
| `EngineScannerRealliveTest` | 10000-entry TOC / `0x1d0`, `0x1cc`, `#FOLDNAME.TXT` pointing to `DAT/`, loose `SEEN####.TXT` |
| `EngineScannerUk2Test` | `UK2.CFG`, `.MES` header match, directories with no features |
| `EngineSettingsResolverTest` | `fb_nls` global/per-game override, invalid values fall back to auto |
| `GameSaveManagerTest` | AVG32 single file, RealLive directory, UK2 filter mode |

### 7.2 On-Device Acceptance (at least 1 title per engine)

| Engine | Suggested test title | Acceptance points |
|---|---|---|
| AVG32 | Kanon / AIR | detection → launch → sprites/transitions/choices → text encoding switching → SAVE.INI save/load |
| RealLive | CLANNAD / Little Busters! | detection → launch → text/voice/movies → system menu save/load → text encoding |
| UK2 | Sorcer Kingdom | detection → launch → map/battle → music → flagNN save/load |
| Siglus (regression) | 銀色、遥か / 月の彼方 | IME invocation + GLOBAL.NAMAE flow does not regress |

### 7.3 Performance Targets

- Frame rate: target ≥ 30fps (at 1080p stretching); peak memory, no leaks after 30min of continuous running.
- Launch time: `fb_open` ≤ 3s (excluding first-time asset decompression).

---

## 8. Risks and Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Single-library symbol export fails (G1) | Siglus host dlopen fails | **Eliminated**: M0 measurement shows both ABI groups fully exported (§2.6) |
| Single-library size growth | Larger APK | M0 records the measurement; split/trim the library if necessary |
| Insufficient CPU software rendering performance | Stuttering | Measure at the target resolution/frame rate; the host only scales; `fb_frame` zero-copy can be optimized later |
| AVG32 single-file save semantics | Save management unusable | Extend `SaveLocation` with file mode |
| UK2 save path | Save/load fails | **Eliminated**: source confirms `<root>/FLAG00.DAT`...`FLAG09.DAT` (§6); M1 re-check on device |
| Missing fonts | Garbled text/tofu boxes | `game_add_font_file` registers the game font/default font |
| SAF/permissions | Cannot write saves | Continue using `requestAllFilesAccessIfNeeded` (MANAGE_EXTERNAL_STORAGE) |
| No on-demand IME invocation interface | Poor name-entry UX | Phase 1 host provides a manual invocation button; phase 2 can add the ABI upstream |
| Licensing (MPL-2.0) | Compliance questions | Retain the notice + credit the source in README/CONTEXT; the self-built shim does not mix in upstream C++ |

---

## 9. Milestones (Suggested Implementation Order)

| Stage | Content | Dependency | Estimate |
|---|---|---|---|
| M0 | ~~Build `game_launcher` arm64; verify symbols; finalize Option A/B; confirm the UK2 save path~~ **Completed (§2.6)** | None | ✅ |
| M1 | shim + `NativeGames` + `FramebufferGameActivity/View` + Manifest; ~~get 1 RealLive title running~~ **code complete, on-device pending M4** (see "Implementation Record") | M0 | ✅ |
| M2 | app: EngineType/scanning/launch/saves/plugin branches + copy | M1 | ✅ |
| M3 | Text encoding settings chain (global/per-game) **completed**; font registration and cover/title enhancement deferred (see deviation 3) | M2 | ✅ |
| M4 | Per-title on-device acceptance for the three engines + Siglus regression | M3 | 1–2 days |
| M5 | Packaging, size recording, README/CONTEXT/doc updates **completed**; performance metrics follow M4 | M4 | ✅ |

---

## Appendix A: ABI Cross-Reference

| shim JNI (`NativeGames`) | C ABI (`game_launcher`) | Notes |
|---|---|---|
| `scanJson(path,depth,cache)` | `game_scan_json` | Returns JSON |
| `probeJson(root,nls,cache)` | `game_probe_json` | Includes title/cover/nls |
| `addFontFile(path)` | `game_add_font_file` | Called before launch |
| `fbOpen(root,engine,nls,err)` | `game_fb_open` | Returns a handle; fills in err on failure |
| `fbStep(h,dt)` | `game_fb_step` | 0 running / 1 finished |
| `fbFrameSize(h)` | `game_fb_frame` | The shim calls it with null w/h to get the size |
| `fbCopyFrame(h,buf)` | `game_fb_frame` | RGBA8 pointer → memcpy into a DirectByteBuffer |
| `fbPointerMove/Button` | `game_fb_pointer_move/button` | button 0=left 1=right |
| `fbWheel(h,up)` | `game_fb_wheel` | |
| `fbKey(h,code,pressed)` | `game_fb_key` | See Appendix B |
| `fbText(h,utf8)` | `game_fb_text` | IME commit |
| `fbClose(h)` | `game_fb_close` | |
| `stringFree(ptr)` | `game_string_free` | Frees JSON/error strings |

## Appendix B: Key Code Table (`game_fb_key`)

| Meaning | Code | Meaning | Code |
|---|---|---|---|
| Enter | 1 | PageUp / PageDown | 8 / 9 |
| Escape | 2 | Home / End | 10 / 11 |
| Space | 3 | Backspace | 12 |
| Up / Down | 4 / 5 | Tab | 13 |
| Left / Right | 6 / 7 | Ctrl / Shift | 14 / 15 |
| F1–F12 | `0x100+1..12` | Character | `0x10000 + codepoint` |

## Appendix C: Detection Feature Cross-Reference

| Feature | Determination |
|---|---|
| `Gameexe.ini` + `SEEN.TXT` header `PACL` | AVG32 (96) |
| `Gameexe.ini` + loose `SEEN###.TXT` header `TPC32` | AVG32 (92) |
| `Gameexe.ini` + `SEEN.TXT` with a 10000-entry TOC (`0x1d0`/`0x1cc`) | RealLive (96) |
| `Gameexe.ini` + loose `SEEN####.TXT` RealLive header | RealLive (92) |
| `UK2.CFG` | UK2 (95) |
| `.MES` header `<< UK2 TEXT Ver1.00 >>` | UK2 (90) |
| None of the above | Fall back to the existing heuristics |

## Appendix D: New Copy Keys (three languages)

`engine_desc_avg32`, `engine_desc_reallive`, `engine_desc_uk2`,
`engine_settings_framebuffer_title`, `engine_settings_fb_nls_title`,
`engine_settings_fb_nls_auto/sjis/gbk/big5/utf8/korean`,
`engine_fb_exit_hint`, `engine_fb_ime_toggle`, `engine_fb_open_failed`,
`save_location_avg32_file`, `save_location_reallive_dir`, `save_location_uk2_dir`.

## Appendix E: File Change Overview

```
engine/src/main/cpp/games_bridge.cpp                              [new]
engine/src/main/cpp/CMakeLists.txt                               [modified]
engine/src/main/java/com/core/games/NativeGames.java              [new]
engine/src/main/java/com/core/games/FramebufferGameActivity.java  [new]
engine/src/main/java/com/core/games/FramebufferView.java          [new]
engine/src/main/AndroidManifest.xml                               [modified]
engine/src/main/java/com/core/engine/LaunchContract.kt            [modified]
engine/src/main/jniLibs/arm64-v8a/libsiglus.so | libgames.so      [replace/add]
app/src/main/java/.../core/engine/EngineType.kt                   [modified]
app/src/main/java/.../core/game/scan/EngineScanner.kt             [modified]
app/src/main/java/.../core/game/launch/EngineLauncher.kt          [modified]
app/src/main/java/.../core/engine/plugin/EnginePluginBootstrap.kt [modified]
app/src/main/java/.../core/game/save/GameSaveManager.kt           [modified]
app/src/main/java/.../core/settings/{EngineSettingsStore,
    EngineSettingsResolver,PerGameSettingsStore}.kt               [modified]
app/src/main/java/.../ui/{engine/EngineScreen,game/GameScreen,
    settings/EngineSettingsMenuActivity,settings/SettingsScreen,
    settings/PerGameSettingsScreen}.kt                            [modified]
app/src/main/res/values{,-ja,-en}/strings.xml                     [modified]
app/src/test/java/.../EngineScanner{Avg32,Reallive,Uk2}Test.kt    [new]
README.md / CONTEXT.md                                            [modified]
```

---

## Implementation Record (M1–M3 + M5, M4 pending on-device)

### M1 engine Module (native + Java host)

| File | Change |
|---|---|
| `engine/src/main/cpp/games_bridge.cpp` | **New**: self-built shim, `dlopen("libsiglus.so")` + `dlsym` `game_*`, plus resolving `siglus_android_init_context` for ndk-context/log initialization; JNI methods aligned with `NativeGames` |
| `engine/src/main/cpp/CMakeLists.txt` | Add the `games_bridge` shared library target |
| `engine/src/main/java/com/core/games/NativeGames.java` | **New**: JNI wrapper + key code/mouse button constants + `initAndroidContext` |
| `engine/src/main/java/com/core/games/FramebufferView.java` | **New**: bitmap letterbox drawing and coordinate conversion |
| `engine/src/main/java/com/core/games/FramebufferTextInputView.java` | **New**: 1×1 hidden input view, IME commit → `game_fb_text` |
| `engine/src/main/java/com/core/games/FramebufferGameActivity.java` | **New**: `Choreographer` frame loop, gestures/keys/IME, control bar (IME/skip/menu), back key (single click = right button, double click = exit confirmation), loading layer |
| `engine/src/main/AndroidManifest.xml` | Add `FramebufferGameActivity` (`:fbgames`, `sensorLandscape`, `Theme.FramebufferGames`) |
| `engine/src/main/res/values/styles.xml` | Add `Theme.FramebufferGames` |
| `engine/src/main/res/values{,-ja,-en}/strings.xml` | Add 8 fb strings (missing directory/initialization failure/back to exit/IME/skip/menu) |
| `engine/src/main/java/com/core/engine/LaunchContract.kt` | Add `LAUNCH_MODE_FRAMEBUFFER`, `GAMES_ENGINE`, `GAMES_NLS`, `GAMES_TITLE` |
| `engine/src/main/jniLibs/arm64-v8a/libsiglus.so` | Replaced with the `game_launcher` artifact (single library with four engines, 24,602,928 B) |

### M2 app Module

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | Add `REALLIVE` / `AVG32` / `UK2` |
| `core/game/scan/EngineScanner.kt` | Add features and content sniffing: `UK2.CFG`, MES header, `SEEN.TXT` (`PACL`→AVG32 / 10000-entry TOC→RealLive), loose `SEEN###/####.TXT`; add `dat` to the search directories; add `readHead` to the SAF/File sessions |
| `core/game/launch/EngineLauncher.kt` | `supportedEngines` + `buildFramebufferIntent` + `framebufferEngineId` |
| `core/engine/plugin/EnginePluginBootstrap.kt` | Three engines → built-in (`return null`) |
| `core/game/save/GameSaveManager.kt` | RealLive → `<root>/savedata_rs`; AVG32/UK2 → game root + whitelist (`SAVE.INI` / `FLAGnn.DAT`), moving other game files back from the backup on import (same ARTEMIS semantics) |
| `ui/engine/EngineScreen.kt` | GAL grouping, description, `game_launcher-xmoezzz` built-in entry |
| `ui/game/GameScreen.kt` | Placeholder colors for the three engines |
| `app/src/main/res/values{,-ja,-en}/strings.xml` | 3 engine descriptions + 7 fb encoding settings + explanations, strictly consistent across three languages |
| `app/src/test/.../EngineScannerFramebufferTest.kt` | **New** 7 unit tests |

### M3 Text Encoding Settings Chain

- `EngineSettingsStore`: `fb_nls` (auto/sjis/gbk/big5/utf8/korean) + getter/setter/normalize
- `EngineSettingsResolver` / `ResolvedEngineSettings.fbNls` (global + per-game merged)
- `PerGameSettingsStore.F_FB_NLS` + `GameOverridePartitions.KEY_FB_NLS` (persisted alongside the tyrano partition)
- `EngineSettingsKind.FRAMEBUFFER` + settings page/per-game settings card (`fbNlsOptions`)

### Deviations From the Plan (as implemented)

1. **Save management**: AVG32/UK2 use "game root + file name whitelist + move the remaining files back from the backup after import", reusing the existing ARTEMIS semantics; the `SaveLocation.file` mode was not added; a custom AVG32 `#SAVEFILE` name is not detected for now.
2. **IME**: the engine has no "does it need an IME" ABI, so the host uses the "IME" button on the control bar to show/hide it manually (the phase 1 scope of the plan).
3. **Fonts**: `game_add_font_file` is not called; this relies on the Android system CJK font path fallback built into `game_fs`.
4. **Engine id**: `EngineType` → `reallive/avg32/uk2` is passed down; when content sniffing fails it is null, and the engine auto-detects from the file content.
5. **Detection**: `SEEN.TXT` is distinguished by the file header content (`PACL` / TOC), replicating the upstream `engine-detect` to avoid misjudging AVG32 as RealLive.

### Validation Results

- `./gradlew :app:assembleDebug --no-daemon` passes (including native shim compilation and `.so` packaging).
- `./gradlew :app:testDebugUnitTest --no-daemon` passes; `EngineScannerFramebufferTest` 7/7.
- `python3 tools/check-hardcoded-ui-strings.py` passes; `git diff --check` passes.
- **To do (M4)**: on-device Siglus regression (銀色、遥か IME / 月の彼方 NAMAE) + at least one on-device acceptance title per engine (AVG32/RealLive/UK2); CPU software rendering frame rate/memory metrics.

### M4 On-Device Validation Record (2026-09-25, HONOR MAA-AN10 / Android 16)

| Item | Result |
|---|---|
| Build/install | `assembleDebug` passes; `adb install -r -t -d` succeeds (the local artifact's versionCode is lower than the version already installed on the device, so `-d` was used in testing to allow a downgrade) |
| Engine page display | RealLive / AVG32 / UK2 appear in the GAL group, with correct descriptions and "integrated" entries |
| **Siglus regression** | 銀色、遥か: warning page → title → New Game → name change page; after tapping the `surname` field, `mInputShown=true` (soft keyboard works normally), **Siglus chain has zero regression after switching to the game_launcher single library** |
| Scan detection (synthetic samples) | `Gameexe.ini` + 8B `PACL` `SEEN.TXT` → AVG32 badge; `UK2.CFG` → UK2 badge (confirmed in both UI + DB) |
| Host chain (synthetic samples) | After launch it enters `FramebufferGameActivity` (`:fbgames` process); UK2 open failure → localized "launch failed / uk2: UK2.CFG is missing MIDI_EXT" dialog; AVG32 opens successfully, the engine runs until a missing scene, then `fbStep` returns finished and exits gracefully |
| Found and fixed on device | The shim's `nativeInitAndroidContext` JNI symbol was missing the `native` prefix, causing an `UnsatisfiedLinkError` crash; fixed and re-validated (all 16 JNI symbols map one-to-one with the Java natives) |
| Not covered | No real on-device RealLive/AVG32/UK2 games (the device only has Siglus/ONS/KRKR etc.); actual video/audio/save read-write and performance metrics (G6) await real games for regression |

> The synthetic sample directory has been deleted; its library records are excluded from UI display because the directory is missing, and a subsequent full rescan will clean them up.