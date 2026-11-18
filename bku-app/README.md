# BKU Eksternal — Dahlia

Aplikasi mandiri yang dideploy sebagai proyek Vercel terpisah dari Dahlia utama.

## Isolasi
- Tidak mengimpor AuthProvider, Supabase client, tabel, RPC, atau tipe data Dahlia utama.
- Login BKU menggunakan Supabase Auth dari proyek BKU baru.
- Semua tabel dan file bukti transaksi tersimpan pada proyek Supabase BKU.
- SQL pada database/setup.sql hanya dijalankan pada proyek Supabase BKU baru.

## Environment variables
Atur di proyek Vercel BKU untuk Production, Preview, dan Development:
- NEXT_PUBLIC_BKU_SUPABASE_URL
- NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY

Gunakan URL dan anon/publishable key dari proyek Supabase BKU. Jangan gunakan URL/kunci proyek utama Dahlia, dan jangan pernah menaruh service_role key di browser atau variabel NEXT_PUBLIC_*.

## Database
Jalankan database/setup.sql di SQL Editor pada proyek Supabase BKU baru. File tersebut membuat tabel buku kas, transaksi, RLS, dan bucket privat untuk bukti nota.

## Fitur tahap awal
- Login dan pendaftaran akun tersendiri.
- Banyak buku kas sekolah / proyek eksternal dengan identitas nama sekolah, kepala sekolah, perencana, pengawas, dan P2SP.
- Saldo awal tunai dan bank.
- Kalender bulanan dan panel transaksi per tanggal.
- Input beberapa nota pada tanggal yang sama.
- Rincian kas keluar per nota: nama material, harga satuan, volume, satuan, dan total per item; jumlah nota dihitung otomatis.
- Kas masuk, kas keluar, dan transfer internal tunai/bank.
- Saldo berjalan per transaksi.
- Lampiran foto nota/PDF di storage privat.
- Pengingat nominal lebih dari Rp2.000.000 tanpa mengubah nilai transaksi sebenarnya.

- Export laporan PDF dengan 20 tema visual dan 20 pilihan font modern. Laporan memuat identitas sekolah, ringkasan saldo, transaksi, rincian material per nota, dan ruang tanda tangan.

## Pembaruan skema database
Jika database BKU sudah menjalankan versi setup.sql sebelumnya, jalankan kembali file database/setup.sql terbaru. Migrasi menggunakan ADD COLUMN IF NOT EXISTS sehingga menambahkan kolom identitas sekolah dan rincian nota tanpa menghapus transaksi yang sudah ada.
