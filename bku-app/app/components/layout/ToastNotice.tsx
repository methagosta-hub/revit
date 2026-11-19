"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export function ToastNotice({
  message,
  tone = "error",
  onClose,
}: {
  message: string;
  tone?: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 6500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  };
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;

  return (
    <div role="status" className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${styles[tone]}`}>
      <Icon className="mt-0.5 shrink-0" size={18} />
      <p className="min-w-0 flex-1 leading-6">{message}</p>
      <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Tutup pemberitahuan"><X size={16} /></button>
    </div>
  );
}
