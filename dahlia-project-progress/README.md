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

### Export Jadwal Pelaksanaan Pekerjaan

Buka **Jadwal / PDF** setelah memilih proyek dan menu. Dokumen mengikuti struktur contoh jadwal pelaksanaan:
- Uraian pekerjaan, jumlah harga, bobot rencana, dan pembagian bobot rencana per minggu yang dikelompokkan per bulan.
- Total bobot rencana mingguan dan progres rencana kumulatif mingguan.
- Kurva progres rencana kumulatif.
- Opsi tanda tangan Kepala Sekolah, P2SP, Perencana, dan Pengawas; tersedia **Pilih semua** untuk menampilkan keempat penandatangan.
- Tombol **Cetak / Simpan PDF** membuka dialog cetak browser. Pilih **Save as PDF / Simpan sebagai PDF** untuk menyimpan file. Format halaman disiapkan landscape A3.

Distribusi rencana mingguan dihitung dari tanggal mulai dan selesai setiap item menggunakan kurva smoothstep yang sama dengan perhitungan target rencana pada dashboard; nilai mingguan adalah perubahan bobot rencana antar batas minggu.
