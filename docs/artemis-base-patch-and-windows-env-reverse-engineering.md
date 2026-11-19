# Reverse Engineering of Artemis "Add Base Patch / Add Windows Environment Patch"

> Target of analysis: the original reverse-engineered package of Tyranor v2.3.4 (`/Users/weiss/Desktop/decompiled/Tyranor_v2.3.4.apk`)
> Static material: apktool output `/Users/weiss/Desktop/decompiled/tyranor_out` (smali) + jadx decompilation (`/tmp/tyranor_jadx`; line numbers cited here refer to jadx)
> Purpose: reconstruct the complete call chain and file rewriting logic of the two patch menu items, as the basis for implementing/aligning the TyranorNext Artemis patching capability

---

## 1. Summary

| Item | Add base patch (add_patch) | Add Windows environment patch (add_patch2) |
|---|---|---|
| Core implementation | `p048f5.F.J(game)` (smali `f5.1/F.smali:2292`) | `p048f5.F.K(game)` (smali `f5.1/F.smali:4550`) |
| Input | `*.pfs` / `*.pfs.NNN` archives in the game directory | Same as above |
| Extracted from package | `system.ini`, `list_windows*`, `movie*` (video extensions) | `system.lua`, `init.lua` |
| File rewriting | `system.ini` fully rewritten to a minimal `[ANDROID]` section; `list_windows*` renamed to `list_android*`, `.tbl` tablet switch flipped | Line by line, `game.os = ...` is forced to `game.os = "windows"` |
| Extra side effect | Renames any `<x>.pfs(.NNN)` **to `root.pfs(.NNN)`** (the Android runtime only recognizes root.pfs) | Same as left (K also goes through the same `I()` normalization) |
| Trigger entry | Artemis game detail drawer menu item; automatic patch (see §6) | Manual menu item only |
| Idempotency | Re-running unpacks again and overwrites same-named files (`system.ini` is rewritten again from the original package content) | Same as above (the `game.os` line is normalized again) |

In one sentence: **the base patch drops the boot files required by the PFS onto disk "unpackaged" and rewrites them for Android; the Windows environment patch changes the platform check of the Lua boot script to Windows.**

---

## 2. Symbol and File Cross-Reference

| Meaning | jadx (Java) | smali | Notes |
|---|---|---|---|
| Game model | `M3/g.java` | `M3/g.smali` | `f5489b` = game directory path, `f5493f` = type string (`"Artemis"`), `f5500n` = `type == "Artemis"`, `f5503q` = fake game |
| Detail drawer list | `p092l4/t.java:150-161` | `l4.1/t.smali` | `when(type)` branch: 5 items appended when `Artemis` |
| Menu item rendering | `p098m4/b.java` | `m4.1/b.smali` | case 1 = `R.string.add_patch` (add base patch); case 2 = `R.string.add_patch2` (add Windows environment patch) |
| Click → coroutine | `M3/d.java:100-106` | `M3/d.smali` | case 9 → `p098m4.c` (base patch); case 10 → `p098m4.d` (Windows environment patch); both run on `z6.d.f23306c` (IO dispatcher) |
| Patch task | `p098m4/c.java` / `p098m4/d.java` | `m4.1/c.smali` / `d.smali` | Shows a persistent "Patching..." toast before execution and a success/failure toast after |
| Core implementation | `p048f5/F.java` | `f5.1/F.smali` | See table below |
| Automatic patch | `Q3/l.java:370-393`, `Q3/k.java`, `Q3/h.java` | `Q3/l.smali` etc. | Asks or automatically runs `F.J` per settings when launching an Artemis game |

Key functions inside `F`:

| Function | jadx line | smali line | Role |
|---|---|---|---|
| `H(File)` | ~370 | 2097 | PFS file name matching: regex `.*?\.pfs(\.[0-9]{3})*` |
| `I(File)` | 379 | 2179 | PFS normalization: renames `<x>.pfs(.NNN)` to `root.pfs(.NNN)`, returns the normalized File |
| `J(g)` | 392 | 2292 | Base patch |
| `K(g)` | 698 | 4550 | Windows environment patch |
| `M(RAF)` | 919 | 5933 | Little-endian int32 read (`b0 \| b1<<8 \| b2<<16 \| b3<<24`) |
| `N(BufferedReader)` | 925 | 6001 | `readLines()` (read text line by line) |
| `R(String, byte[])` | 996 | 6405 | Write file (automatic `mkdirs`) |
| `W(g)` | — | 6712 | "Unpack game" full unpack (another menu item, not the focus here) |

---

## 3. PFS Archive Parsing (the common foundation of both patches)

### 3.1 Archive Collection and Renaming

```
H(name): name.lowercase() matches  .*?\.pfs(\.[0-9]{3})*      // root.pfs / x.pfs / x.pfs.001
I(file): if (!H(file.name)) return null
         base = file.name.substringBefore(".") + ".pfs"        // x.pfs.001 → x.pfs; root.pfs.002 → root.pfs
         target = File(file.absolutePath.replace(base, "root.pfs", ignoreCase = true))
         file.renameTo(target); return target
```

Key points:
- **The original renames the whole `x.pfs` family in the game directory to the `root.pfs` family** (Android Artemis only loads `root.pfs`). The `root.pfs` family itself is a no-op.
- **Renaming overwrites each other when multiple pfs families exist in the directory** (the original performs no conflict check); a game that actually runs generally has only one boot package plus volumes.
- The patch iteration is based on a `File.listFiles()` snapshot; each candidate file is first renamed via `I()` and then opened for read/write.

### 3.2 Header and Key Table

```
magic:  'p' 'f' <versionChar>        // the 3rd byte is a character digit, e.g. '8' → version = 8
tableLen = M()                        // little-endian int32
table    = read(tableLen bytes)       // raw archive entry table data
key      = SHA-1(table)               // 20 bytes, used for data XOR
```

### 3.3 Entry Table

```
count = M()
repeat count:
    nameLen = M()
    name    = read(nameLen) as UTF-8, backslash → current platform separator
    _       = M()                     // reserved field (skipped by both the original and TyranorNext)
    offset  = M()                     // data offset within the archive
    size    = M()                     // data length
```

Validation: `offset > archive file length` → `return false` directly (the entire patch fails).

### 3.4 Data Decryption and Writing

```
seek(offset); data = read(size)
if (version >= 8) for i in data: data[i] ^= key[i % 20]     // ★ XOR condition = archive version >= 8
str6 = game dir + sep + entry relative path
R(str6, data)                                                // write file (creates directories automatically)
```

> Note: the XOR condition is judged by the **archive version number**, not the data length. The existing TyranorNext implementation uses "data length ≥ 8"; see the difference table in §8.

### 3.5 Failure Semantics

| Case | Return |
|---|---|
| Game directory cannot be listed (`listFiles() == null`) | `true` (treated as nothing to do) |
| No PFS in the directory | `true` |
| The matched PFS magic is not `pf` | `false` |
| Entry offset exceeds the file length | `false` |
| Normal completion | `true` |

`J/K` return a boolean → the UI shows `add_patch_success` / `add_patch_failed`.

---

## 4. Base Patch (`F.J`)

### 4.1 Extraction Set (only these entries are written out)

| Match condition | Criterion |
|---|---|
| `system.ini` | Path **contains** (case-insensitive) "system.ini" (can match subdirectory paths) |
| `list_windows` | Path contains "list_windows" |
| `movie` | Path contains "movie" **and** the extension ∈ {`.dat`, `.mp4`, `.ogv`, `.wmv`, `.mpg`, `.webm`} |

All other entries are skipped (not written to disk, and they do not affect PFS renaming).

### 4.2 `system.ini` Rewrite (Overwrite)

Original logic (`p048f5/F.java:505-540`):

1. Read the original file with a `BufferedReader` (at this point the file is the raw content just extracted from the PFS);
2. Scan line by line, recording:
   - whether `CHARSET` appeared at all (any line containing it) → determines whether the output includes `CHARSET = UTF-8`;
   - entry into/exit from the `[WINDOWS]` section (ending when a `[ANDROID]`/`[IOS]`/`[WASM]`/`[SWITCH]` section header is encountered);
   - within the `[WINDOWS]` section, the last full `WIDTH ...` / `HEIGHT ...` line (defaults `WIDTH = 1280` / `HEIGHT = 720`);
3. **Overwrite the original file entirely with the new content**:

```ini
[ANDROID]
WIDTH = <the WIDTH line from [WINDOWS], default 1280>
HEIGHT = <the HEIGHT line from [WINDOWS], default 720>
SIDECUT = 0
BOOT = system/first.iet
FONT_CACHE_SIZE = 8388608
CHARSET = UTF-8        ; only if CHARSET appeared in the original file
```

That is: **all other sections of the original file (including `[WINDOWS]` itself, key mappings, etc.) are discarded**, keeping only this one Android boot section.

### 4.3 `list_windows*` Renaming and `.tbl` Rewriting

1. `list_windows` → `list_android` in the file name (path) (case-sensitive replacement);
2. If the renamed file name is exactly `list_android.tbl`, process line by line:
   - after `trim().lowercase()`, a line equal to `config_tablet=0` → output `config_tablet=1,`;
   - equal to `config_tabletui=0` → output `config_tabletui=1,`;
   - other lines are output as-is (with `\n` appended to each line).

Purpose: make the Android side use the tablet UI/touch layout.

### 4.4 Video Files

`movie*` entries are filtered by extension and **written to disk verbatim** (no sanitizing, no renaming) for playback on Android; the `[ANDROID]` section of `system.ini` does not reference them (the engine looks them up by path itself).

### 4.5 Overall Effect

- Unpackaged: the `system.ini` / `list_android*` / videos needed for boot are extracted from `root.pfs` into the game directory;
- Archive normalization: `x.pfs(.NNN)` → `root.pfs(.NNN)`;
- Android-ize the config: resolution inherited from the Windows section, `SIDECUT=0`, `BOOT=system/first.iet`, 8MB font cache, optional UTF-8.

---

## 5. Windows Environment Patch (`F.K`)

### 5.1 Extraction Set

| Match condition | Criterion |
|---|---|
| `system.lua` | Path contains "system.lua" (case-insensitive) |
| `init.lua` | Path contains "init.lua" |

Other entries are skipped; the PFS normalization renaming of `I()` also applies (this is a side effect of this patch).

### 5.2 Text Rewriting

Line-by-line match and replacement (regex, `matches()` full-line match):

```regex
[\t\s]+?game\.os[\s\t]+?=[^=].+
```

Matched lines are replaced entirely with:

```lua
game.os = "windows"
```

Other lines are kept as-is (`N()` reads lines → `StringBuilder` concatenation → overwrite write-back). The purpose is to make the platform branch in the PC port script take the Windows path (on Android the default is `game.os = "android"`, and the Lua side may have differentiated logic, such as save directories and file system paths).

---

## 6. Automatic Patch Flow (at Launch)

`Q3/l.c(game, skipCheck)` is the launch precondition for Artemis games (one of the `p048f5.F.J` call sites):

```
if (!skipCheck && game.type == "Artemis" && !File(game.path, "system.ini").exists()):
    strategy = prefs["artemisAutoPatch"]        // setting item artemis_auto_patch
    when (strategy):
        "true"  -> automatic patch (Q3/l.d)
        "ask"   -> show "run automatic patch?" (should_make_auto_patch)
                    confirm -> Q3/l.d   (run F.J then continue launching)
                    cancel  -> Q3/l.c(game, true) (skip the patch and launch directly)
        "false" -> launch directly
```

- The automatic patch only runs the **base patch `F.J`**, not the Windows environment patch;
- During execution it shows `add_patch_auto_running` ("Auto patching...");
- The trigger condition is based on whether `system.ini` exists: once the base patch succeeds it will not trigger again (unless the game directory is cleared or reinstalled).

Setting item (`p023c4/a.java:50`): `artemisAutoPatch` display name `artemis_auto_patch` ("Auto patch"), values `ask`/`true`/`false`, **upstream default `ask`**.

> TyranorNext difference (intentional): this app uses the values `ask`/`auto`/`off` for the same item, **defaulting to `off`**
> (`EngineSettingsStore.ART_PATCH_DEFAULT`). Rationale: in the no-dialog quick-launch/shortcut path, `ask` is equivalent to
> automatically running the base patch and enabling automatic engine version fallback (`EngineLauncher.buildArtemisIntent`),
> which appears to the user as "automatic by default"; after changing the default to off, the patch and automatic fallback
> only run when the user explicitly selects "ask at launch" or "auto".

---

## 7. Complete Artemis Detail Menu Item Set (Context)

`p092l4/t.java:150-161` (appended in order when `type == "Artemis"`):

| # | Resource | Label | Click handling |
|---|---|---|---|
| 1 | `artemis_version` | Artemis version | Version selector (`p098m4.b` case 0) |
| 2 | `add_patch` | **Add base patch** | `M3/d` case 9 → `F.J` |
| 3 | `add_patch2` | **Add Windows environment patch** | `M3/d` case 10 → `F.K` |
| 4 | `unpack_game` | Unpack game | `M3/d` case 11 → `F.W` (full unpack, not the focus here) |
| 5 | `delete_save` | Clear save data | Save cleanup (`p098m4.b` case 4 branch) |

---

## 8. Comparison With the Existing TyranorNext Implementation

The existing corresponding TyranorNext implementation: `app/src/main/java/com/tyranor/next/core/unpack/ArtemisPfsUnpacker.kt` + the autopatch policy in `EngineLauncher` (`needsArtemisPatchConfirm` / `applyArtemisBasePatchIfNeeded`).

| Dimension | Original (Tyranor v2.3.4) | TyranorNext status | Recommendation |
|---|---|---|---|
| Base patch extraction set | `system.ini` / `list_windows*` / `movie*` (6 video extensions) | `system.ini` / `system/*` (iet/lua/asb/tbl/glsl/ini/json/txt) / `movie*` (same 6 extensions) | Keep as-is (`system/*` is more complete for unpackaged boot); optionally align with the original semantics |
| `system.ini` handling | **Fully overwritten** with a single `[ANDROID]` section (discarding the rest of the original file) | **Writes a managed block** inside the `[ANDROID]` section (`; TYRANOR_NEXT_ARTEMIS_SETTINGS_BEGIN/END`), preserving other file content and allowing rollback | Keep as-is (rollbackable, supports engine settings override) |
| `list_windows` renaming | Yes (`list_android*` + `.tbl` flip) | Yes (`renameListWindows` + `flipListAndroidTblConfig`) | Aligned |
| PFS archive renaming to `root.pfs` | **Yes** (`I()`, including `x.pfs.001` → `root.pfs.001`) | **No** (reads by the original file name, no renaming) | On demand: add it only if devices/kernels are found where "only a non-root-named pfs can boot"; note the multi-family conflict risk |
| Data XOR condition | `archive version >= 8` | `data length >= 8` | Cross-check whether the two conditions are equivalent using real samples; if old-version archives ('0'~'7') are found unencrypted, switch to the version number check |
| Windows environment patch | Yes (`system.lua`/`init.lua`, `game.os = "windows"`) | **No** | Recommended to implement (per-game menu/settings item + idempotent rewrite) |
| Automatic patch | At launch per `artemisAutoPatch` = ask/true/false, base patch only | Equivalent policy already present (ask dialog → auto/off; includes clean-kernel skip), base patch only; **default off (upstream default ask, see §6 for the difference)** | If "automatically apply the Windows environment patch" is wanted, add a separate switch; not recommended to enable by default |
| Failure semantics | Bad magic/out of range → `false`; no PFS → `true` | Stricter validation (table length/entry count/name length/boundaries/total cap); a single item failure is skipped and processing continues | Keep as-is (safer) |

---

## 9. Key Code Index

```
smali (tyranor_out)
  smali/f5.1/F.smali:2097   H(File)      PFS name matching
  smali/f5.1/F.smali:2179   I(File)      PFS rename to root.pfs
  smali/f5.1/F.smali:2292   J(M3.g)      base patch
  smali/f5.1/F.smali:4550   K(M3.g)      Windows environment patch
  smali/f5.1/F.smali:5933   M(RAF)       little-endian int32
  smali/f5.1/F.smali:6001   N(Reader)    readLines
  smali/f5.1/F.smali:6405   R(String,B)  write file
  smali/f5.1/F.smali:6712   W(M3.g)      unpack game (full)
  smali/m4.1/b.smali        UI menu items (add_patch / add_patch2)
  smali/Q3/l.smali          automatic patch decision + launch

jadx (/tmp/tyranor_jadx/sources)
  p048f5/F.java:392         J (base patch)
  p048f5/F.java:698         K (Windows environment patch)
  p048f5/F.java:379         I; p048f5/F.java:919 M; :925 N; :996 R
  Q3/l.java:370             automatic patch prompt (should_make_auto_patch)
  Q3/l.java:455             Q3/l.d automatic patch entry (add_patch_auto_running)
  Q3/k.java:49              automatic patch coroutine → F.J
  M3/d.java:100/103         case 9/10 → p098m4.c / p098m4.d
  p098m4/b.java:101/122     the two menu item renderings
  p092l4/t.java:150-161     Artemis menu item mounting order
  p023c4/a.java:50          artemisAutoPatch setting item (ask/true/false)

string resources (res/values/strings.xml)
  add_patch             Add base patch
  add_patch2            Patch As Windows Env
  add_patch_running     Patching...
  add_patch_success     Patch succeeded
  add_patch_failed      Patch failed
  add_patch_auto_running Auto patching...
  should_make_auto_patch Run automatic patch?
  artemis_auto_patch    Auto patch
```

---

## 10. Reproduction and Validation Suggestions

1. Take a PFS-packaged Artemis game sample, back it up, then run each of the two original patches and compare:
   - the list of files newly added to the game root (should be only the sets in §4.1 / §5.1);
   - the `system.ini` content (verify the "overwrite rewrite" and the `[WINDOWS]` WIDTH/HEIGHT inheritance);
   - the `config_tablet/config_tabletui` of `list_android.tbl`;
   - the `game.os` lines of `system.lua`/`init.lua`;
   - the renaming result of the original `*.pfs`.
2. Run the base patch on TyranorNext with the same sample and compare the differences (focus: whether `system.ini` keeps a managed block, whether `root.pfs` renaming is needed, the XOR condition).
3. If a "Windows environment patch" is to be added to TyranorNext: it is recommended as a per-game menu item + a `PerGameSettingsStore` boolean override (default off), implemented in `ArtemisPfsUnpacker` (reusing `unpackPfs` + the `shouldExtractEntry` callback is sufficient; no new parser is needed).