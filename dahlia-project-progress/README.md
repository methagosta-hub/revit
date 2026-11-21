# Dahlia Project Progress

Aplikasi mandiri untuk pengendalian progres fisik proyek konstruksi dan Kurva S berbobot RAB.

## Konsep
- Master proyek, RAB, jadwal, dan laporan progres disimpan di database aplikasi ini sendiri.
- Setiap laporan memasukkan persentase **kumulatif sampai tanggal laporan** untuk setiap item pekerjaan.
- Bobot item dihitung otomatis dari nilai item (volume × harga satuan) dibanding total RAB aktif.
- Progres aktual proyek = jumlah kontribusi item (bobot × persentase kumulatif).
- Setiap tanggal laporan menyimpan snapshot nilai RAB dan bobot per item, sehingga laporan historis tidak berubah ketika dibuat revisi RAB.
- Setiap revisi RAB dibuat sebagai versi baru; versi sebelumnya dan seluruh laporannya tetap disimpan.

## Rencana Kurva S
Untuk MVP, garis rencana tiap item dibentuk dari tanggal mulai dan selesai item menggunakan fungsi smoothstep:
`f(t) = 3t² − 2t³`, dengan nilai 0% sebelum jadwal, 100% setelah jadwal selesai.
Bobot rencana proyek merupakan penjumlahan progres rencana setiap item yang dikalikan bobot RAB-nya. Jadwal item bisa diatur masing-masing untuk membentuk kurva target proyek.

## Menu
1. Dashboard: total RAB, progres aktual, target rencana, deviasi, kurva S dan komposisi bobot.
2. Master Proyek: data proyek dan periode kontrak.
3. RAB Pekerjaan: kelompok, kode, uraian, satuan, volume, harga satuan, nilai, bobot dan jadwal item.
4. Input Progres: snapshot kumulatif setiap tanggal laporan.
5. Riwayat Laporan: daftar progres dan deviasi tiap tanggal.

## Database dan environment
- Jalankan `database/schema.sql` hanya pada Supabase project khusus Dahlia Project Progress.
- RLS membatasi data proyek berdasarkan `auth.uid()`.
- Environment variables:
  - `NEXT_PUBLIC_PROGRESS_SUPABASE_URL`
  - `NEXT_PUBLIC_PROGRESS_SUPABASE_PUBLISHABLE_KEY`
- Jangan memakai URL/key database BKU. Jangan pernah menaruh secret/service-role key pada frontend.

## Pengembangan
`npm install`, `npm run dev`, `npm run lint`, `npm run build`.


## Pembaruan 21 November 2026 — Menu Pekerjaan, Identitas Sekolah, dan Export Jadwal PDF

Untuk database Dahlia Project Progress yang sudah berjalan, jalankan satu kali migrasi berikut pada **Supabase project khusus Dahlia Project Progress**:

- `database/migrations/20261121_project_menus_school_identity_schedule.sql`

Jangan jalankan migrasi ini pada database Dahlia BKU atau database utama Dahlia Management System.

### Struktur data baru

Hierarki data sekarang menjadi **Proyek → Menu Pekerjaan → Rincian BOQ**. Satu proyek dapat memiliki beberapa menu seperti Kelas Baru, Toilet, Penataan Lingkungan, Kantor, dan sebagainya. Setiap menu memiliki versi RAB, bobot, jadwal, dan riwayat laporan progres masing-masing.

Migrasi membuat satu menu awal bernama **RAB Utama** pada setiap proyek lama. Seluruh item BOQ dan laporan lama ditautkan ke menu tersebut tanpa mengubah ID item, sehingga data lama tetap terbaca.

### Identitas proyek sekolah

Master proyek menyimpan identitas sekolah dan penandatangan: nama proyek/sekolah, alamat, telepon, NPSN, Kepala Sekolah, P2SP, Perencana, dan Pengawas. Nama proyek dipakai sebagai judul sekolah pada dokumen. Kolom lama seperti lokasi, klien, nomor kontrak, serta periode proyek tetap dipertahankan.

### Kurva S Gabungan dan Jadwal Pelaksanaan PDF

Buka **Jadwal / PDF** setelah memilih proyek. Halaman ini adalah *Kurva S Builder* tingkat proyek, bukan export satu menu. Builder memuat rincian RAB aktif seluruh menu dalam proyek:
- Centang menu mana yang dimasukkan atau keluarkan dari dokumen.
- Atur urutan tampil setiap menu.
- Pilih tampilan **Per divisi** untuk menampilkan judul menu lalu rincian kelompok pekerjaan (`work_group`), atau **Ringkas** untuk menampilkan identitas menu sebagai satu baris jumlah harga dan bobot.
- Bobot setiap baris dihitung terhadap total nilai seluruh menu yang dicentang, sehingga bobot gabungan menjadi basis 100%.
- Kolom minggu dikelompokkan berdasarkan bulan. Tiap sel berisi kontribusi bobot rencana pada minggu tersebut; arsiran hanya tampil ketika ada aktivitas dan semakin gelap sesuai persentase kumulatif pekerjaan pada divisi/menu itu.
- Laporan progres input dari setiap menu aktif (tabel `progress_reports` dan `progress_report_items`) juga dimuat untuk menu dan versi RAB yang dipilih.
- **Kurva S rencana dan realisasi aktual digambar langsung di atas matriks kolom mingguan**, dengan garis biru solid untuk rencana dan merah putus-putus untuk realisasi. Posisi vertikal menunjukkan tingkat progres kumulatif terhadap susunan baris pekerjaan, sehingga titik kurva dapat dibaca bersama divisi/menu yang dilalui.
- Bagian bawah tabel memuat bobot rencana mingguan, progres rencana kumulatif, dan progres realisasi kumulatif. Grafik terpisah di bawah matriks tidak digunakan lagi.
- Opsi tanda tangan Kepala Sekolah, P2SP, Perencana, dan Pengawas; tersedia **Pilih semua** untuk menampilkan keempat penandatangan.

Distribusi rencana mingguan dihitung dari tanggal mulai dan selesai tiap item menggunakan fungsi smoothstep yang sama dengan target rencana dashboard. Nilai mingguan merupakan perubahan progres rencana berbobot antar batas minggu. Kolom mingguan dikelompokkan menurut bulan kalender berdasarkan tanggal mulai minggu.

Tombol **Cetak / Simpan PDF** membuka dialog cetak browser; pilih **Save as PDF / Simpan sebagai PDF**. Format halaman disiapkan landscape A3.

### Tipografi antarmuka

Aplikasi menggunakan **Plus Jakarta Sans** untuk teks antarmuka dan **Space Grotesk** untuk heading serta elemen display agar tampilan lebih modern, tegas, dan futuristik.
