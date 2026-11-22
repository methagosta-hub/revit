"use client";

import type { ReactNode, MouseEvent } from "react";
import { X } from "lucide-react";

export function AppModal({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={handleBackdrop}
    >
      <section className={`flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? "max-w-7xl" : "max-w-2xl"}`}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Tutup dialog">
            <X size={19} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="shrink-0 border-t border-slate-100 px-5 py-4 sm:px-6">{footer}</footer>}
      </section>
    </div>
  );
}
