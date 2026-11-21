# Dahlia BKU — Modul Pemecahan Nota, Absensi & Penggajian

Paket ini merupakan **overlay untuk proyek lokal** `bku-app`. Paket tidak menyambungkan GitHub, tidak melakukan commit/push, tidak mengubah pengaturan Vercel, dan tidak menjalankan migrasi database secara otomatis.

## Isi paket

- `app/page.tsx` — komposisi halaman, navigasi Kalender / Buku Transaksi / Absensi & Gaji / Profil.
- `app/components/transactions/*` — formulir transaksi, beberapa nota dalam satu tanggal, rincian material, pemecahan nota, kartu dan ledger transaksi.
- `app/components/workers/*` — daftar induk pekerja dan matriks absensi/penggajian mingguan.
- `app/components/reports/*` — export PDF terpilih (BKU, Matriks Absensi, Rekap Material), nama file otomatis unik, dan panel penguncian laporan.
- `app/hooks/useBkuPayroll.ts` — pemuatan daftar pekerja, absensi mingguan, penyalinan absensi, dan penyimpanan penggajian.
- `app/hooks/useBkuTransactions.ts` — penyimpanan transaksi dan sinkronisasi grup nota terpisah.
- `app/lib/bku/*` — tipe data, formatter, perhitungan saldo, validasi, dan perpindahan transaksi.
- `database/migrations/20261119_payroll_split_receipts.sql` — migrasi kolom grup nota, tabel pekerja, absensi, rekap mingguan, RLS, dan RPC penyimpanan upah.
- `database/migrations/20261120_payroll_sunday_saturday.sql` — mengubah periode absensi menjadi Minggu–Sabtu dan menetapkan pembayaran pada Sabtu.
- `database/migrations/20261121_report_export_and_date_lock.sql` — membuat kunci laporan per tanggal dan trigger pengaman transaksi, absensi, serta rekap penggajian.

## Cara memasang pada Windows

1. Pastikan root proyek lokal adalah `D:\_rabsystem\bku-system-revit\bku-app`.
2. Hentikan server lokal dengan `Ctrl+C`.
3. Buat cadangan folder `app` terlebih dahulu. Contoh dari PowerShell pada root `bku-app`:

   ```powershell
   Copy-Item .\app .\app-backup-before-payroll -Recurse
   ```

4. Ekstrak isi ZIP ke **root `bku-app`**, bukan ke `bku-app\app`. Saat Windows bertanya apakah file di lokasi sama akan diganti, pilih replace/replace all. Paket ini tidak menyertakan `app/layout.tsx`, `app/globals.css`, `lib/supabase.ts`, `.env.local`, `package.json`, maupun file konfigurasi Next.js.
5. Pastikan `.env.local` di root `bku-app` berisi variabel berikut dengan URL dan anon/publishable key dari proyek Supabase BKU:

   ```env
   NEXT_PUBLIC_BKU_SUPABASE_URL=https://arqfzltimcehqssxojtz.supabase.co
   NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY=ISI_ANON_ATAU_PUBLISHABLE_KEY_ANDA
   ```

   Jangan gunakan `service_role` atau secret key di variabel `NEXT_PUBLIC_*`.

## Migrasi Supabase — wajib sebelum menguji fitur baru

Jalankan file `database/migrations/20261119_payroll_split_receipts.sql` secara manual melalui SQL Editor **hanya pada proyek Supabase BKU** (`arqfzltimcehqssxojtz`). Jangan jalankan pada database utama Dahlia.

Migrasi ini:

- menambah `split_group_id`, `split_group_label`, dan `split_group_total` pada `bku_transactions`;
- membuat master `bku_workers`;
- membuat `bku_worker_attendance` dengan snapshot nama, jenis pekerja, tarif harian, HOK, dan nilai upah;
- membuat `bku_payroll_weeks` untuk memastikan satu transaksi kas keluar tertaut pada satu minggu penggajian;
- menambahkan kebijakan RLS dan RPC `bku_save_weekly_payroll`.

Migrasi dibungkus transaksi dan ditulis dengan `IF NOT EXISTS` / `CREATE OR REPLACE` agar aman dijalankan kembali untuk skema yang sudah sesuai. Tetap tinjau hasil SQL Editor sebelum melanjutkan.

## Perilaku fitur

### Pemecahan nota

- Form transaksi dapat memuat beberapa nota pada tanggal yang sama; masing-masing menjadi satu baris transaksi tersendiri dengan jumlah sendiri.
- Pada nota pengeluaran dengan lebih dari satu baris material, tombol **Pindah ke nota baru** memindahkan satu baris material ke draft nota tersendiri. Proses dapat diulang selama nota sumber masih memiliki lebih dari satu baris.
- Nota yang dipisah diberi grup referensi agar jumlah kelompok bisa ditelusuri pada kartu dan laporan PDF. Setelah disimpan, total grup dihitung ulang dari transaksi yang benar-benar tersimpan.
- Untuk edit nota yang sudah tersimpan, edit satu transaksi tetap dilakukan satu per satu. Untuk membuat pecahan dari nota lama, gunakan fitur Salin lalu lakukan pemisahan pada form salinan; periksa bukti dan nominal sebelum menyimpan agar tidak menggandakan transaksi yang sudah dibukukan.
- Pemisahan hanya untuk pembelian/bukti yang memang terpisah. Jangan memecah satu faktur atau transaksi yang sama secara semu untuk menghindari pajak atau batas administrasi.

### Absensi dan penggajian mingguan

- Matriks Minggu–Sabtu menerima HOK 0, 0,25, 0,5, 0,75, atau 1.
- Nilai awal daftar induk: Tukang Rp140.000/hari dan Pekerja Rp120.000/hari. Tarif, nama, jenis, dan tanggal mulai bergabung dapat disesuaikan.
- Pekerja dinonaktifkan, bukan dihapus permanen, sehingga histori tetap ada. Pekerja aktif maupun pekerja nonaktif yang punya absensi pada minggu tersebut tetap ditampilkan saat relevan.
- Absensi satu minggu dapat disalin ke minggu lain berdasarkan hari yang sama. Hasil salinan tetap harus diperiksa dan disimpan secara eksplisit.
- Tanggal pembayaran otomatis jatuh pada hari Sabtu di akhir periode. Penyimpanan membuat satu transaksi `OUT` kategori `upah` pada hari tersebut. Penyimpanan ulang minggu yang sama memperbarui transaksi terkait, bukan membuat transaksi gaji ganda.
- Snapshot nama/jenis/tarif pada minggu yang telah disimpan tidak ikut berubah saat master pekerja diperbarui.

### Export PDF

- Pilih tanggal awal dan akhir serta bagian laporan yang diperlukan: BKU, Matriks Absensi, dan/atau Rekap Total Material.
- Semua bagian yang dicentang digabung menjadi satu PDF, sementara setiap bagian memiliki halaman/section tersendiri.
- Rekap material mengakumulasi item di bawah kelompok yang sudah dipetakan, serta menampilkan material yang belum dipetakan. Volume tetap terpisah menurut satuan dan sumber nota ditampilkan per item.
- Nama dokumen otomatis memakai nama proyek, bagian yang dipilih, periode, timestamp milidetik, dan UUID acak. Ekspor ulang untuk proyek/periode yang sama tetap mendapat nama berbeda.
- Matriks absensi dibuat per minggu Minggu–Sabtu untuk semua pekerja yang tanggal bergabungnya tidak melewati tanggal akhir laporan. Sel di luar rentang laporan atau sebelum tanggal bergabung dibiarkan kosong.
- Jika pekerja baru masuk pada minggu ketiga, nama tetap tersedia di matriks minggu sebelumnya tetapi sel hariannya kosong.
- PDF membuka jendela laporan setelah klik pengguna untuk menghindari pemblokiran popup saat data absensi dimuat.

### Penguncian laporan berdasarkan tanggal

- Panel pengamanan tersedia di halaman buku kas. Pilih tanggal finalisasi, misalnya 29 November 2026, untuk mengunci tanggal tersebut dan seluruh tanggal sebelumnya dalam buku kas yang sedang aktif.
- Tanggal yang terkunci tidak dapat menerima nota baru, salinan nota, perubahan tanggal, pemindahan, perubahan isi, atau penghapusan transaksi.
- Absensi dan penyimpanan penggajian yang bersinggungan dengan rentang terkunci juga ditolak.
- Batas penguncian bisa dimundurkan untuk membuka tanggal setelah batas baru, atau seluruh kunci dapat dibuka kembali. Pemilik buku kas tetap memiliki akses untuk melakukan pembukaan.
- Trigger database menjadi lapisan pengaman utama; pemeriksaan pada UI hanya memberi peringatan lebih awal sebelum pengguna menyimpan.

## Pemeriksaan lokal

Setelah migrasi database selesai dan `.env.local` valid, jalankan dari root `bku-app`:

```powershell
npm run lint
npm run build
npm run dev
```

Kemudian buka `http://localhost:3000`.

## Batas verifikasi

File kode pada paket telah diperiksa dari sisi parsing TypeScript/TSX dan pemeriksaan TypeScript terisolasi. Build Next.js penuh, koneksi real-time ke proyek Supabase Anda, dan hasil eksekusi migrasi belum dijalankan dari komputer/database Anda. Jalankan tiga perintah lokal di atas dan uji akun BKU lokal setelah migrasi. Jika muncul error, kirim log lengkapnya untuk diperbaiki.
