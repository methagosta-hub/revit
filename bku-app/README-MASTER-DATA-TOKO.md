# Master Data — Database Toko JAVAWASTHU MANAGEMENT BKU

Pembaruan ini menambahkan menu **Master Data → Database Toko**.

## Fungsi
- Tambah toko/pemasok tanpa membuat transaksi.
- Ubah nama, alamat, nomor telepon, dan catatan.
- Nonaktifkan atau aktifkan kembali toko tanpa menghapus histori.
- Cari berdasarkan nama, alamat, telepon, atau catatan.
- Toko nonaktif tidak tersedia untuk transaksi baru.
- Perubahan nama disinkronkan ke semua transaksi terkait berdasarkan `store_id`, sehingga daftar transaksi, rekap, dan PDF BKU menampilkan nama terbaru.

## Migrasi database wajib
Sebelum menggunakan kode ini, jalankan:

`database/migrations/20261120_store_master_management.sql`

Jalankan hanya pada proyek Supabase BKU `arqfzltimcehqssxojtz`, bukan database utama JAVAWASTHU MANAGEMENT.

Migrasi menambah kolom status aktif, menghubungkan transaksi lama yang belum punya `store_id`, dan membuat fungsi atomik `bku_save_store` untuk mengubah master sekaligus nama toko pada histori terkait.

## File kode
- `app/page.tsx`
- `app/lib/bku/types.ts`
- `app/hooks/useBkuTransactions.ts`
- `app/components/transactions/TransactionFormModal.tsx`
- `app/components/transactions/TransactionLedger.tsx`
- `app/components/stores/StoreMasterView.tsx`
