# RPG Maker MV/MZ Game Modifier Implementation Plan

## 1. Goals

Add a built-in game modifier to the existing RPG Maker MV/MZ WebView host in Tyranor Next, covering common runtime modification capabilities, while satisfying the following constraints:

- Only enabled for local games already identified as RPG Maker MV/MZ.
- Does not modify the game directory, does not copy third-party decryption scripts, and does not depend on extra native dynamic libraries.
- MV/MZ use the same public API, with a compatibility layer handling version differences.
- Modifier switches and persistent state are isolated per game and do not rely on the `localStorage` of a random port.
- While the menu is open, touch, keyboard, and wheel input are isolated; the Android back key closes the menu first.
- Modification behavior calls RPG Maker's public runtime methods whenever possible, ensuring window refresh, event linkage, and save consistency.

## 2. Overall Architecture

```text
EngineLauncher
  ├─ global settings + per-game override
  └─ Intent: rpgMakerModEnabled / rpgMakerModGameId
                │
                ▼
TyranoActivity (RPG_MV / RPG_MZ only)
  ├─ RpgMakerSaveBridge: Save / Load / Exists / Remove
  ├─ RpgMakerModBridge: read and write per-game modifier state
  ├─ inject existing MV/MZ compatibility patches
  └─ inject TyranorMod Core + UI + CSS
                │
                ▼
RPG Maker JavaScript runtime
  ├─ window.TyranorMod: unified modifier API
  ├─ window.TyranorModUI: overlay menu
  └─ prototype hooks: battle, walk-through-walls, event acceleration, dialogue fast-forward
```

## 3. Feature Scope

### 3.1 Quick Actions

- Invincibility
- One-hit kill
- Guaranteed critical hits
- Walk through walls
- Event acceleration
- Dialogue fast-forward
- Gold setting/max out
- Full party recovery

### 3.2 Data Modification

- Item, weapon, and armor lookup with quantity setting
- Character level, HP, MP, and base parameter bonus modification
- Skill learning/forgetting
- State application/removal
- Equipment viewing and changing
- Game switches, variable search and modification

### 3.3 Map, Battle, Saves

- Current map/coordinates viewing
- Current map coordinate movement, cross-map teleport
- Enemy/ally battle snapshot, enemy HP modification, eliminate all enemies
- Force victory, force escape
- Save slot query, save, load, delete

## 4. Implementation Steps

- [ ] Add `__rpgmaker_mod_core.js`, implementing the unified API, the MV/MZ compatibility layer, and idempotent hooks.
- [ ] Add `__rpgmaker_mod_ui.js` and `__rpgmaker_mod.css`, implementing the mobile overlay menu and input isolation.
- [ ] Extend the HTML injector to support standalone CSS/JS resource tags without writing into the game directory.
- [ ] Extend `RpgMakerSaveBridge` to complete save deletion capability.
- [ ] Add `RpgMakerModBridge`, using Android SharedPreferences to persist modifier state per game.
- [ ] Modify the Android back key flow: close the menu first when it is open, otherwise keep the double-tap exit behavior.
- [x] Add a dedicated "RPG Maker engine settings" entry and settings page, providing external network, standalone saves, and a modifier switch that is on by default.
- [ ] Add RPG MV/MZ per-game override switches, delivered by the launcher to the host.
- [ ] Add automated tests for injected HTML, launch settings merging, and key JS structures.
- [ ] Complete the Debug build, unit tests, installation on a connected device, and basic launch verification.

## 5. Compatibility Strategy

- Identify MV/MZ via `Utils.RPGMAKER_NAME`, core classes, and API characteristics, not relying on a single version number.
- Hooks save the original method and use a unique marker, preventing recursion caused by page reloads or repeated plugin installation.
- Poll while the game objects are not ready; re-apply persistent states such as walk-through-walls after a new game or a save load.
- Uniformly wrap MZ's Promise save API and MV's synchronous API as Promises.
- Filter empty slots from database lists, treat name and description as search fields, and avoid rendering all data at once.
- Return displayable errors for nonexistent classes, databases, or methods, without crashing the game's main loop.

## 6. Security Boundaries

- Only injected for `WebGameType.RPG_MV/RPG_MZ` when the setting is enabled.
- The bridge exposes only state read/write and save deletion, never arbitrary file paths or command execution.
- State keys are fixed by the host to the current game ID; JavaScript cannot select another game.
- All modifier resources come from APK assets; no code is downloaded from the network.
- Plain Tyrano, VN, and WebOther pages do not register the modifier bridge.

## 7. Acceptance Criteria

- MV/MZ games do not error due to modifier injection when entering the title screen and map scenes.
- The floating button opens the menu, and game input is restored after closing it.
- The back key closes the menu first, and the original double-tap exit behavior is retained when the menu is closed.
- Gold, items, characters, switches, and variable modifications take effect immediately.
- Battle hooks can be toggled independently, restoring the original behavior when turned off.
- Modifier state persists across Activity restarts, and different games do not affect each other.
- Save deletion takes effect through the app-private/game-directory save bridge.
- Modifier resources and the bridge are not injected when globally disabled or disabled per game.

## 8. Implementation Record

Record the actual changes, test results, device verification results, and remaining limitations here after implementation is complete.