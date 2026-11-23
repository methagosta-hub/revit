import Link from 'next/link';
import { ArrowUpRight, ClipboardCheck, ClipboardList, FileText, PackageCheck, Truck, Users } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

const cards = [
  { title: 'Permintaan Barang', description: 'Tinjau PR material yang diajukan Mandor melalui Dahlia Field.', href: '/pengadaan/permintaan', icon: ClipboardList },
  { title: 'Data Supplier', description: 'Daftar pemasok dan kontak pembelian.', href: '/pengadaan/supplier', icon: Users },
  { title: 'Proses Purchasing', description: 'Buat PO untuk kebutuhan material proyek.', href: '/pengadaan/purchasing', icon: FileText },
  { title: 'Persetujuan Pembelian', description: 'Direktur meninjau dan menyetujui PO.', href: '/pengadaan/persetujuan', icon: ClipboardCheck },
  { title: 'Purchase Order', description: 'Pantau status pesanan hingga diterima Gudang.', href: '/pengadaan/purchase-order', icon: PackageCheck },
];

function PengadaanContent() {
  return <div className="space-y-6"><div><p className="text-sm font-semibold text-emerald-700">Operasional Perusahaan</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Dashboard Pengadaan</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Alur pembelian dimulai dari pemilihan supplier, pembuatan Purchase Order, persetujuan, lalu diteruskan ke Gudang untuk penerimaan material.</p></div>
    <div className="grid gap-4 md:grid-cols-2">{cards.map((card) => { const Icon = card.icon; return <Link key={card.href} href={card.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><div className="flex items-start justify-between"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon className="h-5 w-5" /></div><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:text-emerald-700" /></div><h2 className="mt-4 font-bold text-slate-900">{card.title}</h2><p className="mt-1 text-sm text-slate-500">{card.description}</p></Link>; })}</div>
    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5"><div className="flex items-center gap-2 font-bold text-blue-900"><Truck className="h-5 w-5" /> Alur dokumen ke Gudang</div><div className="mt-3 grid gap-3 text-sm text-blue-900 md:grid-cols-4">{['Purchasing membuat PO', 'Direktur menyetujui PO', 'Purchasing mengirim pesanan', 'Gudang mencatat penerimaan'].map((step, index) => <div key={step} className="rounded-xl border border-blue-100 bg-white/80 p-3"><p className="text-xs font-bold text-blue-500">TAHAP {index + 1}</p><p className="mt-1 font-semibold">{step}</p></div>)}</div><p className="mt-3 text-xs leading-relaxed text-blue-800">Purchase Order memakai tabel yang sama dengan modul Penerimaan Gudang, sehingga penerimaan barang merujuk langsung pada PO yang disetujui/dipesan.</p></div>
  </div>;
}

export default function ProcurementDashboardPage() {
  return <RequireAuth permission="procurement.purchase.create"><PengadaanContent /></RequireAuth>;
}
