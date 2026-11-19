# Tyranor Next

<p align="center">
  <img src="screenshots/index.png" alt="Tyranor Next" width="850" />
</p>

A multi-engine visual novel (galgame) aggregation launcher for Android, **reverse-engineered and rewritten from the Tyranor emulator**. It ships built-in runtime environments for nine engines — Kirikiri / ONScripter / Tyrano / Artemis / Siglus / RealLive / AVG32 / UK2 / FVP — and also supports external APK engine modules for Ren'Py and RPG Maker RGSS plus hand-off to external PSP / Nintendo Switch emulators (PPSSPP / Eden). It recognizes and launches many kinds of games and offers an integrated experience covering game library management, cover fetching, save mirroring, and engine parameter tuning.

The native macOS version is as follows:

- [Tyranor Next for macOS](https://github.com/Weiss-UltimateSavior/Tyranor-Mac)

The iOS version is planned...
On HarmonyOS devices you can install it through the Zhuoyitong Android compatibility layer.

The design philosophy prioritizes being lightweight, simple, and fast, without introducing extra, redundant features.

QQ group: 364439133

Thanks to [@安音](https://www.pixiv.net/users/8182248) for drawing the logo girl for this project!

## Thanks to all contributors! Let's become the light together!

<a href="https://github.com/Weiss-UltimateSavior/Tyranor-Next/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Weiss-UltimateSavior/Tyranor-Next" />
</a>

## Supported Scope

### Engines and Game Types

| Game Type            | Typical Identifying Features                                                                 | Runtime Environment                         |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Kirikiri / Kirikiri2 | `.xp3`, `startup.tjs`                                                                        | Kirikiroid2 / krkrsdl3 native runtime        |
| ONScripter           | `nscript.dat`, `.nsa`                                                                        | ONScripter native runtime                    |
| Artemis              | `system.ini`, `.pfs`                                                                         | Artemis native runtime                       |
| SiglusEngine         | `Gameexe.dat`/`Gameexe.ini`, `Scene.pck` (root or `Data/`)                                    | Siglus native runtime (siglus_rs)            |
| RealLive             | `Gameexe.ini` + `SEEN.TXT` (10000-entry TOC) or `SEEN####.TXT`                                 | Built-in visual novel runtime (game_launcher) |
| AVG32                | `Gameexe.ini` + `SEEN.TXT` (`PACL`) or `SEEN###.TXT` (`TPC32`)                                 | Built-in visual novel runtime (game_launcher) |
| UK2 (PC-98)          | `UK2.CFG`, `*.MES` (`<< UK2 TEXT Ver1.00 >>` header)                                          | Built-in visual novel runtime (game_launcher) |
| FVP                  | `*.hcb`/`*.bch` scripts, resource archives such as `graph.bin`/`voice.bin`                     | Built-in FVP native runtime (rfvp)           |
| System35             | `*.ALD` (such as `SA.ALD`; root or `GAMEDATA/`), `System39.ain`/`System39.ini`/`*.wai`/`*.bgi`/`*.alk` | Built-in System3.x runtime (xsystem35)       |
| YU-RIS               | `yscfg.dat`, `pac/*.ypf`, `YS*.DLL`, `.ymv`                                                   | External Winlator (winlator-cn)              |
| CatSystem2           | Combinations of `config/startup.xml`, `*.int`, `*.cst`, `*.hg3`, `*.kcs`, etc.                 | External Winlator (winlator-cn)              |
| PC (manually added)  | Use "Add PC game" in the game page top bar to pick a directory and specify the launch exe      | External Winlator (winlator-cn)              |
| TyranoBuilder        | `index.html`, `tyrano/`                                                                      | Built-in Tyrano Web runtime                  |
| RPG Maker XP         | `.rgssad`, `Game.ini` + `Data/*.rxdata`                                                      | External RPGM APK module                     |
| RPG Maker VX         | `.rgss2a`, `Game.ini` + `Data/*.rvdata`                                                      | External RPGM APK module                     |
| RPG Maker VX Ace     | `.rgss3a`, `Game.ini` + `Data/*.rvdata2`                                                     | External RPGM APK module                     |
| mkxp-z               | User-selected / internal alias `internal.mkxp-z`                                             | External RPGM APK module                     |
| RPG Maker MV         | `www/`, `js/rpg_core.js`                                                                     | Built-in Web runtime                         |
| RPG Maker MZ         | `www/`, `js/rmmz_core.js`                                                                    | Built-in Web runtime                         |
| VN                   | `globalData.vndata`                                                                          | Built-in Web runtime                         |
| WebOther             | Generic `index.html` web game                                                                | Built-in Web runtime                         |
| Ren'Py               | `.rpa`, `game/script.rpy`, `game/options.rpy`, `renpy/` + `.rpy/.rpyc`                        | External RenPy APK module                    |
| PSP                  | `.pbp`, `.cso`, `.iso`, `.chd`                                                                | External PPSSPP emulator                     |
| Nintendo Switch      | `.nsp`, `.xci`, `.nca`, `.nro`                                                               | External Eden emulator                       |

CatSystem2 games are recognized by scoring directory feature combinations such as `config/startup.xml` and `.int/.cst/.hg3/.kcs` (`cs2.exe` is only an auxiliary signal and never decides detection on its own); launching likewise goes through the external Winlator (directory + main program; the Runtime allows `.bin` and prefers `cs2.exe`).

YU-RIS (Windows) games run through the external Winlator (winlator-cn): scanning identifies them by `yscfg.dat`, `pac/*.ypf`, engine DLLs, and `.ymv` features, and launching starts them through the Winlator external launch protocol using "game directory + main program exe" (the directory is temporarily mounted by Winlator on a free drive letter it allocates automatically, and `save=false` means container configuration is not written back); the main program is selected automatically and can be overridden manually under "Launch file" in game details. Saves and runtime parameters are managed by Winlator; the main app does not take them over.

The built-in Web runtime also supports some NW\.js games packaged as `app.asar`; on launch the specific type is further identified from the archive contents.
Ren'Py and RPG Maker XP/VX/VX Ace/mkxp-z currently run through external APK modules: Ren'Py supports versions 8.5 / 7.7.1, and the engine version can be selected globally or per game; auto mode reads the Ren'Py `script_version` and Python2 runtime library features and matches between the 8.5 / 7.7.1 modules. The main app enables this capability by default and only checks on the engine page whether the target module is installed; when it is not installed, the engine item shows a cross and prompts to download and install. RPG Maker MV/MZ belong to the Web runtime and continue to use the built-in Web runtime.
PC games (any Windows program) are added to the library manually via "Add PC game" in the game page top bar (they do not participate in scanning): choose a directory, search it for exes, and specify the launch program; launching goes through the external Winlator, and the launch file can be switched at any time in game details. PC games are not included in save management or engine parameter configuration.

PSP and Nintendo Switch games run through hand-off to external emulators: scanning identifies them by ROM extension and imports each one individually (`.iso/.cso/.pbp/.chd`, `.nsp/.xci/.nca/.nro`), and launching starts the installed PPSSPP / Eden according to type (explicit component + read grant, using SAF content URIs; the file fallback path is converted via FileProvider). Saves and settings for these two kinds of games are managed by the emulators themselves, and the main app does not take them over; the "External hand-off support" entry on the engine page shows installation status and links to the download pages. On the engine page you can enable "Categorized engine display" in app settings to show engine items on separate pages for GAL / RPGM / Console / Web.

### Platform and File Requirements

- Android 8.0 (API 26) and above.
- The current native engine libraries are provided only for `arm64-v8a`, so the device must have a 64-bit ARM architecture.
- Game directories must be located on local storage accessible to Android and authorized through the system file picker (SAF); on launch, the directory must be mappable to a real file path, and some engines on external storage may require "all files access" permission.
- Actual compatibility depends on the engine version, packaging/encryption scheme, and script features used by the game; specially modified versions may require adjusting engine settings or patches.

## Contributing

Contributions to development and maintenance are welcome!

Before submitting a Pull Request, please read and follow the [Contributing Guide](./CONTRIBUTING.md).
Submissions that do not meet the requirements of the contributing guide may be rejected.
Code must match the overall style of the project and must not introduce new problems.
Before submitting, be sure to run the pre-submission review using the review methods described in the project's AGENTS.md file.
If the code is obviously sloppy, it will definitely be rejected.

## Technical Architecture

### Module Breakdown

| Module   | Responsibilities                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| `app`    | Android application shell: Compose UI, feature abstraction layer, configuration, covers, saves, authorization, background updates, and other app-side capabilities |
| `engine` | Low-level engine runtime core: SDL2/SDL3, Kirikiri TVP, krkrsdl3, ONScripter, Artemis, Siglus, FVP (rfvp), Tyrano, Native/JNI, and engine host Activity |

### Three-Layer Directory Architecture

The project is currently categorized into three layers by responsibility, with a fixed dependency direction:

```
UI interaction layer -> feature abstraction layer -> low-level engine layer
```

| Layer                    | Directory                                  | Responsibilities                                                                                                                        |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Low-level engine layer   | `engine/`                                  | KRKR/Kirikiroid, krkrsdl3, ONS, Artemis, Siglus, FVP (rfvp), Tyrano, SDL/Cocos/IJK, Native/JNI, engine host Activity, engine resources, and low-level loading of native plugins |
| Feature abstraction layer | `app/src/main/java/com/tyranor/next/core/` | Game scanning, game models, launch orchestration, cover fetching, save management, online patches, app/engine/per-game configuration, authorization, background updates |
| UI interaction layer     | `app/src/main/java/com/tyranor/next/ui/`   | Compose pages, Activity shells, dialogs, navigation, top bar, search fields, user input, loading and error states                     |

The feature abstraction layer is further split by domain:

- `core/game`: game models, scanning, launching, save management
- `core/engine`: engine types, built-in engine plugin launch and install orchestration, external APK engine module registration and launch protocol
- `core/cover`: cover fetching, source aggregation, batch tasks
- `core/patch`: KRKR online patches
- `core/settings`: app-level configuration, engine-level configuration, per-game configuration
- `core/auth`: Hikarinagi OAuth authorization and token management
- `core/updater`: background update checks and notifications
- `core/unpack`: Artemis launch-package unpacking helper; core logic and SAF relay for the standalone XP3 unpack/pack tool

The UI layer is further split by page domain:

- `ui/main`: main entry, bottom navigation, and global page state
- `ui/home`: home page
- `ui/game`: game library, game cards, cover actions, game action dialog
- `ui/engine`: engine page
- `ui/settings`: app settings, engine settings entry, engine/per-game settings pages
- `ui/cover`: cover sources and batch fetch settings
- `ui/patch`: KRKR online patch page
- `ui/save`: save management page
- `ui/archive`: standalone XP3 unpack / pack tool page
- `ui/auth`: OAuth callback Activity
- `ui/common`: shared UI components, dialogs, placeholder pages, top bar/input fields, and other reusable components

### Tech Stack

- **Language**: Kotlin (the engine layer also contains Java bridge code)
- **UI**: Jetpack Compose + Material 3 + [Miuix](https://github.com/compose-miuix-ui/miuix)
- **Navigation**: bottom navigation `NavigationBar`; main tab content pages switch with a horizontal movement animation, while standalone Activities such as details/settings enter with an upward page turn and exit with a downward page turn
- **Build**: Gradle 9.5.1 / AGP 9.2.1 / Kotlin 2.x + Compose Compiler, `compileSdk 37`, `minSdk 26`, `targetSdk 36`
- **Persistence**: SharedPreferences (scan results, global engine settings, per-game setting overrides, recent records)
- **File access**: Storage Access Framework (SAF) for managing external game directories, assisted by the `documentFile` library

### Engine Integration Design

- Native engine plugins (the `.so` files for `kirikiroid2` / `ons` / `artemis`) are packaged with the APK as assets (`nativeplugins/`) and are automatically extracted and installed into the app's private directory by `NativePluginManager` on first launch
- The source of shared native plugin `.so` files lives in `engine/src/main/nativeplugins`; the app side only maintains the plugin `manifest.json` and app-only plugins. At build time Gradle merges them and generates `app/build/generated/assets/nativeplugins/*.zip`
- The source of shared RPG Maker injection scripts lives in `engine/src/main/assets`; the app side keeps only app-specific injection scripts, and Gradle synchronizes them into the app assets at build time, avoiding duplicated files maintained by hand on both sides
- The `app` module maps scan results to the corresponding engine Activity through `core/game/launch/EngineLauncher` (SAF URI → real path conversion)
- External APK engine modules such as Ren'Py and RPG Maker RGSS are registered uniformly by `core/engine/external`, which detects installation status and launches them via intent protocol; the main app does not maintain a manual enable toggle — a module is considered available once installed
- PSP / Nintendo Switch are handed off to the external PPSSPP / Eden by `ExternalEmulatorRegistry` / `ExternalEmulatorLauncher` in `core/engine/external`: ROMs are identified during scanning and imported individually (one ROM, one entry), and at runtime they are routed before directory resolution and launched with the explicit component and read grant; the "External hand-off support" item on the engine page shows installation status and can link to the download page, and the Manifest `<queries>` already declares the corresponding package names
- The Tyrano runtime includes a local HTTP server, Asar archive parsing, and JS hook scripts (`__tyrano__.js`, etc.), so web-style script games can run without external dependencies
- The FVP (rfvp) host is a Java `SurfaceView` + `Choreographer` main loop driving the Rust engine (`librfvp.so` + a custom bridge library), packaged with the APK; it supports original `*.hcb` and Chinese-localized `*.bch` scripts, and text encoding (Shift-JIS/GBK/UTF-8), system font fallback, and HiDPI text can be adjusted globally or per game in engine settings
- RealLive / AVG32 / UK2 are carried by the `game_launcher` runtime (the same `libsiglus.so` as Siglus, dlopen'ed by `libgames_bridge.so`); the host `FramebufferGameActivity` (the `:fbgames` process) drives the `game_fb_*` framebuffer every frame: single finger = left click, two-finger tap = right click, two-finger vertical swipe = wheel, Back = right click, and text encoding (auto/Shift-JIS/GBK/Big5/UTF-8/Korean) can be adjusted globally or per game
- Native libraries are provided only for the `arm64-v8a` architecture

## Visual Documentation

The `.archify/` directory ships a set of interactive diagrams generated from the current code and validated by automation (schema validation + real browser rendering checks): all are self-contained HTML files that can be opened directly in a browser to zoom, search/focus nodes, switch between light and dark themes, and export images; each directory also keeps the editable `candidate.json` source data and validation receipts, so it can be re-rendered together with the archify skill.

| Diagram | Type | Coverage |
| --- | --- | --- |
| [System overview](.archify/架构图-系统总览-20261006-022735/architecture-overview.html) | Architecture diagram | Three-layer architecture, main process / engine process family boundaries, external modules and emulators, online service integration |
| [Engine runtime and native plugin system](.archify/架构图-引擎运行时-20261006-022735/architecture-engine-runtime.html) | Architecture diagram | Plugin supply chain, host and JNI bridging, prebuilt runtime libraries, Rust XP3 and Web shell |
| [App feature map](.archify/功能图-应用功能地图-20261006-022735/architecture-feature-map.html) | Feature diagram | Six feature domains × 18 capabilities and their implementing components |
| [Game scan and import workflow](.archify/流程图-游戏扫描入库-20261006-022735/workflow-scan-import.html) | Workflow diagram | SAF authorization, directory traversal, engine identification priority chain, differential merge, and Room persistence |
| [Game launch orchestration workflow](.archify/流程图-游戏启动编排-20261006-022735/workflow-launch-orchestration.html) | Workflow diagram | Four-way routing (Android / emulator / external module / built-in engine) and pre-launch confirmation |
| [KiriKiri launch request sequence](.archify/时序图-KiriKiri启动-20261006-022735/sequence-kirikiri-launch.html) | Sequence diagram | Plugin guarantee → SAF mirror → Intent → JNI bridge → TVP ready, the entire chain |
| [Game library data and cover pipeline](.archify/数据流图-游戏库与封面-20261006-022735/dataflow-library-covers.html) | Data flow diagram | Collection, identification, authoritative Room storage, prefs mirror, cover cache, and consumers |
| [RPG Maker MV/MZ save lifecycle](.archify/生命周期图-存档互通-20261006-022735/lifecycle-save-interop.html) | Lifecycle diagram | Interop sync, format conversion, delayed return to foreground, abort, and other states |

## Build

```bash
# Build the debug APK
./gradlew assembleDebug --no-daemon
```

The output is located in `app/build/outputs/apk/debug/`. An Android SDK environment (local platform android-37) is required.

## Directory Structure

```
app/
├── src/main/java/com/tyranor/next/
│   ├── core/      Feature abstraction layer: scanning, launching, engine modules, covers, saves, patches, unpacking/packing, configuration, authorization, updates
│   ├── ui/        UI interaction layer: main screen, game page, settings page, dialogs, shared components
│   └── theme/     Compose / Miuix themes, color tones, light/dark adaptation
├── src/main/assets/
│   ├── engine/        App-specific Web engine injection scripts
│   └── nativeplugins/ Native plugin zips generated during the Gradle build
└── src/main/nativeplugins/ Plugin manifests and app-only plugin sources

engine/
├── src/main/java/          Low-level engine hosts, bridge code, and runtime entry points
├── src/main/cpp/           Native/JNI, SDL, and engine runtime code
├── src/main/assets/        Low-level engine resources and shared engine script sources
├── src/main/nativeplugins/ Shared native plugin .so sources
└── rust/                   XP3 unpack/pack Rust sources (xp3 parsing and KSD mode-2 implicit decoding; see LICENSE.usefulunpack for the license)

docs/   Design documents, reverse-engineering analysis, feature plans, and optimization proposals
```

## License

This project is released under the **GNU General Public License v2.0**; see [LICENSE](LICENSE) for details (GPL-2.0-only).

- The `engine/` engine runtime is a reverse-engineered rewrite based on the Tyranor emulator; upstream involves GPL-2.0 projects such as Kirikiroid2 / ONScripter, so the whole project is distributed under GPL-2.0
- Derivative works released based on this project must comply with the terms of GPL-2.0 and provide the complete source code along with the distribution
- Third-party dependencies such as Miuix are included under their respective licenses
- The Siglus / RealLive / AVG32 / UK2 engine runtimes come from [siglus_rs](https://github.com/xmoezzz/siglus_rs) (MPL-2.0, an unofficial Rust rewrite/port of the aforementioned engines) and are included under its own license; the corresponding source code is available upstream or in fork repositories
- The FVP engine runtime comes from [rfvp](https://github.com/xmoezzz/rfvp) (MPL-2.0, an unofficial Rust rewrite/port of the FVP engine) and is included under its own license; the corresponding source code is available upstream or in fork repositories
- The System35 engine runtime comes from [xsystem35-sdl2](https://github.com/kichikuou/xsystem35-sdl2) (GPL-2.0-or-later, an SDL2 port of the open-source reimplementation of the AliceSoft System 3.x engine); the engine source and modification statements are in the fork [xsystem35-sdl2](https://github.com/Weiss-UltimateSavior/xsystem35-sdl2); this repository keeps only the prebuilt runtime libraries, build recipe, and patch records (see `engine/xsystem35/BUILD.md`); its dependencies SDL2 / SDL2_mixer (zlib), freetype (FTL/GPLv2), and libwebp (BSD-3-Clause) are included under their respective licenses, with license texts retained in `engine/xsystem35/licenses/`
- The Anime4K GLSL shaders (`engine/src/main/assets/anime4k/`) come from [bloc97/Anime4K](https://github.com/bloc97/Anime4K) and are included under its MIT license (the copyright notice is retained at the top of each shader file)

## Acknowledgements
- [Kirikiroid2](https://github.com/zeas2/Kirikiroid2): the Kirikiroid2 engine
- **Tyranor emulator**: the reverse-engineering foundation for this project's engine runtime and core architecture
- [Artemis-Compat](https://github.com/Weiss-UltimateSavior/artemis-compat): custom compatible kernel
- [siglus_rs](https://github.com/xmoezzz/siglus_rs) (MPL-2.0): Rust rewrite and multi-platform port of SiglusEngine / RealLive / AVG32 / UK2, the runtime for these four engines
- [rfvp](https://github.com/xmoezzz/rfvp) (MPL-2.0): Rust rewrite and multi-platform port of the FVP engine, the FVP runtime
- [xsystem35-sdl2](https://github.com/kichikuou/xsystem35-sdl2) (GPL-2.0-or-later): open-source reimplementation of the AliceSoft System 3.x engine (SDL2 port), the System35 runtime; depends on [SDL2](https://github.com/libsdl-org/SDL) / [SDL2_mixer](https://github.com/libsdl-org/SDL_mixer) (zlib), [freetype](https://freetype.org/) (FTL/GPLv2), and [libwebp](https://chromium.googlesource.com/webm/libwebp) (BSD-3-Clause)
- **RinneMobile**: reference and implementation for many features such as game scan identification, SAF path mapping logic, standalone save mapping, and krkrsdl3
- [Miuix](https://github.com/compose-miuix-ui/miuix): settings UI component library
- [Anime4K](https://github.com/bloc97/Anime4K): (bloc97, MIT): real-time super-resolution for KRKR game visuals (line-reconstruction CNN shaders)
- [OnscripterYuri](https://github.com/YuriSizuku/OnscripterYuri): the ONS engine
- [UsefulUnpack](https://github.com/znso4pa/usefulunpack) (znso4pa, MIT): Rust implementation of XP3 / KSD unpacking/packing (source of `lib.rs` / `common.rs` / `ksd.rs` in `engine/rust`; see `engine/rust/LICENSE.usefulunpack` for the license)
- All engine runtimes are included under their respective open-source licenses