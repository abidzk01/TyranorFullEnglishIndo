# Web Shell Fixed Port and Save Origin (Tyrano / WebOther / VN)

> Problem: WebView's `localStorage` / `IndexedDB` are isolated by **origin**, while the local HTTP
> server previously used `ServerSocket(0)` for a random port → the origin was different on every
> launch → the web-side saves (localStorage/IndexedDB) could not be read, showing up as "lost
> saves". The original Tyranor avoided this problem with a fixed port (`webGamePort`, default 23333).

## Implementation

| Layer | Location | Behavior |
| --- | --- | --- |
| Settings | App: Settings → Engine Settings → Tyrano (Tyrano / WebOther / VN share the same WebView host settings) adds "Web service port" | 1–65535, default **23333** (identical to the original `webGamePort`, so the old save origin can be reused); invalid input cannot be saved in the dialog |
| Storage | `EngineSettingsStore.KEY_WEB_SHELL_PORT` (`web_shell_port`) | `normalizeWebShellPort`: 1..65535 is valid; empty/0/out-of-range/non-numeric falls back to `LaunchContract.WEB_SHELL_PORT_DEFAULT` |
| Resolution | `EngineSettingsResolver` → `ResolvedEngineSettings.webShellPort` | Three-level settings: `EffectiveEngineSettings.resolveWebShellPort` (a valid per-game override takes priority; invalid/empty falls back to global) |
| Per-game override | Per-game settings → Tyrano / WebOther / VN card "Web service port" | `PerGameSettingsStore.F_WEB_SHELL_PORT` (`web_shell_port`); input 1–65535, invalid/empty cannot be saved in the dialog, and it can be switched back to "Follow global" |
| Dispatch | `EngineLauncher` Web launch branch | Only `TYRANO / WEB_OTHER / VN` inject `LaunchContract.WEB_SHELL_PORT` (RPG MV/MZ keeps the existing random-port behavior) |
| Host | `TyranoActivity` (`intent.getIntExtra(WEB_SHELL_PORT, 0)`) | The port participates in `behaviorSignature`: after changing the setting, restarting the single game rebuilds the session |
| Service | `TyranoLocalHttpServer(preferredPort)` → `com.core.web.WebShellServerSocket.bind` | Bind the desired port first (`127.0.0.1`, `setReuseAddress` handled by the ServerSocket default); if occupied/invalid, fall back to a random port and set `usedFallbackPort` |
| Prompt | `engine_web_shell_port_fallback` (three languages in the engine module) | On fallback, Toast "Port X is occupied, using Y this time; web saves may not carry over" |

## Notes and Boundaries

- `RpgMakerLocalHttpServer` also supports `preferredPort` (the host does not dispatch it yet, keeping both sides symmetric and extensible); MV/MZ saves go through the file bridge and are unaffected.
- The per-instance random Cookie auth token of the RPGM service is unrelated to the port choice; a fixed port does not weaken that protection.
- When the port is occupied (for example by another app or a leftover session), a temporary port is used as a fallback to keep the game runnable; in that case the save origin of that run differs from the fixed port.