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
