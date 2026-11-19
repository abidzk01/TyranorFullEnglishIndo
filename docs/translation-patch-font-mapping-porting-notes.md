# Translation Patch Font Mapping Porting Notes

> Nature: **porting/adaptation notes** (not App feature design). They explain how to adapt the **character mapping** of jis-replacement / jis-tunnel / mapped-font translation patches so they display correctly on TyranorNext (Android), for the reference of porters and players.
> Boundaries and disclaimer: TyranorNext **does not bundle and does not automatically load** a patch's injection DLL, mapping table or font, and does not read them during scanning/launching; this document only describes **manual adaptation methods**. Copyright in game data, patches and their mapping/font derivatives belongs to the original rights holders. Keep your own lawful copy, and **do not distribute** extracted mapping tables or generated fonts.
> Scope: mainly translation patches for the FVP (rfvp) engine; other engines follow the same idea, but their font/encoding models differ, so details must be adapted separately.

---

## 1. Principle Overview

### 1.1 Four Patch Types and Emulator Behavior

| Code | Patch type | Text storage method | Restoration method on Windows | Emulator (TyranorNext/rfvp) behavior |
|---|---|---|---|---|
| T4 | **GBK injection** | Text is written directly into scripts as GBK, and the engine code page is modified | None (the engine reads GBK) | Simply set the **text encoding to GBK** |
| T1 | **jis replacement** | Shift-JIS, with Simplified Chinese characters replaced by **rare Japanese kanji** placeholders | Injected DLL (UIF / GalTransl / custom framework) restores via the mapping table | Placeholders are displayed as-is → "garbled" text mixed with normal characters |
| T2 | **jis tunnel** | Shift-JIS, with Simplified Chinese characters replaced by **SJIS-undefined code points** | Injected DLL + `sjis_ext.bin`/`jis_ext.bin` ordered table restores | Missing glyphs: rfvp outputs **blank** for characters without glyphs |
| T3 | **mapped font** | Same as T1 (placeholder characters) | The patch font's own cmap points placeholders at the target glyphs (GalFC/Japanese-traditional fonts) | Placeholders are shown unless that font is the primary font; **using that font directly just works** |

### 1.2 Why the Emulator Shows "Garbled" Text

1. The restoration logic lives in a **Windows injected DLL** (`winmm.dll`/`version.dll`/d3d9 proxy/game-private DLL), which Android cannot execute;
2. What the script stores is inherently a **placeholder character** (a rare Japanese kanji or an undefined code point); without a mapping layer it is rendered as ordinary text;
3. When rfvp renders a missing glyph it outputs blank (not a box), which is why T2 appears as "dropped characters";
4. T3's mapping lives **inside the font file**; if the engine still renders placeholders using the original font, the text is garbled just the same.

The core of the adaptation is a single step: **make the engine render using the "placeholder character → target glyph" mapping**. There are two equivalent approaches on Android:

- **Remapped font (recommended, the main flow in these notes)**: rewrite a font's cmap so the placeholder code points point at the target characters' glyphs, then set that font as the engine's primary font;
- (Alternative, requires engine support) runtime character substitution: after text decoding, replace placeholder characters with target characters according to the mapping table.

---

## 2. Step One: Determine the Patch Type

### 2.1 File Signal Quick Reference

| File in the game directory | Suggested type | Description |
|---|---|---|
| `uif_config.json` containing `replace_chars` | T1 (mapping source is clear) | `source_chars` → `target_chars` given in plain text |
| `uif_config.json` containing `tunnel_decoder` | T2 | Works with `mapping`/`sjis_ext.bin` |
| `sjis_ext.bin` / `jis_ext.bin` | T2 | Tunnel extension character ordered table |
| `jis_map.bin` | T1 (Babel-family framework) | External mapping file |
| Root `*.dll` containing strings such as `VNTextProxy`/`UniversalInjectorFramework`/`babel`/`jis_map.bin` | T1/T2 (mapping may be **embedded in the DLL**) | e.g. `Sakura.dll` from《樱花,萌放。》 |
| `*.ttf/otf/ttc` in the root or under `font/` | Possibly T3 (mapped font) or a base font for generation | See §3.4/§4.2 |
| None of the above files, but the text contains many rare kanji | T1 (source must be inferred from the script and DLL) | See §3.3 |

### 2.2 Text Sampling Confirmation

Strings in FVP scripts (`.hcb`/`.bch`) are `0x0E <u8 length> <bytes...>` (pushstring). Sample statistics:

- After decoding as Shift-JIS, if **rare kanji (JIS level 2 / uncommon characters) make up a clearly high proportion**, and common Simplified Chinese characters are scarce → T1;
- If Shift-JIS **undefined sequences** appear (decode failure/replacement characters) → T2;
- If it is garbled as Shift-JIS but reads coherently as GBK → T4 (just change the encoding);
- See Appendix C for a sampling script (it only reads scripts and modifies no files).

---

## 3. Step Two: Obtain the "Placeholder Character → Target Character" Mapping

Try in the following priority order, and once you have the mapping, export it uniformly to an intermediate format (Appendix B: `fvp_map.tsv` / `fvp_map.json`).

### 3.1 UIF Configuration (the easiest)

`uif_config.json` → `text_processor.rules[]` → `type: replace_chars`:

```
"source_chars":  "這説為凜..."      // placeholder characters (what the script actually stores)
"target_chars":  "变为动视显..."      // target characters (the Chinese that should be displayed)
```

The two strings are **paired position by position** (UTF-16 code points correspond one-to-one), so they can be exported directly to TSV.

### 3.2 External Mapping Files

- `jis_map.bin` (Babel-family framework): a binary mapping container. You can use the injection DLL in the same directory as a reference implementation (its parsing code is inside the DLL), or switch to the embedded extraction in §3.3 for the same patch;
- `sjis_ext.bin` / `jis_ext.bin` (tunnel): the file content is usually **a list of characters that cannot be represented in SJIS**; tunnel code points are assigned in order. You need to combine it with the specific framework's assignment rules (VNTextPatch / UIF tunnel) and verify the coverage by sampling with a script before use.

### 3.3 Mapping Embedded in the Injection DLL (important: common with T1)

Many patches **compile the mapping table into the DLL** (e.g. `Sakura.dll` from《樱花,萌放。》embeds 1206 entries of `(u16 placeholder, u16 target)`).

**Manual location (when a disassembly tool is available)**

1. Search the DLL for references to the strings `jis_map.bin` / `jis_ext.bin`;
2. Find the "read table + loop count" code near the loading branch (e.g. an address assigned to a pointer, with the loop count as the constant `0x4B6`);
3. The table is usually 4 bytes per entry: `(u16 key, u16 value)`; **the key is the placeholder character's own Unicode code point** (a few implementations use the SJIS code point — the script scans for both), and value is the target character's Unicode.

**General heuristic extraction (works without symbol information)**

1. Scan the DLL for consecutive `(u16,u16)` sequences: require that most keys decode as Shift-JIS and most values fall in the CJK range;
2. Validate against the **actual placeholder characters in the script**: compute "the intersection between table keys and the character types in the script" and "the proportion of table keys that appear in the script (precision)";
3. Take the candidate table with the largest intersection and precision ≥ 0.5; export it as TSV.

Reference script: Appendix C `extract_map.py` (read-only scan; it does not write to the DLL).

### 3.4 Mapped Fonts (T3) and Standard Mapping Tables

- **T3**: the patch's bundled font may already embed the mapping. Criterion: render several placeholder characters with that font; if the glyphs differ clearly from the same code points in a reference font (system Noto/Source Han), that font is the mapping carrier → **no generation needed**, just use that font as the engine's primary font (§5.3);
- **Standard mapping table**: GalTransl/SExtractor's `hanzi2kanji_table.txt` (Simplified Chinese → Japanese kanji). Only usable if the patch actually used it for generation; do not use it if its coverage of the script's placeholders is insufficient.

### 3.5 Mapping Validation (mandatory before generating a font)

| Check | Requirement |
|---|---|
| Coverage | Mapping keys cover ≥ 95% of the placeholders in the script sample |
| Uniqueness | Each placeholder has only one mapping |
| No chaining | A mapping value is not itself the key of another entry (avoids needing multiple replacements) |
| Target validity | All target characters exist in the base font's cmap (see §4.4) |

If these are not satisfied, do not generate; go back to §3 for another source, or switch to T3/manual options.

---

## 4. Step Three: Generate the Remapped Font

### 4.1 Principle

TrueType/OpenType fonts map "character code points" to "glyphs" via the `cmap` table. A remapped font is:

```
cmap[placeholder code point] = cmap[target code point]     // reuse the target character's glyph
```

This way, when the engine renders a placeholder, what is actually drawn is the target Chinese glyph; other normal characters are unaffected.

### 4.2 Base Font Selection

| Priority | Source | Description |
|---|---|---|
| 1 | **The game's bundled CJK font** (root or `font/`) | e.g.《樱花,萌放。》ships `NotoSansCJKsc-Regular.otf`; the style matches the game |
| 2 | System CJK font (Android `/system/fonts`) | Varies a lot across devices; TTC needs the Simplified Chinese face selected; validate coverage before generating |
| 3 | Bundled/downloaded Noto Sans CJK SC | Most reliable coverage; watch file size and licensing (OFL) |

### 4.3 Generation Steps (fontTools)

```bash
pip install fonttools
python3 build_remap_font.py base_font.otf fvp_map.tsv output_font.otf
```

See Appendix C for the script `build_remap_font.py`; key points:

- Iterate over all **Unicode subtables** (format 4/12) in `cmap` and perform `cmap[placeholder] = cmap[target]`;
- **TTC**: select the face first (fontTools uses `TTFont(path, fontNumber=n)`); it is recommended to pick the face with Simplified Chinese coverage;
- Do not modify glyphs or metrics — only the mapping; the font size stays essentially unchanged;
- If generation fails (abnormal format), do not use a half-finished product; output to a separate file name.

### 4.4 Self-Check and Verification

1. **Missing target check**: the script counts entries where "the target character is not in the base font cmap"; this should be 0; if not, switch the base font;
2. **Sample rendering**: render a sentence of placeholder text extracted from the script with the generated font and confirm it reads as coherent Chinese;
3. **Coverage spot check**: sample several more places (dialogue, menus, character names) and check them;
4. **In-game verification**: see §5.4.

---

## 5. Step Four: Enable in TyranorNext

### 5.1 Transfer to the Device

Copy the generated font to any accessible location on the phone (e.g. `Download/`); keeping it together with the game works too.

### 5.2 FVP "Custom Font (forced)"

TyranorNext → **Engine settings → FVP → Custom font** → select the generated font (or go to **Per-game settings** to apply it to just that game):

- **Role**: this font takes effect as the forced primary font, bypassing the script's font requests and font enumeration;
- **Text encoding**: keep **Shift-JIS** for T1/T2/T3 (the default); accidentally setting it to GBK will garble the entire text;
- **System font fallback**: recommended to keep enabled, as a fallback for missing glyphs;
- **Changes take effect only after re-entering the game** (the font is injected when the engine is created).

### 5.3 Simplest Path by Type

| Type | What you need to do |
|---|---|
| T4 | Only set the game's "text encoding" to **GBK** (no font needed) |
| T1/T2 | Obtain the mapping per §3 → generate the font per §4 → select the font per §5.2 |
| T3 | No generation needed; just select the patch's bundled font per §5.2 |

### 5.4 Verification and Reverting

- Verify: enter the game's dialogue/menus and confirm placeholders become Chinese with no dropped characters;
- Revert: set "Custom font" back to **follow game default** to restore the original state; the generated font file can be deleted at will.

---

## 6. Complete Example: 《樱花,萌放。》(Babel / jis replacement)

### 6.1 Measured Data

| Item | Value |
|---|---|
| Injected DLL | `Sakura.dll` (x86, d3d9 proxy); contains strings such as `babel::sjis_cp932_to_unicode_engine`, `jis_map.bin` |
| Mapping location | Not in the game directory (no `jis_map.bin`) → embedded: file offset `0x47960` (RVA `0x48960`), **1206 entries × 4 bytes** of `(u16,u16)`, loop count `0x4B6` |
| Mapping samples | `寅→她、諍→说、徼→这、禳→—、戍→你、弗→么...` |
| Script coverage | Out of 64,994 strings, all 1206/1206 mappings appear; no chained mappings |
| Cross-validation | The original sentence from a Windows screenshot `透慓窗疋贍微的梍隙,不知从何杣峨来了点点春色禳禳` → mapped → `透过窗户细微的缝隙,不知从何处飘来了点点春色——`, character-by-character identical |
| Base font | The game's bundled `NotoSansCJKsc-Regular.otf` (16.4MB) |
| Output | `SakuraMoyu_CN_remap.otf` (16.4MB, 4 Unicode cmap subtables rewritten, 0 missing targets) |
| Result | FVP custom font (forced) = this font, encoding SJIS → verified working on a physical device |

### 6.2 Steps

```bash
# 1) Sample to confirm the type (T1) and extract the embedded mapping
python3 extract_map.py Sakura.hcb Sakura.dll
#    → [unicode] exported fvp_map.tsv:dll:0x47960, 1206 entries, script hits 1206, precision 100.0%

# 2) Generate the remapped font (using the game's bundled font)
python3 build_remap_font.py NotoSansCJKsc-Regular.otf fvp_map.tsv SakuraMoyu_CN_remap.otf
#    → 4 cmap subtables, 0 missing targets

# 3) Self-check: render "寅痲燬嵋着倦意的小嘴,稾稾地......"; it should display as:
#    "她张开带着倦意的小嘴,轻轻地......"
```

4) Transfer `SakuraMoyu_CN_remap.otf` to the phone → in TyranorNext FVP custom font (forced), select it → keep text encoding as Shift-JIS → re-enter the game.

---

## 7. Advice for Patch Authors / Porters

1. **If you want the patch to work out of the box on emulators**: ship a **remapped font** with the patch (the GalFC approach), or ship the mapping table plus instructions so users can generate one themselves;
2. **Do not load Windows DLLs on the Android side**: DLLs are x86/Windows binaries that cannot execute on Android, and automatically loading patch assets carries copyright and security risks;
3. **Do not publicly redistribute mapping data and font derivatives**: they are reworked patch/game assets; use them only on your own machine, or let the patch author provide them within what the patch license allows;
4. If the patch uses GBK injection, state clearly in the patch notes that "please set the emulator text encoding to GBK" — this avoids a lot of false reports.

---

## 8. FAQ

| Question | Answer |
|---|---|
| Is the generated font large? | Essentially the same size as the base font (only cmap changes; glyphs untouched). With the game's bundled font it is usually 10–30MB |
| Can several games share one generated font? | Yes, if both the mapping and base font are identical; different patches have different mappings and need individual fonts |
| Some characters are still rare kanji after generation? | That placeholder is not in the mapping table (incomplete extraction); add the mapping and regenerate |
| Some characters are blank/missing? | The base font lacks that target glyph; switch to a base font with fuller coverage (e.g. Noto Sans CJK SC) |
| A TTC font only uses the first face? | Explicitly select the face when generating; when used directly in-game it may also take only the first face, so it is recommended to save the selected face as a standalone TTF/OTF |
| Can the in-game font menu still be used? | The forced font has the highest priority and overrides in-game selection; if you need the in-game menu, switch to "follow game default" and manually place the generated font in the game's `font/` (whether it is picked depends on the script) |
| It stops working after a game update / patch swap? | The mapping or font may have changed; regenerate per this document's flow |
| I have a UIF configuration but no font? | Generate one using a device/system CJK font as the base font |
| Can I just edit the script text (replace placeholders)? | That requires rewriting the hcb (sensitive to length/offsets) and may trigger validation; not recommended — the font approach involves the smallest change |

---

## Appendix A: File and Type Quick Reference

| File/phenomenon | Type determination |
|---|---|
| `uif_config.json` + `replace_chars` | T1 (plain-text mapping) |
| `uif_config.json` + `tunnel_decoder` | T2 |
| `sjis_ext.bin` / `jis_ext.bin` | T2 |
| `jis_map.bin` | T1 (external mapping) |
| Injected DLL (containing framework signature strings) | T1/T2 (may embed the mapping) |
| Many rare kanji placeholders, no external files | T1 (embedded mapping; see §3.3) |
| Text readable as GBK | T4 (change the encoding) |
| Bundled font renders placeholders with abnormal glyphs | T3 (use that font directly) |

## Appendix B: Mapping Intermediate Format

**TSV (recommended, for the generation script)**

```
寅	她
諍	说
禳	—
```

**JSON (convenient for documentation and sharing; decide on your own whether to pass it on)**

```json
{ "kind": "jis_replace", "source": "dll:0x48960", "pairs": { "寅": "她", "諍": "说" } }
```

## Appendix C: Reference Scripts

### C.1 `extract_map.py` (heuristic extraction of the embedded mapping from a DLL)

```python
#!/usr/bin/env python3
"""Extract the (placeholder -> target) mapping from an injected DLL. Usage: extract_map.py Game.hcb Inject.dll"""
import sys
import struct
import collections


def hcb_chars(path, limit=8_000_000):
    data = open(path, 'rb').read(limit)
    chars = collections.Counter()
    i = 0
    while i < len(data) - 2:
        if data[i] == 0x0E:                      # pushstring <u8 len> <bytes>
            ln = data[i + 1]
            if 0 < ln < 200 and i + 2 + ln <= len(data):
                raw = data[i + 2:i + 2 + ln]
                if raw.endswith(b'\x00'):
                    raw = raw[:-1]
                if b'\x00' not in raw:
                    try:
                        chars.update(raw.decode('cp932'))
                    except Exception:
                        pass
        i += 1
    return chars


def is_cjk(v):
    return (0x4E00 <= v <= 0x9FFF) or (0x3400 <= v <= 0x4DBF) or (0xF900 <= v <= 0xFAFF)


def is_sjis(v):
    if not (0x8140 <= v <= 0xFCFC):
        return False
    lead, trail = v >> 8, v & 0xFF
    return (0x81 <= lead <= 0x9F or 0xE0 <= lead <= 0xEF) and \
           (0x40 <= trail <= 0x7E or 0x80 <= trail <= 0xFC)


def is_target(v):
    # Target characters are almost all non-ASCII printable (kanji/punctuation/symbols); exclude control and surrogate ranges
    if v < 0x00A0 or 0xD800 <= v <= 0xDFFF:
        return False
    return True


def scan(dll, script_chars, key_test, min_entries=200):
    best = None
    off = 0
    while off + 4 <= len(dll):
        k, v = struct.unpack_from('<HH', dll, off)
        if not (key_test(k) and is_target(v)):
            off += 2
            continue
        table, n = {}, 0
        while off + n * 4 + 4 <= len(dll):
            k2, v2 = struct.unpack_from('<HH', dll, off + n * 4)
            if not (key_test(k2) and is_target(v2)):
                break
            table[chr(k2)] = chr(v2)
            n += 1
        if n >= min_entries:
            hit = len(set(table) & script_chars)
            precision = hit / n
            if precision >= 0.5 and (best is None or hit > best[0]):
                best = (hit, precision, off, n, table)
                if hit == n:
                    return best
        off += 2
    return best


def main():
    hcb_path, dll_path = sys.argv[1], sys.argv[2]
    script_chars = {c for c, n in hcb_chars(hcb_path).items() if n >= 1}
    dll = open(dll_path, 'rb').read()

    # Two common table formats: key is the placeholder's Unicode / key is the SJIS code point
    for label, key_test in (('unicode', is_cjk), ('sjis', is_sjis)):
        best = scan(dll, script_chars, key_test)
        if best is None:
            continue
        hit, precision, off, n, table = best
        with open('fvp_map.tsv', 'w', encoding='utf-8') as f:
            for k, v in sorted(table.items()):
                f.write(f'{k}\t{v}\n')
        print(f'[{label}] exported fvp_map.tsv:dll:0x{off:x},{n} entries,'
              f'script hits {hit}, precision {precision:.1%}')
        return
    print('No valid candidate table found')


if __name__ == '__main__':
    main()
```

### C.2 `build_remap_font.py` (generate the remapped font)

```python
#!/usr/bin/env python3
"""Rewrite a base font into a remapped font using the mapping table (cmap only).
Usage: build_remap_font.py Base.otf fvp_map.tsv Out.otf
"""
import sys
from fontTools.ttLib import TTFont

def load_pairs(path):
    pairs = {}
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if '\t' in line:
            k, v = line.split('\t')[:2]
            if len(k) == 1 and len(v) == 1:
                pairs[ord(k)] = ord(v)
    return pairs

def main():
    base, map_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    pairs = load_pairs(map_path)
    font = TTFont(base)
    subtables = 0
    missing = 0
    for table in font['cmap'].tables:
        if not table.isUnicode():
            continue
        for src, dst in pairs.items():
            glyph = table.cmap.get(dst)
            if glyph is None:
                missing += 1
                continue
            table.cmap[src] = glyph
        subtables += 1
    font.save(out)
    print(f'{subtables} cmap subtables, {missing} missing targets -> {out}')

if __name__ == '__main__':
    main()
```

> Note: the script only reads game scripts/DLLs and generates the font locally; it uploads and passes on no patch assets. Do not publicly distribute the generated artifacts.

## Appendix D: Measured Record (《樱花,萌放。》)

- Extraction source: the table embedded in `Sakura.dll` (§6.1);
- Mapping validation: all 1206/1206 entries appear; no chaining;
- Cross-validation: character-by-character identical to the Windows version screenshots;
- Generation result: `SakuraMoyu_CN_remap.otf` displays correctly on a physical device (TyranorNext + FVP forced font, encoding SJIS);
- Note: if the game text contains private-use-area symbols (e.g. U+F8F2), the base font usually has no corresponding glyph and they may display blank; this is an isolated case.