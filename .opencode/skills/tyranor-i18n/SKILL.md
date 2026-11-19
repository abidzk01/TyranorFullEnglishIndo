---
name: Tyranor i18n
description: Add or change user-visible text in Tyranor Next across English (default), Indonesian, Chinese and Japanese, including engine host UI. Use when a screen, dialog, toast, notification, error message or engine string is added or edited.
---

# Tyranor Next localization workflow

## Supported languages

| Language | In-app value | Android resources |
| --- | --- | --- |
| English (default) | `en` | `values` |
| Bahasa Indonesia | `id` | `values-in` |
| Simplified Chinese | `zh` | `values-zh` |
| Japanese | `ja` | `values-ja` |

`values` is the English default and also the fallback for unknown system locales. Never put Chinese or Japanese in `values`.

Both modules have their own set:

- App UI: `app/src/main/res/`
- Engine host UI: `engine/src/main/res/`

## Adding or editing text

1. Find the owning domain. App UI text belongs in the app module; engine host Activity/dialog/toast text belongs in the engine module.
2. Add the key to **all four** files of that module. Keep `%1$s` / `%1$d` / `%%` placeholders identical and keep escaped characters such as `\'`, `\n`, and `&amp;` valid XML.
3. Use an existing key prefix (`common_`, `nav_`, `settings_`, `game_`, `engine_`, `save_`, `cover_`, `patch_`, `archive_`, ...) and match the surrounding naming style.
4. Do not hardcode display text in Kotlin/Java. The Gradle check rejects CJK literals; review still flags English hardcoded UI text.

## Engine host UI

Engine Activities run in separate processes and must not change their native compatibility locale. Resolve text with:

```kotlin
EngineUiText.get(this, R.string.engine_some_key, arg1)
```

`EngineUiText` reads `LaunchContract.UI_LANGUAGE_TAG`, which `EngineLauncher` injects from the app language. If a new engine host Activity is added, keep using `EngineUiText`; do not call `getString` directly for user-visible host text.

KRKR keeps its native shell locale fixed to zh-CN on purpose (the bundled shell only ships that locale); only its Android-level strings follow the app language.

## Verify

```bash
python tools/check-hardcoded-ui-strings.py
./gradlew :app:checkHardcodedUiStrings --no-daemon
./gradlew :app:compileDebugKotlin --no-daemon
```

Then spot-check the language in App settings → Language (English, Bahasa Indonesia, Simplified Chinese, Japanese, Follow system).

## Style

- Indonesian: plain, modern app language ("Pengaturan", "Simpan", "Unduh", "sampul", "direktori save").
- English: sentence case, concise button labels.
- Chinese/Japanese: keep the existing tone; do not machine-translate literally.
- Keep brand and engine names unchanged (VNDB, Steam, Bangumi, Hikarinagi, Kirikiri, ONScripter, Ren'Py, ...).