# Anime4K Rendering Super-Resolution Integration Plan

> Status: M1–M4 implemented (build passes; on-device frame rate and image quality pending verification)
> Scope: KR2/Kirikiroid2 path (full port of Phase 1 + Phase 2); krkrsdl3 / ONS reserved for a dedicated Phase 3
> License: Anime4K (bloc97) MIT — porting and modification permitted; ported artifacts are distributed under this repository's GPL-2.0

## Implementation Record (2026-09-06)

Two corrections to the original plan during actual delivery:

1. **Mode system correction**: Anime4K v4.0 consists entirely of CNN shaders; the "no-CNN lightweight mode" of the v3 era does not exist.
   Game frames are already at the screen's native resolution, so no Upscale chain is needed; the actual choice is the **Restore chain**:
   `Restore_CNN S/M/L` (three levels of line reconstruction) + `Restore_CNN_Soft S/M/L` (soft variants) + `Deblur_DoG` (deblur, RGBA8 safe).
   Clamp_Highlights depends on mpv-proprietary `STATSMAX`/`PREKERNEL` hooks and is not ported for now.
2. **Settings delivery channel correction**: instead of injecting through the `krkr_engine_prefs` JSON / Kirikiroid2Preference.xml,
   a **dedicated intent extra `tyranor_anime4k`** is passed directly — the mode must be known before the GL SurfaceView is constructed
   (when the EGL context version is fixed); the extra channel is more direct and avoids XML key ownership issues.

Key implementation decisions:

- **Conditional ES3 context**: `setEGLContextClientVersion(3)` only when super-resolution is enabled (CNN intermediate values can be negative,
  so ReLU encoding needs an RGBA16F render target; an ES3 context is backward compatible with the engine's ES2 rendering path, giving zero regression when disabled)
- **Three-layer capability probing**: device GLES3 features (`reqGlEsVersion`) → RGBA16F FBO completeness → shader compilation;
  any failure silently disables it for the session (no crash)
- **Runtime parsing of the mpv hook format**: `MpvHookShader` parses the `//!DESC/BIND/SAVE/WIDTH` directives,
  and `Anime4kPostProcessor` generates ES 3.00 wrapper shaders (`NAME_tex/NAME_texOff/NAME_pos/NAME_pt`
  semantically equivalent to mpv built-in macros); one pipeline supports all 7 shader files with no manual per-file rewriting
- **Self-referencing SAVE double buffering**: passes whose `SAVE` target is also `BIND`-ed (e.g. Deblur's MMKERNEL)
  swap between dual textures to avoid same-frame read/write conflicts
- **Injection point**: in `Cocos2dxRenderer.onDrawFrame()` after `nativeRender()`, before the GLSurfaceView
  implicit swap; GL state is saved/restored (viewport/program/blend/scissor/FBO/texture binding)

Delivered files:

| File | Responsibility |
|---|---|
| `engine/src/main/assets/anime4k/*.glsl` | bloc97 MIT shaders ×7 (header copyright retained) |
| `engine/.../com/core/gl/Anime4kRuntime.java` | Configuration (extra parsing, GLES3 probing, mode→shader mapping) |
| `engine/.../com/core/gl/MpvHookShader.java` | mpv hook format parser |
| `engine/.../com/core/gl/Anime4kPostProcessor.java` | GL runner (FBO pool, shader generation, per-frame execution, state protection) |
| `engine/.../org/cocos2dx/lib/Cocos2dxRenderer.java` | Three injection points (created/changed/drawFrame) |
| `engine/.../org/cocos2dx/lib/Cocos2dxGLSurfaceView.java` | Conditional ES3 context |
| `engine/.../KirikiroidLauncherBaseActivity.java` | onCreate reads extra (before super), onDestroy reset |
| `app/.../EngineLauncher.kt` | KR2 path injects extra (per-game override > global, whitelist validation) |
| `app/.../EngineSettingsStore.kt` | Global key `kr_anime4k_mode` (off/s/m/l/soft_s/soft_m/soft_l/deblur) |
| `app/.../PerGameSettingsStore.kt` | Per-game override field `anime4k_mode` |
| `app/.../SettingsScreen.kt` + `EngineSettingsText.kt` | Rendering card "render super-resolution" dropdown (shown only for the kirikiri2 kernel) |
| `app/.../PerGameSettingsScreen.kt` | Rendering card tri-state override (follow global / force) |

Items pending verification (on-device):

- [ ] Visual inspection of the sharpening effect (720p source games with S/M level comparison recommended)
- [ ] Frame rate (`adb shell dumpsys gfxinfo`; 60fps expected to be met at level S on mid-range devices, level L may need a 30fps lock)
- [ ] Pipeline rebuild after screen switch / background / screen-off resume (context loss path)
- [ ] Actual compatibility of the ES3 context with cocos2d-x 2.x rendering (key regressions: translucency, blend modes, older devices)

---

## 1. Background and Goals

Many VN games have 720p source material that the engine bilinearly stretches to 2K/3K screens, blurring the lines. Anime4K's line-reconstruction algorithm is designed precisely for the scenario of "low-resolution anime imagery being enlarged".

**Overall goal**: after the KR2 engine renders each frame and before the buffer swap, insert an Anime4K GLSL post-processing chain to achieve real-time super-resolution of the game image.

**Out of scope**:
- Does not take the mpv / mpvlibAndroid route (it can only upscale video frames decoded by mpv itself and cannot act on engine rendering)
- Does not use Anime4K's official mpv `//--HOOK` syntax shaders (they bind to mpv render stages and cannot be used directly)
- Phase 1 does not touch the krkrsdl3 / ONS / Tyrano paths

## 2. Principle: Injection Point

KR2 uses `GLSurfaceView` (a Java-driven render loop); in `Cocos2dxRenderer.onDrawFrame()`, after `nativeRender()` is called and before `eglSwapBuffers`, the EGL context is already current — GL calls can be inserted directly with **no native hook required**.

```
Engine C++ draws the game frame (default framebuffer)
        ↓
★ Injection point (Java layer, inside onDrawFrame)
   1. default framebuffer → FBO texture copy
   2. Anime4K multi-pass shader chain (FBO ping-pong)
   3. full-screen quad drawn back to the default framebuffer
        ↓
eglSwapBuffers presents the frame
```

Key files:
- `engine/src/main/java/org/cocos2dx/lib/Cocos2dxRenderer.java` (injection point)
- `engine/src/main/java/org/cocos2dx/lib/Cocos2dxGLSurfaceView.java` (EGL context version confirmation, see §5)

## 3. Phase Breakdown

```
POC (phase 1) → Mode B full port (phase 2A) → Mode A/C CNN (phase 2B) → settings integration (phase 3)
                                                      ↘ krkrsdl3/ONS SDL hook (phase 3, separate project)
```

---

## 4. Phase 1: POC — Single-Pass Sharpening Verification Pipeline

**Goal**: get the injection pipeline working + meet the frame rate target. Image quality is not the concern.

**Acceptance criteria**:
1. Visible sharpening appears on the game image (single-level Anime4K Restore M)
2. Frame rate drop ≤ 10% in 60fps scenes (mid-range reference: Snapdragon 7 series)
3. The switch takes effect immediately; zero GL cost when disabled (no idle passes left running)
4. No flicker, no black screen, and the pipeline rebuilds correctly after orientation changes / pause-resume

### 4.1 Task Breakdown

| # | Task | File | Notes |
|---|---|---|---|
| P1 | Confirm `EGL_CONTEXT_CLIENT_VERSION` ≥ 3 | Cocos2dxGLSurfaceView's setEGLContextClientVersion | Otherwise half-float is blocked in the CNN phase (2B); a single-pass POC works on ES 2.0 too, but confirming 3 up front avoids rework |
| P2 | Create the `Anime4KPostProcessor` class (engine module) | `engine/.../gl/Anime4KPostProcessor.java` | Encapsulates: FBO create/destroy, texture management, shader compilation, single-pass drawing. Depends only on `GLES30` APIs, zero new native dependencies |
| P3 | Port the Restore M shader (single file) | `engine/src/main/assets/anime4k/restore_m.frag` (or raw res) | Convert from mpv hook syntax to a standard full-screen quad fragment shader: entry `main()`, input texture uniform, `//--HOOK`/`//--BIND` directives removed |
| P4 | Inject into onDrawFrame | Cocos2dxRenderer.java L132-L177 | Call `postProcessor.process()` after `nativeRender()`; the processor's enabled state must be read atomically (queried every frame by the render thread) |
| P5 | Temporary switch (for debugging) | Local broadcast / intent extra temporarily | The official settings system only lands in phase 3; use the simplest approach to toggle during the POC |
| P6 | Frame rate and correctness verification | — | `adb shell dumpsys gfxinfo`, on-device visual inspection, A/B comparison screenshots with the switch |

### 4.2 Key Implementation Details

**Framebuffer copy**: the default framebuffer cannot be sampled as a texture, so either `glCopyTexSubImage2D` is needed (simple but with bandwidth cost) or an off-screen FBO redirects the engine render target (better but more invasive). The POC uses `glCopyTexSubImage2D`; whether to switch is evaluated at the full port stage.

**Lifecycle**: the GLSurfaceView's GL context may be destroyed and recreated (onPause/onResume, screen switches), so all FBO/texture/program handles must be released and rebuilt on `onSurfaceChanged`/context loss. `Anime4KPostProcessor` must expose `releaseGlResources()`.

**Threading**: `onDrawFrame` runs on the GL thread while the settings switch comes from the main thread — `volatile`/`AtomicBoolean` is enough; no cross-thread GL calls.

---

## 5. Phase 2A: Mode B Full Port (Lightweight Multi-Pass)

**Goal**: the complete Anime4K Mode B chain (Restore + Upscale + Final, no CNN) as the minimum viable release version.

**Acceptance criteria**: line reconstruction is visible to the naked eye in a 1080p→2K scenario; frame rate drop ≤ 20% at 60fps on mid-range devices; low-end devices are prompted to disable it.

### 5.1 Task Breakdown

| # | Task | Notes |
|---|---|---|
| B1 | FBO ping-pong manager | Two FBOs alternate as input/output; size = screen resolution; one binding switch per pass |
| B2 | Port the Restore L/M, Upscale, Final shaders | The full Mode B set of 4-5 passes; normalized into the "texture input → FBO output" standard structure with common uniforms (srcSize/dstSize) |
| B3 | Pass chain builder | Reads the configured pass sequence per mode and executes it in order at runtime; reserves the interface for the CNN passes of 2B |
| B4 | Evaluate `glCopyTexSubImage2D` → engine render target redirection | Bandwidth optimization; abandoned if the gain is < 10%, keeping the copy approach |
| B5 | Inter-frame change detection (optional optimization) | VNs are static most of the time: compare frame hashes (CPU readback is expensive, so instead use GPU-side downsampled difference detection + a `glReadPixels` 1×1 probe) and skip the whole chain for static frames, redrawing only the cached result |

---

## 6. Phase 2B: Mode A/C (CNN Convolution Passes)

**Goal**: high-quality mode, requiring half-float textures.

**Acceptance criteria**: Mode A usable at 60fps or a 30fps lock on flagship devices; correct fallback based on capability probing.

| # | Task | Notes |
|---|---|---|
| C1 | Device capability probing | `GLES30` version + `EXT_color_buffer_half_float` / `OES_texture_half_float` extension queries; hide the Mode A/C options when unsupported |
| C2 | Port the CNN shaders (Restore CNN L/M, Upscale CNN) | Convolution weights embedded in the shader as `const` arrays (permitted by the MIT license); half-float FBO |
| C3 | Performance tiers and fallback strategy | Runtime frame rate monitoring (moving average); automatic downgrade to Mode B after sustained below-threshold readings, then disable; the exact tier rules are set after on-device calibration |
| C4 | Power consumption labeling | Mark CNN modes as "high power" on the settings page; the default mode is Mode B |

---

## 7. Phase 3: Settings Integration

Reuse the existing settings system and injection channel; do not reinvent the wheel.

### 7.1 Settings UI

| Location | Content |
|---|---|
| Global engine settings → new "render super-resolution" card in the KRKR card | Switch + mode selection (off / Mode B / Mode A / Mode C, filtered by C1 capabilities) |
| PerGameSettingsScreen → same-named override item in the KIRIKIRI branch | Tri-state (follow global / force on / force off), reusing `OverrideChoice` |
| Follow existing conventions | Two-tier text size rules (items use bodyMedium, titles use titleMedium Bold); AppAlertDialog; the search field convention does not apply |

Related files: `app/src/main/java/com/tyranor/next/ui/settings/SettingsScreen.kt` (L703-L765 KRKR card area), `EngineSettingsText.kt` (option text source), `PerGameSettingsScreen.kt` (L244-L320 KIRIKIRI branch).

### 7.2 Settings Storage and Delivery Chain

```
EngineSettingsStore(global key, e.g. kr_upscale_mode)
        ↓ EngineLauncher.buildKirikiriIntent() (L449-L458 existing merge logic)
PerGameSettingsStore override merge → krkr_engine_prefs JSON extra
        ↓ KirikiroidLauncherBaseActivity.applyEnginePreferences()
Kirikiroid2Preference.xml own keys (e.g. tyranor_anime4k_mode)
        ↓ read when the engine process starts
Cocos2dxRenderer / Anime4KPostProcessor enabled
```

- Runtime key changes on the engine side take effect immediately (the in-shell "global settings" page and these settings write to the same XML, so new keys must be registered in the `_rinne_injected_*` ownership marker mechanism of `applyEnginePreferences()` to prevent the shell side from overwriting them on write-back)
- Mode changes (e.g. B→A) must trigger a pipeline rebuild: after writing the key, the settings page notifies the rebuild through the existing shell process communication channel (following the notification approach used for directional key injection)

### 7.3 Documentation and Compliance

- Add bloc97/Anime4K (MIT) to the README acknowledgements
- Add a link to the Anime4K license text in the "About / Open source licenses" entry of the engine settings page

---

## 8. Risk List

| Risk | Level | Mitigation |
|---|---|---|
| GLSurfaceView context version < 3 | Low | Confirm first in P1; `setEGLContextFactory` can be customized (KR2 source is at hand) |
| Handle leaks/crashes after context destruction and recreation | Medium | P2 lifecycle management is an acceptance item; cover screen switch, background, and screen-off scenarios |
| `glCopyTexSubImage2D` bandwidth bottleneck (high-res screens) | Medium | B4 evaluates redirection; VNs have many static frames, mitigated by B5 frame skipping |
| CNN frame rate collapse on mid/low-end devices | High | C3 automatic downgrade + Mode B default |
| Shell settings page and launcher settings writing the same key and overwriting each other | Medium | Ownership marker registration in §7.2 |
| Shader compatibility (some GPU drivers fail to compile) | Medium | Catch compile failures → disable that mode at runtime and log, without crashing |
| Rendering conflicts with in-engine UI (TVPGameMainMenu etc.) | Low | Post-processing acts on the whole frame, so the menu bar is sharpened as well, which is visually acceptable; if not, bypass while the menu is open (evaluated in phase 2) |

## 9. Milestones and Sequence

| Milestone | Content | Exit condition |
|---|---|---|
| M1 | POC (§4) | Single pass working + frame rate target met |
| M2 | Mode B (§5) | Image quality accepted + mid-range target met |
| M3 | Mode A/C (§6) | Flagship target met + fallback strategy effective |
| M4 | Settings integration (§7) | Global + per-game override full chain usable |

Phases 1/2 can be delivered and verified independently with the debug switch before any settings UI exists; M4 depends on M2 onwards being usable (Mode B is the minimum release version).

## 10. Phase 3 Outlook (Outside This Plan)

- krkrsdl3 / ONS SDL EGL hook (requires RE of the SDL-internal `egl_data` struct to modify function pointers; separate project)
- The Tyrano path is not viable (system WebView compositor; the app layer cannot inject into it)
- Super-resolution configuration distribution for external APK engine modularization