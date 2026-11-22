'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle, CheckCircle2, ClipboardList, Clock3, LoaderCircle,
  Package, RefreshCw, Search, ShieldCheck, ShoppingCart, XCircle,
} from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';
import {
  fetchFieldMaterialRequestsForReview,
  reviewFieldMaterialRequest,
  type FieldMaterialRequest,
  type FieldMaterialRequestStatus,
} from '@/lib/services/fieldMaterialRequestService';

const moneyDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(value))
  : '—';

const quantity = (value: number | string) => new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 3,
}).format(Number(value) || 0);

function statusLabel(status: FieldMaterialRequestStatus) {
  const labels: Record<FieldMaterialRequestStatus, string> = {
    submitted: 'Menunggu tinjauan',
    under_review: 'Sedang ditinjau',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    converted: 'Sudah ditindaklanjuti',
    cancelled: 'Dibatalkan',
  };
  return labels[status] ?? status;
}

function statusStyle(status: FieldMaterialRequestStatus) {
  if (status === 'submitted') return 'bg-amber-50 text-amber-700 ring-amber-200';
  if (status === 'under_review') return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

function PermintaanContent() {
  const [requests, setRequests] = useState<FieldMaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'submitted' | 'approved' | 'rejected'>('active');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setRequests(await fetchFieldMaterialRequestsForReview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Permintaan material gagal dimuat.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('id');
    return requests.filter((request) => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && ['submitted', 'under_review'].includes(request.status))
        || request.status === statusFilter;
      const searchable = [
        request.request_number,
        request.project_title,
        request.client,
        request.notes ?? '',
        ...request.items.map((item) => item.item_name),
      ].join(' ').toLocaleLowerCase('id');
      return matchesStatus && (!keyword || searchable.includes(keyword));
    });
  }, [requests, search, statusFilter]);

  const activeCount = requests.filter((row) =>
    ['submitted', 'under_review'].includes(row.status),
  ).length;
  const urgentCount = requests.filter((row) =>
    ['submitted', 'under_review'].includes(row.status) && row.priority === 'urgent',
  ).length;
  const approvedCount = requests.filter((row) => row.status === 'approved').length;

  async function handleDecision(
    request: FieldMaterialRequest,
    decision: 'under_review' | 'approved' | 'rejected',
  ) {
    let rejectionReason: string | undefined;
    if (decision === 'rejected') {
      rejectionReason = window.prompt(
        \`Alasan penolakan PR \${request.request_number}:\`,
      )?.trim();
      if (!rejectionReason) return;
    }
    if (decision === 'approved' && !window.confirm(
      \`Setujui PR \${request.request_number} untuk ditindaklanjuti Purchasing? Persetujuan ini tidak membuat PO.\`,
    )) return;

    setProcessingId(request.request_id);
    setError('');
    setSuccess('');
    try {
      await reviewFieldMaterialRequest(
        request.request_id,
        decision,
        rejectionReason,
      );
      const label = decision === 'under_review'
        ? 'ditandai sedang ditinjau'
        : decision === 'approved'
          ? 'disetujui. Purchasing dapat menyiapkan PO secara terpisah'
          : 'ditolak';
      setSuccess(\`PR \${request.request_number} \${label}.\`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status permintaan gagal diperbarui.');
    } finally {
      setProcessingId('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Pengadaan & Purchasing</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Permintaan Barang</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Tinjau kebutuhan material yang diajukan Mandor melalui Dahlia Field.
            PR yang disetujui menjadi dasar tindak lanjut Purchasing, bukan PO otomatis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/pengadaan/purchasing"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <ShoppingCart className="h-4 w-4" /> Proses Purchasing
          </Link>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={\`h-4 w-4 \${refreshing ? 'animate-spin' : ''}\`} /> Muat ulang
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="h-5 w-5 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Perlu ditindaklanjuti" value={activeCount} icon={<Clock3 className="h-5 w-5" />} />
        <SummaryCard label="Prioritas mendesak" value={urgentCount} icon={<AlertCircle className="h-5 w-5" />} />
        <SummaryCard label="PR disetujui" value={approvedCount} icon={<CheckCircle2 className="h-5 w-5" />} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Antrean permintaan lapangan</h2>
              <p className="text-xs text-slate-500">{filtered.length} dari {requests.length} permintaan</p>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari PR, proyek, atau material..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          {([
            ['active', 'Perlu tindakan'],
            ['all', 'Semua'],
            ['submitted', 'Menunggu'],
            ['approved', 'Disetujui'],
            ['rejected', 'Ditolak'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={\`rounded-full px-3 py-1.5 text-xs font-semibold transition \${statusFilter === value
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}\`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />Memuat permintaan...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-2 font-semibold text-slate-800">Tidak ada permintaan pada filter ini</p>
            <p className="mt-1 text-sm text-slate-500">Permintaan baru dari Mandor akan muncul di sini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((request) => {
              const processing = processingId === request.request_id;
              const actionable = ['submitted', 'under_review'].includes(request.status);
              return (
                <article key={request.request_id} className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{request.request_number}</h3>
                        <span className={\`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset \${statusStyle(request.status)}\`}>
                          {statusLabel(request.status)}
                        </span>
                        {request.priority === 'urgent' && (
                          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
                            Mendesak
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{request.project_title}</p>
                      <p className="text-xs text-slate-500">
                        {request.client} · Diajukan {moneyDate(request.created_at)} · Dibutuhkan {moneyDate(request.required_date)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {actionable && request.status === 'submitted' && (
                        <button
                          onClick={() => void handleDecision(request, 'under_review')}
                          disabled={processing}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
                        >
                          {processing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                          Tinjau
                        </button>
                      )}
                      {actionable && (
                        <>
                          <button
                            onClick={() => void handleDecision(request, 'approved')}
                            disabled={processing}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-4 w-4" /> Setujui PR
                          </button>
                          <button
                            onClick={() => void handleDecision(request, 'rejected')}
                            disabled={processing}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" /> Tolak
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[460px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2.5">Nama material</th>
                          <th className="px-3 py-2.5">Jumlah</th>
                          <th className="px-3 py-2.5">Spesifikasi / catatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {request.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2.5 font-medium text-slate-800">{item.item_name}</td>
                            <td className="px-3 py-2.5 text-slate-600 tabular-nums">{quantity(item.quantity)} {item.unit}</td>
                            <td className="px-3 py-2.5 text-slate-500">{item.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {request.notes && <p className="text-sm text-slate-600">Catatan Mandor: {request.notes}</p>}
                  {request.rejection_reason && (
                    <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                      Alasan penolakan: {request.rejection_reason}
                    </p>
                  )}
                  {request.status === 'approved' && (
                    <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                      PR disetujui. Lanjutkan penyusunan PO resmi melalui Proses Purchasing.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        Persetujuan di halaman ini hanya menyetujui permintaan kebutuhan lapangan (PR).
        Nomor PO, supplier, harga final, dan pesanan resmi tetap dibuat melalui alur Proses Purchasing yang sudah ada.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">{icon}</div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export default function PagePermintaan() {
  return (
    <RequireAuth permission="procurement.request.review">
      <PermintaanContent />
    </RequireAuth>
  );
}
