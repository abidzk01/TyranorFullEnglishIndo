# External APK Engine Module Integration Plan

> Implementation status: Ren'Py and RPG Maker XP/VX/VX Ace/mkxp-z external APK module support has been landed according to this plan. Future external engines such as Godot will continue to reuse the `core/engine/external` registration, install-state check, and launch protocol abstraction.

## 1. Background and Goals

TyranorNext already has built-in launch paths for Kirikiri / ONScripter / Tyrano / Artemis / RPG Maker MV/MZ / VN / WebOther, where both native engines and web engines are handled by the current APK itself for launching and host logic.

If complete runtimes such as RenPy, RPG Maker XP/VX/VX Ace, and Godot were integrated directly into the main APK later, several problems would arise:

- Noticeable APK size growth.
- Large differences in runtime dependencies, ABIs, permissions, and lifecycles across engines.
- External engine update cadence differs from the main app, and coupling raises maintenance cost.
- Some engines already have ready-made external runtime APKs whose intent protocols can be reused for launching.

Therefore the "external APK engine module" system is introduced: the main app handles scanning, detection, management, module state validation, and initiating the launch; the actual game execution is delegated to the installed external engine APK.

First landing targets:

- RenPy external engine APK integrated.
- A generic external APK module capability abstracted at the same time, for reuse by later RPG Maker XP/VX/VX Ace, Godot, and other engine integrations.

RPGM landing targets:

- Integrate the RPG Maker RGSS-family external engine APK.
- Support four sub-runtimes: RPG Maker XP / VX / VX Ace / mkxp-z.
- RPG Maker MV / MZ continue on the current built-in Web/Tyrano path and are not part of the RPGM external APK module.

## 2. Reference Implementation Conclusions

Referencing RinneMobile's external module chain:

- RenPy / RPGM / Godot are "external standalone APK modules".
- The main app does not bundle these runtimes; it only checks whether the external APK is installed.
- The game library stores an internal alias, e.g. `external.renpy` or `internal.renpy`.
- At launch time, the policy layer translates the internal alias into the real external APK package name, intent action, and extras.
- External APK modules are available by default with no manual toggle; the main app only checks whether the target APK is installed.
- The RenPy launch protocol core is:
  - package: `cyou.joiplay.runtime.renpy.v8d4d1`
  - action: `cyou.joiplay.runtime.renpy.run`
  - extra `game`: JSON string containing `title / id / folder / execFile / type`
  - extra `settings`: JSON string; RenPy can receive `{}` for now
  - extra `orientation`: `6` for landscape
- The RPG Maker RGSS external module differs from RenPy: one real APK package carries four sub-runtimes, so the main app must store or infer the subtype and then map it to different actions.
  - package: `cyou.joiplay.runtime.rpgmaker`
  - XP action: `cyou.joiplay.runtime.rpgmxp.run`
  - VX action: `cyou.joiplay.runtime.rpgmvx.run`
  - VX Ace action: `cyou.joiplay.runtime.rpgmvxace.run`
  - mkxp-z action: `cyou.joiplay.runtime.mkxp-z.run`
  - extra `game`: JSON string containing `title / id / folder / execFile / type`
  - extra `settings`: JSON string; RPGXP must pass `{"rpg":{"useRuby18":{"boolean":true}}}`, otherwise RGSS1 scripts are easily handed to Ruby 1.9/3.x for parsing and cause syntax errors.
  - extra `orientation`: `6` for landscape
  - The RPGM module also needs an external Runtime-style RTP directory and a `configuration.json` prepared; this is its key extra adaptation point compared with RenPy.

## 3. Architecture Positioning

The project's existing three-layer architecture stays unchanged:

```text
Interface UI interaction layer -> Feature abstraction layer -> Bottom engine layer
```

External APK modules belong to the feature abstraction layer, not the bottom engine layer.

Rationale:

- External APKs are not loaded by the `engine/` module.
- The relationship between the main app and the external APK is an Android intent protocol, not JNI/native internal calls.
- The UI should only display install state and download guidance, and must not assemble external engine intents.

Recommended directory:

```text
app/src/main/java/com/tyranor/next/core/engine/external/
├── ExternalEngineModule.kt
├── ExternalEngineModuleRegistry.kt
├── ExternalEngineLauncher.kt
├── ExternalEngineLaunchRequest.kt
├── ExternalEngineLaunchResult.kt
├── RenPyExternalEngineModule.kt
└── RpgMakerExternalEngineModule.kt
```

Later additions may include:

```text
GodotExternalEngineModule.kt
```

## 4. Common Abstraction Design

### 4.1 ExternalEngineModule

Describes the static protocol of one external APK engine module.

Suggested fields:

```kotlin
data class ExternalEngineModule(
    val id: String,
    val engine: EngineType,
    val displayName: String,
    val packageName: String,
    val action: String,
    val defaultAlias: String,
    val supportedAliases: Set<String>,
    val installUrl: String?,
)
```

Field descriptions:

| Field | Purpose |
| --- | --- |
| `id` | Main app internal module ID, e.g. `renpy` |
| `engine` | Corresponds to `EngineType.RENPY` |
| `displayName` | Name shown in the UI |
| `packageName` | Real package name of the external APK |
| `action` | Default launch action received by the external APK; multi-action modules such as RPGM must override it dynamically by subtype inside `buildLaunchIntent` |
| `defaultAlias` | Default alias stored in the game library, e.g. `external.renpy` |
| `supportedAliases` | Compatibility with historical aliases or later variants |
| `installUrl` | Used to jump to the download page when not installed; may be null in phase one or hardcode a GitHub release URL |

### 4.2 ExternalEngineLaunchRequest

Uniformly describes one external engine launch request.

Suggested fields:

```kotlin
data class ExternalEngineLaunchRequest(
    val game: ScanGame,
    val gameDirectoryPath: String,
    val launchTarget: String,
)
```

Notes:

- `game` carries context such as game title, URI, engine, and cover.
- `gameDirectoryPath` is the already resolved real file path.
- `launchTarget` is `[游戏目录]` or a concrete entry file.

### 4.3 ExternalEngineLauncher

Responsible for common checks and launching.

Suggested responsibilities:

- Look up the module by `EngineType` or alias.
- Check whether the external APK is installed.
- Build the common intent.
- Inject `FLAG_ACTIVITY_NEW_TASK`.
- Catch `ActivityNotFoundException` / `SecurityException` / other exceptions.
- Return a structured launch result instead of showing a Toast directly.

Suggested result:

```kotlin
data class ExternalEngineLaunchResult(
    val success: Boolean,
    val message: String? = null,
    val reason: String? = null,
)
```

Common `reason` values:

| reason | Meaning |
| --- | --- |
| `module_not_found` | No corresponding external module configured |
| `package_not_installed` | External APK not installed |
| `invalid_game_path` | Real path of the game directory unavailable |
| `activity_not_found` | External APK has no Activity matching the action |
| `launch_exception` | Other launch exception |

### 4.4 Module Availability-by-Default Policy

External APK modules are available by default, with no new manual toggle state.

That is:

- APK present: the module is considered available, the engine page shows a check icon on the right, and launching pulls it up directly according to the protocol.
- APK absent: the module is considered unavailable, the engine page shows a cross icon on the right; clicking that engine item opens a dialog prompting to download the module.
- No "installed but not enabled" intermediate state is provided, and no user toggle gate is added.
- If temporarily disabling an external module is needed later, it should be introduced as a separate requirement, not as part of phase-one RenPy support.

### 4.5 ExternalEngineModuleRegistry

Module registry, serving as the single source of truth.

Currently registered:

```kotlin
RenPyExternalEngineModule
RpgMakerExternalEngineModule
```

When Godot is added later, only a module definition and policy need to be added, without modifying hardcoded spots scattered across the UI.

## 5. RenPy External Engine Module Design

### 5.1 EngineType

Add:

```kotlin
RENPY("Ren'Py")
```

Notes:

- All `when (EngineType)` must be updated to avoid Kotlin exhaustive when compilation failures.
- Game page cover colors, engine page display text, and the save management unsupported message must all be completed.

### 5.2 Scan Detection

Add RenPy signatures to `EngineScanner.detectEngine`.

The detection priority should be before WebOther / Kirikiri / ONS, but not higher than Artemis / Tyrano / RPG Maker MV/MZ.

Signatures:

| Signature | Confidence | launchTarget |
| --- | --- | --- |
| Any `.rpa` | 96 | Relative path of the `.rpa` file, or `[游戏目录]` |
| `game/script.rpy` | 94 | `[游戏目录]` |
| `game/options.rpy` | 94 | `[游戏目录]` |
| `renpy/` directory + `.rpy` / `.rpyc` | 90 | `[游戏目录]` |
| `game/` directory + `.rpy` | 85 | `[游戏目录]` |

Phase-one recommendation:

- If `.rpa` is detected, still prefer `[游戏目录]` as the launch target, so the external RenPy does not mistakenly treat the `.rpa` as an executable.
- Keep `launchTarget` as `[游戏目录]`.

### 5.3 Launch Protocol

RenPy external APK:

```text
package = cyou.joiplay.runtime.renpy.v8d4d1
action  = cyou.joiplay.runtime.renpy.run
```

Intent extras:

```json
game = {
  "title": "Game title",
  "id": "Stable ID",
  "folder": "/storage/emulated/0/Games/RenPyGame",
  "execFile": "",
  "type": "renpy"
}
settings = "{}"
orientation = 6
rootUri = "content://..."
launchTarget = "[游戏目录]"
```

`game.id` recommendation:

- Phase one: `game.uri.hashCode().toString(16)` or a hash of the real path.
- Later, if a database ID is introduced, it can be switched to the stable database ID.

### 5.4 Path Strategy

The RenPy external APK usually needs real file paths, not SAF URIs.

Reuse what already exists in the project:

```kotlin
EngineScanner.safUriToPath(uriText)
```

Requirements:

- Support `primary:path` → `/storage/emulated/0/path`
- Support SD card volume labels → `/storage/<volume>/path`
- Support `file://`
- Support direct `/storage/...` paths

If the real path cannot be resolved:

- Do not copy the entire RenPy game directory.
- Return an explicit error: `Unable to resolve the real path of the RenPy game directory; the external RenPy module cannot launch`

Rationale:

- A RenPy game directory may be large, and silent copying causes time cost, space usage, and sync issues.
- The external APK runtime may also depend on the original directory structure and read/write paths.

### 5.5 Permission Strategy

The main app already has `MANAGE_EXTERNAL_STORAGE` logic.

When launching an external APK, note:

- The main app's SAF authorization cannot automatically transfer into real-path access for the external APK.
- Passing `FLAG_GRANT_READ_URI_PERMISSION` only grants the URI, not a `/storage/...` string path.
- Therefore the external RenPy APK itself usually also needs storage permission or all-files access.

Phase-one policy:

- The main app only checks whether the path can be resolved and initiates the launch.
- If the external APK requires permissions internally, the external APK handles it itself.
- If launching fails, prompt the user to check whether the RenPy module is installed and granted storage permission.

Later enhancement:

- Add a "permission notes" section to the module compatibility page.
- The target APK's existence can be detected, but private permissions must not be requested on its behalf.

## 6. UI Plan

External APK module state is integrated directly into the existing "engine page" engine items, without adding a standalone toggle page.

### 6.1 Engine Page State Display

Existing built-in engine items show a check state icon on the right, indicating the engine is available as part of the app.

External APK engine items use the same state position, but the meaning changes to "whether the external APK is installed":

| Engine type | Check method | Right-side state icon |
| --- | --- | --- |
| Built-in engine | Bundled with the app | Check |
| External APK engine installed | `PackageManager.getPackageInfo(packageName, ...)` succeeds | Check |
| External APK engine not installed | `PackageManager` cannot find the target package | Cross |

Phase-one RenPy item:

- Display name: `Ren'Py`
- Target APK: `cyou.joiplay.runtime.renpy.v8d4d1`
- Installed: check on the right
- Not installed: cross on the right

### 6.2 Engine Page Click Behavior

Built-in engines:

- Keep existing behavior: only show the engine description or keep a static display.

External APK engines:

- Installed: clicking opens a dialog saying "The RenPy module is installed; RenPy games can be launched directly".
- Not installed: clicking opens a dialog saying "No RenPy external engine module detected", with a "Download" button.

Download button:

- Use `Intent.ACTION_VIEW` to open the module download URL.
- If there is no browser or opening fails, prompt the user to try again later.

### 6.3 UI Call Boundary

The UI layer may call:

```kotlin
ExternalEngineModuleRegistry.modules
ExternalEngineModuleRegistry.moduleForEngine(engine)
ExternalEngineLauncher.isPackageInstalled(context, module)
ExternalEngineLauncher.openInstallPage(context, module)
```

The UI layer is forbidden from:

- Assembling the RenPy intent action.
- Assembling the RenPy `game` JSON.
- Saving external module toggle state directly.
- Hardcoding multiple external APK package names in a page.

## 7. Manifest Plan

Android 11+ package visibility requires declaring external APK package names.

Add under `<manifest>` in `app/src/main/AndroidManifest.xml`:

```xml
<queries>
    <package android:name="cyou.joiplay.runtime.rpgmaker" />
    <package android:name="cyou.joiplay.runtime.renpy.v8d4d1" />
</queries>
```

When Godot is integrated later, keep appending:

```xml
<package android:name="cyou.joiplay.runtime.godot3" />
<package android:name="cyou.joiplay.runtime.godot4" />
```

## 8. Integration Points with the Existing Launch Chain

Current launch entry:

```text
EngineLauncher.launch(context, game)
  -> resolveGameDirectory(...)
  -> requestAllFilesAccessIfNeeded(...)
  -> EnginePluginBootstrap.ensureForLaunch(...)
  -> buildIntent(...)
  -> context.startActivity(...)
```

Suggested after integration:

```text
EngineLauncher.launch(context, game)
  -> resolveGameDirectory(...)
  -> if ExternalEngineModuleRegistry.supports(game.engine):
       ExternalEngineLauncher.launch(...)
       recordRecentGame on success
       return result.message
  -> original built-in engine logic
```

Notes:

- External APKs do not go through `EnginePluginBootstrap.ensureForLaunch`.
- External APKs must not enter the internal Activity branch of `buildIntent`.
- After an external APK launch is initiated successfully, the recent game is recorded as well.
- When an external APK launch fails, the recent game is not recorded.

## 9. Integration Points with Existing Scan Persistence

The current `ScanGame` has no `emulatorPackage` field.

Phase one may skip adding a field:

- `engine = EngineType.RENPY`
- `launchTarget = "[游戏目录]"`
- At launch time the default RenPy module is found directly by `engine`.

If one engine later needs to correspond to multiple external APKs or multiple runtime subtypes, extend it then:

```kotlin
val externalModuleAlias: String? = null
```

Adding `packageName` directly is not recommended:

- The real external package name is a policy-layer detail.
- Storing the real package name in the database/SharedPreferences increases future migration cost.

## 9.5 RPG Maker RGSS External Module Integration Supplement

This section is organized from the RPGM external module chain in `/Users/weiss/opencode/RinneMobile`; the goal is to replicate equivalent capability in TyranorNext while continuing to keep the three-layer architecture boundaries.

### 9.5.1 Supported Scope Boundaries

The RPGM external APK module only handles RGSS / mkxp family games:

| Subtype | Common name | Script/runtime | External module action |
| --- | --- | --- | --- |
| `rpgmxp` | RPG Maker XP | RGSS1 / Ruby 1.8 | `cyou.joiplay.runtime.rpgmxp.run` |
| `rpgmvx` | RPG Maker VX | RGSS2 / Ruby 1.9 | `cyou.joiplay.runtime.rpgmvx.run` |
| `rpgmvxace` | RPG Maker VX Ace | RGSS3 / Ruby 3.x | `cyou.joiplay.runtime.rpgmvxace.run` |
| `mkxp-z` | mkxp-z custom runtime | mkxp-z / Ruby 3.x | `cyou.joiplay.runtime.mkxp-z.run` |

Not included in this module:

- RPG Maker MV
- RPG Maker MZ

These two are HTML5/Web runtimes; TyranorNext already has `EngineType.RPG_MV` / `EngineType.RPG_MZ`, and they should keep using the built-in Web/Tyrano host, not be mixed into `RpgMakerExternalEngineModule`.

### 9.5.2 RinneMobile Integration Conclusions

The core implementation of RinneMobile is located at:

```text
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/core/launcher/ExternalRpgMakerPluginStrategy.kt
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/apps/game/EnginePackageResolver.kt
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/apps/game/AddGameSavePipeline.kt
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/core/scanner/EngineDetector.kt
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/core/scanner/NodeEngineDetector.kt
/Users/weiss/opencode/RinneMobile/app/src/main/java/com/core/launcherbridge/LauncherModuleBridge.kt
```

Its design does not install a separate APK for RPGXP/VX/VXAce; instead:

1. Uniformly detect whether the real package name `cyou.joiplay.runtime.rpgmaker` is installed.
2. Store an internal alias in the game library expressing the specific RPGM subtype.
3. At launch time, derive `game.type` from the alias or scan result.
4. Then map `game.type` to the real action.
5. Before launching, prepare an external Runtime compatibility directory and configuration file where possible.

Internal aliases used by RinneMobile:

| Internal alias | Subtype |
| --- | --- |
| `internal.rpgmaker` | Auto-detect |
| `internal.rpgmxp` | `rpgmxp` |
| `internal.rpgmvx` | `rpgmvx` |
| `internal.rpgmvxace` | `rpgmvxace` |
| `internal.mkxp-z` | `mkxp-z` |
| `internal.mkxpz` | `mkxp-z` compatible spelling |

TyranorNext has added the generic `externalModuleAlias` field to `ScanGame`, used to store the internal alias of external modules such as RPGM/RenPy/Godot. Otherwise, after being saved to the game library only `EngineType` and `launchTarget` remain, and XP/VX/VX Ace/mkxp-z cannot be reliably distinguished on a later launch.

### 9.5.3 TyranorNext Data Model Recommendation

Add a generic field to `ScanGame` rather than a dedicated `rpgMakerSubtype`:

```kotlin
val externalModuleAlias: String? = null
```

Suggested stored values:

| Game type | Stored value |
| --- | --- |
| RenPy | `internal.renpy` |
| RPG Maker XP | `internal.rpgmxp` |
| RPG Maker VX | `internal.rpgmvx` |
| RPG Maker VX Ace | `internal.rpgmvxace` |
| mkxp-z | `internal.mkxp-z` |
| Godot 4 | `internal.godot4` |

Rationale:

- One field can be reused for RenPy / RPGM / Godot.
- The UI and persistence layer do not store real APK package names.
- External module protocols stay centralized in `core/engine/external`.
- Future changes to module package names or actions require no game library data migration.

Persistence must be updated in sync:

- `EngineScanner.serializeGame`
- `EngineScanner.parseGame`
- `ScanGameIntents.putGame`
- `ScanGameIntents.getGame`
- Anywhere `ScanGame.copy(...)` is copied/updated, make sure the field is preserved.

### 9.5.4 Scan Detection Plan

Add RPG Maker RGSS signature fields to `EngineScanner`. RinneMobile's rules can be replicated directly:

| Signature | Subtype | Confidence | launchTarget |
| --- | --- | --- | --- |
| Any `.rgss3a` | `rpgmvxace` | 96 | `.rgss3a` relative path |
| Any `.rgss2a` | `rpgmvx` | 96 | `.rgss2a` relative path |
| Any `.rgssad` | `rpgmxp` | 96 | `.rgssad` relative path |
| `Game.ini` + `Data/*.rvdata2` | `rpgmvxace` | 92 | `[游戏目录]` |
| `Game.ini` + `Data/*.rvdata` | `rpgmvx` | 92 | `[游戏目录]` |
| `Game.ini` + `Data/*.rxdata` | `rpgmxp` | 92 | `[游戏目录]` |

Stored result:

```text
engine = EngineType.RPGMAKER
externalModuleAlias = internal.<subtype>
launchTarget = detected archive relative path, or [游戏目录]
```

Adding `EngineType.RPGMAKER` triggers multiple `when` completions, and at minimum the following must be updated in sync:

- `EngineLauncher.supportedEngines`
- `EngineLauncher.buildIntent`: external RPGM must not enter the internal Activity branch.
- `EngineScreen` display name/description/cover color.
- `GameScreen` engine filtering and cover placeholder color.
- `SaveManager` / game drawer: external APK modules should not show the save management item.
- README supported scope.

### 9.5.5 RpgMakerExternalEngineModule Protocol

Add:

```text
app/src/main/java/com/tyranor/next/core/engine/external/RpgMakerExternalEngineModule.kt
```

Module static information:

```kotlin
object RpgMakerExternalEngineModule : ExternalEngineModule {
    override val id = "rpgmaker"
    override val engine = EngineType.RPGMAKER
    override val displayName = "RPGM module"
    override val packageName = "cyou.joiplay.runtime.rpgmaker"
    override val defaultAlias = "internal.rpgmaker"
    override val supportedAliases = setOf(
        "external.rpgmaker",
        "internal.rpgmxp",
        "internal.rpgmvx",
        "internal.rpgmvxace",
        "internal.mkxp-z",
        "internal.mkxpz",
    )
}
```

`ExternalEngineModule.action` is enough for RenPy, but RPGM is a multi-action module. Suggested implementation:

- Keep `action` as the default action, e.g. VX Ace: `cyou.joiplay.runtime.rpgmvxace.run`.
- Inside `RpgMakerExternalEngineModule.buildLaunchIntent(request)`, rebuild the real action from the alias/subtype.
- Or upgrade the interface to `fun actionFor(request: ExternalEngineLaunchRequest): String`, with RenPy returning a fixed action and RPGM returning a subtype action.

Subtype inference priority:

1. `request.game.externalModuleAlias`
2. `request.launchTarget` suffix:
   - `.rgssad` → `rpgmxp`
   - `.rgss2a` → `rpgmvx`
   - `.rgss3a` → `rpgmvxace`
3. Default `rpgmxp`

Defaulting to `rpgmxp` is RinneMobile's conservative choice: unidentified old RGSS games are more often XP, and Ruby 1.8 compatibility suits RGSS1 better.

### 9.5.6 Intent extras

RPGM module launch intent:

```text
package = cyou.joiplay.runtime.rpgmaker
action  = dynamically selected by subtype
```

`game` JSON:

```json
{
  "title": "Game title",
  "id": "Stable ID",
  "folder": "/storage/emulated/0/Games/RPGXPGame",
  "execFile": "",
  "type": "rpgmxp"
}
```

Field descriptions:

| Field | Description |
| --- | --- |
| `title` | Game title, preferably the library title; falls back to the directory name when empty |
| `id` | Stable ID, may use a hash of the real directory path |
| `folder` | Real `/storage/...` path of the game directory |
| `execFile` | RinneMobile passes an empty string |
| `type` | `rpgmxp` / `rpgmvx` / `rpgmvxace` / `mkxp-z` |

`settings` JSON:

```json
{}
```

RPGXP must be special-cased:

```json
{
  "rpg": {
    "useRuby18": {
      "boolean": true
    }
  }
}
```

Rationale:

- The RPGM plugin's `MKXPConfigurationParser.parse(String)` reads the nested format.
- If a flat `{"useRuby18": true}` is passed, parsing does not take effect as expected.
- `useRuby18=true` loads `libmkxp18.so`, preventing RPGXP / RGSS1 scripts from being parsed by Ruby 1.9/3.x.

Other extras:

```text
orientation = 6
rootUri = original SAF/file URI
launchTarget = [游戏目录] or archive relative path
```

### 9.5.7 Path and launchTarget Handling

The RPGM plugin requires real paths. Follow the RenPy path strategy:

- `content://...primary:path` → `/storage/emulated/0/path`
- `content://...9C33-6BBD:path` → `/storage/9C33-6BBD/path`
- `file://...` → `uri.path`
- If it is already `/storage/...`, use it directly

If `launchTarget` is a `.rgssad` / `.rgss2a` / `.rgss3a` archive:

- `folder` should resolve to the archive's parent directory.
- `type` is determined by the archive suffix.
- `title` can keep using the game library title; it does not need to become the archive name.

If `launchTarget` is `[游戏目录]` / `DIR` / empty:

- `folder` uses the game root directory.
- `type` uses `externalModuleAlias` or the scanned subtype.

Do not silently copy the entire RPGM game directory. RGSS games may be large, and the plugin expects the original directory structure and real paths.

### 9.5.8 RTP and configuration.json Adaptation

This is the high-risk point of RPGM module integration, and also the biggest difference from RenPy.

RinneMobile found that the RPGM plugin unconditionally tries to mount:

```text
/sdcard/外置 Runtime/RTP/<engineName>/app
```

RTP directory name mapping:

| Subtype | RTP directory name |
| --- | --- |
| `rpgmxp` | `RPGXP` |
| `rpgmvx` | `RPGVX` |
| `rpgmvxace` | `RPGVXACE` |
| `mkxp-z` | `mkxp-z` |

TyranorNext should try to create the following before launching:

```text
/sdcard/外置 Runtime/RTP/<engineName>/app/
```

and try to place:

```text
sf.sf2
```

Notes:

- If the directory is missing, the plugin's underlying mkxp may exit because `PHYSFS_mount(..., fatalError=true)` fails.
- A missing `sf.sf2` mainly affects MIDI instrument tones and is usually not a fatal launch error, but it should be prepared too when possible.
- If the app has not yet obtained all-files permission, creating the directory may fail; that failure should not block launching, and the RPGM plugin's own permission flow provides the fallback.

RPGXP additionally needs a `configuration.json` double safeguard:

```json
{"useRuby18":true}
```

Possible creation locations:

```text
<game.folder>/configuration.json
/sdcard/外置 Runtime/games/<gameId>/configuration.json
```

Rules:

- Only `rpgmxp` must create it.
- Do not overwrite an existing file; respect the user's existing external Runtime configuration.
- Creation failure is only logged and does not block launching.

Note that `configuration.json` is the flat format read by the plugin's `loadFromFile()`; the intent extra `settings` is the nested format read by `parse(String)`, and the two must not be mixed.

### 9.5.9 Engine Page State and Click Behavior

As an external APK module, RPGM is enabled by default and needs no manual toggle.

Engine page item rules:

| State | Right-side icon | Click behavior |
| --- | --- | --- |
| `cyou.joiplay.runtime.rpgmaker` installed | Check | Dialog stating the RPGM module is installed and RGSS games can be launched directly |
| Not installed | Cross | Dialog prompting to download the RPGM module |

The RPGM download address follows RinneMobile:

```text
https://github.com/Weiss-UltimateSavior/RinneMobile/releases/download/test/RPGM-Plugin.apk
```

### 9.5.10 Game Drawer and Save Management

External APK modules should not show the "save management" item in the game drawer.

Rationale:

- Save directories, save formats, and write locations are determined by the external APK runtime.
- The main app's current save management capability is designed for built-in engines/controllable directories.
- Forcing save management onto an RPGM external module easily causes accidental deletion, misleading behavior, or empty pages.

Suggested rule:

```text
if (ExternalEngineModuleRegistry.isExternalEngine(game.engine)) {
    hideSaveManagementItem()
}
```

If some external module later exposes a stable save path protocol, declare `supportsSaveManagement = true` for that module specifically; do not enable it by default.

### 9.5.11 Manifest Package Visibility

Android 11+ requires declaring package visibility:

```xml
<queries>
    <package android:name="cyou.joiplay.runtime.rpgmaker" />
</queries>
```

RenPy already has:

```xml
<package android:name="cyou.joiplay.runtime.renpy.v8d4d1" />
```

When integrating RPGM, make sure nothing is missed; otherwise `PackageManager` may fail to find an installed module, causing the engine page to wrongly show a cross.

### 9.5.12 Test Checklist

Unit tests:

```text
EngineScannerRpgMakerTest
RpgMakerExternalEngineModuleTest
ExternalEngineModuleRegistryTest
```

Coverage items:

- `.rgssad` → `EngineType.RPGMAKER` + `internal.rpgmxp`
- `.rgss2a` → `EngineType.RPGMAKER` + `internal.rpgmvx`
- `.rgss3a` → `EngineType.RPGMAKER` + `internal.rpgmvxace`
- `Game.ini + Data/*.rxdata` → `internal.rpgmxp`
- `Game.ini + Data/*.rvdata` → `internal.rpgmvx`
- `Game.ini + Data/*.rvdata2` → `internal.rpgmvxace`
- `internal.mkxp-z` / `internal.mkxpz` both map to `mkxp-z`
- XP intent action is `cyou.joiplay.runtime.rpgmxp.run`
- VX intent action is `cyou.joiplay.runtime.rpgmvx.run`
- VX Ace intent action is `cyou.joiplay.runtime.rpgmvxace.run`
- mkxp-z intent action is `cyou.joiplay.runtime.mkxp-z.run`
- RPGXP intent `settings` uses the nested `useRuby18` format
- RPGXP `configuration.json` uses the flat `{"useRuby18":true}`
- Not-installed module returns `package_not_installed`
- Game drawer does not show the save management item for external modules

On-device verification:

1. Install the TyranorNext debug build.
2. Enter the engine page with the RPGM plugin not installed and confirm the RPGM item shows a cross.
3. Click the RPGM item and confirm the dialog prompts to download.
4. Install the RPGM plugin, return to the engine page, and confirm the item turns into a check.
5. Scan samples of all three types RPGXP / VX / VX Ace and confirm the subtypes are stored correctly.
6. Launch each of the three sample types and confirm they pull up the same external APK but with different actions.
7. Verify path mapping with an SD card path `/storage/<volume>/...`.
8. Use an RPGXP sample to verify that Ruby version syntax errors no longer appear after `useRuby18=true`.
9. Verify that the RPGM game drawer has no save management item.

### 9.5.13 Phased Implementation Recommendation

It is recommended to split into three small commits to reduce the regression surface:

1. Model and scanning:
   - Add `EngineType.RPGMAKER`.
   - Add `ScanGame.externalModuleAlias`.
   - Add RGSS signatures and subtype persistence to the scanner.
   - Make persistence/Intent serialization compatible with old data.
2. External module protocol:
   - Add `RpgMakerExternalEngineModule`.
   - Register it in `ExternalEngineModuleRegistry`.
   - Extend `ExternalEngineLaunchRequest` with alias/subtype capability.
   - Implement action mapping, game/settings JSON, and RTP/config preparation.
   - Add RPGM package visibility to the Manifest.
3. UI and verification:
   - Add the RPGM module item and download dialog to the engine page.
   - Hide the save management item for external modules in the game drawer.
   - Add RPG Maker XP/VX/VX Ace/mkxp-z to the README supported scope.
   - Add unit tests, build verification, and on-device verification.

## 10. Test Plan

### 10.1 Unit Tests

New tests:

```text
app/src/test/java/com/tyranor/next/core/game/scan/EngineScannerRenPyTest.kt
app/src/test/java/com/tyranor/next/core/engine/external/ExternalEngineModuleRegistryTest.kt
app/src/test/java/com/tyranor/next/core/engine/external/RenPyExternalEngineModuleTest.kt
```

Coverage:

- `.rpa` detected as `EngineType.RENPY`
- `game/script.rpy` detected as RenPy
- `renpy/ + .rpyc` detected as RenPy
- Ordinary `index.html` still detected as WebOther / Tyrano, not taken over by RenPy
- RenPy module alias correctly resolves the module
- RenPy intent extras contain `game.type == "renpy"`
- Not-installed module returns `package_not_installed`

### 10.2 Build Verification

Must run:

```bash
git diff --check
./gradlew testDebugUnitTest --no-daemon
./gradlew assembleDebug --no-daemon
android describe --project_dir=/Users/weiss/opencode/rma/TyranorNext
```

### 10.3 On-Device Verification

Verification on a device with the RenPy external APK installed:

1. Install the TyranorNext debug build.
2. Install the RenPy external APK.
3. Open TyranorNext → engine page and confirm the RenPy item shows a check on the right.
4. Uninstall the RenPy external APK, re-enter the engine page, and confirm the RenPy item shows a cross on the right.
5. With the module not installed, click the RenPy item and confirm the dialog prompts to download the module.
6. Add a RenPy game directory or scan a root directory containing RenPy games.
7. Confirm the game is detected as `Ren'Py`.
8. Tap launch.
9. Confirm the external RenPy APK is pulled up.

Additional verification is needed for SD card paths:

```text
/storage/<volume>/...
```

If the external APK cannot read the SD card directory, it should be recorded as an external APK permission/path compatibility issue rather than a main app scanning failure.

## 11. Implementation Steps

### Step 1: Add the Plan Document

Add:

```text
docs/external-apk-engine-module-plan.md
```

### Step 2: Add the RenPy EngineType

Modify:

```text
app/src/main/java/com/tyranor/next/core/engine/EngineType.kt
```

Add:

```kotlin
RENPY("Ren'Py")
```

Complete in sync:

- `EngineLauncher.supportedEngines`
- `EnginePluginBootstrap.ensureForLaunch`
- `GameSaveManager`
- `PerGameSettingsScreen`
- `EngineScreen.engineDisplayName`
- `EngineScreen.engineDescription`
- `GameScreen.coverColor`
- README supported scope

### Step 3: Add the External APK Module Abstraction

Add:

```text
app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineModule.kt
app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineModuleRegistry.kt
app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineLauncher.kt
app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineLaunchRequest.kt
app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineLaunchResult.kt
app/src/main/java/com/tyranor/next/core/engine/external/RenPyExternalEngineModule.kt
```

### Step 4: Add RenPy Detection to the Scanner

Modify:

```text
app/src/main/java/com/tyranor/next/core/game/scan/EngineScanner.kt
```

Add RenPy signature fields:

- `hasRenpyDir`
- `hasGameDir`
- `hasRpy`
- `hasRpyc`
- `hasGameScriptRpy`
- `hasOptionsRpy`
- `firstRpa`

Add detection rules:

```text
.rpa
game/script.rpy
game/options.rpy
renpy/ + .rpy/.rpyc
game/ + .rpy
```

### Step 5: Wire the External Engine Branch into the Launcher

Modify:

```text
app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt
```

Insert before the built-in native/web branches:

```kotlin
if (ExternalEngineModuleRegistry.supports(game.engine)) {
    val result = ExternalEngineLauncher.launch(...)
    if (result.success) EngineScanner.recordRecentGame(context, game)
    return result.message
}
```

### Step 6: Add Package Visibility to the Manifest

Modify:

```text
app/src/main/AndroidManifest.xml
```

Add:

```xml
<queries>
    <package android:name="cyou.joiplay.runtime.renpy.v8d4d1" />
</queries>
```

### Step 7: Add External APK Module State to the Engine Page

Modify:

```text
app/src/main/java/com/tyranor/next/ui/engine/EngineScreen.kt
```

Requirements:

- Built-in engine items keep a check on the right.
- External APK engine items such as RenPy show a check/cross on the right according to the APK install state.
- Clicking an item when not installed opens a dialog prompting to download the module.
- Clicking an item when installed opens a dialog stating the module is available.

### Step 8: Add Tests

Add RenPy scanning and external module abstraction tests.

### Step 9: Update README

Supplement:

- Add RenPy to the supported scope.
- Add the external APK engine module description to the technical architecture.
- Add `core/engine/external` to the directory structure.

## 12. Risks and Notes

### 12.1 External APK Protocol Instability

Actions, packages, and extra JSON fields of external Runtime-family plugins come from reverse engineering and actual behavior verification, and may change in future versions.

Mitigation:

- All protocols are centralized in `RenPyExternalEngineModule.kt`.
- Package/action strings are not scattered across the UI / scanner.

### 12.2 SAF URI vs. Real Path Split

The main app can scan directories through SAF, but external APKs may only recognize real paths.

Mitigation:

- Use `EngineScanner.safUriToPath` for path mapping.
- Report errors explicitly when mapping fails.
- Do not copy silently.

### 12.3 Permissions Cannot Be Requested on Behalf

The main app cannot complete all-files access authorization for an external APK.

Mitigation:

- The not-installed/launch-failed dialog on the engine page explains that the external APK must be installed and granted storage permission.
- Launch failure text prompts the user to check external module permissions.

### 12.4 UI Coupled with External Protocols

If the UI assembles intents directly, every new module will spread the coupling.

Mitigation:

- The UI only displays module state.
- All external protocols live in the core abstraction.

### 12.5 EngineType Ripple Changes

After adding `RENPY`, all exhaustive `when` must be completed.

Mitigation:

- Let the compiler expose omissions.
- Add tests covering scanning, colors, and the save-unavailable message path.

## 13. Phase-One Completion Criteria

After phase-one RenPy support is complete, the following should hold:

- Scanning a RenPy game directory detects it as `Ren'Py`.
- The game list displays RenPy cards correctly.
- The engine page can display RenPy.
- The engine page can show the RenPy install state: check when installed, cross when not installed.
- Clicking the RenPy item when not installed opens a dialog prompting to download the module.
- Launching when the RenPy APK is not installed returns a clear error.
- When installed, an external APK intent can be issued.
- RenPy intent construction logic lives inside the common external module abstraction.
- Later additions of RPGM/Godot do not require copying the RenPy launch framework; only a new module definition and a small amount of specialized construction logic are needed.
- `testDebugUnitTest` and `assembleDebug` pass.