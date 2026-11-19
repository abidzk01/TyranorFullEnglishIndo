# Task 04 — Sesuaikan `tools/check-hardcoded-ui-strings.py` ke 4 Bahasa + English Default

## Latar belakang
Skrip pemeriksa paritas string dan gate CJK literal perlu disesuaikan setelah restrukturisasi bahasa default (Task 03): English menjadi default di `values`, Mandarin dipindahkan ke `values-zh`, dan `values-en` dihapus.

## Langkah
1. Buka `tools/check-hardcoded-ui-strings.py`.
2. Perbarui daftar bahasa yang diharapkan: `values` (English), `values-in`, `values-zh`, `values-ja`.
3. Perbarui logika paritas key sehingga mengecek keempat bahasa tersebut.
4. Pastikan gate tetap memblokir CJK string literal di Kotlin/Java.
5. Jalankan skrip untuk app dan engine; pastikan lolos tanpa error.
6. Commit dengan pesan Conventional Commits, mis.:
   `chore(i18n): update string parity checker for 4 locales with English default`

## Definisi Selesai
- `tools/check-hardcoded-ui-strings.py` mencakup 4 bahasa: `values`, `values-in`, `values-zh`, `values-ja`.
- Skrip lolos pada kedua resource set (app dan engine).
- Tidak ada CJK literal yang lolos gate di Kotlin/Java.

## Catatan
- Skrip ini juga dipanggil oleh CI (Gradle `:app:checkHardcodedUiStrings` jika terdaftar).
