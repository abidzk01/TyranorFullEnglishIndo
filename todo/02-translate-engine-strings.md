# Task 02 — Terjemahkan 57 string engine yang hilang ke `values-in`

## Latar belakang
Setelah merge upstream 1.72, `engine/src/main/res/values/strings.xml` bertambah jadi 151 key, sementara `values-in/strings.xml` masih 94 key. Ada 57 key yang belum punya terjemahan Indonesia.

## Pemicu
```
engine/src/main/res/values/strings.xml : 151
engine/src/main/res/values-in/strings.xml : 94
engine missing in values-in: 57
```

## Langkah
1. Ambil daftar key yang ada di `engine/src/main/res/values/strings.xml` tapi tidak ada di `engine/src/main/res/values-in/strings.xml`.
2. Terjemahkan setiap key ke Bahasa Indonesia.
3. Tambahkan entri ke `engine/src/main/res/values-in/strings.xml`.
4. Jalankan pemeriksaan paritas untuk engine resource (sesuaikan skrip atau periksa secara manual).
5. Commit dengan pesan Conventional Commits, mis.:
   `feat(i18n): translate missing engine strings to Indonesian`

## Definisi Selesai
- `engine/src/main/res/values-in/strings.xml` memiliki semua key yang sama dengan `engine/src/main/res/values/strings.xml` (paritas 100%).
- Build `:engine:compileDebugKotlin` atau `:app:compileDebugKotlin` berhasil (engine resource dikompilasi bersama app).

## Catatan
- Engine host UI juga melalui `EngineUiText.kt` — pastikan format-argument overload tetap utuh saat menambahkan string baru yang memakai format argumen.
