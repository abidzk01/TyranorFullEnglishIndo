# TODO — Sinkronisasi Upstream 1.72 ke Fork Terjemahan

Branch aktif: `sync/upstream-1.72` (commit `2459f40`)  
Target utama: fork tetap terjemahan Indonesia + English default, basis kode dicocokkan dengan upstream 1.72, lalu rilis versi `1.74.rxlang.1`.

## Daftar Task

| # | File | Status | Uraian |
|---|------|--------|--------|
| 1 | `todo/01-translate-app-strings.md` | ⏳ | Terjemahkan 557 string app yang hilang ke `values-in` |
| 2 | `todo/02-translate-engine-strings.md` | ⏳ | Terjemahkan 57 string engine yang hilang ke `values-in` |
| 3 | `todo/03-restructure-default-language.md` | ⏳ | Ubah default bahasa: `values` = English, `values-zh` = Mandarin |
| 4 | `todo/04-update-string-checker.md` | ⏳ | Sesuaikan `tools/check-hardcoded-ui-strings.py` ke 4 bahasa + English default |
| 5 | `todo/05-translate-docs.md` | ⏳ | Terjemahkan dokumen Mandarin baru dari upstream ke English |
| 6 | `todo/06-cleanup-duplicate-docs.md` | ⏳ | Bersihkan duplikat dokumen terjemahan Inggris lama |
| 7 | `todo/07-bump-version.md` | ⏳ | Ubah `appVersionName` ke `1.74.rxlang.1` |
| 8 | `todo/08-build-and-test.md` | ⏳ | Build debug, jalankan unit test, verifikasi graphics resources |
| 9 | `todo/09-merge-to-main-and-release.md` | ⏳ | Fast-forward `main`, trigger workflow rilis beta |

## Catatan

- `main` **belum diubah** (masih di `1.59`). Semua pekerjaan di branch `sync/upstream-1.72`.
- `HIKARINAGI_CLIENT_ID` sudah diisi (`hkn_fyixwlPMjgeoo-Fc`), workflow rilis dapat berjalan.
- Setiap task dikerjakan secara bertahap dan di-commit terpisah (Conventional Commits, bahasa Inggris).
- Setelah semua selesai, branch `sync/upstream-1.72` di-fast-forward ke `main` lalu dipush untuk memicu rilis.
