# Dahlia BKU — Multi-select Potong Nota

Pembaruan ini mengubah pemotongan rincian menjadi pemilihan banyak baris sekaligus. Semua rincian yang dicentang akan digabung menjadi **satu nota baru**, bukan dibuatkan satu nota untuk setiap baris.

## Perubahan

1. Setiap rincian material memiliki kotak centang **Gabungkan ke nota baru**.
2. Panel pemilihan menampilkan jumlah rincian terpilih, jumlah total rincian, dan nilai uang dari rincian terpilih.
3. Tombol aksi memperjelas hasilnya, misalnya **Potong 3 rincian ke 1 nota baru**.
4. Tombol **Pilih semua kecuali 1** memudahkan pemilihan cepat sambil menyisakan satu rincian di nota asal.
5. Semua rincian terpilih digabung dalam satu draft nota baru; tanggal, toko, kategori, dan metode pembayaran mengikuti nota sumber dan masih dapat diperiksa sebelum disimpan.
6. Aksi **Hapus baris** tetap tersedia dan tidak berubah.
7. Berlaku untuk mode **Ubah nota** dan form salinan/nota baru yang mendukung rincian pengeluaran.
8. Minimal satu rincian wajib tertinggal di nota utama agar nota sumber tidak kosong.

## File yang diganti

- `app/page.tsx`
- `app/components/transactions/TransactionFormModal.tsx`
- `app/components/transactions/TransactionDetailEditor.tsx`
- `app/components/transactions/TransactionDetailRow.tsx`

## Cara memasang di Windows

Jangan membuat backup di dalam folder `bku-app`, karena TypeScript dapat ikut memeriksa file backup. Simpan backup di folder induk proyek.

1. Hentikan server lokal dengan `Ctrl+C`.
2. Pastikan PowerShell berada di root proyek `bku-app`:

   `D:\_rabsystem\bku-system-revit\bku-app`

3. Buat backup di luar proyek:

```powershell
$backup = "..\backup-bku-multi-split-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force $backup | Out-Null
Copy-Item .\app\page.tsx $backup
Copy-Item .\app\components\transactions\TransactionFormModal.tsx $backup
Copy-Item .\app\components\transactions\TransactionDetailEditor.tsx $backup
Copy-Item .\app\components\transactions\TransactionDetailRow.tsx $backup
```

4. Ekstrak ZIP ini ke root `bku-app` dan izinkan penggantian empat file di atas.
5. Jalankan pemeriksaan lokal:

```powershell
npm run lint
npm run build
npm run dev
```

Buka `http://localhost:3000` untuk pengujian. Tidak ada SQL/migrasi database yang diperlukan. Paket ini tidak melakukan commit, push GitHub, atau deployment Vercel.

## Skenario uji

1. Buka nota kas keluar dengan sekurang-kurangnya 3 rincian, lalu klik **Ubah**.
2. Centang 2 rincian. Panel harus menunjukkan `2 dari 3 rincian dipilih`, nilai terpilih, dan tombol `Potong 2 rincian ke 1 nota baru`.
3. Klik tombol potong. Pastikan nota asal berisi 1 rincian dan satu draft nota baru berisi tepat 2 rincian.
4. Periksa uraian, tanggal, toko, nomor bukti, rincian dan total pada kedua nota. Isi nomor nota/bukti baru sesuai bukti transaksi yang benar.
5. Simpan perubahan. Pastikan hanya ada 2 transaksi: nota utama dan satu nota hasil penggabungan 2 rincian.
6. Uji **Pilih semua kecuali 1**, **Batal pilih**, dan **Hapus baris**.
7. Pastikan tombol potong tidak aktif bila semua rincian dipilih; minimal satu rincian harus tersisa pada nota utama.
