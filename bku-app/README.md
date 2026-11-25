# BKU Eksternal — JAVAWASTHU MANAGEMENT

Aplikasi mandiri yang dideploy sebagai proyek Vercel terpisah dari JAVAWASTHU MANAGEMENT utama.

## Isolasi
- Tidak mengimpor AuthProvider, Supabase client, tabel, RPC, atau tipe data JAVAWASTHU MANAGEMENT utama.
- Login BKU menggunakan Supabase Auth dari proyek BKU baru.
- Semua tabel dan file bukti transaksi tersimpan pada proyek Supabase BKU.
- SQL pada database/setup.sql hanya dijalankan pada proyek Supabase BKU baru.

## Environment variables
Atur di proyek Vercel BKU untuk Production, Preview, dan Development:
- NEXT_PUBLIC_BKU_SUPABASE_URL
- NEXT_PUBLIC_BKU_SUPABASE_ANON_KEY

Gunakan URL dan anon/publishable key dari proyek Supabase BKU. Jangan gunakan URL/kunci proyek utama JAVAWASTHU MANAGEMENT, dan jangan pernah menaruh service_role key di browser atau variabel NEXT_PUBLIC_*.

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

- Export PDF dengan pilihan bagian BKU, Matriks Absensi, dan Rekap Total Material per Kelompok / per Item. Bagian yang dipilih digabung ke satu PDF; nama file dibuat otomatis menggunakan nama proyek, jenis laporan, rentang tanggal, timestamp, dan UUID unik.

## Pembaruan skema database
Jika database BKU sudah menjalankan versi setup.sql sebelumnya, jalankan kembali file database/setup.sql terbaru. Migrasi menggunakan ADD COLUMN IF NOT EXISTS sehingga menambahkan kolom identitas sekolah dan rincian nota tanpa menghapus transaksi yang sudah ada.

## Pembaruan database terbaru
Jalankan ulang `database/setup.sql` pada proyek Supabase BKU. Selain migrasi profil, file ini membuat tabel toko per sekolah, katalog material master dan custom per sekolah, menambahkan relasi toko pada transaksi, menambahkan RPC untuk menggeser jadwal, serta mengisi 210 harga referensi material. Perubahan bersifat idempotent untuk migrasi kolom, kebijakan, dan seed katalog.

Harga katalog adalah estimasi acuan nasional per November 2026, bukan quotation toko. Harga perlu dicek ulang sesuai kota, spesifikasi, merek, volume, ongkos kirim, serta perlakuan pajak sebelum dipakai untuk RAB atau pembelian.

## Master Kategori Rekap
Untuk instalasi database BKU yang belum memiliki master kategori, jalankan file migrasi berikut satu kali melalui **Supabase Dashboard → proyek Supabase BKU → SQL Editor → New query**, sesuai urutan:

1. `database/migrations/20261120_bku_report_categories.sql` — membuat tabel dan mengisi kategori awal kas masuk serta kas keluar.
2. `database/migrations/20261120_bku_report_category_management.sql` — menambahkan fungsi database yang dipanggil aplikasi untuk menambah, mengubah, serta mengaktifkan atau menonaktifkan kategori.

Setelah kedua migrasi selesai, pengelolaan kategori dilakukan langsung melalui **Master Data → Master Rekap Data**. Pengguna tidak perlu menulis SQL lagi untuk kegiatan sehari-hari. Formulir aplikasi membuat kode internal otomatis; saat mengubah kategori, kode internal dipertahankan agar transaksi lama tetap terhubung. Kategori yang dinonaktifkan disembunyikan dari pilihan transaksi baru tetapi tetap dipertahankan untuk membaca riwayat.

Kategori bersifat global untuk seluruh akun pada database BKU yang sama. Kode `upah` dipertahankan dan tidak dapat dinonaktifkan karena dipakai otomatis oleh modul Absensi & Gaji.

## Jadwal Absensi dan Penggajian Mingguan

Periode kerja mingguan menggunakan tujuh hari kalender penuh, **Minggu sampai Sabtu**, tanpa hari libur terjadwal. Matriks absensi menampilkan tujuh kolom hari. Pembayaran gaji mingguan selalu dibukukan pada **hari Sabtu** sebagai satu transaksi kas keluar kategori `upah`.

Untuk memperbarui database BKU yang sebelumnya menggunakan periode Senin–Sabtu, jalankan satu kali:

- `database/migrations/20261120_payroll_sunday_saturday.sql` — mengubah awal periode menjadi Minggu, akhir periode menjadi Sabtu, menetapkan tanggal pembayaran pada Sabtu, dan menyesuaikan kunci periode historis tanpa menghapus absensi maupun mengubah total HOK/nominal yang sudah tersimpan.

Jalankan migrasi ini hanya pada proyek Supabase BKU. Jangan jalankan pada database utama JAVAWASTHU MANAGEMENT.


## Export PDF terpilih dan pengamanan tanggal
Pada dialog **Export PDF**, pilih satu atau beberapa bagian berikut:
- **BKU** — saldo awal, transaksi masuk/keluar, rincian nota, dan saldo akhir.
- **Matriks Absensi** — matriks Minggu–Sabtu, total HOK, dan upah pekerja.
- **Rekap Total Material** — jumlah belanja per kelompok dan rincian akumulasi per item, dengan volume dipisahkan per satuan.

Bagian terpilih akan digabung menjadi satu PDF. Nama dokumen dibentuk otomatis dari nama proyek, jenis bagian, rentang tanggal, waktu ekspor sampai milidetik, serta UUID acak sehingga ekspor berulang tidak memakai nama yang sama.

## Kunci laporan berdasarkan tanggal
Setelah laporan difinalkan, atur **Pengamanan laporan berdasarkan tanggal** dan pilih batas tanggal, misalnya 29 November 2026. Semua tanggal sampai dan termasuk tanggal tersebut akan terkunci. Penambahan, salin nota ke tanggal terkunci, pemindahan, perubahan, penghapusan transaksi, perubahan absensi, dan penyimpanan rekap penggajian yang bersinggungan dengan tanggal terkunci akan ditolak.

Batas penguncian bisa dimundurkan untuk membuka tanggal setelah batas baru, atau gunakan **Buka semua kunci** untuk membuka seluruh tanggal. Penguncian dibatasi per buku kas/proyek.

Untuk database BKU yang sudah berjalan, jalankan satu kali migrasi `database/migrations/20261121_report_export_and_date_lock.sql` pada proyek Supabase BKU. Jangan jalankan pada database utama JAVAWASTHU MANAGEMENT.
