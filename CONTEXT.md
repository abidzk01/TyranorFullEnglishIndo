# Tyranor Next — Domain Context

An Android multi-engine visual novel (Galgame) aggregator launcher, rewritten by reverse engineering the Tyranor emulator: it recognizes and launches games orchestrated by engines such as KiriKiri / ONScripter / Tyrano / Artemis / Siglus / YU-RIS / CatSystem2 / PC (manually added) / RPG Maker / Ren'Py, and provides game library management, cover fetching, save mirroring, and engine parameter tuning. This context defines the core terms established in this domain.

## Engines and Runtimes

**Engine (EngineType)**:
The runtime family a game belongs to, determined during scanning by directory characteristics (script/resource files): KIRIKIRI, ONS, TYRANO, RPG Maker (RGSS series), RPG_MV, RPG_MZ, VN, WebOther, ARTEMIS, SIGLUS, REALLIVE, AVG32, XSYS35, UK2, FVP, RENPY, YURIS, CATSYSTEM2, PC, ANDROID_APP, UNKNOWN.
_Avoid_: game genre, format

**Built-in Engine**:
Engine runtimes shipped with the app that run without an external installation (Kirikiroid2 / krkrsdl3, ONScripter, Artemis, Siglus (siglus_rs Rust runtime), RealLive / AVG32 / UK2 (siglus_rs game_launcher software-rendering runtimes), FVP (rfvp Rust runtime), System35 (xsystem35), Tyrano web shell). RPG Maker MV/MZ are hosted by the built-in Web runtime.
_Avoid_: prebuilt engine, bundled engine

**Visual Novel Engine Group (Framebuffer engines)**:
Collective name for the three software-rendering engines (RealLive, AVG32, UK2) hosted by the game_launcher runtime besides Siglus: the engine outputs RGBA framebuffers frame by frame, the host `FramebufferGameActivity` copies them into a Bitmap for presentation and forwards pointer/keyboard/text input; text encoding (NLS) follows the global/per-game settings.
_Avoid_: software rendering engine, game_fb engine

**External APK Engine Module (External Engine Module)**:
An engine runtime distributed as a standalone APK that the user must install/download (Ren'Py 8.5/7.7.1, RPG Maker XP/VX/VX Ace/mkxp-z); the registry (ExternalEngineModuleRegistry) resolves the target module by engine + version, and launching pulls it up through an Intent protocol.
_Avoid_: plugin, engine DLC

**PC Game (manually added)**:
A Windows program that does not belong to a recognized engine family and that the user adds to the library manually via the games page top bar "Add game → Add PC game": choose a directory + specify a launch exe (stored in `launchFile`, switchable at any time); launching goes through the external Winlator; it does not participate in scanning and is not included in save management or engine configuration.
_Avoid_: unknown engine, Winlator game

**Android Game (manually added)**:
An Android app that does not belong to a recognized engine family and that the user adds to the library manually via the games page top bar "Add game → Add Android game" from the list of installed launchable apps: the library primary key is `uri = androidapp://<package name>`, the package name is stored in `launchTarget`, and launching jumps directly to that app by package name; it does not participate in scanning and is not included in save management or engine configuration.
_Avoid_: app shortcut, external emulator game

**External Emulator Jump**:
Handing a game over to a standalone emulator/emulator-style runtime that the user installed themselves (PPSSPP, Eden, Winlator); the main app only performs recognition, installation probing, and explicit component Intent jumps, and does not take over its saves or settings. YU-RIS takes the "directory + main exe" form and is launched through the Winlator external launch protocol (`dir_path` + relative `exe_path`, with automatic temporary mounting of an idle drive letter).
_Avoid_: external module (referring to APK engine modules), built-in engine

**Engine Web Shell (Tyranor Web Runtime)**:
The built-in Web runtime that hosts web-form games such as TyranoBuilder, WebOther, VN, and RPG Maker MV/MZ; every engine shares the same web shell version (Tyranor-2.3.4, bundled in the original reverse-engineered app).
_Avoid_: Chrome, NW.js environment

**TynMV / TynMZ**:
Engine version codenames newly introduced by TyranorNext for RPG Maker MV / MZ (TynMV-0.1/0.2, TynMZ-0.1), distinct from the web shell version bundled in the original reverse-engineered build. In the engine page dialog the reimplemented series is displayed merged as "TyranorNext-0.1/0.2", while the engine settings dropdown lists them item by item under the Tyn names.
_Avoid_: v0/v1/v2 (old numbering)

**Engine Kernel**:
The replaceable low-level runtime within the same engine family (KiriKiri family: Kirikiroid2 and krkrsdl3), selectable in engine settings.
_Avoid_: renderer, backend

**Patch Overlay**:
A virtual `patch.tjs` overlay directory generated when launching KiriKiri games to support scenarios such as Steam plugins; behavior is controlled by the "auto / force / off" mode.
_Avoid_: patch, hook

**autopatch policy**:
The decision policy for idempotently patching required files (system.ini, list_windows, movie, etc.) before launching Artemis: "ask on launch / auto / off", carried by a shared confirmation dialog; **off by default** (`ART_PATCH_DEFAULT`, to avoid being equivalent to automatic patching on paths with no dialog).
_Avoid_: auto patch, ask toggle

**Title Feedback**:
The engine host parses the game title inside the engine process and writes it into shared prefs (`<engine>_title.<pathHash>`); the main app conditionally imports it as the game title when loading the library, overwriting only when the title still equals the directory name registered before launch (i.e. not renamed by the user); both Siglus and System35 use this protocol.
_Avoid_: auto rename, metadata scraping

## Game Library

**Game Scanning (EngineScanner)**:
The process of traversing authorized directories, determining engine types, and producing scan candidates (ScanGame); the result is persisted as the game library.
_Avoid_: import, index

**Scan Candidate (ScanGame)**:
A single game record produced by one scan/load: title, directory URI, engine, launch target, plus auxiliary fields such as cover/metadata/external module alias.
_Avoid_: game entry, GameItem

**Launch Target (launchTarget)**:
The launch payload interpreted by engine semantics: an auto-detected file path / ROM filename / a directory sentinel for manually added PC games / the package name for manually added Android games; file-type entries can be manually overridden by the per-game setting "launch file" (launchFile).
_Avoid_: entry file (when confused with launchFile)

**External Module Alias (externalModuleAlias)**:
The internal identifier of a different sub-runtime under the same engine (e.g. `internal.rpgmxp`), used to resolve the concrete external module; Ren'Py is instead determined by the per-game version setting and does not write this field.
_Avoid_: module ID

**Recent Games / Quick Launch**:
Two aggregate lists on the game library home page: recently opened (shown by timestamp) and user-pinned (quickLaunch, whose count limit is constrained by a DAO constant).
_Avoid_: history, favorites

**Sort Key (GameSortKeys)**:
The shared implementation of the dual-path game title sorting: a lowercased title key + an optional 【】/[] tag key; the Room precomputed column and the UI in-memory sort share the implementation to guarantee identical results.
_Avoid_: sort method (when confused with the GAME_SORT_* enums)

**Deleted Cleanup (cleanupDeletedGame)**:
The cleanup action performed after scanning that removes game library records whose games no longer exist on disk.
_Avoid_: delete, cleanup

**Game Library Facade (GameLibraryFacade)**:
The game library integration facade split out of EngineScanner: it holds the in-memory caches and revision numbers for games/recent/quick/scan roots and provides synchronous "cache first, persistence queued" writes; EngineScanner keeps only scanning and engine recognition.
_Avoid_: Scanner cache, gallery repository (Repository refers to the persistence layer)

## Settings System

**App/Engine/Per-game Three-Level Settings**:
Settings are split into three layers by scope: app settings (AppSettingsStore, global), engine settings (EngineSettingsStore, by engine family), and per-game settings (PerGameSettingsStore, overrides by game); at launch, per-game overrides take effect before global settings.
_Avoid_: settings priority, global settings

**Effective Settings Resolution (EngineSettingsResolver / EffectiveEngineSettings)**:
The unified resolution entry point for three-level settings: the Resolver reads global and per-game overrides from the two Stores, the pure-function layer EffectiveEngineSettings applies merge rules such as whitelist/kernel fallback, and launching and saving only consume the ResolvedEngineSettings result.
_Avoid_: settings merge, override layer

**Engine Settings Kind (EngineSettingsKind)**:
The category entry points of the engine settings page (KRKR / ONS / ARTEMIS / RPG_MAKER / TYRANO / RENPY / SIGLUS / FRAMEBUFFER / FVP / XSYS35 / PPSSPP / WINLATOR), each providing parameter items specific to that engine family.
_Avoid_: engine settings tab

**Nav Style**:
The four values of the bottom navigation bar style: "Default" (Material3 navigation bar; under glass appearance styles a floating rounded glass bar, with Advanced Glass adding true sampled blur on Android 12+), "Liquid Glass · Classic" (the original small-corner square glass bar + blur), "Liquid Glass · Lens" (see below), and "Floating Button" (see below); switching is immediate in memory. On tablets/large windows the main navigation moves to the side (see "Side Rail"; the floating button and both Liquid Glass tiers do not adapt).
_Avoid_: bottom bar appearance, theme

**Appearance Style**:
The visual style choice in app settings: "Default", "Retro Glass" (formerly "Glass"), and "Advanced Glass", three tiers; both glass tiers use a dark background, translucent frosted-glass containers, and 0.5dp strokes, and disable appearance mode/tone switching (the color wheel stays available), with `AppThemeColors.appearanceStyle` / `isGlass` as the single source of truth.
_Avoid_: glass theme, Theme (when confused with nav style/appearance mode)

**Retro Glass**:
The second appearance style tier (the persisted value is still `glass`; the display name was renamed from "Glass"): a three-stop vertical black-grey gradient + a white top glow + theme-color diagonal ambient light; cards are 80% dark glass film.
_Avoid_: glass (when standing alone, refers to this tier)

**Advanced Glass**:
The third appearance style tier (persisted value `glass_advanced`): the background is a multi-pass boxed blurred backdrop (a real image blur; falls back to theme-color soft patches when there is no cover) collaged 2×3 from game covers + dimming + corner vignette; cards are light frosted film (14% white) + a "bright top, dark bottom" gradient stroke + top-edge highlight + soft shadow (`glassShadow`, the same optical combination as the floating default navigation bar); floating elements (default navigation bar, Liquid Glass bottom bar) add true backdrop sampled blur on Android 12+, while separate windows such as dialogs/drawers do not participate in sampling, and the panel base color is instead generated by `rememberAdvancedGlassPanelSurface()` as a gradient sampled from the page background (darkened toward the dark base, retaining a little color, with a scrim); the drawer gradient must be drawn on the content layer.
_Avoid_: advanced glass theme, liquid glass (exclusive to nav style)

**Side Rail**:
The side form of the main navigation on tablets/large windows (sw600dp or width ≥ 840dp), controlled by the app setting "Tablet sidebar" toggle, on by default: it takes the theme's "default navigation bar" form according to the appearance style (default = Material3 `NavigationRail`, retro/advanced glass = floating glass column); both Liquid Glass tiers do not adapt to the rail (they degrade to the theme's default form on tablets); the rail occupies layout width, `glassNavBottomInset()` returns 0, and Advanced Glass uses a separately recorded pure background layer `railBackdrop` for true sampling.
_Avoid_: navigation drawer (NavigationDrawer), sidebar (when confused with a drawer)

**Appearance**:
The light/dark/follow-system theme choice; the effective value takes `AppSettingsStore.isDarkEffective()` as the single source of truth.
_Avoid_: dark mode (refers to only one of them)

**Four-Language Support**:
The four `strings.xml` sets — English (default, `values`), Indonesian (`values-in`), Simplified Chinese (`values-zh`) and Japanese (`values-ja`) — are forced by tooling to keep identical keys (`checkHardcodedUiStrings`), and hardcoding CJK text in Kotlin sources is forbidden.
_Avoid_: multilingual, internationalization (in this project it means the enforced consistency of the supported languages)

**Engine Version Options**:
The version dropdown items in engine settings, provided as an `id → display name` list (auto + concrete versions); the navigation page/dialog share the same data source to guarantee the same order.
_Avoid_: version list (when confused with dialog items)

## Cover

**Cover Source**:
The data sources for fetching covers (VNDB / NextMoe / Hikarinagi / Bangumi / Steam / Local / Custom), with customizable order; Hikarinagi requires an OAuth Client ID, and NextMoe is anonymous with no login.
_Avoid_: image source, wallpaper source

**Cover Scraping**:
The process of fetching cover metadata for the game library in bulk or on demand (CoverScraperService + batch task manager + source aggregation), overwriting only cover fields such as coverUri/coverSource.
_Avoid_: downloading covers, cover update

**Bind Candidate**:
The action of the user choosing from candidate covers and persisting a per-game cover; VNDB candidates also carry vndbId / metadataTitle (NextMoe candidates also carry them when they hit a VNDB ref).
_Avoid_: choose cover, replace

**Cover Drill-down**:
For sources where one work has multiple covers (NextMoe), the flow of first selecting a work in the work candidate list and then picking from the available covers; sources that do not support this flow bind directly when a candidate is tapped.
_Avoid_: two-step selection, multi-image selection

**Cover Cache (CoverImageCache / CoverThumbnailLoader)**:
The memory + disk persistent cache for cover thumbnails and the concurrency-limited decoder; scroll-aware decoding with batched backfill avoids scrolling jank.
_Avoid_: image loader (a generic concept, not listed here)

## Saves and Data

**Save Location Resolution**:
The rule for resolving a game's save directory by "engine family + per-game scoped toggle + availability fallback" (GameSaveManager.resolveSaveLocation).
_Avoid_: save path

**Save Mirror**:
The backup capability that exports / imports a game's save directory as a zip (exportToZip / importFromZip), with file-count and size limit protection.
_Avoid_: backup, cloud sync

**Standard Save Format / Tyranor Save Format (RPG Maker MV/MZ)**:
The two filename forms of the same save content: the standard format (JoiPlay/PC compatible, `global|config|fileN` + `.rpgsave`/`.rmmzsave`) and the Tyranor format. For MV, the Tyranor format is the engine's deterministic hash name `key_<sha256(key)>.bin` (keys such as `RPG File3`); the legacy name `RPG FileN.bin` is still read by the engine with priority but remains compatible. For MZ, the keys are pure ASCII (`fileN`), and the engine always reads/writes `fileN.bin` and **cannot** use hash names. The content of the two is byte-identical, only the filenames differ; the hash-name key space is finite, and exports can be reverse-mapped back to standard names.
_Avoid_: save version, encoding

**Save Format Conversion (RPG Maker MV/MZ)**:
When launching MV/MZ, if a standard-format save is detected in the **save directory effective for the engine** (with independent saves off it is `<game root>/savedata`; with it on it is the app external directory, the same source as the engine host's resolveSaveDirectory; legacy `Savedata/` is also supported), the user is asked, and then a pure rename by filename mapping (no re-encoding) to the Tyranor format is performed and written back to the effective directory; if the target already exists it is skipped without overwriting, the source file is moved into `original/` in its own directory for safekeeping, and hash saves that cannot be reverse-mapped keep their original names. Implemented only at the app layer (the engine's save read/write is unchanged).
_Avoid_: transcoding, migration (migration refers only to changing the directory location), hardcoding `<game root>/savedata` (independent saves are on by default; hardcoding would make the feature fail under the default configuration)

**Save Interop**:
When enabled, MV/MZ saves are automatically synced bidirectionally between "the standard side `<content root>/save`" and "the Tyranor-side effective save directory" (determined by the independent-save toggle; detection/conversion/sync all share the same source): once before launch and once when returning to the foreground (after exit the process is force-killed after 500ms with no callback, so the foreground is used as the fallback, waiting for the session process to exit). The standard side supports both `save` / `Save` spellings (identical content in the same slot is treated as an equivalent copy; differing content moves the unselected copy into `deleted/`); importing an archive strips the outer folder wrapper. The newer one wins per slot, and equal mtimes require identical content hashes to skip; slots deleted on the Tyranor side move the corresponding standard-side file into `<standard side>/deleted/`; missing standard-side files are re-exported. An app-private sync manifest distinguishes "newly created" from "already deleted", and a corrupted manifest aborts the sync (no file changes at all). Controlled by global/per-game toggles, off by default.
_Avoid_: cloud sync, backup (different from Save Mirror)

## Input Remapping

**Input Remap**:
The unified input component under `com.core.input` in the engine module: it normalizes input sources such as the virtual pad / physical gamepad / (later) physical keyboard into a canonical key space (keyboard segment = Android keycode, 1000 segment = mouse buttons, 2000 segment = function actions), then injects them into the target engine through one `InputSink` per host. Web-family hosts are wired via `InputRemapController.installWeb`, replacing the former `__touch_pad.js` injection implementation (that asset has been deleted).
_Avoid_: touch gamepad (old name, referring to the retired JS implementation), virtual keyboard (use "virtual pad" when referring to the button layer's appearance)

**Virtual Pad**:
The native button layer overlaid on the game screen (`VirtualPadView`, a self-drawn View): it renders buttons and directional controls according to the current **pad profile**, and handles hit testing, pressed state, and edit mode (drag / scale / add or remove / rebind / show or hide); the editing UI is also native (`VirtualPadEditPanel`). Tapping the floating ball toggles visibility, and a long press enters editing.
_Avoid_: soft keyboard, IME, game's built-in buttons

**Pad Profile**:
A virtual pad layout (button list + directional control configuration), stored as `<filesDir>/input/profiles/<id>.json` and shared by in-game editing and the settings page; coordinates are normalized to the full viewport (0..1, with -0.1..1.1 allowed for out-of-bounds placement), and `size` is a ratio of the screen's short side. The profile directory is shared app-wide, so migration output from the old touch gamepad uses independent names `migrated-<game scope>-*` and writes a per-game override pointing to it for each game; `default` is a built-in profile (editable, not deletable).
_Avoid_: layout file, preset (preset is a legacy implementation term)

**Gamepad Map**:
The mapping table from the physical gamepad's 16 logical buttons (A/B/X/Y, START/SELECT, L1/R1, L2/R2, L3/R3, D-Pad four directions) and dual-stick four-direction emulation → multi-key output (may include mouse buttons), stored as `<filesDir>/input/gamepad_map.json`; stick emulation has a dead zone and hysteresis, and `autoKeep` means "hold while pressed" (pressed again to release). The host hands events to `InputRouter`, and a mapping hit is consumed.
_Avoid_: controller, JoyKey

**Input Toggles (input_pad_enabled / input_gamepad_enabled / input_profile_id)**:
The global/per-game setting keys for the virtual pad, gamepad mapping, and profile selection: global values are stored in `tyranor_prefs`, per-game overrides are stored in the same-named fields of the `game_overrides` blob (missing = follow global). "Three-place literal anchoring" applies only to these **three** keys (the 3 `KEY_*` in the engine's `InputConfigStore`, `EngineSettingsStore` / `PerGameSettingsStore`, `GameOverridePartitions`); the migration marker `input_legacy_migrated` is defined only on the app side. The virtual pad's global default is tiered by engine (when not explicitly set, on for MV/MZ, off for Tyrano/VN/WebOther), and gamepad mapping is on by default for all Web hosts. See `docs/input-remapping-and-gamepad-plan.md` for details.
_Avoid_: touch settings, button toggles

## Unpack / Pack

**Unpack / Pack (Archive Unpack / Pack)**:
A standalone tool page inside settings (`ui/archive`): it scans XP3 archives in the chosen directory, previews entries as a master/detail list, and unpacks everything into a folder named after the archive (same-name refused, no auto-rename); packing compresses the chosen directory into a sibling `.xp3` with the same name (0 = stored plaintext, 1–9 zlib level). The Rust implementation (`engine/rust`) and the Artemis launch chain's `ArtemisPfsUnpacker` (launch patches only, pure Kotlin) do not depend on each other.
_Avoid_: decompress (system archive semantics), packaging

**Archive Scanning (ArchiveScanner)**:
Recursive XP3 probing of the chosen directory tree on the unpack/pack page: determined only by the `.xp3` extension, with depth and count limits; real paths are preferred (safUriToPath), and if mapping fails it falls back to DocumentFile traversal.
_Avoid_: game scanning (EngineScanner semantics)

**Archive Staging**:
The bridging mechanism used when SAF `content://` cannot map to a real path: inputs are copied into `cacheDir/archive_staging` as an intermediary, and unpack output is written back into the directory tree; stale staging is cleared once at the top of the page.
_Avoid_: cache (generalized)

**KSD mode-2 implicit decoding**:
When unpacking small XP3 entries, the Kirikiri KSD mode-2 inner wrapper (`FE FE 02 FF FE` header) is also unwrapped, so the exported script text is directly editable; the krkrsdl3 engine's TextStream natively supports that wrapper, so unwrapping or not does not affect game execution, and there is no separate entry point.
_Avoid_: KSD unpack feature (no standalone feature exists)

## UI Conventions

**Feature Navigation Item (AppNavItem)**:
The unified "feature navigation list" component (leading icon + title/summary + right arrow); hand-assembling with Row/Column is forbidden; page item containers use NavWhite (grey base with white card), dialog items pass DialogItemSurface (contrasting with the dialog background; under glass styles it is the bright glass surface).
_Avoid_: ListItem, hand-written item

**Two-Tier Font Size Rule**:
Item body text uses bodyMedium (small size), titles use titleMedium Bold (title size); the QuickLaunchCard game name is exempt because it has a background cover and a dark scrim, and uses titleLarge Bold.
_Avoid_: arbitrary font sizes, using title for items

**Tab Bar (SlidingTabRow)**:
The unified component for horizontal single-select tab bars: the selected item is an independent background indicator that slides linearly over 200ms when switching (with synchronized width animation); there are two forms — equal width and horizontal scrolling by content width; indicator color/corner radius/stroke are dispatched inside the component by appearance style, and callers do not pass colors. Used by the engine page's glass variants and the home "Category Warehouse" category bar; new tab/category bars must reuse it.
_Avoid_: hand-written indicator, self-assembled TabRow

**Liquid Glass Navigation (LiquidGlassNavigationBar)**:
A rounded navigation form that floats above the content and samples the page content for background blur (Android 12+, recording the content layer via backdrop); it is the "Liquid Glass · Classic" tier.
_Avoid_: frosted glass, transparent navigation

**Liquid Glass · Lens**:
The third nav style tier (formerly "Liquid Glass Enhanced"): an **independent implementation** under `ui/common/glass/` with three-layer sampling + refractive lens + press-drag; the optical / motion parameters were tuned against real measurements in this project and frozen in `GlassBottomBarSpec`; the option is not offered below Android 13, and reading that value normalizes it to "Liquid Glass · Classic".
_Avoid_: Liquid Glass 2.0, enhanced glass

**Floating Button Nav**:
The fourth nav style tier (`ui/common/FloatingGlassNavButton.kt`): a draggable 64dp circular Liquid Glass main button that, on tap or long press, expands navigation items along an arc toward the inner side of the screen; shared by phones and tablets (sampling on API 31+, solid fallback on lower versions). Interaction, material, and haptic details are in AGENTS.md "Corner radius exemption (floating button navigation)".
_Avoid_: FAB navigation, floating menu

**Four Resident Pages**:
The four main interface tabs (Home / Games / Engine / Settings) are kept composed, hidden pages keep their nodes with alpha=0, and switching only animates horizontal alpha to avoid rebuilding lists.
_Avoid_: lazy page, Fragment

**Home Style**:
The three forms of the home page: "Default" (recently opened + quick launch), "Web" (built-in WebView showing the user-selected address: preset KunGal / Yiqimeng or custom), and "Category Warehouse" (a fixed horizontally scrollable category bar below the top bar: All / Quick / Recent / each engine type; the content reuses the games page's default grid, and engine categories list only engines that actually exist in the library). Switched via app settings and effective immediately; only http/https loads inside the WebView, http(s) downloads go to the system browser, and non-http(s) links in the main frame pass only whitelisted schemes (mailto/tel etc.) to the system while the rest are intercepted; the Web home page pauses JS and page media when the home page is not in the foreground or the app goes to the background, to avoid background battery drain.
_Avoid_: home page, start page

## Architecture Conventions

**Three-Layer Architecture**:
The fixed dependency direction `UI interaction layer (ui) → feature abstraction layer (core) → engine foundation layer (engine)`; core must not depend on Compose components, and engine must not care about app pages.
_Avoid_: flat packages, circular dependencies

**Unified Dialog (AppAlertDialog)**:
The component that UI dialogs are forced to use (a Material3 AlertDialog wrapper); using the native AlertDialog directly is forbidden.
_Avoid_: AlertDialog, Dialog

**Launch Contract (LaunchContract)**:
The single constant source defined by the engine module for App → engine host Intent extras keys and fixed values; the app-side EngineLauncher and the engine-side host Activity must reference it on both sides, and bare strings are forbidden.
_Avoid_: extras convention, Intent protocol

**Launch Result (LaunchResult)**:
The unified sealed result of engine launching (Success / typed Failure); core only provides the error type, localized text is mapped by the UI layer, and exceptional scenarios use the error-code-carrying GameSaveException-style protocol.
_Avoid_: error string, return-value text

**Page Host (AppScreenActivity / AppScreenScaffold)**:
The unified host for secondary pages: it centralizes theme wrapping (ProvideAppLocale → TyranorNextTheme → Surface), edge-to-edge and transparent system bars, and exit transition; the page body is provided via setAppScreenContent.
_Avoid_: BaseActivity, Scaffold shell

**FIFO Persistence Command Queue**:
Two serial queues: MainLibraryViewModel's Channel queue serializes UI-initiated game library commands (scan/delete/search etc.), avoiding disk I/O during composition and later writes overwriting earlier ones; GameLibraryRepository.writeScope's single-threaded write queue is the only serialization guarantee point for all persistent writes (including GameLibraryFacade's synchronous facade writes).
_Avoid_: thread pool, async race