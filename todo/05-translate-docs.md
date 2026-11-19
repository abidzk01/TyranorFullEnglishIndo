# Task 05 — Terjemahkan Dokumen Mandarin Baru dari Upstream ke English

## Latar belakang
Upstream 1.72 membawa dokumen Mandarin baru dan memperbarui 7 dokumen lama. Setelah merge dengan strategi "take theirs" pada dokumen, sekarang ada dokumen Mandarin baru yang perlu diterjemahkan ke English, sementara terjemahan Inggris lama masih tersedia (kemungkinan ada duplikat).

## Langkah
1. Identifikasi dokumen Mandarin baru dari upstream yang belum ada terjemahan English (lihat `docs/` dengan nama file Mandarin).
2. Terjemahkan setiap dokumen ke English, simpan dengan nama file English sesuai konvensi fork.
3. Pastikan cross-link (tautan antar dokumen) diperbarui agar mengarah ke versi English.
4. Commit per dokumen atau per grup dokumen dengan pesan Conventional Commits, mis.:
   `docs: translate upstream Mandarin docs to English`

## Definisi Selesai
- Tidak ada dokumen Mandarin baru dari upstream yang tidak punya versi English.
- Semua cross-link dalam dokumen English mengarah ke file English yang benar.
- Build docs tidak terganggu (dokumen hanya file teks, tidak ada build).

## Catatan
- Sisakan kolom nilai resource `zh`/`ja` dan contoh judul game serta sentinel `[游戏目リア]` jika sengaja dipertahankan (lihat konteks fork sebelumnya).
- Prioritaskan dokumen yang terkait fitur baru 1.72 (engine baru, resource baru, dll.).
