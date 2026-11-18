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
- Banyak buku kas untuk proyek eksternal.
- Saldo awal tunai dan bank.
- Kalender bulanan dan panel transaksi per tanggal.
- Input cepat beberapa nota pada tanggal yang sama.
- Kas masuk, kas keluar, dan transfer internal tunai/bank.
- Saldo berjalan per transaksi.
- Lampiran foto nota/PDF di storage privat.
- Pengingat nominal lebih dari Rp2.000.000 tanpa mengubah nilai transaksi sebenarnya.
