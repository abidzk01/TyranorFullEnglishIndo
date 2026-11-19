# Task 09 — Fast-Forward `main` dan Trigger Rilis Beta

## Latar belakang
Setelah semua task selesai dan diverifikasi di branch `sync/upstream-1.72`, branch ini perlu difast-forward ke `main` lalu dipush. Push ke `main` yang mengubah `app/build.gradle.kts` akan memicu workflow "Android Beta Release".

## Langkah
1. Pastikan branch `sync/upstream-1.72` sudah terpush ke `origin`.
2. Pindah ke `main`:
   ```
   git checkout main
   ```
3. Fast-forward `main` ke `sync/upstream-1.72` (main masih di commit lama, tidak ada divergen):
   ```
   git merge --ff-only sync/upstream-1.72
   ```
4. Push `main`:
   ```
   git push origin main
   ```
5. Workflow "Android Beta Release" akan terpicu otomatis (karena `app/build.gradle.kts` berubah dan versionName naik).
6. Pantau hasil workflow sampai "Create GitHub prerelease" sukses.
7. Verifikasi aset rilis: `app-release.apk` dengan versionCode baru dan SHA-256.
8. Catat tautan rilis dan SHA-256 di sini untuk referensi.

## Definisi Selesai
- `main` di-fast-forward ke `sync/upstream-1.72`.
- Push ke `origin/main` sukses.
- Workflow rilis sukses dan rilis beta `beta-1.74.rxlang.1` (atau tag sesuai versi) dibuat.
- Aset `app-release.apk` tersedia untuk diunduh.

## Catatan
- APK rilis ditandatangani dengan keystore baru (bukan upstream). Uninstall build lama sebelum menginstal rilis ini.
- `HIKARINAGI_CLIENT_ID` sudah diisi di GitHub Variables, jadi fitur login Hikarinagi akan bekerja.
- Jangan membuka PR ke `Weiss-UltimateSavior/Tyranor-Next`; fork tetap sengaja berbeda dari upstream.
