import { ReactNode } from 'react';

export default function ProjectLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Anda bisa menambahkan sub-header khusus proyek atau breadcrumb di sini jika diperlukan */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}