# Task 01 — Terjemahkan 557 string app yang hilang ke `values-in`

## Latar belakang
Setelah merge upstream 1.72, `app/src/main/res/values/strings.xml` bertambah jadi 1277 key, sementara `values-in/strings.xml` masih 776 key. Ada 557 key yang belum punya terjemahan Indonesia, jadi key-key itu jatuh balik ke bahasa default (saat ini Mandarin dari upstream).

## Pemicu
Output perbandingan sebelumnya:
```
app/src/main/res/values/strings.xml : 1277
app/src/main/res/values-in/strings.xml : 776
app missing in values-in: 557
```

## Langkah
1. Ambil daftar key yang ada di `values` tapi tidak ada di `values-in`.
2. Untuk setiap key, baca nilai English di `values` (atau buat terjemahan sendiri jika hanya ada Mandarin di `values`).
3. Tambahkan entri `<string name="...">...</string>` ke `app/src/main/res/values-in/strings.xml` dengan terjemahan Bahasa Indonesia.
4. Pastikan urutan dan format XML konsisten dengan file existing.
5. Jalankan `python tools/check-hardcoded-ui-strings.py` untuk memastikan paritas key (tidak ada key yang hilang di masing-masing bahasa).
6. Commit dengan pesan Conventional Commits, mis.:
   `feat(i18n): translate missing app strings to Indonesian`

## Definisi Selesai
- `values-in` memiliki semua 1277 key yang sama dengan `values` (paritas 100%).
- Tidak ada hardcoded CJK string literal di Kotlin/Java untuk string-string baru.
- Build `:app:compileDebugKotlin` berhasil.

## Catatan
- Jika nilai English di `values` masih Mandarin (karena upstream `values` = Mandarin), buat terjemahan Indonesia dari bahasa asal dan catat untuk direset ke English pada Task 03.
