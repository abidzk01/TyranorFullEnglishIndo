# Task 06 — Bersihkan Duplikat Dokumen Terjemahan Inggris Lama

## Latar belakang
Sebelum merge, fork sudah memiliki dokumen yang diterjemahkan ke English. Setelah mengambil versi upstream ("take theirs") pada beberapa dokumen, kini mungkin ada duplikat: versi Mandarin dari upstream + versi English lama dari fork.

## Langkah
1. Identifikasi pasangan dokumen Mandarin (upstream) dan English (terjemahan lama fork) yang membahas topik sama.
2. Tentukan versi mana yang akan dijadikan kanonis (biasanya versi English yang baru diterjemahkan dari Task 05, atau versi fork lama yang sudah lengkap).
3. Hapus duplikat yang tidak diperlukan atau gabungkan isinya.
4. Perbarui cross-link dan referensi di README / dokumen lain.
5. Commit dengan pesan Conventional Commits, mis.:
   `docs: remove duplicate translated docs after upstream sync`

## Definisi Selesai
- Tidak ada duplikat dokumen yang membahas topik yang sama dalam bahasa yang berbeda (kecuali sengaja dijaga sebagai referensi).
- Semua tautan di dokumen English tidak mati (tidak menghasilkan 404 di repo).
- `docs/README.md` (index) terupdate dan konsisten.

## Catatan
- Jangan menghapus dokumen yang masih menjadi sumber referensi unik untuk fitur fork (mis. dokumentasi khusus terjemahan Indonesia).
