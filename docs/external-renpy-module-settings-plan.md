# External Ren'Py Module Configuration Wiring into Engine Settings Checklist Plan

> Source: reverse engineering of JoiPlay (main app `/Users/weiss/Desktop/decompiled/joiplay_jadx` + RenPy plugin `renpy_out` 8.5.0-1.01.00).
> Goal: bring JoiPlay's configuration capability for the Ren'Py external module (`cyou.joiplay.runtime.renpy.*`) into TyranorNext's existing three-level "app / engine / per-game" settings system, delivering it to the plugin through the launch Intent's `settings` extra and an optional `configuration.json`.
> Scope: `EngineType.RENPY` (Ren'Py 8.5 / 7.7.1 external module). Excludes the plugin-internal renpy runtime self-update, save redirection (`JOIPLAY_SAVEDIR`) and game menu injection scripts (xde/xun).
>
> Implementation status: **Completed** (phases 0-3; P2 screenTimeout not implemented). Key landing points:
> - The `settings` extra delivers `app.cheats` + 8 `renpy_*` keys (`RenPyRuntimeModule.buildSettingsJson`);
> - Global `RenPySettingsCard` + 9 per-game overrides;
> - `configuration.json` strategy A: when a configuration file the plugin would read exists, sync the managed keys (`RenPyRuntimeEnvironment`);
> - `dont_use_gl2` adopts JoiPlay's inverted semantics; the per-game description text is calibrated to "follows global by default, can be overridden individually".

---

## 1. Background

JoiPlay configures the Ren'Py module through two channels (plugin `RenPyConfigurationParser`):

1. **Intent `settings` (nested)**: a whole Settings JSON package, of which the plugin reads only the `app` and `renpy` sections;
2. **`configuration.json` (flat)**: read by the plugin's `loadConfig()` **after** Intent parsing, overriding Intent values on the same key.

The settings content is 8 `renpy_*` booleans + `app.cheats` (+ `app.screenTimeout`). The version is not in settings; it is determined by "game type + script_version", which selects the external package (`r0.d`).

TyranorNext's current state:

- The version chain is complete: `RenPyVersionDetector` (`script_version.txt/rpy` + `lib/pythonlib2.7` → 7.7.1/8.5), `ExternalEngineModuleRegistry.resolveRenpyModule` (explicit version > detection > default 8.5), global/per-game version dropdowns;
- `RenPyExternalEngineModule.buildLaunchIntent` hardcodes `settings = "{}"` (`RenPyExternalEngineModule.kt:29`);
- No `configuration.json` read/write, no 8 runtime settings, no `cheats`;
- The engine screen already has module install status/download entry; launch already passes `orientation=6` (Rinne reference; JoiPlay does not pass it, keep the status quo).

---

## 2. JoiPlay Feature Inventory vs. Current State

| # | JoiPlay capability | JoiPlay implementation | TyranorNext current state (implemented) |
| --- | --- | --- | --- |
| 1 | `settings` delivers the 8 items in the `renpy` section | `RenPyConfigurationParser.parse` (smali:281-462) | `RenPyRuntimeModule.buildSettingsJson`, empty values fall back to the default model |
| 2 | `app.cheats` cheats | `app.cheats` → `JoiPad.cheats()` (PythonSDLActivity:1965) | `renpy_cheats` (global/per-game), JSON sends `app.cheats` |
| 3 | `renpy_hw_video` | env `JOIPLAY_HW_VIDEO` | Wired |
| 4 | `renpy_autosave` | env `JOIPLAY_AUTOSAVE` | Wired |
| 5 | `renpy_phonesmallvariant` | env `JOIPLAY_VARIANT_PHONE` | Wired |
| 6 | `renpy_vsync` | env `RENPY_GL_VSYNC` | Wired |
| 7 | `renpy_less_memory` | env `RENPY_LESS_MEMORY` | Wired |
| 8 | `renpy_less_updates` | env `RENPY_LESS_UPDATES` | Wired |
| 9 | `renpy_dont_use_gl2` | env `RENPY_DONT_USE_GL2` | Wired (inverted in UI) |
| 10 | `renpy_recompile` | env `RENPY_RECOMPILE` | Wired (advanced section) |
| 11 | 9 toggles on the global settings page | `SettingsFragment` + `w0.java` (including inverted `dont_use_gl2`) | `RenPySettingsCard.kt` (grouped + advanced collapsed) |
| 12 | 9 per-game overrides | Game menu Options (`f0.java:408`, `app.cheats` + 8) | 9 per-game OverrideSwitch rows |
| 13 | `configuration.json` flat override | Path `<game.folder>` or `/sdcard/JoiPlay/games/<id>/`; loaded after the Intent, file takes precedence | `RenPyRuntimeEnvironment` strategy A syncs managed keys |
| 14 | Automatic version selection | `r0.d`: script_version → smallest available `supportedVersion`; type contains 7/legacy → <80000 | `RenPyVersionDetector` + version whitelist (equivalent effect, simplified mechanism), already present |
| 15 | `runtime_better_available` prompt | Ren'Py only; dialog when the directory version beats the installed one | Not implemented (optional) |
| 16 | Module install status/download | `runtimes.json` + RuntimeFragment | Already in `EngineScreen` |
| 17 | Permission gate | Plugin `PermissionActivity` handles all file permissions itself | Plugin self-managed |
| 18 | `RENPY_PATCHPATH` / `renpy/common` copy / `zj.rpy` | Plugin-internal runtime preparation | Not included (plugin-managed) |
| 19 | Main app injects `xde.rpy` (RPA unpacking) / `xun*.rpy` (rpyc decompilation) | Game menu tools | Not included (game tools) |
| 20 | `app.screenTimeout` auto-close | Global settings → `AutoCloseTimer` (also read by the RPGM plugin) | Not implemented (P2, app-level, planned separately) |

Items not replicated: the `runtime_better_available` dialog (TyranorNext substitutes an explicit version setting); `orientation` (JoiPlay does not pass it; TyranorNext keeps passing 6).

---

## 3. Target Settings Model

Following the three-level chain already landed for RPGM, add a Ren'Py group of keys:

```text
EngineSettingsStore (global defaults, including the existing renpy_engine_version)
  + PerGameSettingsStore (per-game overrides, null = follow global)
    → EffectiveEngineSettings.mergeRenPy
      → ResolvedEngineSettings.renpy
        → EngineLauncher.launchInternal builds ExternalEngineLaunchRequest(resolvedSettings)
          → RenPyRuntimeModule.buildLaunchIntent
            → Intent extra "settings" (nested app + renpy JSON)
            → optional sync of configuration.json (flat JSON, read with plugin precedence)
```

Key modification points:

- [x] `RenPyRuntimeModule.buildLaunchIntent` consumes `request.resolvedSettings?.renpy`, replacing the hardcoded `"{}"`; empty values fall back to the default model (without breaking existing launches that have no settings).
- [x] `ExternalEngineLaunchRequest.resolvedSettings` already exists (added in the RPGM phase), no change needed.
- [x] The version is still determined by the existing `renpyVersion` / `detectedRenpyVersion` / `resolveRenpyModule`, and **does not go into the settings JSON**.
- [x] `cheats` and `screenTimeout` belong protocol-wise in the `app` section, not the `renpy` section.

---

## 4. Keys and Default Values Master Table

### 4.1 Engine Settings Items (settings JSON keys)

| Setting item | JSON location | JSON key | Default (aligned with JoiPlay) | Global key name | UI control |
| --- | --- | --- | --- | --- | --- |
| Cheats | `app` | `cheats` | `true` | `renpy_cheats` | Switch |
| Hardware video decoding | `renpy` | `renpy_hw_video` | `true` | `renpy_hw_video` | Switch |
| Auto-save | `renpy` | `renpy_autosave` | `false` | `renpy_autosave` | Switch |
| Phone variant | `renpy` | `renpy_phonesmallvariant` | `false` | `renpy_phonesmallvariant` | Switch |
| Vertical sync | `renpy` | `renpy_vsync` | `false` | `renpy_vsync` | Switch |
| Low memory mode | `renpy` | `renpy_less_memory` | `false` | `renpy_less_memory` | Switch |
| Fewer update checks | `renpy` | `renpy_less_updates` | `false` | `renpy_less_updates` | Switch |
| Disable GL2 rendering | `renpy` | `renpy_dont_use_gl2` | `false` | `renpy_dont_use_gl2` | Switch (inverted in UI, see §8) |
| Recompile scripts | `renpy` | `renpy_recompile` | `false` | `renpy_recompile` | Switch (advanced section) |
| Auto-close (minutes) | `app` | `screenTimeout` | `0` (off) | App-level, P2 | Dropdown (0/15/30/45/60) |

Default sources: `SettingsFactory.java:112-115` (the `renpy` section defaults) + the plugin's `RenPyConfiguration` model; `cheats` defaults to `true`, consistent with the RPGM side.

### 4.2 Per-Game Override Keys (PerGameSettingsStore)

One-to-one with the globals, `F_` prefix, null = follow global:

- [x] `F_RENPY_CHEATS`, `F_RENPY_HW_VIDEO`, `F_RENPY_AUTOSAVE`, `F_RENPY_PHONE_SMALL_VARIANT`
- [x] `F_RENPY_VSYNC`, `F_RENPY_LESS_MEMORY`, `F_RENPY_LESS_UPDATES`, `F_RENPY_DONT_USE_GL2`, `F_RENPY_RECOMPILE`

### 4.3 Items Not Included

- The version number itself (already covered by `F_RENPY_VERSION` / `KEY_RENPY_ENGINE_VERSION`, and it is not a plugin configuration item);
- `RENPY_PATCHPATH`, `JOIPLAY_SAVEDIR`, `ANDROID_EXTRAS`, `lib/pythonlib2.7` detection (handled by the plugin/detection chain);
- xde/xun injection scripts (these are game menu tools).

---

## 5. settings JSON Contract

The plugin's `RenPyConfigurationParser.parse(String)` reads the nested format (kotlinx `PrimitiveData` wrappers):

```json
{
  "app": {
    "cheats": { "boolean": true },
    "screenTimeout": { "int": 0 }
  },
  "renpy": {
    "renpy_hw_video": { "boolean": true },
    "renpy_autosave": { "boolean": false },
    "renpy_phonesmallvariant": { "boolean": false },
    "renpy_vsync": { "boolean": false },
    "renpy_less_memory": { "boolean": false },
    "renpy_less_updates": { "boolean": false },
    "renpy_dont_use_gl2": { "boolean": false },
    "renpy_recompile": { "boolean": false }
  }
}
```

- [x] Build with `org.json.JSONObject` (aligned with `RpgMakerExternalEngineModule.buildSettingsJson`).
- [x] Send the full set (no "changed keys only" optimization), ensuring behavior matches JoiPlay and the plugin never sees missing keys.
- [x] While `screenTimeout` is unimplemented, do not send that key (the plugin keeps the default 0).
- [x] Unit tests cover: correct wrapper types, `cheats` in the `app` section, empty settings falling back to defaults.

---

## 6. configuration.json Contract

Plugin read path (`PythonSDLActivity.loadConfig`, smali:478-590):

```text
game.folder starts with /sdcard (ExternalStorageDirectory)
  → <game.folder>/configuration.json
otherwise
  → /sdcard/JoiPlay/games/<game.id>/configuration.json
```

Load order: `parse(settings)` → `loadFromFile(configuration.json)`; **when the file exists it overrides the Intent on the same key**, and the file is flat format:

```json
{
  "screenTimeout": 0,
  "cheats": true,
  "renpy_hw_video": true,
  "renpy_autosave": false,
  "renpy_phonesmallvariant": false,
  "renpy_vsync": false,
  "renpy_less_memory": false,
  "renpy_less_updates": false,
  "renpy_dont_use_gl2": false,
  "renpy_recompile": false
}
```

Handling strategy (to be decided; A recommended):

- [x] A (adopted, consistent with RPGM `syncGameConfiguration`): when the file exists and is valid JSON, update only the managed keys above to the effective values; do not create the file when missing (preserving JoiPlay behavior); skip non-JSON files and log.
- [ ] B (not adopted): leave `configuration.json` completely untouched and only flag the risk in the docs that "an existing file will override app settings".
- [x] `game.id` keeps the existing `Integer.toHexString(folder.hashCode())` (consistent with RPGM `gameIdFor`), keeping the path contract identical across both modules.

---

## 7. Plugin-Side Consumption Mapping (acceptance reference)

| settings key | Plugin behavior |
| --- | --- |
| `app.cheats` | `JoiPad.cheats(enabled)` |
| `app.screenTimeout` | When `>0`, create an `AutoCloseTimer` (auto-close after N minutes) |
| `renpy_hw_video` | `JOIPLAY_HW_VIDEO=1/0` |
| `renpy_autosave` | `JOIPLAY_AUTOSAVE=1/0` |
| `renpy_phonesmallvariant` | `JOIPLAY_VARIANT_PHONE=1/0` |
| `renpy_vsync` | `RENPY_GL_VSYNC=1/0` |
| `renpy_less_memory` | Set `RENPY_LESS_MEMORY=1` only when true |
| `renpy_less_updates` | Set `RENPY_LESS_UPDATES=1` only when true |
| `renpy_dont_use_gl2` | Set `RENPY_DONT_USE_GL2=1` only when true |
| `renpy_recompile` | Set `RENPY_RECOMPILE=1` only when true |

---

## 8. Engine Settings UI Checklist

### 8.1 Global Engine Settings Page (`SettingsScreen.kt`'s `EngineSettingsKind.RENPY`)

- [x] Keep the existing version dropdown at the top;
- [x] Add a "Ren'Py Module Settings" card with groups:
  - Compatibility/performance: `renpy_hw_video`, `renpy_vsync`, `renpy_less_memory`, `renpy_dont_use_gl2`, `renpy_phonesmallvariant`;
  - Saves/updates: `renpy_autosave`, `renpy_less_updates`;
  - Advanced (collapsed by default): `renpy_recompile`, `cheats`;
- [x] `renpy_dont_use_gl2` inverted semantics match JoiPlay: toggle label "Disable model rendering (GL2)", `checked = !dontUseGl2`;
- [x] Module install status row and download entry (decided not to duplicate inside the card; the engine overview page already has it);
- [x] Recommend extracting the Ren'Py card into its own file `ui/settings/RenPySettingsCard.kt` (symmetric with `RpgMakerSettingsCard.kt`), with `SettingsScreen.kt` only mounting it.

### 8.2 Per-Game Settings Page (`PerGameSettingsScreen.kt`'s `EngineType.RENPY` branch)

- [x] Keep the version `OverrideChoice`;
- [x] Add 9 `OverrideSwitch` rows (including cheats), with "null = follow global" semantics;
- [x] Change the description text to "each item follows global by default and can be overridden individually" (the current text needs calibration in sync).

### 8.3 String Keys (three languages in sync)

```text
engine_settings_renpy_card                 Ren'Py module settings
engine_settings_renpy_hw_video             Hardware video decoding
engine_settings_renpy_autosave             Auto-save
engine_settings_renpy_phone_small_variant  Phone variant
engine_settings_renpy_vsync                Vertical sync
engine_settings_renpy_less_memory          Low memory mode
engine_settings_renpy_less_updates         Fewer update checks
engine_settings_renpy_dont_use_gl2         Disable model rendering (GL2)
engine_settings_renpy_recompile            Recompile scripts
engine_settings_renpy_cheats               Cheats
engine_settings_renpy_advanced             Advanced settings
```

`tools/check-hardcoded-ui-strings.py` must pass.

---

## 9. Phased Implementation Checklist

### Phase 0: Settings model and delivery protocol

- [x] `EngineSettingsStore.kt`: add the `RenPy` data class (9 booleans) + `KEY_RENPY_*` global keys + `loadRenPy/saveRenPy/resetRenPy`; coexist with the existing `getRenpyVersion`.
- [x] `PerGameSettingsStore.kt`: add 9 `F_RENPY_*` override keys + `toRenPyOverride`.
- [x] `EffectiveEngineSettings.kt`: add `RenPyOverride` + `mergeRenPy(global, override)` (style aligned with `mergeRpgMaker`).
- [x] `EngineSettingsResolver.kt`: produce `ResolvedEngineSettings.renpy`.
- [x] `GameOverridePartitions.kt`: explicitly classify the 9 `F_RENPY_*` keys into the renpy partition (extending the existing `RENPY_KEYS`), and add contract tests.
- [x] `RenPyRuntimeModule.buildLaunchIntent`: `settings = buildSettingsJson(resolvedSettings?.renpy)`, assembling `app` + `renpy` with `JSONObject`.
- [x] Add `RenPyRuntimeEnvironment.kt` (or a module-private method): conditional sync of `configuration.json` (strategy A).
- [x] Pure JVM unit tests: merge rules, JSON wrapping/placement, empty settings fallback.

### Phase 1: Global UI

- [x] `ui/settings/RenPySettingsCard.kt` adds the card and grouping/inversion logic.
- [x] `SettingsScreen.kt` RENPY branch mounts the card, state wired into `saveAll()`.
- [x] Module install status prompt (decided not to do it; the engine overview page already has the entry, avoiding duplication).

### Phase 2: Per-game UI

- [x] `PerGameSettingsScreen.kt` RENPY branch adds 9 override rows; calibrate the top description text.
- [x] `save()` wired to write overrides to disk (null deletes the key).

### Phase 3: Strings and tests

- [x] Add the new keys in sync across zh/ja/en `strings.xml`.
- [x] `check-hardcoded-ui-strings.py` passes.
- [x] Unit tests + build verification (see §10).

### Phase 4 (optional P2): App-level screenTimeout

- [ ] `AppSettingsStore` adds `app_screen_timeout_minutes` (default 0).
- [ ] Both Ren'Py's and RPGM's `buildSettingsJson` deliver it at `app.screenTimeout` (`{"int": N}`).
- [ ] "Screen timeout" entry on the global settings page (aligned with JoiPlay global settings).
- [ ] Extract into a separate small plan so it does not block the first four phases.

---

## 10. Test and Acceptance Checklist

### 10.1 Unit tests

- [x] `RenPySettingsKeysTest`: defaults (hw_video=true, others false, cheats=true), whitelist/key-name contract.
- [x] `EffectiveEngineSettingsTest#mergeRenPy*`: override precedence, null following global, per-field merging.
- [x] `RenPyExternalEngineModuleTest` extension:
  - `settings` JSON contains `app.cheats` and the 8 `renpy_*` wrappers;
  - with `resolvedSettings=null`, falls back to defaults and still emits complete JSON;
  - existing game JSON / action / version selection cases keep passing.
- [x] `GameOverridePartitionsTest`: `F_RENPY_*` classified into the renpy partition and reassemblable.
- [x] `RenPyRuntimeEnvironmentTest`: managed key overrides, unknown keys preserved, missing files skipped.
- [x] `RenPyVersionDetectorTest` keeps passing (this plan does not change the version chain).

### 10.2 Build verification

```bash
git diff --check
./gradlew testDebugUnitTest --no-daemon
./gradlew assembleDebug --no-daemon
python3 tools/check-hardcoded-ui-strings.py
```

### 10.3 On-device acceptance

1. Module not installed: the engine page's Ren'Py row shows not-installed and a download entry (regression of the current state).
2. Install the 8.5 module: turn off `renpy_autosave` globally and enable `renpy_less_memory`; after launch the logs/behavior should reflect it (`JOIPLAY_AUTOSAVE=0`).
3. Per-game override: disable `renpy_hw_video` for a single game only; other games follow global.
4. The `renpy_dont_use_gl2` inverted UI matches the delivered value (on = no GL2 disable sent).
5. With `cheats` disabled, the plugin's JoiPad cheats panel is not enabled.
6. Pre-place a `configuration.json` (with conflicting values) then launch; verify that under strategy A the managed keys are synced to the app's effective values.
7. Version chain regression: `auto` detection of 7.7.1/8.5 and explicit selection still route to the correct package.

---

## 11. Risks and Decision Points

| Risk/decision | Description | Recommendation |
| --- | --- | --- |
| Ownership of `cheats` | In JoiPlay it is app-level `app.cheats`; TyranorNext RPGM landed it as engine-level `rpg_cheats` | This plan follows the latter with `renpy_cheats` (JSON still sends `app.cheats`); migrate later if app-level unification is done |
| `configuration.json` strategy | The plugin file takes precedence over the Intent; ignoring it silently overrides app settings | Adopt strategy A: sync managed keys only when it exists; do not create it when missing |
| `dont_use_gl2` semantics are error-prone | JoiPlay's UI is inverted; a mistaken implementation reverses it | UI label says "Disable", `checked=!dontUseGl2`, locked by unit tests |
| 7.7.1 module action/manifest | TyranorNext always sends `cyou.joiplay.runtime.renpy.run`; the official 7.7.1 package needs the same action | Before implementing, verify the 7.7.1 APK's intent-filter with aapt2; on mismatch, override the action in `RenPy77ExternalEngineModule` |
| Full vs. incremental delivery | Full delivery avoids inconsistent plugin defaults for missing keys | Full delivery + default model fallback |
| Must not affect version selection | Settings and version selection are two separate chains | Do not change `RenPyVersionDetector`/`resolveRenpyModule`; regression tests |

---

## 12. Completion Criteria

- [x] The `settings` extra delivers `app.cheats` + 8 `renpy_*` per the nested protocol; empty settings fall back to defaults.
- [x] The Ren'Py global settings page has the version + 9 toggles (advanced group, correct GL2 inversion).
- [x] Every item can be overridden on the per-game page, following "null = follow global".
- [x] `configuration.json` is handled per the chosen strategy (A), unit tests pass; on-device verification pending.
- [x] Three languages consistent, unit tests pass, `assembleDebug` passes.
- [x] No regression to the existing version detection/module resolution/module install status chains.
- [x] P2 (screenTimeout) is planned separately and does not block the completion criteria.