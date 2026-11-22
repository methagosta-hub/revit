'use client';

import { BusinessDocumentPdfButton } from '@/components/documents/BusinessDocumentPdfButton';
import type {
  ExecutionSegmentForPayment, PaymentTransaction, PayrollItem, PayrollLine, PayrollProjectOption,
  PayrollRun, SubcontractContractOption, SubcontractPaymentRequest, SubcontractPaymentTerm,
} from '@/types/payroll';

const money = (value: number | null | undefined) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value ?? 0));
const dateLabel = (value?: string | null) => value
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T00:00:00`))
  : '—';
const RUN_STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Diajukan', approved: 'Disetujui', partially_paid: 'Dibayar sebagian', paid: 'Lunas', cancelled: 'Dibatalkan' };

export function PayrollPdfExports({ run, items, lines }: { run: PayrollRun; items: PayrollItem[]; lines: PayrollLine[] }) {
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
    <div className="mb-3"><h2 className="font-bold text-slate-900">Dokumen payroll dan slip gaji</h2><p className="text-xs text-slate-600">Ekspor membaca payroll yang dipilih dan tidak mencatat pembayaran.</p></div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3">
      <div><p className="font-bold text-emerald-800">Register {run.run_number}</p><p className="text-xs text-slate-600">{run.period?.period_code ?? 'Periode'} · {RUN_STATUS[run.status]}</p></div>
      <BusinessDocumentPdfButton identity={{ type: 'payroll_register', code: run.run_number, title: 'Daftar Penggajian', sourceStatus: run.status, generatedAt: new Date().toISOString(), period: run.period?.period_code ?? null, classification: 'Dokumen personalia terbatas' }} sections={[
        { title: 'Ringkasan payroll', details: [
          { label: 'Nomor payroll', value: run.run_number }, { label: 'Periode', value: run.period?.period_code ?? '—' },
          { label: 'Mulai periode', value: dateLabel(run.period?.period_start) }, { label: 'Akhir periode', value: dateLabel(run.period?.period_end) },
          { label: 'Jumlah pekerja', value: run.total_employees }, { label: 'Status', value: RUN_STATUS[run.status] },
          { label: 'Bruto', value: money(run.total_gross) }, { label: 'Potongan', value: money(run.total_deductions) }, { label: 'Bersih', value: money(run.total_net) },
        ] },
        { title: 'Daftar penerima', columns: ['No. item', 'Pekerja', 'Dasar', 'Bruto', 'Potongan', 'Bersih'], rows: items.map((item) => [item.item_number, item.employee?.full_name ?? item.employee?.employee_number ?? 'Karyawan', item.pay_basis, money(item.earning_total + item.base_amount), money(item.deduction_total), money(item.net_amount)]) },
      ]} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">{items.map((item) => <article key={`pdf-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3 shadow-sm">
      <div><p className="font-bold text-emerald-800">{item.item_number}</p><p className="text-xs text-slate-600">{item.employee?.full_name ?? 'Karyawan'} · {money(item.net_amount)}</p></div>
      <BusinessDocumentPdfButton identity={{ type: 'payslip', code: item.item_number, title: 'Slip Gaji Pekerja', sourceStatus: run.status, generatedAt: new Date().toISOString(), period: run.period?.period_code ?? null, classification: 'Rahasia · dokumen personalia' }} sections={[
        { title: 'Identitas slip', details: [
          { label: 'Nomor slip', value: item.item_number }, { label: 'Nomor payroll', value: run.run_number },
          { label: 'Pekerja', value: item.employee?.full_name ?? '—' }, { label: 'Nomor pekerja', value: item.employee?.employee_number ?? '—' },
          { label: 'Periode', value: run.period?.period_code ?? '—' }, { label: 'Dasar upah', value: item.pay_basis },
          { label: 'Unit kerja', value: `${item.work_units} ${item.unit_label}` }, { label: 'Status payroll', value: RUN_STATUS[run.status] },
          { label: 'Upah dasar', value: money(item.base_amount) }, { label: 'Penghasilan', value: money(item.earning_total) },
          { label: 'Potongan', value: money(item.deduction_total) }, { label: 'Upah bersih', value: money(item.net_amount) },
        ] },
        { title: 'Rincian komponen', columns: ['Jenis', 'Komponen', 'Kuantitas', 'Tarif', 'Nilai', 'Catatan'], rows: lines.filter((line) => line.payroll_item_id === item.id).map((line) => [line.line_kind === 'earning' ? 'Penghasilan' : 'Potongan', line.line_label, line.quantity, line.rate == null ? '—' : money(line.rate), money(line.amount), line.notes ?? '—']) },
      ]} />
    </article>)}</div>
  </section>;
}

export function SubcontractPdfExports({ contracts, segments, requests, terms }: {
  contracts: SubcontractContractOption[];
  segments: ExecutionSegmentForPayment[];
  requests: SubcontractPaymentRequest[];
  terms: SubcontractPaymentTerm[];
}) {
  return <>
    {contracts.length > 0 && <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 xl:col-span-2"><h2 className="font-bold text-slate-900">Cetak kontrak subkontraktor</h2><div className="mt-3 grid gap-3 lg:grid-cols-2">{contracts.map((contract) => {
      const segment = segments.find((row) => row.id === contract.segment_id);
      return <article key={`pdf-${contract.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3"><div><p className="font-bold text-emerald-800">{contract.contract_number}</p><p className="text-xs text-slate-600">{segment?.subcontractor?.legal_name ?? 'Subkontraktor'} · {contract.contract_title}</p></div><BusinessDocumentPdfButton identity={{ type: 'subcontract_contract', code: contract.contract_number, title: 'Register Kontrak Subkontraktor', sourceStatus: contract.contract_status, generatedAt: new Date().toISOString(), projectName: segment?.package?.project?.title ?? null, period: `${dateLabel(contract.contract_start_date)} s.d. ${dateLabel(contract.contract_end_date)}`, classification: 'Dokumen kontrak terbatas' }} sections={[
        { title: 'Identitas kontrak', details: [
          { label: 'Nomor kontrak', value: contract.contract_number }, { label: 'Judul', value: contract.contract_title },
          { label: 'Subkontraktor', value: segment?.subcontractor?.legal_name ?? contract.subcontractor_id }, { label: 'Proyek', value: segment?.package?.project?.title ?? '—' },
          { label: 'Paket pekerjaan', value: segment?.package?.package_name ?? '—' }, { label: 'Nomor segmen', value: segment?.segment_number ?? '—' },
          { label: 'Referensi kontrak', value: contract.contract_reference ?? '—' }, { label: 'Tanggal tanda tangan', value: dateLabel(contract.signed_date) },
          { label: 'Mulai kontrak', value: dateLabel(contract.contract_start_date) }, { label: 'Akhir kontrak', value: dateLabel(contract.contract_end_date) },
          { label: 'Nilai kontrak', value: money(contract.contract_value_snapshot) }, { label: 'Status', value: contract.contract_status },
        ] },
      ]} /></article>;
    })}</div></section>}
    {requests.length > 0 && <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 xl:col-span-2"><h2 className="font-bold text-slate-900">Cetak tagihan subkontraktor</h2><p className="text-xs text-slate-600">Cetakan tagihan belum menjadi persetujuan pembayaran.</p><div className="mt-3 grid gap-3 lg:grid-cols-2">{requests.map((request) => {
      const segment = segments.find((row) => row.id === request.segment_id);
      const term = terms.find((row) => row.id === request.term_id);
      const contract = contracts.find((row) => row.id === request.contract_register_id);
      return <article key={`pdf-${request.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3"><div><p className="font-bold text-emerald-800">{request.request_number}</p><p className="text-xs text-slate-600">{segment?.subcontractor?.legal_name ?? 'Subkontraktor'} · {money(request.net_amount)}</p></div><BusinessDocumentPdfButton identity={{ type: 'subcontract_claim', code: request.request_number, title: 'Tagihan Subkontraktor', sourceStatus: request.status, generatedAt: new Date().toISOString(), projectName: segment?.package?.project?.title ?? null, period: dateLabel(request.request_date), classification: 'Dokumen keuangan terbatas' }} sections={[
        { title: 'Identitas tagihan', details: [
          { label: 'Nomor tagihan', value: request.request_number }, { label: 'Kontrak', value: contract?.contract_number ?? '—' },
          { label: 'Subkontraktor', value: segment?.subcontractor?.legal_name ?? '—' }, { label: 'Proyek', value: segment?.package?.project?.title ?? '—' },
          { label: 'Paket / segmen', value: `${segment?.package?.package_name ?? '—'} / ${segment?.segment_number ?? '—'}` },
          { label: 'Dasar termin', value: term?.term_name ?? (segment?.execution_method === 'subcontract_unit' ? 'Progres harga satuan' : '—') },
          { label: 'Tanggal pengajuan', value: dateLabel(request.request_date) }, { label: 'Status', value: request.status },
        ] },
        { title: 'Ringkasan nilai', details: [
          { label: 'Bruto', value: money(request.gross_amount) }, { label: 'Retensi', value: money(request.retention_amount) },
          { label: 'Potongan', value: money(request.deduction_amount) }, { label: 'Bersih diajukan', value: money(request.net_amount) },
        ], paragraphs: [request.notes?.trim() || 'Tidak ada catatan tambahan pada tagihan sumber.', request.rejection_reason ? `Catatan penolakan: ${request.rejection_reason}` : ''] },
      ]} /></article>;
    })}</div></section>}
  </>;
}

export function PayrollPaymentPdfExports({ payments, projects }: { payments: PaymentTransaction[]; projects: PayrollProjectOption[] }) {
  if (payments.length === 0) return null;
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><h2 className="font-bold text-slate-900">Bukti transaksi pembayaran</h2><div className="mt-3 grid gap-3 lg:grid-cols-2">{payments.map((payment) => {
    const project = projects.find((row) => row.id === payment.project_id);
    return <article key={`pdf-${payment.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-3"><div><p className="font-bold text-emerald-800">{payment.payment_number}</p><p className="text-xs text-slate-600">{dateLabel(payment.payment_date)} · {money(payment.amount)}</p></div><BusinessDocumentPdfButton identity={{ type: 'payment_voucher', code: payment.payment_number, title: 'Bukti Pembayaran', sourceStatus: payment.status, generatedAt: new Date().toISOString(), projectName: project?.title ?? null, period: dateLabel(payment.payment_date), classification: 'Dokumen keuangan terbatas' }} sections={[
      { title: 'Identitas pembayaran', details: [
        { label: 'Nomor pembayaran', value: payment.payment_number }, { label: 'Tanggal', value: dateLabel(payment.payment_date) },
        { label: 'Proyek', value: project?.title ?? 'Umum / tidak ditentukan' }, { label: 'Jumlah', value: money(payment.amount) },
        { label: 'Metode', value: payment.payment_method }, { label: 'Referensi', value: payment.reference_number ?? '—' }, { label: 'Status', value: payment.status },
      ] },
      { title: 'Catatan transaksi', paragraphs: [payment.notes?.trim() || 'Tidak ada catatan tambahan pada transaksi sumber.'] },
    ]} /></article>;
  })}</div></section>;
}
