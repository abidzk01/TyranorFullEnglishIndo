---
name: Tyranor Android review
description: Review changes in Tyranor Next from independent angles (logic, architecture, robustness, regression, conventions). Use before merging or after a multi-file feature, especially core/engine/Compose changes.
---

# Tyranor Next review workflow

Read `AGENTS.md` and `CONTEXT.md` first. Then review the change from each angle separately; do not merge the angles into one shallow pass.

## 1. Logic

- Follow state transitions, cancellation, and error paths end to end.
- Check boundary inputs: empty paths, missing files, stale pref values, unknown engine ids, permission loss.
- Confirm every `LaunchResult` / typed error branch still maps to UI text.

## 2. Architecture

- Dependency direction must stay `ui -> core -> engine`.
- `core` must not import Compose UI or engine packages; `ui` must not import `com.core`, `com.akira`, `com.yuri`, `org.tvp`, `org.libsdl`, `org.cocos2dx`, or `bridge`.
- New user-visible text must be a string resource, not a literal.

## 3. Robustness

- Exceptions: no swallowed failures, `CancellationException` always rethrown.
- Nullability, thread safety, lifecycle (Activity/Compose/view detach), file handles and streams closed.
- Multi-process engines: prefs, locale and SAF mirror behavior across processes.

## 4. Regression

- Engines: KRKR, krkrsdl3, ONS, Artemis, Tyrano, RPG Maker, Siglus, FVP, RealLive/AVG32/UK2, System35, Web shells.
- Settings: global vs per-game overrides, defaults, migration of old keys.
- Saves, covers, online patches and updates.

## 5. Conventions

- `AGENTS.md` UI rules: `AppTopBar`, two type sizes, 8dp shapes, white dialogs, `AppSearchField`, `SlidingTabRow`, `AppNavItem`, Miuix switches, no press feedback in dialogs.
- Localization: all four language files updated and key-complete.
- Commit style: Conventional Commits in English.

## Output

Report findings ordered by severity with file and line references, then a short list of checks that were run (build, unit tests, `tools/check-hardcoded-ui-strings.py`, device smoke test). State explicitly when something could not be verified.