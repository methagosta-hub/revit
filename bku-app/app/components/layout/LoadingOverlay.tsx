import { RefreshCw } from "lucide-react";

export function LoadingOverlay({ label = "Memuat pembukuan…" }: { label?: string }) {
  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xl">
      <RefreshCw className="animate-spin" size={14} />{label}
    </div>
  );
}
