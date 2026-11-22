'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileBarChart2,
  LoaderCircle,
  PackagePlus,
  RefreshCw,
  ReceiptText,
  Wallet,
  X,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import { supabase } from '@/lib/supabase';
import { fetchCashTransactions, fetchProjectFinanceSummary } from '@/lib/services/financeService';
import type { CashTransaction, ProjectFinanceSummary } from '@/types/finance';

type FinanceObligation = {
  id: string;
  obligation_number: string;
  source_type: 'payroll_item' | 'subcontract_request' | 'subcontract_retention' | string;
  payee_type: 'employee' | 'subcontractor' | string;
  project_id: string | null;
  obligation_date: string;
  due_date: string | null;
  description: string;
  amount: number;
  paid_amount: number;
  status: 'open' | 'partially_paid' | 'paid' | 'void' | string;
  employee?: { employee_number?: string | null; full_name?: string | null } | null;
  subcontractor?: { legal_name?: string | null } | null;
  project?: { title?: string | null } | null;
};

type PaymentMethod = 'cash' | 'bank_transfer' | 'other';
type ObligationPriority = 'overdue' | 'today' | 'upcoming' | 'unscheduled';

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));

function jakartaDateIso(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dateLabel(value?: string | null): string {
  if (!value) return 'Belum dijadwalkan';
  const date = new Date(`${value.slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function dateTimeLabel(value: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function sourceLabel(source: FinanceObligation['source_type']): string {
  if (source === 'payroll_item') return 'Payroll karyawan';
  if (source === 'subcontract_retention') return 'Pelepasan retensi';
  return 'Tagihan subkontraktor';
}

function recipientLabel(item: FinanceObligation): string {
  if (item.payee_type === 'employee') {
    return item.employee?.full_name || item.employee?.employee_number || 'Karyawan';
  }
  return item.subcontractor?.legal_name || 'Subkontraktor';
}

function priorityOf(item: FinanceObligation, today: string): ObligationPriority {
  if (!item.due_date) return 'unscheduled';
  const due = item.due_date.slice(0, 10);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

function priorityLabel(priority: ObligationPriority, dueDate: string | null): string {
  if (priority === 'overdue') return `Terlambat · ${dateLabel(dueDate)}`;
  if (priority === 'today') return 'Jatuh tempo hari ini';
  if (priority === 'upcoming') return `Jatuh tempo ${dateLabel(dueDate)}`;
  return 'Belum ada tanggal jatuh tempo';
}

function FinanceDashboardContent() {
  const [rows, setRows] = useState<ProjectFinanceSummary[]>([]);
  const [cash, setCash] = useState<CashTransaction[]>([]);
  const [obligations, setObligations] = useState<FinanceObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [obligationError, setObligationError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [notice, setNotice] = useState('');

  const [paying, setPaying] = useState<FinanceObligation | null>(null);
  const [paymentDate, setPaymentDate] = useState(jakartaDateIso());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    setObligationError('');

    try {
      const [summary, transactions] = await Promise.all([
        fetchProjectFinanceSummary(),
        fetchCashTransactions(12),
      ]);
      setRows(summary);
      setCash(transactions);

      // Separate query: if the obligation register is unavailable, the cash dashboard
      // still remains usable and shows a specific warning instead of losing all data.
      const { data: obligationRows, error: obligationQueryError } = await supabase
        .from('payment_obligations')
        .select(`
          id, obligation_number, source_type, payee_type, project_id,
          obligation_date, due_date, description, amount, paid_amount, status,
          employee:employees(employee_number, full_name),
          subcontractor:subcontractors(legal_name),
          project:projects(title)
        `)
        .in('status', ['open', 'partially_paid'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(100);

      if (obligationQueryError) {
        setObligations([]);
        setObligationError(
          obligationQueryError.message ||
            'Register kewajiban pembayaran belum dapat dibaca. Periksa akses Finance dan Migration 015.',
        );
      } else {
        setObligations((obligationRows ?? []) as unknown as FinanceObligation[]);
      }
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ringkasan keuangan gagal dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = jakartaDateIso();
  const nextWeek = addDaysIso(today, 7);
  const openItems = useMemo(() => obligations
    .map((item) => ({
      ...item,
      outstanding: Math.max(Number(item.amount || 0) - Number(item.paid_amount || 0), 0),
      priority: priorityOf(item, today),
    }))
    .filter((item) => item.outstanding > 0)
    .sort((a, b) => {
      const order: Record<ObligationPriority, number> = {
        overdue: 0,
        today: 1,
        upcoming: 2,
        unscheduled: 3,
      };
      const priorityDifference = order[a.priority] - order[b.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');
    }), [obligations, today]);

  const overdueItems = openItems.filter((item) => item.priority === 'overdue');
  const dueTodayItems = openItems.filter((item) => item.priority === 'today');
  const dueSoonItems = openItems.filter((item) =>
    item.due_date && item.due_date.slice(0, 10) > today && item.due_date.slice(0, 10) <= nextWeek,
  );
  const outstandingTotal = openItems.reduce((sum, item) => sum + item.outstanding, 0);
  const overdueTotal = overdueItems.reduce((sum, item) => sum + item.outstanding, 0);

  const confirmedCash = cash.filter((item) => item.status === 'confirmed');
  const cashIn = confirmedCash
    .filter((item) => item.direction === 'in')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashOut = confirmedCash
    .filter((item) => item.direction === 'out')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const committed = rows.reduce((sum, row) => sum + Number(row.committed_po || 0), 0);
  const paidSupplier = rows.reduce((sum, row) => sum + Number(row.paid_supplier || 0), 0);
  const remainingPo = rows.reduce((sum, row) => sum + Number(row.remaining_po || 0), 0);

  const summaryCards = [
    {
      label: 'Proyek dalam cakupan',
      value: String(rows.length),
      note: 'Proyek yang dapat diakses akun ini',
      icon: FileBarChart2,
      tone: 'slate',
    },
    {
      label: 'Komitmen purchase order',
      value: money(committed),
      note: 'PO yang disetujui dan berjalan',
      icon: ReceiptText,
      tone: 'blue',
    },
    {
      label: 'Pembayaran supplier',
      value: money(paidSupplier),
      note: 'Realisasi pembayaran yang tercatat',
      icon: Banknote,
      tone: 'emerald',
    },
    {
      label: 'Sisa komitmen PO',
      value: money(remainingPo),
      note: 'Komitmen yang belum terealisasi',
      icon: Wallet,
      tone: 'amber',
    },
  ] as const;

  function beginPayment(item: FinanceObligation & { outstanding?: number }) {
    const remaining = item.outstanding ?? Math.max(Number(item.amount) - Number(item.paid_amount), 0);
    setPaying(item);
    setPaymentDate(jakartaDateIso());
    setPaymentMethod('bank_transfer');
    setPaymentAmount(String(remaining));
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentError('');
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying || savingPayment) return;
    const amount = Number(paymentAmount);
    const outstanding = Math.max(Number(paying.amount) - Number(paying.paid_amount), 0);
    if (!paymentDate) return setPaymentError('Tanggal pembayaran wajib diisi.');
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding + 0.000001) {
      return setPaymentError(`Jumlah pembayaran harus lebih besar dari nol dan tidak melebihi sisa kewajiban ${money(outstanding)}.`);
    }

    setSavingPayment(true);
    setPaymentError('');
    try {
      const { error: rpcError } = await supabase.rpc('dahlia_record_payment_transaction', {
        p_payment_date: paymentDate,
        p_payment_method: paymentMethod,
        p_reference_number: paymentReference.trim() || null,
        p_notes: paymentNotes.trim() || null,
        p_allocations: [{ obligation_id: paying.id, amount }],
      });
      if (rpcError) throw rpcError;
      const paymentNumber = paying.obligation_number;
      setPaying(null);
      setNotice(`Pembayaran untuk ${paymentNumber} berhasil dicatat. Transaksi kas keluar dibuat oleh sistem.`);
      await load(true);
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String(err.message)
            : 'Pembayaran gagal dicatat. Periksa kewenangan dan data transaksi.',
      );
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-800 px-5 py-7 text-white shadow-lg sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100">
              <Wallet className="h-3.5 w-3.5" /> Dahlia Management System · Finance
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Pusat Kendali Keuangan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85 sm:text-base">
              Pantau komitmen proyek, kewajiban pembayaran, dan arus kas. Kerjakan yang paling mendesak terlebih dahulu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/keuangan/pembelian-langsung"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-extrabold text-emerald-950 shadow-sm transition hover:bg-emerald-200"
            >
              <PackagePlus className="h-4 w-4" />
              Pembelian material langsung
            </Link>
            <div className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100/70">Terakhir diperbarui</p>
              <p className="mt-1 text-xs font-semibold text-white">{lastUpdated ? dateTimeLabel(lastUpdated) : 'Belum dimuat'}</p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-950 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Memperbarui...' : 'Segarkan data'}
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>
          <button type="button" aria-label="Tutup pemberitahuan" onClick={() => setNotice('')} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" /> Memuat ringkasan keuangan...
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan keuangan">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              const iconTone = card.tone === 'emerald'
                ? 'bg-emerald-50 text-emerald-700'
                : card.tone === 'blue'
                  ? 'bg-sky-50 text-sky-700'
                  : card.tone === 'amber'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-700';
              return (
                <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
                    <span className={`rounded-xl p-2.5 ${iconTone}`}><Icon className="h-5 w-5" /></span>
                  </div>
                  <p className="mt-4 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{card.value}</p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{card.note}</p>
                </article>
              );
            })}
          </section>

          <section id="pemberitahuan" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-emerald-800">
                  <BellRing className="h-4 w-4" />
                  <p className="text-xs font-bold uppercase tracking-wider">Pusat pemberitahuan</p>
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Perlu ditindaklanjuti</h2>
                <p className="mt-1 text-sm text-slate-500">Kewajiban yang sudah disetujui dan masih memiliki sisa pembayaran.</p>
              </div>
              {openItems.length > 0 && (
                <div className="rounded-xl bg-amber-50 px-4 py-3 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Total kewajiban belum lunas</p>
                  <p className="mt-1 text-lg font-bold text-amber-950">{money(outstandingTotal)}</p>
                </div>
              )}
            </div>

            {obligationError ? (
              <div className="m-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:m-6">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div><p className="font-semibold">Daftar kewajiban belum tersedia</p><p className="mt-1 text-xs leading-5">{obligationError}</p></div>
              </div>
            ) : (
              <>
                <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-3 sm:px-6">
                  <div className={`rounded-xl p-4 ${overdueItems.length ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <div className={`flex items-center gap-2 text-xs font-semibold ${overdueItems.length ? 'text-rose-800' : 'text-slate-500'}`}><Clock3 className="h-4 w-4" /> Terlambat</div>
                    <p className={`mt-2 text-2xl font-bold ${overdueItems.length ? 'text-rose-950' : 'text-slate-900'}`}>{overdueItems.length}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{money(overdueTotal)} perlu perhatian</p>
                  </div>
                  <div className={`rounded-xl p-4 ${dueTodayItems.length ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <div className={`flex items-center gap-2 text-xs font-semibold ${dueTodayItems.length ? 'text-amber-800' : 'text-slate-500'}`}><CalendarClock className="h-4 w-4" /> Jatuh tempo hari ini</div>
                    <p className={`mt-2 text-2xl font-bold ${dueTodayItems.length ? 'text-amber-950' : 'text-slate-900'}`}>{dueTodayItems.length}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{money(dueTodayItems.reduce((sum, item) => sum + item.outstanding, 0))}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Clock3 className="h-4 w-4" /> 7 hari ke depan</div>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{dueSoonItems.length}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Kewajiban segera jatuh tempo</p>
                  </div>
                </div>

                {openItems.length === 0 ? (
                  <div className="px-5 py-12 text-center sm:px-6">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span>
                    <h3 className="mt-3 font-bold text-slate-900">Tidak ada pembayaran yang menunggu</h3>
                    <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">Semua kewajiban yang tersedia sudah lunas, atau belum ada kewajiban baru yang disetujui.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {openItems.slice(0, 8).map((item) => {
                      const priorityTone = item.priority === 'overdue'
                        ? 'bg-rose-50 text-rose-800'
                        : item.priority === 'today'
                          ? 'bg-amber-50 text-amber-800'
                          : item.priority === 'upcoming'
                            ? 'bg-sky-50 text-sky-800'
                            : 'bg-slate-100 text-slate-600';
                      return (
                        <article key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-emerald-800">{item.obligation_number}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${priorityTone}`}>{priorityLabel(item.priority, item.due_date)}</span>
                            </div>
                            <p className="mt-1.5 truncate text-sm font-semibold text-slate-900">{item.description}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {recipientLabel(item)} · {item.project?.title || 'Perusahaan / overhead'} · {sourceLabel(item.source_type)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                            <div className="sm:text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sisa kewajiban</p>
                              <p className="text-base font-bold tabular-nums text-slate-950">{money(item.outstanding)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => beginPayment(item)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800"
                            >
                              Catat pembayaran <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {openItems.length > 8 && (
                      <p className="bg-slate-50 px-5 py-3 text-center text-xs text-slate-500 sm:px-6">
                        Menampilkan 8 dari {openItems.length} kewajiban. Gunakan pencarian atau filter pada register untuk melihat sisanya.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Arus kas</p><h2 className="mt-1 text-lg font-bold text-slate-950">12 transaksi terakhir</h2></div>
                <Link href="/keuangan/kas" className="text-xs font-bold text-emerald-800 hover:underline">Buka buku kas <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800"><ArrowDownLeft className="h-4 w-4" /> Kas masuk</div>
                  <p className="mt-2 text-xl font-bold text-emerald-950">{money(cashIn)}</p>
                </div>
                <div className="rounded-2xl bg-rose-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-rose-800"><ArrowUpRight className="h-4 w-4" /> Kas keluar</div>
                  <p className="mt-2 text-xl font-bold text-rose-950">{money(cashOut)}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="text-slate-500">Selisih dari 12 transaksi yang ditampilkan</span>
                <strong className="text-slate-900">{money(cashIn - cashOut)}</strong>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">Angka ini bukan saldo rekening maupun total kas sepanjang waktu. Saldo awal dan seluruh histori kas dilihat dari halaman Kas & Operasional.</p>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Alur kerja</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">Langkah kerja staf keuangan</h2>
              <div className="mt-4 space-y-3">
                <WorkflowStep number="01" title="Periksa komitmen dan kewajiban" description="Cek PO, nominal tersisa, dan tanggal jatuh tempo sebelum menjadwalkan pembayaran." href="/keuangan/rekap" linkLabel="Buka rekap" />
                <WorkflowStep number="02" title="Catat pembayaran aktual" description="Pilih kewajiban, masukkan tanggal, metode, nominal, dan referensi bukti pembayaran." href="#pemberitahuan" linkLabel="Lihat tugas di atas" />
                <WorkflowStep number="03" title="Pastikan kas dan rekap sesuai" description="Setelah pembayaran tercatat, periksa mutasi kas dan ringkasan realisasi proyek." href="/keuangan/kas" linkLabel="Buka kas & operasional" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <QuickLink href="/keuangan/pembayaran" title="Pembayaran Supplier" description="Pembayaran PO penuh atau bertahap" />
                <QuickLink href="/keuangan/pembelian-langsung" title="Pembelian Material Langsung" description="Belanja material tanpa menunggu PO" />
                <QuickLink href="/keuangan/rekap" title="Rekap Keuangan" description="Komitmen dan realisasi per proyek" />
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div><h2 className="font-bold text-slate-950">Aktivitas kas terbaru</h2><p className="mt-1 text-xs text-slate-500">Maksimal 8 dari 12 transaksi terakhir</p></div>
              <Link href="/keuangan/kas" className="text-xs font-bold text-emerald-800 hover:underline">Lihat semua</Link>
            </div>
            {cash.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Belum ada transaksi kas.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cash.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.transaction_number} · {item.project_name ?? 'Perusahaan'} · {dateLabel(item.transaction_date)}</p>
                    </div>
                    <p className={`shrink-0 text-sm font-bold tabular-nums ${item.status === 'void' ? 'text-slate-400 line-through' : item.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {item.direction === 'in' ? '+' : '-'}{money(item.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {paying && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="finance-payment-title" className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Pembayaran aktual</p>
                <h2 id="finance-payment-title" className="mt-1 text-lg font-bold text-slate-950">Catat pembayaran {paying.obligation_number}</h2>
                <p className="mt-1 text-xs text-slate-500">Sisa kewajiban {money(Number(paying.amount) - Number(paying.paid_amount))}</p>
              </div>
              <button type="button" onClick={() => setPaying(null)} disabled={savingPayment} aria-label="Tutup formulir" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </header>
            <form onSubmit={submitPayment} className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">Tanggal pembayaran
                  <input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500" />
                </label>
                <label className="block text-xs font-semibold text-slate-600">Metode pembayaran
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500">
                    <option value="bank_transfer">Transfer bank</option>
                    <option value="cash">Tunai</option>
                    <option value="other">Lainnya</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600">Nominal dibayar
                <input required type="number" min="1" max={Math.max(Number(paying.amount) - Number(paying.paid_amount), 0)} step="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">Nomor referensi / bukti
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} placeholder="Nomor bukti transfer atau kuitansi" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500" />
              </label>
              <label className="block text-xs font-semibold text-slate-600">Catatan
                <textarea rows={2} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500" />
              </label>
              {paymentError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">{paymentError}</p>}
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPaying(null)} disabled={savingPayment} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">Batal</button>
                <button type="submit" disabled={savingPayment || Number(paymentAmount) <= 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {savingPayment ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {savingPayment ? 'Mencatat pembayaran...' : 'Konfirmasi pembayaran'}
                </button>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">Pembayaran akan dicatat melalui fungsi database. Sistem membuat satu transaksi pembayaran dan satu transaksi kas keluar, lalu memperbarui sisa kewajiban secara otomatis.</p>
            </form>
          </section>
        </div>
      )}

      <footer className="flex flex-col gap-1 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-400 sm:flex-row sm:justify-between">
        <span>Dashboard menampilkan proyek sesuai cakupan akses akun.</span>
        <span>Data diperbarui saat halaman dibuka atau saat staf menekan Segarkan data.</span>
      </footer>
    </main>
  );
}

function WorkflowStep({ number, title, description, href, linkLabel }: {
  number: string;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 p-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-extrabold text-emerald-800">{number}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        <Link href={href} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline">{linkLabel}<ArrowRight className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/50">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-900">{title}</p><ArrowRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-emerald-700" /></div>
      <p className="mt-1 text-[11px] text-slate-500">{description}</p>
    </Link>
  );
}

export default function FinanceDashboardPage() {
  return <RequireAuth permission="finance.read"><FinanceDashboardContent /></RequireAuth>;
}
