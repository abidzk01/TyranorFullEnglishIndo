# Task 03 — Restrukturisasi Default Bahasa Menjadi English

## Latar belakang
Upstream 1.72 masih menggunakan:
- `values` = Mandarin (default)
- `values-en` = English
- `values-ja` = Japanese

Konvensi fork (sebelum merge) adalah:
- `values` = English (default)
- `values-in` = Bahasa Indonesia
- `values-zh` = Mandarin
- `values-ja` = Japanese
- `values-en` dihapus

## Tujuan
- `app/src/main/res/values/strings.xml` berisi English (dipindahkan dari `values-en`).
- `app/src/main/res/values-zh/strings.xml` berisi Mandarin (dipindahkan dari `values` lama).
- `app/src/main/res/values-in/strings.xml` tetap (Indonesian, sudah ada 776+ key).
- `app/src/main/res/values-ja/strings.xml` tetap (Japanese).
- `app/src/main/res/values-en/` dihapus.
- Sama dilakukan untuk `engine/src/main/res/`.

## Langkah
1. Pindahkan isi `app/src/main/res/values/strings.xml` (Mandarin upstream) ke `app/src/main/res/values-zh/strings.xml` (ganti isi yang lama jika ada).
2. Pindahkan isi `app/src/main/res/values-en/strings.xml` (English) ke `app/src/main/res/values/strings.xml` (jadi default).
3. Hapus folder `app/src/main/res/values-en/`.
4. Ulangi langkah 1–3 untuk `engine/src/main/res/`.
5. Pastikan `values-in` dan `values-ja` utuh dan tidak terhapus.
6. Jalankan `python tools/check-hardcoded-ui-strings.py` — harus lolos dengan 4 bahasa.
7. Commit dengan pesan Conventional Commits, mis.:
   `refactor(i18n): restructure default locale to English, move Mandarin to values-zh`

## Definisi Selesai
- `values` = English default di app dan engine.
- `values-zh` = Mandarin, `values-in` = Indonesian, `values-ja` = Japanese.
- Tidak ada folder `values-en`.
- Paritas key 100% di semua 4 bahasa.
- `:app:compileDebugKotlin` berhasil.

## Catatan
- `AppSettingsStore.kt` dan `AppLocaleController.kt` sudah mendukung `LANGUAGE_ID = "id"` dan default `en` — verifikasi tidak perlu diubah lagi setelah restrukturisasi resource.
