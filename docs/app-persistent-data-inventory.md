# TyranorNext App Persistent Data Inventory

> Generated: 2026-08-29
> Applicable version: versionName 1.27 (main @ 0eb5b7a)
>
> This document inventories **all persistent data** in the app: storage mechanisms, exact paths, writers/readers, data formats and purposes, plus backup strategy and sensitive data notes.
> Conclusion first: the project **uses no database at all** (no Room / SQLite / DataStore / SQLCipher / Realm dependency). All persistence is implemented through the three major categories **SharedPreferences, file storage, system-managed storage**, across 6 layers.

---

## Table of Contents

1. [Overview](#i-overview)
2. [SharedPreferences (Shared Preference XML)](#ii-sharedpreferences-shared-preference-xml)
3. [Internal File Storage (filesDir / noBackupFilesDir / cacheDir)](#iii-internal-file-storage)
4. [External App-Specific Storage (Android/data)](#iv-external-app-specific-storage-androiddata)
5. [In-Place Writes Inside the Game Directory (user storage / SAF tree)](#v-in-place-writes-inside-the-game-directory)
6. [Hardcoded Shared Storage Paths (/sdcard)](#vi-hardcoded-shared-storage-paths-sdcard)
7. [System-Managed Storage (WorkManager / WebView)](#vii-system-managed-storage)
8. [Backup and Data Migration Strategy](#viii-backup-and-data-migration-strategy)
9. [Sensitive Data and Risk Points](#ix-sensitive-data-and-risk-points)
10. [Appendix: Storage Location Quick Reference](#appendix-storage-location-quick-reference)

---

## I. Overview

| Layer | Mechanism | Typical content | Main code locations |
|---|---|---|---|
| 1 | SharedPreferences XML | App settings, engine settings, game library records, OAuth tokens, per-game overrides | `app/src/main/java/com/tyranor/next/core/` |
| 2 | Internal file storage | Engine plugins, covers, fonts, save mirrors, patch overlays, SAF index | `core/cover/`, `core/game/launch/`, engine module |
| 3 | External app-specific storage | Per-engine scoped saves, online patch temp downloads, screenshot fallback directory | `EngineLauncher.kt`, `GameSaveManager.kt`, `ScreenCapture.kt` |
| 4 | In-game-directory writes | Engine default saves, patch.tjs, engine preference XML | Engine module, `ArtemisPfsUnpacker.kt` |
| 5 | Hardcoded /sdcard paths | JoiPlay RTP (including imported on-site files), screenshots (DCIM/tyranornext), RPG Maker configuration.json | `RpgMakerExternalEngineModule.kt`, `RpgMakerRuntimeEnvironment.kt`, `ScreenCapture.kt` |
| 6 | System-managed storage | WorkManager background task DB, WebView localStorage/IndexedDB | `BackgroundUpdateWorker.kt`, `TyranoActivity.kt` |

Data flow characteristics:

- **Game library master data** lives in `game_scanner.xml` (line-based records separated by `\u0001` inside Prefs), not a database; there are in-process memory caches such as `gamesCache` to speed up home page recomposition (`EngineScanner.kt:47-53`).
- **The App process and engine subprocesses** (`:kirikiri2`, `:krkrsdl3`, `:tyrano`, `:artemis*`, `:ons`) exchange settings through shared prefs files (`tyranor_prefs`, `tyranor_game_overrides`, `onsyuri`), all `MODE_PRIVATE`, with no `MODE_WORLD_*` / `MODE_MULTI_PROCESS`.
- **Save locations** are determined by the "scoped save switch": when enabled, writes go to the app-specific directory (internal or external); when disabled, writes go directly into the game directory; each game can override the global default.

---

## II. SharedPreferences (Shared Preference XML)

Physical location: `/data/data/com.tyranor.next/shared_prefs/*.xml`

### 2.1 App Module (app/src/main/java/com/tyranor/next/)

| Prefs file | Definition location | Keys / content | Format |
|---|---|---|---|
| `app_settings.xml` | `core/settings/AppSettingsStore.kt:165` (`prefs()`) | `theme_color` (#RRGGBB), `nav_style` (default/liquid_glass/liquid_glass_enhanced), legacy key `liquid_glass_enhance` (used by historical versions, migrated once and deleted on read), `language` (system/zh/ja/en), `theme_mode` (light/dark/system), `tone_switch`, `scan_depth` (1..5), `game_sort` (alpha/bracket_tag), `cover_scraper_only_missing`, `cover_scraper_source_order`, `cover_scraper_source_enabled_<source>` | Native key-value |
| `tyranor_prefs.xml` | `core/settings/EngineSettingsStore.kt` (`prefs()`, reads `EnginePrefs.APP_PREFS`); writers `EngineLauncher.kt:584`, engine process | **KR engine**: `kr_engine_version` (auto/1.3.9/1.3.4/1.2.6), `kr_engine_kernel` (auto/kirikiri2/krkrsdl3), `kr_renderer`, `kr_software_draw_thread`, `kr_software_compress_tex`, `kr_ogl_compress_tex`, `kr_mem_usage`, `kr_ogl_max_texsize`, `kr_ogl_accurate_render`, `kr_fps_limit`, `kr_vcursor_scale`, `kr_menu_handler_opa`, `kr_scoped_save_dir`, `kr_patch_overlay_mode` (auto/force/off), `kr_default_font`, `kr_force_default_font`<br>**Artemis**: `artemis_engine_version` (auto/1..5), `artemis_rotate_screen`, `artemis_auto_patch` (ask/auto/off, default off), `artemis_engine.<pathHash>`, `artemis_engine_success.<pathHash>` (engine version memory)<br>**Ren'Py**: `renpy_engine_version` (auto/8.5/7.7.1)<br>**Tyrano / RPG MV/MZ**: `tyrano_external_network`, `tyrano_scoped_save_dir`, `rpg_maker_mod_enabled`, input remapping global keys `input_pad_enabled` / `input_gamepad_enabled` / `input_profile_id` (read/written on the app side in `EngineSettingsStore.kt:96-98,834-843`; read-only literals with the same names on the engine side, `engine/.../InputConfigStore.kt:26-28,177-188`)<br>**Native plugins**: `native_plugin.<engine>.enabled/installed/version/abi/zip_sha256/installed_at/bridge_abi/expected_zip_sha256` (key names defined in `engine/.../EnginePrefs.kt:23-51`)<br>**Tyrano UI**: font / UI scale float (`TyranoActivity.kt:75,1013`) | Native key-value |
| `onsyuri.xml` | `EngineSettingsStore.kt:107,248`; engine side `OnsSettings.kt:20,116` | Single key `gameargs`: JSON string `{scopedsavedir, strechfull, ignorecutout, disablevideo, sharpness, sharpness_value, encoding(gbk/utf8/sjis)}` | JSON-in-XML |
| `tyranor_game_overrides.xml` | `core/settings/PerGameSettingsStore.kt:16` (`EnginePrefs.GAME_OVERRIDES_PREFS`); read-only on the engine side (`InputConfigStore.gameOverrideBlob`); legacy touch gamepad data is migrated once by the app side via `InputConfigStore.readLegacyTouchPad` (the former `TouchPadSaveBridge` direct read/write has been removed) | One key per game (key = game uri), value is a JSON override snapshot: KR fields (`renderer`, `software_draw_thread`, `mem_usage`, `fps_limit`, `vcursor_scale`, `menu_handler_opa`, `engine_version`, `engine_kernel`, `scoped_save_dir`, `default_font`, `force_default_font`, `patch_overlay_mode`, etc.), Artemis fields (`art_engine_version`, `art_rotate_screen`, `art_auto_patch`), `renpy_engine_version`, `rpg_maker_mod_enabled`, ONS sub-object `ons`, input remapping keys: `input_pad_enabled` / `input_gamepad_enabled` / `input_profile_id` (anchored to the literals in `engine/.../InputConfigStore.kt:26-28`) and `input_legacy_migrated` (one-time migration marker for the legacy touch gamepad; **the engine side has no such constant**, only app side reads/writes it — `PerGameSettingsStore.kt:69`, `GameOverridePartitions.kt:51`, `GameOverridePartitionsTest.kt:109-124`), legacy touchpad configuration JSON (`touch_pad_config` / `touch_pad_presets`, read only for migration). **Missing field = follow global** | JSON-in-XML |
| `game_scanner.xml` | `core/game/scan/EngineScanner.kt:37-41,235-328` | `scan_roots` (newline-separated SAF tree URIs), `scan_games` (**game library master data**, one game per line, fields separated by `\u0001`), `recent_games`, `quick_launch` (home page quick launch, at most 3) | Line-based custom text |
| `hikarinagi_auth.xml` | `core/auth/HikarinagiAuthStore.kt:15` | `access_token`, `refresh_token` (**plain text**), `expires_at` (long), `last_error`. Cleared or overwritten on logout/re-authorization | Native key-value |
| `background_update.xml` | `core/updater/UpdateNotificationManager.kt:21-23,43-94` | `last_notified_version` (already-notified update version), `notification_permission_requested` | Native key-value |

### 2.2 Engine Module (engine/src/main/)

| Prefs file | Writer/reader | Content |
|---|---|---|
| `rinne_native_plugin_overrides.xml` | `EnginePrefs.kt:11`, `NativePluginManager.kt:506` | User enable/disable overrides for bundled native plugins |
| `tyranor_game_overrides.xml` | Shared with the App (see above); legacy touch gamepad key layouts/presets (`touch_pad_config` / `touch_pad_presets`, JSON strings, keyed by gameId) are read by `InputConfigStore.readLegacyTouchPad` for the app side's one-time migration (the former `TouchPadSaveBridge` direct read/write has been removed) | |
| `tyrano_virtual_mouse.xml` | `VirtualMouseLayer.kt:44-47,346-347` | `handle_nx` / `handle_ny` float (virtual mouse handle position) |
| `tyranor_input.xml` | `InputConfigStore.kt:39-42,234-251` (read/write); reader `VirtualPadView.kt:157-166` | `fab_x` / `fab_y` float (position of the virtual pad floating action button, normalized 0..1, default 0.055 / 0.48), `pad_visible` bool (pad layer visibility, default true). Read/written by the engine side only |
| `tyranor_rpgmaker_mod_state` | `TyranoActivity.kt:849,961` | RPG Maker Mod runtime state |
| `ons_overlay.xml` | `ONScripter.java:48-49,232,259` | `visible` bool (touch overlay control key visibility) |
| `krkr_bridge_diagnostics.xml` | `bridge/NativeBridge.kt:151-155`, `KirikiroidLauncherBaseActivity.java:579` | `last_open` diagnostic string (written synchronously with `commit()`) |
| `hidapi.xml` | `org/libsdl3/app/HIDDeviceManager.java:110-131`, `org/libsdl/app/HIDDeviceManager.java:31,82` | `next_device_id` + Bluetooth HID device → integer ID mapping |
| `Cocos2dxPrefsFile.xml` | `org/cocos2dx/lib/Cocos2dxHelper.java:25,206` | Key-value API bundled with the vendored cocos2dx library |
| `tyranor_prefs.xml` / `onsyuri.xml` | Read/written by engine processes (shared with the App, see above) | Engine-side additional keys (Artemis version memory, `tyrano_external_network`, etc.) |

---

## III. Internal File Storage

Physical location: `/data/data/com.tyranor.next/` (`filesDir`, `noBackupFilesDir`, `cacheDir`)

| Path | Content | Format | Code location |
|---|---|---|---|
| `files/fonts/` | User-imported fonts (.ttf/.ttc/.otf/.otc), copied after selection via SAF | Binary font | `SettingsScreen.kt:931-940`, `PerGameSettingsScreen.kt:440` |
| `files/covers_remote/` | VNDB downloaded covers + custom covers `custom_<stableKey>.<jpg\|png\|webp\|gif>`; writes are atomic renames through a `.tmp` temp file | Image binary | `CoverSupport.kt:49,103`, `VndbCoverService.kt:69`, `GameScreen.kt:336` |
| `cache/covers_preview/` | Cover preview cache (can be cleared at any time) | Image binary | `CoverSupport.kt:105` |
| `files/engine_plugins/<kirikiroid2\|ons\|artemis>/current/arm64-v8a/*.so` + `manifest.json` | Native engine plugins extracted from APK assets (`assets/nativeplugins/<engine>.zip`); loaded via dlopen by `artemis_loader.cpp:130-143` | ELF / JSON | `NativePluginManager.kt:40-43,133-136,333-336`, `EnginePluginBootstrap.kt:20,157`, `app/build.gradle.kts:27-31,64-81` |
| `files/krkr_mirror/<safeSaveName>/savedata/` | **Kirikiri2 engine scoped save mirror** (when `kr_scoped_save_dir` is on) | Engine binary saves | `EngineLauncher.kt:463-464`, `GameSaveManager.kt:51-57` |
| `files/krkr_patch_overlay/<safeSaveName>/patch.tjs` | Generated TJS patch overlay script, injected into the engine's read path via a native open-hook (PLT hook) | TJS text | `EngineLauncher.kt:812-818` |
| `files/games/<name>-<first 16 chars of sha256>/` | KrSafMirror "shadow directory tree": constructs placeholder directories/files for SAF-only game directories so libc `stat/opendir` work normally | Placeholder files | `engine/.../bridge/KrSafMirror.kt:48-50` |
| `noBackupFilesDir/krkr_saf_index/<key>.idx` | SAF URI→path index (tab separated, with version header `krkr-saf-index-v1`); **does not participate in cloud backup** | Text | `KrSafMirror.kt:53-57` |
| `files/.preference/GlobalPreference.xml` | Kirikiri engine font preference (tinyxml2-compatible format, `.tmp` atomic write) | XML | `KirikiroidLauncherBaseActivity.java:300-304,424-467` |
| `files/input/profiles/<id>.json` | **Virtual pad layout** (buttons + direction controls; the built-in `default` can also be edited by users; the legacy touch gamepad migration output is `migrated-<scope>-*.json`). Writes are atomic replacement via "temp file + rename" (temp name `.<filename>.<pid>.<sequence>.tmp`); when rename is unavailable, falls back to a `<filename>.bak` backup-style rollback | JSON | `engine/.../InputConfigStore.kt:78-136,280-349`, `app/.../core/input/InputRemapRepository.kt` |
| `files/input/gamepad_map.json` | **Gamepad mapping table** (one global copy; 16 logical buttons + four directions for left/right sticks; missing/corrupt/over 1MB falls back to factory default) | JSON | `engine/.../InputConfigStore.kt:82,140-151`, `GamepadMap.kt` |
| `files/dump` | libgame dump output path for the native `initDump` | Binary/text | `KR2Activity.java:308` |
| `files/DroidSansFallback.ttf` | ONS fallback font released from engine assets | Binary font | `OnsLibLoader.kt:23` |
| `cache/save_zip_*` | Save import/export temp directory (deleted after use) | zip | `GameSaveManager.kt:349-354` |

### Native Side Notes

- `engine/src/main/cpp/krkr_bridge.cpp:553-600,840-907`: PLT-hooks system calls such as `open/fopen/stat/access/rename/unlink/opendir`, redirecting Kirikiri engine I/O to `krkr_mirror`, `krkr_patch_overlay`, the shadow directory tree and other paths; the `NativeBridge_write` JNI can write binary to any passed-in path (the path is decided by the Kotlin layer). The C++ layer itself does **not hardcode** data paths.
- `artemis_loader.cpp` only `dlopen`s plugins and writes no data.

---

## IV. External App-Specific Storage (Android/data)

Physical location: `/storage/emulated/0/Android/data/com.tyranor.next/files/`

| Path | Content | Engine | Code location |
|---|---|---|---|
| `save/<game directory name>/` | ONS scoped saves | ONS | `EngineLauncher.kt:261-263`, `OnsSettings.kt:55-56`, `GameSaveManager.kt:66-68` |
| `save/<safeSaveName>/savedata/` | krkrsdl3 kernel scoped saves | KRKR (krkrsdl3 kernel) | `EngineLauncher.kt:461-462`, `GameSaveManager.kt:42-49` |
| `save/tyrano/<safeSaveName>/` | Tyrano / RPG Maker MV/MZ scoped saves (`.sav` UTF-8 text/base64 or `.bin`) | Tyrano, RPG MV/MZ | `EngineLauncher.kt:667-668`, `TyranoActivity.kt:625-629,956`, `TyranoStorage.kt:9-111` |
| `Download/` | Kirikiri online patch temp download (deleted after installation completes) | KRKR | `KrkrOnlinePatchService.kt:65-83` |
| `screenshots/` | **Screenshot fallback destination** (when both MediaStore and direct writing to the public directory are unavailable): `shot-<yyyyMMdd-HHmmss-SSS>.png`; `CaptureResult.Saved.file` is the real path | Web-based (the `ACTION_SCREENSHOT` of virtual pad/gamepad mapping) | `ScreenCapture.kt:202-206,231-235` |

Unified resolution of save paths and import/export/deletion is described in `GameSaveManager.resolveSaveLocation()` (`GameSaveManager.kt:33-100`); deleting a game cleans up the corresponding scoped directory per engine, and **only touches app-specific storage, never deleting files inside the game directory** (`GameSaveManager.cleanupAppData()`, `GameSaveManager.kt:154-186`).

---

## V. In-Place Writes Inside the Game Directory

When scoped save is disabled (or per the engine's default behavior), data is written directly into the user's game directory (real path or SAF tree; for SAF, written back via `NativeBridge.writeViaSafIfPossible`):

| Path | Content | Trigger condition | Code location |
|---|---|---|---|
| `<game root>/savedata/` | Kirikiri / Tyrano / RPG MV/MZ default saves | When `kr_scoped_save_dir` / `ty_scoped` is off | `KR2Activity.java:118-130,260,498`, `GameSaveManager.kt:59-60,87-92` |
| `<game root>/save/` | ONS default saves | When ONS scoped is off | `EngineLauncher.kt:264-265`, `OnsSettings.kt:63-65` |
| `<game root>/patch.tjs` | Rewritten in place (managed block cleanup write for the patch.tjs virtual patch) | When launching a KR game | `EngineLauncher.kt:843-851` |
| `<game root>/Kirikiroid2Preference.xml` | Engine font preference (same format as `GlobalPreference.xml`) | When launching a KR game | `KirikiroidLauncherBaseActivity.java:307-311` |
| `<game root>/configuration.json` | Written/rewritten during Artemis unpacking (including `useRuby18` etc.), along with editing `system.ini` and renaming `list_windows*`→`list_android*` | Artemis auto patch | `ArtemisPfsUnpacker.kt:112-118,142,200,235,245` |
| `<game root>/default.ttf` | ONS fallback font copy | ONS launch | `ONScripter.java:431-437` |
| PFS unpack output | `*.pfs` archives unpacked and expanded into the game directory | Artemis launch | `ArtemisPfsUnpacker.kt` |

---

## VI. Hardcoded Shared Storage Paths (/sdcard)

There are two places with hardcoded writes to public storage: the RPG Maker external engine module (JoiPlay compatibility convention, including RTP and its imported on-site files), and the input remapping screenshot destination (DCIM/tyranornext, see the first row of the table below). On API 29+ screenshots go through MediaStore (no permission needed); direct-write paths and RTP rely on legacy external storage / `MANAGE_EXTERNAL_STORAGE` semantics.

| Path | Content | Code location |
|---|---|---|
| `/sdcard/DCIM/tyranornext/shot-<timestamp>.png` | **Preferred screenshot destination**: on API 29+ written via MediaStore (no permission, automatically enters the gallery); if MediaStore fails, writes directly to the same path (requires API 30+ and granted "All files access", followed by an active `MediaScannerConnection` scan); if that also fails, falls back to the app external private directory (see section IV) | `ScreenCapture.kt:198-235,246-292,331-335` |
| `/sdcard/JoiPlay/RTP/<RPGXP\|...>/app/sf.sf2` | RTP sound source (soundfont) released from assets | `RpgMakerExternalEngineModule.kt:155-163` |
| `/sdcard/JoiPlay/games/<gameId>/configuration.json` | Writes `{"useRuby18":true}`; if the game directory already has a `configuration.json`, the original file is reused | `RpgMakerExternalEngineModule.kt:172-195` |
| `/sdcard/JoiPlay/RTP/<subtype>/.import_tmp.<salt><sequence>/` | Temp directory for RTP import (**unique per import**: per-process random salt + in-process sequence number). Stale directories older than one day (`STALE_IMPORT_TEMP_AGE_MS`) are deleted on the next import/cleanup; the historical fixed name `.import_tmp` is also covered by cleanup | `RpgMakerRuntimeEnvironment.kt:63-84,241-272` |
| `/sdcard/JoiPlay/RTP/<subtype>/.import_backup` + `.importing` | Staging name and commit marker for the backup-style replacement of the old directory (same level as `app/`); this is a **cross-process crash residue** design: if the process is killed mid-replacement, the next read of the marker/backup by `rtpAppDir` / `rtpAppDirIfReady` restores the scene (the presence of `.importing` means `app` is untrustworthy and may be half-written) | `RpgMakerRuntimeEnvironment.kt:86-104,128-209,334-450` |

There are also several **path mappings** (not writes) for the `/sdcard`, `/storage/emulated/0` prefixes: `EngineLauncher.kt:220-221,535-536`, `KR2Activity.java:482-483,535-536`, `KrSafMirror.kt:162`, `NativeBridge.kt:306-318`. Supporting permissions: `requestLegacyExternalStorage="true"` + `MANAGE_EXTERNAL_STORAGE` (`AndroidManifest.xml:8,24`).

---

## VII. System-Managed Storage

### 7.1 WorkManager Internal Database

- Task name `background_update_check`, OneTime + network constraint + `ExistingWorkPolicy.KEEP` (`BackgroundUpdateWorker.kt:48-57`).
- WorkManager uses its own internal SQLite (standard behavior of androidx-work-runtime-ktx 2.11.2), and tasks **survive restarts**.
- The app manifest removes `WorkManagerInitializer` and switches to lazy initialization via `Configuration.Provider` (`TyranorNextApplication.kt:12-13`, `AndroidManifest.xml:31-40`).

### 7.2 WebView Storage (:tyrano process)

- `TyranoActivity.kt:377-390` enables `domStorageEnabled = true`, `databaseEnabled = true` → Chromium's **localStorage / IndexedDB / WebSQL** persist in the WebView profile directory.
- Game saves **do not depend** on WebView storage: via the JS bridge (`TyranoStorage`, `TyranoStorage.kt:9-111`) they write `.sav` (UTF-8 text/base64) into the save directory; RPG MV/MZ writes `.bin` via `__hook_rmmz_managers.js`.
- No direct CookieManager / WebViewDatabase calls; the app globally sets `usesCleartextTraffic="true"`.

---

## VIII. Backup and Data Migration Strategy

`app/src/main/AndroidManifest.xml`:

```xml
android:allowBackup="true"                          <!-- line 18 -->
android:dataExtractionRules="@xml/data_extraction_rules"   <!-- line 19 (API 31+) -->
android:fullBackupContent="@xml/backup_rules"       <!-- line 21 (API <31) -->
```

The two rule files (`app/src/main/res/xml/backup_rules.xml`, `data_extraction_rules.xml`) **exclude only one file**:

```xml
<exclude domain="sharedpref" path="hikarinagi_auth.xml" />
```

(`data_extraction_rules` excludes that file in both the `cloud-backup` and `device-transfer` scenarios.)

**Implication**: apart from `hikarinagi_auth.xml`, all other data — game library records (`game_scanner.xml`), all engine settings (`tyranor_prefs` etc.), per-game overrides, covers, fonts, scoped saves (internal `krkr_mirror` and external `save/`), WebView localStorage — enters cloud backup and device migration.

Exception: `noBackupFilesDir/krkr_saf_index/*.idx` naturally does not participate in backup because it is located in `noBackupFilesDir`.

> Note: SAF URI persisted permissions (the tree URIs in `scan_roots`) may become invalid after restoring a backup and require the user to re-authorize.

---

## IX. Sensitive Data and Risk Points

High-signal items when auditing data at rest:

1. **Plain-text tokens in `hikarinagi_auth.xml`**: access/refresh tokens are stored in plain text in SharedPreferences (`HikarinagiAuthStore.kt:48-56`). The project has no `security-crypto` / EncryptedSharedPreferences dependency; the only mitigation is the backup exclusion rule.
2. **Full cloud backup by default** (see section VIII): to tighten it, either add exclusions in `data_extraction_rules` for `game_scanner.xml` and other token-like data beyond `hikarinagi_auth`, or switch to `allowBackup="false"`.
3. **WebView DOM Storage enabled**: third-party Tyrano/RPG Maker web game code can write persistent localStorage; combined with `usesCleartextTraffic="true"` (loading external resources when `tyrano_external_network` is on), the supply-chain surface needs attention.
4. **Arbitrary-path write JNI in `krkr_bridge.cpp`**: `NativeBridge_write` does not restrict the target path and relies on Kotlin callers exercising self-discipline.
5. **Line-based format of `game_scanner.xml`**: fields are separated by `\u0001`; game names containing special characters depend on correct escaping — a robustness risk of a custom format (not a security risk).
6. **The external `save/` directory is deleted when the app is uninstalled** (`Android/data` semantics); user saves that were not exported will be lost; `GameSaveManager` provides a save-export zip feature as a fallback.

---

## Appendix: Storage Location Quick Reference

```text
/data/data/com.tyranor.next/
├── shared_prefs/                      # 15 prefs XML files (see section II)
│   ├── app_settings.xml               # App appearance/language/scrape settings
│   ├── tyranor_prefs.xml              # Global engine settings (shared by App + engine processes)
│   ├── onsyuri.xml                    # ONS settings (gameargs JSON)
│   ├── tyranor_game_overrides.xml     # Per-game overrides (JSON) + legacy touchpad config (kept for migration)
│   ├── game_scanner.xml               # ★ Game library master data + scan roots + recent + quick launch
│   ├── hikarinagi_auth.xml            # ★ OAuth tokens (plain text, excluded from backup)
│   ├── background_update.xml          # Update notification state
│   ├── rinne_native_plugin_overrides.xml
│   ├── tyrano_virtual_mouse.xml
│   ├── tyranor_input.xml              # Virtual pad FAB position + pad layer visibility
│   ├── tyranor_rpgmaker_mod_state(.xml)
│   ├── ons_overlay.xml
│   ├── krkr_bridge_diagnostics.xml
│   ├── hidapi.xml
│   └── Cocos2dxPrefsFile.xml
├── files/
│   ├── fonts/                         # User fonts
│   ├── covers_remote/                 # Covers
│   ├── engine_plugins/<engine>/current/arm64-v8a/  # Native plugin .so
│   ├── krkr_mirror/<game>/savedata/   # KR2 scoped save mirror
│   ├── krkr_patch_overlay/<game>/patch.tjs
│   ├── games/<game>-<hash>/           # KrSafMirror shadow tree
│   ├── input/profiles/<id>.json       # Virtual pad layouts (shared by engine+app; includes .tmp/.bak intermediate files)
│   ├── input/gamepad_map.json         # Gamepad mapping table
│   ├── .preference/GlobalPreference.xml
│   ├── dump
│   └── DroidSansFallback.ttf
├── no_backup/krkr_saf_index/<key>.idx # SAF URI index (not backed up)
└── cache/
    ├── covers_preview/                # Cover preview cache
    └── save_zip_*                     # Save import/export temp

/storage/emulated/0/Android/data/com.tyranor.next/files/
├── save/<game>/                       # ONS scoped saves
├── save/<game>/savedata/              # krkrsdl3 scoped saves
├── save/tyrano/<game>/                # Tyrano / RPG MV/MZ scoped saves
├── screenshots/                       # Screenshot fallback destination (shot-*.png)
└── Download/                          # Online patch temp downloads (deleted after use)

<game directory>/                      # User storage (when scoped is off)
├── savedata/ · save/                  # Engine default saves
├── patch.tjs                          # Rewritten in place
├── Kirikiroid2Preference.xml
└── configuration.json · system.ini · default.ttf   # Artemis/ONS rewrites

/sdcard/JoiPlay/                        # RPG Maker external engine (hardcoded)
├── RTP/<subtype>/app/sf.sf2           # Imported RTP root
├── RTP/<subtype>/.import_tmp.<salt><sequence> # Import temp directory (unique per run, cleaned only after one day)
├── RTP/<subtype>/.import_backup · .importing  # Replacement scene (crash residue, restored on next launch)
└── games/<id>/configuration.json

/sdcard/DCIM/tyranornext/               # Preferred screenshot destination (MediaStore / direct write)
└── shot-<timestamp>.png

System-managed:
├── WorkManager internal DB            # background_update_check task
└── :tyrano process WebView profile    # localStorage / IndexedDB
```