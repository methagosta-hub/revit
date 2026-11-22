# Standar PDF dan Kewenangan Dokumen Dahlia

## Prinsip penerbitan

1. PDF mengambil nomor dari data transaksi/database. Frontend hanya menyusun nama file; frontend tidak membuat nomor transaksi baru.
2. Setiap berkas menyebut tipe dokumen, nomor sumber, proyek/periode, revisi, status sumber, waktu terbit, serta penerbit. Revisi koreksi memakai dokumen baru dan merujuk nomor yang digantikan.
3. PDF merekam status ketika dicetak. Mencetak, mengunduh, atau memegang PDF tidak mengubah status transaksi dan tidak menambahkan permission.
4. Kewenangan mengikuti akun, permission, scope proyek, dan status sumber di aplikasi. Bukti pembayaran memerlukan transaksi paid/confirmed serta bukti transfer atau tanda terima yang sesuai.
5. Dokumen draft/submitted harus diberi label jelas bahwa dokumen belum disetujui. Kolom tanda tangan hanya sah setelah ditandatangani pihak yang berwenang.
6. Dokumen sensitif (payroll, tarif upah, pembayaran) hanya boleh diekspor oleh pengguna yang memiliki akses modul terkait; slip individual tidak boleh diekspor sebagai daftar umum.

## Hak setelah status sumber yang tepat

| Dokumen | Kapan diterbitkan | Hak/proses yang didukung | Yang belum otomatis terjadi |
| --- | --- | --- | --- |
| RAB | Anggaran proyek disahkan | Menjadi acuan volume dan anggaran | PO, perubahan pekerjaan, atau pembayaran belum disetujui |
| Purchase Order | PO approved/ordered | Supplier dapat memenuhi pesanan yang ditetapkan | Barang belum dianggap diterima; pembayaran belum otomatis cair |
| Penerimaan barang (GR) | Penerimaan confirmed setelah pemeriksaan | Kuantitas diterima dapat masuk catatan stok/proyek | Invoice belum otomatis lunas |
| Pengeluaran material (GI) | Serah-terima material dikonfirmasi | Perpindahan stok dan penerima tercatat | Tidak membuktikan kehadiran atau upah |
| Penugasan harian | Penugasan active dalam rentang berlaku | Pekerja dapat menjalankan tugas dan mencatat kehadiran | Belum membuktikan hadir/hasil kerja atau gaji disetujui |
| Rekap kehadiran | Periode diverifikasi dan locked | Dapat dipakai sebagai dasar hitung payroll | Belum menentukan tarif dan belum membuktikan pembayaran |
| Kontrak/perubahan kerja | Ditandatangani dan active | Menetapkan masa kerja dan dasar upah yang disepakati | Draft tidak mengubah tarif atau status kerja |
| Slip gaji | Payroll run approved | Pekerja dapat mengetahui upah bersih yang disetujui | Slip bukan tanda terima uang |
| Daftar payroll | Payroll run approved | Menetapkan kewajiban payroll sesuai hasil yang disahkan | Uang baru dianggap dibayar saat transaksi pembayaran dikonfirmasi |
| Kontrak subkon | Ditandatangani dan active | Subkon dapat bekerja dan mengajukan klaim saat termin terpenuhi | Kontrak tidak mencairkan seluruh nilai kontrak |
| Pengukuran/progres | Volume diverifikasi | Menjadi lampiran/dasar klaim sesuai kontrak | Bukan persetujuan pembayaran final |
| Permintaan pembayaran subkon | Klaim diajukan dengan syarat dan progres lengkap | Status submitted memberi dasar untuk meminta pencairan; approved menetapkan kewajiban sesuai nilai yang disetujui | Draft/submitted tidak berarti dibayar; perlu verifikasi dan payment approval |
| Voucher/bukti bayar | Pembayaran tercatat paid/confirmed | Mendukung bukti administratif pembayaran | Voucher draft atau instruksi transfer bukan bukti dana diterima |
| Laporan harian | Laporan ditinjau/approved | Merekam kegiatan, tenaga, alat, material dan hambatan | Tidak otomatis menyetujui upah, progress, atau klaim |
| Rekap keuangan / SPJ / laporan eksternal | Snapshot dibekukan dan diterbitkan | Menyajikan catatan pada cakupan serta periode tertentu | Bukan instruksi transaksi atau persetujuan pencairan |
| Kurva S | Baseline dan tanggal cut-off ditentukan | Menyajikan snapshot rencana vs realisasi | Tidak mengubah baseline, kontrak, atau tagihan |

## Urutan berkas dan nama

Pola nama file baku:

```text
DAHLIA__{NOMOR-SUMBER}__{KODE-PROYEK-OPSIONAL}__{JUDUL}__R{NN}.pdf
```

Kode sumber yang sudah disimpan pada tabel transaksi harus digunakan ulang, termasuk PO, GR, HRT, ABS, PAYR/PIT, PKJ, UTM, KON-SUB, SPR, LHP, recap number, dan EXT. Kode baru yang belum tersedia di sumber data ditandai sebagai rekomendasi katalog sampai generator/database code ditambahkan. Kode tidak boleh dibuat dari browser timestamp, karena dapat menggandakan dan tidak dapat dijadikan identitas resmi.

Header standar A4: monogram/identitas Dahlia, jenis dokumen, nomor sumber, status, revisi, proyek, periode, waktu/penerbit, penanda klasifikasi, dan ringkasan dasar/batas kewenangan. Footer mencantumkan nomor dan revisi pada setiap halaman. Dokumen transaksi yang memerlukan pengesahan memiliki blok tanda tangan berdasarkan alur sumber.

## Cakupan implementasi lokal

- `src/lib/documents/catalog.ts` memuat katalog, pola kode yang teramati/rekomendasi, status ketersediaan, serta dampak workflow setiap dokumen.
- `src/components/documents/BusinessDocumentFrame.tsx` adalah kerangka A4 bersama dengan header, metadata, nomor file, status, catatan kewenangan, tanda tangan, dan cetak/Simpan sebagai PDF.
- `src/lib/documents/filename.ts` membentuk nama file dari nomor sumber yang wajib disediakan.
- `supabase/migrations/*_business_document_registry.sql` menyiapkan metadata arsip dan RLS. File ini belum diterapkan ke Supabase dan belum mengunggah PDF ke Storage.
- Tombol cetak memakai dialog cetak browser (pilih **Save as PDF**); nama default berasal dari judul dokumen. Pengarsipan otomatis ke Storage belum terhubung.
- Beberapa ekspor yang sudah ada masih memakai renderer halaman masing-masing; migrasi ke kerangka bersama dapat dilakukan bertahap setelah pemilik data, kondisi approval, dan penerima tiap tipe dokumen dipastikan.
