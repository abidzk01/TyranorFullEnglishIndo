# TyranorNext In-App Three-Language Text Switching Support Plan

> **Current status (2026-11):** the implementation has moved on from this plan. English is now the default
> (`values`), with `values-in` (Indonesian), `values-zh` (Simplified Chinese) and `values-ja` (Japanese);
> `values-en` no longer exists. The default app language is English (`AppSettingsStore` / `AppLocaleController`),
> and the language picker offers English, Bahasa Indonesia, Simplified Chinese, Japanese and Follow system.

## 1. Goal

Add in-app three-language switching for TyranorNext functional text:

- Simplified Chinese `zh`
- Japanese `ja`
- English `en`

The target scope is "application-layer functional text", that is, the text users can see in the app UI, dialogs, Toasts, notifications, error messages, settings items, buttons, and menus.

Engine scripts, game content, external module protocol fields, URLs, filenames, SharedPreferences keys, Intent extras, and JSON protocol fields are not included in translation.

## 2. Current State

### 2.1 Current Resource Files

Currently the Android string resources only consist of:

```text
app/src/main/res/values/strings.xml
```

The content only includes:

```xml
<string name="app_name">Tyranor Next</string>
```

In other words, most functional text is currently written in Kotlin source and has not yet been resourced/abstracted.

### 2.2 Hardcoded Functional Text Scan Results

Scan scope:

```text
app/src/main/java
app/src/main/res
```

Counting string literals that contain Chinese/Japanese characters, there are currently:

```text
433 hardcoded Chinese/Japanese functional text occurrences
27 affected Kotlin files
```

The main distribution is as follows:

| Count | File | Main type |
| ---: | --- | --- |
| 94 | `app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt` | Settings page, directory management, update checking, engine settings, dialogs |
| 70 | `app/src/main/java/com/tyranor/next/ui/game/GameScreen.kt` | Game page, search, cover, delete, launch file, patch confirmation |
| 56 | `app/src/main/java/com/tyranor/next/ui/settings/PerGameSettingsScreen.kt` | Per-game settings, overriding global, engine parameters |
| 34 | `app/src/main/java/com/tyranor/next/core/game/save/GameSaveManager.kt` | Save directory descriptions, import/export errors |
| 18 | `app/src/main/java/com/tyranor/next/core/game/scan/EngineScanner.kt` | Default game name, default directory name, launch target placeholder |
| 18 | `app/src/main/java/com/tyranor/next/ui/engine/EngineScreen.kt` | Engine page, download module dialog |
| 17 | `app/src/main/java/com/tyranor/next/ui/cover/CoverScraperSettingsActivity.kt` | Cover scraping settings, sorting, authorization, Toast |
| 15 | `app/src/main/java/com/tyranor/next/core/auth/HikarinagiAuthService.kt` | Login/authorization errors |
| 13 | `app/src/main/java/com/tyranor/next/ui/home/HomeScreen.kt` | Home page, quick launch, launch failure dialog |
| 13 | `app/src/main/java/com/tyranor/next/ui/save/SaveManagementActivity.kt` | Save management UI |
| 12 | `app/src/main/java/com/tyranor/next/core/game/launch/EngineLauncher.kt` | Launch errors, permission prompts |
| 12 | `app/src/main/java/com/tyranor/next/ui/settings/AppSettingsActivity.kt` | App settings, appearance, tone dialogs |
| 9 | `app/src/main/java/com/tyranor/next/core/cover/CoverScraperService.kt` | Cover scraping errors/statistics |
| 8 | `app/src/main/java/com/tyranor/next/core/patch/KrkrOnlinePatchService.kt` | Online patch errors/progress |
| 7 | `app/src/main/java/com/tyranor/next/ui/patch/KrkrOnlinePatchActivity.kt` | Online patch page UI |
| 7 | `app/src/main/java/com/tyranor/next/ui/settings/EngineSettingsMenuActivity.kt` | Engine settings entry |
| 5 | `app/src/main/java/com/tyranor/next/core/engine/external/ExternalEngineLauncher.kt` | External APK module errors |
| 5 | `app/src/main/java/com/tyranor/next/core/updater/UpdateNotificationManager.kt` | Update notification text |
| 4 | `app/src/main/java/com/tyranor/next/ui/main/MainScreen.kt` | Main page tabs |
| 3 | `app/src/main/java/com/tyranor/next/core/engine/external/RpgMakerExternalEngineModule.kt` | RPGM module errors/configuration |
| 3 | `app/src/main/java/com/tyranor/next/core/engine/plugin/EnginePluginBootstrap.kt` | Built-in plugin installation errors |
| 2 | `app/src/main/java/com/tyranor/next/core/cover/CoverScrapeTaskManager.kt` | Batch scraping status |
| 2 | `app/src/main/java/com/tyranor/next/core/cover/VndbCoverService.kt` | VNDB search errors |
| 2 | `app/src/main/java/com/tyranor/next/core/updater/GitHubUpdateChecker.kt` | Update check errors |
| 2 | `app/src/main/java/com/tyranor/next/ui/cover/CoverSourceUi.kt` | Cover source names |
| 1 | `app/src/main/java/com/tyranor/next/core/cover/CoverSupport.kt` | Custom cover default name |
| 1 | `app/src/main/java/com/tyranor/next/ui/main/MainLibraryViewModel.kt` | Batch scraping completion prompt |

### 2.3 High-Priority Hardcoded Text Types

Migrate the following text first, because it is user-visible, appears frequently, and affects the in-app language switching experience:

| Type | Example | Location |
| --- | --- | --- |
| Page titles | `Home`, `Engine`, `Game directories`, `App settings` | `ui/home`, `ui/engine`, `ui/settings` |
| Settings items | `Appearance mode`, `Tone switch`, `Isolated save directory`, `Game modifier` | `SettingsScreen.kt`, `AppSettingsActivity.kt` |
| Buttons | `OK`, `Cancel`, `Delete`, `Save`, `Download` | Multiple UI files |
| Dialog title/body | `Delete game`, `New version found`, `Launch failed` | `GameScreen.kt`, `SettingsScreen.kt` |
| Toast | `Saved`, `Batch scraping in progress`, `Engine settings saved` | Multiple Activities/Screens |
| Notifications | `New version found`, `Tap to view release details and download` | `UpdateNotificationManager.kt` |
| Error messages | `Unable to resolve game directory`, `Patch download failed`, `Authorization failed` | `core/*` |
| Option labels | `Auto`, `Light`, `Dark`, `Off`, `Ask at launch` | Settings mapping tables |

## 3. Content That Should Not Be Translated or Should Be Translated Carefully

Although these strings are picked up by the scan, they should not be included in language switching directly:

| Type | Example | Handling |
| --- | --- | --- |
| Protocol fields | `game`, `settings`, `orientation`, `rootUri` | Do not translate |
| Intent action/package | `cyou.joiplay.runtime.renpy.run` | Do not translate |
| Filenames/path markers | `script_version.txt`, `[游戏目录]` | `[游戏目录]` can be changed to an internal constant; filenames are not translated |
| JSON content | `{"useRuby18":true}` | Do not translate |
| Brand/service names | `VNDB`, `Steam`, `Bangumi`, `Hikarinagi` | Keep the original names; translate only the descriptions |
| Engine names | `Kirikiri`, `ONScripter`, `Ren'Py`, `RPG Maker` | Keep the original names; translate only the explanatory text |
| Log tags | `EngineScanner`, `RuntimeManager` | Do not translate |

## 4. Recommended Technical Approach

The current project is `ComponentActivity + Compose` and does not actually use AppCompat Activity. To reduce migration cost, a hybrid approach of "resource files + Compose localization context" is recommended.

### 4.1 Resource Directories

Add/complete:

```text
app/src/main/res/values/strings.xml       # Default: Simplified Chinese
app/src/main/res/values-ja/strings.xml    # Japanese
app/src/main/res/values-en/strings.xml    # English
```

In other words, TyranorNext keeps Chinese as the default language; when the user does not switch actively, the system language does not match, or resources fall back, Chinese is shown.

```text
values/strings.xml     # Simplified Chinese, default fallback
values-ja/strings.xml  # Japanese
values-en/strings.xml  # English
```

If finer regional distinction is needed later, `values-zh-rCN` can be added, but that is unnecessary at the current stage.

### 4.2 In-App Language Settings

Add app language configuration:

```kotlin
object AppSettingsStore {
    const val LANGUAGE_SYSTEM = "system"
    const val LANGUAGE_ZH = "zh"
    const val LANGUAGE_JA = "ja"
    const val LANGUAGE_EN = "en"
}
```

Add a settings item:

```text
App settings -> Language
Options: Follow system / Simplified Chinese / 日本語 / English
```

### 4.3 Runtime Switching

Add `AppLocaleController`:

- Read the app language setting.
- Create a `ConfigurationContext` for the specified Locale.
- Provide `rememberLocalizedResources()` for Compose.
- After a language switch, trigger an Activity recreate or refresh the locale state of the root Composable.

Recommended entry point:

```kotlin
CompositionLocalProvider(
    LocalAppLocale provides appLocale,
    LocalAppStrings provides AppStrings(localizedContext.resources)
) {
    TyranorNextTheme { ... }
}
```

The UI layer prefers:

```kotlin
val strings = LocalAppStrings.current
Text(strings.settingsTitle)
```

Or resource-based directly:

```kotlin
Text(stringResource(R.string.settings_title))
```

To keep Compose page recomposition natural, UI page text should preferably use `stringResource`; non-Composable core/service/notification layers should preferably use `context.getString(...)`.

### 4.4 Background/Notification/Service Text

Background update notifications, authorization errors, patch errors, and save errors are not inside Composables, so they need:

```kotlin
val localizedContext = AppLocaleController.wrap(context)
localizedContext.getString(R.string.update_notification_text)
```

Otherwise, after switching the language in the app, the notification bar may still follow the system language instead of the app language setting.

## 5. Text Key Naming Convention

Recommended grouping by feature domain:

```text
common_confirm
common_cancel
common_delete
common_save
common_loading

nav_home
nav_games
nav_engine
nav_settings

settings_app_title
settings_language_title
settings_language_system
settings_language_zh
settings_language_ja
settings_language_en

game_search_hint
game_empty_title
game_add_folder
game_delete_title

engine_download
engine_missing_module_message

cover_scraper_title
cover_scraper_running

save_management_title
save_delete_message

update_checking
update_latest
update_found_title
```

Rules:

- Shared buttons/states use `common_*`.
- Pages/domains use prefixes such as `game_*`, `settings_*`, `engine_*`.
- Parameterized text uses Android formatting placeholders:

```xml
<string name="cover_scrape_result">Updated %1$d, skipped %2$d, failed %3$d</string>
```

Kotlin usage:

```kotlin
context.getString(R.string.cover_scrape_result, updated, skipped, failed)
```

## 6. Phased Migration Plan

### Phase One: Base Language Framework

1. Add the language settings item.
2. Add `AppLocaleController`.
3. Add/complete `values/strings.xml`, `values-ja/strings.xml`, `values-en/strings.xml`.
4. Wire the locale state into the root Composable of MainActivity.
5. Verify that after switching languages the UI refreshes without a restart or with only a recreate.

Acceptance criteria:

- The app settings page can switch languages.
- Main page tabs, settings page titles, and common buttons switch with the language.
- The user's language choice is preserved after re-entering the app.

### Phase Two: UI Layer Text Resourcing

Migration priority:

1. `ui/main/MainScreen.kt`
2. `ui/home/HomeScreen.kt`
3. `ui/game/GameScreen.kt`
4. `ui/engine/EngineScreen.kt`
5. `ui/settings/AppSettingsActivity.kt`
6. `ui/settings/SettingsScreen.kt`
7. `ui/settings/PerGameSettingsScreen.kt`
8. `ui/cover/CoverScraperSettingsActivity.kt`
9. `ui/save/SaveManagementActivity.kt`
10. `ui/patch/KrkrOnlinePatchActivity.kt`

Acceptance criteria:

- Main pages contain no hardcoded Chinese UI text.
- Dialogs, Toasts, buttons, and menus all follow the language switch.

### Phase Three: Resourcing User-Visible Text in the core Layer

Migrate:

1. `core/game/launch/EngineLauncher.kt`
2. `core/game/save/GameSaveManager.kt`
3. `core/cover/*`
4. `core/patch/*`
5. `core/auth/*`
6. `core/updater/*`
7. `core/engine/external/*`
8. `core/engine/plugin/*`

Approach:

- The core layer must not depend on Compose directly.
- When an error message is needed, return an error code/enum first and let the UI layer map it to text.
- Places that are hard to change for now can pass in a localized context and use `getString`.

Long-term recommendation:

```kotlin
sealed class LaunchError {
    data object MissingAllFilesAccess : LaunchError()
    data object CannotResolveGamePath : LaunchError()
    data class ExternalModuleMissing(val moduleName: String) : LaunchError()
}
```

Unified in the UI layer:

```kotlin
LaunchError.toLocalizedMessage(context)
```

### Phase Four: Cleaning Up Scanner/Model Placeholder Text

The scanner currently contains:

```text
未命名游戏
未命名目录
[游戏目录]
```

Recommendations:

- Change `未命名游戏` and `未命名目录` to resourced display names; persist an empty value or a stable fallback key if needed.
- `[游戏目录]` is not suitable for long-term storage in the data model as localized text; it should become an internal constant:

```kotlin
const val LAUNCH_TARGET_GAME_DIR = "DIR"
```

Localize it when displaying:

- Chinese: 游戏目录
- Japanese: ゲームフォルダ
- English: Game directory

### Phase Five: Testing and Regression Prevention

Add tests/checks:

1. Three-language key completeness check for `strings.xml`.
2. Kotlin hardcoded Chinese scanning test or Gradle task.
3. Notification bar language test.
4. Activity recreate/Compose recomposition test after switching the language in settings.
5. Consistency check for the number of format string arguments.

Recommended script or Gradle task:

```text
checkHardcodedUiStrings
```

Used to scan:

```regex
"[^"]*[\u4e00-\u9fff\u3040-\u30ff][^"]*"
```

Allowed whitelist:

- Filenames/protocol fields
- Test fixtures
- README/docs
- Log tags

## 7. Translation Style Recommendations

### 7.1 Chinese

Keep the current style: concise, direct, tool-like.

Examples:

```text
批量刮削封面
无法解析游戏目录
独立存档目录
```

### 7.2 Japanese

Use a natural app UI tone and avoid stiff machine translation.

Examples:

```text
批量刮削封面 -> カバー画像を一括取得
无法解析游戏目录 -> ゲームフォルダを解析できません
独立存档目录 -> 個別セーブフォルダ
```

### 7.3 English

Use common app terminology for short buttons, and keep the cause in error messages.

Examples:

```text
批量刮削封面 -> Fetch covers
无法解析游戏目录 -> Unable to resolve game directory
独立存档目录 -> Isolated save directory
```

## 8. Recommended Implementation Order

Change all 433 places at once is not recommended, as it easily introduces resource key mismatches and UI regressions. "Eating the whale in small bites" is recommended:

1. Build the language framework and common strings first.
2. Migrate main navigation, the settings entry, and the app settings page.
3. Migrate the game page and dialogs.
4. Migrate engine settings/per-game settings.
5. Migrate core-layer errors and notifications.
6. Add hardcoded string scanning for regression prevention.

Run the following every phase:

```bash
./gradlew :app:testDebugUnitTest assembleDebug --no-daemon
```

## 9. Current Conclusion

The project currently meets the prerequisites for adding three-language switching, but text extraction must be done first. The largest workload is concentrated in:

```text
SettingsScreen.kt
GameScreen.kt
PerGameSettingsScreen.kt
GameSaveManager.kt
```

It is recommended to build the resourcing framework first and then migrate file by file. This both enables quick Chinese/Japanese/English switching on entry pages and avoids large numbers of missing or wrong UI strings caused by a one-shot overhaul.

## 10. Implementation Record

The first round has been landed according to this plan:

1. Added `AppLocaleController`, providing a unified in-app language context for Compose pages, notifications, Toasts, and the core/service layers.
2. `AppSettingsStore` adds the language configuration, defaulting to Simplified Chinese `zh`.
3. The app settings page adds a "Language" settings item, switchable between:
   - Simplified Chinese
   - 日本語
   - English
   - Follow system
4. Added and completed three resource sets:
   - `app/src/main/res/values/strings.xml`
   - `app/src/main/res/values-ja/strings.xml`
   - `app/src/main/res/values-en/strings.xml`
5. The main page, home page, game page, engine page, settings page, app settings page, cover settings page, save management page, online patch page, per-game settings page, and engine settings page have all been wired to resource text.
6. Launch errors, cover scraping errors, Hikarinagi authorization errors, VNDB/Steam/Bangumi search errors, online patch errors, update notification text, and save management errors have been wired to the in-app language.
7. Scanner default names and the launch target placeholder have been changed to resources/stable constants.
8. Added `tools/check-hardcoded-ui-strings.py` and registered the Gradle task `:app:checkHardcodedUiStrings` to:
   - check that the three-language `strings.xml` keys match;
   - block newly added visible Chinese/Japanese string literals in Kotlin.

Current verification results:

```bash
python3 tools/check-hardcoded-ui-strings.py
./gradlew :app:checkHardcodedUiStrings --no-daemon
./gradlew :app:compileDebugKotlin --no-daemon
./gradlew :app:assembleDebug --no-daemon
```

All of the above have passed.