# krkrsdl3 Engine Shell Configuration Capability Inventory and TyranorNext Improvement Plan

Last updated: 2026-08-23

Goal: to inventory the configuration entry points through which the TyranorNext launch shell can currently influence the krkrsdl3 core, the range that has been verified to take effect, and the settings items present in the current UI that krkrsdl3 does not yet consume, and to give a follow-up improvement plan.

## Conclusions

- Current stable recommended default: `software` rendering. On-device testing has verified that software rendering displays correctly.
- The `opengl` rendering entry point is wired up, but its current on-device behavior is incomplete frame output, so it should be temporarily marked as experimental or hidden under advanced options.
- krkrsdl3 currently passes native argv primarily through the `gameargs` extra; Activity-level behavior is controlled through Intent extras.
- TyranorNext already has many KR settings inherited from the Kirikiroid2/Rinne lineage, but the krkrsdl3 core does not yet consume these JSON/extras, so the UI needs to gray them out, show a hint, or the core needs to be extended to parse them.
- `--save-dir <path>` is already passed in by TyranorNext, but the current krkrsdl3 core does not parse this argument, and the actual save directory is still `savedata/` under the project directory. This is the highest-priority configuration gap.

## Configuration Channels

### 1. Native argv: `gameargs`

Method:

```kotlin
intent.putStringArrayListExtra("gameargs", args)
```

Current TyranorNext assembly location:

- `app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt`
- `buildKrkrsdl3Args(...)`

Current krkrsdl3 read location:

- `engine/src/main/java/org/tvp/krkrsdl3/KRKRActivity.java`
- `getArguments()`

Kernel parsing location:

- `cpp/core/utils/TVPSettings.cpp`
- `TVPParseArguments(...)`
- `TVPGetCommandLine(...)`
- `TVPSelectRenderer()`

Protocol key points:

- `args[0]` must be the game entry path, usually the game directory, an archive file, or a launch file such as `startup.tjs` / `start.ks`.
- Subsequent parameters are recommended to use the single-argument `-key=value` form consistently.
- The current `TVPGetCommandLine("-key")` can read `-key=value` or `-key`, but `--key` followed by a standalone value that does not start with `-` is easily ignored by the current parsing flow. Therefore new configuration should preferably avoid the two-part `--save-dir`, `<path>` form.

### 2. Activity extra

Method:

```kotlin
intent.putExtra("orientation", ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE)
intent.putExtra("focus", "true")
intent.putExtra("darkMode", darkMode)
```

Current consumption location:

- `engine/src/main/java/com/core/krkrsdl3/Krkrsdl3Activity.kt`
- `engine/src/main/java/org/tvp/krkrsdl3/KRKRCall.java`

Scope of effect:

- Only affects Java-layer behavior such as the Android shell window, orientation, immersive mode, system bars, and input dialog theme.
- It is not automatically passed into TJS or the native core unless additional bridging is added.

### 3. SharedPreferences / `krkr_engine_prefs`

TyranorNext currently has:

- `EngineSettingsStore.buildKrEnginePrefsJson(...)`
- The KR2 launch chain injects preferences such as rendering, memory, and texture compression through `krkr_engine_prefs`.

Current krkrsdl3 status:

- The krkrsdl3 launch chain does not currently read `krkr_engine_prefs`.
- These settings may work for Kirikiroid2, but for krkrsdl3 they should not be claimed to take effect by default.

## Currently Usable Configuration

| Configuration | Method | Effect | Current status | TyranorNext recommendation |
| --- | --- | --- | --- | --- |
| Game entry | `gameargs[0] = launchEntry` | Determines `TVPNativeProjectData`, the project directory, and the launch script or archive | In effect | Keep; the scanner must continue to pass the most explicit launch entry |
| Renderer | `-render=software` / `-render=opengl` | Selects software rendering or the OpenGL backend | In effect | Default `software`; mark `opengl` as experimental |
| Archive delimiter | `-arcdelim=<char>` | Changes the path delimiter inside xp3/directories | Supported by core, not exposed by the shell | Advanced debugging item, not recommended for the normal UI |
| Graphics cache limit | `-gclim=<MB>` / `-gclim=auto` | Limits graphics cache memory | Supported by core, not exposed by the shell | Can serve as one of the low-level implementations for a future "memory usage" option |
| Auto bookmark | `-autosave=yes` | Enables automatic bookmarks | Supported by core, not exposed by the shell | Do not put it on the core configuration page for now |
| Graphics split operation | `-gsplit=no/int/simple/bidi` | Controls the graphics split operation | Supported by core, not exposed by the shell | Advanced compatibility item, only expose after separate on-device verification |
| Alpha hold | `-holdalpha=yes/no` | Controls the default alpha behavior | Supported by core, not exposed by the shell | Advanced compatibility item |
| Timer precision | `-timerprec=high/higher/normal` | Controls timing precision | Supported by core, not exposed by the shell | Can serve as an advanced performance/battery item |
| Draw thread count | `-drawthread=auto/<n>` | Controls `TVPDrawThreadNum` | Supported by core, not wired into the shell | Can be mapped from the TyranorNext software draw thread setting |
| Low priority | `-lowpri` | Affects the process/thread priority policy | Supported by core, not exposed by the shell | Do not expose for now |
| Force logging | `-forcelog` | Forces log output | Supported by core, not exposed by the shell | Can add a toggle in debug builds |
| Log errors | `-logerror` | Error log behavior | Supported by core, not exposed by the shell | Can add a toggle in debug builds |
| Launch-time orientation | `orientation` extra | Android Activity orientation, orientation lock during loading | In effect | Keep the default sensor landscape; allow per-game override in the future |
| Force focus | `focus=true` extra | Prevents focus loss during launch from causing abnormal immersive state | In effect | Keep |
| Theme color / dark mode | `darkMode` / `themeColor*` extras | Input dialog, window background color, system bar color | In effect | Keep in sync with the launcher theme |

## Settings Already Present in the UI That krkrsdl3 Does Not Fully Honor

| TyranorNext setting | Current passing method | Current krkrsdl3 status | Problem | Recommendation |
| --- | --- | --- | --- | --- |
| Standalone save directory | `--save-dir`, `<path>` | Not consumed | The core still hardcodes `TVPDataPath = TVPProjectDir + "savedata/"` | Extend the core first; switch to `-savedir=<path>` |
| Default font | `default_font` extra | Not consumed | krkrsdl3 Java/native does not connect to this extra | First mark it in the UI as KR2-only; add font management bridging later |
| Force default font | `force_default_font` extra | Not consumed | Same as above | Add together with the default font |
| Software draw threads | `krkr_engine_prefs` JSON | Not consumed | krkrsdl3 does not read the JSON; however native supports `-drawthread` | Map it directly to `-drawthread=<n>` in the launcher |
| Software texture compression | `krkr_engine_prefs` JSON | Not consumed | No corresponding command-line entry point found in krkrsdl3 yet | Gray it out in the UI for krkrsdl3, pending core implementation |
| OpenGL texture compression | `krkr_engine_prefs` JSON | Not consumed | The current OpenGL output is still incomplete | Do not expose yet |
| Memory usage | `krkr_engine_prefs` JSON | Not consumed | The core currently hardcodes `unlimited`; however it supports `-gclim` | Map to `-gclim` in the short term; add `-memusage` in the long term |
| OpenGL max texture | `krkr_engine_prefs` JSON | Not consumed | Not connected to the rendering backend | Do it after OpenGL is fixed |
| OpenGL accurate rendering | `krkr_engine_prefs` JSON | Not consumed | `TVPSettings.ogl_accurate_render` defaults to false and no argument is parsed | Add `-ogl-accurate-render=0/1` after OpenGL is fixed |
| FPS limit | `krkr_engine_prefs` JSON | Not consumed | No throttle interface found in the current core | Keep it grayed out in the UI or KR2-only |

## TyranorNext Configuration Page Recommendations

### Global KR Configuration

Keep:

- Engine core selection: Kirikiroid2 / krkrsdl3.
- krkrsdl3 renderer: `software`, `opengl`.
- Standalone save directory: keep the toggle, but show "pending core support" or expose it only in debug builds until the core is extended.

Adjust:

- When the selected core is krkrsdl3, force the default renderer to `software`.
- Add an experimental hint next to the `opengl` option: it can currently launch, but the output is incomplete on some devices/games.
- Add a capability check for KR2 items that do not take effect on krkrsdl3, so users are not misled into thinking they already work.

Recommended to hide or gray out for now:

- Software texture compression.
- OpenGL texture compression.
- OpenGL max texture.
- OpenGL accurate rendering.
- FPS limit.
- Default font / forced font.

Can be wired in first:

- Software draw threads: convert directly to `-drawthread=<n>`.
- Graphics cache limit: add a krkrsdl3-specific "graphics cache limit" that is converted to `-gclim=<MB>` at the low level.

### Per-Game Configuration

Preferably keep these overrides:

- Renderer override: follow the global setting by default, allow forcing `software` per game.
- Standalone save directory override: formally enable it once the core supports `-savedir`.
- Advanced command-line override: let debug/advanced users append krkrsdl3 arguments, making it easy to quickly verify `-gclim`, `-timerprec`, `-drawthread`, and so on.

Not recommended to expose per game for now:

- Items related to OpenGL textures and accurate rendering. Basic OpenGL display still has problems, so fix the main path first.
- Font forcing items. Font loading chains differ greatly between games, so a bridge must be added before making them user-visible settings.

## Core Completion Plan

### P0: Make the save directory actually take effect

Goal:

- After the standalone save directory is enabled in TyranorNext, krkrsdl3's `TVPDataPath`, `TVPNativeDataPath`, and log directory all point to the directory allocated by the launcher.

Implementation suggestion:

1. Modify TyranorNext's `buildKrkrsdl3Args(...)`:

```kotlin
args.add("-savedir=${saveDir.absolutePath}")
```

2. Modify krkrsdl3's `TVPParseArguments(...)`:

- Parse `-savedir=<path>` from argv before setting `TVPDataPath`.
- Convert the path to a locally accessible path and append a trailing `/`.
- If `-savedir` is not passed, keep the old logic: `TVPProjectDir + "savedata/"`.

3. Ensure the log path stays in sync:

- `TVPSetLogLocation(TVPNativeDataPath)` continues to use the final save dir.

Acceptance:

- After launching a game via ADB, the project directory no longer creates/writes `savedata/`.
- The corresponding game saves and logs appear under the Android app's private directory.
- Cold start, second launch, and relaunch after exit can all read the old saves.

### P1: Stabilize renderer configuration

Goal:

- The default software rendering is stable.
- OpenGL is selectable but does not mislead users.

Implementation suggestion:

1. Keep the TyranorNext default as `software`.
2. Add an experimental marker for `opengl` in the UI.
3. Keep `Selected Render: ...` in the krkrsdl3 logs so users can confirm the actual backend when reporting issues.
4. Allow per-game override to `software`, making it easy to work around a mistaken global choice.

Acceptance:

- The target game displays completely when launched with software rendering.
- The OpenGL path at least does not crash; track the incomplete output issue in a separate debug document.

### P1: Wire in software draw threads

Goal:

- The TyranorNext "software draw threads" setting takes effect for krkrsdl3.

Implementation suggestion:

1. Read the global/per-game `software_draw_thread`.
2. Do not pass the argument when the value is empty.
3. When the value is `0..8`, pass:

```kotlin
args.add("-drawthread=$threadCount")
```

Acceptance:

- Native logs or debug output can confirm that `TVPDrawThreadNum` is set.
- Run launch regressions for 0, 1, 4, and 8 to confirm there are no crashes.

### P2: Memory configuration mapping

Goal:

- Allow the TyranorNext memory usage setting to at least affect the krkrsdl3 graphics cache.

Short-term approach:

- Map `low / medium / high / unlimited` to `-gclim`:

| UI value | Suggested argument |
| --- | --- |
| `low` | `-gclim=64` |
| `medium` | `-gclim=128` |
| `high` | `-gclim=256` |
| `unlimited` | `-gclim=auto` |

Long-term approach:

- Add `-memusage=low/medium/high/unlimited` to the krkrsdl3 core.
- Replace the currently hardcoded `std::string str = "unlimited"` in `TVPBeforeSystemInit()`.

Acceptance:

- Launch logs show the graphics cache limit changing.
- No obvious regressions or anomalies occur with large images or long-running sessions.

### P2: Font configuration bridging

Goal:

- Make `default_font` and `force_default_font` take effect for krkrsdl3.

Implementation suggestion:

1. Prefer the command line:

```text
-default-font=/path/to/font.ttf
-force-default-font=yes
```

2. Read and replace the default font candidates in the native font management layer.
3. Keep the Activity extra only as a compatibility path for the old KR2/Kirikiroid2 route, not as the primary krkrsdl3 protocol.

Acceptance:

- Games without embedded fonts can display correctly using a user-specified font.
- `force_default_font=false` does not break the game's own fonts.

### P3: OpenGL configuration and output integrity

Goal:

- Fix the incomplete OpenGL output first, then expose the advanced OpenGL items.

To-do:

- Determine whether the Surface/viewport/scissor/render target size is inconsistent with the Android window and the SDL drawable size.
- Check whether `glViewport` uses the actual drawable size in landscape, cutout, and immersive states.
- After fixing, wire in:
  - `-ogl-accurate-render=0/1`
  - `-ogl-max-texsize=<n>`
  - OpenGL texture compression strategy

Acceptance:

- The target game's title, menus, and dialogue boxes display completely.
- The output size is not clipped in landscape, reverse landscape, or after screen-off recovery.

### P3: FPS limit

Goal:

- Users can set 60/45/30/15 FPS per game.

Implementation suggestion:

- First locate the current main loop tick position in krkrsdl3.
- Add `-fps-limit=<n>`.
- Prefer frame scheduling/delay control rather than hacking at the script layer.

Acceptance:

- The logs confirm the FPS limit.
- No obvious anomalies in visual speed, audio sync, or input responsiveness.

## Recommended Implementation Order

1. P0: Add `-savedir=<path>` and fix the two-part `--save-dir` argument in TyranorNext.
2. P1: Keep software rendering as the default and mark the experimental OpenGL status in the UI.
3. P1: Wire the software draw threads to `-drawthread=<n>`.
4. P2: Map memory usage to `-gclim` in the short term.
5. P2: Add font configuration bridging.
6. P3: Track the incomplete OpenGL output separately, then expose the advanced OpenGL items.
7. P3: Add the FPS limit.

## Regression Test Checklist

Each change should cover at least:

- Cold-starting a game.
- Launching again after exiting.
- Launching with software rendering.
- Launching with OpenGL, confirming whether clipping/incomplete output still occurs.
- Toggling the standalone save switch on/off.
- Writing new saves and reading old saves.
- Landscape, reverse landscape, and screen-off recovery.
- Input dialog pop-up, cancel, and confirm.
- ADB log checks:
  - `KRKRActivity: launch args=...`
  - `Selected Render: ...`
  - Whether the savedata path / log path match expectations.

## Current Code References

- TyranorNext launch argument assembly: `app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt`
- TyranorNext KR settings storage: `app/src/main/java/com/tyranor/next/core/settings/EngineSettingsStore.kt`
- TyranorNext krkrsdl3 Activity shell: `engine/src/main/java/com/core/krkrsdl3/Krkrsdl3Activity.kt`
- TyranorNext krkrsdl3 argv reading: `engine/src/main/java/org/tvp/krkrsdl3/KRKRActivity.java`
- krkrsdl3 argv/renderer parsing: `cpp/core/utils/TVPSettings.cpp`
- krkrsdl3 system initialization parameters: `cpp/core/main/TVPSystem.cpp`