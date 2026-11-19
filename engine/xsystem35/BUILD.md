# xsystem35 (System 3.x) built-in engine — pre-built artifacts and build recipe

This directory holds the pre-build recipe and provenance material for the **System35 (xsystem35-sdl2)** engine
bundled into Tyranor Next (an M0-stage deliverable). See
`docs/system35-xsystem35-engine-integration-plan.md` for the plan.

- The engine runtime libraries (`libxsystem35.so` etc.) are **pre-built and committed** to
  `engine/src/main/jniLibs/arm64-v8a/`, following the same pattern as `librfvp.so` / `libsiglus.so`;
  Gradle does not participate in the native build.
- **xsystem35 and its dependency sources are not distributed with the main repository**: the source comes from the
  fork `Weiss-UltimateSavior/xsystem35-sdl2` (pinned commit), and dependencies are downloaded by
  `scripts/build-xsys35.sh` per SHA1 into a build directory **outside the repository** (default
  `${TMPDIR:-/tmp}/xsys35-build`, overridable with `--build-dir`).
- The main repository keeps only: the pre-built `.so` files, the build recipe (`android-host/`), `patches/`, the app32
  generation script (`scripts/`), the font and codec license texts (`licenses/`), the bundled font assets
  (`engine/src/main/assets/`) and this document.

Main repository directory layout:

```
engine/xsystem35/
├── android-host/CMakeLists.txt  ← this project's Android build recipe (equivalent to upstream android/app/jni/CMakeLists.txt)
├── patches/                     ← minimal patches against the SDL2 dependency (replayed in order on clean sources at build time)
├── scripts/build-xsys35.sh      ← one-command reproducible build (dependency download + sources + patches + build + install into repo)
├── scripts/sync-app32-java.sh   ← generates the org.libsdl.app32 Java layer
├── licenses/                    ← font/codec license texts distributed alongside the binaries
└── BUILD.md                     ← this document
```

---

## 1. Upstream baseline

| Item | Value |
| --- | --- |
| Local build source (fork) | <https://github.com/Weiss-UltimateSavior/xsystem35-sdl2> |
| Pinned commit | `18af9be92dbe811b783c81393ca2307ccc50efd5` (2026-10-10, "Route effect and dDemo rendering through gfx_updateScreen()") |
| Upstream repository | <https://github.com/kichikuou/xsystem35-sdl2> (the fork currently matches that commit and carries no source changes) |
| Engine version | `XSYSTEM35_VERSION = "2.20.0"` (root `CMakeLists.txt`) |
| License | GPL-2.0-or-later (`COPYING`, shipped with the fork) |

> **Modification statement**: every change the app side makes to upstream lives in `patches/` (app32-ification of the
> SDL2 JNI prefix) and in build parameters (artifact renaming / dependency trimming / libwebp static linking, see §5.4);
> the fork itself carries no modifications. For the complete source and modification statement, see the corresponding
> commit in the fork repository.

---

## 2. Source and dependency provenance (none distributed with the main repository)

`scripts/build-xsys35.sh` performs everything automatically into a build directory outside the repository (default
`${TMPDIR:-/tmp}/xsys35-build`):

### 2.1 Fetching sources

- `--src <path>`: use a local xsystem35 checkout (reuse an existing repository when reviewing/reproducing);
- Default: `git clone https://github.com/Weiss-UltimateSavior/xsystem35-sdl2`
  into `<build-dir>/xsystem35-src` and `git checkout --detach 18af9be...`;
  if the directory already exists, it instead runs `git fetch origin` + checkout of the same pinned commit.

### 2.2 Downloading dependencies (SHA1 verified, abort on failure; skipped when present and verified)

Everything comes from the official release tarballs; tarballs are cached in `<build-dir>/downloads/` and extracted to
`<build-dir>/third_party/<directory>`:

| Directory | Upstream tarball | URL | SHA1 (verified) |
| --- | --- | --- | --- |
| `SDL2/` | `SDL2-2.32.10.tar.gz` | <https://github.com/libsdl-org/SDL/releases/download/release-2.32.10/SDL2-2.32.10.tar.gz> | `ce98fa93e31836a751feca374ab28a0770b63c16` |
| `freetype/` | `freetype-2.14.3.tar.gz` | <https://downloads.sourceforge.net/project/freetype/freetype2/2.14.3/freetype-2.14.3.tar.gz> (fallback <https://download.savannah.gnu.org/releases/freetype/freetype-2.14.3.tar.gz>) | `a911f65c6355ddcf7aaba46e250dbc00f67e1678` |
| `SDL2_mixer/` | `SDL2_mixer-2.8.0.tar.gz` | <https://github.com/libsdl-org/SDL_mixer/releases/download/release-2.8.0/SDL2_mixer-2.8.0.tar.gz> | `a58c69f9d00e44833b9e00e1adb58d85759ca499` |
| `libwebp/` | `libwebp-1.5.0.tar.gz` | <https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.5.0.tar.gz> | `b21aa842136dc59a72a38776a5aa73f4d0b00ac5` |

Once the dependencies are in place the whole build process no longer touches the network (`android-host/CMakeLists.txt`
does not download anything via FetchContent; libwebp is pointed at the local directory through
`FETCHCONTENT_SOURCE_DIR_LIBWEBP`, see §5.4).

### 2.3 Applying patches

The build script applies `patches/*.patch` to `<build-dir>/third_party/SDL2` in filename order:
patches are only replayed against pristine sources re-extracted from the cached tarball (first `git apply --check`, or
`patch --dry-run` when git is unavailable); after applying, the touched content is re-verified and a marker is written
(hash of the patch contents + the SDL2 tarball SHA1). A repeated run skips the patch only when both the marker and the
content re-check pass.

> Why not use `patch`'s "already applied" detection: in batch mode the Apple patch shipped with macOS automatically
> flips the direction for hunks that do not apply, and `--dry-run` still returns success (measured), so it cannot
> reliably tell whether a source tree is already patched; `git apply --check` does not have this problem (measured, this
> flow correctly rejects both the already-applied and the not-applied wrong direction).

### 2.4 Toolchain

| Tool | Version/path (script defaults, overridable via arguments) |
| --- | --- |
| NDK | `~/Library/Android/sdk/ndk/28.0.13004108` (r28; `--ndk`) |
| CMake | `~/Library/Android/sdk/cmake/3.31.1/bin/cmake` (bundled with the SDK; `--cmake`; do **not** use homebrew cmake 4.x — the old project policies will fail) |
| Ninja | Same directory (bundled with the SDK, automatically added to PATH by the script) |
| SDK root | `$ANDROID_SDK_ROOT` / `$ANDROID_HOME` / `~/Library/Android/sdk` (`--sdk`) |

---

## 3. Patch inventory (`patches/`)

At build time these patches are applied by `build-xsys35.sh` to a clean SDL2 source tree outside the repository; the
files in this directory are the single definition, and nothing is distributed in an "already applied" form inside the
source tree.

### 3.1 `0001-sdl2-jni-prefix-app32.patch` — app32-ify the SDL2 JNI class prefix

Modifies `third_party/SDL2/src/core/android/SDL_android.c`:

1. `#define SDL_JAVA_PREFIX org_libsdl_app` → `org_libsdl_app32` (all JNI symbol names are derived from this macro);
2. the 4 hardcoded `"org/libsdl/app/..."` register_methods strings in `JNI_OnLoad` →
   `"org/libsdl/app32/..."` (SDLActivity / SDLInputConnection / SDLAudioManager / SDLControllerManager).

Reason: the ONS plugin inside the APK uses the `org.libsdl.app` Java layer of SDL2 **2.26.3**, and its hard version
check in `onCreate` inevitably conflicts with the 2.32.10 native side; this engine's Java layer is therefore renamed
wholesale to `org.libsdl.app32` (see §4), and the native-side prefix must change with it, otherwise
`RegisterNatives` cannot find the classes.

### 3.2 `0002-sdl2-hidapi-jni-prefix-app32.patch` — keep the HIDAPI JNI prefix in sync

Modifies `SDL_JAVA_PREFIX` in `third_party/SDL2/src/hidapi/android/hid.cpp` (to `org_libsdl_app32` as above).

**Why it must change** (outside the "macro + 4 strings" list in plan §3.4, but part of the same rename surface):
`src/hidapi/android/hid.cpp` exports `Java_org_libsdl_app_HIDDeviceManager_*` by **symbol name** (not
RegisterNatives); meanwhile `SDLActivity.onCreate` unconditionally calls `HIDDeviceManager.acquire(this)`, and the
first line of that constructor is `HIDDeviceRegisterCallback()` (native). Without the prefix change, the app32 Java
layer crashes with `UnsatisfiedLinkError` right at startup. The complete rename surface of SDL2 2.32.10 is
**2 macros + 4 strings** (`grep -rn 'org_libsdl_app' <build-dir>/third_party/SDL2/src/` confirms exhaustion; the only
remaining mention of the old name is a **comment** in `src/video/android/SDL_androidevents.c`, with no functional
impact).

### 3.3 Re-applying (manual)

Against the official pristine sources (`<build-dir>` is the build directory, default
`${TMPDIR:-/tmp}/xsys35-build`):

```bash
cd <build-dir>/third_party/SDL2
patch -p1 < <repo>/engine/xsystem35/patches/0001-sdl2-jni-prefix-app32.patch
patch -p1 < <repo>/engine/xsystem35/patches/0002-sdl2-hidapi-jni-prefix-app32.patch
```

Or simply re-run `scripts/build-xsys35.sh` (it replays them in order automatically and skips already applied ones).

### 3.4 Renames that are not patches (done in `android-host/CMakeLists.txt`)

- `libSDL2.so` → **`libSDL2x.so`**: `set_target_properties(SDL2 PROPERTIES OUTPUT_NAME SDL2x)`.
  Measured SONAME = `libSDL2x.so` (`llvm-readelf -d`), so no extra `-Wl,-soname` correction is needed.
- `libSDL2_mixer.so` → **`libSDL2_mixer_xs35.so`**: same `OUTPUT_NAME` change, measured SONAME matches.

Reason: the ONS plugin inside the APK ships its own SONAME `libSDL2.so` (2.26.3), and a name collision would make
dynamic linking resolution ambiguous.

---

## 4. The app32 Java layer (`engine/src/main/java/org/libsdl/app32/`)

Generated by the script from the upstream SDL2 sources — **do not edit by hand**:

```bash
engine/xsystem35/scripts/sync-app32-java.sh
```

- Source resolution (in priority order):
  1. `--sdl2-src <path>` / the `SDL2_SRC` environment variable (a local SDL2 source tree containing
     `android-project/app/src/main/java/org/libsdl/app/*.java`; pointing directly at that java directory is also accepted);
  2. `engine/xsystem35/third_party/SDL2` (if present locally);
  3. download `SDL2-2.32.10.tar.gz` into a temporary directory automatically (used only after the SHA1
     `ce98fa93e31836a751feca374ab28a0770b63c16` check passes, then cleaned up).
- The source consists of 9 `*.java` files;
- Transformation: `package org.libsdl.app;` → `org.libsdl.app32;`, and `org.libsdl.app` → `org.libsdl.app32` throughout;
- Output: `engine/src/main/java/org/libsdl/app32/*.java` (idempotent; the script clears the output directory first);
- Verification: `grep -rn "org\.libsdl\.app\b" engine/src/main/java/org/libsdl/app32/` → 0 lines;
- Sync check: `bash engine/xsystem35/scripts/sync-app32-java.sh --check` → "check passed"
  (it generates into a temporary directory and compares file by file without writing repository files; any difference
  exits 1; measured to pass through the "download fallback" path after the refactor).

---

## 5. Build (pre-built and committed)

### 5.1 One-command build (recommended)

```bash
# Default: clone the fork + download dependencies into ${TMPDIR:-/tmp}/xsys35-build, copy artifacts into jniLibs
bash engine/xsystem35/scripts/build-xsys35.sh

# Reuse a local checkout, build only into a directory outside the repository (for review/reproduction; jniLibs untouched)
bash engine/xsystem35/scripts/build-xsys35.sh \
    --src /path/to/xsystem35-sdl2 --out "$TMPDIR/xsys35-verify-out"

# Other arguments: --build-dir / --sdk / --cmake / --ndk / --jobs / --clean (see --help for all)
```

Script flow: download dependencies (SHA1) → apply patches to the clean SDL2 tree → sources (clone/checkout the pinned
commit) → cmake configure → build → `llvm-strip --strip-unneeded` → copy the 3 artifacts into `--out`
(default `engine/src/main/jniLibs/arm64-v8a`) → print the SONAME/NEEDED and SHA256 of each artifact.
All build outputs (sources, dependencies, build tree and intermediates) stay in the directory outside the repository.

### 5.2 Equivalent manual commands

First prepare dependencies and sources yourself per §2 (download and extract + apply patches + clone/checkout the fork),
then:

```bash
NDK=~/Library/Android/sdk/ndk/28.0.13004108
CM=~/Library/Android/sdk/cmake/3.31.1/bin/cmake
BUILD=/tmp/xsys35-build/build               # any directory outside the repository
SRC=/path/to/xsystem35-sdl2                 # fork checkout (pinned commit)
DEPS=/path/to/third_party                   # directory containing SDL2/freetype/SDL2_mixer/libwebp

PATH=~/Library/Android/sdk/cmake/3.31.1/bin:$PATH $CM -S engine/xsystem35/android-host -B $BUILD -G Ninja \
  -DCMAKE_TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-26 -DANDROID_STL=c++_static \
  -DCMAKE_BUILD_TYPE=Release \
  -DXSYS35_SRC=$SRC -DXSYS35_THIRD_PARTY_DIR=$DEPS

PATH=~/Library/Android/sdk/cmake/3.31.1/bin:$PATH $CM --build $BUILD -j

# strip
$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip --strip-unneeded \
  $BUILD/SDL2/libSDL2x.so \
  $BUILD/SDL2_mixer/libSDL2_mixer_xs35.so \
  $BUILD/xsystem35/src/libxsystem35.so

# install into the repository
cp $BUILD/SDL2/libSDL2x.so \
   $BUILD/SDL2_mixer/libSDL2_mixer_xs35.so \
   $BUILD/xsystem35/src/libxsystem35.so \
   engine/src/main/jniLibs/arm64-v8a/
```

### 5.3 Build recipe parameters

| Variable | Required | Description |
| --- | --- | --- |
| `XSYS35_SRC` | Yes | xsystem35 source directory (fork checkout). If missing, `FATAL_ERROR` is raised with a hint to use `scripts/build-xsys35.sh` |
| `XSYS35_THIRD_PARTY_DIR` | No | Root directory of dependency sources (containing `SDL2/freetype/SDL2_mixer/libwebp`). Defaults to `${CMAKE_CURRENT_SOURCE_DIR}/../third_party` (usable only when it exists); when missing, `FATAL_ERROR` is raised with a hint to use the script |

### 5.4 Differences between `android-host/CMakeLists.txt` and the upstream recipe

| # | Difference | Description |
| --- | --- | --- |
| 1 | Dependencies come from `XSYS35_THIRD_PARTY_DIR` (a build directory outside the repository) | `add_subdirectory(${XSYS35_THIRD_PARTY_DIR}/SDL2|freetype|SDL2_mixer ...)` replaces the upstream FetchContent download; sources are pointed at the fork checkout via `XSYS35_SRC` |
| 2 | libwebp uses the local copy | `FETCHCONTENT_SOURCE_DIR_LIBWEBP=${XSYS35_THIRD_PARTY_DIR}/libwebp` makes `fetch_webp()` in the xsystem35 root `CMakeLists.txt` consume the local directory; no network access |
| 3 | Artifact renaming | SDL2 → `libSDL2x.so`; SDL2_mixer → `libSDL2_mixer_xs35.so` |
| 4 | freetype trimming | Identical to upstream, item by item: `FT_DISABLE_ZLIB/BZIP2/PNG/HARFBUZZ/BROTLI = ON (CACHE BOOL "" FORCE)` |
| 5 | SDL2_mixer trimming | Consistent with upstream: `SDL2MIXER_OPUS/FLAC/MOD/MIDI/WAVPACK/SAMPLES/INSTALL = OFF`; **plus a new `SDL2MIXER_DEPS_SHARED=OFF`** (so ogg/vorbis etc. link statically into the mixer, avoiding extra `.so` files) |
| 6 | libwebp static linking | Before configuring the xsystem35 target, set `set(BUILD_SHARED_LIBS OFF)` (a directory-scope **normal variable**, not written to CMakeCache and not a global setting) + `WEBP_LINK_STATIC=ON`. Reason: `option(BUILD_SHARED_LIBS ... ON)` in `SDL2_mixer` sets the cache variable to ON, and libwebp's library targets follow `BUILD_SHARED_LIBS` (`WEBP_LINK_STATIC` only affects tool linking); without this you would get extra `libwebp.so` / `libsharpyuv.so` |
| 7 | No global cache `BUILD_SHARED_LIBS` | Each dependency's form is pinned explicitly with directory-scope normal variables: freetype static / SDL2_mixer shared / libwebp static (so the first configure and reconfigure agree, and CMakeCache leftovers cannot change the artifact form); SDL2 itself explicitly defines both a shared and a static target (`libSDL2x.so` + `libSDL2.a`) |
| 8 | Gate on the planned artifacts | After the build, `build-xsys35.sh` scans the build tree: any `.so` outside the 3 planned ones is an error |

Upstream Android build parameter comparison: upstream `android/app/build.gradle` uses `-DANDROID_APP_PLATFORM=android-19`
and `abiFilters armeabi-v7a,arm64-v8a`; this project uses only `arm64-v8a` and `ANDROID_PLATFORM=android-26`
(minSdk 26), with `ANDROID_STL=c++_static` matching upstream.

---

## 6. Artifacts and verification

Committed location `engine/src/main/jniLibs/arm64-v8a/`:

| Artifact | Size (after strip) | SHA-256 |
| --- | --- | --- |
| `libxsystem35.so` | 1 692 320 B (≈1.69 MB) | `63072b36f71a4e59bda3d5074ea9490b44bd94048fc823ba73d98d68fbc3bf81` |
| `libSDL2x.so` | 1 476 240 B (≈1.48 MB) | `cee53fbc5fd41a895658ce98401cd6aa033ad6039b426d4401f9ac1b3caba0c1` |
| `libSDL2_mixer_xs35.so` | 201 408 B (≈0.20 MB) | `45123e7945ec780a19c41aea102ff893ed700d417b2ea86cc3b736a587afc2fe` |

Total ≈ 3.37 MB (arm64, after strip).

> The committed artifacts are the builds from **before this refactor**; after the refactor they were reproduced from
> scratch and verified with the new `scripts/build-xsys35.sh` flow (fork sources + external dependency directory); see
> §6.4 for the measurements.

### 6.1 `llvm-readelf -d` (SONAME / NEEDED)

```
libxsystem35.so          SONAME libxsystem35.so
  NEEDED libm.so liblog.so libdl.so libz.so libSDL2_mixer_xs35.so libSDL2x.so libc.so
libSDL2x.so              SONAME libSDL2x.so
  NEEDED libm.so libOpenSLES.so libdl.so liblog.so libandroid.so libGLESv1_CM.so libGLESv2.so libc.so
libSDL2_mixer_xs35.so    SONAME libSDL2_mixer_xs35.so
  NEEDED libSDL2x.so libm.so libdl.so libc.so
```

- Each SONAME matches its file name one to one;
- `libxsystem35.so`'s NEEDED list contains `libSDL2x.so` and `libSDL2_mixer_xs35.so`;
- `libSDL2.so` does not appear; no absolute paths appear; no third-party names that are not committed appear
  (`libwebp.so` / `libogg.so` / `libvorbis.so` / `libfreetype.so` etc.) — freetype and libwebp **are linked statically
  into `libxsystem35.so`**.

### 6.2 Symbol verification

```bash
$NM -D engine/src/main/jniLibs/arm64-v8a/libSDL2x.so | grep -c org_libsdl_app32   # → 52
$NM -D engine/src/main/jniLibs/arm64-v8a/libSDL2x.so | grep -c org_libsdl_app_    # → 0
$NM -D engine/src/main/jniLibs/arm64-v8a/libxsystem35.so | grep -w SDL_main        # → 00000000000b8830 T SDL_main
```

### 6.3 Re-checking the rename surface

```bash
grep -rn "org/libsdl/app" <build-dir>/third_party/SDL2/src/ <build-dir>/third_party/SDL2/include/  # only org/libsdl/app32/...
grep -rn "org\.libsdl\.app" <build-dir>/third_party/SDL2/src/                                       # 0 lines
grep -rn "org_libsdl_app"  <build-dir>/third_party/SDL2/src/ <build-dir>/third_party/SDL2/include/  # only the 2 macros + 1 comment
```

### 6.4 Reproduction with the new flow after the refactor (2026-10-13)

`scripts/build-xsys35.sh` (`--src /Volumes/HUAWEI-M2LITE/app/xsystem35-sdl2`, artifacts written to a temporary
directory outside the repository) built from scratch:

- 3 artifacts (the script's built-in "unplanned `.so`" gate passed);
- The SONAME/NEEDED values from `llvm-readelf -d` are exactly the same as in §6.1;
- `llvm-nm -D`: `libSDL2x.so` has 52 `org_libsdl_app32` symbols and 0 `org_libsdl_app_` symbols;
  `SDL_main` is present in `libxsystem35.so` (consistent with §6.2);
- The dynamic symbol sets (defined/undefined) and the `.dynsym`/`.dynstr` semantics are exactly the same as the
  committed artifacts;
- The differences from the committed artifacts come from only two places, neither related to code semantics:
  1. `.note.gnu.build-id` (a linker note that changes with every build);
  2. the **absolute source path strings** compiled into the binaries (`__FILE__`: 3 SDL2 source files in
     `libSDL2x.so`, 1 instance of `src/microui/microui.c` in `libxsystem35.so`), plus the string-table/address layout
     shifts caused by their different lengths.

**Counter-proof**: after rebuilding with `-fmacro-prefix-map=<build dir>=<pre-refactor vendored path>` (mapping
`__FILE__` back to the original paths), **the 3 artifacts are byte-identical to the committed ones** — only
`.note.gnu.build-id` differs (`cmp` passes once that section is aligned), and the file sizes 1 692 320 / 1 476 240 /
201 408 B are identical as well. That is, the new flow matches the committed artifacts in symbols, NEEDED and all
code/data; therefore **the jniLibs artifacts are not replaced**, and the §6 table keeps the record of the committed
artifacts.

Measured SHA-256 of the new flow (without path mapping), archived for reference (two consecutive `--clean` builds were
identical, so it is reproducible):

| Artifact | New-flow SHA-256 |
| --- | --- |
| `libxsystem35.so` | `98636a05b3ea7e337184d8a16d0c1905b0fd89b5215c55cef4da36439d258f13` |
| `libSDL2x.so` | `102477f478b640cd6fbcca0fddc50cbda5c7745304724e85136c943bf99a9f66` |
| `libSDL2_mixer_xs35.so` | `4d8a0210f2103230e749363dc10eb234697db6da1af375c4e4431ad3d53f1ec7` |

> `libSDL2_mixer_xs35.so` contains no source path strings at all, so its new-flow artifact differs from the committed
> one **only** in `.note.gnu.build-id`.

---

## 7. Reproduction steps when upstream is updated

1. Pull the new upstream/fork commit and record `git rev-parse HEAD` and `XSYSTEM35_VERSION` from `CMakeLists.txt`;
2. Update `FORK_COMMIT` in `scripts/build-xsys35.sh` (and the baseline table in `BUILD.md`);
3. If dependency versions changed: update the dependency list (URL/SHA1) in the script and §2.2 of this document;
4. Re-apply the patches — if upstream has moved to a newer SDL2, first confirm the rename surface
   (`grep -rn 'org_libsdl_app\|org/libsdl/app' <build-dir>/third_party/SDL2/src/`) and then fix the patches;
5. Re-run `scripts/sync-app32-java.sh` (run `--check` first if needed to see the diff);
6. Rebuild, strip and install per §5, then update the size / SHA-256 / readelf records in §6;
7. For on-device acceptance see plan §7.2.

---

## 8. Licensing

The complete source and modification statement are in the fork
(<https://github.com/Weiss-UltimateSavior/xsystem35-sdl2>, pinned commit in §1); the main repository's `licenses/`
keeps the font/codec license texts that are **distributed alongside the binaries**.

| Component | License | Notes |
| --- | --- | --- |
| xsystem35 | **GPL-2.0-or-later** | `COPYING` and the complete source are in the fork; the pre-built `.so` in this repository is a derivative distribution of it |
| SDL2 2.32.10 | zlib | Full statement in the fork/dependency sources (`LICENSE.txt`) |
| SDL2_mixer 2.8.0 | zlib | Same as above |
| freetype 2.14.3 | FTL / GPLv2 | Same as above (`docs/FTL.TXT`, `GPLv2.TXT`) |
| libwebp 1.5.0 | BSD-3-Clause | Same as above (`COPYING`, plus `PATENTS`) |
| Bundled fonts `MTLc3m.ttf` / `mincho.ttf` | See `licenses/MTLc3m.txt` / `licenses/mincho.txt` | Committed under `engine/src/main/assets/` (§9), distributed with the APK assets |
| microui / nanojpeg (bundled in xsystem35) | See `licenses/microui.txt` / `licenses/nanojpeg.txt` | Retained as part of the binary distribution |

---

## 9. Font assets (bundled in the main repository)

`MTLc3m.ttf` and `mincho.ttf` are a **hard dependency** of xsystem35 (if missing, it exits with SYSERROR at startup),
so both files must exist at the root of the APK assets. After the refactor they are **committed directly** under
`engine/src/main/assets/` (on the same level as the existing `DroidSansFallback.ttf`; there is no longer a vendored
`fonts/` directory or a Gradle sync task):

- `MTLc3m.ttf` 1 924 864 B (SHA-256 `b9e87fd7e4e5112b7bcc8c3486c19a23379e4520b36b5c049ecfd40731556a51`)
- `mincho.ttf` 4 775 296 B (SHA-256 `a57a34b464325bce7cb2bb6bbcf7ef81c2c5eea7897cbd8acbfbdc2eb8ad695c`)

`app/build.gradle.kts` also has `androidResources { noCompress += listOf("ttf", "otf") }`:
if the font assets were compressed by AAPT, reading them from xsystem35 would be extremely slow (an explicit upstream
requirement).

### 9.1 Measured Gradle pipeline (AGP 9.2.1)

```bash
./gradlew :app:mergeDebugAssets --no-daemon     # BUILD SUCCESSFUL
#   :engine:mergeDebugAssets → :app:mergeDebugAssets (fonts come directly from engine/src/main/assets)
#   output: app/build/intermediates/assets/debug/mergeDebugAssets/{MTLc3m.ttf,mincho.ttf}

./gradlew assembleDebug --no-daemon             # BUILD SUCCESSFUL
unzip -v app/build/outputs/apk/debug/app-debug.apk | grep -E "MTLc3m|mincho|libSDL2x|libSDL2_mixer_xs35|libxsystem35"
#   1924864  Stored  1924864  assets/MTLc3m.ttf            ← noCompress took effect (Stored, not Defl)
#   4775296  Stored  4775296  assets/mincho.ttf
#   1476240  Defl    ...        lib/arm64-v8a/libSDL2x.so
#    201408  Defl    ...        lib/arm64-v8a/libSDL2_mixer_xs35.so
#   1692320  Defl    ...        lib/arm64-v8a/libxsystem35.so
```

> Note: this repository's AGP 9.2.1 no longer has a `:app:processDebugAssets` task (the equivalent merge tasks are
> `:app:mergeDebugAssets` / `:app:compressDebugAssets`); verification used the former plus a full `assembleDebug`
> (yielding two concrete pieces of evidence: the fonts are Stored inside the APK, and all third-party `.so` files are
> packaged).