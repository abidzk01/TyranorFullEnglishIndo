# System3.x (xsystem35-sdl2) built-in engine integration plan

> Status: **Implemented (phase one, 2026-10-13)**
> Upstream: `kichikuou/xsystem35-sdl2` (GPL-2.0-or-later); the local build source is the fork [Weiss-UltimateSavior/xsystem35-sdl2](https://github.com/Weiss-UltimateSavior/xsystem35-sdl2) (pinned commit `18af9be`, local survey repository `/Volumes/HUAWEI-M2LITE/app/xsystem35-sdl2`); **the engine and dependency sources are not vendored into the main repository** (at build time they are prepared by `engine/xsystem35/scripts/build-xsys35.sh` into a directory outside the repository, see `engine/xsystem35/BUILD.md`)
> Summary: **built-in host route** (SDLActivity main-loop host) + **xsystem35 and its dependencies are not vendored into the main repository (prepared by script outside the repo at build time), with CMake prebuilt libraries checked in** (direct jniLibs packaging) + **the SDL2 2.32.10 Java layer generated into a new package `org.libsdl.app32`** (the existing `org.libsdl.app` is 2.26.3 dedicated to ONS; its hard version check in onCreate necessarily conflicts with the 2.32.10 native, so it cannot be reused, see §3.4).
> Phase-one scope = scan detection + launch + save mirroring + basic display/audio settings + on-device acceptance; CD image installation is excluded (users just place games in the xsystem35 ZIP directory layout).

---

## 0. Terminology and naming

| Item | Value |
|---|---|
| EngineType | `XSYS35` (new) |
| Display name (`EngineType.displayName`) | `System35` |
| Badge (`abbr`) | `S3X` |
| Engine page group | GAL (`EngineTab.GAL`) |
| launchMode value | `internal.xsys35` |
| Host class | `com.core.xsys35.Xs35Activity` (process `:xsys35`) |
| Runtime library (engine library) | `libxsystem35.so` (built from the upstream C sources) |
| SDL2 runtime library (renamed) | `libSDL2x.so` (to avoid a name conflict with the ONS plugin inside the APK, see §3.4) |
| SDL2 Java layer | the vendored SDL2 **2.32.10** Java layer whose whole package is renamed to `org.libsdl.app32` (the existing `org.libsdl.app` is 2.26.3 dedicated to ONS; its `onCreate` hard version check necessarily conflicts with the 2.32.10 native, so it cannot be reused, see §3.4) |
| Auxiliary libraries | `libSDL2_mixer_xs35.so` (if produced as a shared library); freetype / libwebp are **hard dependencies** (the Android branch forces `HAVE_WEBP=1`) but are linked statically into `libxsystem35.so` by default — whether standalone .so files are produced is determined by the measured build artifacts (§3.3 / §5.4) |
| Bundled fonts | `MTLc3m.ttf` (Gothic), `mincho.ttf` (Mincho) → engine assets |
| Save directory (phase one) | Scoped-saves switch (default **on**): `getExternalFilesDir(null)/save/<safeSaveName>`; off = `<game root>/save` |
| Save file names | `<scene basename>s[a-z].asd` + `Volume.sav` + `*.asd.` backups (mirroring treats the directory as a whole, so no whitelist is needed) |
| Engine settings category | New `EngineSettingsKind.XSYS35` |
| Detection signatures | Root `*.ALD` (`SA.ALD` etc.) + optional `System39.ain`/`System39.ini`/`*.wai`/`*.bgi`/`*.alk` |

---

## 1. Background

xsystem35 is an open-source reimplementation of AliceSoft's **System 3.x** game engine (GPL-2.0-or-later), and `xsystem35-sdl2` is its SDL2 cross-platform port. The upstream Android APK has long been distributed (v2.20.0, minSdk 21, targetSdk 34), supporting:

- Running directly from a game directory (the `GAMEDATA` layout: `*.ALD` scene/graphics/audio files);
- CD audio virtualization (`playlist.txt` lists mp3/ogg tracks; no optical drive required);
- MIDI played through Android `MediaPlayer` (`src/midi.android.c`);
- Save import/export (`save/*.asd` zip round trip).

Integration value: completes TyranorNext's end-to-end "scan & detect → launch → save" support for the System 3.x family (the Rance series, Toushin Toshi, DiaboLiQuE and many other AliceSoft classics).

---

## 2. Upstream survey findings (source level)

### 2.1 Android host and runtime build (core)

| Item | Finding | Source |
|---|---|---|
| Build system | Standalone Gradle project `android/`; `app/` hosts both the xsystem35 Kotlin code and the SDL2 Android Java layer (`org/libsdl/app/*.java`, a full copy of the upstream project) | `android/app/build.gradle`, `android/app/src/main/java/` |
| Native build | `externalNativeBuild.cmake` → `app/jni/CMakeLists.txt`: **FetchContent** pulls the SDL2 2.32.10 / freetype 2.14.3 / SDL2_mixer 2.8.0 sources and builds them as subprojects; **libwebp 1.5.0 is pulled by the root `CMakeLists.txt`'s `fetch_webp()`** (the Android branch calls it unconditionally and sets `set(HAVE_WEBP 1)`, so it is not an optional dependency); then `add_subdirectory(../../../)` builds xsystem35 itself | `android/app/jni/CMakeLists.txt`, root `CMakeLists.txt:32-51,73-82` |
| Build parameters | `-DANDROID_APP_PLATFORM=android-19 -DANDROID_STL=c++_static`, abiFilters `armeabi-v7a,arm64-v8a` | `android/app/build.gradle` |
| Engine library artifact | `libxsystem35.so` (`add_library(xsystem35 SHARED)`, Android branch; other platforms build an executable); `main()` is invoked by SDL2's `nativeRunMain` | `src/CMakeLists.txt:29-36`, `src/xsystem35.c:458` |
| Host base class | `GameActivity : SDLActivity` (`org.libsdl.app`), declaring the separate process `:game` and `alwaysRetainTaskState` | `GameActivity.kt`, `AndroidManifest.xml` |
| Launch arguments | `getLibraries() = ["SDL2","xsystem35"]` (the order is the load order; the main library is the last item); `getArguments() = ["-gamedir", <game root>, "-savedir", <save directory>]` | `GameActivity.kt:74-83` |
| `-gamedir` semantics | Only inside `main()`, when `strcmp(argv[1],"-gamedir")==0`, does it `chdir(argv[2])` (**no argc validation, `argv[1]` is dereferenced unconditionally**: no arguments at all → segfault; `argv[1]` not `-gamedir` → chdir skipped and execution continues), then it loads the profile (`.xsys35rc`) → **`-gamedir` must be the first argument as a pair, and the game path becomes the process CWD** | `src/xsystem35.c:458,463-467` |
| Java ← native callbacks | Reflected through `SDL_AndroidGetActivity()`: `inputString(msg,old,max)`, `inputNumber(msg,min,max,init)` (blocking dialogs), `midiStart(path,loop)`, `midiStop()`, `midiCurrentPosition()`; the MIDI temp file is written to `SDL_AndroidGetInternalStoragePath()/tmp.mid` | `GameActivity.kt:136-167,170-238`, `src/input_modal.c`, `src/midi.android.c` |
| Title | Native passes it back via `setTitle`; the host writes the title into the game directory's `title.txt` (for the upstream's own library management) | `GameActivity.kt:84-93` |
| SDL2 patch | Only one: `SDLActivity.setWindowStyle(true)` (works around SDL#8995); no other forks | `GameActivity.kt:48-49` |
| Exit | `onDestroy` → `Process.killProcess(myPid())` (the same strategy as TyranorNext's hosts; note that `midi.release()` must come first) | `GameActivity.kt:62-72` |
| Fonts | The default fonts `MTLc3m.ttf`/`mincho.ttf` are copied into the APK assets at build time; the engine tries `FT_New_Face` first in `open_face` and falls back to `SDL_RWFromFile` (which can read assets) → **both fonts must be placed in the APK assets root**; on Android a failure to open ends in `SYSERROR` | `android/app/jni/CMakeLists.txt:45-57`, `src/font.c:108-144,153-157`, `config.h.in` |
| Saves | After scanning directories it generates `<savedir>/<basename>s[a-z].asd` per scene file basename (forced lowercase on Android/Emscripten); `Volume.sav` is derived from `save_path` | `src/gameresource.c:38-156` (`:124-138`), `src/volume.c:116` |
| Engine profile | `.xsys35rc` (**lookup order `$HOME/.xsys35rc` → relative-path CWD** (`src/profile.c:134-147`); `-gamedir` becomes the CWD via `chdir` and is hit by the second lookup; Android processes usually have no `HOME`): `savedir`/`ttfont_*`/`antialias`/`audio_buffer_size`/`render_driver`/`playlist`/`integerscale`/`mute_on_unfocus` etc. | `src/profile.c:134-147`, `src/xsystem35.c:299-406` (check_profile), `xsys35rc.sample` |
| Localization | Upstream ships po/ja etc.; the Android build does not enable libintl (`HAVE_LIBINTL` undefined) and uses the built-in NLS catalog (`nls.c`) | `CMakeLists.txt:160-169`, `src/CMakeLists.txt:145-147` |
| Size | Sources `src/` 1.5 MB + `modules/` 0.7 MB; estimated prebuilt artifacts: `libxsystem35.so` ~2–3 MB (freetype/libwebp statically linked in are included in the estimate) + SDL2 ~1.4 MB + SDL2_mixer ~0.5 MB (after strip, arm64) | Estimate from this survey |

### 2.2 Dependency list (Android branch)

```
xsystem35 ──┬── SDL2(2.32.10, zlib)        required; host/input/audio/window/GL
            ├── SDL2_mixer(2.8.0, zlib)    required; CD audio (mp3/ogg via built-in decoding)
            ├── freetype(2.14.3, FTL/GPLv2) required; font rasterization (bundled rasterizer only)
            ├── libwebp(1.5.0, BSD-3)      required; HAVE_WEBP=1, CG supports webp
            └── zlib / log                 NDK system libraries
```

- The Android branch does not use PortMidi/cJSON (the debugger is off; MIDI goes through Java MediaPlayer).
- `ENABLE_DEBUGGER` is ON by default but only compiled for non-Android branches (`src/CMakeLists.txt:134-137` includes the debugger sources only when not Android) — the Android build can ignore it.
- **Dependency build form (determines the §3.3 packaging list)**: the upstream Android build does not set `BUILD_SHARED_LIBS`; freetype/libwebp are **linked statically** into `libxsystem35.so` by default (`src/CMakeLists.txt:131` `target_link_libraries(xsystem35 PRIVATE WebP)`, `:149` `src_lib PRIVATE sdl2 freetype2 zlib`); whether SDL2_mixer produces a standalone .so is determined by the measured build artifacts — the jniLibs list is filled in from the §5.4 readelf measurements.

### 2.3 Gaps / parts requiring in-house work

| # | Gap | Handling |
|---|---|---|
| G1 | The SDL2 runtime library **name-conflicts** with the existing ONS plugin (`libSDL2.so`) | Rename the new library to `libSDL2x.so` (§3.4) |
| G2 | xsystem35 has no "launcher" concept (upstream ships its own game list/installer) | TyranorNext only reuses the `GameActivity` shape: launch directly with `-gamedir/-savedir`, without porting Launcher/GameStore/GameInstaller |
| G3 | No engine settings persistence (only `.xsys35rc`) | **Do not inject an rc**: the profile lookup order is `$HOME/.xsys35rc` → relative-path CWD (after chdir that is the gamedir, `src/profile.c:134-147`); anything expressible goes through command-line arguments (`-savedir`/`-renderer` etc., §6.6), never writing into the user's game directory |
| G4 | No IME text box (the input dialogs are native `EditText`) | Not done in phase one (System3.x input is very rare) |
| G5 | No scoped save directory switch | **No engine-side change needed**: `-savedir` is a free path, and the App side provides a "scoped saves" switch in phase one following the ONS precedent (§4.6, §6.5) |
| G6 | No back-key → Escape mapping | SDL2 native `back` behavior: `SDL_ANDROID_TRAP_BACK_BUTTON=1` (already set by the engine) + the host's "double-press back to exit" policy (aligned with other hosts) |
| G7 | No title write-back protocol | The host overrides `Activity.setTitle()` to capture the native title and writes prefs (`xsys35_title.<pathHash>`) → reusing the Siglus write-back import protocol (§6.7) |
| G8 | The shared `org.libsdl.app` (2.26.3) Java layer **hard-checks** `nativeGetVersion()` in `onCreate` (anything ≠ "2.26.3" pops "SDL C/Java version mismatch" and exits; subclasses cannot bypass it), so mixing it with the 2.32.10 native necessarily fails | Do not reuse that Java layer: rename the whole vendored SDL2 2.32.10 Java layer to `org.libsdl.app32` (§3.4); the existing `org.libsdl.app` stays for ONS, untouched |

---

## 3. Overall design

### 3.1 Route selection

| | External APK module (External Engine Module) | **Built-in host (selected)** |
|---|---|---|
| Main APK size | unchanged | +4–6 MB (arm64, after strip, including dependency libraries) |
| Integration effort | module project + registry + install protocol | scan/launch/host/settings completion |
| Experience | two APKs; the module needs its own authorization | single APK; the all-files flow/save mirroring/per-game settings/engine page are all reused |
| Licensing | process isolation is the cleanest | GPL-2.0-or-later: whether distributed with the App or distributed as a download, the source must be provided; see §9 licensing |
| Compatibility risk | cleanest isolation from the main App's SDL2 | must handle the `libSDL2.so` name conflict (§3.4), for which a solution is given |

Conclusion: consistent with the built-in engine precedents of KIRIKIROIID/ONS/Siglus/FVP, take the built-in host route; the SDL2 name conflict and the Java layer hard version check are both solved by "renaming the runtime library + vendoring the 2.32.10 Java layer into a new package `org.libsdl.app32`" (§3.4), without forking the upstream engine itself.

### 3.2 Data flow

```
App (game library card click)
  └─ EngineLauncher.buildXs35Intent(XSYS35)
       extras: PATH/GAME_PATH/PROJECT_ROOT/GAME_DIR, LAUNCH_TARGET, ROOT_URI
               LAUNCH_MODE=internal.xsys35
               XS35_SAVE_DIR (absolute path), XS35_SCOPED_SAVE_DIR, XS35_RENDERER,
               XS35_INTEGER_SCALE, XS35_MUTE_UNFOCUS, XS35_ORIGINAL_ROOT,
               ORIENTATION, theme color extras
  └─ Xs35Activity (:xsys35 process, extends org.libsdl.app32.SDLActivity ← vendored 2.32.10)
       ├─ loadLibraries(): System.loadLibrary("SDL2x") → "xsystem35" (aligned with upstream: only SDL2 and the main library are loaded explicitly; SDL2_mixer/freetype/libwebp are resolved automatically via DT_NEEDED; whether they are standalone .so files depends on the build artifacts)
       ├─ getArguments(): ["-gamedir", <game root>, "-savedir", <save directory>, optional "-renderer" etc.]
       ├─ SDL native main thread: nativeRunMain("libxsystem35.so", "SDL_main", args)
       │    └─ xsystem35 main(): chdir(gamedir) → load profile → initGameResource → SDL_Init → game loop
       ├─ Java callbacks: inputString/inputNumber (native dialogs), midiStart/midiStop/midiCurrentPosition (MediaPlayer)
       ├─ setTitle callback: the host parses the title → writes xsys35_title.<pathHash> (imported on library load, §6.7)
       └─ Back key: single press = SDL back (engine semantics), double press within 2 seconds = exit confirmation (host)
```

### 3.3 Engine library packaging form (selected)

```
engine/
  xsystem35/                    ← vendored upstream sources (src/ modules/ po/ fonts/ licenses/ CMakeLists.txt)
    third_party/                ← dependency sources (SDL2 2.32.10 / freetype 2.14.3 / SDL2_mixer 2.8.0 / libwebp 1.5.0)
    android-host/               ← minimal build script (equivalent to upstream android/app/jni/CMakeLists.txt, see §5.4)
    BUILD.md                    ← reproducible build notes (NDK version, commands, artifact paths, patch notes, artifact SHA256)
    patches/                    ← minimal patches for the dependencies (SDL2 SONAME rename / SDL_android.c app32 prefix etc.)
engine/src/main/java/org/libsdl/app32/
  SDLActivity.java and the other 9 files  ← vendored SDL2 2.32.10 Java layer (package org.libsdl.app → org.libsdl.app32)
engine/src/main/jniLibs/arm64-v8a/
  libxsystem35.so               ← prebuilt and checked in (same pattern as librfvp.so / libsiglus.so)
  libSDL2x.so                   ← prebuilt and checked in (SONAME=libSDL2x.so, avoiding the ONS plugin conflict)
  libSDL2_mixer_xs35.so*        ← *checked in only when produced as a shared library; freetype / libwebp are hard dependencies
                                   but linked statically into libxsystem35.so by default (no standalone .so, §2.2) — this list
                                   is filled in from the §5.4 readelf measurements
engine/src/main/assets/
  MTLc3m.ttf  mincho.ttf        ← bundled fonts (xsystem35 default fonts; missing → SYSERROR)
```

- **Build time**: built once with the NDK (`ANDROID_STL=c++_static`, `ANDROID_APP_PLATFORM=android-26`) locally or outside CI; Gradle adds no native build (the engine module's CMake keeps only the bridge/utility libraries).
- **Checking prebuilt libraries in** matches the `librfvp.so`/`libsiglus.so` precedent; `FetchContent` is **not** needed (dependencies are vendored first and then built, avoiding a network dependency).
- Size: an estimated APK increase of 4–6 MB (arm64); acceptable.

### 3.4 SDL2 conflict analysis (key decision)

Current facts:

- The APK `jniLibs` already contains `libSDL3.so` (krkrsdl3) and **does not** contain `libSDL2.so`.
- The ONS plugin (nativeplugin zip) ships its own `libSDL2.so` (2.26.3, SONAME `libSDL2.so`), loaded at runtime by `NativeLibraryLoader` with an **absolute path** `System.load` from the plugin directory; the `DT_NEEDED` of `libonsyuri.so` contains `libSDL2.so`, which the dynamic linker resolves in the app library directory/already-loaded table.
- **If xsystem35's `libSDL2.so` (2.32.10) were placed directly into the APK**: an identical SONAME to the ONS plugin library creates resolution ambiguity → ONS crash risk. **Unacceptable.**
- **The existing `org.libsdl.app` (2.26.3) Java layer hard-checks the native version in `onCreate`**: after `loadLibraries()` it calls `nativeGetVersion()`, and if that is not equal to `"2.26.3"` it sets `mBrokenLibraries` → shows an "SDL Error" dialog → finish (`SDLActivity.java:943-964`, part of the onCreate flow, which a subclass cannot bypass). `nativeGetVersion()` comes from `libSDL2x.so` (2.32.10) and necessarily returns `"2.32.10"` ≠ `"2.26.3"` — so "reusing the 2.26.3 Java layer + 2.32.10 native" is not a risk item, it is a 100% certain launch failure.

Selected solution: **rename the conflicting library + vendor the 2.32.10 Java layer into a new package `org.libsdl.app32`**:

| Library | File name in the APK | SONAME | Loading method |
|---|---|---|---|
| xsystem35's SDL2 | `libSDL2x.so` | `libSDL2x.so` | `System.loadLibrary("SDL2x")` |
| ONS's SDL2 | exists only in the plugin directory | `libSDL2.so` | loaded by absolute plugin path (unchanged) |
| SDL2_mixer | `libSDL2_mixer_xs35.so` (if produced as a shared library) | renamed to the same name | resolved automatically via DT_NEEDED (upstream only loads SDL2 and the main library explicitly) |
| freetype / libwebp | no standalone .so (linked statically into `libxsystem35.so` by default; determined by the measured build artifacts, §2.2) | — | — |
| xsystem35 itself | `libxsystem35.so` | `libxsystem35.so` | `System.loadLibrary` |

- The runtime library rename is implemented through the minimal vendored SDL2 patch (`target_properties OUTPUT_NAME/SONAME = SDL2x`), without changing rendering/input source logic.
- **The Java layer does not reuse the existing 2.26.3 classes; instead the entire vendored SDL2 2.32.10 Java layer is repackaged as `org.libsdl.app32`** (coexisting with `org.libsdl.app`, mutually independent — the ONS host keeps using the 2.26.3 classes, whose version check passes naturally):
  - Java side: the 2.32.10 `android-project` Java sources (SDLActivity/SDL/SDLSurface/SDLAudioManager/SDLControllerManager/SDLInputConnection/HIDDeviceManager etc.) go into `engine/src/main/java/org/libsdl/app32/`, with the `package` declaration and internal cross-references changed from `org.libsdl.app` to `org.libsdl.app32`;
  - native side: patch SDL2 `src/core/android/SDL_android.c` — the JNI symbols are uniformly derived from the `#define SDL_JAVA_PREFIX org_libsdl_app` macro (a single macro change), and 4 additional hardcoded `"org/libsdl/app/..."` register_methods strings in `JNI_OnLoad` must be changed to `org/libsdl/app32/...`; verify the patch surface is exhaustive with `grep -rn 'org/libsdl/app' src/` (measured on 2.32.10: macro + 4 occurrences in JNI_OnLoad);
  - the app32 Java layer is version 2.32.10, the same as the native: `nativeGetVersion()` returns `"2.32.10"`, so the onCreate version hard check passes;
  - the original "phase one does not change the Java layer (reuse 2.26.3)" plan is **void**: the version hard check vetoes it (see current facts); even if the shared class's check were patched away, 2.28–2.32 native code may also call methods that do not exist in the 2.26.3 Java layer through `SDL_AndroidGetActivity` reflection, which is doubly unreliable and therefore not adopted.

### 3.5 Other key decisions

1. **The host extends the vendored `org.libsdl.app32.SDLActivity` (2.32.10)** (keeping the upstream main-loop model; the Java layer and the native are the same version, so the onCreate version hard check passes naturally, §3.4), with no Step-ABI rework; exit keeps the `killProcess` strategy (consistent with Artemis/KRKR).
2. **Scan detection adds new scoring inside EngineScanner** (§4.2), without conflicting with the existing RealLive/AVG32/UK2/Siglus decisions.
3. **Saves are mirrored as a whole directory** (zip export/import), without a file whitelist (`.asd` + `Volume.sav` + `*.asd.` backups all round-trip as a whole).
4. **Phase one already provides a "scoped saves" switch (default on)**: `-savedir` is a free path, defaulting to the app's external save directory (aligned with the ONS `scopedSaveDir=true` precedent), avoiding write failures and save loss on uninstall when `<game root>` lives on an SD card/`Android/data`; when off it falls back to `<game root>/save`.
5. **Do not port the upstream Launcher/GameStore/GameInstaller/CD image installation**: the game directory comes from TyranorNext's scanned authorized directories and is launched directly with `-gamedir`.
6. **Do not inject `.xsys35rc`**: expressible settings go through command-line arguments (`-savedir`/`-renderer`/`-integerscale`/`-mute_on_unfocus`/optional `-ttfont_gothic`), never writing into the user's game directory (§4.6, §6.6).
7. **Title write-back is done in phase one**: reusing the Siglus protocol (register uri/default title → host writes `xsys35_title.<pathHash>` → conditional import on library load); cheap and line-for-line isomorphic to the existing precedent.
8. **Do not enable libintl**: keep the upstream Android build behavior (built-in NLS); the engine's self-drawn dialog strings are covered by the engine-side string resources and this project's three-language conventions.
9. **Fonts are distributed with the package** (`MTLc3m.ttf`/`mincho.ttf` into assets); a custom font option is listed as P2.

---

## 4. App-side change list

### 4.1 Engine type and display

| File | Change |
|---|---|
| `core/engine/EngineType.kt` | Add `XSYS35("System35", "S3X")` (placed near `AVG32`) |
| `core/game/launch/EngineLauncher.kt` | Add `XSYS35` to `supportedEngines` (engine page display) |
| `ui/engine/EngineScreen.kt` | `engineTabOf` → GAL; new branch in `engineDescription`; add an `xsys35-2.20.0` entry to `builtinDialogEntries` (naming see §9 review point 2) |
| `ui/game/GameScreen.kt` | `EngineType.coverColor()` gets a new placeholder color (suggested deep red/purple) |
| `ui/home/HomeScreen.kt` | No change needed (displayName is shown automatically) |

### 4.2 Scan detection (`core/game/scan/EngineScanner.kt`)

Add signatures to the `detectEngine` decision chain (suggested after `FVP` and before the framebuffer group; the two signature sets do not conflict):

New collection variables (root level only, case-insensitive; **also tolerating the `<root>/GAMEDATA/` subdirectory form** — a common layout for games extracted from CD images, see §11.4-C1):

- `hasAldScript`: `*.ALD` with length ≥ 6 exists in the root or `GAMEDATA/` (`SA.ALD`, `GA.ALD`, ..., System3.x scene/graphics files);
- `hasXs35Support`: one of `System39.ain` / `System39.ini` / `*.wai` / `*.bgi` / `*.alk` exists in the root or `GAMEDATA/`;
- when the `GAMEDATA/` form is hit, `launchTarget` takes **the directory that actually contains `*.ALD`** (`<root>` or `<root>/GAMEDATA`):
  - upstream treats "the directory containing `*s?ald`" as the game directory (`GameInstaller` writes a `GAMEDATA` marker and `-gamedir` points at it, see §11.2), and the engine scans ALD from the CWD after `chdir`;
  - therefore `-gamedir` must pass that directory at launch — the App side may record it during the scan, or fall back at launch to the existing "launch file/entry directory" form (the same idea as KRKR's `pickKrActivateEntry`);
  - the ALD files and resources inside the `GAMEDATA` directory constitute the engine's complete working directory; the root-level `playlist.txt` is an exception (the BGM playlist is resolved by a CWD-relative path, so in the `GAMEDATA/` form `playlist.txt` should be placed **in the same directory as the ALD files** (i.e. the directory `-gamedir` actually points to), see §6.3).

Decision and scoring (`launchTarget = LAUNCH_TARGET_GAME_DIR`):

| Condition | Score |
|---|---|
| `hasAldScript` + `hasXs35Support` | 96 |
| `hasAldScript` alone (≥2 ALD files) | 90 |
| `hasAldScript` alone (1 file) | 80 |

False-positive prevention: `*.ALD` does not overlap with existing engine signatures (Siglus uses Gameexe/Scene.pck, RealLive/AVG32 use SEEN.TXT, UK2 uses .MES); unit tests must cover "does not break existing samples" and the "directory containing only ALD files without the S prefix (e.g. only `GA.ALD`)" sample — **the engine hard-requires a scene file `S*.ALD`** (`gameresource.c` only recognizes the 'S' prefix; no scene file → `sys35_usage(true)` and exit, `xsystem35.c:473-480`), so such directories would be misdetected by the scan signatures as a low-score XSYS35 but rejected by the engine, with the host's launch pre-check (§6.1) catching it as a fallback.

Add a unit test `EngineScannerXs35Test` (following `EngineScannerSiglusTest`): `SA.ALD`+`System39.ini` high score / multiple ALD medium score / single ALD low score / case variants / does not break Siglus/RealLive/AVG32/UK2/FVP samples.

### 4.3 Launch path (`core/game/launch/EngineLauncher.kt`)

- `supportedEngines` gains `EngineType.XSYS35`;
- `buildIntent` gets a new branch: `EngineType.XSYS35 -> buildXs35Intent(context, path, game, settings)`;
- new function (placed near `buildFvpIntent`):

```
PATH / GAME_PATH / PROJECT_ROOT / GAME_DIR = real path of the game root (following resolveGameDirectory; if the root has no *.ALD
                 but the GAMEDATA/ subdirectory does, use "the actual directory containing ALD" as -gamedir, see §4.2)
ROOT_URI, LAUNCH_TARGET, LAUNCH_MODE = LaunchContract.LAUNCH_MODE_XSYS35
XS35_SCOPED_SAVE_DIR = effective "scoped saves" boolean (default true)
XS35_SAVE_DIR   = **absolute path** of the effective save directory (scoped = getExternalFilesDir/save/<safeSaveName>; off = <game root>/save;
                  same source as GameSaveManager.resolveSaveLocation; the two sides must never derive it independently; the host passes it as -savedir)
XS35_RENDERER   = effective renderer backend (auto/opengl/software → pass -renderer only when not auto)
XS35_INTEGER_SCALE = effective boolean → -integerscale
XS35_MUTE_UNFOCUS  = effective boolean → -mute_on_unfocus
ORIENTATION     = injected explicitly inside buildXs35Intent (following krkrsdl3's default 6; note: the tail of buildIntent injects
                  only theme color extras uniformly; the existing Siglus/FVP/Framebuffer branches do not inject ORIENTATION, so this engine injects it itself)
Theme color extras are injected uniformly at the tail of buildIntent
```

- `ensureXs35SaveDir` before launch (aligned with `EngineLauncher.ensureKrSaveDir`): `mkdirs` + explicit failure when it exists but is not a directory (external storage unavailable for scoped saves → `LaunchResult.Failure`, no fallback to the game root);
- Precondition: `requestAllFilesAccessIfNeeded` (with scoped saves off, `-savedir <game root>/save` needs write permission; with them on, reading the game directory still goes through this branch, the same policy as ONS);
- On success: `recordRecentGame`; on failure: keep `LaunchResult.Failure` / `LaunchErrorMessages`.

### 4.4 Plugin validation branch

`XSYS35 -> null` is added to the `when (engine)` of `ensureForLaunch` in `core/engine/plugin/EnginePluginBootstrap.kt` (built-in, no native plugin dependency; omitting it fails the build).

### 4.5 Saves (`core/game/save/GameSaveManager.kt`)

New branch in `resolveSaveLocation` (same source as the launch side: the same `settings.xs35ScopedSaveDir` and the same directory function):

```
EngineType.XSYS35 -> scoped saves on (default): SaveLocation(File(File(getExternalFilesDir(null), "save"), GamePathUtils.safeSaveName(root)), text(R.string.save_location_engine_scoped, game.engine.displayName), true)
                     scoped saves off:        SaveLocation(File(root, "save"), text(R.string.save_location_engine_game_dir, game.engine.displayName), true)
```

- Isomorphic to the ONS branch (ONS: `getExternalFilesDir/save/<root.name>`, see `GameSaveManager.resolveSaveLocation`); directory names uniformly use `GamePathUtils.safeSaveName(root)`;
  - Known existing inconsistency (not changed, to avoid regression): the ONS engine side's `resolveScopedSaveDirectory` uses `guessName` (directory name), while the App side's `GameSaveManager` / `EngineLauncher.buildIntent` use `File(root).name` / `safeSaveName`; the two derivations coexist, and new XSYS35 code is allowed only one implementation (a single App-side function; the host only consumes `XS35_SAVE_DIR`) and must not replicate that split;
- External storage unavailable (`getExternalFilesDir` is null) → `SaveLocation(null, text(R.string.save_error_...), false)`, the same policy as ONS;
- The directory function should share a pure function with the host side (in `core/game/save` or `GamePathUtils`), guaranteeing that "launch writes" and "mirror reads" always use the same path;
- `listSaveFiles` / `exportToZip` / `importFromZip` are reused automatically;
- `cleanupAppData` gets no new branch (no app-private data);
- `excludeFor` / `restoresExcludedFromBackup` need no whitelist (everything inside the save directory is a save artifact, the same policy as FVP).

### 4.6 Engine settings

| Setting | Key | Value | Default |
|---|---|---|---|
| Scoped saves | `xsys35_scoped_save_dir` | bool | **`true`** (aligned with ONS `scopedSaveDir=true`; directory = `getExternalFilesDir/save/<safeSaveName>`) |
| Renderer backend | `xsys35_renderer` | `auto` / `opengl` / `software` | `auto` (does not pass `-renderer`; SDL auto-detects; opengl = GLES2 on Android) |
| Integer scaling | `xsys35_integer_scale` | bool | `false` (upstream default) |
| Mute on unfocus | `xsys35_mute_unfocus` | bool | `false` |
| (P2) Custom font | `xsys35_font` | absolute path of a private font | empty (bundled `MTLc3m`/`mincho`) |
| (Placeholder) Text encoding note | — | Phase one is fixed to Shift-JIS (native to System3.x) with no setting, only explained in the info card | — |

- The audio buffer (upstream profile `audio_buffer_size`) is **not exposed**: it only takes effect by writing `.xsys35rc`, which conflicts with the "do not inject an rc" decision (§3.5-6); listed as P2;
- If the renderer backend misbehaves on device, users can fall back to `software` (the SDL software renderer, the most compatibility-safe).

Change points (using FVP as the template):

| File | Change |
|---|---|
| `core/settings/EngineSettingsStore.kt` | Key constants, whitelist (renderer), get/set/normalize |
| `core/settings/EngineSettingsResolver.kt` + `ResolvedEngineSettings` | New `xs35*` fields and merging |
| `core/settings/EffectiveEngineSettings.kt` | Whitelist `resolveAllowed` / boolean `resolveBool` |
| `core/settings/PerGameSettingsStore.kt` | `F_XSYS35_*` |
| `core/game/storage/GameOverridePartitions.kt` | Key constants, added to `TYRANO_KEYS` (following the precedent, avoiding a Room migration) |
| `ui/settings/EngineSettingsText.kt` | `xsys35RendererOptions()` etc. |
| `ui/settings/EngineSettingsMenuActivity.kt` | `EngineSettingsKind.XSYS35` |
| `ui/settings/SettingsScreen.kt` | `Xs35SettingsCard` (scoped saves switch + renderer dropdown + integer scaling/mute on unfocus switches + info card) |
| `ui/settings/PerGameSettingsScreen.kt` | XSYS35 branch: four overrides (scoped saves/renderer/integer scaling/mute on unfocus) + info card (save directory showing the actual path per the switch, Shift-JIS note, uninstall cleanup note) |

### 4.7 Strings (strictly consistent across three languages)

- App side `app/src/main/res/values{,-en,-ja}/strings.xml`: `engine_desc_xsys35`, `engine_settings_xsys35_title`, `engine_settings_xsys35_renderer_title` / `_auto` / `_opengl` / `_software`, `engine_settings_xsys35_integer_scale_title`, `engine_settings_xsys35_mute_unfocus_title`, `engine_settings_xsys35_note` (encoding/save notes; scoped saves reuse `engine_settings_scoped_save_dir`) etc.;
- engine side `engine/src/main/res/values{,-en,-ja}/strings.xml`: `engine_xsys35_missing_game_dir`, `engine_xsys35_init_failed`, `engine_xsys35_back_again_to_exit`, `engine_xsys35_exit_game` etc.;
- After completion `python3 tools/check-hardcoded-ui-strings.py` must pass.

### 4.8 Other

- `core/game/storage/EngineDetectionRepository.kt`: XSYS35 goes to `else -> null` (no version detection cache);
- `ScanGame` / `GameEntity`: no new fields needed;
- `README.md`: add a System35 row to the engine support table; add `xsystem35-sdl2` (GPL-2.0-or-later) and the dependency licenses to the acknowledgements;
- `CONTEXT.md`: add `XSYS35` and the "built-in engine" list to the engine and runtime section.

---

## 5. engine-side change list

### 5.1 Java host: `engine/src/main/java/com/core/xsys35/`

| Class | Responsibility |
|---|---|
| `Xs35Activity.java/kotlin` | `extends org.libsdl.app32.SDLActivity` (vendored 2.32.10 Java layer, §3.4); overrides `getLibraries()` / `getArguments()`; implements the native callback methods; back key/immersive/loading overlay/multi-instance notice |
| `Xs35Prefs.java/kotlin` (optional) | Reads the Intent extras to build `-savedir`/`-renderer` etc. (may also be inlined in the Activity) |

Key behaviors (aligned with the upstream `GameActivity` and wired into this project's conventions):

1. `getLibraries()` returns `["SDL2x", "xsystem35"]` (aligned with the upstream `GameActivity`, only SDL2 and the main library are loaded explicitly; SDL2_mixer / freetype / libwebp are resolved automatically via DT_NEEDED — whether a standalone .so is produced depends on the build artifacts, and if mixer is a standalone library the §5.4 patch guarantees the rename. The last item is the main library, and `nativeRunMain` automatically assembles `libxsystem35.so` + `SDL_main`).

    > Note: `SDLActivity.getMainSharedObject()` takes the last item of `getLibraries()` and prepends `lib<name>.so`; `getMainFunction()` defaults to `"SDL_main"`; xsystem35's `main()` is adapted by SDL2's `SDL_main` macro, so the default value is fine.

2. `getArguments()`: `["-gamedir", gameRoot, "-savedir", saveDir]` + optional `-renderer <name>`; `-gamedir <directory>` must be the first argument pair (upstream has no argc validation and dereferences `argv[1]` unconditionally, so a first argument other than `-gamedir` runs in the wrong CWD, see §5.3).
3. `onCreate`: parse `LaunchContract` (`PATH → GAME_PATH → PROJECT_ROOT → GAME_DIR`, take the first non-empty; missing → Toast + finish); `SDLActivity.setWindowStyle(true)` (upstream SDL#8995 workaround).
4. Java callbacks (invoked by native reflection; method names/signatures must be exact):
   - `public String inputString(String msg, String oldVal, int maxLen)`: on the UI thread `AlertDialog + EditText`, blocking until a result (upstream implementation semantics, kept);
   - `public int inputNumber(String msg, int min, int max, int initial)`: `AlertDialog + NumberPicker`;
   - `public void midiStart(String path, boolean loop)` / `public void midiStop()` / `public int midiCurrentPosition()`: internal `MediaPlayer` (pause onStop, resume onResume, release + killProcess onDestroy);
   - Strings reuse the engine-side common strings (`engine_ok` / `engine_cancel` / `engine_prompt` etc.); no new hardcoded strings.
5. Lifecycle: `onPause/onResume` forward the MIDI state; `onDestroy` runs `midi.release()` → `killProcess` in that order (same as upstream).
6. Back key: override `onBackPressed()` in `Xs35Activity` — when the `SDL_ANDROID_TRAP_BACK_BUTTON` hint hits, return immediately (handing back to the SDL back engine semantics; the engine already sets it to 1 in `gfx_video.c:109-112`); otherwise go to `DoubleBackExit.handleBack` for double-press exit (the same policy as the local integration of the existing 2.26.3 SDLActivity, `SDLActivity.java:895-901`). The vendored app32 layer stays exactly as upstream; the double-press exit logic lives only in the host subclass, avoiding a second modification of the vendored sources (if measurements show 2.32.10 has moved to OnBackPressedDispatcher, implement the same semantics via callback registration).
7. `singleInstance` + `onNewIntent` Toast `engine_another_game_running` (aligned with other hosts).

### 5.2 Manifest / resources

```xml
<!-- System3.x (xsystem35) host: SDL2 main loop -->
<activity
    android:name="com.core.xsys35.Xs35Activity"
    android:exported="false"
    android:process=":xsys35"
    android:launchMode="singleInstance"
    android:taskAffinity="com.core.Xsys35"
    android:screenOrientation="sensorLandscape"
    android:theme="@style/Theme.Xsys35"
    android:windowSoftInputMode="adjustPan"
    android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenLayout|screenSize|smallestScreenSize|uiMode|density|fontScale|locale|layoutDirection" />
```

- `engine/src/main/res/values/styles.xml` adds `Theme.Xsys35` (no ActionBar + black background, referring to `Theme.FramebufferGames`/`Theme.Siglus`);
- `engine/consumer-rules.pro` adds `-keep class com.core.xsys35.** { *; }` and `-keep class org.libsdl.app32.** { *; }` (needed for JNI registration/reflection, alongside the existing `org.libsdl.app.**` entries);
- Font assets: `engine/src/main/assets/MTLc3m.ttf`, `mincho.ttf` (copied from the vendored `fonts/`; alternatively synchronized at build time by an engine-module Gradle task from `engine/xsystem35/fonts/`, avoiding duplicate maintenance — **the latter is recommended**, consistent with the "do not manually maintain the same binary" clause).

### 5.3 Contracts and constants (`engine/src/main/java/com/core/engine/LaunchContract.kt`)

```kotlin
// ---------- System35 (xsystem35) ----------
const val XS35_SAVE_DIR = "xs35_save_dir"            // absolute path of the effective save directory (resolved by the App per the "scoped saves" switch; the host must not derive it itself)
const val XS35_SCOPED_SAVE_DIR = "xs35_scoped_save_dir"  // scoped-saves boolean (for host logs/notices; the path is authoritative in XS35_SAVE_DIR)
const val XS35_RENDERER = "xs35_renderer"            // auto|opengl|software (auto does not pass -renderer)
const val XS35_INTEGER_SCALE = "xs35_integer_scale"  // bool → -integerscale
const val XS35_MUTE_UNFOCUS = "xs35_mute_unfocus"    // bool → -mute_on_unfocus
const val XS35_ORIGINAL_ROOT = "xs35_original_root"  // original game root (for title write-back registration; may differ from PATH in mirror/restore scenarios)

const val LAUNCH_MODE_XSYS35 = "internal.xsys35"
```

`EnginePrefs.kt` (title write-back protocol, isomorphic to Siglus):

```kotlin
const val KEY_XSYS35_TITLE_PREFIX = "xsys35_title."          // written by the host: the parsed game title
const val KEY_XSYS35_URI_PREFIX = "xsys35_uri."              // registered by the App before launch: game.uri
const val KEY_XSYS35_DEFAULT_TITLE_PREFIX = "xsys35_default_title."  // registered by the App before launch: directory name
```

> The upstream's actual constraints on `argv` (`xsystem35.c:463-467`, no argc validation, `argv[1]` **dereferenced unconditionally**): it only does `chdir(argv[2])` when `argv[1] == "-gamedir"` — with no arguments at all it segfaults outright, and when `argv[1]` is not `-gamedir` the chdir is skipped and it runs in the wrong CWD; `-savedir` goes through `savedir = argv[++i]` and is used verbatim (no realpath, see §6.5; only a missing value prints usage and exits); the other arguments (`-renderer`/`-integerscale`/`-mute_on_unfocus`) have no ordering constraints. The host's argument assembly must guarantee that `-gamedir <directory>` is the first argument pair.

### 5.4 Engine library prebuild (once / per upstream update)

```bash
# 0) Prepare: vendored sources (engine/xsystem35/ + third_party/)
# 1) Configure (NDK r28, can be aligned with the project ndkVersion 28.0.13004108)
cmake -B /tmp/xsys35-build -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-26 \
  -DANDROID_STL=c++_static -DCMAKE_BUILD_TYPE=Release \
  -S engine/xsystem35/android-host   # or the vendored standalone build script
# 2) Build + strip
cmake --build /tmp/xsys35-build -j
$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/*/bin/llvm-strip --strip-unneeded \
  /tmp/xsys35-build/**/libxsystem35.so /tmp/xsys35-build/**/libSDL2x.so ...
# 3) Check in
cp ... engine/src/main/jniLibs/arm64-v8a/
```

- The "android-host" above refers to a minimal build script added when vendoring (equivalent to upstream `android/app/jni/CMakeLists.txt`, with `SOURCE_DIR` pointing at the vendored directory, FetchContent skipped and output renaming); `BUILD.md` records the full commands and artifact SHA256.
- **Patch list** (`engine/xsystem35/patches/`):
  1. SDL2 native: `OUTPUT_NAME/SONAME = SDL2x` (to prevent a conflict with the ONS plugin's `libSDL2.so`);
  2. SDL2 native: app32-ize the JNI class name prefix — change `#define SDL_JAVA_PREFIX org_libsdl_app` in `src/core/android/SDL_android.c` to `org_libsdl_app32`, and change the 4 hardcoded `"org/libsdl/app/..."` register_methods strings in `JNI_OnLoad` to `org/libsdl/app32/...`; verify the patch surface is exhaustive with `grep -rn 'org/libsdl/app' src/` (measured on 2.32.10: macro + 4 occurrences in JNI_OnLoad);
  3. SDL2 Java layer: put the whole 2.32.10 `android-project` Java sources into `engine/src/main/java/org/libsdl/app32/` (package declaration and internal cross-references `org.libsdl.app` → `org.libsdl.app32`);
  4. SDL2_mixer: if produced as a shared library, add an `_xs35` suffix to the output name; freetype / libwebp are linked statically into `libxsystem35.so` by default (no standalone artifact, no patch needed), and if measurements show standalone .so files, add the suffix and check them in the same way.
- Artifact verification: `llvm-readelf -d` to confirm the SONAME/NEEDED chain (`libxsystem35.so → libSDL2x.so` (+ `libSDL2_mixer_xs35.so`, with freetype/libwebp depending on the form)), and **fill in the §3.3 jniLibs list from the measured artifacts** (freetype/libwebp are expected to have no standalone .so); also confirm the app32 Java layer and the native `nativeGetVersion()` are both 2.32.10 (the onCreate version hard check passes, §3.4).

### 5.5 Licensing and attribution

- The vendored directory keeps the upstream `COPYING` (GPL-2.0) and each dependency's LICENSE (zlib/FTL/BSD-3);
- README gains a "built-in engine licenses" section: xsystem35-sdl2 (GPL-2.0-or-later, source link), SDL2/SDL2_mixer (zlib), freetype (FTL/GPLv2), libwebp (BSD-3);
- If a future requirement says "the main repository must not carry GPL sources", this can move to a nativeplugin zip downloaded on demand (see the §3.1 alternative); this plan does not enable it.

---

## 6. Key interaction details (items pending on-device verification are marked ⚠)

### 6.1 Launch and exit

- `argv[1]` must be `-gamedir <directory>` as a pair (upstream has no argc validation and dereferences `argv[1]` unconditionally: no arguments at all → segfault; `argv[1]` not `-gamedir` → chdir skipped and it runs in the wrong CWD); if the directory has no scene file `S*.ALD` after `chdir` → `sys35_usage(true)` prints usage and exits (`xsystem35.c:473-480`) → which manifests as the SDL thread exiting and the Activity showing a white screen. **The host needs a fallback**: before launch, check that the target directory contains a **scene file `S*.ALD`** (not just any `*.ALD`, aligned with the engine's hard requirement, §4.2), and if not, Toast `engine_xsys35_init_failed` and finish.
- Exit: `main()` returns normally → `nativeRunMain` returns → the default SDLActivity behavior is finish (the host `onDestroy` must catch it with `killProcess`, consistent with upstream). The Java layer and the native are the same version 2.32.10 (§3.4), so the former risk item "verify the main-thread behavior differences between the 2.26 Java layer and 2.32 native" is eliminated by the app32 approach.

### 6.2 Input

- Touch/mouse: handled natively by SDL (on device it is a touch→mouse mapping; right-click mapping is built into SDL and needs measurement ⚠);
- Hardware keyboard/gamepad: SDL's native keymap (System3.x uses the arrow keys/Enter/Esc/mouse); the host does not intercept (except the back key);
- Native input dialogs: `EditText/NumberPicker` go through androidx compat; check compatibility with `Theme.Xsys35` (NoActionBar) ⚠.

### 6.3 Audio

- BGM (virtual CD): `playlist.txt` is resolved relative to the engine CWD (= the `-gamedir` directory) — in the normal form that is the game root, while in the `GAMEDATA/` form it lives inside `GAMEDATA/` (consistent with §4.2); saves in `save/*.asd` are separate;
- MIDI: Java MediaPlayer via `midi.android.c`; `SDL_AndroidGetInternalStoragePath()/tmp.mid` must be writable (app-private directory, writable by nature);
- Backgrounding: upstream `MediaPlayer` pauses in `onStop` and resumes in `onResume`; SDL audio thread behavior follows SDL defaults (`SDL_ANDROID_BLOCK_ON_PAUSE` semantics) ⚠.

### 6.4 Fonts

- The default fonts must exist in assets (otherwise `SYSERROR("Cannot open font ...")` terminates);
- Custom fonts: `.xsys35rc`'s `ttfont_gothic`/`ttfont_mincho` are resolved relative to the CWD (= game directory); phase one provides no host-level font setting (P2 can follow the `FontSettings` precedent);
- Fan-translation compatibility: System3.x text is Shift-JIS, and fan translations mostly use patch-style font/text replacement; phase one only guarantees default font rendering ⚠.

### 6.5 Saves (scoped saves are done in phase one)

- Paths (absolute; the host does not emit relative paths — upstream uses `savedir = argv[++i]` verbatim, and `fc_init` runs `mkdir_p` on a relative name before joining, so relative values land unpredictably after `chdir`):
  - scoped saves on (default): `getExternalFilesDir(null)/save/<safeSaveName>`;
  - off: `<game root>/save` (in the `GAMEDATA/` form = `save/` inside the directory `-gamedir` actually points to, consistent with the §4.2 launchTarget policy);
- File forms: `<scene basename>s[a-z].asd` (e.g. `SAsa.asd`), `Volume.sav`, `*.asd.` backups; mirroring exports/imports the directory as a whole;
- Save compatibility with PC xsystem35 (same format, default `system39` saveformat) — users can copy files manually;
- The directory is pre-created by `ensureXs35SaveDir` on the launch side (`fc_init` has a `mkdir_p` fallback, but pre-creating allows typed failures on permission problems first); the mirror read side goes through the same directory function (§4.5).

### 6.6 Engine settings injection (command-line arguments, never writing the user directory)

Upstream profile lookup order (`src/profile.c:134-147`): `$HOME/.xsys35rc` → relative-path `.xsys35rc` (i.e. the CWD; `-gamedir` becomes the CWD via `chdir` and is hit by the second lookup. Android app processes usually have no `HOME`, and even if it is set, the rc must exist at exactly that path to take effect, so the risk is extremely low). **`.xsys35rc` is not injected** (to avoid writing to/restoring the user's game directory). Phase-one mapping:

| Setting | How it takes effect | Upstream basis |
|---|---|---|
| Scoped saves | `-savedir <absolute path>` | `savedir = argv[++i]` (used verbatim) |
| Renderer backend | `-renderer <name>` (when not auto) | `SET sys35_ParseOption` → `SDL_SetHint(SDL_HINT_RENDER_DRIVER)` |
| Integer scaling | `-integerscale` | `integer_scaling` → `gfx_setIntegerScaling(true)` |
| Mute on unfocus | `-mute_on_unfocus` | `volume_set_mute_on_unfocus(true)` |
| CD playlist | not passed (the engine resolves `playlist.txt` relative to the CWD: normal form = game root; GAMEDATA/ form = inside GAMEDATA/, see §6.3) | `DEFAULT_PLAYLIST_PATH` / `muscd_set_playlist` |
| Custom font (P2) | `-ttfont_gothic <absolute path>` (reusing FVP `FontImport`: copy into `filesDir/fonts`) | `fontname_tt[FONT_GOTHIC] = argv[i+1]` |
| Audio buffer (P2) | not exposed (profile-only) | `audio_buffer_size` only has the `get_profile` path |

> Needs on-device verification ⚠: the value semantics of `-renderer opengl|software` on SDL2 Android (opengl = GLES2; software is always available).

### 6.7 Title write-back (reusing the Siglus protocol)

- Upstream title chain: `gfx_setWindowTitle` → `SDL_SetWindowTitle` → SDL2 Java layer `setActivityTitle(String)` → `sendCommand(COMMAND_CHANGE_TITLE)` → `((Activity) context).setTitle(...)` (the same chain exists in the existing 2.26.3 layer, `SDLActivity.java:119`; the vendored app32 layer uses the same mechanism, so overriding `Activity.setTitle` in the host captures it in either case);
- The host overrides `Activity.setTitle(CharSequence)` in `Xs35Activity`: take the segment after the colon (the upstream format is `"XSystem35 Version 2.20.0:<game title>"`, using the same parsing as the upstream `GameActivity.setTitle`); write `xsys35_title.<pathHash>` as soon as a non-empty title is obtained the first time (with the same pathHash algorithm as siglus), without rewriting it;
- Before launch the App registers `xsys35_uri.<hash>` / `xsys35_default_title.<hash>` (reusing the registration style of `buildSiglusIntent`);
- Import: add `Xs35TitleFeedback`, called in parallel at the existing `SiglusTitleFeedback.import(appContext)` call site in `MainLibraryViewModel`; the import rules are exactly the same (overwrite only when the title still equals the registered directory name).

---

## 7. Testing and acceptance

### 7.1 Unit tests

| Case | Content |
|---|---|
| `EngineScannerXs35Test` | ALD ± auxiliary signatures, count tiers, case, not mutually exclusive with existing engine samples |
| `EffectiveEngineSettingsTest` (extended) | XSYS35 renderer whitelist fallback, boolean override merging |
| `GameOverridePartitionsTest` (extended) | XSYS35 keys survive the tyrano partition round trip |
| `LaunchContractXs35Test` (optional) | New constant snapshot |

### 7.2 On-device acceptance (recommended: the Japanese original of "Rance IV" or "Toushin Toshi")

1. Scanned and detected as System35 (the directory contains `SA.ALD` etc.);
2. Launch into the title screen → touch to advance → save (in-engine menu) → load;
3. Scoped saves on: `getExternalFilesDir/save/<name>/SAsa.asd` is written; off: `<game root>/save/` is written; after killing the process and re-entering, both paths can be read;
4. Export a zip from each of the two save locations → clear saves → import → loading is consistent;
5. CD audio: place `playlist.txt` + mp3 → BGM plays; no crash without a playlist;
6. Renderer backend switching (auto/opengl/software) and integer scaling take effect;
7. Title write-back: after the first launch the library title changes from the directory name to the game title; a user rename is not overwritten;
8. Single/double back-press behavior, audio restoration after backgrounding/returning to the foreground;
9. Coexistence regression with the ONS plugin: **launch an ONS game first → exit → launch a System35 game**, both work normally (the key SDL2 conflict regression); the reverse order likewise;
10. Version gate (app32 regression): launching any System35 game must not show an "SDL C/Java version mismatch" dialog (regression for the app32 Java layer being the same version as the native + the effectiveness of the `SDL_android.c` prefix patch);
11. Permissions: when all-files access is not granted, show a notice instead of crashing (key regression for the scoped-saves-off scenario).

### 7.3 Rollback

- Removing the `EngineType.XSYS35` related branches + deleting the jniLibs/assets artifacts returns to the pre-integration state;
- No data migration risk (saves live in the game root; leftover setting keys are harmless).

---

## 8. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| ~~SDL2 Java layer and native version mismatch~~ (already eliminated by the design: the existing `org.libsdl.app` (2.26.3) onCreate version hard check necessarily conflicts with the 2.32.10 native, §3.4 current facts) | Immediate "SDL C/Java version mismatch" dialog and exit at launch | Eliminated: the vendored 2.32.10 Java layer in the new package `org.libsdl.app32` matches the native version; the patch surface has been measured and narrowed (SDL_JAVA_PREFIX macro + 4 JNI_OnLoad strings); the existing `org.libsdl.app` is used only by ONS and is unaffected |
| `getMainSharedObject`/`SDL_main` convention mismatch | Cannot enter the native main | The host overrides `getMainSharedObject()` to return the absolute path of `libxsystem35.so` explicitly (minimal fallback); verify the default convention first during implementation |
| `chdir` + assets font relative path semantics | Font not found → SYSERROR | Put the fonts in the assets root; verify on device (§6.4); if necessary, copy the fonts into the game directory before launch in the host (not recommended) |
| profile (.xsys35rc) not injected | Settings that depend on the profile (audio buffer) cannot take effect | Phase one offers only the command-line subset (§6.6); reassess in P2 |
| GPL-2.0-or-later source compliance | Distribution requirement | Keep the license, declare the source link in the README; if it tightens in the future, move to a modular download (§3.1) |
| APK size +4–6 MB | Larger install package | strip; confirm arm64 only; freetype/libwebp are already statically linked into the main library by default (§2.2), and if necessary SDL2_mixer can also be linked statically to reduce the file count (no size reduction) |
| Upstream API evolution | Rebuild requires regression | Pin the vendored baseline commit, recorded in `BUILD.md`; re-run the §7 acceptance when following upstream |
| ALD signature false positives (other engine directories containing `*.ALD`) | Misdetection | Tiered thresholds + unit-test regression for not breaking existing samples |
| Scoped saves differ from the PC save location | Users cannot find their old saves | The info card shows the actual effective directory; turning the switch off returns to the game root's `save/`; P2 provides a migration action |

Open questions (to be decided during review):

1. ~~Whether scoped saves are done in phase one~~ → **Decided: done in phase one, default on** (§3.5-4, §4.5, §6.5);
2. ~~Version entry naming~~ → **Decided: `xsys35-2.20.0`** (§9 review point 2);
3. ~~Renderer backend default~~ → **Decided: `auto`** (§9 review point 3);
4. ~~Whether title write-back is P2~~ → **Decided: done in phase one** (§3.5-7, §6.7), with the host writing prefs + reusing the Siglus import protocol.

## 9. Review-point research findings (2026-10-12)

### 9.1 Scoped saves: done in phase one, default on

| Evidence | Location |
|---|---|
| ONS precedent: `scopedSaveDir` defaults to **true**, directory = `getExternalFilesDir/save/<name>` (engine side `OnsSettings.resolveScopedSaveDirectory` / App side `GameSaveManager.resolveSaveLocation`) | `OnsSettings.kt:16,53-57`, `GameSaveManager.kt:83-91` |
| Older engines (Siglus/RealLive/AVG32/UK2/FVP) all use a fixed game-root directory in phase one — that is legacy baggage, not a recommended template | `GameSaveManager.kt:118-149` |
| `-savedir` is a free path (`savedir = argv[++i]`, no realpath/no validation) → any directory can be supported with zero engine-side changes | upstream `xsystem35.c:209-215` |
| Upstream `fc_init` has a `mkdir_p` fallback for savedir, but pre-creating in the host allows typed failures on permission problems | upstream `filecheck.c:110-113` |

Conclusion: scoped by default (`getExternalFilesDir/save/<GamePathUtils.safeSaveName(root)>`: the directory base form follows the ONS precedent, the directory name derivation follows KRKR's `safeSaveName` — the ONS App side currently uses `File(root).name`, while XSYS35 deliberately picks the more robust single `safeSaveName` implementation instead of replicating the ONS two-derivation split, see §4.5; the same base directory as KRKR SDL3), falling back to the game root when off. Benefits: saves are not lost on read-only SD card/`Android/data` scenarios, and saves can be migrated across uninstall/reinstall (the user is informed via the settings info card); risks: the save location is not interchangeable with the PC version (there is a switch and a note), and uninstall wipes it (noted in the info card).

### 9.2 Version entry: `xsys35-2.20.0`

Existing entry styles: `siglus-rs` / `game-launcher` / `rfvp` (upstream codenames), `tyranor-builtin` / `Kirikiroid2-1.3.9` / `tyranornext-01-02` (version numbers). xsystem35 has a clear upstream release number (survey baseline `XSYSTEM35_VERSION="2.20.0"`, maintained in `CHANGELOG.md`; a single source in the upstream `CMakeLists.txt`) and no codename, so "engine short name-version number" is used — the same shape as ONS's `ONScripter-0.7.7`; each time the vendored baseline is updated, that entry and `BUILD.md` are updated together.

### 9.3 Renderer backend: default `auto`, three-option dropdown

Upstream has only one entry point, `SDL_SetHint(SDL_HINT_RENDER_DRIVER, name)` (`gfx_video.c:90-92`), with SDL auto-detecting (opengl = GLES2 on Android, software = the SDL software renderer). `software` is a genuinely usable fallback (the SDL renderer is itself a software implementation and is commonly used on Android for GLES compatibility issues), so three options are exposed: auto / OpenGL / software rendering; default auto, with no argument passed.

### 9.4 Title write-back: done in phase one, reusing the Siglus protocol

- The native → Activity title chain exists in the SDL2 Java layer in both the existing 2.26.3 and the vendored app32 2.32.10 (`SDLActivity.java:119`), so overriding `Activity.setTitle` in the host captures it;
- The upstream title format is `"XSystem35 Version <ver>:<game title>"` (colon-separated; the upstream `GameActivity` uses the same parsing to write `title.txt`); parse and take the segment after the colon;
- Reuse the Siglus three-key protocol and import semantics (register uri/default title → host writes the title → conditional import on library load), adding `Xs35TitleFeedback` to run in parallel at the existing import call site in `MainLibraryViewModel`;
- Compatibility: it does not write the user game's `title.txt` (an upstream library-management file that TyranorNext has no use for).

---

## 10. Milestones (suggested implementation order)

| Stage | Content | Dependency | Estimate |
|---|---|---|---|
| M0 | Vendored sources (SDL2 2.32.10 including the android-project Java layer) + dependency patches (SDL2x rename + `SDL_android.c` app32 prefix) + app32 Java layer into `engine/src/main/java/org/libsdl/app32/` + prebuilt `.so` checked in (list filled in from the readelf measurements) + BUILD.md | none | 1.5–2 days |
| M1 | engine: host `Xs35Activity` (extends app32 SDLActivity) + Manifest/Theme/consumer-rules (including the `org.libsdl.app32.**` keep) + font assets sync + contract constants | M0 | 1 day |
| M2 | app: EngineType/scan/launch/save/plugin branch + strings | M1 | 1 day |
| M3 | Settings chain (scoped saves/renderer/integer scaling/mute on unfocus: Store/Resolver/UI/per-game override + title write-back import) | M2 | 0.5–1 day |
| M4 | On-device acceptance (§7.2, including ONS coexistence regression, both save paths, title write-back) | M3 | 1 day |
| M5 | README/CONTEXT/license updates + unit tests/three languages/build regression | M4 | 0.5 day |
| Phase two | Custom fonts (reusing FVP FontImport + `-ttfont_gothic`), audio buffer (rc), CD image unpacking (the C2 plan in §11), save location migration wizard | M5 | To be scheduled |

---

## 11. Appendix: CD image installation (feature description and trade-offs)

> This section answers "what CD image installation is, how upstream does it, and whether TyranorNext should do it"; see §11.4 for the conclusion.

### 11.1 What it is

AliceSoft System 3.x era games were **released on CD-ROM**, and the disc content has two parts:

| Part | Form | Notes |
|---|---|---|
| Data track | ISO 9660 file system, game data in the `GAMEDATA/` directory (`SA.ALD` etc.) | Readable like files in an optical drive |
| Audio track | **CD-DA** (Red Book audio, not a file on the disc) | This is the BGM; physically it cannot be copied by a file manager, only read as a whole disc or extracted per track |

So what players have today is a **disc image** (.iso / .bin+.cue / .img+.cue / .ccd / .mdf+.mds), not a ready-made game folder. The upstream feature is exactly to turn the image **directly into a playable game directory on the phone**, in one step and without a PC:

1. Parse the ISO 9660 file system inside the image and extract all files of `GAMEDATA/`;
2. Identify the scene files inside (`*s?ald` regex, e.g. `SAsa.ald`);
3. Read the image's **audio tracks** and export them one by one as `cdda/trackNN.wav` (44100Hz/16bit/stereo, prepending a WAV header);
4. Generate `playlist.txt` (one `cdda/trackNN.wav` per line); xsystem35 plays them in order as BGM at launch (virtual optical drive).

### 11.2 Upstream implementation (about 740 lines of Kotlin, independent of the engine's C code)

| Component | File | Responsibility |
|---|---|---|
| Image parsing | `CdImageReader.kt` (566 lines) | Supports single-file `.iso`; `.bin`/`.img` + `.cue`/`.ccd`; `.mdf` + `.mds` (paired by basename, multi-select with a long press). CUE supports `MODE1/2048`, `MODE1/2352`, `AUDIO`; CCD/MDS support 2352-byte sectors and track offsets; **MDS ≥4GB is unsupported** (32-bit offsets); random access = `openFileDescriptor` + positioned `FileChannel` reads; when SAF returns a pipe, the whole disc is copied to a cache temp file (deleted when done) |
| ISO 9660 | `Iso9660FileSystem.kt` (175 lines) | Primary/`Joliet` volume descriptors (Joliet → UTF-16 names, otherwise Shift-JIS); recursive traversal by directory records; locates `GAMEDATA` under the root (case-insensitive) |
| Installation orchestration | `GameInstaller.kt` (282 lines) | `extractCdImage`: progress callback per file; if `GAMEDATA` or the ALD files are not found → fail and **delete the partial directory**; writes the `GAMEDATA` marker + audio tracks + `playlist.txt` |

### 11.3 TyranorNext's adaptation issues

| Point | Upstream | TyranorNext |
|---|---|---|
| "Install" concept | yes (own game library, installed into a private directory) | **none**: scan authorized directories → library entries → launch; there is no precedent for installing/copying game content |
| Output destination | app-private directory | a user SAF directory is required (the same mode as the "archive unpacking" tool); SAF writing is available; the `GAMEDATA` marker means nothing to TyranorNext (the game directory is given by the launch argument) |
| Engine requirement | consumes the `GAMEDATA/` directory | **requires a real path** (`chdir` + ALD go through POSIX file access; `safar://` content URIs do not work) → the output must be a real directory |
| Temp files | `getExternalCacheDir` staging | same (when `openFileDescriptor` fails the whole disc is copied; `cacheDir` needs space equal to the image size) |
| Capacity | one copy of the image and one of the output (zero-copy reads of the original image; output ≈ image) | same; the UI must warn about space |

### 11.4 Trade-offs

| Solution | Content | Cost |
|---|---|---|
| C1 (phase one) | **No image unpacking**; only tolerate the `GAMEDATA` subdirectory in the scan (`<root>/GAMEDATA/SA.ALD` is also detected as System35); users extract on a PC/other tools and then import | about 10 lines of scan branch + unit tests |
| C2 (pre-scheduled for phase two) | Standalone tool (the same mode as the "archive unpacking" page): pick image + metadata file + output directory → unpack into the chosen directory (SAF writes), with progress/cancel/partial cleanup | port/rewrite about 1500–2500 lines + unit tests; on-device acceptance (image purchase, 4GB limit, pipe URI fallback) |

**Conclusion**: phase one takes C1 (no "install" concept introduced, M0–M5 not blocked); C2 is a standalone tool to be scoped in phase two; if the user base mostly has "only disc images on hand", C2 can be brought forward.

---

## Appendix A: Upstream key file index (for surveying)

| Topic | File |
|---|---|
| Android build | `android/app/build.gradle`, `android/app/jni/CMakeLists.txt`, `android/app/jni/Application.mk` |
| Host | `android/app/src/main/java/io/github/kichikuou/xsystem35/GameActivity.kt`, `LauncherActivity.kt`, `GameStore.kt`, `GameInstaller.kt` |
| SDL2 Java layer | `android/app/src/main/java/org/libsdl/app/*.java` (2.32.10) |
| SDL2 JNI bridge (SDL_JAVA_PREFIX macro / JNI_OnLoad registration) | SDL2 2.32.10 `src/core/android/SDL_android.c` (inside the vendored `third_party/SDL2`) |
| Entry point/arguments | `src/xsystem35.c` (main, ParseOption, check_profile) |
| Engine resource detection | `src/gameresource.c` (ALD scanning, save name generation) |
| Fonts | `src/font.c` (open_face Android assets branch), `fonts/`, `config.h.in` |
| MIDI/input bridge | `src/midi.android.c`, `src/input_modal.c` |
| Audio | `src/music_cdrom.c`, `src/cdrom.mp3.c`, `src/pcm.sdlmixer.c`, `src/bgm.sdlmixer.c` |
| Build options | root `CMakeLists.txt` (ANDROID branch), `xsys35rc.sample` |

## Appendix B: Existing project facts found in this survey (basis for the changes)

| Fact | Location |
|---|---|
| The APK `jniLibs` already has `libSDL3.so` and no `libSDL2.so` | `engine/src/main/jniLibs/arm64-v8a/` |
| The ONS plugin ships its own `libSDL2.so` (SONAME `libSDL2.so`), and `libonsyuri.so`'s DT_NEEDED references it | `engine/src/main/nativeplugins/ons/arm64-v8a/` (measured with readelf) |
| The existing SDL2 Java layer is `org.libsdl.app` (2.26.3 baseline, with `loadLibraries()`/`getMainSharedObject()`/`setWindowStyle`) | `engine/src/main/java/org/libsdl/app/SDLActivity.java` |
| The ONS host extends the same `SDLActivity`, with libraries loaded by absolute plugin path | `engine/src/main/java/com/yuri/onscripter/ONScripter.java` |
| Precedent for checking in prebuilt `.so` files | `librfvp.so`, `libsiglus.so`, `libarchive_xp3_core.so` |
| Precedent for distributing font assets (ONS copies `DroidSansFallback.ttf` into a private directory) | `engine/src/main/java/com/core/ons/OnsLibLoader.kt` |
| Integration points for engine page groups/version dialogs/settings cards | `ui/engine/EngineScreen.kt`, `ui/settings/SettingsScreen.kt`, `EngineSettingsMenuActivity.kt` |
| The existing `org.libsdl.app` (2.26.3) Java layer **hard-checks** `nativeGetVersion()` in `onCreate` (≠"2.26.3" pops "SDL C/Java version mismatch" and exits; it is part of the onCreate flow and a subclass cannot bypass it) — mixing it with the 2.32.10 native necessarily fails | `engine/src/main/java/org/libsdl/app/SDLActivity.java:943-964` |
| The existing SDLActivity already integrates `DoubleBackExit.handleBack` locally (trap-back hint hit → hand to SDL, otherwise double-press exit) — the app32 layer's double-press exit implements the same policy in the host subclass | `engine/src/main/java/org/libsdl/app/SDLActivity.java:895-901` |

## Appendix C: New string keys (three languages, examples)

| Key | zh | ja | en |
|---|---|---|---|
| `engine_desc_xsys35` | System3.x(xsystem35) | System3.x(xsystem35) | System3.x (xsystem35) |
| `engine_settings_xsys35_title` | System35 | System35 | System35 |
| `engine_settings_xsys35_renderer_title` | 渲染后端 | レンダラー | Renderer |
| `engine_settings_xsys35_renderer_auto` | 自动 | 自動 | Auto |
| `engine_settings_xsys35_renderer_opengl` | OpenGL | OpenGL | OpenGL |
| `engine_settings_xsys35_renderer_software` | 软件渲染 | ソフトウェア | Software |
| `engine_settings_xsys35_integer_scale_title` | 整数倍缩放 | 整数倍スケーリング | Integer scaling |
| `engine_settings_xsys35_mute_unfocus_title` | 切后台静音 | 非フォーカス時にミュート | Mute when unfocused |
| `engine_settings_xsys35_note` | 文本为 Shift-JIS;独立存档开启时存档位于应用存档目录,关闭时位于游戏目录 save/ | テキストは Shift-JIS。独立セーブ有効時はアプリのセーブフォルダ、無効時はゲームフォルダの save/ | Text is Shift-JIS; saves live in the app save dir when scoped saves are on, otherwise in the game's save/ |

> The engine-side host Toast strings (`engine_xsys35_missing_game_dir` etc.) are synchronized across the three `engine/src/main/res/values{,-en,-ja}/strings.xml` files; the actual wording follows the project's three-language proofreading conventions, and after adding them `python3 tools/check-hardcoded-ui-strings.py` must pass.

---

## 12. Implementation record (2026-10-13)

Phase-one implementation versus the plan, and review corrections, are as follows (everything else landed per the plan):

1. **The patch surface has one more file than §3.4**: `third_party/SDL2/src/hidapi/android/hid.cpp`'s `SDL_JAVA_PREFIX` must also be app32-ized (otherwise `HIDDeviceManager`'s JNI symbols remain `Java_org_libsdl_app_*`, and the app32 Java layer fails immediately at startup with `UnsatisfiedLinkError`); the complete rename surface is **2 macros + 4 JNI_OnLoad strings**, and the patch-surface verification command is updated to `grep -rn 'org_libsdl_app\|org/libsdl/app' third_party/SDL2/src/` over the whole `src/`.
2. **libwebp is stopped from producing a standalone .so with a directory-scoped `BUILD_SHARED_LIBS OFF` before the build**: SDL2_mixer's `option(BUILD_SHARED_LIBS ... ON)` sets that cache variable ON, and libwebp's library target follows it; without handling it, extra `libwebp.so` / `libsharpyuv.so` appear (`WEBP_LINK_STATIC` only affects tool linking). The output stays at 3 .so files; the handling site is in `engine/xsystem35/android-host/CMakeLists.txt`.
3. **The scan decision block moved from "after FVP, before the framebuffer group" to "after CS2, before ARTEMIS"**: in the original position, a directory with "existing engine signatures + stray `*.ALD` files" would be grabbed by the low-score XSYS35 tier (regression review M1), and after the host pre-check rejected it the original game could not be launched; moving it later removes the grab, XSYS35's real directories contain no existing engine signatures, and recall is unaffected (with a matching "existing engine + ALD" regression case added).
4. **The title write-back hash changed to an explicit extra `XS35_PATH_HASH`** (replacing the original self-derivation from `XS35_ORIGINAL_ROOT`), aligned with the Siglus precedent; the import side reads with `MODE_MULTI_PROCESS` and re-runs the import on foreground resume, mitigating the cross-process prefs cache limitation (the risk of a cross-process whole-file overwrite remains a known limitation).
5. **`cleanupAppData` gains an XSYS35 branch** (the original §4.5 judgment of "no app-private data" was wrong — the default scoped saves live in app external storage); the default directory name uniformly uses `Xs35Paths.scopedSaveDir`.
6. **Host back-key behavior corrected**: upstream SDL 2.32.10 forwards and consumes the back key in `dispatchKeyEvent`, and the actual in-game behavior is the engine's self-drawn exit menu (AC_BACK); the host's `onBackPressed` override only covers the fallback path when called directly by the system (e.g. early startup), and "double-press to exit" is not the primary exit method in this engine.
7. **Vendored trimming and size registration**: non-Android-platform/test directories were deleted (list, reference checks and the from-scratch post-trim rebuild verification are in `engine/xsystem35/BUILD.md` §2.1); the measured APK increase is about +8.1MB (3 .so files 3.37MB + two uncompressed fonts 6.7MB), and `noCompress ttf/otf` also makes the existing `DroidSansFallback.ttf` Stored (release estimated +13–14MB, exceeding the 4–6MB estimate in §3.3); accepted as a hard-requirement trade-off for xsystem35's font reading performance.
8. **Host landscape enforcement**: xsystem35's resizable window + the unset `SDL_HINT_ORIENTATIONS` makes upstream SDL request FULL_USER (subject to the system rotation lock; with the lock set to portrait the game is letterboxed in portrait); `Xs35Activity` overrides `setOrientationBis` to always request sensorLandscape (re-verified on device: landscape under both the locked-portrait and auto-rotate states).
9. **Runtime system dialogs unified into the engine-level `KrDialogStyle`** (shared by KRKR/Artemis): override app32's `messageboxCreateAndShow` (engine error/notice message boxes) and switch `inputString`/`inputNumber` to the unified style; `KrDialogStyle` gains a `showNumberBox` numeric input entry (an addition).
10. **The engine and dependency sources are not vendored into the main repository**: the source is the fork `Weiss-UltimateSavior/xsystem35-sdl2` (pinned commit `18af9be`), and dependencies are downloaded by `scripts/build-xsys35.sh` by SHA1 into a build directory outside the repository; the main repository keeps the prebuilt .so files, the `android-host` build script, patches, the app32 generation script and BUILD.md; the bundled fonts (MTLc3m/mincho) are now committed directly to `engine/src/main/assets/`; the original vendored directory (about 65MB) has been deleted.