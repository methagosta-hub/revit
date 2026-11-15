'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, FileBarChart2, LoaderCircle, RefreshCw, Wallet, ReceiptText } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { fetchCashTransactions, fetchProjectFinanceSummary } from '@/lib/services/financeService';
import type { CashTransaction, ProjectFinanceSummary } from '@/types/finance';

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));

function FinanceDashboardContent() {
  const [rows, setRows] = useState<ProjectFinanceSummary[]>([]);
  const [cash, setCash] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { const [summary, transactions] = await Promise.all([fetchProjectFinanceSummary(), fetchCashTransactions(12)]); setRows(summary); setCash(transactions); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ringkasan keuangan gagal dimuat.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const active = cash.filter((item) => item.status === 'confirmed');
  const cashIn = active.filter((item) => item.direction === 'in').reduce((sum, item) => sum + item.amount, 0);
  const cashOut = active.filter((item) => item.direction === 'out').reduce((sum, item) => sum + item.amount, 0);
  const committed = rows.reduce((sum, row) => sum + row.committed_po, 0);
  const paid = rows.reduce((sum, row) => sum + row.paid_supplier, 0);
  const cards = [
    { label: 'Proyek terdaftar', value: String(rows.length), note: 'Seluruh proyek yang dapat diakses', icon: FileBarChart2 },
    { label: 'Komitmen PO', value: money(committed), note: 'PO yang disetujui dan berjalan', icon: ReceiptText },
    { label: 'Pembayaran supplier', value: money(paid), note: 'Pembayaran aktif yang tercatat', icon: Banknote },
    { label: 'Mutasi kas bersih', value: money(cashIn - cashOut), note: 'Kas masuk dikurangi kas keluar', icon: Wallet },
  ];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Keuangan Perusahaan</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Dashboard Keuangan</h1><p className="mt-1 text-sm text-slate-500">Ringkasan komitmen pembelian, pembayaran supplier, dan arus kas yang tercatat.</p></div><button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Segarkan</button></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Memuat ringkasan keuangan...</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{card.label}</p><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Icon className="h-5 w-5" /></span></div><p className="mt-4 text-xl font-bold text-slate-900">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.note}</p></div>; })}</div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">Arus kas tercatat</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><ArrowDownLeft className="h-4 w-4" /> Kas masuk</div><p className="mt-2 text-lg font-bold text-emerald-900">{money(cashIn)}</p></div><div className="rounded-xl bg-rose-50 p-4"><div className="flex items-center gap-2 text-sm font-medium text-rose-800"><ArrowUpRight className="h-4 w-4" /> Kas keluar</div><p className="mt-2 text-lg font-bold text-rose-900">{money(cashOut)}</p></div></div><p className="mt-3 text-xs leading-5 text-slate-500">Mutasi mencakup pembayaran supplier yang tercatat melalui halaman Pembayaran dan transaksi manual di Kas & Operasional. Ini bukan saldo rekening; saldo awal belum dikonfigurasi.</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Akses cepat</h2><span className="text-xs text-slate-400">Modul Keuangan</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{[{href:'/keuangan/kas',title:'Kas & Operasional',desc:'Catat kas masuk/keluar'},{href:'/keuangan/pembayaran',title:'Pembayaran Supplier',desc:'Bayar PO secara penuh/bertahap'},{href:'/keuangan/rekap',title:'Rekap Keuangan',desc:'Lihat komitmen dan realisasi'}].map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.desc}</p></Link>)}</div></div></div>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-bold text-slate-900">Mutasi kas terbaru</h2><p className="text-xs text-slate-500">12 transaksi terakhir</p></div><Link href="/keuangan/kas" className="text-sm font-semibold text-emerald-700 hover:underline">Lihat semua</Link></div>{cash.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Belum ada transaksi kas.</p> : <div className="divide-y divide-slate-100">{cash.slice(0,8).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><p className="text-sm font-semibold text-slate-800">{item.description}</p><p className="mt-0.5 text-xs text-slate-500">{item.transaction_number} · {item.project_name ?? 'Perusahaan'} · {dateLabel(item.transaction_date)}</p></div><p className={`text-sm font-bold ${item.status === 'void' ? 'text-slate-400 line-through' : item.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.direction === 'in' ? '+' : '-'}{money(item.amount)}</p></div>)}</div>}</section>
    </>}
  </div>;
}
export default function FinanceDashboardPage() { return <RequireAuth permission="finance.read"><FinanceDashboardContent /></RequireAuth>; }
