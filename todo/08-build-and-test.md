# Task 08 — Build Debug, Unit Test, dan Verifikasi Graphics Resources

## Latar belakang
Sebelum rilis, perlu memastikan semua perubahan kompilasi berhasil dan tidak merusak fitur existing.

## Langkah
1. Jalankan `./gradlew :app:compileDebugKotlin --no-daemon --console=plain` — harus BUILD SUCCESSFUL.
2. Jalankan `./gradlew :app:testDebugUnitTest --no-daemon` — JVM regression harus lolos.
3. Jalankan `./gradlew :engine:verifyGraphicsResources --no-daemon --console=plain` — verifikasi SHA-256 graphics assets harus lolos.
4. Jalankan `python tools/check-hardcoded-ui-strings.py` — paritas string 4 bahasa harus lolos.
5. (Opsional) `./gradlew :app:lintDebug :engine:lintDebug --no-daemon` — Android lint.
6. Commit hasil build-related fixes jika ada, mis.:
   `fix(build): fix compile errors after upstream sync`

## Definisi Selesai
- `:app:compileDebugKotlin` BUILD SUCCESSFUL.
- `:app:testDebugUnitTest` semua tes lolos.
- `:engine:verifyGraphicsResources` lolos (tidak ada mismatch SHA-256).
- `check-hardcoded-ui-strings.py` lolos (paritas + no CJK literal).

## Catatan
- Jika build gagal karena konflik merge yang belum terresolusi, selesaikan dulu sebelum melanjutkan ke Task 09.
