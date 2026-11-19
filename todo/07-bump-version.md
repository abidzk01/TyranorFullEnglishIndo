# Task 07 — Bump Versi ke `1.74.rxlang.1`

## Latar belakang
Setelah semua terjemahan dan restrukturisasi selesai, versi perlu dinaikkan dari `1.72` (basis upstream) ke `1.74.rxlang.1` sesuai permintaan pengguna. `versionCode` dihitung otomatis dari `appVersionName` melalui `versionCodeOf()`:
- `1.74` → `major=1, minor=74, patch=1` → `1*1_000_000 + 74*1_000 + 1 = 1_074_001`

## Langkah
1. Ubah `app/src/main/build.gradle.kts` (biasanya `app/build.gradle.kts`):
   ```
   val appVersionName = "1.74.rxlang.1"
   ```
2. Verifikasi `versionCodeOf()` menghasilkan `1_074_001` (tidak perlu diubah, otomatis).
3. Commit dengan pesan Conventional Commits, mis.:
   `build: bump version to 1.74.rxlang.1`
4. Push ke branch `sync/upstream-1.72` untuk memicu workflow rilis (jika workflow terpasang di branch ini) atau simpan untuk fast-forward ke `main`.

## Definisi Selesai
- `appVersionName = "1.74.rxlang.1"`.
- `versionCode` terhitung `1_074_001`.
- Commit sudah ada di branch `sync/upstream-1.72`.

## Catatan
- Workflow rilis saat ini terpicu pada push ke `main` yang mengubah `app/build.gradle.kts`. Setelah fast-forward ke `main`, perubahan versi akan memicu workflow rilis beta baru.
- Jangan merge upstream `main` lagi setelah ini tanpa membuat branch terpisah, untuk menjaga fork tetap terpisah dari upstream.
