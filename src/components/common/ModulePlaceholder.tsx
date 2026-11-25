type ModulePlaceholderProps = {
  title: string;
  description: string;
  section?: string;
};

export default function ModulePlaceholder({
  title,
  description,
  section = 'Modul perusahaan',
}: ModulePlaceholderProps) {
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            {section}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold text-slate-500">
            JW
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-800">
            Kerangka halaman tersedia
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Halaman ini sudah disiapkan sebagai bagian dari JAVAWASTHU MANAGEMENT.
            Formulir, akses pengguna, proses persetujuan, dan koneksi database akan
            diimplementasikan pada tahap pengembangan modul ini.
          </p>
        </section>
      </div>
    </main>
  );
}
