# Input Remapping and Gamepad Mapping Plan (Editable Virtual Buttons + Gamepad Button Remapping)

> Implementation status: **stages 0–4 (Web part) are landed**. The canonical key space, the InputSink
> abstraction, gamepad mapping, the virtual pad overlay and edit mode, the Web-family host integration,
> and the app-side storage and settings pages are all complete; the remaining built-in engines
> (KRKR / ONS / krkrsdl3 / Siglus / Framebuffer / FVP / Artemis) will follow the same interface later.
> Reference implementation: [FoldCraftLauncher](https://github.com/FCL-Team/FoldCraftLauncher) (hereafter FCL),
> package `com.tungsten.fcl.control`; the sources were checked class by class.
> Related current state: `engine/src/main/assets/__touch_pad.js` (deleted), the two `TouchPadSaveBridge` sites (deleted),
> `GameOverridePartitions.TOUCHPAD_KEYS` (the old keys remain readable for migration).
>
> Implementation deviations (differences from the early draft in this document; the code is authoritative): only the
> `press` trigger (including `autoKeep` hold) was implemented; the draft's four triggers press/longPress/click/doubleClick
> and the `scale`→`w/h` conversion were not implemented; in the action segment v1 implements only `2000 ACTION_SCREENSHOT`
> (screenshot); the draft's `2000 TOGGLE_PAD` is not implemented (pad visibility is handled by tapping the FAB); the
> JSON contract follows the serialization implemented by `PadProfile`/`GamepadMap`, and `schema` is written and validated
> on read (a version **higher** than the current one is **rejected**—silently reading it as an older version would drop
> unknown fields on the next write; when it is missing, the current version is assumed); migration artifacts have ids
> `migrated-<gameScope>-*` (unique per game) and do not take over the built-in `default`; migration does **not** convert
> the old `scale` and does not set a global `input_profile_id` (see §4.5).
>
> The virtual pad's **default switch is tiered per engine** (`engineDefaultsEnabled` in `InputConfigStore.resolve`):
> when the user has never set it explicitly, RPG Maker MV/MZ default to on (they already had the old `__touch_pad.js`
> pad before the rework), while Tyrano / VN / WebOther default to off (so existing users do not suddenly get an extra
> button layer after upgrading); an explicit setting (global or per game) takes precedence over the engine default.
> The settings page's global switch is a single boolean, shown as "on" when unset (matching MV/MZ), with the default
> scope explained in the summary text.
>
> The components and naming after landing follow the `com.core.input` package and the "Input remapping" section of
> `CONTEXT.md`; where they differ from the early draft in this document (e.g. `VirtualPadLayer` → `VirtualPadView`,
> `KeySink` → `InputSink`), the code is authoritative.

---

## 1. Background and Goals

Current state:

- Virtual buttons exist only for RPG Maker MV/MZ, and they are 1600 lines of JS injected into the WebView (`__touch_pad.js`); the layout model is only `{x, y, scale, visible}`, the button set is fixed, buttons cannot be added or removed, keys cannot be remapped, and multi-key output and long-press/double-tap semantics are unsupported.
- There is no gamepad mapping capability at all: the SDL gamepad pipeline of the SDL-family hosts is effectively decoration for Kirikiri/ONS-class engines, and Kirikiri2's key whitelist simply swallows `KEYCODE_BUTTON_*`.
- Configuration persistence relies on the engine subprocess writing back a prefs blob (a whole-entry read-modify-write), which is a known cross-process limitation point.

Goals:

1. **Editable virtual buttons**: buttons can be added, removed, dragged, resized, restyled, and re-bound to output keys; hold/long-press/single-tap/double-tap trigger timings and multi-key output (including mouse keys) are supported; in-game WYSIWYG editing plus in-app profile management.
2. **Gamepad button remapping**: the gamepad (buttons/sticks/triggers/D-Pad) is mapped to keyboard keys and mouse keys, with global mapping and per-game overrides, and hold (toggle) semantics.
3. **Cover all built-in engines** (8 host classes), including the Web family (Tyrano/MV/MZ/VN/WebOther).

Explicit boundary: **external APK engines (Ren'Py / RGSS RPGM / Winlator / emulators) are out of scope**—input injection must happen inside the game process, and the main app cannot inject keys into another app (unless an accessibility service is introduced, at an unacceptable cost in both effort and experience).

### Why the overlay cannot be moved wholesale into the app layer

Every engine host runs in a separate process (`:kirikiri2`, `:krkrsdl3`, `:siglus`, `:fvp`, `:tyrano`, `:rpgmaker`, etc.), and the app process cannot add a View to another process's Activity window; key injection (`nativeKeyAction`, `SDLActivity.onNativeKeyDown`, `fbKey`, `rfvp_android_key`, `EmulateKeyEvent`) is likewise an in-process call. The split is therefore:

- **engine layer**: the input kernel (canonical keys, router, per-host InputSink) + the virtual pad overlay and in-game edit mode;
- **app layer**: configuration data (profiles/mappings), storage and migration, settings pages (profile management and gamepad mapping UI, import/export).

The dependency direction follows the three-layer architecture (ui → core → engine), with no reverse dependencies introduced.

---

## 2. FCL Reference Implementation Analysis (Summary of Conclusions)

### 2.1 Editable virtual buttons

**Data model** (`FCL/src/main/java/com/tungsten/fcl/control/data/`):

| Class | Contents |
|---|---|
| `ControlButtonData` | id, text, style, baseInfo, event; cloneable (the copy is offset by 2% to avoid overlap) |
| `BaseInfoData` | position 0..1000 (relative to screen width/height), size with PERCENTAGE/ABSOLUTE dual modes + reference edge (SCREEN_WIDTH/SCREEN_HEIGHT), visibilityType |
| `ButtonEventData` | switches: pointerFollow / movable / swipable; four trigger timings: press / longPress / click / doubleClick |
| `ButtonEventData.Event` | configurable per timing: `outputKeycodes[]` (multiple keys), `outputText`, autoKeep (hold while pressed), autoClick (repeated tapping), openMenu / switchTouchMode / switchMouseMode / input (text) / quickInput (functional action), bindViewGroup[] (switch control groups) |
| `ControlViewGroup` | control grouping and visibility (different button sets in different scenarios) |
| `ButtonStyles` / `DirectionStyles` | named shared styles (color/stroke/corner radius/pressed state) |

**Rendering and editing** (`control/view/`): `ViewManager` (29KB, the core of edit mode), the self-drawn Views `ControlButton`/`ControlDirection`/`TouchPad`, and `ControlEditBar` (a floating action bar that follows the selected control: settings/duplicate/delete); the editing interaction = drag to move + resize via handles/slider + `EditButtonDetails` (property page: text/position/size/style + event tabs) + `SelectKeycodeDialog` (key grid, `KeycodeView` multi-select, including a mouse area).

**Output**: all controls and the gamepad ultimately go through a single exit—`FCLInput.sendKeyEvent(keycode, keyChar, press)`; mouse codes go through `MOUSE_MAP` to `pushEventMouseButton`, and everything else goes through `pushEventKey` into the game bridge (`control/FCLInput.java:112`).

**Storage and distribution**: layouts are standalone JSON (`assets/controllers/00000000.json` is the built-in default, about 30KB; `control/download/` provides controller index downloads; `mio/controlconverter/` converts between the FCL↔Zalith formats).

### 2.2 Gamepad button remapping

(`control/gamepad/`)

- **Logical button set** is fixed at 20: A/B/X/Y, START/SELECT, L1/R1, L2/R2, L3/R3 (THUMBL/THUMBR), the four DPAD directions, and the left-stick emulated directions DIRECTION_FORWARD/BACKWARD/LEFT/RIGHT.
- Each `GamepadMap` entry = `keycodes[]` (multi-key output); the default bindings follow Minecraft habits (A→Space, B→Q, X→E, Y→F, left stick→WASD, shoulder buttons→scroll wheel, triggers→left/right mouse buttons, L3→Ctrl, START→Esc, SELECT→Tab).
- `GamepadEmulatedButton`: press/release state machine that sends only on state flips; `GamepadButton` extends the toggle semantics (press once to stay held, press again to release, used for stealth-style actions).
- Input capture: `Gamepad.handleKeyEventInput` / `handleMotionEventInput` (key normalization via the third-party `fr.spse.gamepad_remapper` library); stick axes X/Y/Z/RZ, triggers LTRIGGER/RTRIGGER (threshold 0.5), and HAT_X/Y (threshold 0.85) are routed to logical buttons respectively.
- Event-source filtering: only device events from `SOURCE_GAMEPAD` enter the mapping, so external keyboards are unaffected.
- Persistence: `files/gamepad.json` (Gson stores `GamepadMap` directly).
- UI: `GamepadMapDialog` + `GamepadMapItemAdapter` (bound in the in-app dialog).

### 2.3 The conclusions that matter most to us

1. **Both features share one output layer**: control buttons and gamepad buttons are ultimately the same thing—"input source → key sequence → game". In FCL the two share `sendKeyEvent`; we should likewise share one canonical key space + per-host InputSink instead of building two.
2. **Data-driven + multi-key output + multiple trigger timings**: this is the full meaning of "editable buttons", an order of magnitude above the existing `{x,y,scale,visible}` model, so its model should be adopted directly rather than patching the old JS.
3. **The editor lives in-game (WYSIWYG)**: FCL does all editing with a floating edit bar + property dialog + key grid dialog, without relying on a PC or a settings page; this is a mature UX, and we implement a native edit mode accordingly.
4. **Named styles + control groups + import/export**: this gives users the ability to share layouts at low cost.

### 2.4 Points that must be reworked

| Dimension | FCL | Ours |
|---|---|---|
| Injection target | A single runtime (LWJGL/GLFW bridge), one key space | The 8 host classes each have a different injection API → needs canonical keys + a per-host converter |
| Key space | GLFW keycodes + 1000+ mouse pseudo-codes | Based on Android KeyEvent keycodes (hosts accept them natively), + the 1000 mouse segment, + the 2000 action segment |
| Overlay | Launcher process only (Minecraft embedded) | One instance inside each engine host process, with the engine module sharing a single `VirtualPadView` |
| Storage | Global `gamepad.json` + controller JSON | Profile files + a per-game selection key (reusing the existing per-game override system) + migration of the old touchpad config |
| Edit entry | In-game menu | In-game native FAB (draggable, following the `VirtualMouseLayer` gamepad-button pattern) + an in-app profile management page |

---

## 3. Overall Architecture

### 3.1 Data flow

```
Input source                          canonical space                  host adaptation            engine
┌───────────────────────┐
│ physical gamepad btn/axes │──┐
├───────────────────────┤  │   ┌──────────────────────┐   ┌──────────────────┐   ┌────────────────────────┐
│ virtual pad overlay    │──┼──▶│ InputRouter          │──▶│ InputSink        │──▶│ nativeKeyAction        │ KRKR
│ (VirtualPadView)       │  │   │ ·deadzone/hysteresis/│   │ (one per host)   │   │ SDLActivity.onNative...│ ONS/krkrSdl3
├───────────────────────┤  │   │  direction synthesis │   │                  │   │ forwardKey(VK)         │ Siglus
│ physical keyboard (too)│──┘   │ ·multi-key/toggle/   │   │                  │   │ NativeGames.fbKey      │ RL/AVG32/UK2
└───────────────────────┘      │  long-press          │   │                  │   │ NativeRfvp.keyEvent    │ FVP
                               │ ·consume policy/pass │   │                  │   │ EmulateKeyEvent        │ Artemis
                               │  through during text │   │                  │   │ JS keydown/keyup       │ Web family
                               │  input               │   │                  │   │                        │
                               └──────────────────────┘   │                  │   │                        │
                                                          └──────────────────┘   └────────────────────────┘
```

### 3.2 Canonical key space

- **Keyboard segment**: use the `android.view.KeyEvent.KEYCODE_*` integer values directly (most hosts accept them natively; Siglus/Framebuffer/FVP/Artemis/Web map them into their own spaces via converters).
- **Mouse segment** (1000..1099): `1000 MOUSE_LEFT`, `1001 MOUSE_RIGHT`, `1002 MOUSE_MIDDLE`, `1003 SCROLL_UP`, `1004 SCROLL_DOWN` (aligned with FCL habits, so the existing button semantics of `__touch_pad.js` can be carried over). In v1 the mouse keys are **fired at the viewport center** (`center()` in `__tyranor_input.js`, using `innerWidth/2`, `innerHeight/2`) regardless of where the button is placed—button coordinates do not participate in mouse dispatch.
- **Action segment** (2000+, v1 defines only 2000): `2000 ACTION_SCREENSHOT` (screenshot: grab a frame from the current game window and save it as PNG; hosts handle it through `InputSink.performAction`). The draft's `2000 TOGGLE_PAD` is not implemented—pad visibility is handled by tapping the FAB (`VirtualPadView`). Later this could be extended with profile switching, opening a modifier, and so on.
- Converters: `Android → JS keyCode` (Web; a new small table: Enter 66→13, Esc 111→27, directions 19..22→38..40, Space 32→32, Ctrl 113/114→17, Shift 59/60→16, letters same value, etc.), `Android → Windows VK` (Siglus already has `vkCodeFor`, Artemis already has a table), `Android → fbKey` (reverse-reuse `FramebufferGameActivity.mapKey`), `Android → rfvp VK` (FVP).

### 3.3 Host adaptation list (verified injection points)

> Integration status: every entry in the "Existing input entry" column is a code-**verified** injection point; **as of now only the Web row is wired up**
> (`InputRemapController.installWeb` assembles the two Web hosts Tyrano/RpgMaker), and the remaining hosts follow the same
> interface later (see stages 1/3 in §7).

| Host | Existing input entry | Injection method | Notes |
|---|---|---|---|
| Kirikiri2 | `KrGLSurfaceView.onKeyDown/Up` (whitelist only BACK/ENTER/MENU/DPAD) | The router calls `KR2Activity.nativeKeyAction(keyCode, down)` directly (public static native, KR2Activity.java:319), bypassing the whitelist | Mouse codes can go through `nativeTouchesBegin/End` (317-323) |
| ONS | `ONScripter extends SDLActivity` | `SDLActivity.onNativeKeyDown/Up(keyCode)` (public static native, SDLActivity.java:548) | There is already a precedent for calling ESC directly |
| krkrsdl3 | `KRKRActivity extends org.libsdl3.app.SDLActivity` | Same as above (SDL3 version, :1129) | |
| Siglus | `dispatchKeyEvent → vkCodeFor` | New public injection method on the host (internally `vkCodeFor` + `forwardKey`) | `onImeKeyEvent` is already a public wrapper and can be used as a reference |
| RealLive/AVG32/UK2 | `FramebufferGameActivity.mapKey → NativeGames.fbKey` | New public injection method on the host, mapping to `NativeGames.KEY_*` | Limited key set (no Alt; letters go through `fbText`) |
| FVP | `forwardKey` (private, ESC only) | Promote to public + a small canonical→VK table (`NativeRfvp.keyEvent` is already public) | |
| Artemis | `dispatchKeyEvent → EmulateKeyEvent(vk, 2)` | Call `EmulateKeyEvent` directly (public external) | A complete keycode→VK table already exists |
| Web (Tyrano/MV/MZ/VN/WebOther) | Currently synthesizes keyCode in JS | `evaluateJavascript` calls the JS receiver `window.__tyranorInput.key(jsKeyCode, 1\|0)` / `.mouse(canonical, 1)` / `.cancel()` (`WebInputSink.kt:19-48`); **the canonical → browser keyCode conversion happens on the Kotlin side** (`WebKeyCodes.toJs`), the JS table does no conversion and only synthesizes keydown/keyup from the code it receives | Keep the JS synthesis route, replacing the direct dispatch of `__touch_pad.js` |

### 3.4 Event pipeline and consume policy

- Interception point: **current state**—the two Web hosts (`TyranoActivity` / `RpgMakerActivity`) already hook `InputRouter` at the very front of `dispatchKeyEvent` / `dispatchGenericMotionEvent` (via `InputRemapController.installWeb`); **planned**—the remaining hosts (KRKR / Siglus / Framebuffer / FVP / Artemis) hook in at the very front of `Activity.dispatchKeyEvent` / `dispatchGenericMotionEvent` (ahead of the View tree and WebView) so events pass through `InputRouter` first.
- Gamepad detection: `event.source` contains `SOURCE_GAMEPAD`/`SOURCE_JOYSTICK` and is not an alphabetic keyboard device (aligned with FCL `Gamepad.isGamepadEvent`).
- **A mapping hit is consumed** (`return true`, no call to super), avoiding a second dispatch by SDL-family hosts; the BACK key is never consumed.
- **Pass-through during text input (not landed, later)**: `__tyranor_input.js` currently synthesizes keydown/keyup **unconditionally**, with no edit-box/`activeElement` check; "let events through while the IME is active" for KRKR's `KrInputConnection` and the Siglus IME channel is a later integration item (see risks in §8), to avoid breaking in-game name entry.
- Stick-emulated directions: deadzone default 0.35, hysteresis 0.05; eight directions configurable; down/up are sent only when the set of directions changes (like the existing JS logic), avoiding jitter and repeated events.
- Modifier keys: synthesized KeyEvents carry `metaState`; Framebuffer's `repeatCount` and the Shift/Ctrl special cases are aligned with its existing semantics.
- Multi-key output: when one logical button maps to several keys, the downs are dispatched in order and the ups in reverse order (so combos such as Ctrl+Z stay stable).

---

## 4. Data Contract

### 4.1 Button profile JSON v1

Stored as separate files: `filesDir/input/profiles/<id>.json`. **No built-in preset assets**—the factory default is generated by code (`PadProfile.defaultProfile()`), and `default` is the built-in profile id (editable, not deletable).

Fields follow `PadProfile.toJson` and form a **flat structure** (no `style`/`base`/`events` nesting; the draft's `w/h/ref/inline style` structure was not implemented). Real example (the serialized output of the factory default profile):

```json
{
  "schema": 1,
  "id": "default",
  "name": "Default",
  "direction": {
    "x": 0.17, "y": 0.8, "size": 0.3, "eightDir": true,
    "up": [19], "down": [20], "left": [21], "right": [22]
  },
  "buttons": [
    { "id": "ok", "text": "OK", "x": 0.93, "y": 0.5, "size": 0.115, "aspect": 0.46, "shape": "round", "keys": [66, 62] },
    { "id": "skip", "text": "Skip", "x": 0.93, "y": 0.67, "size": 0.115, "aspect": 0.46, "shape": "round", "keys": [113], "autoKeep": true }
  ]
}
```

(The remaining buttons are isomorphic: cancel/pageup/pagedown/tab plus the four round QWZX keys; the fields expand according to the shape of the button above.)

Conventions:

- `x/y` are the button center's normalized coordinates (0..1; out-of-bounds placement from -0.1..1.1 is allowed, consistent with the existing `__touch_pad.js`); `size` is the button width relative to `min(viewport width, viewport height)`, and height = width × `aspect` (default 0.46, 1 for round keys).
- `shape ∈ {round, square}`; `visible` is written only when false (absent = visible); `keys[]` holds canonical keys (Android keycodes; the mouse segment is described in §3.2); `autoKeep: true` means hold after pressing (tap again to release), used for Ctrl skip, charging, and the like.
- `legacyMain` (optional boolean, **written only for the migrated main layout**): tri-state semantics—`null` = the file predates the field (old files can only be judged by their placeholder name), `false` = it is definitely not / is no longer the migration main layout, `true` = it is the migration main layout and has not been renamed; `toJson` writes it only when it is not `null`. The settings page uses this (together with the id shape `migrated-<game scope>-main`) to show that profile as "Default profile (migrated)" (`input_settings_profile_default_migrated`) instead of the English `Default` that collides with the built-in default profile's name. **Renaming clears it to `false`** (copying and importing likewise set `false` explicitly), so even if a user happens to rename the migrated main layout to the placeholder name `Default`, it does not flip back to the "not renamed" state.
- Migration artifact id and name conventions: the main layout slug is fixed by `PadProfile.MAIN_SLUG = "main"`, giving the id `migrated-<game scope>-main` (presets are `migrated-<scope>-<name>-<index>`, where the scope is a stable short hash of the gameId); the main layout placeholder name is `Default`; legacy preset names are truncated to 24 characters (the literal in `PadProfile.migrateLegacy`, the same value as the app-side `InputRemapRepository.PROFILE_NAME_MAX_LENGTH`). See §4.5 for details.
- Parser-side defensive constraints (normal editing never reaches them; bad or constructed files are truncated, dropped, or fall back rather than exhausting memory. Implementation: `PadProfile.parse` / `InputJsonLimits`):
  - Profile ids are validated at the read/write/delete entry points against the whitelist `[A-Za-z0-9_-]{1,32}` (`InputConfigStore.ID_PATTERN` and `sanitizeProfileId`; a mismatch rejects the read or write outright); ids for buttons added in-game are generated in the same character set as `btn-<index>`, while on the parser side button ids only need to be non-empty, with the id preserved and deduplicated.
  - Button text is truncated to 12 characters (`MAX_BUTTON_TEXT`).
  - Button count ≤ `MAX_PAD_BUTTONS` (128), deduplicated **by id** (the first one is kept); **buttons with the reserved id `direction` or the `direction.` prefix are always dropped** (the direction control and buttons share `elementById`, and the direction control's dispatch id is `pad:direction.<direction>`; a name clash would collide in the dispatch scope).
  - `x` / `y` are clamped to -0.1..1.1; `size` is clamped to `MIN_SIZE`..`MAX_SIZE` (0.02..0.60, direction control 0.08..0.8); `aspect` is clamped to 0.1..2.
  - **Non-finite values** (`NaN` / `Infinity`, including the case where JSON contains the string `"NaN"`) always fall back to that field's default value—`coerceIn` has no effect on NaN.
  - Keys per binding ≤ `MAX_KEYS_PER_BINDING` (128); entries with key ≤ 0 are dropped; when a direction key field is missing it falls back to the factory direction keys, and a present-but-empty array means that direction is explicitly unbound.
- The button set is no longer fixed: users can add/remove arbitrary buttons and duplicate them (the copy is offset by 2%).
- Styles are inlined on the button (v1 does not do named shared styles or color/corner-radius editing; the structure is reserved so a top-level `styles` + references can be added later).
- Control groups (FCL's ViewGroup) are not done in v1; the `group` field is reserved in the model.

### 4.2 Gamepad mapping JSON v1

Storage: `filesDir/input/gamepad_map.json` (a single global copy; per-game overrides are not distinguished in v1 and use the same file; per-game keys can be added later if needed).

Fields follow `GamepadMap.toJson`. **There are only 16 logical buttons** (`GamepadButtons.ALL`), and the key names have no `stick` (singular)/`triggers` field—the trigger/stick thresholds are `InputRouter` constants (trigger 0.5, HAT 0.85) and **cannot be configured in JSON**. Key values are always **Android keycodes** (e.g. B→Esc = 111, D-Pad = 19..22; the 27/38/40 etc. in the draft sample are browser keyCodes and are mistakes). Real example (the serialized output of the factory default):

```json
{
  "schema": 1,
  "buttons": {
    "A":      { "keys": [66, 62] },
    "B":      { "keys": [111] },
    "X":      { "keys": [113], "autoKeep": true },
    "Y":      { "keys": [59] },
    "START":  { "keys": [111] },
    "SELECT": { "keys": [61] },
    "L1":     { "keys": [92] },
    "R1":     { "keys": [93] },
    "L2":     { "keys": [1000] },
    "R2":     { "keys": [1001] },
    "L3":     { "keys": [113], "autoKeep": true },
    "R3":     { "keys": [59], "autoKeep": true },
    "DPAD_UP":    { "keys": [19] },
    "DPAD_DOWN":  { "keys": [20] },
    "DPAD_LEFT":  { "keys": [21] },
    "DPAD_RIGHT": { "keys": [22] }
  },
  "sticks": {
    "left":  { "up": [19], "down": [20], "left": [21], "right": [22], "deadzone": 0.35, "hysteresis": 0.05 },
    "right": { "up": [], "down": [], "left": [], "right": [], "deadzone": 0.35, "hysteresis": 0.05 }
  }
}
```

Conventions:

- The logical input set is a fixed enumeration (the 16 keys above + 4 emulated directions for the left/right sticks), aligned with FCL's 20 items (we omit the separate DIRECTION_* items, since stick directions are expressed directly by the `sticks` configuration).
- `autoKeep` is FCL's toggle semantics; `keys[]` multi-key output matches the virtual buttons and shares the same dispatcher; keys per binding are likewise constrained by `MAX_KEYS_PER_BINDING` (128) (entries with key ≤ 0 are dropped).
- Parser-side defensive constraints (the same rule set as the profile files): non-finite values (`NaN`/`Infinity`) fall back to defaults; `deadzone` is clamped to `MIN_DEADZONE`..`MAX_DEADZONE` (0.05..0.80) and `hysteresis` to 0..0.4; key names in `buttons` that are not in `GamepadButtons.ALL` are ignored outright.
- XInput devices (`SOURCE_GAMEPAD`) and joystick devices (`SOURCE_JOYSTICK`) are normalized uniformly; the HAT axis threshold 0.85 and trigger 0.5 are `InputRouter` constants and are not configurable.
- The factory default contains only **one Web-semantics** mapping (`GamepadMap.default()`: A→Enter+Space, B→Esc, X→Ctrl(autoKeep), Y→Shift, START→Esc, SELECT→Tab, L1→PageUp, R1→PageDown, L2→left mouse, R2→right mouse, L3→Ctrl(autoKeep), R3→Shift(autoKeep), D-Pad/left stick→direction keys). **Engine-family-tiered default presets (KRKR/Siglus family, Framebuffer family) are not implemented** (planned).

### 4.3 Storage and concurrency

| Data | Location | Writer | Readers |
|---|---|---|---|
| Profile files | `filesDir/input/profiles/*.json` | app (settings page), engine (in-game edit save) | both sides |
| Gamepad mapping | `filesDir/input/gamepad_map.json` | app | both sides |
| Per-game selection/switch | `tyranor_game_overrides` blob, new keys (see 4.4) | app (the engine no longer writes prefs) | read by the engine at startup |

- All writes use "temp file + rename" atomic replacement; a single writer is assumed: while a game is running the engine writes the profile files, the app's settings page may write when no game is running, and the app re-reads the files to refresh the list when it returns to the foreground.
- **Cross-process visibility (current state)**: the three `input_*` switch/profile-selection keys live in **shared prefs** (the `tyranor_prefs` and `game_overrides` blob), while the engine host runs in a separate process (`:tyrano` / `:rpgmaker` / ...), so it reads the copy of prefs **cached in its own process**—after the app's settings page (main process) writes, a live engine process will not observe it, and the game must be reopened (process restart) for it to take effect; the profile JSON and gamepad mapping files live on the **file system**, so they take effect as soon as the game returns to the foreground (`onResume`) and re-reads them (see the KDoc of `InputRemapController.applyEnabledState`, `InputRemapController.kt:219-264`).
- The engine side no longer has `TouchPadSaveBridge`-style prefs write-back, so that cross-process prefs limitation point disappears with it.

### 4.4 New keys (following the existing literal-anchoring convention)

`GameOverridePartitions` + `PerGameSettingsStore.F_*` + engine-side constants:

- `input_profile_id` (String, default `"default"` = `PadProfile.BUILTIN_DEFAULT_ID`)
- `input_pad_enabled` (Boolean, **current state: no global default**, tiered per engine when not set explicitly)
  —true for MV/MZ, false for Tyrano/VN/WebOther (`engineDefaultsEnabled` in `InputConfigStore.resolve`; the same policy on the app side is `InputRemapRepository.engineDefaultsPadEnabled`, and the settings page's global switch is shown as "on" when unset)
- `input_gamepad_enabled` (Boolean, **current default: enabled for all Web hosts**): engine side `getBoolean(KEY_GAMEPAD_ENABLED, true)`, and app-side `isInputGamepadEnabled` also defaults to true, so Tyrano/VN/WebOther now start consuming gamepad buttons after upgrading too (this is a default-behavior change)
- `input_legacy_migrated` (Boolean, the one-shot migration flag for the old touchpad, **read and written on the app side only**; the engine side has no such constant; it is anchored by `PerGameSettingsStore.F_LEGACY_MIGRATED` / `GameOverridePartitions.KEY_INPUT_LEGACY_MIGRATED` and `GameOverridePartitionsTest`)

All four keys are explicitly modeled in `GameOverridePartitions.TYRANO_KEYS` so that tightening the partition cannot drop them.

### 4.5 Legacy configuration migration

1. On first load, read the old `touch_pad_config` / `touch_pad_presets` (still in the blob) and generate `profiles/migrated-<scope>-*.json` based on the known button id table (pageup/pagedown/tab/alt/ctrl/shift/space/enter/esc/qwzx/joystick/dpad) (the main layout being `migrated-<scope>-main`, with the placeholder name `Default` and `legacyMain: true`): the factory default layout is used as the base, with position and visibility overridden by the old entries (the old config was "a delta relative to the factory layout"); canonical keys come from the default layout's keyCodes table; `x/y` are carried over directly (they are already normalized); the old `scale` and the new `size` have different semantics (the old one relative to padSize, the new one relative to `min(viewport edge)`), so **no conversion is done** and the size falls back to the new default.
2. Each old `presets` entry becomes its own profile file with its name preserved (truncated to 24 characters, the same value as the app-side `PROFILE_NAME_MAX_LENGTH`).
3. After migration, the game's profile selection is written into the **per-game override** (`setGameProfileIdOverride`, leaving the global `input_profile_id` alone—keeping the built-in `default` while changing the global selection would pollute other unconfigured games); the old keys are **never cleaned up** (they are kept as a data backstop, and migration idempotence is carried by the one-shot `input_legacy_migrated` flag).

### 4.6 LaunchContract

v1 adds no new extras: the engine host reads the files + blob directly at startup (reusing the existing `getSharedPreferences(EnginePrefs.GAME_OVERRIDES_PREFS)` read pattern). If the app later needs to force something down (e.g. entering edit mode directly on first launch), extras constants can be added as needed.

---

## 5. engine-Side Implementation

New package `engine/src/main/java/com/core/input/`:

- `CanonicalKeys.kt`: key constants, mouse segment, action segment.
- `InputRouter.kt`: gamepad event normalization (KeyEvent/MotionEvent → logical input), stick direction state machine, mapping lookup, multi-key dispatch, consume policy; hosts call it at the very front of `dispatchKeyEvent`/`dispatchGenericMotionEvent`.
- `InputSink.kt`: the `fun send(key: Int, down: Boolean)` interface + per-host implementations (small classes, per the table in §3.3; currently only the Web-family `InputRemapController` assembles them, see below).
- `PadProfile.kt` / `GamepadMap.kt`: JSON parsing (org.json, no new dependencies), defaults, serialization.
- `InputConfigStore.kt`: profile/mapping file read/write (temp file + rename atomic replacement, backup-style rollback) and effective-setting resolution (per-game override ?: explicit global ?: engine default).
- `WebKeyCodes.kt`: Android keycode → browser keyCode table (pure functions).
- `InputJsonLimits.kt`: parsing constraints (schema compatibility checks, `MAX_PAD_BUTTONS`, `MAX_KEYS_PER_BINDING`).
- `InputRemapController.kt`: Web host assembly (`installWeb`, the two entry points Tyrano/RpgMaker).
- `VirtualPadView.kt`: the self-drawn overlay View (modeled on the existing `VirtualMouseLayer`, no Compose):
  - Rendering: buttons/direction control/styles; `layout()` anchors to the full viewport and reflows on resize/rotation (following the existing normalization strategy).
  - Touch: press/release/long-press/double-tap recognition, multi-touch, swipe linkage (optional), press-and-hold (autoKeep).
  - Edit mode: selection (outline highlight), drag, resize (handles/slider), floating edit bar (settings/duplicate/delete), property dialog (text/size/autoKeep/visibility/eight directions), key grid dialog (canonical key multi-select + mouse area), save/cancel (working-copy draft model). **No numeric position entry and no color/corner-radius/style editing** (the draft's position/style editing was not implemented).
  - Entry: a draggable native FAB (position persisted in the `tyranor_input` prefs); **a tap toggles pad visibility, a long press enters edit mode**; **the app side currently has no setting to hide the FAB** (planned).
- **Second in-game edit entry**: the RPG Maker modifier UI (the "Virtual buttons" card of `__rpgmaker_mod_ui.js`) enters editing and resets to defaults through the JS bridge `TyranorInputNative` (`InputRemapController.Bridge`: `isAvailable` / `enterEdit` / `resetToDefaults`, plus an `exitEdit` that the asset side does not call yet). **That bridge is registered only when the modifier is enabled** (`TyranoActivity.kt:250-262`, `RpgMakerActivity.kt:357-367`)—its only consumer is the modifier UI injected under the same switch, so once the modifier is turned off the page has no such entry.
- FAB/edit mode vs. existing gestures: edit mode swallows all input and blocks bubbling (carrying over the JS-version experience: an overlay plus a stopPropagation equivalent—the native layer simply consumes the events).
- Coordination with `VirtualMouseLayer`: the two can coexist (the pad consumes only the regions it hits); mouse-code output preferentially reuses `__tnMouse` (Web) and the host mouse APIs (KRKR touch), while the other hosts log and degrade in v1.
- **Not landed (later)**: the two `VirtualMouseLayer.kt` copies (`com.core.tyrano` / `com.core.rpgmaker`, whose contents have already drifted) **were not merged in this PR**; the FAB's dragging and position persistence (`VirtualPadView` + the `tyranor_input` prefs) become a third implementation of the same kind, and merging is left for a later unification.

## 6. app-Side Implementation

- `core/input/InputRemapRepository.kt`: the app-side read/write facade for profiles/mappings/switches + the legacy data migrator + the key catalog. **No built-in preset unpacking (assets)**—the factory default is generated by engine-side code.
- Gamepad mapping read/write has no separate Store: it goes through `InputRemapRepository` ↔ the engine-side `InputConfigStore` (the same filesDir).
- `core/settings`: add the four override keys from 4.4 (including `input_legacy_migrated`); `PerGameSettingsStore` is mirrored in sync (following the existing F_* pattern).
- `ui/settings/InputSettingsScreen.kt`:
  - Profile management: list, select, duplicate, rename, delete, import/export, and entering the layout editor as a full page (`PadLayoutEditActivity`, WYSIWYG editing); **no standalone preview canvas** (the draft's "phone-ratio canvas + touch simulation" was not implemented).
  - Gamepad mapping (`GamepadMapScreen.kt`): a key-grid multi-select dialog to edit each logical button/stick direction + reset to defaults; **no device list, no physical key capture, no conflict hints** (the draft's "capture-style binding" was not implemented).
  - Switches: virtual pad enabled, gamepad mapping enabled (global default + per-game override).
- Text: new string resources (zh/en/ja sets, following the existing conventions).

## 7. Phased Implementation

| Stage | Content | Acceptance |
|---|---|---|
| 0 | canonical constants + InputSink interface + the converters (pure Kotlin + unit tests) | unit tests cover the conversion tables and boundaries |
| 1 | `InputRouter` + gamepad mapping (file loading + default presets + stick state machine), host integration: KRKR / ONS / krkrsdl3 / Siglus / Framebuffer / FVP / Artemis / Web (**currently only the Web family is wired up**) | verify key by key against the mapping table on a real device; no UI (a hand-written config file suffices for testing) |
| 2 | gamepad mapping settings UI + storage + per-game switch | full flow of editing key by key; takes effect after restart |
| 3 | `VirtualPadView` + edit mode + FAB; integrate all hosts; Web output goes through the JS receiver | add/remove/drag/resize/rebind and save in-game; positions do not drift when switching orientation |
| 4 | profile management (import/export/duplicate/presets) + legacy config migration + retiring `__touch_pad.js` and the two `TouchPadSaveBridge` sites | old layouts/presets fully migrated; old keys kept as a backstop |

Stage 1 is independently deliverable (gamepad mapping is itself a complete new feature) and does not depend on overlay rendering, so it can validate up front whether the canonical abstraction holds.

## 8. Risks and Boundaries

- External APK engines cannot be covered (see §1).
- The video overlay of SurfaceView-class engines (ONS `OnsIjkVideoView`, Artemis `VideoViewActivity` using `setZOrderOnTop`) covers the pad, so it must be hidden or handled during video playback.
- Web engine output falls back to JS synthesis: `evaluateJavascript` frequency is not a concern (key events are low-frequency), but the JS receiver must be injected early in the page (following the `</body>` injection channel).
- During text input (KRKR `KrInputConnection`, Siglus IME) events must be let through, otherwise in-game name entry is affected.
- Real-device regression surface across the hosts is large (8 hosts); Framebuffer's key set is limited (no Alt/some letters go through `fbText`), so the corresponding buttons need engine-tailored default keys in the profile.
- Cross-process file concurrency: atomic replacement + single-writer convention (the engine writes while a game is running, otherwise the app writes), and the app re-reads when it returns to the foreground.
- Conflict between edit mode and game input: edit mode swallows everything and only the edit bar/selected control is interactive (the same strategy as the JS version, made more reliable by the native implementation).

## 9. Test Plan

- Converter unit tests: the full Android→JS keyCode / VK / fbKey / rfvp tables.
- Router state machine: deadzone/hysteresis/diagonal synthesis/direction-set change debouncing, ordered multi-key dispatch, autoKeep toggle, consume policy (including the BACK exception and pass-through during IME).
- Data: profile/gamepad JSON round-trips, bad-data fallback to defaults, legacy `touch_pad_config`/presets migration cases.
- Storage: atomic writes, single-writer race conditions (simulated alternating writes).

## 10. Post-Review Implementation Notes (Rounds Six / Seven / Eight)

The following semantics were found by external review and have been fixed in the implementation (or explicitly recorded as **known limitations**); they are recorded here as the source of truth (details in the KDoc of each piece of code):

- **Per-pointer pass-through in the pad (including a known limitation)** (`VirtualPadView`): this View fills the whole screen and sits above the game surface, so it decides **per pointer** whether to consume—pointers hitting a button/direction control/FAB are taken over, while non-hitting `ACTION_DOWN` and `ACTION_POINTER_DOWN` return false to try passing them down to the layer below (WebView / virtual mouse layer); when the pad is hidden only the FAB participates, while edit mode still intercepts everything.
  **Effective scope**: only while this View is not yet a touch target—both "game-side gesture first, then press a virtual key" and "a second finger touches the screen after a finger has been let through" pass through normally.
  **Known limitation (confirmed in the eighth review round)**: once finger 1 lands on a pad element, this View is already a touch target, and subsequent new pointers are appended to the existing target by `ViewGroup` according to **geometric bounds**—in AOSP `ViewGroup.dispatchTouchEvent`'s pointer-down branch, when a new pointer falls inside the bounds of a child View that is already a target, it directly does `newTouchTarget.pointerIdBits |= idBitsToAssign; break;` **without consulting onTouchEvent's return value**; this View fills the whole screen → it necessarily hits, so that finger is taken by this View without producing any input and the game never receives it.
  That is, "hold the direction key to pathfind + use another finger to interact with the screen" still differs from the old DOM version (in the old version each button was an independent DOM event target and had no such problem). **A real fix requires changing the interaction structure**: a custom root ViewGroup that redirects per pointer (it must synthesize a DOWN stream for pointers joining mid-gesture), or a pad that does not fill the screen (one independent hit View per element, with a separate full-screen interception in edit mode). Both must first be verified with multi-finger sequences on real devices (one MV/MZ and one Tyrano), so this is recorded here as a **known limitation**, and no structural change is made without real-device verification.
- **Directional hysteresis applies per direction**: the reduced threshold of the stick/direction control applies only to the direction that is **already active**, preventing a held direction from mistriggering a diagonal in eight-direction mode as soon as lateral drift just passes 0.22r (the old implementation lowered the threshold globally).
- **Legacy pixel-coordinate migration**: beta ≤ 1.20's old JS stored viewport pixel coordinates, so migration normalizes by the old viewport (hosts are fixed to `sensorLandscape`, long edge = width, short edge = height); with no valid viewport only clamping is applied.
- **Per-game profile selection**: the per-game settings page provides a "Button profile" row (with "Follow global" first), and the necessity of that entry is explained in §4.3—migration writes a per-game override, and without the entry the user could neither switch back to following the global setting nor change that game's profile.
  The eighth review round settled three semantics for that row: consistent with the other override items on the same page it uses "edit → save from the top bar" (a selection only changes local state, and **it is persisted on save only if that row was actually changed**—a dirty flag, to avoid overwriting a fresh override written elsewhere with the page's stale snapshot); the override value and the profile list are read **together** on IO, showing "Loading..." and genuinely disabling the row (`enabled = false`) until ready, and a read failure switches to a load-failure state (no longer masquerading as normal with "Loading..."); when the profile referenced by the override has been deleted (a dangling reference) it is explicitly listed and selected as "Profile missing", and selecting the placeholder item does not write anything.
- **Gamepad mapping defaults**: enabled by default for **all Web hosts** (unlike the per-engine tiering of virtual buttons), which is a **default-behavior change** that release notes must state explicitly; if it should become tiered, the changes are concentrated in `InputConfigStore.resolve` + the two hosts + the docs.
- **Cross-process visibility**: switches and profile selection are stored in SharedPreferences, which the engine subprocess caches in-process after the first read; changes made while running (leaving via Home to change settings and returning to the same session) do not take effect, and "the profile file has changed but the switch still holds the old value" can occur. Making them share a source with the profile files (switches also going through files, re-read on every launch) is a later item.
- **RTP and import mutual exclusion** (`RpgMakerRuntimeEnvironment`): the exclusion between "clear" and an in-flight import is handled by a process-level in-flight registry in core (`clearRtp` returns `IMPORT_IN_FLIGHT` when the same subtype is in flight); the UI's greyed-out button is only a convenience—it can be bypassed by "exiting/recreating the settings page" or by "starting import B while import A is running", and deleting someone else's in-progress temp directory would make that import commit with partial content.
  The eighth review round filled three gaps (details in the `inFlightImports` / `registerInFlightImport` KDoc): registration and deregistration both happen inside `importLock`, and registration precedes the import side's `mkdirs` (the clear side's "look up registrations → wipe temp dirs" and the import side's "register → create dir" can no longer interleave); registration keys are normalized by `rtpDirName` (spelling variants of the same subtype hit the same entry); the value is a concurrent set of "one group of temp dirs per subtype" (when two imports of the same subtype run concurrently, a deregistration from the **one that registered later but finished first** does not make the earlier registrant lose its registration; with a single File only the last registration remains on the key, and it is exactly this finishing order that removes the whole key).
- **SAF path containment validation**: both the zip and directory-tree import paths share the "reject separators / `..` / normalized escape" check; `KrSafMirror`'s mirror follows the same rule. The names are entirely controlled by the DocumentsProvider, and not validating them amounts to lending MANAGE_EXTERNAL_STORAGE write permission to a malicious provider (the SAF version of Zip Slip).
- **Screenshot destination**: by default it writes to the public gallery `DCIM/tyranornext` (which enters the gallery index and cloud backup), an **intentional trade-off**; if the product side wants privacy first, it should switch to a private directory plus explicit sharing. The save path has its own watchdog (resetting the single-flight flag and switching thread pools if the write hangs), so subsequent taps do not keep returning Busy forever.