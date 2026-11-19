# External RPGM Module Configuration Wiring into Engine Settings Checklist Plan

> Source: the configuration chain of the RPG Maker external APK module (`cyou.joiplay.runtime.rpgmaker`) in the JoiPlay reverse engineering (`/Users/weiss/Desktop/decompiled/joiplay_jadx`).
> Goal: bring JoiPlay's configuration capability for the RGSS/mkxp external module into TyranorNext's existing three-level "app / engine / per-game" settings system, delivering it to the external RPGM module through the launch Intent's `settings` extra.
> Scope: `EngineType.RPGMAKER` (`rpgmxp` / `rpgmvx` / `rpgmvxace` / `mkxp-z`). RPG Maker MV/MZ continue to use the built-in Web host and are outside this plan.
>
> Implementation status: **Completed** (2026-09-12). The key set landed after verifying field-by-field against the RPGM plugin decompilation `cyou.joiplay.commons.parser.MKXPConfigurationParser` (`/Users/weiss/Desktop/decompiled/rpgm_jadx`):
> - Removed `useMiniz` / `updateCoreScript` / `animateAutotiles`, which the plugin does not parse (`animateAutotiles` is forced to true by the plugin at launch);
> - Added the keys the plugin actually parses: `verticalScreenAlign` / `fastPathEnum` / `useCJKFont`;
> - `cheats` is now sent in the `app` section (the plugin reads only from `app.cheats`);
> - `configuration.json` now tracks the effective `useRuby18` (the plugin's `loadFromFile` loads after the intent `settings`, so the file takes precedence; stale values would override user intent).

---

## 1. Background

JoiPlay's approach (see `SettingsFragment`, `utilities/v.java:123`, `SettingsFactory.java:116`):

1. Global and per-game settings share one settings page, maintaining about 20 keys under the `rpg` section;
2. At launch the whole `Settings` package is serialized to JSON and delivered to the external RPGM APK through the `settings` extra;
3. There are also peripheral configurations: RTP import/cleanup, `configuration.json` fallback (only XP needs `useRuby18`), module install status/download management.

TyranorNext's current state:

- A three-level settings framework already exists (`EngineSettingsStore` / `PerGameSettingsStore` / `EngineSettingsResolver` + `EffectiveEngineSettings` + `ResolvedEngineSettings`);
- External module registration and launch already exist (`core/engine/external/RpgMakerExternalEngineModule.kt`), but the `settings` JSON only hardcodes XP's `useRuby18` (`buildSettingsJson`, line 93);
- The `RPG_MAKER` engine settings page currently has only the 6 MV/MZ items (`SettingsScreen.kt:1018`), and the per-game page has only a block of descriptive text (`PerGameSettingsScreen.kt:399`).

---

## 2. JoiPlay Feature Inventory vs. Current State

| # | JoiPlay capability | JoiPlay implementation | TyranorNext current state | Gap |
| --- | --- | --- | --- | --- |
| 1 | Full `settings` delivery | `v.d` serializes the whole `Settings` into the Intent | Only hardcoded XP `useRuby18` (`RpgMakerExternalEngineModule.kt:93`) | Missing |
| 2 | Shared global/per-game RPG settings page | `SettingsFragment` (`rpgmSetLay`) | Three-level settings framework exists, but the RPGMAKER page has no RGSS items | UI missing |
| 3 | `useRuby18` (RGSS1 uses Ruby 1.8) | Default `true`, `libmkxp18.so` | Wired: global/per-game switch + XP defaults to true | Done |
| 4 | `useMiniz` (Java zlib replacement) | `javaZlibSwitch` | Plugin `MKXPConfigurationParser` does not parse it | Not included (verified) |
| 5 | `debug` | Default `false` | Wired global/per-game (advanced section) | Done |
| 6 | `smoothScaling` | Default `true` | Wired global/per-game | Done |
| 7 | `vsync` | Default `false` | Wired global/per-game | Done |
| 8 | `frameSkip` | Default `false` | Wired global/per-game | Done |
| 9 | `solidFonts` | Default `false` | Wired global/per-game | Done |
| 10 | `pathCache` / `prebuiltPathCache` | Default `false` / `true` | Wired global/per-game (advanced section) | Done |
| 11 | `copyText` | Default `false` | Wired global/per-game (advanced section) | Done |
| 12 | `cheats` | Default `true` | Wired; now sent as `app.cheats` per the plugin's parse location | Done |
| 13 | `customFont` | Default empty string, font file path | Wired: imported into the shared directory `/sdcard/JoiPlay/fonts` (readable by the plugin) | Done |
| 14 | `windowSize` | 9 options: 512x384...1920x1080 | Wired global/per-game | Done |
| 15 | `speedUp` | 1..9, default `1` | Wired global/per-game | Done |
| 16 | `fontScale` | 0.25..2.00, default `0.75` | Wired global/per-game | Done |
| 17 | `animateAutotiles` | Default `false` | The plugin forces true at launch and does not parse this key | Not included (verified) |
| 18 | `enablePostloadScripts` | Works with the postloadScripts extras | Wired global/per-game (advanced section) | Done |
| 19 | `updateCoreScript` | No default (enabled on demand) | Belongs to the MV/MZ Web path; the RPGM plugin does not parse it | Not included (verified) |
| 20 | Web-family keys `usePIXI6` / `useWebGL2` / `downscaleBitmaps` / `fastPathEnum` / `verticalScreenAlign` | The plugin parses `fastPathEnum` / `verticalScreenAlign`; the rest belong to MV/MZ | `fastPathEnum` (advanced section) and `verticalScreenAlign` are wired; `usePIXI6`/`useWebGL2`/`downscaleBitmaps` go through the MV/MZ entry | Done |
| 21 | RTP import/cleanup (RPGXP/RPGVX/RPGVXACE) | `i0`: InnoExtract unpacks `xp_rtp104e.exe` / zip into `/sdcard/JoiPlay/RTP/<NAME>/` | Wired: `RpgMakerRuntimeEnvironment` supports zip/directory import, cleanup and status detection | Done |
| 22 | `configuration.json` (flat `useRuby18`, XP only) | Double insurance written to the game directory / `JoiPlay/games/<id>/` | Already present and now tracks the effective `useRuby18` (the JSON file updates only that key) | Done |
| 23 | Module install status/download guidance | `runtimes.json` + RuntimeFragment | The engine settings page card already shows status and a download entry (the engine overview page keeps its original status) | Done |
| 24 | Module details `assets/html/info.html` / `license.html` | Read by the runtime details dialog | None | Optional P2, not implemented |
| 25 | Module metadata auto-discovery (`cyou.joiplay.runtime.types/version`) | `RuntimeManager.a()` scans packages + compares versions | Fixed single package name + fixed version, no candidate selection | Optional P2, not implemented |
| 26 | `preloadScripts` / `postloadScripts` (pokefix etc.) | extras generated by `essentials` | No script injection mechanism | Deferred |

Items not replicated: JoiPlay's "better runtime available" prompt only triggers in the Ren'Py branch (`v.d`); RPGM has no such logic.

---

## 3. Target Settings Model

Following the existing three-level settings chain, add an RPGM group of keys:

```text
EngineSettingsStore (global defaults)
  + PerGameSettingsStore (per-game overrides, null = follow global)
    → EffectiveEngineSettings merge
      → ResolvedEngineSettings (rpg* fields)
        → EngineLauncher.launchInternal builds ExternalEngineLaunchRequest (carrying settings)
          → RpgMakerExternalEngineModule.buildSettingsJson(settings)
            → Intent extra "settings" (nested JSON)
            → sync configuration.json (flat JSON, XP only)
```

Key modification points:

- [x] `ExternalEngineLaunchRequest` gains `resolvedSettings: ResolvedEngineSettings?` (currently it only has game/gameDirectoryPath/launchTarget; `EngineLauncher.kt:123` already obtains `settings` but does not pass it).
- [x] `RpgMakerExternalEngineModule.buildSettingsJson` changes from "hardcoded per type" to "consuming ResolvedEngineSettings", assembled with `JSONObject`.
- [x] XP compatibility rule: when `useRuby18` is not overridden, force `true`; when the user explicitly disables it, deliver `false` and sync `configuration.json`.

---

## 4. Keys and Default Values Master Table

### 4.1 Global Keys (EngineSettingsStore, proposed naming)

| Engine setting item | settings JSON key | Default (aligned with JoiPlay) | Global key name | UI control |
| --- | --- | --- | --- | --- |
| Ruby 1.8 runtime | `useRuby18` | `true` | `rpg_use_ruby18` | Switch |
| Debug mode | `debug` | `false` | `rpg_debug` | Switch (advanced section) |
| Smooth scaling | `smoothScaling` | `true` | `rpg_smooth_scaling` | Switch |
| Vertical sync | `vsync` | `false` | `rpg_vsync` | Switch |
| Frame skip | `frameSkip` | `false` | `rpg_frame_skip` | Switch |
| Solid fonts | `solidFonts` | `false` | `rpg_solid_fonts` | Switch |
| Path cache | `pathCache` | `false` | `rpg_path_cache` | Switch (advanced section) |
| Prebuilt path cache | `prebuiltPathCache` | `true` | `rpg_prebuilt_path_cache` | Switch (advanced section) |
| Fast path enumeration | `fastPathEnum` | `true` | `rpg_fast_path_enum` | Switch (advanced section) |
| Copy text | `copyText` | `false` | `rpg_copy_text` | Switch (advanced section) |
| Cheats | `cheats` (sent in the `app` section) | `true` | `rpg_cheats` | Switch (advanced section) |
| Use CJK font | `useCJKFont` | `false` | `rpg_use_cjk_font` | Switch (advanced section) |
| Custom font | `customFont` | `""` | `rpg_custom_font` | Font picker (shared-directory import) |
| Window size | `windowSize` | `640x480` | `rpg_window_size` | Dropdown (9 options) |
| Speed-up multiplier | `speedUp` | `1` | `rpg_speed_up` | Dropdown (1..9) |
| Font scale | `fontScale` | `0.75` | `rpg_font_scale` | Dropdown (0.25..2.00, step 0.25) |
| Vertical screen alignment | `verticalScreenAlign` | `top-center` | `rpg_vertical_screen_align` | Dropdown (top / top-center / center) |
| Post-load script injection | `enablePostloadScripts` | `false` | `rpg_enable_postload_scripts` | Switch (advanced section) |

Not included: `useMiniz` / `updateCoreScript` (the plugin does not parse them), `animateAutotiles` (the plugin forces true).

Value sets (aligned with JoiPlay `utilities/f.java` and the plugin's `MKXPConfiguration`):

```text
windowSize:          512x384 / 512x768 / 544x416 / 640x480 / 800x600 / 1024x768 / 1280x720 / 1280x960 / 1920x1080
speedUp:             1..9
fontScale:           0.25 / 0.50 / 0.75 / 1.00 / 1.25 / 1.50 / 1.75 / 2.00
verticalScreenAlign: top / top-center / center
```

### 4.2 Per-Game Override Keys (PerGameSettingsStore)

One-to-one with the globals, `F_` prefix; booleans via `getBool/setBool`, strings via `getStr/setStr` validated through the `toRpgMakerOverride` + `mergeRpgMaker` whitelist:

- [x] `F_RPG_USE_RUBY18`, `F_RPG_DEBUG`, `F_RPG_SMOOTH_SCALING`, `F_RPG_VSYNC`, `F_RPG_FRAME_SKIP`, `F_RPG_SOLID_FONTS`
- [x] `F_RPG_PATH_CACHE`, `F_RPG_PREBUILT_PATH_CACHE`, `F_RPG_FAST_PATH_ENUM`, `F_RPG_COPY_TEXT`, `F_RPG_CHEATS`, `F_RPG_USE_CJK_FONT`
- [x] `F_RPG_ENABLE_POSTLOAD_SCRIPTS`
- [x] `F_RPG_CUSTOM_FONT`, `F_RPG_VERTICAL_SCREEN_ALIGN`, `F_RPG_WINDOW_SIZE`, `F_RPG_SPEED_UP`, `F_RPG_FONT_SCALE`

### 4.3 JoiPlay Keys Not Included

`useMiniz`, `updateCoreScript`, `animateAutotiles` have been verified as not parsed by the RPGM plugin (see the implementation status at the top of the file);
`usePIXI6`, `useWebGL2`, `downscaleBitmaps` belong to the MV/MZ Web runtime and continue to go through the MV/MZ entry.

---

## 5. settings JSON Contract

The external module's `MKXPConfigurationParser.parse(String)` reads the nested format (values carry type wrappers), which cannot be mixed with the flat `configuration.json` format; `cheats` is read only from the `app` section:

```json
{
  "app": {
    "cheats": { "boolean": true }
  },
  "rpg": {
    "useRuby18": { "boolean": true },
    "debug": { "boolean": false },
    "smoothScaling": { "boolean": true },
    "vsync": { "boolean": false },
    "frameSkip": { "boolean": false },
    "solidFonts": { "boolean": false },
    "pathCache": { "boolean": false },
    "prebuiltPathCache": { "boolean": true },
    "fastPathEnum": { "boolean": true },
    "copyText": { "boolean": false },
    "useCJKFont": { "boolean": false },
    "enablePostloadScripts": { "boolean": false },
    "customFont": { "string": "" },
    "verticalScreenAlign": { "string": "top-center" },
    "windowSize": { "string": "640x480" },
    "speedUp": { "string": "1" },
    "fontScale": { "string": "0.75" }
  }
}
```

- [x] Build with `org.json.JSONObject`, discarding hand-written string concatenation (the current `buildSettingsJson` is a constant string).
- [x] Keep the `RPGXP` forced fallback: when the parsed result lacks `useRuby18`, deliver `true`.
- [x] `configuration.json` (flat, XP only) tracks the toggle: `{"useRuby18":true|false}`; an existing JSON file updates only that key (preserving the user's other keys); non-JSON files are not overwritten.
- [x] Unit tests cover the JSON structure (field names, type wrappers, XP default, explicit disable not falling back).

---

## 6. Engine Settings UI Checklist

### 6.1 Global Engine Settings Page (`SettingsScreen.kt`'s `EngineSettingsKind.RPG_MAKER`)

- [x] Split into two cards:
  - "RPG Maker MV/MZ" (keep the current state: external resources, scoped saves, trainer, legacy renderer, MV/MZ version)
  - "RPG Maker RGSS external module" (new `RpgMakerSettingsCard.kt`)
- [x] Module status row: show `RpgMakerExternalEngineModule` install status (reusing `ExternalEngineLauncher.isPackageInstalled`), with a download entry when not installed.
- [x] Rendering/performance section: `smoothScaling`, `vsync`, `frameSkip`, `solidFonts`; `pathCache`, `prebuiltPathCache`, `fastPathEnum` go into the advanced section.
- [x] Compatibility section: `useRuby18` (on by default).
- [x] Display section: `windowSize`, `speedUp`, `fontScale`, `verticalScreenAlign`, `customFont`; `copyText`, `cheats`, `useCJKFont`, `debug`, `enablePostloadScripts` go into the advanced section.
- [x] RTP management section: status for the three RTP types + import/cleanup entries (see section 7).
- [x] "Restore defaults" entry (aligned with JoiPlay `resetSettingsButton`), resetting only the rpg section.
- [x] Advanced items collapsed by default, so the settings page does not lay out 18 rows at once.

### 6.2 Per-Game Settings Page (`PerGameSettingsScreen.kt`'s `EngineType.RPGMAKER` branch)

- [x] Add override rows below the existing description text, with unified semantics "not overridden = follow global":
  - `OverrideSwitch`: useRuby18, debug, smoothScaling, vsync, frameSkip, solidFonts, pathCache, prebuiltPathCache, fastPathEnum, copyText, cheats, useCJKFont, enablePostloadScripts;
  - `OverrideChoice`: windowSize, speedUp, fontScale, verticalScreenAlign;
  - `customFont` uses a `FontPreference` three-state (follow global / default font / choose file).
- [x] After selecting `customFont`, backfill the file name summary; the import lands in the shared directory so the external plugin can read it.
- [x] Three-language strings: added in sync across zh/ja/en `strings.xml`, `tools/check-hardcoded-ui-strings.py` passes.

### 6.3 String Keys

50 `engine_settings_rpgm_*` keys were actually added (including group titles, RTP status/actions, restore defaults), with identical key sets across the three `strings.xml` files.

---

## 7. RTP Management Checklist

JoiPlay provides import and cleanup for the three RTP types RPGXP/RPGVX/RPGVXACE; TyranorNext currently only has a directory/`sf.sf2` fallback; `core/engine/external/RpgMakerRuntimeEnvironment.kt` has now been implemented.

- [x] Status detection: whether `/sdcard/JoiPlay/RTP/<RPGXP|RPGVX|RPGVXACE>/app` exists and is non-empty.
- [x] Import entry (global settings): SAF pick the RTP zip/directory → unpack into the corresponding directory; tolerate an extra root level inside official packages (auto-flatten); `.exe` is not supported for now, the UI prompt tells users to obtain the zip/directory from the official site and links the source.
- [x] Cleanup entry: after a second confirmation, delete the corresponding RTP directory (limited to the `app` level, to avoid accidentally deleting user directories).
- [x] The `mkxp-z` subtype reuses the existing `mkxp-z` RTP directory name and gets no separate UI.
- [x] Import/cleanup failures only show a Toast and do not block the launch path (consistent with the non-fatal strategy of `ensureRtpEnvironment`).

---

## 8. Module Version/Discovery (optional P2)

- [ ] `RpgMakerExternalEngineModule` details dialog shows the installed version (`PackageInfo.versionName`) against `external_rpgm_module_name`.
- [ ] To support multiple candidate modules/versions, introduce JoiPlay-style metadata scanning (`cyou.joiplay.runtime.types` / `cyou.joiplay.runtime.version`) with version comparison; the current single package name + fixed version can defer this.
- [ ] Reading `assets/html/info.html` / `license.html` details is optional; hide when the resource is absent.

---

## 9. Phased Implementation Checklist

### Phase 0: Settings model and delivery protocol

- [x] `EngineSettingsStore.kt`: add the section 4.1 global keys, `getter/setter`, defaults, whitelist sets, `resetRpgMaker`.
- [x] `PerGameSettingsStore.kt`: add the section 4.2 override keys and `toRpgMakerOverride`.
- [x] `EffectiveEngineSettings.kt`: add the `RpgMakerOverride` data class and `mergeRpgMaker(global, override)` (style aligned with `mergeOns`).
- [x] `EngineSettingsResolver.kt`: `resolve()` produces the `rpg` field and adds it to `ResolvedEngineSettings`.
- [x] `ExternalEngineLaunchRequest.kt`: add `resolvedSettings: ResolvedEngineSettings? = null`.
- [x] `EngineLauncher.kt`: carry `settings` when building the request.
- [x] `RpgMakerExternalEngineModule.kt`: `buildSettingsJson` now consumes `resolvedSettings` and assembles with `JSONObject`; `syncGameConfiguration` tracks the effective `useRuby18` value.
- [x] Pure JVM unit tests: merge rules, JSON structure, XP default fallback.

### Phase 1: Global engine settings UI

- [x] `SettingsScreen.kt` RPG_MAKER branch card split + `RpgMakerSettingsCard.kt` RGSS card and all controls.
- [x] `EngineSettingsText.kt`: add `rpgWindowSizeOptions()` / `rpgSpeedUpOptions()` / `rpgFontScaleOptions()` / `rpgVerticalAlignOptions()` and the three-language mapping functions.
- [x] `customFont` selection: add shared-directory import `RpgMakerRuntimeEnvironment.importCustomFont` (the app's private directory is unreadable to the external plugin, so `FontImport` is not reused).
- [x] RTP status/import/cleanup entries.
- [x] Restore defaults action (`resetRpgMaker` semantics, local state reset + top-bar save persists to disk).

### Phase 2: Per-game override UI

- [x] `PerGameSettingsScreen.kt` RPGMAKER branch adds 18 override rows.
- [x] Override save/clear logic wired into the existing `save()` flow (null deletes the override key).

### Phase 3: Strings and tests

- [x] Sync of all three `strings.xml` files (zh/ja/en).
- [x] `tools/check-hardcoded-ui-strings.py` passes.
- [ ] On-device acceptance (see section 10; requires a device plus the RPGM plugin/samples, pending).

### Phase 4 (optional): Module version/details

- [ ] Version display and enhanced download guidance.
- [ ] Metadata scanning and multiple candidates (deferred; schedule after confirming the need).

---

## 10. Test and Acceptance Checklist

### 10.1 Unit tests

- [x] `EffectiveEngineSettingsTest#mergeRpgMaker*`: per-game override precedence, null following global, invalid string fallback, explicit empty-string font.
- [x] `RpgMakerExternalEngineModuleTest`:
  - XP not overridden → `useRuby18=true`;
  - XP explicitly disabled → `false`;
  - non-XP subtypes do not force useRuby18;
  - all boolean/string key names and type wrappers correct; `app.cheats` in the correct location.
- [x] `RpgMakerSettingsKeysTest`: override key constants, defaults, whitelist normalization, `toRpgMakerOverride` parsing.
- [ ] `configuration.json` file writing/updating is a private method (depends on `Environment`), covered by on-device acceptance.

### 10.2 Build verification

```bash
git diff --check
./gradlew testDebugUnitTest --no-daemon
./gradlew assembleDebug --no-daemon
python3 tools/check-hardcoded-ui-strings.py
```

All of the above commands passed before the implementation commit (`:app:testDebugUnitTest`, `:app:assembleDebug`, hardcoded UI string check).

### 10.3 On-device acceptance

1. RPGM module not installed: the engine settings page shows not-installed and a download entry.
2. After installing the module: the settings page shows installed; changing any toggle and re-entering the page preserves the value.
3. XP sample: launches with the default `useRuby18=true`; after disabling globally it no longer loads the 1.8 runtime (verify `configuration.json` is synced to `false`).
4. Per-game override: disable `useRuby18` for a single game only; other games still follow global.
5. Changes to `windowSize` / `speedUp` / `fontScale` / `customFont` produce perceivable plugin behavior changes.
6. After RTP import the game no longer reports missing files; after cleanup the status reverts.
7. Deleting the `settings.json` override reverts to global (the three-level semantics are correct).

---

## 11. Risks and Decision Points

| Risk | Description | Mitigation |
| --- | --- | --- |
| Actual plugin-parsed keys unproven | Each key was verified against the `MKXPConfigurationParser` decompiled from `rpgm_jadx`: `useMiniz` / `updateCoreScript` / `animateAutotiles` are not parsed and were removed, while `verticalScreenAlign` / `fastPathEnum` / `useCJKFont` were added | Resolved; re-verify the parser after future plugin upgrades |
| JSON structure inconsistency | Mixing nested `{"boolean": ...}` with flat `configuration.json` fails silently | Builder unit tests + `configuration.json` same-value linkage |
| XP default fallback accidentally disabled | After disabling `useRuby18`, RGSS1 scripts may throw syntax errors | Default `true`; `configuration.json` synced to the effective value |
| Too many setting items | Settings page bloat, high per-game override cost | Advanced items collapsed by default, cards partitioned |
| Hand-written JSON concatenation | The current constant concatenation is unmaintainable | Unified `JSONObject` + unit tests |
| RTP import source and format | `.exe` requires InnoExtract capability, not supported this round | zip/directory import + flattening a single root level; prompt for official sources |

---

## 12. Completion Criteria

- [x] The `RPG_MAKER` global settings page contains the complete RGSS external module options and RTP management.
- [x] Every option can be overridden on the per-game page, following "null = follow global".
- [x] The `settings` extra is delivered per the nested protocol, and `configuration.json` is synced only under XP.
- [x] Three languages consistent, unit tests pass, `assembleDebug` passes.
- [x] No changes to the existing MV/MZ settings entry or the external module install status chain.
- [ ] On-device acceptance (section 10.3) pending device connection.